import type { ParentProps } from "solid-js";
import { showToast } from "../lib/toast";

export async function copyText(value: string) {
  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
    } catch {
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
    showToast("已复制", "info");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "复制失败", "err");
  }
}

export function CopyText(props: ParentProps<{ value: string; class?: string }>) {
  return <button type="button" title="点击复制" class={`cursor-copy text-left ${props.class ?? ""}`} onClick={(event) => { event.stopPropagation(); void copyText(props.value); }}>{props.children ?? props.value}</button>;
}
