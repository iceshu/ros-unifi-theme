/** Validators and helpers for DNS, address lists, WiFi and WireGuard forms. Return an error message or null. */

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function isIPv4(value: string): boolean {
  return IPV4.test(value.trim());
}

export function isIPv6(value: string): boolean {
  const text = value.trim();
  return text.includes(":") && /^[0-9a-f:.]+$/i.test(text) && text.split("::").length <= 2;
}

export function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

export function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}

/** Comma-separated upstream DNS servers (IPv4 or IPv6). Empty is allowed (use dynamic servers). */
export function validateDnsServers(value: string): string | null {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const bad = parts.find((part) => !isIPv4(part) && !isIPv6(part));
  return bad ? `无效的地址：${bad}` : null;
}

/** Address-list entry: IPv4, CIDR, range a.b.c.d-e.f.g.h, or a DNS name (RouterOS resolves it). */
export function validateListAddress(value: string): string | null {
  const text = value.trim();
  if (!text) return "请输入地址";
  if (isIPv4(text)) return null;
  const cidr = text.match(/^(.+)\/(\d{1,2})$/);
  if (cidr) return isIPv4(cidr[1]) && Number(cidr[2]) <= 32 ? null : "无效的网段";
  const range = text.match(/^(.+)-(.+)$/);
  if (range && isIPv4(range[1]) && isIPv4(range[2])) {
    return ipv4ToInt(range[1]) <= ipv4ToInt(range[2]) ? null : "范围起点应不大于终点";
  }
  if (/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i.test(text)) return null;
  return "请输入 IP、网段（/24）、范围（a-b）或域名";
}

/** RouterOS durations: 30s, 10m, 2h, 1d, 1w2d, or 1d 02:00:00. Empty = permanent. */
export function validateDuration(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (/^(\d+w)?(\d+d)?(\d+h)?(\d+m)?(\d+s)?$/.test(text) && /\d/.test(text)) return null;
  if (/^(\d+d\s*)?\d{1,2}:\d{2}:\d{2}$/.test(text)) return null;
  return "格式如 30m、2h、1d 或 1w2d";
}

export function validateHostname(value: string): string | null {
  const text = value.trim();
  if (!text) return "请输入域名";
  return /^(?=.{1,253}$)([a-z0-9_-]{1,63}\.)*[a-z0-9_-]{1,63}\.?$/i.test(text) ? null : "无效的域名";
}

/** WireGuard keys are 32 bytes in base64: 43 characters plus "=". */
export function validateWgKey(value: string): string | null {
  return /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(value.trim()) ? null : "公钥应为 44 位 Base64（以 = 结尾）";
}

/** allowed-address list: comma-separated IPv4/IPv6 CIDRs. */
export function validateAllowedAddress(value: string): string | null {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return "至少填写一个地址，例如 10.8.0.2/32";
  for (const part of parts) {
    const [ip, prefix] = part.split("/");
    const okIp = isIPv4(ip) || isIPv6(ip);
    const max = isIPv4(ip) ? 32 : 128;
    if (!okIp || (prefix !== undefined && !(/^\d+$/.test(prefix) && Number(prefix) <= max))) return `无效的地址：${part}`;
  }
  return null;
}

export function validatePort(value: string, required = false): string | null {
  const text = value.trim();
  if (!text) return required ? "请输入端口" : null;
  const port = Number(text);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? null : "端口应在 1–65535 之间";
}

/**
 * First free host address in the interface subnet (e.g. "10.8.0.1/24" → "10.8.0.2"),
 * skipping the router's own address and any address used by existing peers.
 */
export function nextFreeAddress(interfaceCidr: string, used: string[]): string | null {
  const [ip, prefixText] = interfaceCidr.split("/");
  const prefix = Number(prefixText ?? 32);
  if (!isIPv4(ip) || !Number.isInteger(prefix) || prefix < 8 || prefix > 30) return null;
  const size = 2 ** (32 - prefix);
  const network = Math.floor(ipv4ToInt(ip) / size) * size;
  const taken = new Set<number>([ipv4ToInt(ip)]);
  for (const entry of used) {
    for (const part of entry.split(",")) {
      const host = part.trim().split("/")[0];
      if (isIPv4(host)) taken.add(ipv4ToInt(host));
    }
  }
  for (let candidate = network + 1; candidate < network + size - 1; candidate += 1) {
    if (!taken.has(candidate)) return intToIpv4(candidate);
  }
  return null;
}
