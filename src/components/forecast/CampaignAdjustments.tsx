import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}월`,
}));

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
const defaultYearForMonth = now.getMonth() + 2 > 12 ? defaultYear + 1 : defaultYear;

interface AdjForm {
  productId: string;
  year: number;
  month: number;
  isIncrease: boolean;
  pct: string;
  reason: string;
}

const EMPTY_FORM: AdjForm = {
  productId: "",
  year: defaultYearForMonth,
  month: defaultMonth,
  isIncrease: true,
  pct: "",
  reason: "",
};

export default function CampaignAdjustments() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<AdjForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: adjustments, isLoading } = useQuery({
    queryKey: ["forecast-adjustments-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_adjustments")
        .select("id, product_id, year, month, adjustment_pct, reason, created_at")
        .order("created_at", { ascending: false });
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

  const productMap = useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p.name])),
    [products]
  );

  const previewKey = `${form.productId}-${form.year}-${form.month}`;
  const { data: previewData } = useQuery({
    queryKey: ["forecast-preview", previewKey],
    enabled: !!form.productId && sheetOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_results")
        .select("season_adjusted")
        .eq("product_id", form.productId)
        .eq("year", form.year)
        .eq("month", form.month)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const preview = useMemo(() => {
    if (!form.productId) return null;
    if (!previewData?.season_adjusted) return { exists: false as const };
    const sa = previewData.season_adjusted;
    const pct = parseInt(form.pct, 10) || 0;
    const signed = form.isIncrease ? pct : -pct;
    const after = Math.round(sa * (1 + signed / 100));
    return { exists: true as const, before: sa, after, pct: signed };
  }, [previewData, form.productId, form.pct, form.isIncrease]);

  const upsertMutation = useMutation({
    mutationFn: async (f: AdjForm) => {
      const pctVal = parseInt(f.pct, 10) || 0;
      const signedPct = f.isIncrease ? pctVal : -pctVal;

      const { error } = await supabase.from("forecast_adjustments").upsert(
        {
          product_id: f.productId,
          year: f.year,
          month: f.month,
          adjustment_pct: signedPct,
          reason: f.reason.trim() || null,
        },
        { onConflict: "product_id,year,month" }
      );
      if (error) throw error;

      const { data: result } = await supabase
        .from("forecast_results")
        .select("id, season_adjusted")
        .eq("product_id", f.productId)
        .eq("year", f.year)
        .eq("month", f.month)
        .maybeSingle();

      if (result?.season_adjusted != null) {
        const finalForecast = Math.round(
          result.season_adjusted * (1 + signedPct / 100)
        );
        await supabase
          .from("forecast_results")
          .update({
            final_forecast: finalForecast,
            calculated_at: new Date().toISOString(),
          })
          .eq("id", result.id);
      }
    },
    onSuccess: () => {
      toast.success("보정이 저장되었습니다");
      queryClient.invalidateQueries();
      setSheetOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast.error("저장 중 오류가 발생했습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: adj } = await supabase
        .from("forecast_adjustments")
        .select("product_id, year, month")
        .eq("id", id)
        .maybeSingle();

      const { error } = await supabase.from("forecast_adjustments").delete().eq("id", id);
      if (error) throw error;

      if (adj) {
        const { data: result } = await supabase
          .from("forecast_results")
          .select("id, season_adjusted")
          .eq("product_id", adj.product_id)
          .eq("year", adj.year)
          .eq("month", adj.month)
          .maybeSingle();

        if (result?.season_adjusted != null) {
          await supabase
            .from("forecast_results")
            .update({
              final_forecast: result.season_adjusted,
              calculated_at: new Date().toISOString(),
            })
            .eq("id", result.id);
        }
      }
    },
    onSuccess: () => {
      toast.success("보정이 삭제되었습니다");
      queryClient.invalidateQueries();
      setDeleteTarget(null);
    },
    onError: () => toast.error("삭제 중 오류가 발생했습니다"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productId) { toast.error("제품을 선택해주세요"); return; }
    const pct = parseInt(form.pct, 10);
    if (isNaN(pct) || pct < 1 || pct > 100) { toast.error("보정률을 1~100% 사이로 입력해주세요"); return; }
    upsertMutation.mutate(form);
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">캠페인 보정</CardTitle>
          <Button
            size="sm"
            className="bg-teal text-teal-foreground hover:bg-teal/90"
            onClick={() => { setForm(EMPTY_FORM); setSheetOpen(true); }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            보정 추가
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6">로딩 중...</p>
          ) : !adjustments || adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              등록된 캠페인 보정이 없습니다
            </p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제품명</TableHead>
                    <TableHead>대상 연월</TableHead>
                    <TableHead className="text-right">보정률</TableHead>
                    <TableHead>사유</TableHead>
                    <TableHead>등록일</TableHead>
                    <TableHead className="w-[48px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((a) => {
                    const pct = a.adjustment_pct ?? 0;
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">
                          {productMap.get(a.product_id ?? "") ?? "알 수 없음"}
                        </TableCell>
                        <TableCell>{a.year}년 {a.month}월</TableCell>
                        <TableCell className={`text-right font-medium tabular-nums ${pct > 0 ? "text-success" : pct < 0 ? "text-danger" : ""}`}>
                          {pct > 0 ? "+" : ""}{pct}%
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {a.reason || "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {a.created_at ? new Date(a.created_at).toLocaleDateString("ko-KR") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-danger hover:text-danger"
                            onClick={() => setDeleteTarget(a.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      <Sheet open={sheetOpen} onOpenChange={(o) => !o && setSheetOpen(false)}>
        <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>보정 추가</SheetTitle>
            <SheetDescription>캠페인이나 프로모션에 따라 예측을 보정합니다</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>제품 선택 *</Label>
              <Select
                value={form.productId}
                onValueChange={(v) => setForm((p) => ({ ...p, productId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="제품을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>연도</Label>
                <Input
                  type="number"
                  min={2020}
                  max={2030}
                  value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: parseInt(e.target.value, 10) || defaultYear }))}
                />
              </div>
              <div className="space-y-2">
                <Label>월</Label>
                <Select
                  value={String(form.month)}
                  onValueChange={(v) => setForm((p) => ({ ...p, month: parseInt(v, 10) }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>보정 방향</Label>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${!form.isIncrease ? "text-danger" : "text-muted-foreground"}`}>
                  감소 −
                </span>
                <Switch
                  checked={form.isIncrease}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, isIncrease: v }))}
                />
                <span className={`text-sm font-medium ${form.isIncrease ? "text-success" : "text-muted-foreground"}`}>
                  증가 +
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>보정률 (%) *</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.pct}
                onChange={(e) => setForm((p) => ({ ...p, pct: e.target.value }))}
                placeholder="예: 30"
              />
            </div>

            <div className="space-y-2">
              <Label>사유</Label>
              <Input
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="예: TikTok 인플루언서 캠페인"
                maxLength={200}
              />
            </div>

            {preview && (
              <div className={`rounded-lg border p-3 text-sm ${preview.exists ? "bg-surface" : "border-destructive/30 bg-destructive/5"}`}>
                {preview.exists ? (
                  <p>
                    현재 예측{" "}
                    <span className="font-bold">{preview.before.toLocaleString()}개</span>
                    {" → 보정 후 "}
                    <span className={`font-bold ${preview.after > preview.before ? "text-success" : preview.after < preview.before ? "text-danger" : ""}`}>
                      {preview.after.toLocaleString()}개
                    </span>
                    <span className="text-muted-foreground ml-1">
                      ({preview.pct > 0 ? "+" : ""}{preview.pct}%)
                    </span>
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    먼저 예측 업데이트를 실행해주세요
                  </p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-teal text-teal-foreground hover:bg-teal/90"
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? "저장 중..." : "보정 저장"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>보정 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 캠페인 보정을 삭제하면 해당 월의 최종 예측이 시즌 보정값으로 되돌아갑니다. 계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
