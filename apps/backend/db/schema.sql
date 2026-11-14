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
    emergency_avg_months INT NOT NULL DEFAULT 3,   -- 카드지출 평균 개월 수 (§59)
    emergency_categories JSONB NOT NULL DEFAULT
        '["식비","주거/통신","건강/의료","금융/세금","교육"]'::jsonb, -- §59 선택 카테고리(9개 대분류)
    password_hash VARCHAR(255) NOT NULL,           -- 평문 저장 금지, BCrypt 등
    display_name  VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email),      -- AC: 인증 식별자 유니크 보장
    CONSTRAINT ck_users_emergency_avg_months
        CHECK (emergency_avg_months BETWEEN 1 AND 12),
    CONSTRAINT ck_users_emergency_categories
        CHECK (jsonb_typeof(emergency_categories) = 'array')
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
-- user_emergency_accounts: §59.6 비상금 통장(복수). 현금성(cash) 계좌만 지정한다.
-- 자동이체·부가세처럼 용도가 정해진 계좌는 여기에 넣지 않는 방식으로 제외한다.
-- 계좌가 삭제되면 그 지정만 함께 사라진다.
-- ---------------------------------------------------------------------------
CREATE TABLE user_emergency_accounts (
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES asset_accounts (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, account_id)             -- 같은 계좌 중복 지정 금지
);

CREATE INDEX ix_user_emergency_accounts_user ON user_emergency_accounts (user_id);

-- ---------------------------------------------------------------------------
-- user_composition_cash_accounts: §89 자산 구성비에서 "전액 현금성"으로 볼 계좌.
-- 비상금(user_emergency_accounts)과 독립이며 유형 제한은 없다(부채만 제외).
-- 비어 있으면 §88 기본 규칙(증권 예수금만 현금성)을 따른다.
-- 계좌가 삭제되면 그 지정만 함께 사라진다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_composition_cash_accounts (
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES asset_accounts (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, account_id)
);
CREATE INDEX IF NOT EXISTS ix_user_composition_cash_accounts_user
    ON user_composition_cash_accounts (user_id);

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
    vat_set_aside      BIGINT NOT NULL DEFAULT 0,  -- 부가세통장 적립 이체(지출 아님)
    expenses           BIGINT NOT NULL DEFAULT 0,  -- 월 총지출(필수+선택 전부)
    essential_expenses BIGINT,                     -- 월 필수지출 — 미확정이면 NULL
    essential_complete BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_monthly_snapshots_negatives
        CHECK (total_assets >= 0 AND total_debts >= 0 AND expenses >= 0 AND vat_set_aside >= 0),
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
    member_relation   VARCHAR(20) NOT NULL DEFAULT '본인', -- 카드 소유 구분: 본인/가족 등
    card_company      VARCHAR(20),                 -- 카드사(삼성카드/현대카드). 카드번호만으로는 판별이 불확실해 업로드 시 판별값을 저장한다
    category_id       BIGINT REFERENCES expense_categories (id), -- §55.8 표준 카테고리
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_imports_user_rowkey UNIQUE (user_id, row_key)
);

-- ---------------------------------------------------------------------------
-- card_statements: 카드 명세서 요약 (§72)
-- 월별 카드 금액을 거래 승인일 합계가 아니라 **명세서 이용기간 총액**으로 표시한다.
-- kind='billing' 만 월 금액에 사용한다 — 'detail' 은 기간을 지정해 요청한 상세내역서다.
-- usage_month 는 이용기간 시작 월(YYYY-MM)이다. 예: 10/02~11/03 → 2026-10.
-- ---------------------------------------------------------------------------
CREATE TABLE card_statements (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users (id),
    card_company  VARCHAR(20) NOT NULL,
    kind          VARCHAR(16) NOT NULL DEFAULT 'billing'
                  CHECK (kind IN ('billing', 'detail')),
    usage_month   CHAR(7) NOT NULL,
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    total_amount  BIGINT NOT NULL CHECK (total_amount >= 0),
    source        VARCHAR(20) NOT NULL DEFAULT 'email',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_statements_period UNIQUE (user_id, card_company, period_start, period_end)
);
CREATE INDEX ix_card_statements_month ON card_statements (user_id, usage_month);

-- ---------------------------------------------------------------------------
-- card_email_import_settings: 이메일 명세서 자동 수집 설정 (§63)
-- VestMail 비밀번호와 Gmail IMAP 앱 비밀번호는 AES/GCM 암호화하여 저장.
-- ---------------------------------------------------------------------------
CREATE TABLE card_email_import_settings (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id              BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    enabled              BOOLEAN NOT NULL DEFAULT FALSE,
    card_company         VARCHAR(20) NOT NULL CHECK (card_company IN ('hyundaicard','samsungcard')), -- §68
    email_provider       VARCHAR(20) NOT NULL DEFAULT 'gmail',
    email_address        VARCHAR(255) NOT NULL,
    email_password_enc   VARCHAR(500) NOT NULL,    -- IMAP 앱 비밀번호 암호문
    vestmail_password_enc VARCHAR(500) NOT NULL,   -- VestMail 복호화 비밀번호 암호문
    last_import_at       TIMESTAMPTZ,
    last_import_status   VARCHAR(20),               -- SUCCESS / FAILED / NO_MAIL
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_email_import_settings_user_company UNIQUE (user_id, card_company)
);

CREATE INDEX ix_card_email_import_settings_user ON card_email_import_settings (user_id);

-- §68 기존 DB 마이그레이션: spring.sql.init 은 CREATE TABLE 이 이미 있으면 그냥
-- 건너뛰므로(continue-on-error) CHECK 제약은 따로 갱신해 줘야 한다. 신규 DB 에서도
-- 같은 제약이 되므로 결과는 동일하다.
ALTER TABLE card_email_import_settings
    DROP CONSTRAINT IF EXISTS card_email_import_settings_card_company_check;
ALTER TABLE card_email_import_settings
    ADD CONSTRAINT card_email_import_settings_card_company_check
    CHECK (card_company IN ('hyundaicard','samsungcard'));

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
-- merchant_business_categories: 사업자번호(+가맹점 패턴) → 카테고리 매핑 (§67).
-- 사업자번호는 가맹점을 식별하는 가장 안정적인 키다. 다만 PG(결제대행) 사업자번호는
-- 여러 가맹점이 공유하므로(예: KCP 1138521083 = 넷플릭스·쿠팡·배달의민족)
-- merchant_pattern 으로 가맹점을 구분한다. 패턴이 빈 문자열이면 사업자번호 전체에 적용.
-- 패턴은 공백 제거 + 소문자로 정규화해 저장한다.
-- ---------------------------------------------------------------------------
CREATE TABLE merchant_business_categories (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users (id),
    business_no      VARCHAR(10) NOT NULL,
    merchant_pattern VARCHAR(100) NOT NULL DEFAULT '',
    category_id      BIGINT NOT NULL REFERENCES expense_categories (id),
    sub_category     VARCHAR(30),
    source           VARCHAR(20) NOT NULL DEFAULT 'seed',  -- 'seed' | 'user'
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_merchant_business_category UNIQUE (user_id, business_no, merchant_pattern)
);

CREATE INDEX ix_merchant_business_categories_no
    ON merchant_business_categories (user_id, business_no);

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

-- §57.6 대분류 — 고정/정기 항목을 지출 추이(9개 대분류)에 포함할 때 쓴다.
-- NULL = 추이에서 제외(카드대금처럼 카드내역과 이중계상되는 항목).
ALTER TABLE monthly_expense_items ADD COLUMN IF NOT EXISTS category VARCHAR(20);
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS category VARCHAR(20);

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
    issue_date   DATE,
    maturity_date DATE,
    source       VARCHAR(16) NOT NULL DEFAULT 'manual',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_holding_currency CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX ix_holdings_user_account ON investment_holdings (user_id, account_id);

-- §70 동기화 출처('manual' 사용자 입력 / 'kis' 한투 동기화). 기존 DB 마이그레이션.
-- 동기화가 완전히 성공하면 'kis' 행만 이번 결과로 정리하고 'manual' 행은 보존한다.
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'manual';
-- BOND-FORM-1: 채권 발행일/만기일 (다른 자산군은 NULL). 기존 DB에도 재배포만으로 적용된다.
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE investment_holdings ADD COLUMN IF NOT EXISTS maturity_date DATE;

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

-- 2026-10-29: 기존 DB 에 card_imports.member_relation 추가 마이그레이션
ALTER TABLE card_imports ADD COLUMN IF NOT EXISTS member_relation VARCHAR(20) NOT NULL DEFAULT '본인';

-- 2026-10-31: 기존 DB 에 card_imports.card_company 추가 마이그레이션
ALTER TABLE card_imports ADD COLUMN IF NOT EXISTS card_company VARCHAR(20);

-- ---------------------------------------------------------------------------
-- bank_account_links: 자산 계좌 ↔ 은행 빠른조회 연결 (§61 — 2026-11-03 확정).
-- 계좌번호는 암호화 문자열(account_number_enc)로만 저장한다. 계좌 비밀번호·
-- 생년월일은 저장하지 않는다 — 매 조회 요청마다 사용자가 입력한다.
-- 계좌 1개에 연결 1개(UNIQUE account_id). 자산 계좌를 지우면 연결도 지운다.
-- ---------------------------------------------------------------------------
CREATE TABLE bank_account_links (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users (id),
    account_id          BIGINT NOT NULL REFERENCES asset_accounts (id) ON DELETE CASCADE,
    bank_code           VARCHAR(8) NOT NULL CHECK (bank_code IN ('NH', 'KB', 'WR', 'IBK')),
    account_number_enc  TEXT NOT NULL,
    account_type        VARCHAR(16) NOT NULL DEFAULT 'personal'
                        CHECK (account_type IN ('personal', 'business')),
    last_synced_at      TIMESTAMPTZ,
    last_balance        BIGINT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_bank_link_account UNIQUE (account_id)
);
CREATE INDEX ix_bank_account_links_user ON bank_account_links (user_id);

-- ---------------------------------------------------------------------------
-- kis_account_credentials: 계좌별 한국투자증권(KIS) API 자격증명 (§62.2 — 2026-11-05).
-- app_key/app_secret 은 AES/GCM 암호화 문자열로 저장한다.
-- base_url 은 비어 있으면 전역 기본값(모의투자)을 사용한다.
-- ---------------------------------------------------------------------------
CREATE TABLE kis_account_credentials (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id      BIGINT NOT NULL REFERENCES asset_accounts (id) ON DELETE CASCADE,
    app_key_enc     TEXT NOT NULL,
    app_secret_enc  TEXT NOT NULL,
    base_url        VARCHAR(255),
    cano            VARCHAR(16) NOT NULL,
    acnt_prdt_cd    VARCHAR(4) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_kis_credentials_account UNIQUE (account_id)
);

CREATE INDEX ix_kis_credentials_user ON kis_account_credentials (user_id);

-- ---------------------------------------------------------------------------
-- upbit_credentials: 업비트 Open API 자격증명 (UPBIT-2 — 2026-11-10).
-- access/secret 키는 AES/GCM 암호화 문자열로 저장한다. 사용자당 1행.
-- 자산조회(View Account) 권한 + 등록 IP 만 사용하며 주문 권한은 쓰지 않는다.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS upbit_credentials (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    access_key_enc TEXT NOT NULL,
    secret_key_enc TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_upbit_credentials_user UNIQUE (user_id)
);
