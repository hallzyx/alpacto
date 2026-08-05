"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "~~/components/ui/chart";

export type AyniChartSpec = {
  type: "bar" | "pie";
  title?: string;
  data: Array<Record<string, string | number>>;
  xKey?: string;
  yKey?: string;
  nameKey?: string;
  valueKey?: string;
};

const PIE_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export function AyniChatChart({ spec }: { spec: AyniChartSpec }) {
  const xKey = spec.xKey ?? "name";
  const yKey = spec.yKey ?? "value";
  const nameKey = spec.nameKey ?? xKey;
  const valueKey = spec.valueKey ?? yKey;

  const config = useMemo(() => {
    const c: ChartConfig = {
      [yKey]: { label: yKey, color: "var(--color-chart-1)" },
      [valueKey]: { label: valueKey, color: "var(--color-chart-1)" },
    };
    return c;
  }, [yKey, valueKey]);

  if (!spec.data?.length) return null;

  return (
    <div className="my-3 w-full min-w-[14rem] rounded-lg border border-slate-200 bg-white p-2">
      {spec.title ? <p className="m-0 mb-2 px-1 text-xs font-medium text-foreground">{spec.title}</p> : null}
      {spec.type === "pie" ? (
        <ChartContainer config={config} className="mx-auto aspect-square h-[180px] w-full">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey={nameKey} />} />
            <Pie
              data={spec.data}
              dataKey={valueKey}
              nameKey={nameKey}
              innerRadius={40}
              outerRadius={70}
              strokeWidth={2}
            >
              {spec.data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[180px] w-full">
          <BarChart data={spec.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tickMargin={6} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} width={36} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey={yKey} fill={`var(--color-${yKey})`} radius={4} />
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
}

export function parseAyniChartSpec(raw: string): AyniChartSpec | null {
  try {
    const parsed = JSON.parse(raw) as AyniChartSpec;
    if (!parsed || (parsed.type !== "bar" && parsed.type !== "pie")) return null;
    if (!Array.isArray(parsed.data) || parsed.data.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}
