import { ChevronRight, Cable, Globe, KeyRound, Router, Wifi, X } from "@lucide/solid";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { formatBytes } from "../lib/format";
import { flag, linkState, typeLabel, type RosRecord, type Tone } from "../lib/model";
import { connectionPath } from "../lib/path";
import { useDashboard, type DashboardApi, type Selection } from "../lib/store";
import { sameMac } from "../lib/topology";
import { InterfaceTraffic, ThroughputChart } from "./Chart";
import { CopyText } from "./CopyText";
import { DeviceIcon } from "./DeviceIcon";
import { AllFields } from "./ReadData";
import { Pill, RateText } from "./ui";
import { ClientActions, GatewayActions, IfaceActions, PeerActions } from "./actions";

const COPYABLE = new Set(["IP 地址", "MAC 地址", "允许地址", "端点", "公网地址"]);

function sameSelection(a: Selection | undefined, b: Selection | null): boolean {
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

/**
 * One side panel for every node type (client, port, peer, gateway, Internet),
 * opened from tables, the topology map, the top bar and the command palette.
 */
export function DetailDrawer() {
  const dash = useDashboard();
  const [shown, setShown] = createSignal<Selection | null>(null);
  const [open, setOpen] = createSignal(false);
  let drawer: HTMLElement | undefined;
  let opener: HTMLElement | null = null;

  createEffect(dash.selection, (selected) => {
    if (selected) {
      if (!shown()) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setShown(selected);
      const frame = requestAnimationFrame(() => {
        setOpen(true);
        drawer?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    setOpen(false);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    const timer = setTimeout(() => setShown(null), 260);
    return () => clearTimeout(timer);
  });

  onSettled(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!dash.selection() || !drawer) return;
      if (event.key === "Escape") dash.setSelection(null);
      if (event.key === "Tab") {
        const items = Array.from(drawer.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex='0']"));
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });

  return (
    <Show when={shown()} keyed>
      {(sel) => (
        <>
          <div class={`drawer-backdrop ${open() ? "is-open" : ""}`} onClick={() => dash.setSelection(null)} />
          <aside ref={drawer} class={`drawer ${open() ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label="详情" tabindex={-1}>
            <DrawerContent sel={sel} />
          </aside>
        </>
      )}
    </Show>
  );
}

function DrawerContent(props: { sel: Selection }) {
  const dash = useDashboard();
  const path = createMemo(() => connectionPath(dash, props.sel));
  const header = createMemo(() => describe(props.sel));

  function describe(sel: Selection): { title: string; subtitle: string; tone: Tone; status: string } {
    if (sel.type === "client") {
      const client = dash.clients().find((item) => sameMac(item.mac, sel.mac) || (!!sel.ip && item.ip === sel.ip));
      return {
        title: client?.title || sel.ip || "客户端",
        subtitle: client?.subtitle || client?.vendor || "",
        tone: client?.online ? "good" : "muted",
        status: client?.online ? "在线" : "离线",
      };
    }
    if (sel.type === "iface") {
      const row = dash.interfaces().find((item) => item.name === sel.name) ?? (dash.wireguard() ?? []).find((item) => item.name === sel.name);
      const state = linkState(row);
      return { title: sel.name, subtitle: [typeLabel(row?.type), row?.comment].filter(Boolean).join(" · "), tone: state.tone, status: state.label };
    }
    if (sel.type === "peer") {
      const peer = (dash.wireguardPeers() ?? []).find((row) => row[".id"] === sel.id);
      const shook = !!peer?.["last-handshake"] && peer["last-handshake"] !== "never";
      return { title: peer?.comment || "WireGuard 对端", subtitle: peer?.interface || "", tone: flag(peer?.disabled) ? "muted" : shook ? "good" : "warn", status: flag(peer?.disabled) ? "已禁用" : shook ? "已握手" : "未握手" };
    }
    if (sel.type === "gateway") {
      const version = (dash.resource()?.version || "").replace(/\s*\(.*\)\s*$/, "");
      return { title: dash.identity()?.name || "网关", subtitle: version ? `RouterOS ${version}` : "", tone: dash.resource() ? "good" : "muted", status: dash.resource() ? "在线" : "未知" };
    }
    return { title: "互联网", subtitle: dash.primaryWan() || "", tone: dash.wanUp() ? "good" : "bad", status: dash.wanUp() ? "已连接" : "未连接" };
  }

  return (
    <>
      <div class="drawer-head">
        <HeaderIcon sel={props.sel} />
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-[16px] font-semibold">{header().title}</h2>
          <div class="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">
            <Pill tone={header().tone}>{header().status}</Pill>
            <span class="truncate">{header().subtitle}</span>
          </div>
        </div>
        <button type="button" class="icon-btn" aria-label="关闭" onClick={() => dash.setSelection(null)}>
          <X aria-hidden="true" />
        </button>
      </div>
      <div class="drawer-body fade-in">
        <DrawerActions sel={props.sel} />
        <Show when={props.sel.type === "iface" || props.sel.type === "gateway" || props.sel.type === "internet"}>
          <section class="drawer-section">
            <InterfaceTraffic
              name={props.sel.type === "iface" ? props.sel.name : dash.primaryWan()}
              height={180}
              initialRange={3600}
              compact
            />
          </section>
        </Show>
        {props.sel.type === "client" ? <ClientTraffic ip={clientIp(dash, props.sel)} /> : null}
        {props.sel.type === "peer" ? <PeerTraffic id={props.sel.id} /> : null}

        <section class="drawer-section">
          <h3>连接路径</h3>
          <div class="hops">
            <For each={path().hops}>
              {(hop, index) => (
                <>
                  {index() > 0 ? <ChevronRight class="hop-arrow h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {hop.selection && !sameSelection(hop.selection, props.sel) ? (
                    <button type="button" class="hop" onClick={() => dash.setSelection(hop.selection ?? null)} title={hop.status}>
                      <i class={`led led-${hop.tone}`} />
                      <span class="min-w-0">
                        <span class="block text-[10.5px] text-faint">{hop.label}</span>
                        <span class="block truncate">{hop.name}</span>
                      </span>
                    </button>
                  ) : (
                    <span class={`hop ${sameSelection(hop.selection, props.sel) ? "is-current" : ""}`} title={hop.status}>
                      <i class={`led led-${hop.tone}`} />
                      <span class="min-w-0">
                        <span class="block text-[10.5px] text-faint">{hop.label}</span>
                        <span class="block truncate">{hop.name}</span>
                      </span>
                    </span>
                  )}
                </>
              )}
            </For>
          </div>
        </section>

        <section class="drawer-section">
          <h3>详细信息</h3>
          <dl class="kv">
            <For each={path().facts}>
              {(fact) => (
                <>
                  <dt>{fact[0]}</dt>
                  <dd class={/地址|端点/.test(fact[0]) ? "font-mono text-[12.5px]" : ""}>
                    {COPYABLE.has(fact[0]) && fact[1] !== "—" && !fact[1].includes("\n") ? <CopyText value={fact[1]} class="justify-end" /> : fact[1]}
                  </dd>
                </>
              )}
            </For>
          </dl>
        </section>

        <RawFields sel={props.sel} />
      </div>
    </>
  );
}

/** A client keeps its MAC when its IP changes (fixed IP edits), so resolve the current IP from it. */
function clientIp(dash: DashboardApi, sel: { ip: string; mac: string }): string {
  return dash.clients().find((client) => !!sel.mac && sameMac(client.mac, sel.mac))?.ip || sel.ip;
}

/** Buttons for changing the selected thing; each module hides itself without the needed policy. */
function DrawerActions(props: { sel: Selection }) {
  const dash = useDashboard();
  return (
    <>
      {(() => {
        const current = props.sel;
        if (current.type === "client") return <ClientActions ip={clientIp(dash, current)} mac={current.mac} />;
        if (current.type === "iface") return <IfaceActions name={current.name} />;
        if (current.type === "peer") return <PeerActions id={current.id} />;
        if (current.type === "gateway") return <GatewayActions />;
        return null;
      })()}
    </>
  );
}

function HeaderIcon(props: { sel: Selection }) {
  const dash = useDashboard();
  const client = createMemo(() => {
    const sel = props.sel;
    return sel.type === "client" ? dash.clients().find((item) => sameMac(item.mac, sel.mac) || (!!sel.ip && item.ip === sel.ip)) : undefined;
  });
  const iconClass = "grid h-10 w-10 shrink-0 place-items-center rounded-xl";
  if (props.sel.type === "client") return <DeviceIcon kind={client()?.kind ?? "generic"} online={client()?.online} />;
  if (props.sel.type === "gateway") return <span class={`${iconClass} bg-accent text-white`}><Router class="h-5 w-5" aria-hidden="true" /></span>;
  if (props.sel.type === "internet") return <span class={`${iconClass} bg-accent-soft text-accent`}><Globe class="h-5 w-5" aria-hidden="true" /></span>;
  if (props.sel.type === "peer") return <span class={`${iconClass} bg-hover text-muted`}><KeyRound class="h-5 w-5" aria-hidden="true" /></span>;
  const sel = props.sel;
  const wifi = dash.wifi().some((row) => row.name === sel.name);
  return <span class={`${iconClass} bg-hover text-muted`}>{wifi ? <Wifi class="h-5 w-5" aria-hidden="true" /> : <Cable class="h-5 w-5" aria-hidden="true" />}</span>;
}

function ClientTraffic(props: { ip: string }) {
  const dash = useDashboard();
  const traffic = createMemo(() => dash.clientTraffic()[props.ip]);
  const history = createMemo(() => dash.clientHistory()[props.ip] ?? []);
  const maxPeer = createMemo(() => Math.max(1, ...(traffic()?.peers ?? []).map((peer) => peer.bytes)));
  return (
    <Show
      when={dash.connectionsLoaded() && dash.connections() !== null}
      fallback={
        <section class="drawer-section text-[13px] text-faint">
          {dash.connectionsLoaded() ? "这台路由器没有连接跟踪表，无法统计单台设备流量。" : "正在读取连接表…"}
        </section>
      }
    >
      <section class="drawer-section">
        <div class="flex gap-8">
          <div>
            <div class="kicker">下载</div>
            <RateText bps={traffic()?.rxBps} class="big-rate rate-down" />
          </div>
          <div>
            <div class="kicker">上传</div>
            <RateText bps={traffic()?.txBps} class="big-rate rate-up" />
          </div>
          <div>
            <div class="kicker">活动连接</div>
            <div class="big-rate">{traffic()?.connections ?? 0}</div>
          </div>
        </div>
        <div class="mt-2">
          <ThroughputChart points={history()} now={dash.now()} range={Math.max(60, Math.min(600, history().length * 8))} height={150} legend={false} />
        </div>
        <p class="mt-1 text-[11.5px] text-faint">
          来自防火墙连接表，约每 8 秒一次，仅保留打开页面后的采样。当前连接累计：↓ {formatBytes(traffic()?.downBytes ?? 0)} · ↑ {formatBytes(traffic()?.upBytes ?? 0)}
        </p>
      </section>
      <section class="drawer-section">
        <h3>主要连接对端</h3>
        <Show when={(traffic()?.peers.length ?? 0) > 0} fallback={<p class="text-[13px] text-faint">没有进行中的连接。</p>}>
          <ul class="space-y-2">
            <For each={traffic()?.peers ?? []}>
              {(peer) => (
                <li class="text-[13px]">
                  <div class="flex items-center justify-between gap-3">
                    <CopyText class="font-mono text-[12.5px]" value={peer.ip} />
                    <span class="num text-faint">
                      {peer.count} 条 · {formatBytes(peer.bytes)}
                    </span>
                  </div>
                  <div class="meter mt-1">
                    <i style={{ width: `${(peer.bytes / maxPeer()) * 100}%` }} />
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </Show>
  );
}

function PeerTraffic(props: { id: string }) {
  const dash = useDashboard();
  const peer = createMemo(() => (dash.wireguardPeers() ?? []).find((row) => row[".id"] === props.id));
  const rate = createMemo(() => dash.peerRates()[props.id]);
  return (
    <section class="drawer-section">
      <div class="flex gap-8">
        <div>
          <div class="kicker">接收</div>
          <RateText bps={rate()?.rxBps} class="big-rate rate-up" />
        </div>
        <div>
          <div class="kicker">发送</div>
          <RateText bps={rate()?.txBps} class="big-rate rate-down" />
        </div>
      </div>
      <p class="mt-2 text-[12px] text-faint">
        累计 收 {formatBytes(peer()?.rx)} · 发 {formatBytes(peer()?.tx)}
      </p>
    </section>
  );
}

function RawFields(props: { sel: Selection }) {
  const dash = useDashboard();
  const [open, setOpen] = createSignal(false);
  const records = createMemo(() => {
    const sel = props.sel;
    const out: Array<{ label: string; row: RosRecord | null | undefined }> = [];
    if (sel.type === "client") {
      const client = dash.clients().find((item) => sameMac(item.mac, sel.mac) || (!!sel.ip && item.ip === sel.ip));
      out.push({ label: "DHCP 租约", row: client?.lease }, { label: "ARP", row: client?.arp });
      out.push({ label: "无线注册", row: dash.wifiRegistration().find((row) => sameMac(row["mac-address"], sel.mac)) });
    } else if (sel.type === "iface") {
      out.push({ label: "interface", row: dash.interfaces().find((item) => item.name === sel.name) });
      out.push({ label: "ethernet", row: dash.ethernet().find((item) => item.name === sel.name) });
    } else if (sel.type === "peer") {
      out.push({ label: "peer", row: (dash.wireguardPeers() ?? []).find((row) => row[".id"] === sel.id) });
    } else if (sel.type === "gateway") {
      out.push({ label: "system/resource", row: dash.resource() });
    }
    return out.filter((entry): entry is { label: string; row: RosRecord } => !!entry.row);
  });
  return (
    <Show when={records().length > 0}>
      <section class="drawer-section">
        <button type="button" class="flex w-full items-center justify-between text-[12px] font-semibold text-muted" aria-expanded={open() ? "true" : "false"} onClick={() => setOpen(!open())}>
          RouterOS 原始字段
          <ChevronRight class="h-4 w-4 transition-transform" style={{ transform: open() ? "rotate(90deg)" : "none" }} aria-hidden="true" />
        </button>
        <Show when={open()}>
          <For each={records()}>
            {(entry) => (
              <div class="mt-3">
                <div class="kicker">{entry.label}</div>
                <AllFields row={entry.row} copy />
              </div>
            )}
          </For>
        </Show>
      </section>
    </Show>
  );
}
