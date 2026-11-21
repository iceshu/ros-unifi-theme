import { ArrowRight, Cpu, Globe, MonitorSmartphone, Router, Thermometer } from "@lucide/solid";
import { useNavigate } from "@solidjs/router";
import type { JSX } from "@solidjs/web";
import { createMemo, For, Show } from "solid-js";
import { InterfaceTraffic } from "../components/Chart";
import { EChart, chartColors, chartTooltip, type ChartOption } from "../components/charts";
import { DeviceIcon, KIND_LABELS } from "../components/DeviceIcon";
import { ReadTable } from "../components/ReadData";
import { TopologyCanvas } from "../components/TopologyCanvas";
import { Card, Meter, RateText, Skeleton } from "../components/ui";
import { formatBytes, formatUptime } from "../lib/format";
import { addressesOn, cleanCpu, diskUsage, flag, hardwareLabel, linkState, memoryUsage, num, type DeviceKind } from "../lib/model";
import { useDashboard } from "../lib/store";

export function OverviewPage() {
  const dash = useDashboard();
  const navigate = useNavigate();
  const wanName = () => dash.primaryWan();
  const wanRate = createMemo(() => (wanName() ? dash.rates()[wanName()!] : undefined));
  const wanIp = createMemo(() => (wanName() ? addressesOn(dash.addresses(), wanName()!)[0] : undefined));
  const memory = createMemo(() => memoryUsage(dash.resource()));
  const disk = createMemo(() => diskUsage(dash.resource()));
  const cpu = createMemo(() => num(dash.resource()?.["cpu-load"] ?? null));
  const version = createMemo(() => (dash.resource()?.version || "").replace(/\s*\(.*\)\s*$/, ""));
  const online = createMemo(() => dash.clients().filter((client) => client.online));
  const wireless = createMemo(() => online().filter((client) => client.wireless).length);
  const offline = () => dash.ready() && !!dash.error() && !dash.resource() && dash.interfaces().length === 0;

  const topClients = createMemo(() => {
    const traffic = dash.clientTraffic();
    return dash
      .clients()
      .filter((client) => client.ip && traffic[client.ip])
      .map((client) => ({ client, rate: traffic[client.ip], total: (traffic[client.ip].rxBps ?? 0) + (traffic[client.ip].txBps ?? 0) }))
      .sort((a, b) => b.total - a.total || b.rate.downBytes + b.rate.upBytes - (a.rate.downBytes + a.rate.upBytes))
      .slice(0, 6);
  });
  const topMax = createMemo(() => Math.max(1, ...topClients().map((item) => item.total)));

  const kinds = createMemo(() => {
    const counts = new Map<DeviceKind, number>();
    for (const client of dash.clients()) counts.set(client.kind, (counts.get(client.kind) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  });
  const donut = createMemo<ChartOption>(() => {
    const colors = chartColors();
    return {
      color: colors.palette,
      tooltip: { ...chartTooltip(), trigger: "item", formatter: "{b}：{c} 台（{d}%）" },
      legend: { type: "scroll", orient: "vertical", right: 0, top: "middle", icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: colors.muted, fontSize: 12 } },
      series: [
        {
          type: "pie",
          radius: ["58%", "82%"],
          center: ["32%", "50%"],
          avoidLabelOverlap: true,
          label: { show: true, position: "center", formatter: () => `${dash.clients().length}\n客户端`, color: colors.ink, fontSize: 16, lineHeight: 20, fontWeight: 600 },
          labelLine: { show: false },
          itemStyle: { borderColor: colors.background, borderWidth: 2, borderRadius: 4 },
          emphasis: { scale: true, scaleSize: 4, label: { show: true, formatter: "{c}\n{b}", fontSize: 14 } },
          data: kinds().map(([kind, value]) => ({ name: KIND_LABELS[kind], value })),
        },
      ],
    };
  });

  const ports = createMemo(() =>
    dash
      .interfaces()
      .filter((row) => ["ether", "pppoe-out", "bridge", "wg", "wifi", "vlan"].includes(row.type || "") && !flag(row.disabled))
      .map((row) => ({ row, rate: dash.rates()[row.name] }))
      .sort((a, b) => (b.rate?.rxBps ?? 0) + (b.rate?.txBps ?? 0) - ((a.rate?.rxBps ?? 0) + (a.rate?.txBps ?? 0)))
      .slice(0, 7),
  );

  return (
    <div class="space-y-4">
      <Show when={offline()}>
        <section class="card flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <p class="text-bad">{dash.error()?.message}</p>
          <a href="/connection" class="chip">
            查看连接 <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </section>
      </Show>

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Globe aria-hidden="true" />} label="互联网" onClick={() => dash.setSelection({ type: "internet" })}>
          <div class="flex items-center gap-2 text-[18px] font-semibold">
            <i class={`led ${dash.wanUp() ? "led-good led-live" : dash.ready() ? "led-bad" : "led-muted"}`} />
            {!dash.ready() ? "读取中" : dash.wanUp() ? "已连接" : "未连接"}
          </div>
          <div class="mt-1 truncate font-mono text-[12px] text-muted">{wanIp() || "—"}</div>
          <div class="mt-0.5 truncate text-[12px] text-faint">
            {wanName() || "—"}
            {dash.carrierName() ? ` · ${dash.carrierName()}` : ""} · 上线 {dash.wanRow()?.["last-link-up-time"] || "—"}
          </div>
        </Kpi>
        <Kpi icon={<Router aria-hidden="true" />} label="网关" onClick={() => dash.setSelection({ type: "gateway" })}>
          <div class="truncate text-[18px] font-semibold">{dash.identity()?.name || "—"}</div>
          <div class="mt-1 truncate text-[12px] text-muted">
            {hardwareLabel(dash.resource(), dash.routerboard()) || "—"} · RouterOS {version() || "—"}
          </div>
          <div class="mt-0.5 text-[12px] text-faint">运行 {formatUptime(dash.resource()?.uptime)}</div>
        </Kpi>
        <Kpi icon={<MonitorSmartphone aria-hidden="true" />} label="客户端" href="/devices">
          <div class="flex items-baseline gap-1.5">
            <span class="text-[22px] font-semibold num">{online().length}</span>
            <span class="text-[12px] text-muted">在线 / {dash.clients().length}</span>
          </div>
          <div class="mt-1 text-[12px] text-muted">
            有线 {online().length - wireless()} · 无线 {wireless()}
          </div>
          <div class="mt-0.5 text-[12px] text-faint">{dash.leases().length} 条 DHCP 租约</div>
        </Kpi>
        <Kpi icon={<Cpu aria-hidden="true" />} label="系统资源" onClick={() => dash.setSelection({ type: "gateway" })}>
          <Show when={dash.resource()} fallback={<Skeleton class="mt-2 h-10 w-full" />}>
            <div class="grid gap-2 text-[12px]">
              <div>
                <div class="mb-1 flex justify-between">
                  <span class="text-muted">CPU · {cleanCpu(dash.resource()?.cpu) || "—"}</span>
                  <span class="num font-medium">{cpu() == null ? "—" : `${Math.round(cpu()!)}%`}</span>
                </div>
                <Meter percent={cpu()} />
              </div>
              <div>
                <div class="mb-1 flex justify-between">
                  <span class="text-muted">内存 {memory() ? `${formatBytes(memory()!.used)} / ${formatBytes(memory()!.total)}` : ""}</span>
                  <span class="num font-medium">{memory() ? `${Math.round(memory()!.percent)}%` : "—"}</span>
                </div>
                <Meter percent={memory()?.percent} />
              </div>
              <div class="flex justify-between text-faint">
                <span>{disk() ? `存储 ${Math.round(disk()!.percent)}%` : ""}</span>
                <Show when={dash.temperature()}>
                  {(temp) => (
                    <span class="inline-flex items-center gap-1">
                      <Thermometer class="h-3.5 w-3.5" aria-hidden="true" />
                      {Math.round(temp().value)}
                      {temp().unit}
                    </span>
                  )}
                </Show>
              </div>
            </div>
          </Show>
        </Kpi>
      </div>

      <div class="grid gap-4 xl:grid-cols-3">
        <Card
          title={`互联网流量 · ${wanName() || "—"}`}
          class="xl:col-span-2"
          actions={
            <span class="flex gap-3 text-[12px]">
              <RateText bps={wanRate()?.rxBps} dir="down" />
              <RateText bps={wanRate()?.txBps} dir="up" />
            </span>
          }
        >
          <div class="px-4 pb-4">
            <InterfaceTraffic name={wanName()} height={250} initialRange={3600} />
          </div>
        </Card>
        <Card title="流量最高的客户端" actions={<a href="/devices" class="text-[12px] text-accent">全部</a>}>
          <div class="px-2 pb-3">
            <Show
              when={topClients().length > 0}
              fallback={<p class="px-2 py-10 text-center text-[13px] text-faint">{dash.connectionsLoaded() ? "当前没有活动连接" : "正在读取连接表…"}</p>}
            >
              <For each={topClients()}>
                {(item) => (
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover"
                    onClick={() => dash.setSelection({ type: "client", ip: item.client.ip, mac: item.client.mac })}
                  >
                    <DeviceIcon kind={item.client.kind} online={item.client.online} />
                    <span class="min-w-0 flex-1">
                      <span class="flex items-center justify-between gap-2">
                        <span class="truncate text-[13px] font-medium">{item.client.title}</span>
                        <span class="flex shrink-0 gap-2 text-[11.5px]">
                          <RateText bps={item.rate.rxBps} dir="down" />
                          <RateText bps={item.rate.txBps} dir="up" />
                        </span>
                      </span>
                      <span class="mt-1.5 flex h-1 overflow-hidden rounded-full bg-hover">
                        <i class="h-full bg-accent transition-all duration-500" style={{ width: `${((item.rate.rxBps ?? 0) / topMax()) * 100}%` }} />
                        <i class="h-full transition-all duration-500" style={{ width: `${((item.rate.txBps ?? 0) / topMax()) * 100}%`, background: "var(--color-upload)" }} />
                      </span>
                    </span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </Card>
      </div>

      <Card
        title="网络拓扑"
        actions={
          <a href="/topology" class="chip">
            全屏查看 <ArrowRight class="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        }
      >
        <div class="border-t border-line">
          <TopologyCanvas height="460px" />
        </div>
      </Card>

      <div class="grid gap-4 lg:grid-cols-2">
        <Card title="客户端类型" actions={<span class="text-[12px] text-faint">点击查看列表</span>}>
          <div class="px-3 pb-3">
            <EChart option={donut()} height={220} onClick={() => navigate("/devices")} />
          </div>
        </Card>
        <Card title="接口实时速率" actions={<a href="/interfaces" class="text-[12px] text-accent">端口</a>}>
          <div class="px-2 pb-3">
            <For each={ports()}>
              {(item) => (
                <button
                  type="button"
                  class="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] transition-colors hover:bg-hover"
                  onClick={() => dash.setSelection({ type: "iface", name: item.row.name })}
                >
                  <i class={`led led-${linkState(item.row).tone}`} />
                  <span class="w-24 shrink-0 truncate font-medium">{item.row.name}</span>
                  <span class="min-w-0 flex-1 truncate text-[12px] text-faint">{item.row.comment || item.row.type}</span>
                  <RateText bps={item.rate?.rxBps} dir="down" class="w-24 justify-end text-[12px]" />
                  <RateText bps={item.rate?.txBps} dir="up" class="w-24 justify-end text-[12px]" />
                </button>
              )}
            </For>
          </div>
        </Card>
      </div>

      <Show when={dash.pppActive().length > 0}>
        <ReadTable title="PPP 会话" rows={dash.pppActive()} fields={["name", "service", "caller-id", "address", "uptime"]} searchable={false} />
      </Show>
    </div>
  );
}

function Kpi(props: { icon: JSX.Element; label: string; href?: string; onClick?: () => void; children: JSX.Element }) {
  const body = (
    <>
      <div class="mb-2 flex items-center gap-2 text-[12px] font-medium text-muted">
        <span class="grid h-6 w-6 place-items-center rounded-md bg-accent-soft text-accent [&>svg]:h-3.5 [&>svg]:w-3.5">{props.icon}</span>
        {props.label}
      </div>
      {props.children}
    </>
  );
  const cls = "card block p-4 text-left transition-[border-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-md";
  return props.href ? (
    <a href={props.href} class={cls}>
      {body}
    </a>
  ) : (
    <button type="button" class={cls} onClick={() => props.onClick?.()}>
      {body}
    </button>
  );
}
