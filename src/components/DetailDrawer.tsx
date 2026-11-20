import { CopyText } from "./CopyText";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { formatBps, formatBytes, formatLastSeen, formatUptime } from "../lib/format";
import { arpStatusLabel, dhcpStatusLabel, hardwareLabel, leaseIdentity, linkState, type RosRecord } from "../lib/model";
import { useDashboard, type HistoryPoint } from "../lib/store";
import { sameMac } from "../lib/topology";
import { DeviceIcon } from "./DeviceIcon";

function rateText(bps: number | null | undefined): string {
  if (bps == null) return "—";
  const formatted = formatBps(bps);
  return formatted ? `${formatted.value} ${formatted.unit}` : "—";
}

export function DetailDrawer() {
  const dash = useDashboard();
  const [selection, setSelection] = createSignal(dash.selection());
  const [open, setOpen] = createSignal(false);
  let drawer: HTMLElement | undefined;
  let opener: HTMLElement | null = null;
  createEffect(() => dash.selection(), (selected) => {
    if (selected) {
      if (!selection()) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSelection(selected);
      const frame = requestAnimationFrame(() => { drawer?.getBoundingClientRect(); setOpen(true); drawer?.focus(); });
      onCleanup(() => cancelAnimationFrame(frame));
    } else {
      setOpen(false);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      const timer = setTimeout(() => setSelection(null), 200);
      onCleanup(() => clearTimeout(timer));
    }
  });
  createEffect(() => true, () => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dash.setSelection(null);
      if (event.key === "Tab" && dash.selection() && drawer) {
        const items = Array.from(drawer.querySelectorAll<HTMLElement>("button, a[href], input, [tabindex='0']"));
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    onCleanup(() => document.removeEventListener("keydown", keydown));
  });
  return (
    <Show when={selection()} keyed>
      {(sel) => (
        <>
          <div class={`drawer-backdrop ${open() ? "is-open" : ""}`} onClick={() => dash.setSelection(null)} />
          <aside ref={drawer} class={`drawer ${open() ? "is-open" : ""}`} role="dialog" aria-modal="true" aria-label="详情" tabindex={-1}>
            <div class="mb-4 flex items-start justify-between gap-3">
              <div class="text-sm text-faint">
                {sel.type === "client" ? "设备" : sel.type === "peer" ? "WireGuard" : sel.type === "gateway" ? "网关" : "接口"}
              </div>
              <button type="button" class="chip" onClick={() => dash.setSelection(null)}>
                关闭
              </button>
            </div>
            {sel.type === "client" ? <ClientBody ip={sel.ip} mac={sel.mac} /> : null}
            {sel.type === "iface" ? <IfaceBody name={sel.name} /> : null}
            {sel.type === "peer" ? <PeerBody id={sel.id} /> : null}
            {sel.type === "gateway" ? <GatewayBody /> : null}
          </aside>
        </>
      )}
    </Show>
  );
}

function ClientBody(props: { ip: string; mac: string }) {
  const dash = useDashboard();
  const lease = createMemo(() =>
    dash.leases().find((row) => (props.mac && sameMac(row["mac-address"], props.mac)) || (props.ip && row.address === props.ip)),
  );
  const arp = createMemo(() =>
    dash.arp().find((row) => (props.mac && sameMac(row["mac-address"], props.mac)) || (props.ip && row.address === props.ip)),
  );
  const identity = createMemo(() => (lease() ? leaseIdentity(lease() as RosRecord) : null));
  const port = createMemo(() => {
    const mac = props.mac || lease()?.["mac-address"] || "";
    const hosts = dash.bridgeHosts() ?? [];
    const bridges = new Set(dash.interfaces().filter((row) => row.type === "bridge").map((row) => row.name));
    for (const name of dash.lanNames()) bridges.add(name);
    const row = hosts.find((host) => sameMac(host["mac-address"], mac) && host.local !== "true");
    const on = row?.["on-interface"] || "";
    if (on && !bridges.has(on)) return on;
    return arp()?.interface || "";
  });
  const traffic = createMemo(() => dash.clientTraffic()[props.ip]);
  const history = createMemo(() => dash.clientHistory()[props.ip] ?? []);

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-3">
        <DeviceIcon kind={identity()?.kind ?? "generic"} />
        <div class="min-w-0">
          <h2 class="truncate text-lg font-medium"><CopyText value={identity()?.title || props.ip || "设备"}>{identity()?.title || props.ip || "设备"}</CopyText></h2>
          {identity()?.subtitle ? <p class="truncate text-sm text-faint"><CopyText value={identity()?.subtitle || ""}>{identity()?.subtitle}</CopyText></p> : null}
        </div>
      </div>
      <dl class="grid grid-cols-2 gap-3 text-sm">
        <Field label="IP" value={props.ip || lease()?.address || "—"} />
        <Field label="MAC" value={props.mac || lease()?.["mac-address"] || "—"} />
        <Field label="租约" value={lease() ? dhcpStatusLabel(lease()?.status) : "无租约"} />
        <Field label="最近出现" value={formatLastSeen(lease()?.["last-seen"])} />
        <Field label="端口" value={port() || "未定位"} />
        <Field label="ARP" value={arpStatusLabel(arp()?.status)} />
      </dl>
      <Show
        when={dash.connectionsLoaded() && dash.connections() !== null}
        fallback={
          <p class="text-sm text-faint">
            {dash.connectionsLoaded() ? "这台路由器没有连接表。" : "正在读取连接表。"}
          </p>
        }
      >
        <div>
          <div class="kicker">当前流量</div>
          <p class="mt-1 text-[11px] text-faint">来自防火墙连接表。路由器不保存这台设备的长期曲线。</p>
          <div class="mt-2 flex gap-6">
            <div>
              <div class="text-xs text-faint">下载</div>
              <div class="text-lg tabular-nums">{rateText(traffic()?.rxBps)}</div>
            </div>
            <div>
              <div class="text-xs text-faint">上传</div>
              <div class="text-lg tabular-nums">{rateText(traffic()?.txBps)}</div>
            </div>
          </div>
          <Spark points={history()} />
          <div class="mt-3 text-sm text-muted">{traffic()?.connections ?? 0} 条活动连接</div>
          <div class="mt-1 text-xs text-faint">
            累计上传 {formatBytes(traffic()?.upBytes ?? 0)} · 下载 {formatBytes(traffic()?.downBytes ?? 0)}
          </div>
        </div>
        <div>
          <div class="kicker">对端</div>
          <p class="mt-1 text-[11px] text-faint">当前连接表里的目的地址，按累计字节。</p>
          {(traffic()?.peers.length ?? 0) === 0 ? <p class="mt-2 text-sm text-faint">没有进行中的连接。</p> : null}
          <ul class="mt-2 space-y-1">
            {(traffic()?.peers ?? []).map((peer) => (
              <li class="flex items-center justify-between gap-3 text-sm">
                <CopyText class="font-mono" value={peer.ip} />
                <span class="text-faint">
                  {peer.count} · {formatBytes(peer.bytes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Show>
    </div>
  );
}

function IfaceBody(props: { name: string }) {
  const dash = useDashboard();
  const row = createMemo(() => dash.interfaces().find((item) => item.name === props.name));
  const rate = createMemo(() => dash.rates()[props.name]);
  return (
    <div class="space-y-3">
      <h2 class="text-lg font-medium">{props.name}</h2>
      <p class="text-sm text-muted">
        {row()?.type || ""} {row()?.comment ? `· ${row()?.comment}` : ""} · {linkState(row()).label}
      </p>
      <div class="flex gap-6">
        <div>
          <div class="text-xs text-faint">接收</div>
          <div class="text-lg tabular-nums">{rateText(rate()?.rxBps)}</div>
        </div>
        <div>
          <div class="text-xs text-faint">发送</div>
          <div class="text-lg tabular-nums">{rateText(rate()?.txBps)}</div>
        </div>
      </div>
      <p class="text-[11px] text-faint">接口计数器差分，和总览上的广域网曲线同一来源。</p>
      <Spark points={dash.history()[props.name] ?? []} />
      <div class="text-xs text-faint">
        累计收 {formatBytes(row()?.["rx-byte"])} · 发 {formatBytes(row()?.["tx-byte"])}
      </div>
    </div>
  );
}

function PeerBody(props: { id: string }) {
  const dash = useDashboard();
  const peer = createMemo(() => (dash.wireguardPeers() ?? []).find((row) => row[".id"] === props.id));
  const rate = createMemo(() => dash.peerRates()[props.id]);
  return (
    <div class="space-y-3">
      <h2 class="text-lg font-medium">{peer()?.comment || "对端"}</h2>
      <dl class="grid grid-cols-2 gap-3 text-sm">
        <Field label="接口" value={peer()?.interface || "—"} />
        <Field label="允许地址" value={peer()?.["allowed-address"] || "—"} />
        <Field
          label="端点"
          value={
            peer()?.["current-endpoint-address"]
              ? `${peer()?.["current-endpoint-address"]}:${peer()?.["current-endpoint-port"] || ""}`
              : "—"
          }
        />
        <Field label="握手" value={formatLastSeen(peer()?.["last-handshake"])} />
      </dl>
      <div class="flex gap-6">
        <div>
          <div class="text-xs text-faint">下载</div>
          <div class="text-lg tabular-nums">{rateText(rate()?.rxBps)}</div>
        </div>
        <div>
          <div class="text-xs text-faint">上传</div>
          <div class="text-lg tabular-nums">{rateText(rate()?.txBps)}</div>
        </div>
      </div>
      <p class="text-[11px] text-faint">对端计数器差分。没有采样间隔前只显示累计字节。</p>
      <div class="text-xs text-faint">
        累计收 {formatBytes(peer()?.rx)} · 发 {formatBytes(peer()?.tx)}
      </div>
    </div>
  );
}

function GatewayBody() {
  const dash = useDashboard();
  const wan = () => dash.primaryWan();
  const rate = () => (wan() ? dash.rates()[wan()!] : undefined);
  return (
    <div class="space-y-3">
      <h2 class="text-lg font-medium">{dash.identity()?.name || "网关"}</h2>
      <p class="text-sm text-muted">
        {hardwareLabel(dash.resource(), dash.routerboard())} · {(dash.resource()?.version || "").replace(/\s*\(.*\)\s*$/, "")}
      </p>
      <p class="text-sm text-faint">运行 {formatUptime(dash.resource()?.uptime)}</p>
      <div>
        <div class="kicker">{wan() || "广域网"}</div>
        <div class="mt-1 text-sm">
          ↓ {rateText(rate()?.rxBps)} ↑ {rateText(rate()?.txBps)}
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string }) {
  return (
    <div class="min-w-0">
      <dt class="kicker">{props.label}</dt>
      <dd class="mt-1 truncate font-mono text-xs">{["IP", "MAC", "允许地址", "端点"].includes(props.label) && props.value !== "—" ? <CopyText value={props.value} /> : props.value}</dd>
    </div>
  );
}

function Spark(props: { points: HistoryPoint[] }) {
  const path = createMemo(() => {
    const points = props.points;
    if (points.length < 2) return "";
    const max = Math.max(...points.flatMap((point) => [point.rxBps, point.txBps]), 1);
    const w = 280;
    const h = 64;
    const x = (index: number) => (index / (points.length - 1)) * w;
    const y = (value: number) => h - (value / max) * (h - 4) - 2;
    return points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.rxBps).toFixed(1)}`).join(" ");
  });
  return (
    <Show when={props.points.length >= 2} fallback={null}>
      <svg viewBox="0 0 280 64" class="mt-3 h-16 w-full" aria-hidden="true">
        <path d={path()} fill="none" stroke="#3ec6d6" stroke-width="1.6" />
      </svg>
      <p class="text-[11px] text-faint">最近几次采样，不是长期历史。</p>
    </Show>
  );
}
