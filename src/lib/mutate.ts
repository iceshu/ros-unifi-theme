import { toApiError, withConfirmed } from "./api";
import { askConfirm } from "./confirm";
import type { DashboardApi } from "./store";
import { showToast } from "./toast";

/**
 * Run one RouterOS change: toast the outcome, then re-read everything so the
 * page shows the router's real state. Returns false on failure so forms stay open.
 * When the server's lockout guard asks for confirmation (409 confirm_required),
 * the user is asked and the same change is re-sent as confirmed.
 */
export async function runWrite(dash: Pick<DashboardApi, "refresh">, success: string, op: () => Promise<unknown>): Promise<boolean> {
  try {
    try {
      await op();
    } catch (error) {
      const api = toApiError(error);
      if (api.code !== "confirm_required") throw error;
      if (!(await askConfirm("可能失去对路由器的访问", api.message))) return false;
      await withConfirmed(op);
    }
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
