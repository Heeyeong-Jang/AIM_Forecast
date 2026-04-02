
-- 제품 마스터 (Forecast 전용)
create table public.forecast_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text check (category in ('cosmetics', 'medical')),
  volume text,
  unit text default '개',
  created_at timestamptz default now()
);

-- 월별 실제 판매 이력
create table public.forecast_sales_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.forecast_products(id) on delete cascade,
  year integer not null,
  month integer not null check (month between 1 and 12),
  actual_quantity integer default 0,
  channel text default '전체',
  created_at timestamptz default now(),
  unique(product_id, year, month, channel)
);

-- 시즌 계수
create table public.forecast_season_coefficients (
  id uuid primary key default gen_random_uuid(),
  month integer not null check (month between 1 and 12),
  coefficient numeric(4,2) default 1.00,
  label text,
  updated_at timestamptz default now(),
  unique(month)
);

-- 캠페인 보정
create table public.forecast_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.forecast_products(id) on delete cascade,
  year integer not null,
  month integer not null,
  adjustment_pct integer default 0,
  reason text,
  created_at timestamptz default now()
);

-- 예측 결과
create table public.forecast_results (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.forecast_products(id) on delete cascade,
  year integer not null,
  month integer not null,
  base_forecast integer,
  season_adjusted integer,
  final_forecast integer,
  calculated_at timestamptz default now(),
  unique(product_id, year, month)
);

-- RLS 활성화
alter table public.forecast_products enable row level security;
alter table public.forecast_sales_history enable row level security;
alter table public.forecast_season_coefficients enable row level security;
alter table public.forecast_adjustments enable row level security;
alter table public.forecast_results enable row level security;

-- 인증된 사용자 전체 접근 정책
create policy "Authenticated users full access" on public.forecast_products for all to authenticated using (true) with check (true);
create policy "Authenticated users full access" on public.forecast_sales_history for all to authenticated using (true) with check (true);
create policy "Authenticated users full access" on public.forecast_season_coefficients for all to authenticated using (true) with check (true);
create policy "Authenticated users full access" on public.forecast_adjustments for all to authenticated using (true) with check (true);
create policy "Authenticated users full access" on public.forecast_results for all to authenticated using (true) with check (true);
