export function splitEndpoint(value: string | null | undefined): { ip: string; port: string };
export function parseRateBps(value: string | number | null | undefined): number | null;
export function summarizeConnections(
  rows: Array<Record<string, string>>,
  clientIps: string[],
): {
  totals: Record<string, { up: number; down: number }>;
  counts: Record<string, number>;
  peers: Record<string, Array<{ ip: string; bytes: number; count: number }>>;
  reportedRates: Record<string, { txBps: number; rxBps: number }>;
};
export function ratesFromDeltas(
  previous: Record<string, { up: number; down: number }> | null | undefined,
  next: Record<string, { up: number; down: number }>,
  dtSeconds: number,
): Record<string, { txBps: number; rxBps: number }>;
