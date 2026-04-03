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

const FORECAST_COLOR = "hsl(174, 62%, 47%)";
const ACTUAL_COLOR = "hsl(200, 70%, 50%)";

const PRODUCT_FORECAST_COLORS = [
  "hsl(174, 62%, 47%)",
  "hsl(260, 60%, 55%)",
  "hsl(30, 80%, 55%)",
  "hsl(340, 65%, 55%)",
  "hsl(90, 55%, 45%)",
];
const PRODUCT_ACTUAL_COLORS = [
  "hsl(174, 62%, 35%)",
  "hsl(260, 60%, 40%)",
  "hsl(30, 80%, 40%)",
  "hsl(340, 65%, 40%)",
  "hsl(90, 55%, 32%)",
];

export default function ForecastChart() {
  const [mode, setMode] = useState<"all" | "product">("all");
  const { data, isLoading } = useMonthlyForecastChart();

  const { chartData, bars } = useMemo(() => {
    if (!data) return { chartData: [], bars: [] as { key: string; fill: string }[] };

    const { months, filtered, productMap, salesMap = new Map() } = data;
    const allNames = [...new Set(filtered.map((r) => productMap.get(r.product_id ?? "") ?? "알 수 없음"))];

    if (mode === "all") {
      const cd = months.map((m) => {
        const forecastTotal = filtered
          .filter((r) => r.year === m.year && r.month === m.month)
          .reduce((s, r) => s + (r.final_forecast ?? 0), 0);

        const monthSales = salesMap.get(`${m.year}-${m.month}`);
        let actualTotal = 0;
        if (monthSales) {
          for (const qty of monthSales.values()) actualTotal += qty;
        }

        return {
          name: MONTH_LABELS[m.month - 1],
          예측량: forecastTotal,
          실제판매량: actualTotal || undefined,
        };
      });
      return {
        chartData: cd,
        bars: [
          { key: "예측량", fill: FORECAST_COLOR },
          { key: "실제판매량", fill: ACTUAL_COLOR },
        ],
      };
    }

    // Product mode: forecast + actual per product
    const cd = months.map((m) => {
      const entry: Record<string, string | number | undefined> = { name: MONTH_LABELS[m.month - 1] };
      const monthSales = salesMap.get(`${m.year}-${m.month}`);

      allNames.forEach((pName) => {
        const pid = [...productMap.entries()].find(([, n]) => n === pName)?.[0];
        entry[`${pName} 예측`] = filtered
          .filter((r) => r.year === m.year && r.month === m.month && productMap.get(r.product_id ?? "") === pName)
          .reduce((s, r) => s + (r.final_forecast ?? 0), 0);
        const actual = pid && monthSales ? monthSales.get(pid) : undefined;
        entry[`${pName} 실제`] = actual ?? undefined;
      });
      return entry;
    });

    const bars: { key: string; fill: string }[] = [];
    allNames.forEach((name, i) => {
      bars.push({ key: `${name} 예측`, fill: PRODUCT_FORECAST_COLORS[i % PRODUCT_FORECAST_COLORS.length] });
      bars.push({ key: `${name} 실제`, fill: PRODUCT_ACTUAL_COLORS[i % PRODUCT_ACTUAL_COLORS.length] });
    });

    return { chartData: cd, bars };
  }, [data, mode]);

  return (
    <Card className="flex-1">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">월별 예측 vs 실제 판매</CardTitle>
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
        ) : chartData.length === 0 ? (
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
                formatter={(value: number, name: string) => [value?.toLocaleString() + "개", name]}
              />
              <Legend />
              {bars.map((b) => (
                <Bar key={b.key} dataKey={b.key} fill={b.fill} radius={[4, 4, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
