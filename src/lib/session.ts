import { createSignal } from "solid-js";
import type { Session } from "./api";

const [session, setSession] = createSignal<Session | null>(null);
export { session, setSession };

/**
 * Whether the logged-in RouterOS account holds a policy ("write", "reboot", …).
 * When the account could not read its own group we show the control and let
 * the router refuse it; the server enforces known policies as well.
 */
export function can(policy: string): boolean {
  const current = session();
  if (!current) return false;
  if (!current.policiesKnown) return true;
  return current.policies.includes(policy);
}
