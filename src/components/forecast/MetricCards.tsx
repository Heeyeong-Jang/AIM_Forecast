import { Card, CardContent } from "@/components/ui/card";
import { Package, TrendingUp, CheckCircle, SlidersHorizontal } from "lucide-react";
import {
  useProductCount,
  useNextMonthForecastSum,
  useForecastCompletedCount,
  useActiveAdjustments,
} from "@/hooks/useForecastData";

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  loading?: boolean;
}

function MetricCard({ icon, label, value, loading }: MetricCardProps) {
  return (
    <Card className="flex-1 min-w-[200px]">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal">
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold text-foreground">
            {loading ? "—" : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MetricCards() {
  const products = useProductCount();
  const forecastSum = useNextMonthForecastSum();
  const completed = useForecastCompletedCount();
  const adjustments = useActiveAdjustments();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        icon={<Package className="h-5 w-5" />}
        label="등록 제품 수"
        value={products.data ?? 0}
        loading={products.isLoading}
      />
      <MetricCard
        icon={<TrendingUp className="h-5 w-5" />}
        label="다음달 총 예측 판매"
        value={(forecastSum.data ?? 0).toLocaleString() + "개"}
        loading={forecastSum.isLoading}
      />
      <MetricCard
        icon={<CheckCircle className="h-5 w-5" />}
        label="예측 완료 제품"
        value={completed.data ?? 0}
        loading={completed.isLoading}
      />
      <MetricCard
        icon={<SlidersHorizontal className="h-5 w-5" />}
        label="보정 적용 중"
        value={adjustments.data ?? 0}
        loading={adjustments.isLoading}
      />
    </div>
  );
}
