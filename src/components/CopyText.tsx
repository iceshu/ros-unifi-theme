import { Copy } from "@lucide/solid";
import type { ParentProps } from "solid-js";
import { showToast } from "../lib/toast";

export async function copyText(value: string) {
  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
    } catch {
      // Plain-HTTP LAN pages have no async clipboard; fall back to execCommand.
      const previous = document.activeElement;
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.append(textarea);
      try {
        textarea.select();
        if (!document.execCommand("copy")) throw new Error("复制失败");
      } finally {
        textarea.remove();
        if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
      }
    }
    showToast(`已复制 ${value.length > 40 ? `${value.slice(0, 40)}…` : value}`, "ok");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "复制失败", "err");
  }
}

/** Text that copies on click; the icon only appears on hover so rows stay clean. */
export function CopyText(props: ParentProps<{ value: string; class?: string }>) {
  return (
    <button
      type="button"
      title="点击复制"
      class={`copy ${props.class ?? ""}`}
      onClick={(event) => {
        event.stopPropagation();
        void copyText(props.value);
      }}
    >
      <span class="min-w-0 truncate">{props.children ?? props.value}</span>
      <Copy class="copy-icon" aria-hidden="true" />
    </button>
  );
}
