import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

interface AccuracyRow {
  productName: string;
  forecast: number;
  actual: number;
  mape: number;
}

function getGrade(mape: number) {
  if (mape < 10) return { label: "우수", className: "bg-success/15 text-success border-success/30" };
  if (mape < 20) return { label: "양호", className: "bg-primary/15 text-primary border-primary/30" };
  if (mape < 35) return { label: "개선필요", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30" };
  return { label: "부정확", className: "bg-danger/15 text-danger border-danger/30" };
}

export default function ForecastAccuracy() {
  const { data: results } = useQuery({
    queryKey: ["forecast-accuracy-results"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_results")
        .select("product_id, year, month, final_forecast");
      if (error) throw error;
      return data;
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["forecast-accuracy-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_sales_history")
        .select("product_id, year, month, channel, actual_quantity");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["forecast-products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_products")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { rows, totalComparisons } = useMemo(() => {
    if (!results || !sales || !products) return { rows: [], totalComparisons: 0 };

    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    // Build sales lookup: product_id -> year-month -> total qty
    const salesMap = new Map<string, Map<string, number>>();
    for (const s of sales) {
      const pid = s.product_id ?? "";
      if (!salesMap.has(pid)) salesMap.set(pid, new Map());
      const key = `${s.year}-${s.month}`;
      const prev = salesMap.get(pid)!.get(key) ?? 0;
      // Use '전체' if available, otherwise sum channels
      if (s.channel === "전체") {
        salesMap.get(pid)!.set(key, s.actual_quantity ?? 0);
      } else if (!salesMap.get(pid)!.has(key)) {
        salesMap.get(pid)!.set(key, prev + (s.actual_quantity ?? 0));
      }
    }

    // For each product, find past months with both forecast and actual
    const productMapes = new Map<string, { totalMape: number; count: number; totalForecast: number; totalActual: number }>();
    let totalComps = 0;

    for (const r of results) {
      const key = `${r.year}-${r.month}`;
      if (key >= currentKey) continue; // only past months
      const pid = r.product_id ?? "";
      const actual = salesMap.get(pid)?.get(key);
      if (actual == null || actual === 0) continue;
      const forecast = r.final_forecast ?? 0;
      const mape = Math.abs(actual - forecast) / actual * 100;
      totalComps++;

      if (!productMapes.has(pid)) {
        productMapes.set(pid, { totalMape: 0, count: 0, totalForecast: 0, totalActual: 0 });
      }
      const entry = productMapes.get(pid)!;
      entry.totalMape += mape;
      entry.count++;
      entry.totalForecast += forecast;
      entry.totalActual += actual;
    }

    const rows: AccuracyRow[] = [];
    for (const [pid, entry] of productMapes) {
      rows.push({
        productName: productMap.get(pid) ?? "알 수 없음",
        forecast: Math.round(entry.totalForecast / entry.count),
        actual: Math.round(entry.totalActual / entry.count),
        mape: Math.round((entry.totalMape / entry.count) * 10) / 10,
      });
    }

    rows.sort((a, b) => a.mape - b.mape);
    return { rows, totalComparisons: totalComps };
  }, [results, sales, products]);

  const avgAccuracy = rows.length > 0
    ? Math.round((100 - rows.reduce((s, r) => s + r.mape, 0) / rows.length) * 10) / 10
    : 0;
  const best = rows[0];
  const worst = rows[rows.length - 1];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-teal" />
          예측 정확도
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalComparisons < 3 ? (
          <div className="flex items-start gap-3 rounded-lg border bg-surface p-4">
            <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              아직 비교할 수 있는 데이터가 부족합니다. 판매 이력을 3개월 이상 입력하면 정확도를 확인할 수 있습니다.
            </p>
          </div>
        ) : (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="rounded-lg border bg-surface p-3">
                <p className="text-xs text-muted-foreground">전체 평균 정확도</p>
                <p className={`text-2xl font-bold mt-1 ${avgAccuracy >= 80 ? "text-success" : avgAccuracy >= 65 ? "text-foreground" : "text-danger"}`}>
                  {avgAccuracy}%
                </p>
              </div>
              {best && (
                <div className="rounded-lg border bg-surface p-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> 최고 정확도 제품
                  </p>
                  <p className="text-sm font-semibold mt-1 text-foreground">{best.productName}</p>
                  <p className="text-xs text-muted-foreground">오차율 {best.mape}%</p>
                </div>
              )}
              {worst && worst !== best && (
                <div className="rounded-lg border bg-surface p-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" /> 최저 정확도 제품
                  </p>
                  <p className="text-sm font-semibold mt-1 text-foreground">{worst.productName}</p>
                  <p className="text-xs text-muted-foreground">오차율 {worst.mape}%</p>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제품명</TableHead>
                    <TableHead className="text-right">예측값</TableHead>
                    <TableHead className="text-right">실제값</TableHead>
                    <TableHead className="text-right">오차율(%)</TableHead>
                    <TableHead>정확도 등급</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const grade = getGrade(row.mape);
                    return (
                      <TableRow key={row.productName}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.forecast.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.actual.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.mape}%
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={grade.className}>
                            {grade.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
