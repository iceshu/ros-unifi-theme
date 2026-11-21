import { createMemo, createSignal, For, Show } from "solid-js";
import { api, toApiError } from "../lib/api";
import { can } from "../lib/session";
import { showToast } from "../lib/toast";
import { useLoad } from "../lib/useRos";
import { ConfirmDialog, Field, FormPanel, RowMenu, SelectInput, TextInput } from "../components/form";
import { Card, EmptyState, PageHeader, Pill } from "../components/ui";

// ── Diff algorithm (LCS-based) ────────────────────────────────────────────────

type DiffEdit =
  | { type: "equal" | "add" | "remove"; line: string }
  | { type: "ctx"; count: number };

function computeDiff(aLines: string[], bLines: string[]): DiffEdit[] {
  const m = aLines.length, n = bLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const edits: DiffEdit[] = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && aLines[i] === bLines[j]) {
      edits.push({ type: "equal", line: aLines[i++] });
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] > dp[i + 1][j])) {
      edits.push({ type: "add", line: bLines[j++] });
    } else {
      edits.push({ type: "remove", line: aLines[i++] });
    }
  }
  return edits;
}

function collapseCtx(edits: DiffEdit[], ctx = 3): DiffEdit[] {
  const result: DiffEdit[] = [];
  let i = 0;
  while (i < edits.length) {
    if (edits[i].type !== "equal") { result.push(edits[i++]); continue; }
    const start = i;
    while (i < edits.length && edits[i].type === "equal") i++;
    const run = edits.slice(start, i);
    if (run.length <= ctx * 2 + 1) {
      result.push(...run);
    } else {
      result.push(...run.slice(0, ctx));
      result.push({ type: "ctx", count: run.length - ctx * 2 });
      result.push(...run.slice(run.length - ctx));
    }
  }
  return result;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackupMeta {
  id: number;
  t: number;
  hash: string;
  size: number;
  trigger: string;
  user: string;
}

interface BackupSettings {
  schedule: "off" | "daily" | "weekly";
  hour: number;
  retention: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const SCHEDULE_OPTIONS = [
  { value: "off" as const, label: "关闭" },
  { value: "daily" as const, label: "每天" },
  { value: "weekly" as const, label: "每周一" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${String(h).padStart(2, "0")}:00`,
}));

// ── Component ─────────────────────────────────────────────────────────────────

export function BackupsPage() {
  const backupsData = useLoad<BackupMeta[]>(
    () => "/api/backups",
    30_000,
    (raw) => (Array.isArray(raw) ? (raw as BackupMeta[]) : []),
  );
  const settingsData = useLoad<BackupSettings>(
    () => "/api/backups/settings",
    0,
    (raw) => {
      const r = raw as Record<string, unknown>;
      return {
        schedule: (r.schedule as "off" | "daily" | "weekly") ?? "daily",
        hour: Number(r.hour ?? 3),
        retention: Number(r.retention ?? 30),
      };
    },
  );

  const backups = () => backupsData.data() ?? [];

  const [runBusy, setRunBusy] = createSignal(false);
  const [runConfirm, setRunConfirm] = createSignal(false);
  const [deleteId, setDeleteId] = createSignal<number | null>(null);
  const [viewId, setViewId] = createSignal<number | null>(null);
  const [viewText, setViewText] = createSignal("");
  const [viewLoading, setViewLoading] = createSignal(false);
  const [compareIds, setCompareIds] = createSignal<number[]>([]);
  const [diffResult, setDiffResult] = createSignal<DiffEdit[] | null>(null);
  const [diffLoading, setDiffLoading] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);

  // Settings form state
  const [sSchedule, setSSchedule] = createSignal<"off" | "daily" | "weekly">("daily");
  const [sHour, setSHour] = createSignal("3");
  const [sRetention, setSRetention] = createSignal("30");

  const openSettings = () => {
    const s = settingsData.data();
    if (s) {
      setSSchedule(s.schedule);
      setSHour(String(s.hour));
      setSRetention(String(s.retention));
    }
    setShowSettings(true);
  };

  const handleRun = async () => {
    setRunBusy(true);
    try {
      const result = (await api.post("/api/backups/run")) as { changed: boolean };
      showToast(result.changed ? "备份已创建" : "无变化，内容未更改", result.changed ? "ok" : "info");
      backupsData.reload();
    } catch (e) {
      showToast(toApiError(e).message, "err");
    } finally {
      setRunBusy(false);
      setRunConfirm(false);
    }
  };

  const handleDelete = async () => {
    const id = deleteId();
    if (!id) return false;
    try {
      await api.post("/api/backups/delete", { id });
      showToast("备份已删除", "ok");
      backupsData.reload();
      if (viewId() === id) setViewId(null);
      setCompareIds((ids) => ids.filter((x) => x !== id));
      return true;
    } catch (e) {
      showToast(toApiError(e).message, "err");
      return false;
    }
  };

  const handleView = async (id: number) => {
    setViewId(id);
    setViewText("");
    setViewLoading(true);
    try {
      const row = (await api.get(`/api/backups/item?id=${id}`)) as { text: string };
      setViewText(row.text ?? "");
    } catch (e) {
      showToast(toApiError(e).message, "err");
    } finally {
      setViewLoading(false);
    }
  };

  const toggleCompare = (id: number) => {
    setCompareIds((ids) => {
      if (ids.includes(id)) return ids.filter((x) => x !== id);
      if (ids.length >= 2) return [ids[1], id];
      return [...ids, id];
    });
    setDiffResult(null);
  };

  const handleCompare = async () => {
    // Older version (smaller id) on the left, so "+" lines are what changed since.
    const ids = [...compareIds()].sort((a, b) => a - b);
    if (ids.length !== 2) return;
    setDiffLoading(true);
    try {
      const [aRow, bRow] = await Promise.all([
        api.get(`/api/backups/item?id=${ids[0]}`) as Promise<{ text: string }>,
        api.get(`/api/backups/item?id=${ids[1]}`) as Promise<{ text: string }>,
      ]);
      const aLines = (aRow.text ?? "").split("\n");
      const bLines = (bRow.text ?? "").split("\n");
      setDiffResult(collapseCtx(computeDiff(aLines, bLines)));
    } catch (e) {
      showToast(toApiError(e).message, "err");
    } finally {
      setDiffLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      await api.put("/api/backups/settings", {
        schedule: sSchedule(),
        hour: Number(sHour()),
        retention: Number(sRetention()),
      });
      showToast("设置已保存", "ok");
      settingsData.reload();
      return true;
    } catch (e) {
      showToast(toApiError(e).message, "err");
      return false;
    }
  };

  const selectedForCompare = createMemo(() => new Set(compareIds()));

  return (
    <div>
      <PageHeader title="配置备份" subtitle="RouterOS 配置导出与版本管理">
        <div class="flex gap-2">
          <Show when={can("write")}>
            <button type="button" class="btn btn-ghost" onClick={openSettings}>
              备份设置
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={runBusy()}
              onClick={() => setRunConfirm(true)}
            >
              {runBusy() ? "备份中…" : "立即备份"}
            </button>
          </Show>
        </div>
      </PageHeader>

      <p class="mb-4 rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        <b>关于还原：</b>RouterOS 配置还原需要在 WinBox 或终端中使用{" "}
        <code class="font-mono text-ink">/import</code> 命令。
        此操作需要完全访问权限，并可能导致临时断线，因此仪表盘不提供一键还原，请通过 WinBox/SSH 操作。
      </p>

      <div class="space-y-4">
        <Show
          when={compareIds().length === 2}
        >
          <div class="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
            <span class="flex-1 text-[13px] text-muted">
              已选择 {compareIds().length} 个版本用于对比
            </span>
            <button
              type="button"
              class="btn btn-ghost"
              onClick={() => { setCompareIds([]); setDiffResult(null); }}
            >
              清除
            </button>
            <button
              type="button"
              class="btn btn-primary"
              disabled={diffLoading()}
              onClick={handleCompare}
            >
              {diffLoading() ? "对比中…" : "查看对比"}
            </button>
          </div>
        </Show>

        <Card title="备份列表">
          <Show
            when={backups().length > 0}
            fallback={
              <EmptyState
                title="暂无备份"
                detail="点击「立即备份」创建第一个配置快照。备份前账号需要具备 write 权限，服务账号还需要 read、ftp 权限。"
              />
            }
          >
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="w-8" />
                    <th>时间</th>
                    <th>触发方式</th>
                    <th>大小</th>
                    <th>操作员</th>
                    <th class="w-10" />
                  </tr>
                </thead>
                <tbody>
                  <For each={backups()}>
                    {(row) => (
                      <tr
                        class="is-clickable"
                        onClick={() => handleView(row.id)}
                      >
                        <td onClick={(e) => { e.stopPropagation(); toggleCompare(row.id); }}>
                          <input
                            type="checkbox"
                            class="cursor-pointer"
                            checked={selectedForCompare().has(row.id)}
                            onChange={() => toggleCompare(row.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td class="num text-[13px]">{fmtDate(row.t)}</td>
                        <td>
                          <Pill tone={row.trigger === "manual" ? "accent" : "muted"}>
                            {row.trigger === "manual" ? "手动" : "自动"}
                          </Pill>
                        </td>
                        <td class="num text-[13px]">{fmtSize(row.size)}</td>
                        <td class="text-[13px] text-muted">{row.user || "—"}</td>
                        <td>
                          <RowMenu
                            items={[
                              {
                                label: "下载",
                                onSelect: () => {
                                  window.open(`/api/backups/download?id=${row.id}`, "_blank");
                                },
                              },
                              {
                                label: "选择对比",
                                onSelect: () => toggleCompare(row.id),
                              },
                              ...(can("write")
                                ? [
                                    {
                                      label: "删除",
                                      danger: true as const,
                                      onSelect: () => setDeleteId(row.id),
                                    },
                                  ]
                                : []),
                            ]}
                          />
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Card>

        <Show when={diffResult()}>
          {(edits) => (
            <Card title="版本对比">
              <div class="overflow-x-auto">
                <table class="w-full font-mono text-[12.5px]" style={{ "border-collapse": "collapse" }}>
                  <tbody>
                    <For each={edits()}>
                      {(edit) => (
                        <Show
                          when={edit.type !== "ctx"}
                          fallback={
                            <tr>
                              <td
                                colspan={2}
                                class="px-3 py-0.5 text-center text-[11.5px] text-faint"
                                style={{ background: "var(--color-surface)" }}
                              >
                                {"count" in edit ? `… ${edit.count} 行未更改 …` : ""}
                              </td>
                            </tr>
                          }
                        >
                          <tr
                            style={{
                              background:
                                edit.type === "add"
                                  ? "color-mix(in srgb, var(--color-good) 12%, transparent)"
                                  : edit.type === "remove"
                                    ? "color-mix(in srgb, var(--color-bad) 10%, transparent)"
                                    : "transparent",
                            }}
                          >
                            <td
                              class="select-none px-2 py-0 text-center text-[11px]"
                              style={{
                                width: "24px",
                                color:
                                  edit.type === "add"
                                    ? "var(--color-good)"
                                    : edit.type === "remove"
                                      ? "var(--color-bad)"
                                      : "transparent",
                              }}
                            >
                              {"line" in edit ? (edit.type === "add" ? "+" : edit.type === "remove" ? "−" : " ") : ""}
                            </td>
                            <td class="whitespace-pre px-2 py-0">
                              {"line" in edit ? edit.line : ""}
                            </td>
                          </tr>
                        </Show>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </Show>

        <Show when={viewId() !== null}>
          <Card title="备份内容">
            <Show
              when={!viewLoading()}
              fallback={<div class="p-4 text-[13px] text-muted">加载中…</div>}
            >
              <pre class="max-h-96 overflow-auto whitespace-pre-wrap p-4 font-mono text-[12px]">
                {viewText()}
              </pre>
            </Show>
          </Card>
        </Show>
      </div>

      <Show when={showSettings()}>
        <FormPanel
          title="备份设置"
          submitLabel="保存"
          onClose={() => setShowSettings(false)}
          onSubmit={saveSettings}
        >
          <Field label="自动备份">
            <SelectInput
              value={sSchedule()}
              onChange={setSSchedule}
              options={SCHEDULE_OPTIONS}
            />
          </Field>
          <Show when={sSchedule() !== "off"}>
            <Field label="备份时间（UTC 小时）">
              <SelectInput
                value={sHour()}
                onChange={setSHour}
                options={HOUR_OPTIONS}
              />
            </Field>
          </Show>
          <Field label="保留备份数量" hint="最多保留的历史版本数（1–365）">
            <TextInput
              value={sRetention()}
              onInput={setSRetention}
              type="number"
            />
          </Field>
        </FormPanel>
      </Show>

      <Show when={runConfirm()}>
        <ConfirmDialog
          title="立即备份"
          message="将立即创建一份 RouterOS 配置备份。"
          confirmLabel="备份"
          onClose={() => setRunConfirm(false)}
          onConfirm={async () => { await handleRun(); return true; }}
        />
      </Show>

      <Show when={deleteId() !== null}>
        <ConfirmDialog
          title="删除备份"
          message="此操作不可恢复，确认删除该备份版本？"
          confirmLabel="删除"
          danger
          onClose={() => setDeleteId(null)}
          onConfirm={async () => { const ok = await handleDelete(); if (ok) setDeleteId(null); return ok; }}
        />
      </Show>
    </div>
  );
}
