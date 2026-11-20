import { deviceProfile, flag, leaseIdentity, type DeviceKind, type RosRecord } from "./model";

export interface TopoClient {
  key: string;
  title: string;
  subtitle: string;
  ip: string;
  mac: string;
  online: boolean;
  port: string;
  kind: DeviceKind;
}

/** Two seconds at 1 Mbps, 0.4 seconds at 100 Mbps; bounded for tiny/burst rates. */
export function flowDuration(bps: number | undefined): number {
  if (!bps || !Number.isFinite(bps) || bps <= 0) return 2;
  return Math.max(0.25, Math.min(3, 2 * Math.pow(bps / 1_000_000, -Math.log10(5) / 2)));
}

/** Match RouterOS route interface tokens, not substrings (ether1 must not match ether10). */
export function routeUsesInterface(route: RosRecord, name: string): boolean {
  if (!name) return false;
  return [route.interface, route.gateway, route["immediate-gw"]].some((value) =>
    (value || "").split(/[,%\s]+/).includes(name),
  );
}

const ONLINE_ARP = new Set(["reachable", "stale", "delay", "permanent", "probe"]);

export function sameMac(left: string | undefined, right: string | undefined): boolean {
  const a = (left || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  const b = (right || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
  return a.length > 0 && a === b;
}

export function learnedPort(mac: string, hosts: RosRecord[], bridgeNames: Set<string>): string {
  const row = hosts.find((host) => sameMac(host["mac-address"], mac) && !flag(host.local));
  const port = row?.["on-interface"] || "";
  if (!port || bridgeNames.has(port)) return "";
  return port;
}

export function clientOnline(lease: RosRecord | undefined, arp: RosRecord | undefined): boolean {
  if (lease?.status === "bound") return arp?.status !== "failed";
  return ONLINE_ARP.has(arp?.status || "");
}

export function collectClients(
  leases: RosRecord[],
  arp: RosRecord[],
  hosts: RosRecord[],
  bridgeNames: Set<string>,
): TopoClient[] {
  const nodes: TopoClient[] = [];
  const seen = new Set<string>();
  for (const lease of leases) {
    const mac = lease["mac-address"] || "";
    const arpRow = arp.find((row) => sameMac(row["mac-address"], mac) || (lease.address && row.address === lease.address));
    const identity = leaseIdentity(lease);
    const key = mac || lease.address || lease[".id"] || identity.title;
    seen.add(mac.toLowerCase());
    nodes.push({
      key,
      title: identity.title,
      subtitle: identity.subtitle,
      ip: lease.address || arpRow?.address || "",
      mac,
      online: clientOnline(lease, arpRow),
      port: learnedPort(mac, hosts, bridgeNames),
      kind: identity.kind,
    });
  }
  for (const row of arp) {
    const mac = row["mac-address"] || "";
    if (!mac || seen.has(mac.toLowerCase())) continue;
    const profile = deviceProfile("", "", mac);
    nodes.push({
      key: mac,
      title: row.address || profile.vendor || "未知",
      subtitle: profile.vendor && row.address ? profile.vendor : "",
      ip: row.address || "",
      mac,
      online: clientOnline(undefined, row),
      port: learnedPort(mac, hosts, bridgeNames),
      kind: profile.kind,
    });
  }
  return nodes;
}
