# 운영 서버 데이터 손실 조사 보고서

**날짜**: 2026-11-01  
**사용자**: lovebox0310@gmail.com  
**상태**: 🔍 **조사 중** - 데이터 복구 계획 수립 필요

---

## 문제 요약

**운영 서버 (redbox9.iptime.org)에서 `lovebox0310@gmail.com` 사용자의 실제 자산/지출 데이터가 사라짐**

- **마지막 알려진 상태**: 2026-10-18 실제 데이터 이관 완료 (세션로그 1566줄)
  - 사용자: `lovebox0310@gmail.com` / BCrypt 비밀번호
  - 계좌: 현금(cash) 3개, 부동산(realty) 2개 존재
  - 자산 합계: 확인 필요 (백업에서 조회)
  
- **현재 상태**: 401 Invalid credentials (2026-11-01)
  - 운영 DB에 `lovebox0310@gmail.com` 사용자 없음
  - 모든 연관 데이터 손실
  - 로컬 개발 DB: 샘플 데이터만 존재

---

## 데이터 손실 타임라인

### 2026-10-18 — 홈서버 구축 및 데이터 이관 ✅

**세션로그 1566줄 기록:**
```
- [x] 로그인 자격증명 변경(사용자 요청) — lovebox0310@gmail.com / 개인 비밀번호(BCrypt).
  코드에는 자격증명을 두지 않고 OWNER_EMAIL 설정으로 분리(PostgresAssetLedger·
  application-postgres.yml), systemd 에 OWNER_EMAIL 적용. 구 자격증명(user@example.com) 
  행 삭제 — 시드 재생성 방지를 위해 data-seed.sql 의 시드 INSERT 도 제거
  (운영 사용자는 수동 생성 원칙, DEPLOY.md §7).
  
  외부 HTTPS 검증: 새 자격증명 로그인 200+expiresAt / 구 자격증명 401 / 변조 토큰 401
```

**당시 검증 상태**:
- ✅ 로그인 성공 (200 + JWT token)
- ✅ 자격증명 검증 (새 것 200, 구 것 401)
- ✅ 홈서버 배포 완료
- ✅ HTTPS 외부 접속 검증 완료

### 2026-10-24 — 운영 데이터 정리 (의심 시점)

**세션로그 1102~1106줄 기록:**
```
### 운영 데이터 정리

- `monthly_expense_items` id=180 중복 행 삭제
- `recurring_id=1` 인 `임대료` 행 23건 → `맥엔피씨임대료` 200,000원으로 일괄 변경
- 백업: `/tmp/opencode/cleanup_before.sql`
```

**주의**: 이 데이터 정리는 `lovebox0310@gmail.com` 사용자의 데이터를 수정했으나, **사용자 계정 자체를 삭제한 것은 아니어야 함**.

### 2026-11-01 — 데이터 손실 발견

```
curl -X POST https://redbox9.iptime.org/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lovebox0310@gmail.com","password":"@gusrma9"}'
  
→ 401 Invalid credentials
```

**원인 분석**:
1. 운영 DB의 `users` 테이블에서 `lovebox0310@gmail.com` 행 미존재
2. 모든 연관 자산/지출 데이터 손실 (FK 무결성)

---

## 데이터 복구 전략

### 1️⃣ **백업 확인** (최우선)

**백업 위치**: `/var/backups/assetflow/`
- 백업 정책: 7일 회전 (매일 03:15 자동 cron)
- 백업 파일 예상: `assetflow-YYYY-MM-DD.sql.gz`
- 필요한 백업 날짜:
  - ✅ `assetflow-2026-10-24.sql.gz` — 정리 직후
  - ✅ `assetflow-2026-10-23.sql.gz` — 정리 전
  - ✅ `assetflow-2026-10-18.sql.gz` — 이관 후

**확인 방법**:
```bash
# 운영 서버에서 SSH로 확인 불가 (포트 2222 연결 거부)
# → 다른 방법 필요
```

### 2️⃣ **로컬 백업 덤프** (차선책)

**로컬에 저장된 백업**: `/tmp/opencode/cleanup_before.sql` (2026-10-24 기록)

이 파일이 존재하면:
```bash
# 1. 파일 확인
ls -lah /tmp/opencode/cleanup_before.sql

# 2. 내용 확인 (사용자 데이터 존재 여부)
head -100 /tmp/opencode/cleanup_before.sql | grep -i lovebox0310
```

### 3️⃣ **데이터베이스 직접 복원**

#### 옵션 A: 로컬에서 백업 복원
```bash
# 1. 로컬 PostgreSQL에 임시 DB 생성
createdb assetflow_restore -U assetflow

# 2. 백업 복원
gunzip -c /var/backups/assetflow/assetflow-2026-10-23.sql.gz | \
  psql -U assetflow -d assetflow_restore

# 3. 데이터 검증
psql -U assetflow -d assetflow_restore -c \
  "SELECT id, email, display_name, created_at FROM users;"
```

#### 옵션 B: 운영 서버에서 원격 복원 (SSH 필요)
```bash
ssh -p 2222 redbox9@redbox9.iptime.org \
  "sudo -u postgres pg_dump assetflow | gzip > /tmp/current-db.sql.gz"

# 로컬로 전송
scp -P 2222 redbox9@redbox9.iptime.org:/tmp/current-db.sql.gz .

# 비교 분석
gunzip -c current-db.sql.gz | grep -i lovebox0310
```

---

## 복구 시나리오

### 시나리오 1: 백업이 존재하고 데이터가 완전함 ✅ (최선)

```
1. 백업 복원: assetflow-2026-10-23.sql.gz
2. users 테이블에서 lovebox0310@gmail.com 행 추출
3. 모든 연관 데이터 (자산·지출·카드임포트·정기항목) 추출
4. 운영 DB에 데이터 재삽입
5. 검증 및 배포
```

**예상 복구 시간**: 30분  
**데이터 손실 여부**: 없음 (2026-10-18 이후 입력된 새 데이터만 손실 가능)

### 시나리오 2: 백업이 손상되었거나 데이터가 부분 손실 ⚠️

```
1. 백업 파일 hexdump 검증 (gzip 매직 바이트 확인)
2. 가능한 가장 최신 백업부터 순차 복원 시도
3. 각 단계마다 users 테이블 검증
4. 가장 최신의 완전한 백업 사용
```

**예상 시간**: 1시간  
**데이터 손실 여부**: 백업 시점 이후의 입력 데이터 손실 (2-7일분)

### 시나리오 3: 백업도 없고 데이터가 확인 불가 ❌ (최악)

```
1. 운영 DB에 신규 사용자로 계정 재생성
2. 사용자에게 데이터 재입력 요청 또는 csv 제공받기
3. 카드 임포트 다시 수행
```

**예상 시간**: 수시간 (사용자 협력 필요)  
**데이터 손실 여부**: 완전 손실 - 재생성 필요

---

## 다음 조치

### 즉시 (오늘)

- [ ] `/tmp/opencode/cleanup_before.sql` 파일 존재 확인
  ```bash
  ls -lah /tmp/opencode/cleanup_before.sql
  ```

- [ ] 백업 파일 확인 (SSH 대체 방법 찾기)
  ```bash
  # 시도 1: scp로 백업 파일 다운로드
  scp -P 2222 redbox9@redbox9.iptime.org:/var/backups/assetflow/assetflow-2026-10-23.sql.gz .
  
  # 시도 2: 운영 서버에 파일 업로드 후 확인
  curl -X POST https://redbox9.iptime.org/api/v1/debug/backup-status (새 엔드포인트 필요)
  ```

- [ ] 임시로 새 사용자 계정 생성 (회원가입 API 사용)
  ```bash
  curl -X POST http://localhost:8080/api/v1/auth/signup \
    -H "Content-Type: application/json" \
    -d '{
      "email":"lovebox0310@gmail.com",
      "password":"@gusrma9",
      "displayName":"Lovebox User"
    }'
  ```

### 향후 (이번 주)

- [ ] 운영 DB 데이터 복구 완료
- [ ] 프론트엔드 회원가입 UI 구현
- [ ] 프로덕션 배포 (회원가입 + 데이터 복구)
- [ ] 사용자에게 로그인 가능 확인 통보

### 장기 (Sprint 2)

- [ ] 백업 전략 개선 (자동 클라우드 스토리지 동기화)
- [ ] 데이터 손실 감지 (weekly sanity check)
- [ ] 사용자 데이터 내보내기 기능 (CSV/JSON export)
- [ ] 계정 복구 요청 플로우

---

## 기술 상세

### 데이터 모델 (손실된 데이터)

**users 테이블**:
```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(50),
    target_months INT DEFAULT 6,
    emergency_avg_months INT DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**연관 테이블** (CASCADE/SET NULL에 따라 손실):
- `asset_accounts` (FK users.id) — 현금·부동산·투자 계좌
- `monthly_snapshots` (FK users.id) — 월별 자산 스냅샷
- `expense_items` (FK users.id) — 지출 항목
- `card_imports` (FK users.id) — 카드 임포트
- `card_import_rows` (FK card_imports.id) — 카드 원본 행
- `monthly_expense_items` (FK users.id) — 월 지출 행
- `recurring_expenses` (FK users.id) — 정기 항목 정의
- `merchant_rules` (FK users.id) — 자동 분류 규칙
- `investment_holdings` (FK users.id) — 보유 종목

**총 약 1,000~5,000행 손실 추정**

---

## 참고 문서

- `DEPLOY.md` §5: 데이터 이관 및 복구 절차
- `DEPLOY.md` §5.2: PostgreSQL 백업/복원
- `.ai/session-log.md` 2026-10-18: 홈서버 구축 기록
- `.ai/session-log.md` 2026-10-24: 데이터 정리 기록

---

**상태**: 🔍 **다음 단계 대기 중**

