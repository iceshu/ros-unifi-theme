import { Bell, BellOff, CheckCheck, CircleAlert, Info, TriangleAlert } from "@lucide/solid";
import { createSignal, For, onSettled, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api, toApiError } from "../lib/api";
import { type AlertEvent, KIND_LABELS } from "../lib/events";
import { can } from "../lib/session";
import { showToast } from "../lib/toast";

interface BellData {
  events: AlertEvent[];
  unread: number;
}

export function EventsBell() {
  const [open, setOpen] = createSignal(false);
  const [data, setData] = createSignal<BellData | null>(null);
  const [acking, setAcking] = createSignal(false);
  const navigate = useNavigate();
  let ref: HTMLDivElement | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  async function load() {
    try {
      const res = (await api.get("/api/events?limit=5")) as BellData;
      setData(res);
    } catch {
      // silent
    }
  }

  onSettled(() => {
    void load();
    pollTimer = setInterval(() => void load(), 30000);
    if ((pollTimer as unknown as { unref?: () => void }).unref) {
      (pollTimer as unknown as { unref: () => void }).unref();
    }

    const clickOutside = (e: MouseEvent) => {
      if (ref && !ref.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", clickOutside);

    return () => {
      clearInterval(pollTimer);
      document.removeEventListener("click", clickOutside);
    };
  });

  async function ackAll(e: MouseEvent) {
    e.stopPropagation();
    if (acking()) return;
    setAcking(true);
    try {
      await api.post("/api/events/ack", { all: true });
      await load();
    } catch (err) {
      showToast(toApiError(err).message, "err");
    } finally {
      setAcking(false);
    }
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    setOpen((v) => {
      if (!v) void load();
      return !v;
    });
  }

  function goEvents(e: MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    navigate("/events");
  }

  const unread = () => data()?.unread ?? 0;
  const events = () => data()?.events ?? [];

  return (
    <div class="relative" ref={ref}>
      <button
        type="button"
        class="icon-btn relative"
        aria-label={`告警 ${unread() > 0 ? `(${unread()} 未读)` : ""}`}
        title="告警事件"
        onClick={toggle}
      >
        <Bell class="h-4 w-4" aria-hidden="true" />
        <Show when={unread() > 0}>
          <span
            class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-0.5 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {unread() > 99 ? "99+" : unread()}
          </span>
        </Show>
      </button>

      <Show when={open()}>
        <div
          class="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-panel shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span class="text-[13px] font-semibold">
              告警事件
              <Show when={unread() > 0}>
                <span class="ml-1.5 rounded-full bg-bad px-1.5 py-0.5 text-[10px] text-white">{unread()}</span>
              </Show>
            </span>
            <Show when={can("write") && unread() > 0}>
              <button
                type="button"
                class="flex items-center gap-1 text-[12px] text-muted hover:text-fg"
                onClick={ackAll}
                disabled={acking()}
              >
                <CheckCheck class="h-3.5 w-3.5" />
                全部已读
              </button>
            </Show>
          </div>

          {/* Event list */}
          <div class="max-h-80 overflow-y-auto">
            <Show
              when={events().length > 0}
              fallback={
                <div class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                  <BellOff class="h-6 w-6 text-faint" />
                  <p class="text-[13px] text-muted">暂无事件</p>
                </div>
              }
            >
              <For each={events()}>
                {(ev) => (
                  <div class={`flex items-start gap-2.5 border-b border-line px-4 py-2.5 last:border-0 ${ev.acked ? "opacity-50" : ""}`}>
                    <div class="mt-0.5 shrink-0">
                      <Show when={ev.severity === "critical"}>
                        <CircleAlert class="h-3.5 w-3.5" style={{ color: "var(--color-bad)" }} />
                      </Show>
                      <Show when={ev.severity === "warn"}>
                        <TriangleAlert class="h-3.5 w-3.5" style={{ color: "var(--color-warn)" }} />
                      </Show>
                      <Show when={ev.severity === "info"}>
                        <Info class="h-3.5 w-3.5 text-muted" />
                      </Show>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-[13px] font-medium">{ev.title}</p>
                      <div class="flex items-center gap-1.5 text-[11px] text-faint">
                        <Show when={KIND_LABELS[ev.kind]}>
                          <span>{KIND_LABELS[ev.kind]}</span>
                          <span>·</span>
                        </Show>
                        <span>
                          {new Date(ev.t).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <Show when={ev.resolved_t != null}>
                          <span>· 已恢复</span>
                        </Show>
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>

          {/* Footer */}
          <div class="border-t border-line px-4 py-2">
            <button
              type="button"
              class="w-full text-center text-[12px] text-accent hover:underline"
              onClick={goEvents}
            >
              查看全部事件 →
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
