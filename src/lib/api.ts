export interface Meta {
  demo: boolean;
  host: string;
  hostError: string | null;
  /** .env service account configured for the background sampler. */
  serviceAccount: boolean;
  wanInterfaces: string[];
  lanInterfaces: string[];
  tlsInsecure: boolean;
  timeoutMs: number;
  version: string;
  allowedPaths: string[];
  writeMenus: string[];
  historyEnabled: boolean;
}

export interface Session {
  user: string;
  group: string;
  /** RouterOS group policies of the logged-in account, e.g. read, write, reboot. */
  policies: string[];
  /** False when the account could not read its own group; the router still enforces. */
  policiesKnown: boolean;
  demo: boolean;
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError(0, "network", error.message || "网络请求失败");
  return new ApiError(0, "network", "网络请求失败");
}

/** Fired when the server says the RouterOS session is gone; the auth gate shows the login page. */
export const LOGGED_OUT_EVENT = "rut:logged-out";

export async function requestJson(path: string, init: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "proxy_down", "连不上仪表服务。开发时请确认 npm run dev 仍在运行。");
  }
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    const code = typeof record.code === "string" ? record.code : "router_error";
    const message = typeof record.message === "string" && record.message ? record.message : `请求失败（HTTP ${response.status}）`;
    if (response.status === 401 && code === "login_required") window.dispatchEvent(new Event(LOGGED_OUT_EVENT));
    throw new ApiError(response.status, code, message);
  }
  return payload;
}

function sendJson(path: string, method: string, body?: Record<string, unknown>): Promise<unknown> {
  return requestJson(path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function getMeta(): Promise<Meta> {
  return requestJson("/api/meta") as Promise<Meta>;
}

export function getRest(path: string): Promise<unknown> {
  return requestJson(path);
}

export async function getSession(): Promise<Session | null> {
  try {
    return (await requestJson("/api/session")) as Session;
  } catch (error) {
    if (toApiError(error).status === 401) return null;
    throw error;
  }
}

export function login(username: string, password: string): Promise<Session> {
  return sendJson("/api/login", "POST", { username, password }) as Promise<Session>;
}

export function logout(): Promise<unknown> {
  return sendJson("/api/logout", "POST", {});
}

/**
 * RouterOS changes. `menu` is the REST menu path such as "/rest/ip/firewall/nat";
 * ids are RouterOS ".id" values ("*1A") and are sent unencoded as the router expects.
 * Values are sent as strings; the server refuses fields not on its allowlist.
 */
export type RosFields = Record<string, string>;

export const ros = {
  create: (menu: string, fields: RosFields) => sendJson(menu, "PUT", fields),
  update: (menu: string, id: string, fields: RosFields) => sendJson(`${menu}/${id}`, "PATCH", fields),
  remove: (menu: string, id: string) => sendJson(`${menu}/${id}`, "DELETE"),
  /** POST <menu>/<command>, e.g. ros.command("/rest/ip/firewall/filter", "move", { ".id": a, destination: b }). */
  command: (menu: string, command: string, fields: RosFields = {}) => sendJson(`${menu}/${command}`, "POST", fields),
};

export async function wireguardKeypair(): Promise<{ privateKey: string; publicKey: string }> {
  return (await sendJson("/api/wireguard/keypair", "POST", {})) as { privateKey: string; publicKey: string };
}
