import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentMonthSummary } from "@/hooks/useForecastData";

export default function ForecastSummaryTable() {
  const { data, isLoading } = useCurrentMonthSummary();

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">이번달 예측 요약</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            데이터 로딩 중...
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            예측 데이터가 없습니다
          </div>
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">제품명</TableHead>
                  <TableHead className="text-right whitespace-nowrap">기준 예측</TableHead>
                  <TableHead className="text-right whitespace-nowrap">시즌 보정</TableHead>
                  <TableHead className="text-right whitespace-nowrap">캠페인 보정</TableHead>
                  <TableHead className="text-right whitespace-nowrap">최종 예측</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => {
                  const isHigher = row.finalForecast > row.baseForecast;
                  const isLower = row.finalForecast < row.baseForecast;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.baseForecast.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.seasonAdjusted.toLocaleString()}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({row.seasonAdjusted >= row.baseForecast ? "+" : ""}
                          {row.seasonAdjusted - row.baseForecast})
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.adjustmentPct !== 0 ? (
                          <span>
                            {row.adjustmentPct > 0 ? "+" : ""}
                            {row.adjustmentPct}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-bold tabular-nums ${
                          isHigher ? "text-success" : isLower ? "text-danger" : ""
                        }`}
                      >
                        {row.finalForecast.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
