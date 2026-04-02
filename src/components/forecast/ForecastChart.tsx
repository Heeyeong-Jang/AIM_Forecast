import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMonthlyForecastChart, MONTH_LABELS } from "@/hooks/useForecastData";

const COLORS = [
  "hsl(174, 62%, 47%)",
  "hsl(200, 70%, 50%)",
  "hsl(260, 60%, 55%)",
  "hsl(30, 80%, 55%)",
  "hsl(340, 65%, 55%)",
  "hsl(90, 55%, 45%)",
];

export default function ForecastChart() {
  const [mode, setMode] = useState<"all" | "product">("all");
  const { data, isLoading } = useMonthlyForecastChart();

  const { chartData, productNames } = useMemo(() => {
    if (!data) return { chartData: [], productNames: [] as string[] };

    const { months, filtered, productMap } = data;
    const allNames = [...new Set(filtered.map((r) => productMap.get(r.product_id ?? "") ?? "알 수 없음"))];

    if (mode === "all") {
      const cd = months.map((m) => {
        const total = filtered
          .filter((r) => r.year === m.year && r.month === m.month)
          .reduce((s, r) => s + (r.final_forecast ?? 0), 0);
        return { name: MONTH_LABELS[m.month - 1], 전체: total };
      });
      return { chartData: cd, productNames: ["전체"] };
    }

    const cd = months.map((m) => {
      const entry: Record<string, string | number> = { name: MONTH_LABELS[m.month - 1] };
      allNames.forEach((pName) => {
        entry[pName] = filtered
          .filter(
            (r) =>
              r.year === m.year &&
              r.month === m.month &&
              productMap.get(r.product_id ?? "") === pName
          )
          .reduce((s, r) => s + (r.final_forecast ?? 0), 0);
      });
      return entry;
    });
    return { chartData: cd, productNames: allNames };
  }, [data, mode]);

  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">월별 예측 현황</CardTitle>
        <div className="flex rounded-lg border bg-surface p-0.5 text-sm">
          <button
            onClick={() => setMode("all")}
            className={`px-3 py-1 rounded-md transition-colors ${
              mode === "all"
                ? "bg-teal text-teal-foreground shadow-sm"
                : "text-surface-foreground hover:text-foreground"
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setMode("product")}
            className={`px-3 py-1 rounded-md transition-colors ${
              mode === "product"
                ? "bg-teal text-teal-foreground shadow-sm"
                : "text-surface-foreground hover:text-foreground"
            }`}
          >
            제품별
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            데이터 로딩 중...
          </div>
        ) : chartData.length === 0 || productNames.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            예측 데이터가 없습니다
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                formatter={(value: number) => [value.toLocaleString() + "개", undefined]}
              />
              {productNames.length > 1 && <Legend />}
              {productNames.map((name, i) => (
                <Bar
                  key={name}
                  dataKey={name}
                  stackId={mode === "product" ? "stack" : undefined}
                  fill={COLORS[i % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
