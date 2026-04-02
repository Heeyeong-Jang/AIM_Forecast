import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings2, RotateCcw, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MONTH_LABELS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

const DEFAULTS: { coefficient: number; label: string }[] = [
  { coefficient: 0.85, label: "1월 비수기" },
  { coefficient: 0.90, label: "2월 비수기" },
  { coefficient: 1.15, label: "3월 봄 시작" },
  { coefficient: 1.28, label: "4월 봄 성수기" },
  { coefficient: 1.20, label: "5월 가정의달" },
  { coefficient: 0.95, label: "6월 평시" },
  { coefficient: 0.85, label: "7월 여름" },
  { coefficient: 0.80, label: "8월 여름 비수기" },
  { coefficient: 1.05, label: "9월 가을 시작" },
  { coefficient: 1.15, label: "10월 가을 성수기" },
  { coefficient: 1.25, label: "11월 블랙프라이데이" },
  { coefficient: 1.10, label: "12월 연말" },
];

interface Row {
  month: number;
  label: string;
  coefficient: number;
}

export default function SeasonSettings() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const { data } = useQuery({
    queryKey: ["forecast-season-coefficients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_season_coefficients")
        .select("month, coefficient, label")
        .order("month");
      if (error) throw error;
      return data;
    },
  });

  // Sync rows from query data when sheet opens
  useEffect(() => {
    if (open && data) {
      const mapped: Row[] = Array.from({ length: 12 }, (_, i) => {
        const found = data.find((d) => d.month === i + 1);
        return {
          month: i + 1,
          label: found?.label ?? DEFAULTS[i].label,
          coefficient: Number(found?.coefficient ?? DEFAULTS[i].coefficient),
        };
      });
      setRows(mapped);
    }
  }, [open, data]);

  const updateRow = useCallback((month: number, field: "label" | "coefficient", value: string | number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.month === month ? { ...r, [field]: value } : r
      )
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const upsertData = rows.map((r) => ({
        month: r.month,
        coefficient: Math.min(2.0, Math.max(0.5, r.coefficient)),
        label: r.label.trim() || MONTH_LABELS[r.month - 1],
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("forecast_season_coefficients")
        .upsert(upsertData, { onConflict: "month" });
      if (error) throw error;

      toast.success("시즌 설정이 저장되었습니다");
      queryClient.invalidateQueries();
      setOpen(false);
    } catch {
      toast.error("저장 중 오류가 발생했습니다");
    } finally {
      setSaving(false);
    }
  }, [rows, queryClient]);

  const handleReset = useCallback(() => {
    setRows(DEFAULTS.map((d, i) => ({ month: i + 1, ...d })));
    setResetConfirm(false);
  }, []);

  function barStyle(coeff: number) {
    const width = `${Math.round(coeff * 50)}%`;
    if (coeff > 1.0) return { width, className: "bg-success" };
    if (coeff < 1.0) return { width, className: "bg-primary/40" };
    return { width, className: "bg-muted-foreground/30" };
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="mr-1.5 h-4 w-4" />
        시즌 설정
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>시즌 계수 설정</SheetTitle>
            <SheetDescription>월별 시즌 계수를 조정하여 예측 정확도를 높입니다</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-1">
            {/* Table header */}
            <div className="grid grid-cols-[48px_1fr_80px_1fr] gap-2 px-1 pb-2 text-xs font-medium text-muted-foreground border-b">
              <span>월</span>
              <span>시즌 라벨</span>
              <span>계수</span>
              <span>시각화</span>
            </div>

            {rows.map((row) => {
              const bar = barStyle(row.coefficient);
              return (
                <div
                  key={row.month}
                  className="grid grid-cols-[48px_1fr_80px_1fr] gap-2 items-center px-1 py-1.5 rounded-md hover:bg-accent/50 transition-colors"
                >
                  <span className="text-sm font-medium text-foreground">
                    {MONTH_LABELS[row.month - 1]}
                  </span>
                  <Input
                    value={row.label}
                    onChange={(e) => updateRow(row.month, "label", e.target.value)}
                    className="h-8 text-sm"
                    maxLength={30}
                  />
                  <Input
                    type="number"
                    step={0.05}
                    min={0.5}
                    max={2.0}
                    value={row.coefficient}
                    onChange={(e) =>
                      updateRow(row.month, "coefficient", parseFloat(e.target.value) || 1.0)
                    }
                    className="h-8 text-sm tabular-nums"
                  />
                  <div className="h-6 w-full rounded bg-surface overflow-hidden flex items-center">
                    <div
                      className={`h-full rounded transition-all ${bar.className}`}
                      style={{ width: bar.width }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            계수 1.0 = 평시 기준. 예: 1.2 = 평시 대비 20% 수요 증가
          </p>

          <div className="mt-6 flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-teal text-teal-foreground hover:bg-teal/90"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              저장
            </Button>
            <Button
              variant="outline"
              onClick={() => setResetConfirm(true)}
              disabled={saving}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              기본값 초기화
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>기본값 초기화</AlertDialogTitle>
            <AlertDialogDescription>
              한국 화장품 시장 기본 시즌 계수로 초기화합니다. 현재 수정한 값은 사라집니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>초기화</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
