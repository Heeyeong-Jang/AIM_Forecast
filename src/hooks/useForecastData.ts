import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

function getNextMonth() {
  return currentMonth === 12
    ? { year: currentYear + 1, month: 1 }
    : { year: currentYear, month: currentMonth + 1 };
}

function getNext5Months() {
  const months: { year: number; month: number }[] = [];
  let y = currentYear;
  let m = currentMonth;
  for (let i = 0; i < 5; i++) {
    if (m > 12) { m = 1; y++; }
    months.push({ year: y, month: m });
    m++;
  }
  return months;
}

export const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export function useProductCount() {
  return useQuery({
    queryKey: ["forecast-product-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("forecast_products")
        .select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });
}

export function useNextMonthForecastSum() {
  const next = getNextMonth();
  return useQuery({
    queryKey: ["forecast-next-sum", next.year, next.month],
    queryFn: async () => {
      const { data } = await supabase
        .from("forecast_results")
        .select("final_forecast")
        .eq("year", next.year)
        .eq("month", next.month);
      return (data ?? []).reduce((s, r) => s + (r.final_forecast ?? 0), 0);
    },
  });
}

export function useForecastCompletedCount() {
  const next = getNextMonth();
  return useQuery({
    queryKey: ["forecast-completed", next.year, next.month],
    queryFn: async () => {
      const { count } = await supabase
        .from("forecast_results")
        .select("*", { count: "exact", head: true })
        .eq("year", next.year)
        .eq("month", next.month);
      return count ?? 0;
    },
  });
}

export function useActiveAdjustments() {
  const next = getNextMonth();
  return useQuery({
    queryKey: ["forecast-adjustments-active", currentYear, currentMonth],
    queryFn: async () => {
      const { count } = await supabase
        .from("forecast_adjustments")
        .select("*", { count: "exact", head: true })
        .or(
          `and(year.eq.${currentYear},month.eq.${currentMonth}),and(year.eq.${next.year},month.eq.${next.month})`
        );
      return count ?? 0;
    },
  });
}

export function useMonthlyForecastChart() {
  const months = getNext5Months();
  return useQuery({
    queryKey: ["forecast-chart", months],
    queryFn: async () => {
      const [{ data: results }, { data: products }, { data: sales }] = await Promise.all([
        supabase.from("forecast_results").select("product_id, year, month, final_forecast"),
        supabase.from("forecast_products").select("id, name"),
        supabase.from("forecast_sales_history").select("product_id, year, month, channel, actual_quantity"),
      ]);

      const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));

      const filtered = (results ?? []).filter((r) =>
        months.some((m) => m.year === r.year && m.month === r.month)
      );

      // Build sales lookup: year-month -> product_id -> qty (use 전체 channel)
      const salesMap = new Map<string, Map<string, number>>();
      for (const s of (sales ?? [])) {
        if (s.channel !== "전체") continue;
        const key = `${s.year}-${s.month}`;
        if (!salesMap.has(key)) salesMap.set(key, new Map());
        salesMap.get(key)!.set(s.product_id ?? "", s.actual_quantity ?? 0);
      }

      return { months, filtered, productMap, salesMap };
    },
  });
}

export function useCurrentMonthSummary() {
  return useQuery({
    queryKey: ["forecast-summary", currentYear, currentMonth],
    queryFn: async () => {
      const { data: results } = await supabase
        .from("forecast_results")
        .select("product_id, base_forecast, season_adjusted, final_forecast")
        .eq("year", currentYear)
        .eq("month", currentMonth);

      const { data: products } = await supabase
        .from("forecast_products")
        .select("id, name");

      const { data: adjustments } = await supabase
        .from("forecast_adjustments")
        .select("product_id, adjustment_pct")
        .eq("year", currentYear)
        .eq("month", currentMonth);

      const productMap = new Map((products ?? []).map((p) => [p.id, p.name]));
      const adjMap = new Map(
        (adjustments ?? []).map((a) => [a.product_id, a.adjustment_pct ?? 0])
      );

      return (results ?? []).map((r) => ({
        productName: productMap.get(r.product_id ?? "") ?? "알 수 없음",
        baseForecast: r.base_forecast ?? 0,
        seasonAdjusted: r.season_adjusted ?? 0,
        adjustmentPct: adjMap.get(r.product_id ?? "") ?? 0,
        finalForecast: r.final_forecast ?? 0,
      }));
    },
  });
}
