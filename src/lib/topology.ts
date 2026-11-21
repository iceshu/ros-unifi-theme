import { deviceProfile, flag, leaseIdentity, type DeviceKind, type RosRecord } from "./model";

export interface TopoClient {
  key: string;
  title: string;
  subtitle: string;
  vendor: string;
  ip: string;
  mac: string;
  online: boolean;
  /** Learned access port (bridge host table) or the WiFi interface. Empty when unknown. */
  port: string;
  kind: DeviceKind;
  wireless: boolean;
  ssid: string;
  signal: string;
  lease: RosRecord | undefined;
  arp: RosRecord | undefined;
}

/** Two seconds at 1 Mbps, 0.4 seconds at 100 Mbps; bounded for tiny/burst rates. */
export function flowDuration(bps: number | undefined): number {
  if (!bps || !Number.isFinite(bps) || bps <= 0) return 2;
  return Math.max(0.25, Math.min(3, 2 * Math.pow(bps / 1_000_000, -Math.log10(5) / 2)));
}

/** Stroke width for a flow lane: 1.5px idle up to 5px at ~1 Gbps, log scaled. */
export function flowWidth(bps: number | undefined): number {
  if (!bps || !Number.isFinite(bps) || bps <= 1000) return 1.5;
  return Math.max(1.5, Math.min(5, 1.5 + (Math.log10(bps) - 3) * 0.6));
}

/** Match RouterOS route interface tokens, not substrings (ether1 must not match ether10). */
export function routeUsesInterface(route: RosRecord, name: string): boolean {
  if (!name) return false;
  return [route.interface, route.gateway, route["immediate-gw"]].some((value) =>
    (value || "").split(/[,%\s]+/).includes(name),
  );
}

const ONLINE_ARP = new Set(["reachable", "stale", "delay", "permanent", "probe"]);

export function macKey(value: string | undefined): string {
  return (value || "").replace(/[^0-9a-f]/gi, "").toLowerCase();
}

export function sameMac(left: string | undefined, right: string | undefined): boolean {
  const a = macKey(left);
  return a.length > 0 && a === macKey(right);
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

function signalText(row: RosRecord | undefined): string {
  const value = row?.["signal-strength"] || row?.signal || "";
  return value && /^-?\d+$/.test(value) ? `${value} dBm` : value;
}

export function collectClients(
  leases: RosRecord[],
  arp: RosRecord[],
  hosts: RosRecord[],
  bridgeNames: Set<string>,
  wifi: RosRecord[] = [],
  ssidFor: (iface: string) => string = () => "",
): TopoClient[] {
  const nodes: TopoClient[] = [];
  const seen = new Set<string>();
  const arpByMac = new Map(arp.map((row) => [macKey(row["mac-address"]), row]));
  const wifiByMac = new Map(wifi.map((row) => [macKey(row["mac-address"]), row]));
  const place = (mac: string) => {
    const radio = wifiByMac.get(macKey(mac));
    if (radio) return { port: radio.interface || "", wireless: true, ssid: ssidFor(radio.interface || ""), signal: signalText(radio) };
    return { port: learnedPort(mac, hosts, bridgeNames), wireless: false, ssid: "", signal: "" };
  };
  for (const lease of leases) {
    const mac = lease["mac-address"] || "";
    const arpRow = arpByMac.get(macKey(mac)) ?? arp.find((row) => !!lease.address && row.address === lease.address);
    const identity = leaseIdentity(lease);
    const vendor = deviceProfile("", "", mac).vendor;
    seen.add(macKey(mac));
    nodes.push({
      key: macKey(mac) || lease.address || lease[".id"] || identity.title,
      title: identity.title,
      subtitle: identity.subtitle,
      vendor,
      ip: lease.address || arpRow?.address || "",
      mac,
      online: clientOnline(lease, arpRow) || wifiByMac.has(macKey(mac)),
      kind: identity.kind,
      lease,
      arp: arpRow,
      ...place(mac),
    });
  }
  for (const row of arp) {
    const mac = row["mac-address"] || "";
    if (!mac || seen.has(macKey(mac))) continue;
    seen.add(macKey(mac));
    const profile = deviceProfile("", "", mac);
    nodes.push({
      key: macKey(mac),
      title: row.comment || row.address || profile.vendor || "未知设备",
      subtitle: profile.vendor && row.address ? profile.vendor : "",
      vendor: profile.vendor,
      ip: row.address || "",
      mac,
      online: clientOnline(undefined, row) || wifiByMac.has(macKey(mac)),
      kind: profile.kind,
      lease: undefined,
      arp: row,
      ...place(mac),
    });
  }
  for (const radio of wifi) {
    const mac = radio["mac-address"] || "";
    if (!mac || seen.has(macKey(mac))) continue;
    seen.add(macKey(mac));
    const profile = deviceProfile("", "", mac);
    nodes.push({
      key: macKey(mac),
      title: radio.comment || profile.vendor || mac,
      subtitle: "无线客户端",
      vendor: profile.vendor,
      ip: "",
      mac,
      online: true,
      kind: profile.kind === "generic" ? "phone" : profile.kind,
      lease: undefined,
      arp: undefined,
      ...place(mac),
    });
  }
  return nodes;
}
