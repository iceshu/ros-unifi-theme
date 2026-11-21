import { createEffect, createMemo, createSignal } from "solid-js";
import { type Accessor } from "solid-js";
import { requestJson, toApiError } from "./api";
import { useDashboard, type HistoryPoint } from "./store";

export const RANGES = [
  { seconds: 300, label: "5 分钟" },
  { seconds: 3600, label: "1 小时" },
  { seconds: 21600, label: "6 小时" },
  { seconds: 86400, label: "24 小时" },
  { seconds: 604800, label: "7 天" },
  { seconds: 2592000, label: "30 天" },
] as const;

export interface InterfaceHistory {
  points: Accessor<HistoryPoint[]>;
  /** "server" while /api/history answers; "browser" when the proxy has no sampler. */
  source: Accessor<"server" | "browser">;
}

function parsePoints(data: unknown): HistoryPoint[] {
  if (!data || typeof data !== "object" || !("points" in data) || !Array.isArray(data.points)) return [];
  const points: HistoryPoint[] = [];
  for (const item of data.points) {
    if (Array.isArray(item) && item.length >= 3 && item.every((value) => typeof value === "number")) {
      points.push({ t: item[0], rxBps: item[1], txBps: item[2] });
    }
  }
  return points;
}

/** Server-side samples survive page reloads; refresh cadence follows the range resolution. */
function refreshMs(range: number): number {
  if (range <= 300) return 5_000;
  if (range <= 3600) return 15_000;
  if (range <= 86400) return 60_000;
  if (range <= 604800) return 300_000;
  return 600_000;
}

/**
 * Throughput series for one interface. For ranges ≤ 24 h: server history
 * (/api/history) with live browser samples appended. For 7 d / 30 d: the
 * long-term DB endpoint (/api/history/long) only.
 */
export function useInterfaceHistory(
  name: Accessor<string | null | undefined>,
  range: Accessor<number>,
): InterfaceHistory {
  const dash = useDashboard();
  const [server, setServer] = createSignal<{ key: string; points: HistoryPoint[] } | null>(null);
  const [disabled, setDisabled] = createSignal(false);

  createEffect(
    () => ({ name: name() || "", range: range(), off: disabled() }),
    ({ name: iface, range: seconds, off }) => {
      if (!iface || off) return;
      const key = `${iface}:${seconds}`;
      let stopped = false;
      let timer: number | undefined;
      const isLong = seconds > 86400;
      const load = async () => {
        try {
          const url = isLong
            ? `/api/history/long?name=${encodeURIComponent(iface)}&range=${seconds}`
            : `/api/history?name=${encodeURIComponent(iface)}&range=${seconds}`;
          const points = parsePoints(await requestJson(url));
          if (stopped) return;
          setServer({ key, points });
        } catch (error) {
          if (!isLong && toApiError(error).status === 404) {
            setDisabled(true);
            return;
          }
        }
        if (!stopped)
          timer = window.setTimeout(
            load,
            document.hidden ? refreshMs(seconds) * 3 : refreshMs(seconds),
          );
      };
      void load();
      return () => {
        stopped = true;
        window.clearTimeout(timer);
      };
    },
  );

  const points = createMemo<HistoryPoint[]>(() => {
    const iface = name() || "";
    const seconds = range();
    const isLong = seconds > 86400;
    const live = iface ? (dash.history()[iface] ?? []) : [];
    const remote = server();
    if (disabled() || !remote || remote.key !== `${iface}:${seconds}`) {
      return isLong ? [] : live;
    }
    if (isLong || seconds > 3600 || remote.points.length === 0) return remote.points;
    const last = remote.points[remote.points.length - 1].t;
    return remote.points.concat(live.filter((point) => point.t > last));
  });

  return { points, source: () => (disabled() ? "browser" : "server") };
}
