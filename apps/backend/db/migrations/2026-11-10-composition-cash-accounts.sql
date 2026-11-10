-- §89 자산 구성비 "전액 현금성" 계좌 지정 (2026-11-10).
--
-- 배경: §88 은 증권 계좌의 예수금(balance)만 현금성으로 합치고 나머지를 투자로 본다.
-- 사용자가 계좌별로 분류를 개인화할 수 있도록, 여기 지정한 계좌는 유형과 무관하게
-- 전액 현금성으로 본다. 비상금 지정(user_emergency_accounts)과는 완전히 독립이다.
--
-- 규칙:
--   - 부채(is_debt) 계좌는 지정할 수 없다.
--   - 유형 제한 없음(deposit·invest·realty 포함).
--   - 비어 있으면 §88 기본 규칙을 따른다.
--   - 계좌가 삭제되면 지정도 CASCADE 로 사라진다.
--
-- 여러 번 실행해도 안전하다(IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS user_composition_cash_accounts (
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES asset_accounts (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, account_id)
);

CREATE INDEX IF NOT EXISTS ix_user_composition_cash_accounts_user
    ON user_composition_cash_accounts (user_id);
