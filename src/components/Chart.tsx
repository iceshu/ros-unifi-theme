import { createMemo } from "solid-js";
import { graphic } from "echarts/core";
import { formatBps } from "../lib/format";
import { HISTORY_WINDOW_MS, type HistoryPoint } from "../lib/store";
import { EChart, chartColors, chartTooltip, type ChartOption } from "./charts";

function bpsLabel(value: number): string {
  const formatted = formatBps(value);
  return formatted ? `${formatted.value} ${formatted.unit}` : "—";
}

export function ThroughputChart(props: { points: HistoryPoint[]; now: number }) {
  const option = createMemo<ChartOption>(() => {
    const now = props.now;
    const start = now - HISTORY_WINDOW_MS;
    const points = props.points.filter((point) => point.t >= start && point.t <= now + 1000);
    const timeLabel = (t: number) => {
      const minutes = Math.max(0, (now - t) / 60000);
      return minutes < 0.1 ? "现在" : `-${Number(minutes.toFixed(1))}分`;
    };
    return {
      color: [chartColors.download, chartColors.upload],
      textStyle: { color: chartColors.muted, fontFamily: "Inter, sans-serif" },
      animationDuration: 400, animationDurationUpdate: 350, animationEasingUpdate: "cubicOut",
      grid: { left: 82, right: 24, top: 40, bottom: 32 },
      legend: { data: ["下载", "上传"], top: 0, right: 12, textStyle: { color: chartColors.muted } },
      tooltip: {
        ...chartTooltip, trigger: "axis", axisPointer: { type: "cross", label: { backgroundColor: chartColors.muted } },
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          const first = items[0];
          if (!first || !Array.isArray(first.value)) return "";
          return [timeLabel(Number(first.value[0])), ...items.map((item) =>
            `${item.marker ?? ""}${item.seriesName}：${bpsLabel(Number(Array.isArray(item.value) ? item.value[1] : item.value))}`,
          )].join("<br/>");
        },
      },
      xAxis: {
        type: "time", min: start, max: now, splitNumber: 5,
        axisLine: { lineStyle: { color: chartColors.grid } }, axisTick: { show: false },
        axisLabel: { color: chartColors.muted, formatter: timeLabel, hideOverlap: true, showMaxLabel: true },
        axisPointer: { label: { formatter: (params) => timeLabel(Number(params.value)) } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value", min: 0, max: (extent) => Math.max(1_000_000, extent.max * 1.12), splitNumber: 3,
        axisLabel: { color: chartColors.muted, formatter: bpsLabel },
        axisPointer: { label: { formatter: (params) => bpsLabel(Number(params.value)) } },
        splitLine: { lineStyle: { color: chartColors.grid } },
      },
      series: ([
        ["下载", "rxBps", chartColors.download, "rgba(0,111,255,0.22)", "rgba(0,111,255,0.02)"],
        ["上传", "txBps", chartColors.upload, "rgba(31,191,117,0.16)", "rgba(31,191,117,0)"],
      ] as const).map(([name, key, color, top, bottom]) => ({
        name, type: "line", smooth: true, showSymbol: points.length === 1, symbolSize: 5,
        lineStyle: { width: 2, color }, itemStyle: { color },
        areaStyle: { color: new graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: top }, { offset: 1, color: bottom }]) },
        data: points.map((point) => [point.t, point[key]]),
      })),
    };
  });
  return <EChart option={option()} />;
}
