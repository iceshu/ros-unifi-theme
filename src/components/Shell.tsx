import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "@lucide/solid";
import { useLocation } from "@solidjs/router";
import { createEffect, createMemo, createSignal, onSettled, Show, type ParentProps } from "solid-js";
import { logout } from "../lib/api";
import { formatAgo } from "../lib/format";
import { can, session, setSession } from "../lib/session";
import { useDashboard } from "../lib/store";
import { theme, toggleTheme } from "../lib/theme";
import { CommandPalette } from "./CommandPalette";
import { DetailDrawer } from "./DetailDrawer";
import { NAV, IconMark, type NavItem } from "./icons";
import { RateText } from "./ui";

const RAIL_KEY = "rut-rail";

function NavLink(props: { item: NavItem }) {
  const location = useLocation();
  const active = () => location.pathname === props.item.href;
  const Icon = props.item.icon;
  return (
    <a href={props.item.href} class={active() ? "nav-link is-active" : "nav-link"} title={props.item.label} aria-current={active() ? "page" : undefined}>
      <Icon aria-hidden="true" />
      <span class="nav-label truncate">{props.item.label}</span>
    </a>
  );
}

export function Shell(props: ParentProps) {
  const dash = useDashboard();
  const location = useLocation();
  const [palette, setPalette] = createSignal(false);
  const [rail, setRail] = createSignal(localStorage.getItem(RAIL_KEY) === "1");
  const [menu, setMenu] = createSignal(false);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  const pageTitle = createMemo(() => {
    for (const group of NAV) for (const item of group.items) if (item.href === location.pathname) return item.label;
    return "网关";
  });

  createEffect(
    () => dash.identity()?.name ?? "",
    (name) => {
      document.title = name ? `${name} · 网关` : "网关";
    },
  );
  createEffect(rail, (value) => {
    document.documentElement.dataset.rail = value ? "1" : "0";
    localStorage.setItem(RAIL_KEY, value ? "1" : "0");
  });
  createEffect(menu, (value) => {
    document.documentElement.dataset.menu = value ? "1" : "0";
  });
  createEffect(
    () => location.pathname,
    () => {
      setMenu(false);
    },
  );

  onSettled(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  });

  const wanRate = () => {
    const name = dash.primaryWan();
    return name ? dash.rates()[name] : undefined;
  };
  const status = () => (dash.meta()?.demo ? "演示" : dash.error() ? "未连接" : dash.ready() ? "已连接" : "连接中");
  const statusTone = () => (dash.error() ? "led-bad" : dash.ready() ? "led-good led-live" : "led-muted");

  return (
    <div class="min-h-screen">
      <aside class="sidebar" aria-label="主导航">
        <div class="brand">
          <IconMark />
          <div class="brand-text min-w-0">
            <div class="text-[15px] font-semibold tracking-tight">网关</div>
            <div class="truncate text-[11.5px] text-faint">{dash.identity()?.name || "RouterOS"}</div>
          </div>
        </div>
        <nav class="nav-scroll">
          {NAV.map((group) => (
            <div class="nav-group">
              {group.title ? <div class="nav-group-title">{group.title}</div> : null}
              <div class="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavLink item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div class="border-t border-line px-3 py-3">
          <div class="sidebar-foot-text mb-2 flex min-w-0 items-center gap-2 px-1 text-[12px] text-muted">
            <i class={`led ${statusTone()}`} />
            <span class="truncate">{status()}</span>
          </div>
          <div class="foot-actions flex items-center gap-2">
            <span class="sidebar-foot-text min-w-0 flex-1 px-1" title={session()?.policies.join(", ")}>
              <span class="block truncate text-[13px] font-medium">{session()?.user}</span>
              <span class="block truncate text-[11.5px] text-faint">
                {session()?.group || "组未知"} · {can("write") ? "可修改" : "只读"}
              </span>
            </span>
            <button
              type="button"
              class="icon-btn"
              aria-label="退出登录"
              title="退出登录"
              onClick={async () => {
                await logout().catch(() => undefined);
                setSession(null);
              }}
            >
              <LogOut aria-hidden="true" />
            </button>
            <button type="button" class="icon-btn hidden lg:inline-grid" aria-label={rail() ? "展开侧栏" : "收起侧栏"} onClick={() => setRail(!rail())}>
              {rail() ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
            </button>
          </div>
        </div>
      </aside>
      <Show when={menu()}>
        <div class="fixed inset-0 z-[35] bg-black/30 lg:hidden" onClick={() => setMenu(false)} />
      </Show>

      <div class="shell">
        <header class="topbar">
          <button type="button" class="icon-btn lg:hidden" aria-label="打开菜单" onClick={() => setMenu(true)}>
            <Menu aria-hidden="true" />
          </button>
          <div class="min-w-0">
            <div class="truncate text-[15px] font-semibold">{pageTitle()}</div>
          </div>
          <div class="flex-1" />
          <button type="button" class="search-trigger" onClick={() => setPalette(true)} aria-label="搜索">
            <Search class="h-4 w-4" aria-hidden="true" />
            <span class="hide-sm">搜索客户端、端口、页面</span>
            <span class="kbd hide-sm">{isMac ? "⌘K" : "Ctrl K"}</span>
          </button>
          <button
            type="button"
            class="wan-chip hidden sm:inline-flex"
            title={`互联网 ${dash.primaryWan() ?? ""}`}
            onClick={() => dash.setSelection({ type: "internet" })}
          >
            <i class={`led ${dash.wanUp() ? "led-good led-live" : dash.ready() ? "led-bad" : "led-muted"}`} />
            <RateText bps={wanRate()?.rxBps} dir="down" />
            <RateText bps={wanRate()?.txBps} dir="up" />
          </button>
          <span class="hidden text-[12px] text-faint xl:inline">{formatAgo(dash.updatedAt(), dash.now())}</span>
          <button type="button" class="icon-btn" aria-label={theme() === "dark" ? "切换到浅色" : "切换到深色"} onClick={toggleTheme}>
            {theme() === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </header>
        {dash.meta()?.demo ? (
          <div class="banner banner-demo">
            <p>演示模式：数据由程序生成，不是路由器的实时数据。</p>
          </div>
        ) : null}
        {dash.error() ? (
          <div class="banner banner-error">
            <p>{dash.error()?.message}</p>
            <span class="flex gap-2">
              <button type="button" class="chip button-primary" onClick={() => dash.retry()}>
                立即重试
              </button>
              <a href="/connection" class="chip">
                查看原因
              </a>
            </span>
          </div>
        ) : null}
        <main class="page">{props.children}</main>
        <DetailDrawer />
      </div>
      <Show when={palette()}>
        <CommandPalette onClose={() => setPalette(false)} />
      </Show>
    </div>
  );
}
