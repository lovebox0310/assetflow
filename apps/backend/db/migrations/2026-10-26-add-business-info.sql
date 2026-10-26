-- 카드 내역에 가맹점 사업자번호·업종 컬럼 추가.
-- 사용자가 카드 원본을 다시 임포트하면 이 컬럼들이 채워진다.

ALTER TABLE card_imports
    ADD COLUMN IF NOT EXISTS business_no VARCHAR(20),
    ADD COLUMN IF NOT EXISTS business_category VARCHAR(50);

-- 기존 행은 재임포트 전까지 비어 있어도 묵관없다.
