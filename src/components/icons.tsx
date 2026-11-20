import {
  ArrowLeftRight,
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
  Wifi,
} from "@lucide/solid";

type IconProps = { class?: string };

export function IconMark(props: IconProps = {}) {
  return (
    <svg viewBox="0 0 32 32" class={props.class ?? "h-9 w-9 text-accent"} aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <path d="M6 19a10 10 0 0 1 20 0" opacity="0.35" />
        <path d="M10 19a6 6 0 0 1 12 0" opacity="0.7" />
        <path d="M14 19a2 2 0 0 1 4 0" />
      </g>
      <circle cx="16" cy="19.2" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconOverview(props: IconProps) {
  return <LayoutDashboard class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconDevices(props: IconProps) {
  return <MonitorSmartphone class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconPorts(props: IconProps) {
  return <Network class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconShield(props: IconProps) {
  return <ShieldCheck class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconRoutes(props: IconProps) {
  return <Route class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconTunnel(props: IconProps) {
  return <KeyRound class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconPlug(props: IconProps) {
  return <PlugZap class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconWifi(props: IconProps) {
  return <Wifi class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconNat(props: IconProps) {
  return <ArrowLeftRight class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconAddressList(props: IconProps) {
  return <ListChecks class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconDhcp(props: IconProps) {
  return <ServerCog class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconDns(props: IconProps) {
  return <Globe class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconNeighbors(props: IconProps) {
  return <Radar class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconQueues(props: IconProps) {
  return <ListOrdered class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}

export function IconLog(props: IconProps) {
  return <ScrollText class={props.class ?? "h-5 w-5"} aria-hidden="true" />;
}
