-- 기존 authenticated-only 정책 삭제
DROP POLICY IF EXISTS "Authenticated users full access" ON forecast_products;
DROP POLICY IF EXISTS "Authenticated users full access" ON forecast_sales_history;
DROP POLICY IF EXISTS "Authenticated users full access" ON forecast_season_coefficients;
DROP POLICY IF EXISTS "Authenticated users full access" ON forecast_adjustments;
DROP POLICY IF EXISTS "Authenticated users full access" ON forecast_results;

-- anon + authenticated 모두 허용하는 정책 생성
CREATE POLICY "Allow all access" ON forecast_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON forecast_sales_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON forecast_season_coefficients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON forecast_adjustments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON forecast_results FOR ALL USING (true) WITH CHECK (true);