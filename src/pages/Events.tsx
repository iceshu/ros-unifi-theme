import { BellOff, CheckCheck, CircleAlert, Info, TriangleAlert } from "@lucide/solid";
import { createMemo, createSignal, For, Show } from "solid-js";
import { api, toApiError } from "../lib/api";
import { type AlertEvent, KIND_LABELS, SEV_LABELS } from "../lib/events";
import { can } from "../lib/session";
import { showToast } from "../lib/toast";
import { useLoad } from "../lib/useRos";
import { EmptyState, PageHeader, Segmented } from "../components/ui";

interface EventsData {
  events: AlertEvent[];
  unread: number;
}

function parseSeverity(s: string): "info" | "warn" | "critical" {
  if (s === "warn" || s === "critical") return s;
  return "info";
}

function groupByDay(events: AlertEvent[]) {
  const groups: { day: string; date: number; items: AlertEvent[] }[] = [];
  for (const ev of events) {
    const d = new Date(ev.t);
    const day = d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.items.push(ev);
    } else {
      groups.push({ day, date: ev.t, items: [ev] });
    }
  }
  return groups;
}

function SevIcon(props: { severity: string; class?: string }) {
  const cls = `h-4 w-4 shrink-0 ${props.class ?? ""}`;
  if (props.severity === "critical") return <CircleAlert class={cls} style={{ color: "var(--color-bad)" }} />;
  if (props.severity === "warn") return <TriangleAlert class={cls} style={{ color: "var(--color-warn)" }} />;
  return <Info class={cls} style={{ color: "var(--color-muted)" }} />;
}

function sevTone(sev: string): "bad" | "warn" | "muted" {
  if (sev === "critical") return "bad";
  if (sev === "warn") return "warn";
  return "muted";
}

export function EventsPage() {
  const [sevFilter, setSevFilter] = createSignal<string>("all");
  const [kindFilter, setKindFilter] = createSignal<string>("all");
  const [statusFilter, setStatusFilter] = createSignal<"all" | "active" | "resolved">("all");
  const [acking, setAcking] = createSignal(false);

  const { data, error, reload } = useLoad<EventsData>(
    () => "/api/events?limit=100",
    0,
    (raw) => raw as EventsData
  );

  const events = () => data()?.events ?? [];
  const unread = () => data()?.unread ?? 0;

  const filtered = createMemo(() =>
    events().filter((ev) => {
      const sev = sevFilter();
      const kind = kindFilter();
      const st = statusFilter();
      if (sev !== "all" && ev.severity !== sev) return false;
      if (kind !== "all" && ev.kind !== kind) return false;
      if (st === "active" && ev.resolved_t != null) return false;
      if (st === "resolved" && ev.resolved_t == null) return false;
      return true;
    })
  );

  const grouped = createMemo(() => groupByDay(filtered()));

  const usedKinds = createMemo(() => {
    const s = new Set(events().map((e) => e.kind));
    return [...s].filter((k) => KIND_LABELS[k]).sort();
  });

  async function ackAll() {
    if (acking()) return;
    setAcking(true);
    try {
      await api.post("/api/events/ack", { all: true });
      showToast("已全部标为已读", "ok");
      reload();
    } catch (e) {
      showToast(toApiError(e).message, "err");
    } finally {
      setAcking(false);
    }
  }

  async function ackOne(id: number) {
    try {
      await api.post("/api/events/ack", { ids: [id] });
      reload();
    } catch {
      // silent
    }
  }

  return (
    <div>
      <PageHeader title="事件与告警" subtitle={unread() > 0 ? `${unread()} 条未读` : undefined}>
        <Show when={can("write") && unread() > 0}>
          <button
            type="button"
            class="btn btn-ghost flex items-center gap-1.5 text-sm"
            disabled={acking()}
            onClick={ackAll}
          >
            <CheckCheck class="h-4 w-4" />
            全部已读
          </button>
        </Show>
      </PageHeader>

      <Show when={error()}>
        <div class="mb-4 rounded-lg bg-bad/10 px-4 py-3 text-sm text-bad">{error()}</div>
      </Show>

      {/* Filters */}
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={statusFilter()}
          options={[
            { value: "all", label: "全部" },
            { value: "active", label: "活跃" },
            { value: "resolved", label: "已恢复" },
          ]}
          onChange={setStatusFilter}
          label="状态"
        />
        <Segmented
          value={sevFilter()}
          options={[
            { value: "all", label: "全部" },
            { value: "critical", label: SEV_LABELS.critical },
            { value: "warn", label: SEV_LABELS.warn },
            { value: "info", label: SEV_LABELS.info },
          ]}
          onChange={setSevFilter}
          label="级别"
        />
        <Show when={usedKinds().length > 1}>
          <select
            class="input h-8 rounded-lg px-2 py-0 text-sm"
            value={kindFilter()}
            onChange={(e) => setKindFilter(e.currentTarget.value)}
          >
            <option value="all">全部类型</option>
            <For each={usedKinds()}>
              {(k) => <option value={k}>{KIND_LABELS[k] ?? k}</option>}
            </For>
          </select>
        </Show>
      </div>

      <Show
        when={grouped().length > 0}
        fallback={
          <EmptyState
            title="暂无事件"
            detail="告警规则触发后，事件会记录在这里。"
          />
        }
      >
        <div class="space-y-6">
          <For each={grouped()}>
            {(group) => (
              <section>
                <div class="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">
                  {group.day}
                </div>
                <div class="card divide-y divide-line overflow-hidden">
                  <For each={group.items}>
                    {(ev) => (
                      <div
                        class={`flex items-start gap-3 px-4 py-3 ${ev.acked ? "opacity-60" : ""}`}
                      >
                        <div class="mt-0.5">
                          <SevIcon severity={ev.severity} />
                        </div>
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="text-sm font-medium">{ev.title}</span>
                            <span class={`pill pill-${sevTone(ev.severity)}`}>
                              {SEV_LABELS[parseSeverity(ev.severity)]}
                            </span>
                            <Show when={KIND_LABELS[ev.kind]}>
                              <span class="pill pill-muted">{KIND_LABELS[ev.kind]}</span>
                            </Show>
                            <Show
                              when={ev.resolved_t != null}
                              fallback={<span class="pill pill-warn">活跃</span>}
                            >
                              <span class="pill pill-good">已恢复</span>
                            </Show>
                          </div>
                          <Show when={ev.body}>
                            <p class="mt-0.5 text-[12px] text-muted">{ev.body}</p>
                          </Show>
                          <div class="mt-1 flex gap-3 text-[11px] text-faint">
                            <span>
                              {new Date(ev.t).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                            <Show when={ev.resolved_t != null}>
                              <span>
                                恢复于{" "}
                                {new Date(ev.resolved_t!).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </Show>
                          </div>
                        </div>
                        <Show when={can("write") && !ev.acked}>
                          <button
                            type="button"
                            class="icon-btn mt-0.5 shrink-0 opacity-50 hover:opacity-100"
                            title="标为已读"
                            onClick={() => ackOne(ev.id)}
                          >
                            <BellOff class="h-3.5 w-3.5" />
                          </button>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
