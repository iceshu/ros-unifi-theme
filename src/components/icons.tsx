import type { JSX } from "@solidjs/web";

type IconProps = { class?: string };

function base(props: IconProps): JSX.SvgSVGAttributes<SVGSVGElement> {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.7,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    class: props.class ?? "h-5 w-5",
    "aria-hidden": "true",
  };
}

export function IconMark() {
  return (
    <svg viewBox="0 0 32 32" class="h-9 w-9 text-accent" aria-hidden="true">
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
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <path d="M13 16.5h7M16.5 13v7" />
    </svg>
  );
}

export function IconDevices(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="7" cy="8" r="2" />
      <circle cx="17" cy="8" r="2" />
      <circle cx="12" cy="16" r="2" />
      <path d="M8.7 9.4 10.5 14.2M15.3 9.4 13.5 14.2M7 10v2.5a5 5 0 0 0 10 0V10" />
    </svg>
  );
}

export function IconPorts(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M7 7V5M12 7V5M17 7V5" />
    </svg>
  );
}

export function IconShield(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3 5 6v6c0 4.2 2.8 7.2 7 8.5 4.2-1.3 7-4.3 7-8.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconRoutes(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 7.5h4a4 4 0 0 1 4 4V16" />
    </svg>
  );
}

export function IconTunnel(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 8h6a4 4 0 0 1 0 8H5M19 8h-6a4 4 0 0 0 0 8h6" />
      <path d="M8 12h8" />
    </svg>
  );
}

export function IconPlug(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 8V4M16 8V4M7 8h10v3a5 5 0 0 1-10 0V8Z" />
      <path d="M12 16v4" />
    </svg>
  );
}
