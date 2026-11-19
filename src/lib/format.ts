export {
  formatBps,
  formatBytes,
  formatLastSeen,
  formatUptime,
  parseDurationSeconds,
} from "../../shared/format.mjs";

export function formatAgo(from: number | null, now: number): string {
  if (from == null) return "尚未更新";
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时前`;
}
