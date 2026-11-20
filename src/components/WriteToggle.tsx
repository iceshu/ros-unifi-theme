import { createEffect, createSignal, onCleanup } from "solid-js";
import { toApiError, writeRest } from "../lib/api";
import { showToast } from "../lib/toast";
import { flag, type RosRecord } from "../lib/model";
import { useDashboard } from "../lib/store";

/** Shared two-click confirmation; a click outside or five seconds cancels it. */
export function WriteToggle(props: { path: string; row: RosRecord | undefined }) {
  const dash = useDashboard();
  const [armed, setArmed] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  let root: HTMLSpanElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => { clearTimeout(timer); setArmed(false); };
  const disabled = () => flag(props.row?.disabled);
  const action = () => disabled() ? "启用" : "禁用";
  // Polling can replace the record. Cancel only if the target/state actually changed.
  createEffect(() => `${props.row?.[".id"]}:${disabled()}`, disarm);
  createEffect(() => true, () => {
    const outside = (event: MouseEvent) => {
      if (!root?.contains(event.target as Node)) disarm();
    };
    document.addEventListener("click", outside);
    onCleanup(() => document.removeEventListener("click", outside));
  });
  onCleanup(() => clearTimeout(timer));
  const click = async () => {
    if (busy()) return;
    setError("");
    if (!armed()) {
      setArmed(true);
      timer = setTimeout(disarm, 5000);
      return;
    }
    disarm();
    setBusy(true);
    const completedAction = action();
    const target = props.row?.name || props.row?.comment || props.row?.[".id"] || "";
    try {
      await writeRest(`${props.path}/${encodeURIComponent(props.row![".id"])}`, "PATCH", {
        disabled: disabled() ? "no" : "yes",
      });
      showToast(`已${completedAction} ${target}`, "ok");
      dash.retry();
    } catch (error) {
      const message = toApiError(error).message;
      setError(message);
      showToast(message, "err");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {dash.meta()?.writeEnabled && props.row?.[".id"] ? (
        <span ref={root} class="ml-2 inline-flex flex-wrap items-center gap-2">
          <button type="button" class={armed() ? "chip is-on text-warn" : "chip"}
            disabled={busy()} aria-label={`${props.row?.name || props.row?.comment || props.row?.[".id"]} ${action()}`}
            onClick={(event) => { event.stopPropagation(); void click(); }}>
            {busy() ? "处理中…" : armed() ? `确认${action()}？` : action()}
          </button>
          {error() ? <span role="alert" class="text-xs text-bad">{error()}</span> : null}
        </span>
      ) : null}
    </>
  );
}
