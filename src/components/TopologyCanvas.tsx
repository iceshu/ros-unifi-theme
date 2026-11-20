import { Cable, Globe, KeyRound, LocateFixed, Minus, Plus, Router, Unplug, Wifi } from "@lucide/solid";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { formatBps } from "../lib/format";
import { addressesOn, compareName, flag, hardwareLabel, linkState, type RosRecord } from "../lib/model";
import { useDashboard, type Selection } from "../lib/store";
import { flowDuration, flowWidth, macKey, sameMac, type TopoClient } from "../lib/topology";
import { layoutTopology, type BranchInput, type LeafInput, type NodeKind, type TNode } from "../lib/topoLayout";
import { DeviceGlyph } from "./DeviceIcon";

function short(bps: number | undefined): string {
  const value = formatBps(bps ?? null);
  return value ? `${value.value} ${value.unit}` : "—";
}

function matchesQuery(client: TopoClient, query: string): boolean {
  const raw = query.trim().toLowerCase();
  if (!raw) return true;
  const blob = [client.title, client.subtitle, client.ip, client.mac, client.port, client.vendor].join(" ").toLowerCase();
  return blob.includes(raw) || (macKey(raw).length >= 4 && macKey(blob).includes(macKey(raw)));
}

const up = (row: RosRecord | undefined) => !!row && flag(row.running) && !flag(row.disabled);

function selectionKey(selection: Selection | null): string {
  if (!selection) return "";
  if (selection.type === "client") return `client:${macKey(selection.mac) || selection.ip}`;
  if (selection.type === "iface") return `iface:${selection.name}`;
  if (selection.type === "peer") return `peer:${selection.id}`;
  return selection.type;
}

/**
 * UniFi-style network map. Nodes are HTML (crisp text, focusable), links are
 * SVG with two animated lanes: download flows away from the Internet in blue,
 * upload flows back in teal. Lane thickness and speed follow live throughput.
 */
export function TopologyCanvas(props: { height: string; wheelZoom?: boolean; query?: string; showOffline?: boolean }) {
  const dash = useDashboard();
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [hover, setHover] = createSignal<string | null>(null);
  const [view, setView] = createSignal({ x: 0, y: 24, k: 1 });
  const [panning, setPanning] = createSignal(false);
  const [wheeling, setWheeling] = createSignal(false);
  let shell!: HTMLDivElement;
  let userMoved = false;

  const branches = createMemo<BranchInput[]>(() => {
    const rates = dash.rates();
    const traffic = dash.clientTraffic();
    const query = props.query ?? "";
    const wanNames = new Set([...dash.wanNames(), dash.carrierName()]);
    const wifiNames = new Set(dash.wifi().map((row) => row.name));
    const ifaceByName = new Map(dash.interfaces().map((row) => [row.name, row]));
    const speed = new Map(dash.ethernet().map((row) => [row.name, row.speed]));
    const clients = dash.clients().filter((client) => props.showOffline !== false || client.online);

    const leaf = (client: TopoClient): LeafInput => {
      const rate = client.ip ? traffic[client.ip] : undefined;
      return {
        id: `client:${macKey(client.mac) || client.ip}`,
        kind: "client",
        title: client.title,
        sub: client.ip || client.mac,
        online: client.online,
        down: rate?.rxBps ?? undefined,
        upRate: rate?.txBps ?? undefined,
        deviceKind: client.kind,
        selection: { type: "client", ip: client.ip, mac: client.mac },
        match: matchesQuery(client, query),
      };
    };
    const order = (a: LeafInput, b: LeafInput) =>
      Number(b.online) - Number(a.online) || (b.down ?? 0) - (a.down ?? 0) || compareName(a.title, b.title);

    const byPort = new Map<string, TopoClient[]>();
    for (const client of clients) {
      const list = byPort.get(client.port) ?? [];
      list.push(client);
      byPort.set(client.port, list);
    }
    const portNames = dash
      .interfaces()
      .filter((row) => row.type === "ether" && row.name && !wanNames.has(row.name))
      .map((row) => row.name);
    for (const name of byPort.keys()) {
      if (name && !portNames.includes(name) && !wifiNames.has(name) && !wanNames.has(name)) portNames.push(name);
    }
    portNames.sort(compareName);

    const result: BranchInput[] = portNames.map((name) => {
      const row = ifaceByName.get(name);
      const rate = rates[name];
      return {
        id: `iface:${name}`,
        kind: "port",
        title: name,
        sub: [row?.comment, up(row) ? speed.get(name) : linkState(row).label].filter(Boolean).join(" · ") || "端口",
        up: up(row),
        down: rate?.txBps,
        upRate: rate?.rxBps,
        selection: { type: "iface", name },
        children: (byPort.get(name) ?? []).map(leaf).sort(order),
      };
    });
    for (const radio of dash.wifi()) {
      const rate = rates[radio.name];
      const children = (byPort.get(radio.name) ?? []).map(leaf).sort(order);
      result.push({
        id: `iface:${radio.name}`,
        kind: "wifi",
        title: radio.name,
        sub: [radio["configuration.ssid"] || radio.comment, `${children.length} 台无线`].filter(Boolean).join(" · "),
        up: up(radio) || up(ifaceByName.get(radio.name)),
        down: rate?.txBps,
        upRate: rate?.rxBps,
        selection: { type: "iface", name: radio.name },
        children,
      });
    }
    for (const tunnel of dash.wireguard() ?? []) {
      const peers = (dash.wireguardPeers() ?? []).filter((peer) => peer.interface === tunnel.name);
      if (peers.length === 0) continue;
      const rate = rates[tunnel.name];
      result.push({
        id: `iface:${tunnel.name}`,
        kind: "wg",
        title: tunnel.name,
        sub: `WireGuard · ${peers.length} 个对端`,
        up: up(tunnel),
        down: rate?.txBps,
        upRate: rate?.rxBps,
        selection: { type: "iface", name: tunnel.name },
        children: peers.map((peer) => {
          const peerRate = dash.peerRates()[peer[".id"] || ""];
          const shook = !!peer["last-handshake"] && peer["last-handshake"] !== "never" && !flag(peer.disabled);
          return {
            id: `peer:${peer[".id"]}`,
            kind: "peer",
            title: peer.comment || peer["allowed-address"] || "对端",
            sub: peer["current-endpoint-address"] || peer["allowed-address"] || "未握手",
            online: shook,
            down: peerRate?.txBps,
            upRate: peerRate?.rxBps,
            selection: { type: "peer", id: peer[".id"] || "" },
            match: !query || `${peer.comment} ${peer["allowed-address"]}`.toLowerCase().includes(query.toLowerCase()),
          } satisfies LeafInput;
        }),
      });
    }
    const unplaced = byPort.get("") ?? [];
    if (unplaced.length > 0) {
      result.push({
        id: "unplaced",
        kind: "unplaced",
        title: "未定位",
        sub: "桥主机表里没有端口记录",
        up: true,
        children: unplaced.map(leaf).sort(order),
      });
    }
    return result;
  });

  const layout = createMemo(() => {
    const wanName = dash.primaryWan() || "";
    const wanRate = dash.rates()[wanName];
    const ip = addressesOn(dash.addresses(), wanName)[0];
    const version = (dash.resource()?.version || "").replace(/\s*\(.*\)\s*$/, "");
    return layoutTopology({
      internet: {
        title: "互联网",
        sub: !dash.ready() ? "读取中" : dash.wanUp() ? ip || "已连接" : "未连接",
        up: dash.wanUp(),
      },
      gateway: {
        title: dash.identity()?.name || "网关",
        sub: [hardwareLabel(dash.resource(), dash.routerboard()), version && `RouterOS ${version}`].filter(Boolean).join(" · "),
        up: !!dash.resource(),
      },
      wan: { down: wanRate?.rxBps, upRate: wanRate?.txBps, up: dash.wanUp() },
      branches: branches(),
      expanded: expanded(),
    });
  });

  const nodeById = createMemo(() => new Map(layout().nodes.map((node) => [node.id, node])));

  /** Hovering a node lights its path to the Internet plus everything below it. */
  const lit = createMemo<Set<string> | null>(() => {
    const id = hover();
    if (!id) return null;
    const nodes = nodeById();
    const set = new Set<string>();
    for (let cursor: string | null | undefined = id; cursor; cursor = nodes.get(cursor)?.parent) set.add(cursor);
    for (const node of layout().nodes) if (node.parent === id) set.add(node.id);
    return set;
  });
  const selected = createMemo(() => {
    const selection = dash.selection();
    if (selection?.type === "client") {
      const client = dash.clients().find((item) => sameMac(item.mac, selection.mac) || (!!selection.ip && item.ip === selection.ip));
      return client ? `client:${macKey(client.mac) || client.ip}` : "";
    }
    return selectionKey(selection);
  });
  const dimmed = (node: TNode) => {
    const set = lit();
    if (set) return !set.has(node.id);
    return !node.match;
  };

  const fit = () => {
    const box = shell?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const { width, height } = layout();
    // The full-page map stays readable and pans instead of shrinking text below ~70%.
    const floor = props.wheelZoom ? 0.7 : 0.35;
    const k = Math.max(floor, Math.min(1, (box.width - 48) / width, (box.height - 56) / (height + 8)));
    setView({ k, x: (box.width - width * k) / 2, y: 28 });
  };
  const zoom = (factor: number, cx?: number, cy?: number) => {
    const box = shell.getBoundingClientRect();
    const px = cx ?? box.width / 2;
    const py = cy ?? box.height / 2;
    userMoved = true;
    setView((current) => {
      const k = Math.max(0.3, Math.min(2.2, current.k * factor));
      return { k, x: px - ((px - current.x) * k) / current.k, y: py - ((py - current.y) * k) / current.k };
    });
  };

  onSettled(() => {
    fit();
    let lastSize = "";
    const observer = new ResizeObserver(() => {
      const box = shell.getBoundingClientRect();
      const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
      if (size !== lastSize && !userMoved) fit();
      lastSize = size;
    });
    observer.observe(shell);
    return () => observer.disconnect();
  });
  // Refit while the tree grows during the first reads, until the user takes over.
  createEffect(
    () => `${layout().width}x${layout().height}`,
    () => {
      if (!userMoved) fit();
    },
  );

  let drag: { id: number; x: number; y: number; vx: number; vy: number } | null = null;
  let wheelTimer: number | undefined;

  const nodeIcon = (kind: NodeKind, node: TNode) => {
    if (kind === "internet") return <Globe aria-hidden="true" />;
    if (kind === "gateway") return <Router aria-hidden="true" />;
    if (kind === "port") return <Cable aria-hidden="true" />;
    if (kind === "wifi") return <Wifi aria-hidden="true" />;
    if (kind === "wg" || kind === "peer") return <KeyRound aria-hidden="true" />;
    if (kind === "unplaced") return <Unplug aria-hidden="true" />;
    return <DeviceGlyph kind={node.deviceKind ?? "generic"} />;
  };

  const activate = (node: TNode) => {
    if (node.kind === "more") {
      const branch = node.parent || "";
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(branch)) next.delete(branch);
        else next.add(branch);
        return next;
      });
      return;
    }
    if (node.kind === "unplaced") return;
    if (node.selection) dash.setSelection(node.selection);
  };

  return (
    <div
      ref={shell}
      class={`topo-shell ${panning() ? "is-panning" : ""} ${wheeling() ? "is-wheeling" : ""}`}
      style={{ height: props.height }}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest(".topo-node, .topo-toolbar"))) return;
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, vx: view().x, vy: view().y };
        shell.setPointerCapture(event.pointerId);
        setPanning(true);
      }}
      onPointerMove={(event) => {
        if (!drag || drag.id !== event.pointerId) return;
        userMoved = true;
        const { k } = view();
        setView({ k, x: drag.vx + event.clientX - drag.x, y: drag.vy + event.clientY - drag.y });
      }}
      onPointerUp={() => {
        drag = null;
        setPanning(false);
      }}
      onPointerCancel={() => {
        drag = null;
        setPanning(false);
      }}
      onWheel={(event) => {
        if (!props.wheelZoom && !event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const box = shell.getBoundingClientRect();
        setWheeling(true);
        window.clearTimeout(wheelTimer);
        wheelTimer = window.setTimeout(() => setWheeling(false), 160);
        zoom(Math.exp(-event.deltaY * 0.0015), event.clientX - box.left, event.clientY - box.top);
      }}
    >
      <div
        class="topo-stage"
        style={{
          width: `${layout().width}px`,
          height: `${layout().height}px`,
          transform: `translate(${view().x}px, ${view().y}px) scale(${view().k})`,
        }}
      >
        <svg class="topo-links" width={layout().width} height={layout().height} aria-hidden="true">
          <For each={layout().links} keyed={(link) => link.id}>
            {(link) => {
              const faded = () => {
                const set = lit();
                return set ? !(set.has(link().from) && set.has(link().to)) : !(nodeById().get(link().to)?.match ?? true);
              };
              const flowing = (bps: number | undefined) => link().up && (bps ?? 0) > 1000;
              return (
                <g class={faded() ? "topo-dim" : ""}>
                  <path d={link().base} class={`topo-link ${link().up ? "is-up" : "is-down"}`} />
                  <Show when={flowing(link().down)}>
                    <path
                      d={link().downLane}
                      class="topo-flow down"
                      style={{ "stroke-width": `${flowWidth(link().down)}`, "animation-duration": `${flowDuration(link().down)}s` }}
                    />
                  </Show>
                  <Show when={flowing(link().upRate)}>
                    <path
                      d={link().upLane}
                      class="topo-flow up"
                      style={{ "stroke-width": `${flowWidth(link().upRate)}`, "animation-duration": `${flowDuration(link().upRate)}s` }}
                    />
                  </Show>
                </g>
              );
            }}
          </For>
        </svg>
        <Show when={layout().links[0]}>
          {(wan) => (
            <div class="topo-label" style={{ left: `${wan().mid.x}px`, top: `${wan().mid.y}px` }}>
              <span class="rate-down">↓ {short(wan().down)}</span>
              <span class="ml-2 rate-up">↑ {short(wan().upRate)}</span>
            </div>
          )}
        </Show>
        <For each={layout().nodes} keyed={(node) => node.id}>
          {(node) => (
            <button
              type="button"
              class={`topo-node kind-${node().kind} ${node().kind === "internet" || node().kind === "gateway" ? "is-root" : ""} ${
                !node().online && node().kind !== "more" ? "is-off" : ""
              } ${selected() === node().id ? "is-selected" : ""} ${dimmed(node()) ? "topo-dim" : ""}`}
              style={{
                left: `${node().x}px`,
                top: `${node().y}px`,
                width: `${node().w}px`,
                height: `${node().h}px`,
              }}
              onMouseEnter={() => node().kind !== "more" && setHover(node().id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => node().kind !== "more" && setHover(node().id)}
              onBlur={() => setHover(null)}
              onClick={() => activate(node())}
              aria-label={`${node().title} ${node().sub}`}
            >
              <Show when={node().kind !== "more"} fallback={<span>{node().title}</span>}>
                <span class="t-icon">{nodeIcon(node().kind, node())}</span>
                <span class="min-w-0 flex-1">
                  <span class="flex items-center gap-1.5">
                    <i class={`led ${node().online ? "led-good" : node().kind === "client" || node().kind === "peer" ? "led-muted" : "led-bad"}`} />
                    <span class="t-title">{node().title}</span>
                  </span>
                  <span class="t-sub block">{node().sub}</span>
                  <Show when={node().down !== undefined || node().upRate !== undefined}>
                    <span class="t-rate block">
                      <span class="rate-down">↓{short(node().down)}</span> <span class="rate-up">↑{short(node().upRate)}</span>
                    </span>
                  </Show>
                </span>
                <Show when={(node().count ?? 0) > 0 && node().kind !== "more"}>
                  <span class="topo-badge">{node().count}</span>
                </Show>
              </Show>
            </button>
          )}
        </For>
      </div>
      <div class="topo-legend" aria-hidden="true">
        <span><i style={{ background: "var(--color-accent)" }} />下载</span>
        <span><i style={{ background: "var(--color-upload)" }} />上传</span>
        <span class="hidden sm:inline">线越粗流量越大</span>
      </div>
      <div class="topo-toolbar">
        <button type="button" class="icon-btn" aria-label="放大" onClick={() => zoom(1.2)}>
          <Plus aria-hidden="true" />
        </button>
        <button type="button" class="icon-btn" aria-label="缩小" onClick={() => zoom(1 / 1.2)}>
          <Minus aria-hidden="true" />
        </button>
        <button
          type="button"
          class="icon-btn"
          aria-label="适应窗口"
          onClick={() => {
            userMoved = false;
            fit();
          }}
        >
          <LocateFixed aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
