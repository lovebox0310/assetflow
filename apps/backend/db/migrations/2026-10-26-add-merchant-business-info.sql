-- 사업자번호별 외부 조회 정보 캐시 (bizno.net 등)
CREATE TABLE IF NOT EXISTS merchant_business_info (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    business_no VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    ceo_name VARCHAR(50),
    biz_type VARCHAR(50),
    biz_item VARCHAR(100),
    main_product VARCHAR(255),
    phone VARCHAR(30),
    fax VARCHAR(30),
    company_size VARCHAR(30),
    corporate_type VARCHAR(30),
    tax_type VARCHAR(50),
    headquarters VARCHAR(30),
    corporate_form VARCHAR(50),
    registered_at DATE,
    homepage VARCHAR(255),
    ir_homepage VARCHAR(255),
    email VARCHAR(100),
    business_status VARCHAR(50),
    corporate_reg_no VARCHAR(30),
    employees INT,
    zip_code VARCHAR(10),
    address TEXT,
    tax_office VARCHAR(100),
    fiscal_month INT,
    source VARCHAR(30) NOT NULL DEFAULT 'bizno.net',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_merchant_business_info_user_business UNIQUE (user_id, business_no)
);

CREATE INDEX IF NOT EXISTS idx_merchant_business_info_user_business
    ON merchant_business_info (user_id, business_no);
