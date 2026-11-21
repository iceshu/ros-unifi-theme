import { cleanRouterText, displayArch } from "./format";

export type RosRecord = Record<string, string>;
export type Role = "wan" | "lan" | "other";
export type Tone = "good" | "bad" | "warn" | "accent" | "muted";

export function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function flag(value: unknown): boolean {
  return value === true || value === "true" || value === "yes";
}

export function asRecords(data: unknown): RosRecord[] {
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  return list.filter(isObject).map((row) => {
    const out: RosRecord = {};
    for (const [key, value] of Object.entries(row)) {
      if (value == null) continue;
      out[key] = typeof value === "string" ? value : String(value);
    }
    return out;
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseHealth(data: unknown): RosRecord[] {
  if (Array.isArray(data)) return asRecords(data);
  if (!isObject(data)) return [];
  const row = asRecords(data)[0] ?? {};
  if (row.name || row.value) return [row];
  return Object.entries(row)
    .filter(([key]) => key !== ".id")
    .map(([key, value]) => ({
      name: key,
      value,
      type: /temp/i.test(key) ? "C" : "",
    }));
}

const TEMP_ORDER = [
  "cpu-temperature",
  "temperature",
  "board-temperature1",
  "board-temperature",
  "switch-temperature",
];

export function pickTemperature(rows: RosRecord[]): { name: string; value: number; unit: string } | null {
  const sensors = rows.filter((row) => row.name && row.value !== undefined && row.value !== "" && row.type !== "disabled");
  for (const name of TEMP_ORDER) {
    const row = sensors.find((item) => item.name === name);
    const value = num(row?.value);
    if (row && value != null) return { name, value, unit: normalizeUnit(row.type) };
  }
  const fallback = sensors.find((row) => /temp/i.test(row.name));
  const value = num(fallback?.value);
  if (fallback && value != null) return { name: fallback.name, value, unit: normalizeUnit(fallback.type) };
  return null;
}

function normalizeUnit(type: string | undefined): string {
  if (!type || type === "C") return "°C";
  return type;
}

export function pickWanName(ifaces: RosRecord[], wanNames: string[]): string | null {
  const byName = new Map(ifaces.map((iface) => [iface.name, iface]));
  const existing = wanNames.filter((name) => byName.has(name));
  const pppoe = existing.find((name) => (byName.get(name)?.type || "").includes("pppoe"));
  if (pppoe) return pppoe;
  if (existing[0]) return existing[0];
  return ifaces.find((iface) => (iface.type || "").includes("pppoe"))?.name ?? null;
}

export function ifaceRole(
  iface: RosRecord,
  wanNames: string[],
  lanNames: string[],
  members: RosRecord[],
  bridgePorts: RosRecord[] = [],
): Role {
  const name = iface.name || "";
  if (wanNames.includes(name)) return "wan";
  if (lanNames.includes(name)) return "lan";
  const listsFor = (ifaceName: string) =>
    members
      .filter((member) => member.interface === ifaceName && !flag(member.disabled))
      .map((member) => (member.list || "").toLowerCase());
  const lists = listsFor(name);
  if (lists.includes("wan")) return "wan";
  if (lists.includes("lan")) return "lan";
  const bridge = bridgePorts.find((port) => port.interface === name && !flag(port.disabled))?.bridge;
  if (bridge) {
    if (wanNames.includes(bridge)) return "wan";
    if (lanNames.includes(bridge)) return "lan";
    const bridgeLists = listsFor(bridge);
    if (bridgeLists.includes("wan")) return "wan";
    if (bridgeLists.includes("lan")) return "lan";
  }
  if ((iface.type || "").includes("pppoe")) return "wan";
  if (iface.type === "bridge") return "lan";
  return "other";
}

export function addressesOn(addresses: RosRecord[], iface: string): string[] {
  return addresses
    .filter((row) => row.interface === iface && !flag(row.disabled) && !flag(row.invalid))
    .map((row) => row.address)
    .filter(Boolean);
}

export function defaultRoute(routes: RosRecord[]): RosRecord | null {
  return (
    routes.find((route) => route["dst-address"] === "0.0.0.0/0" && flag(route.active) && !flag(route.disabled)) ??
    routes.find((route) => route["dst-address"] === "0.0.0.0/0" && !flag(route.disabled)) ??
    null
  );
}

export function ipSortKey(ip: string | undefined): number {
  if (!ip) return Number.MAX_SAFE_INTEGER;
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return parts[0] * 256 ** 3 + parts[1] * 256 ** 2 + parts[2] * 256 + parts[3];
}

export function compareName(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

const TYPE_LABELS: Record<string, string> = {
  ether: "以太网",
  bridge: "桥",
  vlan: "VLAN",
  "pppoe-out": "PPPoE",
  "pppoe-in": "PPPoE 服务",
  wg: "WireGuard",
  lo: "环回",
  lte: "LTE",
  wifi: "无线",
  wlan: "无线",
  veth: "虚拟以太网",
  eoip: "EoIP",
  gre: "GRE",
  "ovpn-out": "OpenVPN",
  "sstp-out": "SSTP",
  "l2tp-out": "L2TP",
  bond: "绑定",
};

export function typeLabel(type: string | undefined): string {
  if (!type) return "未知";
  return TYPE_LABELS[type] ?? type;
}

export function roleLabel(role: Role): string {
  if (role === "wan") return "广域网";
  if (role === "lan") return "局域网";
  return "其他";
}

export function linkState(row: RosRecord | undefined): { label: string; tone: Tone } {
  if (!row) return { label: "未知", tone: "muted" };
  if (flag(row.disabled)) return { label: "已禁用", tone: "muted" };
  if (flag(row.running)) return { label: "运行中", tone: "good" };
  return { label: "未连接", tone: "bad" };
}

const ACTIONS: Record<string, string> = {
  accept: "放行",
  drop: "丢弃",
  reject: "拒绝",
  jump: "跳转",
  log: "记录",
  passthrough: "穿过",
  "fasttrack-connection": "快速跟踪",
  tarpit: "粘滞",
  "add-src-to-address-list": "加入源列表",
  "add-dst-to-address-list": "加入目的列表",
  return: "返回",
};

export function actionLabel(action: string | undefined): string {
  if (!action) return "—";
  return ACTIONS[action] ?? action;
}

export function actionTone(action: string | undefined): Tone {
  if (action === "accept" || action === "fasttrack-connection") return "good";
  if (action === "drop" || action === "reject" || action === "tarpit") return "bad";
  if (action === "jump" || action === "log") return "accent";
  return "muted";
}

const CHAINS: Record<string, string> = {
  input: "入站",
  forward: "转发",
  output: "出站",
};

export function chainLabel(chain: string | undefined): string {
  if (!chain) return "—";
  const friendly = CHAINS[chain];
  return friendly ? `${chain} · ${friendly}` : chain;
}

const MATCH_FIELDS: Array<[string, string]> = [
  ["connection-state", "连接状态"],
  ["connection-nat-state", "NAT"],
  ["protocol", "协议"],
  ["src-address", "源地址"],
  ["dst-address", "目的地址"],
  ["src-address-list", "源地址列表"],
  ["dst-address-list", "目的地址列表"],
  ["src-port", "源端口"],
  ["dst-port", "目的端口"],
  ["in-interface", "入接口"],
  ["out-interface", "出接口"],
  ["in-interface-list", "入接口列表"],
  ["out-interface-list", "出接口列表"],
  ["src-mac-address", "源 MAC"],
  ["tcp-flags", "TCP 标志"],
  ["icmp-options", "ICMP"],
  ["limit", "限制"],
  ["content", "内容"],
  ["layer7-protocol", "L7"],
  ["ipsec-policy", "IPsec"],
  ["packet-mark", "包标记"],
  ["connection-mark", "连接标记"],
  ["routing-mark", "路由标记"],
  ["dscp", "DSCP"],
  ["ttl", "TTL"],
  ["hw-offload", "硬件卸载"],
];

export function firewallMatchers(rule: RosRecord): string[] {
  const parts: string[] = [];
  for (const [key, label] of MATCH_FIELDS) {
    const value = rule[key];
    if (!value) continue;
    parts.push(key === "protocol" || key === "hw-offload" ? `${label} ${value}` : `${label} ${value}`);
  }
  if (rule["jump-target"]) parts.push(`跳到 ${rule["jump-target"]}`);
  return parts;
}

const DHCP_STATUS: Record<string, string> = {
  bound: "已绑定",
  waiting: "等待",
  offered: "提供中",
};

export function dhcpStatusLabel(status: string | undefined): string {
  if (!status) return "未知";
  return DHCP_STATUS[status] ?? status;
}

export function dhcpStatusTone(status: string | undefined): Tone {
  if (status === "bound") return "good";
  if (status === "waiting") return "muted";
  return "warn";
}

const ARP_STATUS: Record<string, string> = {
  reachable: "可达",
  stale: "陈旧",
  delay: "延迟",
  probe: "探测",
  failed: "失败",
  incomplete: "不完整",
  permanent: "静态",
  noarp: "无 ARP",
};

export function arpStatusLabel(status: string | undefined): string {
  if (!status) return "无记录";
  return ARP_STATUS[status] ?? status;
}

export function arpStatusTone(status: string | undefined): Tone {
  if (status === "reachable" || status === "permanent") return "good";
  if (status === "failed" || status === "incomplete") return "bad";
  if (!status) return "muted";
  return "warn";
}

export function handshakeTone(raw: string | undefined): Tone {
  if (!raw) return "muted";
  const match = raw.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return "muted";
  const weeks = Number(match[1] || 0);
  const days = Number(match[2] || 0);
  const hours = Number(match[3] || 0);
  const minutes = Number(match[4] || 0);
  const seconds = Number(match[5] || 0);
  if (!weeks && !days && !hours && !minutes && !seconds && raw !== "0s") return "muted";
  const total = (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds;
  if (total < 180) return "good";
  if (total < 3600) return "warn";
  return "bad";
}

export function shortKey(value: string | undefined): string {
  if (!value) return "—";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function memoryUsage(resource: RosRecord | null): { used: number; total: number; percent: number } | null {
  if (!resource) return null;
  const total = num(resource["total-memory"]);
  const free = num(resource["free-memory"]);
  if (total == null || free == null || total <= 0) return null;
  const used = Math.max(0, total - free);
  return { used, total, percent: (used / total) * 100 };
}

export function diskUsage(resource: RosRecord | null): { used: number; total: number; percent: number } | null {
  if (!resource) return null;
  const total = num(resource["total-hdd-space"]);
  const free = num(resource["free-hdd-space"]);
  if (total == null || free == null || total <= 0) return null;
  const used = Math.max(0, total - free);
  return { used, total, percent: (used / total) * 100 };
}

export function cleanCpu(value: string | undefined): string {
  if (!value) return "";
  return value.replace(/\(R\)|\(TM\)/gi, "").replace(/\s+/g, " ").trim();
}

export function hardwareLabel(resource: RosRecord | null, routerboard: RosRecord | null): string {
  const model = cleanRouterText(routerboard?.model) || cleanRouterText(resource?.["board-name"]);
  const arch = displayArch(resource?.["architecture-name"]);
  if (model && !/^x86$/i.test(model)) return model;
  return arch || model;
}

export type DeviceKind =
  | "phone"
  | "laptop"
  | "server"
  | "nas"
  | "ap"
  | "camera"
  | "tv"
  | "console"
  | "speaker"
  | "printer"
  | "generic";

const DEVICE_RULES: Array<[RegExp, DeviceKind]> = [
  [/camera|webcam|摄像|chuangmi|imou|hikvision|ipc/i, "camera"],
  [/nas|ds\d|synology|qnap|群晖/i, "nas"],
  [/\bap\b|tplink|tp-link|omada|unifi|无线/i, "ap"],
  [/ps[345]|playstation|xbox|switch/i, "console"],
  [/电视|\btv\b|bravia/i, "tv"],
  [/print|打印/i, "printer"],
  [/iphone|ipad|phone|huawei|pixel|android|手机|xiaomi/i, "phone"],
  [/genie|echo|音箱|homepod|speaker/i, "speaker"],
  [/pve|proxmox|esxi|server|ubuntu|debian|vmware|truenas/i, "server"],
  [/macbook|laptop|thinkpad|notebook|笔记本/i, "laptop"],
];

const OUI: Record<string, { kind: DeviceKind; vendor: string }> = {
  "001132": { kind: "nas", vendor: "群晖" },
  "78605b": { kind: "ap", vendor: "TP-Link" },
  "50c7bf": { kind: "ap", vendor: "TP-Link" },
  "14cc20": { kind: "ap", vendor: "TP-Link" },
  "c006c3": { kind: "ap", vendor: "TP-Link" },
  "640980": { kind: "generic", vendor: "小米" },
  "286c07": { kind: "generic", vendor: "小米" },
  "9c99a0": { kind: "generic", vendor: "小米" },
  "7811dc": { kind: "generic", vendor: "小米" },
  "34ce00": { kind: "generic", vendor: "小米" },
  "b88880": { kind: "generic", vendor: "小米" },
  "00e0fc": { kind: "phone", vendor: "华为" },
  "4846fb": { kind: "phone", vendor: "华为" },
  "04f938": { kind: "phone", vendor: "华为" },
  "240ac4": { kind: "generic", vendor: "乐鑫" },
  "30aea4": { kind: "generic", vendor: "乐鑫" },
};

function macOui(mac: string): { kind: DeviceKind; vendor: string } | null {
  const hex = mac.replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length < 6) return null;
  const first = Number.parseInt(hex.slice(0, 2), 16);
  if (Number.isNaN(first) || (first & 0x02) === 0x02) return null;
  return OUI[hex.slice(0, 6)] ?? null;
}

export function deviceProfile(host: string, comment: string, mac: string): { kind: DeviceKind; vendor: string } {
  const text = `${host} ${comment}`;
  const oui = macOui(mac);
  for (const [pattern, kind] of DEVICE_RULES) {
    if (pattern.test(text)) return { kind, vendor: oui?.vendor ?? "" };
  }
  return oui ?? { kind: "generic", vendor: "" };
}

export function leaseIdentity(lease: RosRecord): { title: string; subtitle: string; kind: DeviceKind } {
  const host = (lease["host-name"] || "").trim();
  const comment = (lease.comment || "").trim();
  const profile = deviceProfile(host, comment, lease["mac-address"] || "");
  // Like UniFi aliases: a name set by the user (lease comment) wins over the DHCP host name.
  if (host && comment && host.toLowerCase() !== comment.toLowerCase()) {
    return { title: comment, subtitle: host, kind: profile.kind };
  }
  if (host) return { title: host, subtitle: profile.vendor, kind: profile.kind };
  if (comment) return { title: comment, subtitle: profile.vendor, kind: profile.kind };
  return { title: profile.vendor || "未知", subtitle: "", kind: profile.kind };
}
