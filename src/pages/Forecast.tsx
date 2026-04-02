import MetricCards from "@/components/forecast/MetricCards";
import ForecastChart from "@/components/forecast/ForecastChart";
import ForecastSummaryTable from "@/components/forecast/ForecastSummaryTable";
import ProductManager from "@/components/forecast/ProductManager";
import SalesHistoryManager from "@/components/forecast/SalesHistoryManager";
import ForecastUpdateButton from "@/components/forecast/ForecastUpdateButton";

export default function Forecast() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">📊 수요 예측 대시보드</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            제품별 판매 예측 현황을 한눈에 확인하세요
          </p>
        </div>
        <ForecastUpdateButton />
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <MetricCards />

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-[60%]">
            <ForecastChart />
          </div>
          <div className="lg:w-[40%]">
            <ForecastSummaryTable />
          </div>
        </div>

        <ProductManager />
        <div data-section="sales-history">
          <SalesHistoryManager />
        </div>
      </main>
    </div>
  );
}
