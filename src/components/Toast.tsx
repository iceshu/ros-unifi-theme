import { CircleAlert, CircleCheck, Info, X } from "@lucide/solid";
import { For } from "solid-js";
import { dismissToast, toasts } from "../lib/toast";

export function Toasts() {
  return (
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      aria-live="polite"
      aria-relevant="additions"
    >
      <For each={toasts()}>
        {(toast) => (
          <div
            class="toast card pointer-events-auto flex items-center gap-2.5 px-3 py-2.5 text-[13px]"
            role={toast.tone === "err" ? "alert" : "status"}
            style={{ "box-shadow": "var(--shadow-pop)" }}
          >
            {toast.tone === "ok" ? (
              <CircleCheck class="h-4 w-4 shrink-0 text-good" aria-hidden="true" />
            ) : toast.tone === "err" ? (
              <CircleAlert class="h-4 w-4 shrink-0 text-bad" aria-hidden="true" />
            ) : (
              <Info class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            )}
            <span class="min-w-0 flex-1 break-words">{toast.message}</span>
            <button type="button" class="text-faint hover:text-ink" aria-label="关闭" onClick={() => dismissToast(toast.id)}>
              <X class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}
