import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
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

interface ProductForm {
  name: string;
  category: string;
  volume: string;
  unit: string;
}

const EMPTY_FORM: ProductForm = { name: "", category: "", volume: "", unit: "개" };

const CATEGORY_MAP: Record<string, string> = {
  cosmetics: "화장품",
  medical: "의료기기",
};

export default function ProductManager() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["forecast-products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (payload: ProductForm & { id?: string }) => {
      const dbCategory =
        payload.category === "화장품"
          ? "cosmetics"
          : payload.category === "의료기기"
          ? "medical"
          : payload.category;

      const row = {
        name: payload.name.trim(),
        category: dbCategory,
        volume: payload.volume.trim() || null,
        unit: payload.unit.trim() || "개",
      };

      if (payload.id) {
        const { error } = await supabase
          .from("forecast_products")
          .update(row)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("forecast_products").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "제품이 수정되었습니다" : "제품이 등록되었습니다");
      queryClient.invalidateQueries({ queryKey: ["forecast-products-list"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-product-count"] });
      closeSheet();
    },
    onError: () => toast.error("저장 중 오류가 발생했습니다"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("forecast_products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("제품이 삭제되었습니다");
      queryClient.invalidateQueries({ queryKey: ["forecast-products-list"] });
      queryClient.invalidateQueries({ queryKey: ["forecast-product-count"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("삭제 중 오류가 발생했습니다"),
  });

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(product: NonNullable<typeof products>[number]) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      category: CATEGORY_MAP[product.category ?? ""] ?? product.category ?? "",
      volume: product.volume ?? "",
      unit: product.unit ?? "개",
    });
    setSheetOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("제품명을 입력해주세요");
      return;
    }
    upsertMutation.mutate({ ...form, id: editingId ?? undefined });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">제품 관리</CardTitle>
          <Button
            size="sm"
            className="bg-teal text-teal-foreground hover:bg-teal/90"
            onClick={() => {
              setForm(EMPTY_FORM);
              setEditingId(null);
              setSheetOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            제품 등록
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">로딩 중...</p>
          ) : !products || products.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              등록된 제품이 없습니다
            </p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>제품명</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>용량</TableHead>
                    <TableHead>등록일</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{CATEGORY_MAP[p.category ?? ""] ?? p.category ?? "—"}</TableCell>
                      <TableCell>{p.volume ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {p.created_at
                          ? new Date(p.created_at).toLocaleDateString("ko-KR")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-danger hover:text-danger"
                            onClick={() => setDeleteTarget(p.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slide-over panel */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editingId ? "제품 수정" : "제품 등록"}</SheetTitle>
            <SheetDescription>
              {editingId ? "제품 정보를 수정합니다" : "새로운 제품을 등록합니다"}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="product-name">제품명 *</Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="예: 히알루론산 세럼"
                maxLength={200}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="화장품">화장품</SelectItem>
                  <SelectItem value="의료기기">의료기기</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-volume">용량/규격</Label>
              <Input
                id="product-volume"
                value={form.volume}
                onChange={(e) => setForm({ ...form, volume: e.target.value })}
                placeholder="예: 30ml, 1ea"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-unit">단위</Label>
              <Input
                id="product-unit"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="개"
                maxLength={20}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-teal text-teal-foreground hover:bg-teal/90"
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending
                ? "저장 중..."
                : editingId
                ? "수정하기"
                : "등록하기"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>제품 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 제품의 모든 예측 데이터가 삭제됩니다. 계속하시겠습니까?
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
