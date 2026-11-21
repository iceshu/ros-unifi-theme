import {
  AppWindow,
  Archive,
  ArrowLeftRight,
  Bell,
  CalendarClock,
  Clock,
  FileCode,
  Forward,
  GitMerge,
  Globe,
  Hash,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  ListTree,
  MonitorSmartphone,
  Network,
  Plug,
  PlugZap,
  Radar,
  RefreshCw,
  Route,
  ScrollText,
  Server,
  ServerCog,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  SquareTerminal,
  Users,
  Waypoints,
  Wifi,
  Wrench,
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
    title: "监控",
    items: [
      { href: "/events", label: "事件与告警", icon: Bell, keywords: "alerts events notification 通知" },
      { href: "/connections", label: "连接", icon: Waypoints, keywords: "connections conntrack 会话" },
      { href: "/apps", label: "应用", icon: AppWindow, keywords: "apps usage 应用流量" },
      { href: "/tools", label: "诊断工具", icon: Wrench, keywords: "ping traceroute torch 诊断" },
    ],
  },
  {
    title: "网络",
    items: [
      { href: "/wifi", label: "WiFi", icon: Wifi, keywords: "wireless 无线" },
      { href: "/pppoe", label: "PPPoE 拨号", icon: Plug, keywords: "pppoe dial 宽带 拨号" },
      { href: "/routes", label: "路由", icon: Route, keywords: "routes static 静态路由" },
      { href: "/addresses", label: "IP 地址", icon: Hash, keywords: "ip address 地址" },
      { href: "/vlans", label: "VLAN", icon: Layers, keywords: "vlan" },
      { href: "/bridges", label: "网桥", icon: GitMerge, keywords: "bridge 桥" },
      { href: "/interface-lists", label: "接口列表", icon: ListTree, keywords: "interface list WAN LAN" },
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
      { href: "/security", label: "安全检查", icon: ShieldAlert, keywords: "security audit scan 安全" },
    ],
  },
  {
    title: "系统",
    items: [
      { href: "/backups", label: "配置备份", icon: Archive, keywords: "backup export 备份" },
      { href: "/updates", label: "系统更新", icon: RefreshCw, keywords: "upgrade update 升级" },
      { href: "/services", label: "服务", icon: Server, keywords: "ip service www ssh winbox" },
      { href: "/scheduler", label: "计划任务", icon: CalendarClock, keywords: "scheduler cron 定时" },
      { href: "/scripts", label: "脚本", icon: FileCode, keywords: "script" },
      { href: "/time", label: "时间", icon: Clock, keywords: "ntp clock timezone 时区" },
      { href: "/users", label: "RouterOS 用户", icon: Users, keywords: "user group 账号" },
      { href: "/terminal", label: "终端", icon: SquareTerminal, keywords: "terminal cli console 命令行" },
      { href: "/audit", label: "操作审计", icon: History, keywords: "audit 审计 记录" },
      { href: "/log", label: "日志", icon: ScrollText, keywords: "log" },
      { href: "/settings", label: "仪表设置", icon: Settings, keywords: "settings notification webhook 设置 通知" },
      { href: "/connection", label: "仪表状态", icon: PlugZap, keywords: "connection status 连接" },
    ],
  },
];
