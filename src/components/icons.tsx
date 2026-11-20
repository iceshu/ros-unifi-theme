import {
  ArrowLeftRight,
  Forward,
  Globe,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  MonitorSmartphone,
  Network,
  PlugZap,
  Radar,
  Route,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Share2,
  Wifi,
} from "@lucide/solid";

export function IconMark(props: { class?: string }) {
  return (
    <svg viewBox="0 0 32 32" class={props.class ?? "h-8 w-8"} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <g fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round">
        <path d="M7.5 18.5a8.5 8.5 0 0 1 17 0" opacity="0.45" />
        <path d="M11 18.5a5 5 0 0 1 10 0" opacity="0.75" />
      </g>
      <circle cx="16" cy="19" r="1.9" fill="#fff" />
    </svg>
  );
}

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Globe;
  keywords?: string;
}

/** Sidebar groups; the command palette indexes the same list. */
export const NAV: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "",
    items: [
      { href: "/", label: "概览", icon: LayoutDashboard, keywords: "dashboard overview" },
      { href: "/topology", label: "拓扑", icon: Share2, keywords: "topology map" },
      { href: "/devices", label: "客户端", icon: MonitorSmartphone, keywords: "clients devices 设备" },
      { href: "/interfaces", label: "端口", icon: Network, keywords: "ports interfaces 接口" },
    ],
  },
  {
    title: "网络",
    items: [
      { href: "/wifi", label: "WiFi", icon: Wifi, keywords: "wireless 无线" },
      { href: "/routes", label: "路由", icon: Route, keywords: "routes" },
      { href: "/dhcp", label: "DHCP", icon: ServerCog },
      { href: "/dns", label: "DNS", icon: Globe },
      { href: "/queues", label: "队列", icon: ListOrdered, keywords: "queue qos 限速" },
      { href: "/neighbors", label: "邻居", icon: Radar, keywords: "neighbor lldp" },
    ],
  },
  {
    title: "安全",
    items: [
      { href: "/firewall", label: "防火墙", icon: ShieldCheck, keywords: "firewall filter mangle" },
      { href: "/port-forwarding", label: "端口转发", icon: Forward, keywords: "port forward dstnat 映射" },
      { href: "/nat", label: "NAT", icon: ArrowLeftRight, keywords: "srcnat masquerade" },
      { href: "/address-lists", label: "地址列表", icon: ListChecks, keywords: "address list" },
      { href: "/wireguard", label: "WireGuard", icon: KeyRound, keywords: "vpn wg" },
    ],
  },
  {
    title: "系统",
    items: [
      { href: "/log", label: "日志", icon: ScrollText, keywords: "log" },
      { href: "/connection", label: "连接", icon: PlugZap, keywords: "connection settings 设置" },
    ],
  },
];
