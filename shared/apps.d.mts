export const APP_MAP: Map<string, string>;
export const PORT_MAP: Map<number, string>;
export function classifyDomain(host: string | null | undefined): string | null;
export function classifyPort(port: number | null | undefined): string | null;
export function isPrivateIp(addr: string | null | undefined): boolean;
export function buildIpAppMap(cacheEntries: Array<{ name?: string; type?: string; address?: string; data?: string }>): Map<string, string>;
