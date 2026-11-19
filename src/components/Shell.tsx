import { createEffect, type ParentProps } from "solid-js";
import { useLocation } from "@solidjs/router";
import { formatAgo, formatBps } from "../lib/format";
import { useDashboard } from "../lib/store";
import {
  IconDevices,
  IconMark,
  IconOverview,
  IconPlug,
  IconPorts,
  IconRoutes,
  IconShield,
  IconTunnel,
} from "./icons";

const LINKS = [
  { href: "/", label: "概览", icon: IconOverview },
  { href: "/devices", label: "设备", icon: IconDevices },
  { href: "/interfaces", label: "接口", icon: IconPorts },
  { href: "/firewall", label: "防火墙", icon: IconShield },
  { href: "/routes", label: "路由", icon: IconRoutes },
  { href: "/wireguard", label: "WireGuard", icon: IconTunnel },
];

function NavLink(props: { href: string; label: string; icon: typeof IconOverview }) {
  const location = useLocation();
  const active = () => (props.href === "/" ? location.pathname === "/" : location.pathname === props.href);
  const Icon = props.icon;
  return (
    <a href={props.href} class={active() ? "nav-link is-active" : "nav-link"}>
      <Icon />
      <span>{props.label}</span>
    </a>
  );
}

export function Shell(props: ParentProps) {
  const dash = useDashboard();
  createEffect(
    () => dash.identity()?.name ?? "",
    (name) => {
      document.title = name ? `${name} · 网关` : "网关";
    },
  );

  const throughput = () => {
    const name = dash.primaryWan();
    if (!name) return null;
    return dash.rates()[name] ?? null;
  };

  return (
    <div class="min-h-screen">
      <aside class="sidebar">
        <div class="flex items-center gap-3 px-4 py-5">
          <IconMark />
          <div>
            <div class="text-base font-semibold tracking-tight">网关</div>
            <div class="text-xs text-faint">{dash.identity()?.name || "RouterOS"}</div>
          </div>
        </div>
        <nav class="flex flex-1 flex-col gap-1 px-3">
          {LINKS.map((link) => (
            <NavLink href={link.href} label={link.label} icon={link.icon} />
          ))}
        </nav>
        <div class="space-y-3 px-3 pb-4">
          <NavLink href="/connection" label="连接" icon={IconPlug} />
          <div class="flex items-center justify-between px-2 text-xs text-faint">
            <span class="pill pill-muted">只读</span>
            <span class="inline-flex items-center gap-2">
              <i class={`led ${dash.error() ? "led-bad" : dash.ready() ? "led-good" : "led-muted"}`} />
              {dash.meta()?.demo ? "演示" : dash.error() ? "未连接" : dash.ready() ? "已连接" : "连接中"}
            </span>
          </div>
        </div>
      </aside>
      <div class="shell">
        <header class="sticky top-0 z-20 border-b border-line/80 bg-canvas/80 px-4 py-3 backdrop-blur md:px-8">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="text-sm text-muted">{dash.identity()?.name || "正在读取身份"}</div>
              <div class="font-mono text-xs text-faint">
                {dash.clock()?.date || "—"} {dash.clock()?.time || ""} {dash.clock()?.["time-zone-name"] || ""}
              </div>
            </div>
            <div class="flex items-center gap-5">
              <div class="hidden text-right sm:block">
                <div class="text-[11px] text-faint">互联网 {dash.primaryWan() || ""}</div>
                <div class="font-mono text-sm">
                  <span class="text-accent">↓ {formatBps(throughput()?.rxBps ?? null)?.value ?? "—"}</span>
                  <span class="ml-1 text-faint">{formatBps(throughput()?.rxBps ?? null)?.unit ?? ""}</span>
                  <span class="ml-3 text-good">↑ {formatBps(throughput()?.txBps ?? null)?.value ?? "—"}</span>
                  <span class="ml-1 text-faint">{formatBps(throughput()?.txBps ?? null)?.unit ?? ""}</span>
                </div>
              </div>
              <div class="text-right text-xs text-faint">{formatAgo(dash.updatedAt(), dash.now())}</div>
            </div>
          </div>
          <div class="mobile-nav mt-3">
            {LINKS.map((link) => (
              <NavLink href={link.href} label={link.label} icon={link.icon} />
            ))}
            <NavLink href="/connection" label="连接" icon={IconPlug} />
          </div>
        </header>
        {dash.meta()?.demo ? (
          <div class="banner banner-demo">
            <p>演示模式。这些数字是内置样例，用来在连不上路由器时看界面，不是这台网络上的实时数据。</p>
          </div>
        ) : null}
        {dash.error() ? (
          <div class="banner banner-error">
            <p>{dash.error()?.message}</p>
            <span class="flex gap-3">
              <button type="button" class="chip" onClick={() => dash.retry()}>
                立即重试
              </button>
              <a href="/connection" class="chip">
                查看原因
              </a>
            </span>
          </div>
        ) : null}
        <main class="px-4 py-5 md:px-8 md:py-6">{props.children}</main>
      </div>
    </div>
  );
}
