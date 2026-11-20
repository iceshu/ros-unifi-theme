import { createMemo, createSignal } from "solid-js";
import { AllFields, ReadTable } from "../components/ReadData";
import { useTableKeyboard } from "../components/TableSort";
import { Card, EmptyState, PageHeader } from "../components/ui";
import { useDashboard } from "../lib/store";

export function NatPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="NAT" subtitle="源地址转换与端口转发规则，按 RouterOS 中的顺序" />
      <ReadTable title="规则" rows={dash.nat()} fields={["chain", "action", "protocol", "src-address", "dst-address", "dst-port", "to-addresses", "to-ports", "comment", "disabled", "bytes"]} />
    </div>
  );
}

export function AddressListsPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="地址列表" subtitle="防火墙引用的地址集合" />
      <ReadTable title="条目" rows={dash.addressLists()} fields={["list", "address", "timeout", "dynamic", "disabled", "comment"]} />
    </div>
  );
}

export function DhcpPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="DHCP" subtitle="服务器、网络与地址池；租约见“客户端”" />
      <ReadTable title="服务器" rows={dash.dhcpServers()} fields={["name", "interface", "address-pool", "lease-time", "disabled"]} />
      <ReadTable title="网络" rows={dash.dhcpNetworks()} fields={["address", "gateway", "dns-server", "comment"]} />
      <ReadTable title="地址池" rows={dash.pools()} fields={["name", "ranges", "next-pool"]} />
    </div>
  );
}

export function DnsPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="DNS" subtitle="解析器配置与静态记录" />
      <Card title="解析器" class="mb-4">
        <div class="px-4 pb-4">{dash.dns() ? <AllFields row={dash.dns()!} /> : <EmptyState title="没有 DNS 配置" compact />}</div>
      </Card>
      <ReadTable title="静态记录" rows={dash.dnsStatic()} fields={["name", "address", "type", "disabled"]} />
    </div>
  );
}

export function NeighborsPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="邻居" subtitle="LLDP / CDP / MNDP 发现的相邻设备" />
      <ReadTable title="发现的设备" rows={dash.neighbors()} fields={["interface", "identity", "address", "mac-address", "platform", "version", "interface-name"]} />
    </div>
  );
}

export function QueuesPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="队列" subtitle="简单队列（限速）" />
      <ReadTable title="简单队列" rows={dash.queues()} fields={["name", "target", "max-limit", "bytes", "packets", "disabled"]} />
    </div>
  );
}

export function WifiPage() {
  const dash = useDashboard();
  return (
    <div>
      <PageHeader title="WiFi" subtitle="无线接口、配置与已连接的客户端" />
      <ReadTable title="接口" rows={dash.wifi()} fields={["name", "running", "disabled", "comment"]} empty="没有 WiFi 接口" />
      <ReadTable title="配置" rows={dash.wifiConfig()} fields={["name", "ssid", "country", "mode"]} empty="没有 WiFi 配置" />
      <ReadTable title="已连接客户端" rows={dash.wifiRegistration()} fields={["interface", "mac-address", "signal-strength", "tx-rate", "rx-rate", "uptime"]} empty="没有已注册的无线客户端" />
    </div>
  );
}

export function LogPage() {
  const dash = useDashboard();
  let search: HTMLInputElement | undefined;
  useTableKeyboard(() => search);
  const [query, setQuery] = createSignal("");
  const rows = createMemo(() => {
    const needle = query().trim().toLowerCase();
    return dash
      .logEntries()
      .slice(-200)
      .reverse()
      .filter((row) => [row.time, row.topics, row.message].join(" ").toLowerCase().includes(needle));
  });
  return (
    <div>
      <PageHeader title="日志" subtitle="最近 200 条，最新在前；按 / 搜索">
        <input ref={search} class="field" type="search" aria-label="搜索日志" placeholder="搜索日志" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
      </PageHeader>
      <ReadTable rows={rows()} fields={["time", "topics", "message"]} searchable={false} title="日志" />
    </div>
  );
}
