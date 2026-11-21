import { createEffect, createSignal, type Accessor } from "solid-js";
import { requestJson, toApiError } from "./api";
import { asRecords, type RosRecord } from "./model";
import { useDashboard } from "./store";

export interface Loaded<T> {
  data: Accessor<T | null>;
  error: Accessor<string>;
  /** The endpoint answered 404: the RouterOS menu (package) does not exist on this router. */
  missing: Accessor<boolean>;
  /** True once at least one load finished (success or failure). */
  loaded: Accessor<boolean>;
  reload: () => void;
}

/**
 * Load a URL for one page: on mount, every `intervalMs` while open, and after
 * every dashboard refresh (i.e. after any change made through runWrite). Use
 * for menus and /api endpoints the global store does not poll.
 */
export function useLoad<T = unknown>(url: Accessor<string | null>, intervalMs = 0, parse: (raw: unknown) => T = (raw) => raw as T): Loaded<T> {
  const dash = useDashboard();
  const [data, setData] = createSignal<T | null>(null);
  const [error, setError] = createSignal("");
  const [missing, setMissing] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [nonce, setNonce] = createSignal(0);

  createEffect(
    () => ({ target: url(), tick: dash.refreshTick(), nonce: nonce() }),
    ({ target }) => {
      if (!target) return;
      let stopped = false;
      let timer: number | undefined;
      const load = async () => {
        try {
          const raw = await requestJson(target);
          if (stopped) return;
          setData(() => parse(raw));
          setError("");
          setMissing(false);
        } catch (cause) {
          if (stopped) return;
          const api = toApiError(cause);
          setError(api.message);
          setMissing(api.status === 404);
        } finally {
          if (!stopped) setLoaded(true);
        }
        if (!stopped && intervalMs > 0) timer = window.setTimeout(load, document.hidden ? intervalMs * 3 : intervalMs);
      };
      void load();
      return () => {
        stopped = true;
        window.clearTimeout(timer);
      };
    },
  );

  return { data, error, missing, loaded, reload: () => setNonce((value) => value + 1) };
}

/** RouterOS menu under /rest (must be on a read allowlist). Single-object menus come back as one row. */
export function useRos(path: Accessor<string | null> | string, intervalMs = 0): Loaded<RosRecord[]> & { rows: Accessor<RosRecord[]> } {
  const loaded = useLoad<RosRecord[]>(typeof path === "string" ? () => path : path, intervalMs, asRecords);
  return { ...loaded, rows: () => loaded.data() ?? [] };
}
