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
