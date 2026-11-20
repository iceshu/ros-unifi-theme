import { createEffect, createMemo, createSignal, onCleanup, onSettled } from "solid-js";
import { init, use, type ComposeOption, type EChartsType } from "echarts/core";
import { LineChart, PieChart, type LineSeriesOption, type PieSeriesOption } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  LegendScrollComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type LegendComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { cssVar, theme } from "../lib/theme";
import { EmptyState } from "./ui";

use([LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, LegendScrollComponent, CanvasRenderer]);

export type ChartOption = ComposeOption<
  LineSeriesOption | PieSeriesOption | GridComponentOption | TooltipComponentOption | LegendComponentOption
>;

export interface ChartColors {
  download: string;
  upload: string;
  warn: string;
  bad: string;
  good: string;
  ink: string;
  muted: string;
  faint: string;
  grid: string;
  background: string;
  palette: string[];
}

/** Canvas cannot resolve var(); re-read the palette whenever the theme flips. */
export const chartColors = createMemo<ChartColors>(() => {
  theme();
  const download = cssVar("--color-accent") || "#006fff";
  const upload = cssVar("--color-upload") || "#13c2a3";
  const warn = cssVar("--color-warn") || "#f5a623";
  const bad = cssVar("--color-bad") || "#f03a3e";
  return {
    download,
    upload,
    warn,
    bad,
    good: cssVar("--color-good") || "#1db954",
    ink: cssVar("--color-ink") || "#212327",
    muted: cssVar("--color-muted") || "#6b7380",
    faint: cssVar("--color-faint") || "#959ba5",
    grid: cssVar("--color-line") || "#e5e7eb",
    background: cssVar("--color-panel") || "#ffffff",
    palette: [download, upload, "#8b5cf6", warn, "#ec4899", "#0ea5e9", bad, "#84cc16", "#a3a3a3"],
  };
});

export function chartTooltip() {
  const colors = chartColors();
  return {
    backgroundColor: colors.background,
    borderColor: colors.grid,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: colors.ink, fontSize: 12 },
    extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);",
    confine: true,
  };
}

function hasData(option: ChartOption): boolean {
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  return series.some((item) => Array.isArray(item.data) && item.data.length > 0);
}

function seriesShape(option: ChartOption): string {
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  return series.map((item) => `${item.type}:${item.name ?? ""}`).join("|");
}

/**
 * Solid 2 owns mount timing via onSettled; ECharts owns the canvas. Updates
 * merge into the live chart (smooth transitions, legend toggles kept) and only
 * rebuild from scratch when the series layout or theme changes.
 */
export function EChart(props: {
  option: ChartOption;
  height?: number;
  class?: string;
  empty?: string;
  onClick?: (name: string) => void;
}) {
  let el!: HTMLDivElement;
  let chart: EChartsType | undefined;
  let observer: ResizeObserver | undefined;
  let shape = "";
  const [mounted, setMounted] = createSignal(false);
  const populated = createMemo(() => hasData(props.option));
  const dispose = () => {
    observer?.disconnect();
    observer = undefined;
    chart?.dispose();
    chart = undefined;
    shape = "";
  };
  onSettled(() => {
    setMounted(true);
  });
  onCleanup(dispose);
  createEffect(
    () => ({ mounted: mounted(), option: props.option, populated: populated(), theme: theme() }),
    ({ mounted, option, populated, theme: name }) => {
      if (!mounted) return;
      if (!populated) {
        dispose();
        return;
      }
      if (!chart) {
        chart = init(el, undefined, { renderer: "canvas" });
        chart.on("click", (event) => {
          props.onClick?.(event.name);
        });
        observer = new ResizeObserver(() => chart?.resize());
        observer.observe(el);
      }
      const nextShape = `${name}#${seriesShape(option)}`;
      chart.setOption(option, { notMerge: nextShape !== shape, lazyUpdate: true });
      shape = nextShape;
    },
  );
  return (
    <div class={props.class}>
      <div
        ref={el}
        role="img"
        aria-label="交互图表"
        style={{ height: `${props.height ?? 256}px`, width: "100%", display: populated() ? "block" : "none" }}
      />
      {!populated() ? <EmptyState title={props.empty ?? "暂无图表数据"} compact /> : null}
    </div>
  );
}
