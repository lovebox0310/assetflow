-- AssetFlow Sprint 1 데이터 모델 초안 (Issue /sprint "데이터 모델 초안 작성", project.md §37 설계 노트)
-- DB: PostgreSQL 15+
-- 금액 규칙: 모든 금액 컬럼은 BIGINT, 원 단위 정수 (§28.3 API 단위 규칙과 동일)
-- 시각 규칙: created_at/updated_at 은 timestamptz NOT NULL DEFAULT now().
--           updated_at 은 애플리케이션(MyBatis UPDATE 문)이 갱신한다 — 트리거 없음.
-- 소프트 삭제: 스프린트 1에는 도입하지 않는다. 규칙은 §37.4.

-- ---------------------------------------------------------------------------
-- users: 다른 3종 테이블의 부모
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL,           -- 인증 식별자 (§21)
    target_months INT NOT NULL DEFAULT 6,      -- 비상금 목표 개월 (§37.5 설정, 스프린트 3) 
    password_hash VARCHAR(255) NOT NULL,           -- 평문 저장 금지, BCrypt 등
    display_name  VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email)       -- AC: 인증 식별자 유니크 보장
);

-- ---------------------------------------------------------------------------
-- asset_accounts: 자산·부채 계정. 사용자별 다중 계정 허용 (AC)
-- 프론트 계약: src/data/dashboardMock.ts 의 AssetType(cash|deposit|invest|realty)과
--              liabilities 의 잔액(balance) 개념. enum 을 바꾸지 않는다.
-- ---------------------------------------------------------------------------
CREATE TABLE asset_accounts (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users (id),
    account_type     VARCHAR(16) NOT NULL
                     CHECK (account_type IN ('cash', 'deposit', 'invest', 'realty')),
    name             VARCHAR(100) NOT NULL,        -- "우리 파킹통장" 등 화면 표시명
    institution_name VARCHAR(100),
    balance          BIGINT NOT NULL DEFAULT 0,    -- 원 단위. 부채 계정이면 대출 잔액(마이너스 금지)
    is_debt          BOOLEAN NOT NULL DEFAULT FALSE CHECK (balance >= 0),
    opened_at        DATE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_asset_accounts_opened_at CHECK (opened_at IS NULL OR opened_at >= DATE '1970-01-01')
);

-- 대시보드 계산 접근: 사용자의 자산(혹은 부채) 목록 조회
CREATE INDEX ix_asset_accounts_user_type ON asset_accounts (user_id, account_type);

-- ---------------------------------------------------------------------------
-- expense_categories: 기본 카테고리는 user_id NULL. 사용자 커스텀은 user_id NOT NULL
-- ---------------------------------------------------------------------------
CREATE TABLE expense_categories (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT REFERENCES users (id),     -- NULL = 기본(전역) 카테고리
    name         VARCHAR(50) NOT NULL,
    is_essential BOOLEAN NOT NULL DEFAULT FALSE,   -- 비상금 분모(월 필수지출) 집계에 쓴다 (§28.7)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 기본 카테고리끼리 이름 중복 금지 (NULL 은 UNIQUE 에서 서로 다른 값으로 취급되므로
-- 명시적 부분 인덱스가 필요하다)
CREATE UNIQUE INDEX uq_expense_categories_default_name
    ON expense_categories (name) WHERE user_id IS NULL;
CREATE UNIQUE INDEX uq_expense_categories_user_name
    ON expense_categories (user_id, name) WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- monthly_snapshots: 월 기준 집계. 대시보드 API 3종(§25)의 조회 대상
-- snapshot 은 "그 시점의 원장 값의 총계"이므로 asset_accounts 의 잔액 변경을
-- 과거 월에 소급하지 않는다. 각 월의 값은 스냅샷 시점에 확정한다.
-- ---------------------------------------------------------------------------
CREATE TABLE monthly_snapshots (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id            BIGINT NOT NULL REFERENCES users (id),
    snapshot_month     CHAR(7) NOT NULL,           -- 'YYYY-MM' 첫 일은 의미 없음(1일로 통일)
    total_assets       BIGINT NOT NULL DEFAULT 0,  -- Σ asset_accounts.balance WHERE is_debt = FALSE
    total_debts        BIGINT NOT NULL DEFAULT 0,  -- Σ asset_accounts.balance WHERE is_debt = TRUE
    income             BIGINT NOT NULL DEFAULT 0,  -- 공급가액 기준 월 총수입
    expenses           BIGINT NOT NULL DEFAULT 0,  -- 월 총지출(필수+선택 전부)
    essential_expenses BIGINT,                     -- 월 필수지출 — 미확정이면 NULL
    essential_complete BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_monthly_snapshots_negatives
        CHECK (total_assets >= 0 AND total_debts >= 0 AND expenses >= 0),
    CONSTRAINT uq_monthly_snapshots_user_month UNIQUE (user_id, snapshot_month)  -- user+월 1행: 중복 스냅샷은 UPDATE
);

-- 사용자별 최근 N개월 조회(§25 cashflow API)는 위 유니크 인덱스
-- (user_id, snapshot_month) 범위 스캔으로 충분하다 — 별도 인덱스 불필요.

-- ---------------------------------------------------------------------------
-- merchant_rules: 가맹점 용도구분 자동 승계 규칙 (§49 · §55.8).
-- 한 사용자가 한 번 분류한 가맹점은 다음 반영 때 자동으로 같은 분류를 제안한다.
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_rules (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users (id),
    merchant_name VARCHAR(100) NOT NULL,
    expense_kind  VARCHAR(20),                    -- §55.10 대분류(legacy 용도구분 문자열과 동일)
    sub_category  VARCHAR(30),                    -- §55.10 세부 분류
    category_id   BIGINT REFERENCES expense_categories (id), -- §55.8 표준 카테고리
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_merchant_rules_user_merchant UNIQUE (user_id, merchant_name)
);

-- ---------------------------------------------------------------------------
-- card_imports: 카드매입 임포트 확정 행 (2026-10-18 추가, CardImportLedger 영속 저장처)
-- §29.6: (user_id, row_key) UNIQUE 로 중복 반영 금지를 DB 가 보증한다.
-- §29.7: 합계 컬럼은 두지 않는다 — 행에서 재계산한다(월 스냅샷과 같은 원칙).
-- ---------------------------------------------------------------------------
CREATE TABLE card_imports (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users (id),
    row_key       VARCHAR(120) NOT NULL,           -- 카드사 행 식별키
    approved_at   DATE NOT NULL,                   -- 승인일 (YYYY-MM-DD)
    merchant_name VARCHAR(100) NOT NULL,
    supply_ex_vat BIGINT NOT NULL,                 -- 공급가액 (원)
    vat           BIGINT NOT NULL,                 -- 부가세 (원)
    gross_amount  BIGINT NOT NULL,                 -- 공급대가 (원) = supply_ex_vat + vat
    card_masked   VARCHAR(32),                     -- 마스킹된 카드번호
    expense_kind      VARCHAR(20),                 -- §55.10 대분류(§49 legacy 용도구분 문자열과 동일)
    sub_category      VARCHAR(30),                 -- §55.10 세부 분류
    business_no       VARCHAR(20),                 -- 가맹점 사업자등록번호(하이픈 제거)
    business_category VARCHAR(50),                 -- 카드사가 붙인 업종
    category_id       BIGINT REFERENCES expense_categories (id), -- §55.8 표준 카테고리
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_imports_user_rowkey UNIQUE (user_id, row_key)
);

-- ---------------------------------------------------------------------------
-- merchant_category_keywords: 가맹점명 키워드 → 카테고리 매핑 (§55.8).
-- 우선순위가 높을수록 먼저 매칭한다.
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_category_keywords (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    keyword      VARCHAR(50) NOT NULL,
    category_id  BIGINT NOT NULL REFERENCES expense_categories (id),
    sub_category VARCHAR(30),                    -- §55.10 세부 분류
    priority     INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_merchant_category_keywords_keyword UNIQUE (keyword)
);

-- ---------------------------------------------------------------------------
-- monthly_expense_items: 월 지출 항목 (§43 — 스프린트 3 지출 화면의 원장)
-- 합계는 저장하지 않는다 — 행에서 재계산(§34.6 계산 단일 출처는 프론트 metrics.ts).
-- ---------------------------------------------------------------------------
CREATE TABLE monthly_expense_items (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users (id),
    month        CHAR(7) NOT NULL,             -- 'YYYY-MM'
    category_id  BIGINT REFERENCES expense_categories (id), -- §55.8 표준 카테고리
    label        VARCHAR(50) NOT NULL,         -- 항목명
    amount       BIGINT NOT NULL,              -- 월 금액 (원)
    is_essential BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_vat BIGINT NOT NULL DEFAULT 0,    -- 매입세액 (원)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_expense_item_nonneg CHECK (amount >= 0 AND purchase_vat >= 0),
    CONSTRAINT uq_expense_item UNIQUE (user_id, month, label)
);
CREATE INDEX ix_expense_items_user_month ON monthly_expense_items (user_id, month);

-- ---------------------------------------------------------------------------
-- recurring_expenses: 정기(고정) 지출 정의 (§45 — 매달 월 지출 항목에 자동 등록).
-- "매달 반복되는 약속" — 월 표 조회 시 멱등하게 물리행을 만들어 등록한다(§45.2).
-- ---------------------------------------------------------------------------
CREATE TABLE recurring_expenses (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users (id),
    label        VARCHAR(50) NOT NULL,
    amount       BIGINT NOT NULL,
    is_essential BOOLEAN NOT NULL DEFAULT FALSE,
    purchase_vat BIGINT NOT NULL DEFAULT 0,
    start_month  CHAR(7) NOT NULL,           -- 'YYYY-MM'
    end_month    CHAR(7),                    -- NULL = 무기한
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_recurring_nonneg CHECK (amount >= 0 AND purchase_vat >= 0),
    CONSTRAINT ck_recurring_months CHECK (end_month IS NULL OR end_month >= start_month),
    CONSTRAINT uq_recurring UNIQUE (user_id, label, start_month)
);

-- 월 지출 항목이 어떤 정기 항목에서 생성됐는지 — FE 의 정기/수동 배지와 "정기 항목 수정" 링크용
ALTER TABLE monthly_expense_items ADD COLUMN recurring_id BIGINT REFERENCES recurring_expenses (id);

-- ---------------------------------------------------------------------------
-- investment_holdings: 투자 계좌의 보유종목 (§54.2 — 2026-10-24 확정, Sprint 5 E1).
-- 계좌(asset_accounts, account_type='invest')의 balance 는 예수금이다(§54.3).
-- 평가액·손익·총액은 저장하지 않는다 — 수량 × 가격 × 환율로 매번 계산한다.
-- crypto 는 소수 수량이 필요해 quantity 만 NUMERIC(24,8) 이다.
-- ---------------------------------------------------------------------------
CREATE TABLE investment_holdings (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users (id),
    account_id   BIGINT NOT NULL REFERENCES asset_accounts (id) ON DELETE CASCADE,
    asset_class  VARCHAR(16) NOT NULL
                 CHECK (asset_class IN ('stock', 'etf', 'bond', 'fund', 'crypto')),
    symbol       VARCHAR(32),                 -- '005930' · 'BTC' (없을 수 있음)
    name         VARCHAR(100) NOT NULL,
    currency     CHAR(3) NOT NULL DEFAULT 'KRW',
    quantity     NUMERIC(24, 8) NOT NULL CHECK (quantity >= 0),
    avg_price    NUMERIC(20, 4) NOT NULL CHECK (avg_price >= 0),
    market_price NUMERIC(20, 4) NOT NULL CHECK (market_price >= 0),
    fx_rate      NUMERIC(12, 6) NOT NULL DEFAULT 1 CHECK (fx_rate > 0),
    price_as_of  DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_holding_currency CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX ix_holdings_user_account ON investment_holdings (user_id, account_id);

-- ---------------------------------------------------------------------------
-- merchant_business_info: 사업자번호별 외부 조회 정보 캐시
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_business_info (
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

CREATE INDEX idx_merchant_business_info_user_business
    ON merchant_business_info (user_id, business_no);
