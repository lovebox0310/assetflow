-- 부가세통장 적립 이체를 월 스냅샷에 추가한다 (§57.9).
-- 지출이 아니라 수입에서 차감되는 항목으로, 수지 = income - vat_set_aside - expenses.

ALTER TABLE monthly_snapshots ADD COLUMN IF NOT EXISTS vat_set_aside BIGINT NOT NULL DEFAULT 0;

-- 기존 스냅샷은 vat_set_aside 를 0으로 둔다(이전 데이터는 구분 불가).
UPDATE monthly_snapshots SET vat_set_aside = 0 WHERE vat_set_aside IS NULL;
