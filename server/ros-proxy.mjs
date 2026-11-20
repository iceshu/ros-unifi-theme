import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COOKIE, createLoginLimiter, createSessions, parseCookies, parsePolicies, sessionCookie, sessionTtlMs } from "./auth.mjs";
import { demoBody, demoWrite } from "./demo.mjs";
import { WRITE_MENUS, validateWrite } from "./writes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ALLOWED_PATHS = [
  "/rest/system/resource",
  "/rest/system/identity",
  "/rest/system/clock",
  "/rest/system/health",
  "/rest/system/routerboard",
  "/rest/system/package",
  "/rest/interface",
  "/rest/interface/ethernet",
  "/rest/interface/bridge",
  "/rest/interface/bridge/port",
  "/rest/interface/bridge/host",
  "/rest/interface/list",
  "/rest/interface/list/member",
  "/rest/interface/pppoe-client",
  "/rest/interface/vlan",
  "/rest/interface/wifi",
  "/rest/interface/wifi/configuration",
  "/rest/interface/wifi/registration-table",
  "/rest/interface/wifi/security",
  "/rest/interface/wireless",
  "/rest/interface/wireless/registration-table",
  "/rest/interface/wireless/security-profiles",
  "/rest/interface/wireguard",
  "/rest/interface/wireguard/peers",
  "/rest/ip/address",
  "/rest/ip/arp",
  "/rest/ip/dhcp-server",
  "/rest/ip/dhcp-server/lease",
  "/rest/ip/dhcp-server/network",
  "/rest/ip/pool",
  "/rest/ip/dns",
  "/rest/ip/dns/static",
  "/rest/ip/neighbor",
  "/rest/ip/firewall/filter",
  "/rest/ip/firewall/nat",
  "/rest/ip/firewall/mangle",
  "/rest/ip/firewall/address-list",
  "/rest/ip/firewall/connection",
  "/rest/ip/route",
  "/rest/queue/simple",
  "/rest/ppp/active",
  "/rest/log",
];

const ALLOWED = new Set(ALLOWED_PATHS);
const READ_METHODS = new Set(["GET", "HEAD"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function parseBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function parseCsv(value, fallback) {
  if (value == null || String(value).trim() === "") return [...fallback];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function loadEnvFile(file = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const raw = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim();
    let value = raw.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function normalizeRouterHost(input) {
  const raw = String(input ?? "").trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) {
    const error = new Error("bad scheme");
    error.code = "bad_host";
    throw error;
  }
  const withProto = raw === "" ? "http://192.168.2.1" : /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url;
  try {
    url = new URL(withProto);
  } catch {
    const error = new Error("bad host");
    error.code = "bad_host";
    throw error;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    const error = new Error("bad scheme");
    error.code = "bad_host";
    throw error;
  }
  if (url.username || url.password) {
    const error = new Error("credentials in host");
    error.code = "creds_in_host";
    throw error;
  }
  return url.origin;
}

export function normalizeRestPath(pathname) {
  if (typeof pathname !== "string" || pathname.length > 512) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;
  const collapsed = decoded.replace(/\/+/g, "/");
  const trimmed = collapsed.length > 1 && collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
  const parts = trimmed.split("/");
  if (parts.some((part) => part === "." || part === "..")) return null;
  return trimmed;
}

function isSecretKey(key) {
  // Dotted inline keys such as "security.passphrase" count as secrets too.
  const name = key.toLowerCase().split(".").pop() || "";
  if (name === "public-key") return false;
  return (
    name === "password" ||
    name === "passphrase" ||
    name === "private-key" ||
    name === "preshared-key" ||
    name === "secret" ||
    name.endsWith("-password") ||
    name.endsWith("-passphrase") ||
    name.endsWith("-private-key") ||
    name.endsWith("-preshared-key") ||
    name.endsWith("pre-shared-key")
  );
}

export function redactSecrets(value) {
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSecretKey(key)) continue;
      out[key] = redactSecrets(item);
    }
    return out;
  }
  return value;
}

export function sanitizeSearch(search) {
  if (!search) return "";
  if (search.length > 2000) return null;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out = new URLSearchParams();
  for (const [key, value] of params) {
    if (value.length > 500 || /[\r\n]/.test(value) || isSecretKey(key)) return null;
    if (key === ".proplist") {
      if (!/^[A-Za-z0-9_,.\-*]+$/.test(value)) return null;
      out.append(key, value);
      continue;
    }
    if (key === ".query") {
      out.append(key, value);
      continue;
    }
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(key)) return null;
    out.append(key, value);
  }
  const serialized = out.toString();
  return serialized ? `?${serialized}` : "";
}

export function crossSiteError(headers) {
  const read = (name) => {
    const value = headers?.[name] ?? headers?.[name.toLowerCase()];
    if (Array.isArray(value)) return value[0] ?? "";
    return value == null ? "" : String(value);
  };
  const site = read("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return "cross_site";
  const origin = read("origin");
  if (!origin) return null;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return "bad_origin";
  }
  const host = read("host");
  if (host && originHost !== host) return "cross_origin";
  return null;
}

export function classifyNetworkError(error) {
  const code = error?.code || error?.cause?.code || "";
  const blob = `${code} ${error?.message || ""} ${error?.cause?.message || ""}`;
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT" || /timeout/i.test(error?.message || "")) {
    return {
      status: 504,
      code: "timeout",
      message: "等待路由器响应超时。主机可能不可达，或 www / www-ssl 没有响应。",
    };
  }
  if (code === "ECONNREFUSED") {
    return {
      status: 502,
      code: "refused",
      message:
        "无法连接路由器（连接被拒绝）。请确认 www（RouterOS 7.9 及以上）或 www-ssl 已经启用，地址和端口正确。本仪表不会替你打开这些服务。",
    };
  }
  if (code === "EHOSTUNREACH" || code === "ENETUNREACH" || code === "EHOSTDOWN") {
    return {
      status: 502,
      code: "unreachable",
      message: "路由器不可达。请检查这台主机到路由器的网络、地址和防火墙。",
    };
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return {
      status: 502,
      code: "dns",
      message: "无法解析 ROUTEROS_HOST 中的主机名。",
    };
  }
  if (code === "ECONNRESET") {
    return { status: 502, code: "reset", message: "与路由器的连接被重置。" };
  }
  if (/CERT|TLS|SSL|SELF_SIGNED|ALTNAME/i.test(blob)) {
    return {
      status: 502,
      code: "tls",
      message:
        "TLS 证书校验失败。局域网自签证书可在 .env 中设置 ROUTEROS_TLS_INSECURE=true。不要把仪表暴露到公网。",
    };
  }
  if (code === "ELARGE") {
    return { status: 502, code: "too_large", message: "路由器的响应过大，已中止读取。" };
  }
  if (code === "ABORT") {
    return { status: 499, code: "abort", message: "连接已取消。" };
  }
  return {
    status: 502,
    code: "network",
    message: `连接路由器失败${code ? `（${code}）` : ""}。`,
  };
}

export function timeoutMs(env) {
  const n = Number(env.ROUTEROS_TIMEOUT_MS ?? 8000);
  if (!Number.isFinite(n)) return 8000;
  return Math.min(20_000, Math.max(1000, Math.round(n)));
}

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function applyCommon(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(res, status, payload, { demo = false } = {}) {
  const body = JSON.stringify(payload);
  applyCommon(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Demo-Mode", demo ? "1" : "0");
  res.end(body);
}

export function routerRequest(target, { method, headers, timeout, insecure, signal, body }) {
  return new Promise((resolve, reject) => {
    const lib = target.protocol === "https:" ? https : http;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const ok = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method,
        headers,
        rejectUnauthorized: !insecure,
        timeout,
      },
      (upstream) => {
        const chunks = [];
        let size = 0;
        upstream.on("data", (chunk) => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) {
            upstream.destroy();
            fail(Object.assign(new Error("response too large"), { code: "ELARGE" }));
            return;
          }
          chunks.push(chunk);
        });
        upstream.on("end", () => {
          ok({
            status: upstream.statusCode ?? 502,
            headers: upstream.headers,
            body: Buffer.concat(chunks),
          });
        });
        upstream.on("error", fail);
      },
    );
    req.on("timeout", () => {
      req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    });
    req.on("error", fail);
    if (signal) {
      const onAbort = () => req.destroy(Object.assign(new Error("aborted"), { code: "ABORT" }));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
    req.end(body);
  });
}

/** Size-limited JSON body; oversized requests are drained so the error response still arrives. */
async function readJsonBody(req) {
  const fail = (message, status = 400, code = "bad_body") => Object.assign(new Error(message), { status, code });
  if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers["content-type"] || ""))) {
    throw fail("请求必须使用 application/json。", 415, "content_type");
  }
  const chunks = [];
  let size = 0;
  let tooLarge = Number(req.headers["content-length"]) > 64 * 1024;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) tooLarge = true;
    if (!tooLarge) chunks.push(chunk);
  }
  if (tooLarge) throw fail("请求体不能超过 64KB。", 413, "too_large");
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw fail("请求体不是有效 JSON。");
  }
}

function routerErrorText(parsed) {
  if (parsed?.kind !== "json" || !parsed.value || typeof parsed.value !== "object") return "";
  return `${parsed.value.detail || ""} ${parsed.value.message || ""}`;
}

function describeRouterFailure(status, parsed) {
  const detail =
    parsed?.kind === "json" && parsed.value && typeof parsed.value === "object"
      ? String(parsed.value.detail || parsed.value.message || "")
      : "";
  if (status === 401) {
    return {
      code: "auth",
      message: "路由器拒绝了这个账号。可能密码已修改，或该账号的组缺少 api / rest-api 权限。请重新登录。",
    };
  }
  if (/not enough permissions|not allowed/i.test(routerErrorText(parsed))) {
    return { code: "forbidden", message: "当前登录的 RouterOS 账号没有执行这个操作的权限。", detail };
  }
  if (parsed?.kind === "html") {
    return {
      code: "not_rest",
      message: "路由器返回了网页而不是 REST JSON。请确认 www 或 www-ssl 提供的是 RouterOS REST，而不是别的页面。",
    };
  }
  // CHR and x86 RouterOS answer a missing menu with HTTP 400 and
  // "no such command or directory", not 404. Treat that like a missing path
  // so optional reads (routerboard, and any other absent command) stay quiet.
  if (status === 404 || /no such command or directory/i.test(routerErrorText(parsed))) {
    return { code: "not_found", message: "路由器上没有这个 REST 路径。", detail };
  }
  return {
    code: "router_error",
    message: detail || `路由器返回了 HTTP ${status}。`,
    detail,
  };
}

function parseUpstream(headers, body) {
  const text = body.toString("utf8");
  const type = String(headers["content-type"] || "");
  const trimmed = text.trim();
  if (!trimmed) return { kind: "empty" };
  if (trimmed.startsWith("<") || type.includes("text/html")) return { kind: "html", text: trimmed.slice(0, 180) };
  try {
    return { kind: "json", value: JSON.parse(trimmed) };
  } catch {
    return { kind: "text", text: trimmed.slice(0, 300) };
  }
}

function metaPayload(env, options) {
  let host = "http://192.168.2.1";
  let hostError = null;
  try {
    host = normalizeRouterHost(env.ROUTEROS_HOST);
  } catch (error) {
    hostError = error.code || "bad_host";
  }
  return {
    demo: parseBool(env.DEMO_MODE),
    host,
    hostError,
    serviceAccount: String(env.ROUTEROS_USER ?? "").trim() !== "" && String(env.ROUTEROS_PASSWORD ?? "") !== "",
    wanInterfaces: parseCsv(env.WAN_INTERFACES, ["liantong", "ether0"]),
    lanInterfaces: parseCsv(env.LAN_INTERFACES, ["bridge1"]),
    tlsInsecure: parseBool(env.ROUTEROS_TLS_INSECURE),
    timeoutMs: timeoutMs(env),
    version: readVersion(),
    allowedPaths: ALLOWED_PATHS,
    writeMenus: Object.keys(WRITE_MENUS),
    historyEnabled: !!options.history,
  };
}

function safeFile(root, urlPath) {
  let decoded = urlPath;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.split("/").includes("..")) return null;
  const full = path.resolve(root, `.${decoded}`);
  const rootResolved = path.resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + path.sep)) return null;
  return full;
}

function sendFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  const data = fs.readFileSync(file);
  applyCommon(res);
  res.statusCode = 200;
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  if (ext === ".html") {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("Cache-Control", "no-cache");
  } else if (file.includes(`${path.sep}assets${path.sep}`)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    res.setHeader("Cache-Control", "public, max-age=3600");
  }
  res.end(data);
}

const DEMO_POLICIES = ["read", "write", "reboot", "test", "api", "rest-api", "sensitive", "password"];

function base64(base64url) {
  return Buffer.from(base64url, "base64url").toString("base64");
}

/** X25519 key pair in WireGuard's base64 encoding, for new peers (browsers on plain-HTTP LANs lack WebCrypto). */
export function wireguardKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("x25519");
  return {
    privateKey: base64(privateKey.export({ format: "jwk" }).d),
    publicKey: base64(publicKey.export({ format: "jwk" }).x),
  };
}

function sessionPayload(session, demo) {
  return {
    user: session.user,
    group: session.group,
    policies: session.policies,
    policiesKnown: session.policiesKnown,
    demo,
  };
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ staticDir?: string | false, request?: typeof routerRequest, history?: { query: (name: string, range: number) => unknown }, sessions?: ReturnType<typeof createSessions>, now?: () => number }} [options]
 */
export function createHandler(env, options = {}) {
  const demo = parseBool(env.DEMO_MODE);
  const staticDir = options.staticDir === undefined ? path.join(ROOT, "dist") : options.staticDir;
  const request = options.request ?? routerRequest;
  const sessions = options.sessions ?? createSessions({ ttlMs: sessionTtlMs(env), now: options.now });
  const limiter = createLoginLimiter({ now: options.now });

  const authHeader = (user, password) => `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
  const routerGet = (origin, pathWithQuery, user, password) =>
    request(new URL(pathWithQuery, origin), {
      method: "GET",
      timeout: timeoutMs(env),
      insecure: parseBool(env.ROUTEROS_TLS_INSECURE),
      signal: null,
      headers: {
        Authorization: authHeader(user, password),
        Accept: "application/json",
        "Accept-Encoding": "identity",
        Host: new URL(origin).host,
      },
    });

  /** Group and policies of the account itself; unknown when the account cannot read /user. */
  async function discoverPolicies(origin, user, password) {
    try {
      const users = parseUpstream({}, (await routerGet(origin, `/rest/user?name=${encodeURIComponent(user)}`, user, password)).body);
      const group = users.kind === "json" && Array.isArray(users.value) ? String(users.value[0]?.group || "") : "";
      if (!group) return { group: "", policies: [], policiesKnown: false };
      const groups = parseUpstream({}, (await routerGet(origin, `/rest/user/group?name=${encodeURIComponent(group)}`, user, password)).body);
      const policy = groups.kind === "json" && Array.isArray(groups.value) ? groups.value[0]?.policy : undefined;
      if (typeof policy !== "string") return { group, policies: [], policiesKnown: false };
      return { group, policies: parsePolicies(policy), policiesKnown: true };
    } catch {
      return { group: "", policies: [], policiesKnown: false };
    }
  }

  async function handleLogin(req, res) {
    const client = String(req.socket?.remoteAddress || "unknown");
    const wait = limiter.blocked(client);
    if (wait > 0) {
      sendJson(res, 429, { code: "too_many_attempts", message: `登录失败次数过多，请 ${wait} 秒后再试。` });
      return;
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      sendJson(res, error.status || 400, { code: error.code || "bad_body", message: error.message });
      return;
    }
    const user = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!user || !password || user.length > 128 || password.length > 256) {
      sendJson(res, 400, { code: "bad_login", message: "请输入 RouterOS 用户名和密码。" });
      return;
    }
    const logUser = user.replace(/[^\w.@-]/g, "_");

    let info;
    if (demo) {
      info = { user, password: "", group: "full（演示）", policies: DEMO_POLICIES, policiesKnown: true };
    } else {
      let origin;
      try {
        origin = normalizeRouterHost(env.ROUTEROS_HOST);
      } catch {
        sendJson(res, 500, { code: "bad_host", message: "ROUTEROS_HOST 不是有效的 http 或 https 地址。" });
        return;
      }
      let upstream;
      try {
        upstream = await routerGet(origin, "/rest/system/identity", user, password);
      } catch (error) {
        const failure = classifyNetworkError(error);
        sendJson(res, failure.status, failure);
        return;
      }
      if (upstream.status === 401) {
        limiter.fail(client);
        console.info(`[ros] login failed for ${logUser}`);
        sendJson(res, 401, { code: "bad_login", message: "用户名或密码错误，或该账号的组缺少 api / rest-api 权限。" });
        return;
      }
      const parsed = parseUpstream(upstream.headers, upstream.body);
      if (upstream.status >= 400 || parsed.kind !== "json") {
        sendJson(res, upstream.status >= 400 ? upstream.status : 502, describeRouterFailure(upstream.status, parsed));
        return;
      }
      info = { user, password, ...(await discoverPolicies(origin, user, password)) };
    }
    limiter.reset(client);
    const id = sessions.create(info);
    res.setHeader("Set-Cookie", sessionCookie(id, sessions.ttlMs / 1000));
    console.info(`[ros] login ${logUser} group=${info.group || "?"}`);
    sendJson(res, 200, sessionPayload(sessions.get(id), demo), { demo });
  }

  async function proxyRest(req, res, { method, url, pathname, session, started }) {
    if (method === "OPTIONS") {
      applyCommon(res);
      res.statusCode = 204;
      res.setHeader("Allow", "GET, HEAD, PUT, PATCH, DELETE, POST, OPTIONS");
      res.end();
      return;
    }
    const isWrite = !READ_METHODS.has(method);
    let write;
    if (isWrite) {
      if (url.search) {
        sendJson(res, 403, { code: "forbidden_path", message: "写操作不接受查询参数。" });
        return;
      }
      let body;
      if (method !== "DELETE") {
        try {
          body = await readJsonBody(req);
        } catch (error) {
          sendJson(res, error.status || 400, { code: error.code || "bad_body", message: error.message });
          return;
        }
      }
      write = validateWrite(method, pathname, body);
      if (!write.ok) {
        sendJson(res, write.status, { code: write.code, message: write.message });
        console.info(`[ros] WRITE ${session.user} ${method} ${pathname} denied ${write.status}`);
        return;
      }
      if (session.policiesKnown && !session.policies.includes(write.policy)) {
        sendJson(res, 403, { code: "forbidden", message: `当前登录的 RouterOS 账号没有 ${write.policy} 权限。` });
        console.info(`[ros] WRITE ${session.user} ${method} ${pathname} denied 403 policy`);
        return;
      }
    } else if (!ALLOWED.has(pathname)) {
      sendJson(res, 403, { code: "forbidden_path", message: "代理不允许读取这个路径。" });
      return;
    }
    const search = isWrite ? "" : sanitizeSearch(url.search);
    if (search == null) {
      sendJson(res, 400, { code: "bad_query", message: "查询参数不在允许范围内。" });
      return;
    }

    if (demo) {
      if (isWrite) {
        const result = demoWrite(method, pathname, write.body ? JSON.parse(write.body) : {}, Date.now());
        console.info(`[ros] WRITE ${session.user} ${method} ${pathname} demo ${result.status}`);
        sendJson(res, result.status, redactSecrets(result.body ?? {}), { demo: true });
        return;
      }
      const body = demoBody(pathname, Date.now());
      if (body == null) sendJson(res, 404, { code: "not_found", message: "演示数据里没有这个路径。" }, { demo: true });
      else sendJson(res, 200, redactSecrets(body), { demo: true });
      return;
    }

    let origin;
    try {
      origin = normalizeRouterHost(env.ROUTEROS_HOST);
    } catch (error) {
      const code = error.code === "creds_in_host" ? "creds_in_host" : "bad_host";
      sendJson(res, 500, {
        code,
        message: code === "creds_in_host" ? "ROUTEROS_HOST 不能包含用户名或密码。" : "ROUTEROS_HOST 不是有效的 http 或 https 地址。",
      });
      return;
    }

    const target = new URL(pathname + search, origin);
    const controller = new AbortController();
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    // Reads are abandoned when the tab goes away; writes always run to completion.
    if (!isWrite) res.on("close", onClose);
    try {
      const upstream = await request(target, {
        method: isWrite ? method : "GET",
        body: write?.body,
        timeout: isWrite ? Math.max(timeoutMs(env), 15_000) : timeoutMs(env),
        insecure: parseBool(env.ROUTEROS_TLS_INSECURE),
        signal: isWrite ? null : controller.signal,
        headers: {
          Authorization: authHeader(session.user, session.password),
          Accept: "application/json",
          ...(write?.body !== undefined ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(write.body) } : {}),
          "Accept-Encoding": "identity",
          Host: target.host,
        },
      });
      const parsed = parseUpstream(upstream.headers, upstream.body);
      if (upstream.status === 401) {
        // Password changed or account disabled on the router: end the dashboard session as well.
        sessions.destroy(session.id);
        res.setHeader("Set-Cookie", sessionCookie("", 0));
        sendJson(res, 401, { code: "login_required", message: "路由器拒绝了这个账号，请重新登录。" });
        return;
      }
      if (isWrite) {
        console.info(`[ros] WRITE ${session.user} ${method} ${pathname} ${upstream.status} ${Date.now() - started}ms`);
        if (upstream.status >= 400) {
          const failure = describeRouterFailure(upstream.status, parsed);
          sendJson(res, upstream.status, failure.code === "not_found" ? { ...failure, message: "路由器上找不到这条记录，可能已被删除。" } : failure);
        } else if (parsed.kind === "json") sendJson(res, upstream.status, redactSecrets(parsed.value));
        else sendJson(res, upstream.status === 204 ? 200 : upstream.status, {});
        return;
      }
      if (upstream.status >= 400 || parsed.kind === "html") {
        const failure = describeRouterFailure(upstream.status, parsed);
        sendJson(res, failure.code === "not_found" ? 404 : upstream.status >= 400 ? upstream.status : 502, failure);
        return;
      }
      if (parsed.kind !== "json") {
        sendJson(res, 502, { code: "bad_response", message: "路由器的响应不是 JSON。" });
        return;
      }
      sendJson(res, 200, redactSecrets(parsed.value));
    } catch (error) {
      if (error?.code === "ABORT") return;
      const failure = classifyNetworkError(error);
      if (!res.writableEnded) sendJson(res, failure.status, failure);
      if (isWrite) console.info(`[ros] WRITE ${session.user} ${method} ${pathname} ${failure.code}`);
    } finally {
      res.off?.("close", onClose);
    }
  }

  function sendIndexOrFile(res, method, pathname) {
    const file = safeFile(staticDir, pathname === "/" ? "/index.html" : pathname);
    const target =
      file && fs.existsSync(file) && fs.statSync(file).isFile()
        ? file
        : !path.extname(pathname) && fs.existsSync(path.join(staticDir, "index.html"))
          ? path.join(staticDir, "index.html")
          : null;
    if (!target) {
      sendJson(res, 404, { code: "not_found", message: "没有这个页面。" });
      return;
    }
    if (method === "HEAD") {
      applyCommon(res);
      res.statusCode = 200;
      res.end();
      return;
    }
    sendFile(res, target);
  }

  return async function handle(req, res) {
    const method = (req.method || "GET").toUpperCase();
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = normalizeRestPath(url.pathname);
    const started = Date.now();
    const onlyMethod = (allowed) => {
      if (allowed.includes(method)) return true;
      sendJson(res, 405, { code: "method_not_allowed", message: `只接受 ${allowed[0]}。` });
      return false;
    };

    if (!pathname) {
      sendJson(res, 400, { code: "bad_path", message: "无法识别这个路径。" });
      return true;
    }
    if (pathname === "/api/health") {
      if (onlyMethod(["GET", "HEAD"])) sendJson(res, 200, { ok: true });
      return true;
    }

    const isApi = pathname.startsWith("/api/") || pathname.startsWith("/rest");
    if (!isApi) {
      if (!staticDir) return false;
      if (onlyMethod(["GET", "HEAD"])) sendIndexOrFile(res, method, pathname);
      return true;
    }

    const site = crossSiteError(req.headers);
    if (site) {
      sendJson(res, 403, { code: site, message: "已拒绝跨站请求。请从仪表自己的页面访问。" });
      return true;
    }

    if (pathname === "/api/meta") {
      if (onlyMethod(["GET", "HEAD"])) sendJson(res, 200, metaPayload(env, options), { demo });
      return true;
    }
    if (pathname === "/api/login") {
      if (onlyMethod(["POST"])) await handleLogin(req, res);
      return true;
    }
    if (pathname === "/api/logout") {
      if (onlyMethod(["POST"])) {
        sessions.destroy(parseCookies(req.headers.cookie)[COOKIE]);
        res.setHeader("Set-Cookie", sessionCookie("", 0));
        sendJson(res, 200, { ok: true });
      }
      return true;
    }

    // Everything below acts with the logged-in RouterOS account.
    const session = sessions.get(parseCookies(req.headers.cookie)[COOKIE]);
    if (!session) {
      sendJson(res, 401, { code: "login_required", message: "请先用 RouterOS 账号登录。" }, { demo });
      return true;
    }

    if (pathname === "/api/session") {
      if (onlyMethod(["GET", "HEAD"])) sendJson(res, 200, sessionPayload(session, demo), { demo });
      return true;
    }
    if (pathname === "/api/wireguard/keypair") {
      if (onlyMethod(["POST"])) sendJson(res, 200, wireguardKeypair());
      return true;
    }
    if (pathname === "/api/history") {
      if (!onlyMethod(["GET", "HEAD"])) return true;
      if (!options.history) {
        sendJson(res, 404, { code: "history_disabled", message: "历史记录功能未启用。设置 HISTORY_ENABLED=true 重启后生效。" });
        return true;
      }
      const rawName = url.searchParams.get("name") || "";
      // Only a map key on our side; RouterOS names may be non-ASCII, so reject just separators and control chars.
      if (!rawName || rawName.length > 64 || /[\x00-\x1f\x7f/\\]/.test(rawName)) {
        sendJson(res, 400, { code: "bad_name" });
        return true;
      }
      const rawRange = url.searchParams.get("range");
      sendJson(res, 200, options.history.query(rawName, rawRange != null ? Number(rawRange) : 300), { demo });
      return true;
    }
    if (pathname.startsWith("/rest")) {
      await proxyRest(req, res, { method, url, pathname, session, started });
      return true;
    }
    sendJson(res, 404, { code: "not_found", message: "没有这个接口。" });
    return true;
  };
}
