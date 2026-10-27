-- 고정/정기 지출 항목을 대시보드 지출 추이(9개 대분류)에 포함한다 (§57.6).
-- 새 설치 환경은 schema.sql 이 컬럼을 만들므로 이 파일은 운영 DB 1회 적용용이다.
-- 적용: PGPASSWORD=... psql -h localhost -U assetflow -d assetflow -f 이파일

ALTER TABLE monthly_expense_items ADD COLUMN IF NOT EXISTS category VARCHAR(20);
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS category VARCHAR(20);

-- 라벨 키워드 백필 — 이미 쌓인 22개월 행을 한 번에 분류한다(§57.6 매핑표).
UPDATE monthly_expense_items SET category = '교육'
WHERE category IS NULL AND label LIKE '%교육%';

UPDATE monthly_expense_items SET category = '주거/통신'
WHERE category IS NULL AND label LIKE '%임대료%';

UPDATE monthly_expense_items SET category = '금융/세금'
WHERE category IS NULL AND (label LIKE '%노란우산%' OR label LIKE '%보험%');

UPDATE monthly_expense_items SET category = '기타/경조사'
WHERE category IS NULL
  AND (label LIKE '%재단%' OR label LIKE '%칠드런%' OR label LIKE '%사랑밭%');

-- 정기 정의도 같은 규칙으로 채운다 — 다음 달 자동 등록 행이 바로 추이에 잡힌다.
UPDATE recurring_expenses SET category = '교육'
WHERE category IS NULL AND label LIKE '%교육%';

UPDATE recurring_expenses SET category = '주거/통신'
WHERE category IS NULL AND label LIKE '%임대료%';

UPDATE recurring_expenses SET category = '금융/세금'
WHERE category IS NULL AND (label LIKE '%노란우산%' OR label LIKE '%보험%');

UPDATE recurring_expenses SET category = '기타/경조사'
WHERE category IS NULL
  AND (label LIKE '%재단%' OR label LIKE '%칠드런%' OR label LIKE '%사랑밭%');

-- 여리카드대금은 카드내역과 이중계상되므로 NULL 로 남긴다(지출 추이 제외).
