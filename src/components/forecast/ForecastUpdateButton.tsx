import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function getTargetMonths() {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  const targets: { year: number; month: number }[] = [];
  for (let i = 0; i < 4; i++) {
    if (m > 12) { m = 1; y++; }
    targets.push({ year: y, month: m });
    m++;
  }
  return targets;
}

function getPrev3Months(year: number, month: number) {
  const months: { year: number; month: number }[] = [];
  let y = year;
  let m = month;
  for (let i = 0; i < 3; i++) {
    m--;
    if (m < 1) { m = 12; y--; }
    months.push({ year: y, month: m });
  }
  return months;
}

interface ForecastUpdateResult {
  completed: number;
  skipped: string[];
}

export default function ForecastUpdateButton() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ForecastUpdateResult | null>(null);

  const runForecast = useCallback(async () => {
    setRunning(true);
    setResult(null);

    try {
      // Load all needed data
      const [productsRes, salesRes, coeffRes, adjRes] = await Promise.all([
        supabase.from("forecast_products").select("id, name"),
        supabase.from("forecast_sales_history").select("product_id, year, month, channel, actual_quantity"),
        supabase.from("forecast_season_coefficients").select("month, coefficient"),
        supabase.from("forecast_adjustments").select("product_id, year, month, adjustment_pct"),
      ]);

      const products = productsRes.data ?? [];
      const allSales = salesRes.data ?? [];
      const coefficients = new Map(
        (coeffRes.data ?? []).map((c) => [c.month, Number(c.coefficient)])
      );
      const adjustments = adjRes.data ?? [];

      const targets = getTargetMonths();
      const skipped: string[] = [];
      let completed = 0;
      const upsertRows: {
        product_id: string;
        year: number;
        month: number;
        base_forecast: number;
        season_adjusted: number;
        final_forecast: number;
        calculated_at: string;
      }[] = [];

      for (const product of products) {
        // Step 1: check data availability
        const productSales = allSales.filter((s) => s.product_id === product.id);
        const uniqueMonths = new Set(productSales.map((s) => `${s.year}-${s.month}`));
        if (uniqueMonths.size < 3) {
          skipped.push(product.name);
          continue;
        }

        for (const target of targets) {
          // Step 2: 3-month moving average
          const prev3 = getPrev3Months(target.year, target.month);
          const values: number[] = [];

          for (const pm of prev3) {
            const totalRow = productSales.find(
              (s) => s.year === pm.year && s.month === pm.month && s.channel === "전체"
            );
            if (totalRow && (totalRow.actual_quantity ?? 0) > 0) {
              values.push(totalRow.actual_quantity ?? 0);
            } else {
              // Sum all channels for that month
              const monthRows = productSales.filter(
                (s) => s.year === pm.year && s.month === pm.month
              );
              const sum = monthRows.reduce((acc, r) => acc + (r.actual_quantity ?? 0), 0);
              if (sum > 0 || monthRows.length > 0) values.push(sum);
            }
          }

          const baseForecast =
            values.length > 0
              ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
              : 0;

          // Step 3: season coefficient
          const coeff = coefficients.get(target.month) ?? 1.0;
          const seasonAdjusted = Math.round(baseForecast * coeff);

          // Step 4: campaign adjustment
          const adj = adjustments.find(
            (a) =>
              a.product_id === product.id &&
              a.year === target.year &&
              a.month === target.month
          );
          const finalForecast = adj
            ? Math.round(seasonAdjusted * (1 + (adj.adjustment_pct ?? 0) / 100))
            : seasonAdjusted;

          upsertRows.push({
            product_id: product.id,
            year: target.year,
            month: target.month,
            base_forecast: baseForecast,
            season_adjusted: seasonAdjusted,
            final_forecast: finalForecast,
            calculated_at: new Date().toISOString(),
          });
        }

        completed++;
      }

      // Step 5: batch upsert
      if (upsertRows.length > 0) {
        const { error } = await supabase
          .from("forecast_results")
          .upsert(upsertRows, { onConflict: "product_id,year,month" });
        if (error) throw error;
      }

      setResult({ completed, skipped });

      if (skipped.length > 0) {
        toast.warning(`예측 완료: ${completed}개 제품 / 데이터 부족: ${skipped.length}개 제품`);
      } else {
        toast.success(`예측 완료: ${completed}개 제품`);
      }

      // Refresh all dashboard data
      queryClient.invalidateQueries();
    } catch (err) {
      console.error(err);
      toast.error("예측 계산 중 오류가 발생했습니다");
    } finally {
      setRunning(false);
    }
  }, [queryClient]);

  return (
    <>
      <Button
        onClick={runForecast}
        disabled={running}
        className="bg-teal text-teal-foreground hover:bg-teal/90"
      >
        {running ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-1.5 h-4 w-4" />
        )}
        예측 업데이트
      </Button>

      {/* Loading overlay */}
      <AlertDialog open={running}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-teal" />
              예측 계산 중...
            </AlertDialogTitle>
            <AlertDialogDescription>
              모든 제품의 예측을 계산하고 있습니다. 잠시만 기다려주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      {/* Skipped products result */}
      {result && result.skipped.length > 0 && (
        <AlertDialog open={!!result} onOpenChange={(o) => !o && setResult(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                데이터 부족 제품 ({result.skipped.length}건)
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>
                  <p className="mb-3">
                    아래 제품은 판매 이력이 3개월 미만이어서 예측을 건너뛰었습니다.
                    판매 이력을 추가한 후 다시 실행해주세요.
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {result.skipped.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" onClick={() => setResult(null)}>
                닫기
              </Button>
              <Button
                className="bg-teal text-teal-foreground hover:bg-teal/90"
                onClick={() => {
                  setResult(null);
                  // Scroll to sales history section
                  document.querySelector("[data-section='sales-history']")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                판매 이력 입력하기
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
