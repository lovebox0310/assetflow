-- UPBIT-2 업비트 Open API 자격증명 (2026-11-10).
--
-- 배경: 사용자가 업비트 Open API 키(자산조회 권한 + 등록 IP)를 설정 화면에 입력하면
-- 보유 코인을 '업비트' invest 계좌로 가져온다. 키는 AES/GCM 암호문으로만 저장하고,
-- 서버는 /v1/accounts 조회에만 쓴다(주문 권한·잔고 변경 없음).
--
-- 규칙:
--   - 사용자당 1행(UNIQUE user_id). 재저장 시 덮어쓴다.
--   - 사용자가 삭제되면 자격증명도 CASCADE 로 사라진다.
--   - access/secret 평문은 DB·로그에 남기지 않는다.
--
-- 여러 번 실행해도 안전하다(IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS upbit_credentials (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    access_key_enc TEXT NOT NULL,
    secret_key_enc TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_upbit_credentials_user UNIQUE (user_id)
);
