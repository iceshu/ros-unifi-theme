import { ros } from "./api";
import type { RosRecord } from "./model";

/** Returns an error message if value is not a valid IPv4 or CIDR, or null if valid/empty. */
export function validateCIDR(value: string): string | null {
  if (!value.trim()) return null;
  const slash = value.indexOf("/");
  const ip = slash >= 0 ? value.slice(0, slash) : value;
  const parts = ip.split(".");
  if (parts.length !== 4) return "无效的 IPv4 地址";
  for (const p of parts) {
    if (!/^\d+$/.test(p) || Number(p) > 255) return "无效的 IPv4 地址";
  }
  if (slash >= 0) {
    const prefix = value.slice(slash + 1);
    if (!/^\d+$/.test(prefix) || Number(prefix) > 32) return "前缀长度应在 0–32 之间";
  }
  return null;
}

/** Validates "80", "80,443", "8000-8100" or any comma-separated combination. */
export function validatePortList(value: string): string | null {
  if (!value.trim()) return null;
  for (const part of value.split(",")) {
    const range = part.trim().split("-");
    if (range.length > 2) return "端口格式：如 80 或 8000-8100";
    for (const p of range) {
      const n = Number(p.trim());
      if (!Number.isInteger(n) || n < 1 || n > 65535) return "端口应在 1–65535 之间";
    }
    if (range.length === 2 && Number(range[0].trim()) >= Number(range[1].trim())) {
      return "范围起始应小于终止";
    }
  }
  return null;
}

/** Build a create payload, omitting empty optional fields. */
export function buildCreatePayload(fields: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== "") result[key] = value;
  }
  return result;
}

/** Build an update payload with only changed fields; sends "" to clear emptied fields. */
export function buildEditPayload(original: RosRecord, current: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(current)) {
    if (value !== (original[key] ?? "")) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Move a rule one step within the full RouterOS list (order matters across chains).
 * RouterOS `move` places `.id` before `destination`, so "down" moves the next rule above this one.
 */
export function moveRule(menu: string, rows: RosRecord[], id: string, direction: "up" | "down"): (() => Promise<unknown>) | null {
  const index = rows.findIndex((row) => row[".id"] === id);
  if (index < 0) return null;
  if (direction === "up") {
    const previous = rows[index - 1];
    return previous ? () => ros.command(menu, "move", { ".id": id, destination: previous[".id"] }) : null;
  }
  const next = rows[index + 1];
  return next ? () => ros.command(menu, "move", { ".id": next[".id"], destination: id }) : null;
}

/** Short human summary of a rule's matchers for tables ("TCP 443 · 来自 WAN"). */
export function describePorts(rule: RosRecord): string {
  const proto = rule.protocol ? rule.protocol.toUpperCase() : "";
  const port = rule["dst-port"] || "";
  return [proto, port].filter(Boolean).join(" ") || "全部";
}
