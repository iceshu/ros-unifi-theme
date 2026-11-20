/**
 * Declarative allowlist of RouterOS changes the dashboard can make.
 *
 * REST mapping (RouterOS 7): PUT <menu> = add, PATCH <menu>/<id> = set,
 * DELETE <menu>/<id> = remove, POST <menu>/<command> = run a command.
 * Anything not listed here is refused before it reaches the router; the
 * router still enforces the logged-in account's own policies on top.
 */

const COMMON = ["comment", "disabled"];
const MATCH = [
  "chain",
  "action",
  "protocol",
  "src-address",
  "dst-address",
  "src-port",
  "dst-port",
  "port",
  "in-interface",
  "out-interface",
  "in-interface-list",
  "out-interface-list",
  "src-address-list",
  "dst-address-list",
  "connection-state",
  "connection-nat-state",
  "jump-target",
  "reject-with",
  "log",
  "log-prefix",
];
const MOVE = [".id", "destination"];

/** @type {Record<string, { create?: string[]; update?: string[]; remove?: boolean; commands?: Record<string, string[]>; policy?: string }>} */
export const WRITE_MENUS = {
  "/rest/ip/firewall/filter": {
    create: [...MATCH, ...COMMON, "place-before"],
    update: [...MATCH, ...COMMON],
    remove: true,
    commands: { move: MOVE },
  },
  "/rest/ip/firewall/nat": {
    create: [...MATCH, "to-addresses", "to-ports", ...COMMON, "place-before"],
    update: [...MATCH, "to-addresses", "to-ports", ...COMMON],
    remove: true,
    commands: { move: MOVE },
  },
  "/rest/ip/firewall/address-list": {
    create: ["list", "address", "timeout", ...COMMON],
    update: ["list", "address", "timeout", ...COMMON],
    remove: true,
  },
  "/rest/ip/dhcp-server/lease": {
    create: ["address", "mac-address", "server", "client-id", "lease-time", "block-access", ...COMMON],
    update: ["address", "mac-address", "server", "client-id", "lease-time", "block-access", ...COMMON],
    remove: true,
    commands: { "make-static": [".id"] },
  },
  "/rest/ip/dns": {
    commands: { set: ["servers", "allow-remote-requests", "cache-size"] },
  },
  "/rest/ip/dns/static": {
    create: ["name", "address", "type", "cname", "ttl", "regexp", "match-subdomain", ...COMMON],
    update: ["name", "address", "type", "cname", "ttl", "regexp", "match-subdomain", ...COMMON],
    remove: true,
  },
  "/rest/queue/simple": {
    create: ["name", "target", "max-limit", "limit-at", "priority", ...COMMON, "place-before"],
    update: ["name", "target", "max-limit", "limit-at", "priority", ...COMMON],
    remove: true,
  },
  "/rest/interface": {
    update: COMMON,
  },
  "/rest/interface/wifi": {
    update: ["configuration.ssid", "security.passphrase", "security.authentication-types", ...COMMON],
  },
  "/rest/interface/wifi/configuration": {
    update: ["ssid", "comment"],
  },
  "/rest/interface/wifi/security": {
    update: ["passphrase", "authentication-types", "comment"],
  },
  "/rest/interface/wireless": {
    update: ["ssid", ...COMMON],
  },
  "/rest/interface/wireless/security-profiles": {
    update: ["wpa2-pre-shared-key", "wpa-pre-shared-key", "authentication-types", "mode"],
  },
  "/rest/interface/wireguard/peers": {
    create: ["interface", "name", "public-key", "preshared-key", "allowed-address", "endpoint-address", "endpoint-port", "persistent-keepalive", ...COMMON],
    update: ["name", "public-key", "preshared-key", "allowed-address", "endpoint-address", "endpoint-port", "persistent-keepalive", ...COMMON],
    remove: true,
  },
  "/rest/system/identity": {
    commands: { set: ["name"] },
  },
  "/rest/system": {
    commands: { reboot: [] },
    policy: "reboot",
  },
};

const ID = /^\*[0-9A-Fa-f]{1,8}$/;
const ID_FIELDS = new Set([".id", "destination", "place-before"]);
const MAX_VALUE = 4096;

function fail(status, code, message) {
  return { ok: false, status, code, message };
}

/**
 * @param {string} method PUT | PATCH | DELETE | POST
 * @param {string} pathname normalized /rest/... path (no query)
 * @param {unknown} body parsed JSON body (ignored for DELETE)
 * @param {typeof WRITE_MENUS} [menus] allowlist (core menus plus feature additions)
 * @returns {{ ok: true; policy: string; body: string | undefined; menu: string; op: string } | { ok: false; status: number; code: string; message: string }}
 */
export function validateWrite(method, pathname, body, menus = WRITE_MENUS) {
  let menu = "";
  let op = "";
  let allowed = [];
  if (method === "PUT") {
    menu = pathname;
    op = "create";
    allowed = menus[menu]?.create ?? null;
  } else if (method === "PATCH" || method === "DELETE") {
    const slash = pathname.lastIndexOf("/");
    const id = pathname.slice(slash + 1);
    menu = pathname.slice(0, slash);
    if (!ID.test(id)) return fail(403, "forbidden_path", "写操作只能指向带 ID 的记录。");
    op = method === "PATCH" ? "update" : "remove";
    allowed = method === "PATCH" ? menus[menu]?.update ?? null : menus[menu]?.remove ? [] : null;
  } else if (method === "POST") {
    const slash = pathname.lastIndexOf("/");
    menu = pathname.slice(0, slash);
    op = pathname.slice(slash + 1);
    allowed = menus[menu]?.commands?.[op] ?? null;
  } else {
    return fail(405, "method_not_allowed", "不支持这个请求方法。");
  }
  if (!allowed) return fail(403, "forbidden_path", "仪表不允许修改这个菜单。");
  const policy = menus[menu].commandPolicy?.[op] ?? menus[menu].policy ?? "write";
  if (method === "DELETE") return { ok: true, policy, body: undefined, menu, op };

  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "bad_body", "请求体必须是 JSON 对象。");
  const out = {};
  // Script sources and scheduler events are multi-line RouterOS code; everything else is one line.
  const multiline = menus[menu].multiline ?? [];
  const maxValue = menus[menu].maxValue ?? MAX_VALUE;
  for (const [key, raw] of Object.entries(body)) {
    if (!allowed.includes(key)) return fail(400, "bad_field", `不允许修改字段 ${key}。`);
    if (raw !== null && typeof raw === "object") return fail(400, "bad_value", `字段 ${key} 必须是字符串。`);
    const value = raw == null ? "" : String(raw);
    const control = multiline.includes(key) ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x08\x0a-\x1f\x7f]/;
    if (value.length > maxValue || control.test(value)) return fail(400, "bad_value", `字段 ${key} 的值无效。`);
    if (ID_FIELDS.has(key) && value !== "" && !value.split(",").every((part) => ID.test(part))) {
      return fail(400, "bad_value", `字段 ${key} 必须是记录 ID。`);
    }
    out[key] = value;
  }
  if (op === "update" && Object.keys(out).length === 0) return fail(400, "bad_body", "没有要修改的字段。");
  if (allowed.includes(".id") && !out[".id"]) return fail(400, "bad_body", "缺少 .id。");
  return { ok: true, policy, body: JSON.stringify(out), menu, op };
}
