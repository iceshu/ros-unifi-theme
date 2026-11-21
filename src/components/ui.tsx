import type { JSX } from "@solidjs/web";
import { createMemo, type ParentProps } from "solid-js";
import { formatBps } from "../lib/format";
import type { Tone } from "../lib/model";

export function PageHeader(props: ParentProps<{ title: string; subtitle?: string }>) {
  return (
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">{props.title}</h1>
        {props.subtitle ? <p class="mt-0.5 text-[13px] text-muted">{props.subtitle}</p> : null}
      </div>
      {props.children}
    </div>
  );
}

export function Card(props: ParentProps<{ title?: string; class?: string; actions?: JSX.Element }>) {
  return (
    <section class={`card ${props.class ?? ""}`}>
      {props.title || props.actions ? (
        <div class="card-head">
          <h2 class="card-title">{props.title}</h2>
          {props.actions}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

export function Pill(props: ParentProps<{ tone: Tone }>) {
  return <span class={`pill pill-${props.tone}`}>{props.children}</span>;
}

export function Led(props: { tone: Tone; live?: boolean }) {
  return <i class={`led led-${props.tone} ${props.live && props.tone === "good" ? "led-live" : ""}`} aria-hidden="true" />;
}

/** "120 Mbps" as value + dim unit; `dir` colours download/upload like the charts. */
export function RateText(props: { bps: number | null | undefined; dir?: "down" | "up"; class?: string }) {
  const formatted = createMemo(() => (props.bps == null ? null : formatBps(props.bps)));
  return (
    <span class={`inline-flex items-baseline gap-1 whitespace-nowrap ${props.class ?? ""}`}>
      {props.dir ? <span class={props.dir === "down" ? "rate-down" : "rate-up"} aria-hidden="true">{props.dir === "down" ? "↓" : "↑"}</span> : null}
      <span class="num font-medium">{formatted()?.value ?? "—"}</span>
      <span class="text-[11px] text-faint">{formatted()?.unit ?? ""}</span>
    </span>
  );
}

export function Meter(props: { percent: number | null | undefined }) {
  const pct = () => Math.max(0, Math.min(100, props.percent ?? 0));
  const color = () => (pct() >= 90 ? "var(--color-bad)" : pct() >= 75 ? "var(--color-warn)" : "var(--color-accent)");
  return (
    <div class="meter">
      <i style={{ width: `${pct()}%`, background: color() }} />
    </div>
  );
}

export function EmptyState(props: { title: string; detail?: string; compact?: boolean }) {
  return (
    <div class={`rounded-xl border border-dashed border-line text-center ${props.compact ? "px-4 py-8" : "px-6 py-14"}`}>
      <p class="text-[14px] text-muted">{props.title}</p>
      {props.detail ? <p class="mx-auto mt-2 max-w-md text-[13px] text-faint">{props.detail}</p> : null}
    </div>
  );
}

export function Skeleton(props: { class?: string }) {
  return <div aria-hidden="true" class={`skeleton rounded-md ${props.class ?? "h-8 w-32"}`} />;
}

export function Segmented<T extends string | number>(props: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div class="seg" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          type="button"
          aria-pressed={props.value === option.value ? "true" : "false"}
          onClick={() => props.onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
