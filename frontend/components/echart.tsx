"use client";

// ECharts gọn: chỉ nạp các loại biểu đồ dùng tới (tree-shake), vẽ SVG cho nét, tự co giãn theo khung.
// Không dùng echarts-for-react: vài chục dòng tự viết thay được, bớt một gói phụ thuộc.
import { BarChart, HeatmapChart, LineChart, PieChart } from "echarts/charts";
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([BarChart, HeatmapChart, LineChart, PieChart, DataZoomComponent, GridComponent, LegendComponent,
  MarkLineComponent, TooltipComponent, VisualMapComponent, SVGRenderer]);

export type EOption = echarts.EChartsCoreOption;
type ClickParams = { name: string; seriesName?: string; dataIndex: number; data: unknown };

// khung chung: chữ theo font của trang, chữ trục xám, tooltip trắng viền mảnh như các thẻ
export const TOOLTIP = {
  backgroundColor: "#ffffff",
  borderColor: "#e6e4df",
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: "#131416", fontSize: 13 },
  extraCssText: "box-shadow:none;border-radius:6px;",
};
export const AXIS_TEXT = { color: "#5d5f60", fontSize: 12 };
export const GRID_LINE = { lineStyle: { color: "#efeeea" } };

/** label: một câu tóm tắt số liệu cho trình đọc màn hình (SVG của biểu đồ không đọc được). */
export function EChart({ option, height, label, onClick }: {
  option: EOption; height: number; label: string; onClick?: (p: ClickParams) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const click = useRef(onClick);
  click.current = onClick;

  useEffect(() => {
    const c = echarts.init(el.current!, null, { renderer: "svg" });
    chart.current = c;
    c.on("click", (p) => click.current?.(p as unknown as ClickParams));
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(el.current!);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = getComputedStyle(document.body).fontFamily;
    chart.current?.setOption({ animation: !reduce, animationDuration: 600, textStyle: { fontFamily: font }, ...option }, { notMerge: true });
  }, [option]);

  return <div ref={el} role="img" aria-label={label} style={{ height, cursor: onClick ? "pointer" : undefined }} />;
}
