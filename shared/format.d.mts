export function parseDurationSeconds(raw: string | null | undefined): number | null;
export function formatSeconds(total: number): string;
export function formatUptime(raw: string | null | undefined): string;
export function formatLastSeen(raw: string | null | undefined): string;
export function formatBytes(value: number | string | null | undefined): string;
export function formatBps(
  value: number | string | null | undefined,
): { value: string; unit: string } | null;
