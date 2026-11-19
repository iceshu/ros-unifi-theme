import type { JSX } from "@solidjs/web";
import { createMemo, type ParentProps } from "solid-js";
import { formatBps } from "../lib/format";
import type { Tone } from "../lib/model";

export function PageHeader(props: ParentProps<{ title: string }>) {
  return (
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-lg font-medium tracking-tight">{props.title}</h1>
      {props.children}
    </div>
  );
}

export function Pill(props: ParentProps<{ tone: Tone }>) {
  return <span class={`pill pill-${props.tone}`}>{props.children}</span>;
}

export function Ring(props: { percent: number | null }) {
  const radius = 28;
  const circ = 2 * Math.PI * radius;
  const pct = () => {
    const value = props.percent;
    if (value == null || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  };
  const color = () => {
    const value = props.percent;
    if (value == null) return "#64788d";
    if (value >= 90) return "#ff5d73";
    if (value >= 75) return "#ffb020";
    return "#4aa3ff";
  };
  return (
    <svg viewBox="0 0 72 72" class="h-16 w-16 shrink-0" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="#243140" stroke-width="6" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke={color()}
        stroke-width="6"
        stroke-linecap="round"
        stroke-dasharray={`${(pct() / 100) * circ} ${circ}`}
        transform="rotate(-90 36 36)"
      />
    </svg>
  );
}

export function RateText(props: { bps: number | null | undefined; large?: boolean; tone?: "accent" | "good" }) {
  const formatted = createMemo(() => formatBps(props.bps ?? null));
  const tone = props.tone === "good" ? "text-good" : props.tone === "accent" ? "text-accent" : "";
  return (
    <span class={props.large ? "rate-xl" : "inline-flex items-baseline gap-1"}>
      <span class={`tabular-nums font-semibold ${tone}`}>{formatted()?.value ?? "—"}</span>
      <span class="rate-unit">{formatted()?.unit ?? ""}</span>
    </span>
  );
}

export function EmptyState(props: { title: string; detail?: string }) {
  return (
    <div class="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p class="text-base">{props.title}</p>
      {props.detail ? <p class="mx-auto mt-2 max-w-md text-sm text-muted">{props.detail}</p> : null}
    </div>
  );
}

export function Skeleton(props: { class?: string }) {
  return <div class={`animate-pulse rounded-xl bg-white/5 ${props.class ?? "h-8 w-32"}`} />;
}

export function toneClass(tone: Tone): string {
  if (tone === "good") return "text-good";
  if (tone === "bad") return "text-bad";
  if (tone === "warn") return "text-warn";
  if (tone === "accent") return "text-accent";
  return "text-muted";
}

export function sectionLabel(text: string): JSX.Element {
  return <p class="kicker">{text}</p>;
}
