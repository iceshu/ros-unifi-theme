import { toApiError } from "./api";
import type { DashboardApi } from "./store";
import { showToast } from "./toast";

/**
 * Run one RouterOS change: toast the outcome, then re-read everything so the
 * page shows the router's real state. Returns false on failure so forms stay open.
 */
export async function runWrite(dash: Pick<DashboardApi, "refresh">, success: string, op: () => Promise<unknown>): Promise<boolean> {
  try {
    await op();
    showToast(success, "ok");
    dash.refresh();
    return true;
  } catch (error) {
    showToast(toApiError(error).message, "err");
    return false;
  }
}

/** Run several dependent changes as one action (e.g. TCP + UDP port forward). Stops at the first failure. */
export async function runWrites(dash: Pick<DashboardApi, "refresh">, success: string, ops: Array<() => Promise<unknown>>): Promise<boolean> {
  return runWrite(dash, success, async () => {
    for (const op of ops) await op();
  });
}
