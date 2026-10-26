-- 카드/가맹점 분류 체계를 2단계(대분류 + 세부 분류)로 전환 (§55.10).
-- 새 설치 환경은 schema.sql 을 그대로 사용하면 된다.

-- 1. 세부 분류 컬럼 추가
ALTER TABLE card_imports
    ADD COLUMN IF NOT EXISTS sub_category VARCHAR(30);

ALTER TABLE merchant_rules
    ADD COLUMN IF NOT EXISTS sub_category VARCHAR(30);

ALTER TABLE merchant_category_keywords
    ADD COLUMN IF NOT EXISTS sub_category VARCHAR(30);

-- 2. 기존 대분류 이름을 §55.10 표준 이름으로 변경
--    (expense_kind 는 문자열로 저장되므로 category_id 와 무관하게 UPDATE 한다)
UPDATE card_imports
SET expense_kind = CASE expense_kind
    WHEN '식비' THEN '식비'
    WHEN '교통비' THEN '교통/차량'
    WHEN '보험료' THEN '금융/세금'
    WHEN '경조사비' THEN '기타/경조사'
    WHEN '주거비·통신비' THEN '주거/통신'
    WHEN '주거비' THEN '주거/통신'
    WHEN '통신비' THEN '주거/통신'
    WHEN '쇼핑' THEN '쇼핑/생활'
    WHEN '미용·의류' THEN '쇼핑/생활'
    WHEN '의료비' THEN '건강/의료'
    WHEN '여가/취미' THEN '문화/여가'
    WHEN '교육비' THEN '교육'
    WHEN '기타' THEN '기타/경조사'
    WHEN '사업비용' THEN '기타/경조사'
    WHEN '자산취득' THEN '금융/세금'
    ELSE expense_kind
END;

UPDATE merchant_rules
SET expense_kind = CASE expense_kind
    WHEN '식비' THEN '식비'
    WHEN '교통비' THEN '교통/차량'
    WHEN '보험료' THEN '금융/세금'
    WHEN '경조사비' THEN '기타/경조사'
    WHEN '주거비·통신비' THEN '주거/통신'
    WHEN '주거비' THEN '주거/통신'
    WHEN '통신비' THEN '주거/통신'
    WHEN '쇼핑' THEN '쇼핑/생활'
    WHEN '미용·의류' THEN '쇼핑/생활'
    WHEN '의료비' THEN '건강/의료'
    WHEN '여가/취미' THEN '문화/여가'
    WHEN '교육비' THEN '교육'
    WHEN '기타' THEN '기타/경조사'
    WHEN '사업비용' THEN '기타/경조사'
    WHEN '자산취득' THEN '금융/세금'
    ELSE expense_kind
END;

-- 3. 새 카테고리 이름을 expense_categories 에도 반영한다.
--    기존 이름이 같은 대분류는 그대로 두고, 이름이 바뀐 항목은 새 행이 추가된다.
--    ON CONFLICT(name) WHERE user_id IS NULL 처리는 애플리케이션 시드(CategorySeedData)가 담당한다.
INSERT INTO expense_categories (user_id, name, is_essential)
VALUES
    (NULL, '식비', FALSE),
    (NULL, '주거/통신', TRUE),
    (NULL, '교통/차량', FALSE),
    (NULL, '쇼핑/생활', FALSE),
    (NULL, '건강/의료', FALSE),
    (NULL, '문화/여가', FALSE),
    (NULL, '금융/세금', TRUE),
    (NULL, '기타/경조사', FALSE),
    (NULL, '교육', FALSE)
ON CONFLICT (name) WHERE user_id IS NULL
DO UPDATE SET updated_at = now();
