import { createMemo, createSignal } from "solid-js";
import { graphic } from "echarts/core";
import { formatBps, formatBytes } from "../lib/format";
import { RANGES, useInterfaceHistory } from "../lib/history";
import type { HistoryPoint } from "../lib/store";
import { useDashboard } from "../lib/store";
import { EChart, chartColors, chartTooltip, type ChartOption } from "./charts";
import { RateText, Segmented } from "./ui";

function bpsLabel(value: number): string {
  const formatted = formatBps(value);
  return formatted ? `${formatted.value} ${formatted.unit}` : "—";
}

const pad = (value: number) => String(value).padStart(2, "0");


function axisTimeLabel(t: number, range: number): string {
  const d = new Date(t);
  const h = pad(d.getHours()), m = pad(d.getMinutes());
  if (range > 86400 * 2) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  if (range > 86400) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${h}:${m}`;
  if (range <= 600) return `${h}:${m}:${pad(d.getSeconds())}`;
  return `${h}:${m}`;
}

function tooltipTimeLabel(t: number, range: number): string {
  const d = new Date(t);
  const h = pad(d.getHours()), m = pad(d.getMinutes()), s = pad(d.getSeconds());
  if (range > 86400) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${h}:${m}`;
  if (range <= 600) return `${h}:${m}:${s}`;
  return `${h}:${m}`;
}

/** Canvas fillStyle cannot take color-mix(); expand #rrggbb to rgba(). */
function alpha(color: string, value: number): string {
  const hex = color.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return color;
  const n = Number.parseInt(hex, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${value})`;
}

/** Throughput area chart; the x axis is a fixed window ending now so the line glides left. */
export function ThroughputChart(props: { points: HistoryPoint[]; now: number; range: number; height?: number; legend?: boolean }) {
  const option = createMemo<ChartOption>(() => {
    const colors = chartColors();
    const now = props.now;
    const start = now - props.range * 1000;
    const points = props.points.filter((point) => point.t >= start && point.t <= now + 2000);
    const range = props.range;
    const fade = (color: string, top: number) =>
      new graphic.LinearGradient(0, 0, 0, 1, [
        { offset: 0, color: alpha(color, top) },
        { offset: 1, color: alpha(color, 0) },
      ]);
    return {
      color: [colors.download, colors.upload],
      textStyle: { color: colors.muted, fontFamily: "Inter, sans-serif" },
      animationDuration: 500,
      animationDurationUpdate: 450,
      animationEasingUpdate: "cubicOut",
      grid: { left: 8, right: 12, top: props.legend === false ? 12 : 36, bottom: 8, containLabel: true },
      legend:
        props.legend === false
          ? { show: false }
          : { data: ["下载", "上传"], top: 0, right: 4, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: colors.muted } },
      tooltip: {
        ...chartTooltip(),
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: colors.faint, type: "dashed" } },
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const first = items[0];
          if (!first || !Array.isArray(first.value)) return "";
          return [
            `<div style="margin-bottom:4px;color:${colors.muted}">${tooltipTimeLabel(Number(first.value[0]), range)}</div>`,
            ...items.map(
              (item) =>
                `${item.marker ?? ""}${item.seriesName}　<b>${bpsLabel(Number(Array.isArray(item.value) ? item.value[1] : item.value))}</b>`,
            ),
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "time",
        min: start,
        max: now,
        splitNumber: (props.height ?? 260) < 200 ? 3 : 6,
        axisLine: { lineStyle: { color: colors.grid } },
        axisTick: { show: false },
        axisLabel: { color: colors.faint, formatter: (value: number) => axisTimeLabel(value, range), hideOverlap: true },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: (extent) => Math.max(1_000_000, extent.max * 1.15),
        splitNumber: 3,
        axisLabel: { color: colors.faint, formatter: bpsLabel, showMaxLabel: false },
        splitLine: { lineStyle: { color: colors.grid, type: "dashed" } },
      },
      series: (
        [
          ["下载", "rxBps", colors.download, 0.28],
          ["上传", "txBps", colors.upload, 0.18],
        ] as const
      ).map(([name, key, color, top]) => ({
        name,
        type: "line",
        smooth: 0.35,
        showSymbol: points.length < 4,
        symbolSize: 6,
        sampling: "lttb",
        lineStyle: { width: 2, color },
        itemStyle: { color },
        emphasis: { focus: "series" },
        areaStyle: { color: fade(color, top) },
        data: points.map((point) => [point.t, Math.max(0, point[key])]),
      })),
    };
  });
  return <EChart option={option()} height={props.height ?? 260} empty="正在收集流量采样…" />;
}

function stats(points: HistoryPoint[]) {
  if (points.length === 0) return null;
  let peakRx = 0;
  let peakTx = 0;
  let sumRx = 0;
  let sumTx = 0;
  let bytesRx = 0;
  let bytesTx = 0;
  points.forEach((point, index) => {
    peakRx = Math.max(peakRx, point.rxBps);
    peakTx = Math.max(peakTx, point.txBps);
    sumRx += point.rxBps;
    sumTx += point.txBps;
    const previous = points[index - 1];
    if (previous) {
      const dt = Math.min(120, (point.t - previous.t) / 1000);
      bytesRx += (point.rxBps * dt) / 8;
      bytesTx += (point.txBps * dt) / 8;
    }
  });
  return { peakRx, peakTx, avgRx: sumRx / points.length, avgTx: sumTx / points.length, bytesRx, bytesTx };
}

/**
 * Interface throughput card body: live numbers, range switcher, peak/average/volume
 * for the visible window, and the chart. Data comes from the server sampler.
 */
export function InterfaceTraffic(props: { name: string | null | undefined; height?: number; initialRange?: number; compact?: boolean }) {
  const dash = useDashboard();
  const [range, setRange] = createSignal(props.initialRange ?? 3600);
  const history = useInterfaceHistory(() => props.name, range);
  const live = () => (props.name ? dash.rates()[props.name] : undefined);
  const windowPoints = createMemo(() => {
    const start = dash.now() - range() * 1000;
    return history.points().filter((point) => point.t >= start);
  });
  const summary = createMemo(() => stats(windowPoints()));
  return (
    <div>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-wrap gap-x-7 gap-y-2">
          <div>
            <div class="kicker">实时下载</div>
            <div class="big-rate rate-down">
              {formatBps(live()?.rxBps ?? null)?.value ?? "—"}
              <small>{formatBps(live()?.rxBps ?? null)?.unit ?? ""}</small>
            </div>
          </div>
          <div>
            <div class="kicker">实时上传</div>
            <div class="big-rate rate-up">
              {formatBps(live()?.txBps ?? null)?.value ?? "—"}
              <small>{formatBps(live()?.txBps ?? null)?.unit ?? ""}</small>
            </div>
          </div>
          {!props.compact && summary() ? (
            <div class="hidden gap-x-6 text-[12px] md:flex">
              <div>
                <div class="kicker">峰值</div>
                <div class="mt-1.5 flex gap-3">
                  <RateText bps={summary()?.peakRx} dir="down" />
                  <RateText bps={summary()?.peakTx} dir="up" />
                </div>
              </div>
              <div>
                <div class="kicker">平均</div>
                <div class="mt-1.5 flex gap-3">
                  <RateText bps={summary()?.avgRx} dir="down" />
                  <RateText bps={summary()?.avgTx} dir="up" />
                </div>
              </div>
              <div>
                <div class="kicker">本时段用量</div>
                <div class="mt-1.5 flex gap-3 num">
                  <span><span class="rate-down">↓</span> {formatBytes(summary()?.bytesRx ?? 0)}</span>
                  <span><span class="rate-up">↑</span> {formatBytes(summary()?.bytesTx ?? 0)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <Segmented
          label="时间范围"
          value={range()}
          onChange={setRange}
          options={RANGES.map((item) => ({ value: item.seconds, label: item.label }))}
        />
      </div>
      <div class="mt-3">
        <ThroughputChart points={history.points()} now={dash.now()} range={range()} height={props.height} />
      </div>
      {history.source() === "browser" ? (
        <p class="mt-1 text-[11.5px] text-faint">服务端历史采样未启用，曲线只包含打开页面后的数据。</p>
      ) : null}
    </div>
  );
}
