import { createEffect, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import { init, use, type ComposeOption, type EChartsType } from "echarts/core";
import { LineChart, PieChart, GaugeChart, type LineSeriesOption, type PieSeriesOption, type GaugeSeriesOption } from "echarts/charts";
import { GridComponent, TooltipComponent, LegendComponent, LegendScrollComponent, type GridComponentOption, type TooltipComponentOption, type LegendComponentOption } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { EmptyState } from "./ui";

use([LineChart, PieChart, GaugeChart, GridComponent, TooltipComponent, LegendComponent, LegendScrollComponent, CanvasRenderer]);

export type ChartOption = ComposeOption<LineSeriesOption | PieSeriesOption | GaugeSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption>;
export const chartColors = {
  download: "#006fff", upload: "#1fbf75", warn: "#ff9f1c", bad: "#ff4d4f",
  ink: "#1a2733", muted: "#66788a", grid: "#e3e8ef", background: "#ffffff",
};
export const chartTooltip = {
  backgroundColor: chartColors.background,
  borderColor: chartColors.grid,
  textStyle: { color: chartColors.ink },
  confine: true,
};

function hasData(option: ChartOption): boolean {
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  return series.some((item) => Array.isArray(item.data) && item.data.length > 0);
}

/** Solid 2 uses onSettled for post-mount work and split compute/effect callbacks. */
export function EChart(props: {
  option: ChartOption;
  height?: number;
  class?: string;
  onClick?: (name: string) => void;
}) {
  let el!: HTMLDivElement;
  let chart: EChartsType | undefined;
  let observer: ResizeObserver | undefined;
  let selected: Record<string, boolean> = {};
  const [mounted, setMounted] = createSignal(false);
  const populated = createMemo(() => hasData(props.option));
  const dispose = () => {
    observer?.disconnect();
    observer = undefined;
    chart?.dispose();
    chart = undefined;
  };
  onSettled(() => { setMounted(true); });
  onCleanup(dispose);
  createEffect(
    () => ({ mounted: mounted(), option: props.option, populated: populated() }),
    ({ mounted, option, populated }) => {
      if (!mounted) return;
      if (!populated) { dispose(); return; }
      if (!chart) {
        chart = init(el, undefined, { renderer: "canvas" });
        chart.on("click", (event) => { props.onClick?.(event.name); });
        chart.on("legendselectchanged", (event) => {
          selected = (event as { selected: Record<string, boolean> }).selected;
        });
        observer = new ResizeObserver(() => chart?.resize());
        observer.observe(el);
      }
      // notMerge replaces stale series, while retaining the user's legend toggles.
      const legend = option.legend && !Array.isArray(option.legend) ? { ...option.legend, selected } : option.legend;
      chart.setOption({ ...option, legend }, true);
    },
  );
  return (
    <div class={props.class}>
      <div ref={el} role="img" aria-label="交互图表" style={{ height: `${props.height ?? 256}px`, width: "100%", display: populated() ? "block" : "none" }} />
      {!populated() ? <EmptyState title="暂无图表数据" /> : null}
    </div>
  );
}

export function UsageGauge(props: { value: number | null; label: string }) {
  const option = createMemo<ChartOption>(() => {
    const value = props.value;
    const percent = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
    const color = percent != null && percent >= 90 ? chartColors.bad : percent != null && percent >= 70 ? chartColors.warn : chartColors.upload;
    return {
      tooltip: { ...chartTooltip, formatter: "{b}：{c}%" },
      series: [{
        type: "gauge", startAngle: 210, endAngle: -30, min: 0, max: 100,
        radius: "90%", center: ["50%", "58%"],
        progress: { show: true, width: 14, roundCap: true, itemStyle: { color } },
        axisLine: { lineStyle: { width: 14, color: [[1, chartColors.grid]] } },
        pointer: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false },
        title: { offsetCenter: [0, "35%"], color: chartColors.muted, fontSize: 13 },
        detail: { valueAnimation: true, formatter: "{value}%", offsetCenter: [0, "-5%"], color, fontSize: 30 },
        data: percent == null ? [] : [{ value: Math.round(percent), name: props.label }],
        animationDurationUpdate: 400,
      }],
    };
  });
  return <EChart option={option()} height={220} />;
}
