import { createSignal } from "solid-js";

export interface PendingConfirm {
  title: string;
  message: string;
  resolve: (ok: boolean) => void;
}

const [pending, setPending] = createSignal<PendingConfirm | null>(null);
export { pending as pendingConfirm };

/** Imperative confirmation (rendered by <GlobalConfirm/>), used when the server asks before a risky change. */
export function askConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    setPending({
      title,
      message,
      resolve: (ok) => {
        setPending(null);
        resolve(ok);
      },
    });
  });
}
