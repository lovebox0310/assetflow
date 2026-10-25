-- 기존 DB 마이그레이션: 카드 내역 카테고리 자동 분류 (§55.8)
-- 새로 설치하는 환경은 schema.sql 을 그대로 사용하면 된다.

-- 1. merchant_rules 에 category_id 추가
ALTER TABLE merchant_rules
    ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES expense_categories (id);

-- 2. card_imports 에 category_id 추가
ALTER TABLE card_imports
    ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES expense_categories (id);

-- 3. monthly_expense_items 에 category_id 추가
ALTER TABLE monthly_expense_items
    ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES expense_categories (id);

-- 4. merchant_category_keywords 테이블 생성
CREATE TABLE IF NOT EXISTS merchant_category_keywords (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    keyword     VARCHAR(50) NOT NULL,
    category_id BIGINT NOT NULL REFERENCES expense_categories (id),
    priority    INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_merchant_category_keywords_keyword UNIQUE (keyword)
);
