/** RouterOS durations: 2d20h12m20s, 1w2d3h4m5s, or 2w3d04:23:15. */

export function parseDurationSeconds(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text.toLowerCase() === "never") return null;

  const clock = text.match(/^(?:(\d+)w)?(?:(\d+)d)?(\d+):(\d{2}):(\d{2})$/);
  if (clock) {
    const weeks = Number(clock[1] || 0);
    const days = Number(clock[2] || 0);
    const hours = Number(clock[3] || 0);
    const minutes = Number(clock[4] || 0);
    const seconds = Number(clock[5] || 0);
    return (((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds;
  }

  const unit = text.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!unit) return null;
  const weeks = unit[1];
  const days = unit[2];
  const hours = unit[3];
  const minutes = unit[4];
  const seconds = unit[5];
  if (!weeks && !days && !hours && !minutes && !seconds) return null;
  return (
    (((Number(weeks || 0) * 7 + Number(days || 0)) * 24 + Number(hours || 0)) * 60 +
      Number(minutes || 0)) *
      60 +
    Number(seconds || 0)
  );
}

export function formatSeconds(total) {
  if (!Number.isFinite(total)) return "—";
  let rest = Math.max(0, Math.floor(total));
  const weeks = Math.floor(rest / 604800);
  rest %= 604800;
  const days = Math.floor(rest / 86400);
  rest %= 86400;
  const hours = Math.floor(rest / 3600);
  rest %= 3600;
  const minutes = Math.floor(rest / 60);
  const seconds = rest % 60;
  const parts = [];
  if (weeks) parts.push(`${weeks} 周`);
  if (days) parts.push(`${days} 天`);
  if (hours) parts.push(`${hours} 小时`);
  if (minutes) parts.push(`${minutes} 分`);
  if (seconds || parts.length === 0) parts.push(`${seconds} 秒`);
  return parts.slice(0, 3).join(" ");
}

export function formatUptime(raw) {
  if (raw == null || String(raw).trim() === "") return "—";
  const seconds = parseDurationSeconds(raw);
  if (seconds == null) return String(raw);
  return formatSeconds(seconds);
}

export function formatLastSeen(raw) {
  if (raw == null || String(raw).trim() === "" || String(raw).toLowerCase() === "never") {
    return "从未";
  }
  const seconds = parseDurationSeconds(raw);
  if (seconds == null) return String(raw);
  return `${formatSeconds(seconds)}前`;
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  let v = n;
  let i = 0;
  while (v >= 1024 && i < BYTE_UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(digits)} ${BYTE_UNITS[i]}`;
}

const RATE_UNITS = ["bps", "Kbps", "Mbps", "Gbps"];

export function cleanRouterText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/default\s*string/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function displayArch(value) {
  const text = cleanRouterText(value);
  if (/x86/i.test(text)) return "x86";
  return text;
}

export function formatBps(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  let v = n;
  let i = 0;
  while (v >= 1000 && i < RATE_UNITS.length - 1) {
    v /= 1000;
    i += 1;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return { value: v.toFixed(digits), unit: RATE_UNITS[i] };
}
