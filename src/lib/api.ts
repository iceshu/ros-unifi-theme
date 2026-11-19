export interface Meta {
  demo: boolean;
  host: string;
  hostError: string | null;
  user: string;
  passwordConfigured: boolean;
  wanInterfaces: string[];
  lanInterfaces: string[];
  readonly: true;
  tlsInsecure: boolean;
  timeoutMs: number;
  version: string;
  allowedPaths: string[];
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

export async function requestJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { Accept: "application/json" } });
  } catch {
    throw new ApiError(0, "proxy_down", "连不上本机上的仪表代理。开发时请确认 npm run dev 仍在运行。");
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
    const message =
      typeof record.message === "string" && record.message
        ? record.message
        : `请求失败（HTTP ${response.status}）`;
    throw new ApiError(response.status, code, message);
  }
  return payload;
}

export function getMeta(): Promise<Meta> {
  return requestJson("/api/meta") as Promise<Meta>;
}

export function getRest(path: string): Promise<unknown> {
  return requestJson(path);
}
