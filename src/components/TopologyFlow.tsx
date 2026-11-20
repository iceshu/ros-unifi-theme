import { formatBps } from "../lib/format";
import { flowDuration } from "../lib/topology";

export function rateText(bps: number | null | undefined): string {
  const value = formatBps(bps ?? null);
  return value ? `${value.value} ${value.unit}` : "—";
}

/** rx/tx here are visual download/upload, not necessarily interface RX/TX. */
export function FlowLink(props: { rx?: number; tx?: number; up: boolean; wide?: boolean }) {
  return (
    <svg class={`topology-flow ${props.wide ? "topology-flow-wide" : ""}`} viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 3 H100" class={`flow-lane flow-download ${props.up && (props.rx ?? 0) > 0 ? "is-flowing" : ""}`} style={{ "animation-duration": `${flowDuration(props.rx)}s` }} />
      <path d="M0 9 H100" class={`flow-lane flow-upload ${props.up && (props.tx ?? 0) > 0 ? "is-flowing" : ""}`} style={{ "animation-duration": `${flowDuration(props.tx)}s` }} />
    </svg>
  );
}
