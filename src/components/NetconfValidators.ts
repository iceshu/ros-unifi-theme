/** Validators for netconf forms. Return error message string or null. */

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** IPv4 CIDR: "192.168.1.0/24" or "10.0.0.1/32". */
export function validateCidr(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "地址不能为空";
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0) return "格式应为 IP/前缀，例如 192.168.1.1/24";
  const ip = trimmed.slice(0, slash);
  const prefix = trimmed.slice(slash + 1);
  if (!IPV4.test(ip)) return "IP 地址格式不正确";
  const n = Number(prefix);
  if (!Number.isInteger(n) || n < 0 || n > 32) return "前缀长度应为 0–32";
  return null;
}

/** IPv4 address or RouterOS interface name (for gateway field). */
export function validateGateway(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "网关不能为空";
  if (IPV4.test(trimmed)) return null;
  if (/^[A-Za-z0-9][-A-Za-z0-9_./:]*$/.test(trimmed)) return null;
  return "应填写 IP 地址（如 192.168.1.1）或接口名称";
}

/** VLAN ID: integer 1–4094. */
export function validateVlanId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "VLAN ID 不能为空";
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 4094) return "VLAN ID 应为 1–4094 之间的整数";
  return null;
}

/** RouterOS interface or bridge name: letters, digits, hyphens, underscores, dots. */
export function validateIfaceName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "名称不能为空";
  if (/^[A-Za-z0-9][-A-Za-z0-9_.]*$/.test(trimmed)) return null;
  return "名称只能包含字母、数字、连字符、下划线或点";
}

/** Distance: integer 1–255. Empty = use router default. */
export function validateDistance(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 1 || n > 255) return "距离应为 1–255 之间的整数";
  return null;
}

/** MTU: integer 576–9200. Empty = use default. */
export function validateMtu(value: string): string | null {
  if (!value.trim()) return null;
  const n = Number(value.trim());
  if (!Number.isInteger(n) || n < 576 || n > 9200) return "MTU 应为 576–9200 之间的整数";
  return null;
}
