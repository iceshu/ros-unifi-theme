import { createSignal } from "solid-js";

export type ToastTone = "ok" | "err" | "info";
export interface Toast { id: number; message: string; tone: ToastTone }
const [toasts, setToasts] = createSignal<Toast[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 0;
export { toasts };
export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  setToasts((items) => items.filter((item) => item.id !== id));
}
export function showToast(message: string, tone: ToastTone = "info") {
  const id = ++nextId;
  if (toasts().length >= 3) dismissToast(toasts()[0].id);
  setToasts((items) => [...items, { id, message, tone }]);
  timers.set(id, setTimeout(() => dismissToast(id), 3500));
}
