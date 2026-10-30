-- 비상금 유지 개월 카드의 기준 저장 (§59).
-- 분자: 사용자가 지정한 비상금 통장 1개.
-- 분모: 월 필수지출(monthly.essentialExpenses) + 선택 카테고리 카드지출의 N개월 평균.
--
-- emergency_categories 는 9개 대분류 이름의 배열이다. 기본값은
-- 식비·주거/통신·건강/의료·금융/세금·교육 5개.

ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_account_id BIGINT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_avg_months INT NOT NULL DEFAULT 3;

ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_categories JSONB NOT NULL DEFAULT
    '["식비","주거/통신","건강/의료","금융/세금","교육"]'::jsonb;

-- 1~12개월만 허용한다. 이미 같은 이름의 제약이 있으면 건너뛴다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_emergency_avg_months'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT ck_users_emergency_avg_months
            CHECK (emergency_avg_months BETWEEN 1 AND 12);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_emergency_categories'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT ck_users_emergency_categories
            CHECK (jsonb_typeof(emergency_categories) = 'array');
    END IF;
END $$;

-- 비상금 통장 지정은 cash/deposit 계좌만 가능하다. 삭제되면 지정만 해제한다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_emergency_account'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_emergency_account
            FOREIGN KEY (emergency_account_id) REFERENCES asset_accounts (id) ON DELETE SET NULL;
    END IF;
END $$;

-- 기존 사용자 행은 기본값으로 채운다(컬럼 추가 시 DEFAULT 가 이미 적용된다).
UPDATE users
SET emergency_categories = '["식비","주거/통신","건강/의료","금융/세금","교육"]'::jsonb
WHERE emergency_categories IS NULL
   OR jsonb_typeof(emergency_categories) <> 'array';
