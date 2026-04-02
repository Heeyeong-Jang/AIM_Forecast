import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Upload, AlertTriangle, Search } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHANNELS = ["전체", "올리브영", "스마트스토어", "TikTok Shop", "오프라인 위탁", "기타"];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}월`,
}));

const now = new Date();
const defaultYear = now.getFullYear();
const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // last month

interface SalesForm {
  productId: string;
  year: number;
  month: number;
  channel: string;
  actualQuantity: string;
}

const EMPTY_FORM: SalesForm = {
  productId: "",
  year: defaultYear,
  month: defaultMonth,
  channel: "전체",
  actualQuantity: "",
};

export default function SalesHistoryManager() {
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<SalesForm>(EMPTY_FORM);
  const [productSearch, setProductSearch] = useState("");
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [csvUnmatched, setCsvUnmatched] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Products list
  const { data: products } = useQuery({
    queryKey: ["forecast-products-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_products")
        .select("id, name, volume")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Recent sales for selected product
  const { data: recentSales } = useQuery({
    queryKey: ["forecast-recent-sales", form.productId],
    enabled: !!form.productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("forecast_sales_history")
        .select("year, month, channel, actual_quantity")
        .eq("product_id", form.productId)
        .order("year", { ascending: false })
        .order("month", { ascending: false })
        .limit(18); // get more rows, then deduplicate by year-month
      if (error) throw error;

      // Take last 6 unique year-month combos
      const seen = new Set<string>();
      const filtered: typeof data = [];
      for (const row of data) {
        const key = `${row.year}-${row.month}`;
        if (!seen.has(key)) {
          seen.add(key);
          if (seen.size > 6) break;
        }
        filtered.push(row);
      }
      return filtered;
    },
  });

  const uniqueMonths = useMemo(() => {
    if (!recentSales) return 0;
    const set = new Set(recentSales.map((r) => `${r.year}-${r.month}`));
    return set.size;
  }, [recentSales]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.volume && p.volume.toLowerCase().includes(q))
    );
  }, [products, productSearch]);

  const selectedProduct = products?.find((p) => p.id === form.productId);

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: async (f: SalesForm) => {
      const qty = parseInt(f.actualQuantity, 10);
      if (isNaN(qty) || qty < 0) throw new Error("invalid quantity");

      const { error } = await supabase.from("forecast_sales_history").upsert(
        {
          product_id: f.productId,
          year: f.year,
          month: f.month,
          channel: f.channel,
          actual_quantity: qty,
        },
        { onConflict: "product_id,year,month,channel" }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("판매 이력이 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: ["forecast-recent-sales"] });
      setForm((prev) => ({ ...prev, actualQuantity: "" }));
    },
    onError: () => toast.error("저장 중 오류가 발생했습니다"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.productId) {
      toast.error("제품을 선택해주세요");
      return;
    }
    if (!form.actualQuantity || parseInt(form.actualQuantity, 10) < 0) {
      toast.error("판매량을 입력해주세요");
      return;
    }
    upsertMutation.mutate(form);
  }

  // CSV upload
  const handleCsvUpload = useCallback(
    async (file: File) => {
      const text = await file.text();
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        toast.error("CSV 파일에 데이터가 없습니다");
        return;
      }

      const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = header.indexOf("product_name");
      const yearIdx = header.indexOf("year");
      const monthIdx = header.indexOf("month");
      const channelIdx = header.indexOf("channel");
      const qtyIdx = header.indexOf("actual_quantity");

      if ([nameIdx, yearIdx, monthIdx, qtyIdx].some((i) => i === -1)) {
        toast.error(
          "CSV 헤더가 올바르지 않습니다. 필수: product_name, year, month, actual_quantity"
        );
        return;
      }

      // Fetch products for name matching
      const { data: allProducts } = await supabase
        .from("forecast_products")
        .select("id, name");
      const productNameMap = new Map(
        (allProducts ?? []).map((p) => [p.name.trim().toLowerCase(), p.id])
      );

      const matched: {
        product_id: string;
        year: number;
        month: number;
        channel: string;
        actual_quantity: number;
      }[] = [];
      const unmatchedNames = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const pName = cols[nameIdx] ?? "";
        const productId = productNameMap.get(pName.toLowerCase());
        if (!productId) {
          if (pName) unmatchedNames.add(pName);
          continue;
        }
        const year = parseInt(cols[yearIdx], 10);
        const month = parseInt(cols[monthIdx], 10);
        const qty = parseInt(cols[qtyIdx], 10);
        const channel = channelIdx >= 0 ? cols[channelIdx] || "전체" : "전체";
        if (isNaN(year) || isNaN(month) || isNaN(qty)) continue;
        matched.push({
          product_id: productId,
          year,
          month,
          channel,
          actual_quantity: qty,
        });
      }

      if (matched.length > 0) {
        const { error } = await supabase
          .from("forecast_sales_history")
          .upsert(matched, { onConflict: "product_id,year,month,channel" });
        if (error) {
          toast.error("업로드 중 오류가 발생했습니다");
          return;
        }
      }

      const unmatchedArr = [...unmatchedNames];
      setCsvUnmatched(unmatchedArr);

      if (unmatchedArr.length > 0) {
        toast.warning(
          `${matched.length}건 업로드 완료, ${unmatchedArr.length}건 매칭 실패`
        );
      } else {
        toast.success(`${matched.length}건 업로드 완료`);
      }

      queryClient.invalidateQueries({ queryKey: ["forecast-recent-sales"] });
    },
    [queryClient]
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">판매 이력</CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              CSV 업로드
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCsvUpload(file);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              className="bg-teal text-teal-foreground hover:bg-teal/90"
              onClick={() => {
                setForm(EMPTY_FORM);
                setCsvUnmatched([]);
                setSheetOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              판매 이력 입력
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {csvUnmatched.length > 0 && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                매칭 실패 제품명 ({csvUnmatched.length}건)
              </p>
              <ul className="mt-1.5 text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
                {csvUnmatched.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center py-4">
            CSV 형식: product_name, year, month, channel, actual_quantity
          </p>
        </CardContent>
      </Card>

      {/* Slide-over panel */}
      <Sheet open={sheetOpen} onOpenChange={(open) => !open && setSheetOpen(false)}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>판매 이력 입력</SheetTitle>
            <SheetDescription>월별 실제 판매 데이터를 입력합니다</SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {/* Product searchable dropdown */}
            <div className="space-y-2">
              <Label>제품 선택 *</Label>
              <Popover open={productDropdownOpen} onOpenChange={setProductDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                  >
                    {selectedProduct
                      ? `${selectedProduct.name}${selectedProduct.volume ? ` (${selectedProduct.volume})` : ""}`
                      : "제품을 검색하세요"}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <div className="p-2 border-b">
                    <Input
                      placeholder="제품명 검색..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto p-1">
                    {filteredProducts.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        검색 결과가 없습니다
                      </p>
                    ) : (
                      filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                            form.productId === p.id
                              ? "bg-teal/10 text-teal"
                              : "hover:bg-accent"
                          }`}
                          onClick={() => {
                            setForm((prev) => ({ ...prev, productId: p.id }));
                            setProductDropdownOpen(false);
                            setProductSearch("");
                          }}
                        >
                          <span className="font-medium">{p.name}</span>
                          {p.volume && (
                            <span className="ml-1.5 text-muted-foreground">
                              ({p.volume})
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sales-year">연도</Label>
                <Input
                  id="sales-year"
                  type="number"
                  min={2020}
                  max={2030}
                  value={form.year}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, year: parseInt(e.target.value, 10) || defaultYear }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>월</Label>
                <Select
                  value={String(form.month)}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, month: parseInt(v, 10) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>채널</Label>
              <Select
                value={form.channel}
                onValueChange={(v) => setForm((prev) => ({ ...prev, channel: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((ch) => (
                    <SelectItem key={ch} value={ch}>
                      {ch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sales-qty">실제 판매량 *</Label>
              <Input
                id="sales-qty"
                type="number"
                min={0}
                value={form.actualQuantity}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, actualQuantity: e.target.value }))
                }
                placeholder="0"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-teal text-teal-foreground hover:bg-teal/90"
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? "저장 중..." : "저장하기"}
            </Button>
          </form>

          {/* Recent sales for selected product */}
          {form.productId && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-foreground mb-3">
                최근 판매 이력
              </h3>

              {uniqueMonths > 0 && uniqueMonths < 3 && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600 shrink-0" />
                  <p className="text-sm text-yellow-700">
                    예측 정확도를 높이려면 최소 3개월 이상의 데이터가 필요합니다
                  </p>
                </div>
              )}

              {!recentSales || recentSales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  판매 이력이 없습니다
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>연월</TableHead>
                      <TableHead>채널</TableHead>
                      <TableHead className="text-right">실제 판매량</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentSales.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          {r.year}년 {r.month}월
                        </TableCell>
                        <TableCell>{r.channel}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(r.actual_quantity ?? 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
