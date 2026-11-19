import { createMemo } from "solid-js";
import { ThroughputChart } from "../components/Chart";
import { PageHeader, Pill, RateText, Ring, Skeleton } from "../components/ui";
import { formatBytes, formatUptime } from "../lib/format";
import {
  addressesOn,
  defaultRoute,
  diskUsage,
  flag,
  linkState,
  memoryUsage,
  num,
} from "../lib/model";
import { useDashboard } from "../lib/store";

export function OverviewPage() {
  const dash = useDashboard();
  const wan = createMemo(() => dash.interfaces().find((row) => row.name === dash.primaryWan()));
  const rate = createMemo(() => {
    const name = dash.primaryWan();
    return name ? dash.rates()[name] : undefined;
  });
  const history = createMemo(() => {
    const name = dash.primaryWan();
    return name ? (dash.history()[name] ?? []) : [];
  });
  const client = createMemo(() => dash.pppoe().find((row) => row.name === dash.primaryWan()));
  const carrier = createMemo(() => {
    const parent = client()?.interface;
    if (parent) return dash.interfaces().find((row) => row.name === parent) ?? null;
    const fallback = dash.wanNames().find((name) => name !== dash.primaryWan());
    return dash.interfaces().find((row) => row.name === fallback) ?? null;
  });
  const addresses = createMemo(() => {
    const name = dash.primaryWan();
    return name ? addressesOn(dash.addresses(), name) : [];
  });
  const route = createMemo(() => defaultRoute(dash.routes()));
  const memory = createMemo(() => memoryUsage(dash.resource()));
  const disk = createMemo(() => diskUsage(dash.resource()));
  const cpu = createMemo(() => num(dash.resource()?.["cpu-load"] ?? null));
  const span = createMemo(() => {
    const points = history();
    if (points.length < 2) return "等待采样";
    const seconds = Math.round((points[points.length - 1].t - points[0].t) / 1000);
    if (seconds < 90) return `最近 ${seconds} 秒`;
    return `最近 ${Math.max(1, Math.round(seconds / 60))} 分钟`;
  });
  const offline = () => dash.ready() && dash.error() && !dash.resource() && dash.interfaces().length === 0;

  return (
    <div>
      <PageHeader title="概览" description="看一眼路由器是否在线、互联网通不通，以及当前上下行。数字来自只读轮询，不会改配置。" />
      {offline() ? (
        <section class="card mb-4 p-6">
          <p class="text-lg">还没有读到路由器。</p>
          <p class="mt-2 max-w-2xl text-sm text-muted">{dash.error()?.message}</p>
          <a href="/connection" class="chip mt-4 inline-flex">
            打开连接说明
          </a>
        </section>
      ) : null}
      <div class="grid gap-4 xl:grid-cols-12">
        <section class="card p-5 md:p-6 xl:col-span-8">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="kicker">互联网吞吐 · {dash.primaryWan() || "未识别广域网"}</p>
              <div class="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div class="text-sm text-muted">下载</div>
                  {dash.ready() ? <RateText bps={rate()?.rxBps} large tone="accent" /> : <Skeleton class="mt-2 h-10 w-36" />}
                </div>
                <div>
                  <div class="text-sm text-muted">上传</div>
                  {dash.ready() ? <RateText bps={rate()?.txBps} large tone="good" /> : <Skeleton class="mt-2 h-10 w-36" />}
                </div>
              </div>
            </div>
            <p class="text-xs text-faint">{span()}</p>
          </div>
          <ThroughputChart points={history()} />
          <p class="mt-3 text-xs text-faint">
            下载是广域网接口收到的流量，上传是它发出的流量。PPPoE 和承载它的网口不会加在一起，避免把同一份流量算两次。
          </p>
        </section>
        <section class="card p-5 xl:col-span-4">
          <div class="flex items-center justify-between">
            <p class="kicker">互联网</p>
            <Pill tone={linkState(wan()).tone}>{linkState(wan()).label}</Pill>
          </div>
          <h2 class="mt-4 text-3xl font-semibold tracking-tight">
            {!dash.ready() ? "读取中" : flag(wan()?.running) && !flag(wan()?.disabled) ? "已连接" : wan() ? "未连接" : "没有这个接口"}
          </h2>
          <p class="mt-1 font-mono text-sm text-muted">{dash.primaryWan() || "—"}{client() ? " · PPPoE" : ""}</p>
          <dl class="mt-5 space-y-3 text-sm">
            <Row label="地址" value={addresses().join("，") || "—"} mono />
            {client()?.user ? <Row label="账号" value={client()?.user || ""} /> : null}
            <Row
              label="物理线路"
              value={carrier() ? `${carrier()?.name} · ${linkState(carrier() ?? undefined).label}` : "—"}
            />
            <Row label="默认路由" value={route() ? `${route()?.gateway || "—"}` : "—"} mono />
            <Row label="最近链路起来" value={wan()?.["last-link-up-time"] || "—"} />
          </dl>
        </section>
        <Metric
          label="CPU"
          value={cpu() == null ? "—" : `${Math.round(cpu() ?? 0)}%`}
          hint={dash.resource() ? `${dash.resource()?.cpu || ""} · ${dash.resource()?.["cpu-count"] || "?"} 核` : "等待 /system/resource"}
          percent={cpu()}
        />
        <Metric
          label="内存"
          value={memory() ? `${Math.round(memory()?.percent ?? 0)}%` : "—"}
          hint={memory() ? `${formatBytes(memory()?.used ?? 0)} / ${formatBytes(memory()?.total ?? 0)}` : "已用 / 总计"}
          percent={memory()?.percent ?? null}
        />
        <section class="card p-5 xl:col-span-3">
          <p class="kicker">温度</p>
          {dash.temperature() ? (
            <>
              <p class="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
                {Math.round(dash.temperature()?.value ?? 0)}
                <span class="ml-1 text-lg text-muted">{dash.temperature()?.unit}</span>
              </p>
              <p class="mt-2 text-sm text-muted">{dash.temperature()?.name}</p>
            </>
          ) : (
            <>
              <p class="mt-3 text-3xl font-semibold text-faint">未报告</p>
              <p class="mt-2 text-sm text-muted">这台设备没有在 /system/health 里给出温度，页面不会编一个数字。</p>
            </>
          )}
        </section>
        <section class="card p-5 xl:col-span-3">
          <p class="kicker">运行时间</p>
          <p class="mt-3 text-3xl font-semibold tracking-tight">{formatUptime(dash.resource()?.uptime)}</p>
          <p class="mt-2 text-sm text-muted">{dash.resource()?.version || "RouterOS 版本读取中"}</p>
        </section>
        <section class="card p-5 xl:col-span-12">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="名称" value={dash.identity()?.name || "—"} />
            <Fact label="板卡" value={dash.resource()?.["board-name"] || dash.routerboard()?.model || "—"} />
            <Fact
              label="平台"
              value={`${dash.resource()?.platform || "—"} · ${dash.resource()?.["architecture-name"] || "—"}`}
            />
            <Fact
              label="磁盘"
              value={disk() ? `${formatBytes(disk()?.used ?? 0)} / ${formatBytes(disk()?.total ?? 0)}` : "—"}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Row(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div class="flex items-start justify-between gap-4">
      <dt class="text-muted">{props.label}</dt>
      <dd class={props.mono ? "text-right font-mono" : "text-right"}>{props.value}</dd>
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  return (
    <div>
      <p class="kicker">{props.label}</p>
      <p class="mt-1 text-sm">{props.value}</p>
    </div>
  );
}

function Metric(props: { label: string; value: string; hint: string; percent: number | null }) {
  return (
    <section class="card flex items-center justify-between gap-3 p-5 xl:col-span-3">
      <div>
        <p class="kicker">{props.label}</p>
        <p class="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{props.value}</p>
        <p class="mt-2 text-sm text-muted">{props.hint}</p>
      </div>
      <Ring percent={props.percent} />
    </section>
  );
}
