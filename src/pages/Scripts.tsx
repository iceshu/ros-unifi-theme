import { Pencil, Play, Trash2 } from "@lucide/solid";
import { createSignal, For, Show } from "solid-js";
import { SystemScriptForm } from "../components/SystemScriptForm";
import { AddButton, ConfirmDialog, EnableSwitch, RowMenu } from "../components/form";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { api, ros } from "../lib/api";
import { flag, type RosRecord } from "../lib/model";
import { runWrite } from "../lib/mutate";
import { can } from "../lib/session";
import { useDashboard } from "../lib/store";
import { useRos } from "../lib/useRos";

export function ScriptsPage() {
  const dash = useDashboard();
  const { rows, loaded } = useRos("/rest/system/script");
  const [form, setForm] = createSignal<RosRecord | "new" | null>(null);
  const [deleting, setDeleting] = createSignal<RosRecord | null>(null);
  const [running, setRunning] = createSignal<RosRecord | null>(null);

  return (
    <div>
      <PageHeader title="脚本" subtitle="RouterOS 自动化脚本">
        <AddButton label="新建脚本" onClick={() => setForm("new")} />
      </PageHeader>

      <Card>
        <Show
          when={rows().length > 0}
          fallback={<EmptyState title={loaded() ? "暂无脚本" : "正在读取"} detail="需要 write 权限才能创建脚本" compact />}
        >
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>策略</th>
                  <th>执行次数</th>
                  <th>最后执行</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr
                      class={`is-clickable${flag(row.disabled) ? " is-dim" : ""}`}
                      onClick={() => can("write") && setForm(row)}
                    >
                      <td>
                        <div class="font-medium">{row.name}</div>
                        <Show when={row.comment}>
                          <div class="text-[12px] text-muted">{row.comment}</div>
                        </Show>
                      </td>
                      <td class="font-mono text-[12px] text-muted">{row.policy || "—"}</td>
                      <td class="font-mono">{row["run-count"] ?? "0"}</td>
                      <td class="text-[13px] text-muted">{row["last-started"] || <span class="text-faint">从未</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <EnableSwitch menu="/rest/system/script" row={row} label={row.name} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <RowMenu
                          items={[
                            {
                              label: "运行",
                              icon: <Play size={14} />,
                              onSelect: () => setRunning(row),
                            },
                            {
                              label: "编辑",
                              icon: <Pencil size={14} />,
                              onSelect: () => setForm(row),
                            },
                            {
                              label: "删除",
                              icon: <Trash2 size={14} />,
                              danger: true,
                              onSelect: () => setDeleting(row),
                            },
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

      <Show when={form() !== null}>
        <SystemScriptForm
          script={form() === "new" ? undefined : (form() as RosRecord)}
          onClose={() => setForm(null)}
        />
      </Show>

      <Show when={running()}>
        {(row) => (
          <ConfirmDialog
            title={`运行脚本 "${row().name}"？`}
            message="即将在路由器上执行该脚本。"
            confirmLabel="运行"
            onClose={() => setRunning(null)}
            onConfirm={() =>
              runWrite(dash, `脚本 ${row().name} 已执行`, () => api.post("/api/system/script/run", { ".id": row()[".id"] })).then((ok) => {
                if (ok) setRunning(null);
                return ok;
              })
            }
          />
        )}
      </Show>

      <Show when={deleting()}>
        {(row) => (
          <ConfirmDialog
            title={`删除脚本 "${row().name}"？`}
            message="此操作不可撤销。"
            confirmLabel="删除"
            danger
            onClose={() => setDeleting(null)}
            onConfirm={() =>
              runWrite(dash, "已删除", () => ros.remove("/rest/system/script", row()[".id"])).then((ok) => {
                if (ok) setDeleting(null);
                return ok;
              })
            }
          />
        )}
      </Show>
    </div>
  );
}
