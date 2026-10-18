-- 단일 사용자 MVP 시드 (postgres 프로필 부팅 시 spring.sql.init 이 실행한다)
-- password_hash 는 임시값 — 진짜 인증 연결 시 BCrypt 해시로 교체한다(§21)
INSERT INTO users (email, password_hash, display_name)
VALUES ('user@example.com', 'placeholder-bcrypt', 'AssetFlow')
ON CONFLICT (email) DO NOTHING;
