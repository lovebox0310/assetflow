-- §59.6 비상금 통장을 복수 계좌로 전환한다 (2026-10-30).
--
-- 배경: 단일 `users.emergency_account_id` 는 "비상금 통장 1개"만 표현할 수 있었다.
-- 확정된 기준은 다음과 같다.
--   - 자격: **현금성(cash)** 계좌만. 예적금(deposit)은 제외한다.
--   - 분자: 선택한 계좌들의 잔액 **합계**.
--   - 용도가 다른 계좌(자동이체·부가세 등)는 사용자가 선택하지 않는 방식으로 제외한다.
--
-- 이 마이그레이션은 기존 단일 지정을 조인 테이블로 옮긴 뒤 컬럼을 제거한다.
-- 여러 번 실행해도 안전하다.

CREATE TABLE IF NOT EXISTS user_emergency_accounts (
    user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES asset_accounts (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, account_id)
);

CREATE INDEX IF NOT EXISTS ix_user_emergency_accounts_user
    ON user_emergency_accounts (user_id);

-- 기존 단일 지정(users.emergency_account_id)을 조인 테이블로 이관한다.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'users'
           AND column_name = 'emergency_account_id'
    ) THEN
        INSERT INTO user_emergency_accounts (user_id, account_id)
        SELECT u.id, u.emergency_account_id
          FROM users u
          JOIN asset_accounts a ON a.id = u.emergency_account_id
         WHERE u.emergency_account_id IS NOT NULL
           -- 새 기준(§59.6)과 맞지 않는 예적금·부채 지정은 이관하지 않는다.
           AND a.account_type = 'cash'
           AND a.is_debt = FALSE
        ON CONFLICT DO NOTHING;

        ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_emergency_account;
        ALTER TABLE users DROP COLUMN emergency_account_id;
    END IF;
END $$;
