import type { DeviceKind } from "../lib/model";

export function DeviceIcon(props: { kind: DeviceKind }) {
  return (
    <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/6 text-ink/80">
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        {props.kind === "phone" ? (
          <rect x="8" y="3" width="8" height="18" rx="2" />
        ) : props.kind === "laptop" ? (
          <path d="M4 16h16M6 16V7h12v9" />
        ) : props.kind === "server" ? (
          <>
            <rect x="4" y="4" width="16" height="6" rx="1" />
            <rect x="4" y="14" width="16" height="6" rx="1" />
          </>
        ) : props.kind === "nas" ? (
          <>
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h.01M7 14h.01M12 10h5M12 14h5" />
          </>
        ) : props.kind === "ap" ? (
          <>
            <path d="M12 16v3M8 16a4 4 0 0 1 8 0M5 13a8 8 0 0 1 14 0" />
          </>
        ) : props.kind === "camera" ? (
          <>
            <path d="M4 8h10l3-3h3v14h-3l-3-3H4V8Z" />
          </>
        ) : props.kind === "tv" ? (
          <>
            <rect x="3" y="6" width="18" height="11" rx="1.5" />
            <path d="M8 20h8" />
          </>
        ) : props.kind === "console" ? (
          <>
            <rect x="3" y="8" width="18" height="8" rx="4" />
            <path d="M8 12h.01M16 11v2M15 12h2" />
          </>
        ) : props.kind === "speaker" ? (
          <>
            <rect x="8" y="3" width="8" height="18" rx="3" />
            <circle cx="12" cy="15" r="2" />
          </>
        ) : props.kind === "printer" ? (
          <>
            <path d="M7 8V4h10v4M6 16H4V9h16v7h-2" />
            <rect x="7" y="13" width="10" height="7" />
          </>
        ) : (
          <circle cx="12" cy="12" r="4" />
        )}
      </svg>
    </span>
  );
}
