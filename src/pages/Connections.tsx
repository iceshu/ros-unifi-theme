import { createMemo, createSignal, For, Show } from "solid-js";
import { createTableSort, SortHeader } from "../components/TableSort";
import { EmptyState, PageHeader, Segmented } from "../components/ui";
import { formatBytes } from "../lib/format";
import { num } from "../lib/model";
import { useDashboard } from "../lib/store";
import { useRos } from "../lib/useRos";

type Protocol = "all" | "tcp" | "udp" | "icmp" | "other";
type State = "all" | "established" | "time-wait" | "close-wait" | "syn-sent" | "syn-received" | "fin-wait";

interface ConnRow {
  id: string;
  protocol: string;
  srcAddr: string;
  srcPort: string;
  dstAddr: string;
  dstPort: string;
  srcHost: string;
  dstHost: string;
  clientName: string;
  state: string;
  origBytes: number;
  replBytes: number;
  origRate: number;
  replRate: number;
  timeout: string;
}

function extractIpPort(addr: string): { ip: string; port: string } {
  const colonIdx = addr.lastIndexOf(":");
  // bare IPv4 "1.2.3.4" — no port
  if (colonIdx < 0) return { ip: addr, port: "" };
  // "1.2.3.4:443" — has port
  const maybeIp = addr.slice(0, colonIdx);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(maybeIp)) return { ip: maybeIp, port: addr.slice(colonIdx + 1) };
  // bare IP "1.2.3.4" with no colon caught above; IPv6 or hostname
  return { ip: addr, port: "" };
}

export function ConnectionsPage() {
  const dash = useDashboard();
  const dnsCache = useRos("/rest/ip/dns/cache", 30_000);

  const [proto, setProto] = createSignal<Protocol>("all");
  const [stateFilter, setStateFilter] = createSignal<State>("all");
  const [clientFilter, setClientFilter] = createSignal("all");
  const [query, setQuery] = createSignal("");
  const sorting = createTableSort<ConnRow>();

  // Build IP→hostname from DNS cache
  const ipHostMap = createMemo(() => {
    const map = new Map<string, string>();
    for (const entry of dnsCache.rows()) {
      const type = (entry.type || "").toUpperCase();
      if ((type === "A" || type === "AAAA") && entry.address && entry.name) {
        map.set(entry.address, entry.name);
      }
    }
    return map;
  });

  // Build IP→client name from DHCP leases
  const ipClientMap = createMemo(() => {
    const map = new Map<string, string>();
    for (const lease of dash.leases()) {
      const ip = lease["active-address"] || lease.address;
      const name = lease["host-name"] || lease["mac-address"] || ip;
      if (ip) map.set(ip, name);
    }
    return map;
  });

  const rows = createMemo((): ConnRow[] => {
    const conns = dash.connections();
    if (!conns) return [];
    return conns.map((conn) => {
      const { ip: srcIp, port: srcPort } = extractIpPort(conn["src-address"] || "");
      const { ip: dstIp, port: dstPort } = extractIpPort(conn["dst-address"] || "");
      return {
        id: conn[".id"] || "",
        protocol: conn.protocol || "",
        srcAddr: srcIp,
        srcPort,
        dstAddr: dstIp,
        dstPort,
        srcHost: ipHostMap().get(srcIp) || "",
        dstHost: ipHostMap().get(dstIp) || "",
        clientName: ipClientMap().get(srcIp) || ipClientMap().get(dstIp) || "",
        state: conn["tcp-state"] || "",
        origBytes: num(conn["orig-bytes"]) ?? 0,
        replBytes: num(conn["repl-bytes"]) ?? 0,
        origRate: num(conn["orig-rate"]) ?? 0,
        replRate: num(conn["repl-rate"]) ?? 0,
        timeout: conn.timeout || "",
      };
    });
  });

  const clients = createMemo(() => {
    const names = new Set<string>();
    for (const row of rows()) if (row.clientName) names.add(row.clientName);
    return [...names].sort();
  });

  const filtered = createMemo(() => {
    const p = proto();
    const s = stateFilter();
    const c = clientFilter();
    const q = query().trim().toLowerCase();
    return rows().filter((row) => {
      if (p !== "all") {
        if (p === "other") {
          if (row.protocol === "tcp" || row.protocol === "udp" || row.protocol === "icmp") return false;
        } else if (row.protocol !== p) return false;
      }
      if (s !== "all" && row.state !== s) return false;
      if (c !== "all" && row.clientName !== c) return false;
      if (q) {
        const blob = [row.srcAddr, row.srcPort, row.dstAddr, row.dstPort, row.srcHost, row.dstHost, row.clientName, row.protocol, row.state].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  });

  const sorted = () =>
    sorting.rows(filtered(), (row, key) => {
      if (key === "orig-bytes") return row.origBytes;
      if (key === "repl-bytes") return row.replBytes;
      if (key === "orig-rate") return row.origRate;
      if (key === "repl-rate") return row.replRate;
      if (key === "src") return row.srcAddr;
      if (key === "dst") return row.dstAddr;
      if (key === "client") return row.clientName;
      return null;
    });

  function openClient(row: ConnRow) {
    // prefer src if it's a LAN address, else dst
    const srcIsLan = row.clientName && ipClientMap().get(row.srcAddr) === row.clientName;
    const ip = srcIsLan ? row.srcAddr : (row.dstAddr || row.srcAddr);
    const lease = dash.leases().find((l) => l["active-address"] === ip || l.address === ip);
    const mac = lease?.["mac-address"] || "";
    if (ip) dash.setSelection({ type: "client", ip, mac });
  }

  const loaded = () => dash.connectionsLoaded();

  return (
    <div>
      <PageHeader
        title="连接跟踪"
        subtitle={loaded() ? `共 ${filtered().length} / ${rows().length} 条连接` : "加载中…"}
      />

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label="协议"
          value={proto()}
          onChange={setProto}
          options={[
            { value: "all", label: "全部" },
            { value: "tcp", label: "TCP" },
            { value: "udp", label: "UDP" },
            { value: "icmp", label: "ICMP" },
            { value: "other", label: "其他" },
          ]}
        />
        <select
          class="input h-8 text-[13px]"
          value={stateFilter()}
          onChange={(e) => setStateFilter(e.currentTarget.value as State)}
          aria-label="TCP 状态"
        >
          <option value="all">全部状态</option>
          <option value="established">established</option>
          <option value="time-wait">time-wait</option>
          <option value="close-wait">close-wait</option>
          <option value="syn-sent">syn-sent</option>
          <option value="syn-received">syn-received</option>
          <option value="fin-wait">fin-wait</option>
        </select>
        <Show when={clients().length > 0}>
          <select
            class="input h-8 text-[13px]"
            value={clientFilter()}
            onChange={(e) => setClientFilter(e.currentTarget.value)}
            aria-label="客户端"
          >
            <option value="all">全部客户端</option>
            <For each={clients()}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </Show>
        <input
          class="input h-8 text-[13px] min-w-[160px]"
          type="search"
          placeholder="IP、端口、主机名…"
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          aria-label="搜索连接"
        />
      </div>

      <Show when={!loaded()}>
        <EmptyState title="连接数据加载中…" compact />
      </Show>

      <Show when={loaded() && rows().length === 0}>
        <EmptyState
          title="暂无连接数据"
          detail="RouterOS 防火墙连接跟踪需要 /ip/firewall/connection 菜单可用。"
        />
      </Show>

      <Show when={loaded() && rows().length > 0}>
        <Show when={filtered().length === 0}>
          <EmptyState title="没有匹配的连接" compact />
        </Show>
        <Show when={filtered().length > 0}>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <SortHeader column="client" state={sorting.sort()} toggle={sorting.toggle}>客户端</SortHeader>
                  <th>协议</th>
                  <SortHeader column="src" state={sorting.sort()} toggle={sorting.toggle}>源</SortHeader>
                  <SortHeader column="dst" state={sorting.sort()} toggle={sorting.toggle}>目标</SortHeader>
                  <th>状态</th>
                  <SortHeader column="orig-bytes" state={sorting.sort()} toggle={sorting.toggle}>发送</SortHeader>
                  <SortHeader column="repl-bytes" state={sorting.sort()} toggle={sorting.toggle}>接收</SortHeader>
                  <SortHeader column="orig-rate" state={sorting.sort()} toggle={sorting.toggle}>上传速率</SortHeader>
                  <SortHeader column="repl-rate" state={sorting.sort()} toggle={sorting.toggle}>下载速率</SortHeader>
                  <th>超时</th>
                </tr>
              </thead>
              <tbody>
                <For each={sorted()}>
                  {(row) => (
                    <tr class="is-clickable" onClick={() => openClient(row)}>
                      <td class="text-[13px]">{row.clientName || <span class="text-muted">—</span>}</td>
                      <td><span class="pill pill-muted">{row.protocol || "—"}</span></td>
                      <td class="font-mono text-[12px]">
                        {row.srcAddr}{row.srcPort ? `:${row.srcPort}` : ""}
                        <Show when={row.srcHost}><br /><span class="text-[11px] text-muted">{row.srcHost}</span></Show>
                      </td>
                      <td class="font-mono text-[12px]">
                        {row.dstAddr}{row.dstPort ? `:${row.dstPort}` : ""}
                        <Show when={row.dstHost}><br /><span class="text-[11px] text-muted">{row.dstHost}</span></Show>
                      </td>
                      <td>
                        <Show when={row.state} fallback={<span class="text-muted">—</span>}>
                          <span class={`pill ${row.state === "established" ? "pill-good" : "pill-muted"}`}>{row.state}</span>
                        </Show>
                      </td>
                      <td class="text-[13px]">{formatBytes(row.origBytes)}</td>
                      <td class="text-[13px]">{formatBytes(row.replBytes)}</td>
                      <td class="text-[13px]">
                        <Show when={row.origRate > 0}>
                          <span class="rate-up">↑</span>{" "}
                          {formatBytes(row.origRate)}/s
                        </Show>
                      </td>
                      <td class="text-[13px]">
                        <Show when={row.replRate > 0}>
                          <span class="rate-down">↓</span>{" "}
                          {formatBytes(row.replRate)}/s
                        </Show>
                      </td>
                      <td class="text-[13px] text-muted">{row.timeout || "—"}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}
