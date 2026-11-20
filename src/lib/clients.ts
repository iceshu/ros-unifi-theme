import type { RosRecord } from "./model";

/* ───────── IPv4 ───────── */

export function validateIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

export function validateMAC(mac: string): boolean {
  return /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/.test(mac);
}

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** True if ip is within any range of the given pool records (ranges like "192.168.1.100-192.168.1.200"). */
export function isInPool(ip: string, pools: RosRecord[]): boolean {
  if (!validateIPv4(ip)) return false;
  const n = ipToInt(ip);
  for (const pool of pools) {
    for (const segment of (pool.ranges || "").split(",")) {
      const parts = segment.trim().split("-");
      if (parts.length === 2 && validateIPv4(parts[0]) && validateIPv4(parts[1])) {
        if (n >= ipToInt(parts[0]) && n <= ipToInt(parts[1])) return true;
      }
    }
  }
  return false;
}

/** True if ip is inside the CIDR of any DHCP network record (address field like "192.168.1.0/24"). */
export function isInNetwork(ip: string, networks: RosRecord[]): boolean {
  if (!validateIPv4(ip)) return false;
  const n = ipToInt(ip);
  for (const net of networks) {
    const cidr = net.address || "";
    const slash = cidr.indexOf("/");
    if (slash < 0) continue;
    const base = cidr.slice(0, slash);
    const bits = parseInt(cidr.slice(slash + 1), 10);
    if (!validateIPv4(base) || isNaN(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((n & mask) === (ipToInt(base) & mask)) return true;
  }
  return false;
}

/* ───────── Rate parsing/formatting ───────── */

/** Parse a RouterOS rate token (e.g. "10M", "512k", "1G") to bits/s. Returns 0 for "0" or empty. */
function parseRateToken(token: string): number {
  if (!token || token === "0") return 0;
  const m = /^(\d+(?:\.\d+)?)\s*([kKmMgG]?)$/.exec(token.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "k") return Math.round(n * 1_000);
  if (unit === "m") return Math.round(n * 1_000_000);
  if (unit === "g") return Math.round(n * 1_000_000_000);
  return Math.round(n);
}

/**
 * Parse RouterOS max-limit "upload/download" to Mbps.
 * Returns {upload: number, download: number}; 0 means unlimited.
 */
export function parseRosRate(maxLimit: string | undefined): { upload: number; download: number } {
  if (!maxLimit || maxLimit === "0") return { upload: 0, download: 0 };
  const parts = maxLimit.split("/");
  const up = parseRateToken(parts[0] ?? "");
  const down = parseRateToken(parts[1] ?? (parts[0] ?? ""));
  return { upload: up / 1_000_000, download: down / 1_000_000 };
}

/**
 * Format Mbps numbers to RouterOS max-limit "upload/download" string.
 * 0 means unlimited; produces "0" when both are 0.
 */
export function formatRosRate(uploadMbps: number, downloadMbps: number): string {
  if (!uploadMbps && !downloadMbps) return "0";
  const up = uploadMbps ? `${uploadMbps}M` : "0";
  const down = downloadMbps ? `${downloadMbps}M` : "0";
  return `${up}/${down}`;
}

/** Render a RouterOS max-limit as "上传X / 下载Y Mbps" or "不限". */
export function humanRate(maxLimit: string | undefined): string {
  const { upload, download } = parseRosRate(maxLimit);
  if (!upload && !download) return "不限";
  const parts: string[] = [];
  if (upload) parts.push(`↑${upload} Mbps`);
  if (download) parts.push(`↓${download} Mbps`);
  return parts.join("  ");
}
