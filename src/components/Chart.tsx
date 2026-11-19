import { createMemo } from "solid-js";
import { formatBps } from "../lib/format";
import type { HistoryPoint } from "../lib/store";

const WIDTH = 640;
const HEIGHT = 208;
const PAD = { l: 78, r: 10, t: 14, b: 18 };

function niceMax(value: number): number {
  if (value <= 1) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function smooth(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, PAD.t, HEIGHT - PAD.b);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, PAD.t, HEIGHT - PAD.b);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function ThroughputChart(props: { points: HistoryPoint[] }) {
  const geometry = createMemo(() => {
    const points = props.points;
    if (points.length < 2) return null;
    const peak = Math.max(...points.flatMap((point) => [point.rxBps, point.txBps]), 1);
    const max = niceMax(peak * 1.08);
    const innerW = WIDTH - PAD.l - PAD.r;
    const innerH = HEIGHT - PAD.t - PAD.b;
    const x = (index: number) => PAD.l + (index / (points.length - 1)) * innerW;
    const y = (value: number) => PAD.t + (1 - value / max) * innerH;
    const down = points.map((point, index) => ({ x: x(index), y: y(point.rxBps) }));
    const up = points.map((point, index) => ({ x: x(index), y: y(point.txBps) }));
    const base = HEIGHT - PAD.b;
    const ticks = [max, max / 2, 0].map((value) => ({
      y: y(value),
      label: `${formatBps(value)?.value ?? ""} ${formatBps(value)?.unit ?? ""}`.trim(),
    }));
    return {
      ticks,
      downLine: smooth(down),
      upLine: smooth(up),
      downArea: `${smooth(down)} L ${down[down.length - 1].x.toFixed(1)} ${base} L ${down[0].x.toFixed(1)} ${base} Z`,
      upArea: `${smooth(up)} L ${up[up.length - 1].x.toFixed(1)} ${base} L ${up[0].x.toFixed(1)} ${base} Z`,
    };
  });

  return (
    <div class="mt-4">
      {geometry() ? (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} class="h-52 w-full" role="img" aria-label="下载与上传速率曲线">
          <defs>
            <linearGradient id="wan-down" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#4aa3ff" stop-opacity="0.38" />
              <stop offset="100%" stop-color="#4aa3ff" stop-opacity="0.02" />
            </linearGradient>
            <linearGradient id="wan-up" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#3ddeaf" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#3ddeaf" stop-opacity="0.02" />
            </linearGradient>
          </defs>
          {geometry()!.ticks.map((tick) => (
            <g>
              <line x1={PAD.l} x2={WIDTH - PAD.r} y1={tick.y} y2={tick.y} stroke="#243140" />
              <text x="0" y={tick.y + 4} fill="#8ea0b8" font-size="11">
                {tick.label}
              </text>
            </g>
          ))}
          <path d={geometry()!.downArea} fill="url(#wan-down)" />
          <path d={geometry()!.upArea} fill="url(#wan-up)" />
          <path d={geometry()!.downLine} fill="none" stroke="#4aa3ff" stroke-width="2.2" />
          <path d={geometry()!.upLine} fill="none" stroke="#3ddeaf" stroke-width="2.2" />
        </svg>
      ) : (
        <div class="flex h-52 items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">
          再等一次采样，曲线就会出现。接口计数大约每 2 秒读一次。
        </div>
      )}
      <div class="mt-2 flex gap-4 text-xs text-muted">
        <span class="inline-flex items-center gap-2">
          <i class="inline-block h-2 w-2 rounded-full bg-accent" /> 下载（接收）
        </span>
        <span class="inline-flex items-center gap-2">
          <i class="inline-block h-2 w-2 rounded-full bg-good" /> 上传（发送）
        </span>
      </div>
    </div>
  );
}
