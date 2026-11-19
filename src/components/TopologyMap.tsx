import { createMemo, createSignal, For, Show } from "solid-js";
import { formatBps } from "../lib/format";
import { compareName, flag, linkState } from "../lib/model";
import { useDashboard } from "../lib/store";
import { collectClients, type TopoClient } from "../lib/topology";
import { DeviceIcon } from "./DeviceIcon";

function rateText(bps: number | null | undefined): string {
  const formatted = formatBps(bps ?? null);
  return formatted ? `${formatted.value} ${formatted.unit}` : "—";
}

function matches(client: TopoClient, query: string): boolean {
  const raw = query.trim().toLowerCase();
  if (!raw) return true;
  const blob = [client.title, client.subtitle, client.ip, client.mac, client.port].join(" ").toLowerCase();
  return blob.includes(raw) || blob.replace(/[^a-z0-9]/g, "").includes(raw.replace(/[^a-z0-9]/g, ""));
}

export function TopologyMap() {
  const dash = useDashboard();
  const [query, setQuery] = createSignal("");
  const wanName = () => dash.primaryWan();
  const wan = createMemo(() => dash.interfaces().find((row) => row.name === wanName()));
  const wanUp = createMemo(() => !!wan() && flag(wan()?.running) && !flag(wan()?.disabled));
  const wanRate = createMemo(() => (wanName() ? dash.rates()[wanName()!] : undefined));
  const carrierName = createMemo(() => {
    const parent = dash.pppoe().find((row) => row.name === wanName())?.interface;
    if (parent) return parent;
    return dash.wanNames().find((name) => name !== wanName()) ?? "";
  });
  const carrier = createMemo(() => dash.interfaces().find((row) => row.name === carrierName()));
  const bridgeNames = createMemo(() => {
    const names = new Set<string>(dash.lanNames());
    for (const row of dash.interfaces()) if (row.type === "bridge" && row.name) names.add(row.name);
    return names;
  });
  const clients = createMemo(() =>
    collectClients(dash.leases(), dash.arp(), dash.bridgeHosts() ?? [], bridgeNames()).filter((client) =>
      matches(client, query()),
    ),
  );
  const lanPorts = createMemo(() =>
    dash
      .interfaces()
      .filter((row) => row.type === "ether" && row.name && row.name !== carrierName() && !dash.wanNames().includes(row.name))
      .sort((a, b) => compareName(a.name, b.name)),
  );
  const columns = createMemo(() => {
    const known = new Set(lanPorts().map((row) => row.name));
    const extra = new Set<string>();
    for (const client of clients()) if (client.port && !known.has(client.port) && client.port !== carrierName()) extra.add(client.port);
    const ports = [...lanPorts().map((row) => row.name), ...[...extra].sort(compareName)];
    return ports.map((name) => ({
      name,
      iface: dash.interfaces().find((row) => row.name === name),
      clients: clients()
        .filter((client) => client.port === name)
        .sort((a, b) => Number(b.online) - Number(a.online)),
    }));
  });
  const unplaced = createMemo(() => clients().filter((client) => !client.port));
  const peers = createMemo(() => dash.wireguardPeers() ?? []);

  return (
    <section class="card px-3 py-3 md:px-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="text-sm font-medium">拓扑</div>
        <input
          class="field"
          type="search"
          placeholder="过滤设备"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      <div class="topo-spine">
        <div class="topo-chip">
          <i class={`led ${wanUp() ? "led-good" : dash.ready() ? "led-bad" : "led-muted"}`} />
          <div>
            <div class="kicker">互联网</div>
            <div class="text-sm">{!dash.ready() ? "—" : wanUp() ? "已连接" : "未连接"}</div>
          </div>
        </div>
        <div class="topo-line" />
        <button type="button" class="topo-chip" onClick={() => wanName() && dash.setSelection({ type: "iface", name: wanName()! })}>
          <i class={`led ${wanUp() ? "led-good" : "led-bad"}`} />
          <div>
            <div class="kicker">广域网</div>
            <div class="text-sm font-medium">{wanName() || "—"}</div>
            <div class="font-mono text-[11px] text-muted">
              ↓ {rateText(wanRate()?.rxBps)} ↑ {rateText(wanRate()?.txBps)}
            </div>
          </div>
        </button>
        <Show when={carrier()}>
          <div class="topo-line" />
          <button
            type="button"
            class="topo-chip"
            onClick={() => carrierName() && dash.setSelection({ type: "iface", name: carrierName() })}
          >
            <i class={`led ${flag(carrier()?.running) && !flag(carrier()?.disabled) ? "led-good" : "led-bad"}`} />
            <div>
              <div class="kicker">物理口</div>
              <div class="text-sm">{carrierName()}</div>
              <div class="text-[11px] text-faint">{linkState(carrier()).label}</div>
            </div>
          </button>
        </Show>
        <div class="topo-line" />
        <button type="button" class="topo-chip" onClick={() => dash.setSelection({ type: "gateway" })}>
          <i class={`led ${dash.resource() ? "led-good" : "led-muted"}`} />
          <div>
            <div class="kicker">网关</div>
            <div class="text-sm font-medium">{dash.identity()?.name || "—"}</div>
          </div>
        </button>
      </div>

      <div class="topo-ports">
        <For each={columns()}>
          {(column) => (
            <div class="topo-col">
              <button type="button" class="topo-chip" onClick={() => dash.setSelection({ type: "iface", name: column.name })}>
                <i
                  class={`led ${
                    column.iface && flag(column.iface.running) && !flag(column.iface.disabled) ? "led-good" : "led-bad"
                  }`}
                />
                <div>
                  <div class="text-sm font-medium">{column.name}</div>
                  <div class="text-[11px] text-faint">{column.iface ? linkState(column.iface).label : "端口"}</div>
                </div>
              </button>
              <For each={column.clients.slice(0, 8)}>
                {(client) => <ClientChip client={client} />}
              </For>
              {column.clients.length > 8 ? <div class="px-1 text-[11px] text-faint">还有 {column.clients.length - 8}</div> : null}
            </div>
          )}
        </For>
        <Show when={unplaced().length > 0}>
          <div class="topo-col">
            <div class="topo-chip">
              <i class="led led-muted" />
              <div>
                <div class="text-sm">未定位</div>
                <div class="text-[11px] text-faint">没有桥主机记录</div>
              </div>
            </div>
            <For each={unplaced().slice(0, 8)}>
              {(client) => <ClientChip client={client} />}
            </For>
          </div>
        </Show>
        <Show when={peers().length > 0}>
          <div class="topo-col">
            <button
              type="button"
              class="topo-chip"
              onClick={() => {
                const name = dash.wireguard()?.[0]?.name;
                if (name) dash.setSelection({ type: "iface", name });
              }}
            >
              <i class={`led ${dash.wireguard()?.some((row) => flag(row.running)) ? "led-good" : "led-muted"}`} />
              <div>
                <div class="text-sm">WireGuard</div>
                <div class="text-[11px] text-faint">{peers().length} 个对端</div>
              </div>
            </button>
            <For each={peers()}>
              {(peer) => (
                <button
                  type="button"
                  class="topo-client"
                  onClick={() => peer[".id"] && dash.setSelection({ type: "peer", id: peer[".id"] })}
                >
                  <i class={`led ${peer["last-handshake"] && peer["last-handshake"] !== "never" ? "led-good" : "led-muted"}`} />
                  <span class="truncate">{peer.comment || "对端"}</span>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </section>
  );
}

function ClientChip(props: { client: TopoClient }) {
  const dash = useDashboard();
  return (
    <button
      type="button"
      class={props.client.online ? "topo-client" : "topo-client is-off"}
      onClick={() => dash.setSelection({ type: "client", ip: props.client.ip, mac: props.client.mac })}
    >
      <DeviceIcon kind={props.client.kind} />
      <span class="min-w-0">
        <span class="block truncate text-sm">{props.client.title}</span>
        <span class="block truncate text-[11px] text-faint">{props.client.ip || props.client.subtitle}</span>
      </span>
    </button>
  );
}
