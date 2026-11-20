import { For } from "solid-js";
import { dismissToast, toasts } from "../lib/toast";

export function Toasts() {
  return <div class="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite" aria-relevant="additions">
    <For each={toasts()}>{(toast) => <div class={`card pointer-events-auto flex items-start gap-3 border-l-4 p-3 text-sm ${toast.tone === "ok" ? "border-l-good" : toast.tone === "err" ? "border-l-bad" : "border-l-accent"}`} role={toast.tone === "err" ? "alert" : "status"}>
      <span aria-hidden="true" class={toast.tone === "ok" ? "text-good" : toast.tone === "err" ? "text-bad" : "text-accent"}>{toast.tone === "ok" ? "✓" : toast.tone === "err" ? "!" : "i"}</span>
      <span class="min-w-0 flex-1 break-words">{toast.message}</span>
      <button type="button" class="cursor-pointer text-faint" aria-label="关闭" onClick={() => dismissToast(toast.id)}>×</button>
    </div>}</For>
  </div>;
}
