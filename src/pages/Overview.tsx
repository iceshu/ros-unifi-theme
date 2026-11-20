import { Skeleton } from "../components/ui";
import { createMemo } from "solid-js";
import { ReadTable } from "../components/ReadData";
import { ThroughputChart } from "../components/Chart";
import { TopologyMap } from "../components/TopologyMap";
import { displayArch, formatBps, formatBytes, formatUptime } from "../lib/format";
import {
  addressesOn,
  cleanCpu,
  defaultRoute,
  diskUsage,
  hardwareLabel,
  linkState,
  memoryUsage,
  num,
} from "../lib/model";
import { useDashboard } from "../lib/store";

export function OverviewPage() {
  const dash = useDashboard();
  const wanName = () => dash.primaryWan();
  const wan = createMemo(() => dash.interfaces().find((row) => row.name === wanName()));
  const rate = createMemo(() => {
    const name = wanName();
    return name ? dash.rates()[name] : undefined;
  });
  const history = createMemo(() => {
    const name = wanName();
    return name ? (dash.history()[name] ?? []) : [];
  });
  const client = createMemo(() => dash.pppoe().find((row) => row.name === wanName()));
  const carrier = createMemo(() => {
    const parent = client()?.interface;
    if (parent) return dash.interfaces().find((row) => row.name === parent) ?? null;
    const fallback = dash.wanNames().find((name) => name !== wanName());
    return dash.interfaces().find((row) => row.name === fallback) ?? null;
  });
  const addresses = createMemo(() => {
    const name = wanName();
    return name ? addressesOn(dash.addresses(), name) : [];
  });
  const route = createMemo(() => defaultRoute(dash.routes()));
  const memory = createMemo(() => memoryUsage(dash.resource()));
  const disk = createMemo(() => diskUsage(dash.resource()));
  const cpu = createMemo(() => num(dash.resource()?.["cpu-load"] ?? null));
  const hardware = createMemo(() => hardwareLabel(dash.resource(), dash.routerboard()));
  const arch = createMemo(() => displayArch(dash.resource()?.["architecture-name"]));
  const version = createMemo(() => (dash.resource()?.version || "").replace(/\s*\(.*\)\s*$/, ""));
  const offline = () => dash.ready() && !!dash.error() && !dash.resource() && dash.interfaces().length === 0;

  return (
    <div class="space-y-3">
      {offline() ? (
        <section class="card px-4 py-3 text-sm">
          <p>{dash.error()?.message}</p>
          <a href="/connection" class="mt-2 inline-block text-accent">
            连接
          </a>
        </section>
      ) : null}

      <TopologyMap />

      <section class="card px-4 py-3">
        <div class="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div class="flex flex-wrap gap-8">
            <div>
              <div class="kicker flex items-center gap-2"><i class="h-0.5 w-3 rounded-full bg-accent" />下载</div>
              <div class="rate-xl mt-1">
                <span class="tabular-nums">{formatBps(rate()?.rxBps ?? null)?.value ?? "—"}</span>
                <span class="rate-unit">{formatBps(rate()?.rxBps ?? null)?.unit ?? ""}</span>
              </div>
            </div>
            <div>
              <div class="kicker flex items-center gap-2"><i class="h-0.5 w-3 rounded-full bg-good" />上传</div>
              <div class="rate-xl mt-1">
                <span class="tabular-nums">{formatBps(rate()?.txBps ?? null)?.value ?? "—"}</span>
                <span class="rate-unit">{formatBps(rate()?.txBps ?? null)?.unit ?? ""}</span>
              </div>
            </div>
          </div>
          <div class="text-xs text-faint">{wanName()}</div>
        </div>
        <ThroughputChart points={history()} now={dash.now()} />
      </section>

      <section class="grid gap-3 lg:grid-cols-5">
        <div class="card grid gap-3 px-4 py-3 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
          <Stat
            label="CPU"
            value={cpu() == null ? "—" : `${Math.round(cpu() ?? 0)}%`}
            percent={cpu()}
            hint={[cleanCpu(dash.resource()?.cpu), dash.resource()?.["cpu-count"] ? `${dash.resource()?.["cpu-count"]} 核` : ""]
              .filter(Boolean)
              .join(" · ")}
          />
          <Stat
            label="内存"
            value={memory() ? `${Math.round(memory()?.percent ?? 0)}%` : "—"}
            percent={memory()?.percent ?? null}
            hint={memory() ? `${formatBytes(memory()?.used ?? 0)} / ${formatBytes(memory()?.total ?? 0)}` : ""}
          />
          <Stat label="运行" value={formatUptime(dash.resource()?.uptime)} hint={version()} />
          <Stat
            label={hardware() && hardware() !== arch() ? "硬件" : "平台"}
            value={hardware() || "—"}
            hint={[dash.resource()?.platform, arch() && arch() !== hardware() ? arch() : "", disk() ? `磁盘 ${formatBytes(disk()?.used ?? 0)}` : ""]
              .filter(Boolean)
              .join(" · ")}
          />
          {dash.temperature() ? (
            <Stat
              label="温度"
              value={`${Math.round(dash.temperature()?.value ?? 0)}${dash.temperature()?.unit || ""}`}
              hint=""
            />
          ) : null}
        </div>
        <div class="card grid content-center gap-2 px-4 py-3 text-sm lg:col-span-2 sm:grid-cols-2">
          <Fact label="地址" value={addresses()[0] || "—"} />
          {client()?.user ? <Fact label="账号" value={client()?.user || ""} /> : null}
          <Fact label="线路" value={carrier() ? `${carrier()?.name} ${linkState(carrier() ?? undefined).label}` : "—"} />
          <Fact label="路由" value={route()?.gateway || "—"} />
          <Fact label="链路" value={wan()?.["last-link-up-time"] || "—"} />
        </div>
      </section>
      {dash.pppActive().length > 0 ? <ReadTable title="PPP 会话" rows={dash.pppActive()} fields={["name", "service", "caller-id", "address", "uptime"]} /> : null}
    </div>
  );
}

function Stat(props: { label: string; value: string; hint?: string; percent?: number | null }) {
  const dash = useDashboard();
  return (
    <div class="min-w-0">
      <div class="kicker">{props.label}</div>
      {!dash.ready() ? <div class="mt-1" aria-busy="true"><Skeleton class="h-7 w-24" /><Skeleton class="mt-2 h-3 w-32" /></div> : <div class="mt-1 truncate text-xl font-medium tabular-nums">{props.value}</div>}
      {dash.ready() && props.percent != null ? (
        <div class="meter mt-2">
          <i style={{ width: `${Math.max(0, Math.min(100, props.percent))}%` }} />
        </div>
      ) : null}
      {dash.ready() && props.hint ? <div class="mt-1 truncate text-xs text-faint">{props.hint}</div> : null}
    </div>
  );
}

function Fact(props: { label: string; value: string }) {
  const dash = useDashboard();
  return (
    <div class="min-w-0">
      <div class="kicker">{props.label}</div>
      {!dash.ready() ? <Skeleton class="mt-1 h-4 w-32" /> : <div class="mt-1 truncate font-mono text-xs">{props.value}</div>}
    </div>
  );
}
