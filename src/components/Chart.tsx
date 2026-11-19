import { createMemo } from "solid-js";
import { formatBps } from "../lib/format";
import { HISTORY_WINDOW_MS, type HistoryPoint } from "../lib/store";

const WIDTH = 960;
const HEIGHT = 220;
const PAD = { l: 64, r: 12, t: 12, b: 26 };
const FLOOR_BPS = 1_000_000;

function niceMax(value: number): number {
  if (value <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smooth(points: Array<{ x: number; y: number }>, minY: number, maxY: number): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, minY, maxY);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, minY, maxY);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function tickLabel(value: number): string {
  const formatted = formatBps(value);
  if (!formatted) return "0";
  return `${formatted.value} ${formatted.unit}`;
}

export function ThroughputChart(props: { points: HistoryPoint[]; now: number }) {
  const geometry = createMemo(() => {
    const now = props.now;
    const start = now - HISTORY_WINDOW_MS;
    const points = props.points.filter((point) => point.t >= start && point.t <= now + 1000);
    const peak = points.reduce((max, point) => Math.max(max, point.rxBps, point.txBps), 0);
    const max = niceMax(Math.max(peak * 1.12, FLOOR_BPS));
    const innerW = WIDTH - PAD.l - PAD.r;
    const innerH = HEIGHT - PAD.t - PAD.b;
    const x = (t: number) => PAD.l + ((t - start) / HISTORY_WINDOW_MS) * innerW;
    const y = (value: number) => PAD.t + (1 - Math.min(Math.max(value, 0), max) / max) * innerH;
    const down = points.map((point) => ({ x: x(point.t), y: y(point.rxBps) }));
    const up = points.map((point) => ({ x: x(point.t), y: y(point.txBps) }));
    const base = HEIGHT - PAD.b;
    const downLine = smooth(down, PAD.t, base);
    const upLine = smooth(up, PAD.t, base);
    const area = (line: string, series: Array<{ x: number }>) =>
      series.length < 2 ? "" : `${line} L ${series[series.length - 1].x.toFixed(1)} ${base} L ${series[0].x.toFixed(1)} ${base} Z`;
    return {
      ticks: [max, max / 2, 0].map((value) => ({ y: y(value), label: tickLabel(value) })),
      times: [0, 0.5, 1].map((fraction) => {
      const minutes = HISTORY_WINDOW_MS / 60000;
      const ago = (1 - fraction) * minutes;
      return {
        x: PAD.l + fraction * innerW,
        label: fraction === 1 ? "现在" : `-${Number.isInteger(ago) ? ago : ago.toFixed(1)}分`,
      };
    }),
      downLine,
      upLine,
      downArea: area(downLine, down),
      upArea: area(upLine, up),
      down,
      up,
    };
  });

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} class="h-64 w-full" role="img" aria-label="吞吐曲线">
      <defs>
        <linearGradient id="wan-down" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3ec6d6" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#3ec6d6" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="wan-up" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8fd9b4" stop-opacity="0.2" />
          <stop offset="100%" stop-color="#8fd9b4" stop-opacity="0" />
        </linearGradient>
      </defs>
      {geometry().ticks.map((tick) => (
        <g>
          <line x1={PAD.l} x2={WIDTH - PAD.r} y1={tick.y} y2={tick.y} stroke="rgba(255,255,255,0.06)" />
          <text x="0" y={tick.y + 4} fill="#6d7680" font-size="11">
            {tick.label}
          </text>
        </g>
      ))}
      {geometry().times.map((tick) => (
        <text x={tick.x} y={HEIGHT - 6} fill="#6d7680" font-size="11" text-anchor={tick.label === "现在" ? "end" : "start"}>
          {tick.label}
        </text>
      ))}
      {geometry().downArea ? <path d={geometry().downArea} fill="url(#wan-down)" /> : null}
      {geometry().upArea ? <path d={geometry().upArea} fill="url(#wan-up)" /> : null}
      {geometry().down.length > 1 ? (
        <path d={geometry().downLine} fill="none" stroke="#3ec6d6" stroke-width="1.8" />
      ) : null}
      {geometry().up.length > 1 ? <path d={geometry().upLine} fill="none" stroke="#8fd9b4" stroke-width="1.8" /> : null}
    </svg>
  );
}
