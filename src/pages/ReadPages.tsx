import { useTableKeyboard } from "../components/TableSort";
import { createMemo, createSignal } from "solid-js";
import { AllFields, ReadTable } from "../components/ReadData";
import { EmptyState, PageHeader } from "../components/ui";
import { useDashboard } from "../lib/store";

export function NatPage() {
  const dash = useDashboard();
  return <div><PageHeader title="NAT" /><ReadTable rows={dash.nat()} fields={["chain", "action", "src-address", "dst-address", "to-addresses", "comment", "disabled", "bytes", "packets"]} /></div>;
}
export function AddressListsPage() {
  const dash = useDashboard();
  return <div><PageHeader title="地址列表" /><ReadTable rows={dash.addressLists()} fields={["list", "address", "timeout", "dynamic", "disabled", "comment"]} /></div>;
}
export function DhcpPage() {
  const dash = useDashboard();
  return <div><PageHeader title="DHCP" />
    <ReadTable title="服务器" rows={dash.dhcpServers()} fields={["name", "interface", "address-pool", "lease-time", "disabled"]} />
    <ReadTable title="网络" rows={dash.dhcpNetworks()} fields={["address", "gateway", "dns-server", "comment"]} />
    <ReadTable title="地址池" rows={dash.pools()} fields={["name", "ranges", "next-pool"]} />
  </div>;
}
export function DnsPage() {
  const dash = useDashboard();
  return <div><PageHeader title="DNS" />
    <section class="card mb-4">{dash.dns() ? <AllFields row={dash.dns()!} /> : <EmptyState title="没有 DNS 配置" />}</section>
    <ReadTable title="静态记录" rows={dash.dnsStatic()} fields={["name", "address", "type", "disabled"]} />
  </div>;
}
export function NeighborsPage() {
  const dash = useDashboard();
  return <div><PageHeader title="邻居" /><p class="mb-3 text-xs text-faint">LLDP / CDP / MNDP 发现的邻居</p><ReadTable rows={dash.neighbors()} fields={["interface", "mac-address", "address", "identity", "platform", "version", "interface-name"]} /></div>;
}
export function QueuesPage() {
  const dash = useDashboard();
  return <div><PageHeader title="队列" /><ReadTable rows={dash.queues()} fields={["name", "target", "max-limit", "bytes", "packets", "disabled"]} /></div>;
}
export function WifiPage() {
  const dash = useDashboard();
  return <div><PageHeader title="WiFi" />
    <ReadTable title="接口" rows={dash.wifi()} fields={["name", "running", "disabled", "comment"]} />
    <ReadTable title="配置" rows={dash.wifiConfig()} fields={["name", "ssid", "country", "mode"]} />
    <ReadTable title="已注册客户端" rows={dash.wifiRegistration()} fields={["interface", "mac-address", "signal-strength", "tx-rate", "rx-rate", "uptime"]} />
  </div>;
}
export function LogPage() {
  const dash = useDashboard();
  let search: HTMLInputElement | undefined;
  useTableKeyboard(() => search);
  const [query, setQuery] = createSignal("");
  const rows = createMemo(() => dash.logEntries().slice(-200).filter((row) =>
    [row.time, row.topics, row.message].join(" ").toLowerCase().includes(query().trim().toLowerCase())));
  return <div><PageHeader title="日志" /><p class="mb-2 text-xs text-faint">最近 200 条</p>
    <input ref={search} class="field mb-4" type="search" aria-label="搜索日志" placeholder="搜索日志" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
    <ReadTable rows={rows()} fields={["time", "topics", "message"]} />
  </div>;
}
