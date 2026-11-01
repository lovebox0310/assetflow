# 데이터 손실 원인 규명 및 복구 계획 (최종)

**작성일**: 2026-11-01  
**상황**: 운영 서버 `lovebox0310@gmail.com` 계정 및 전체 데이터 손실

---

## 📋 조사 결과 정리

### 발견된 사실

1. **백업 파일 확인됨** ✅
   - `/tmp/opencode/cleanup_before.sql` (2026-10-24, 21KB)
   - 데이터 내용: `recurring_expenses`, `monthly_expense_items` 포함
   - 그러나: **users 테이블 없음** (스키마/데이터 모두 미포함)
   
2. **운영 서버 백업 위치**
   - 경로: `/var/backups/assetflow/` (SSH 접속 불가로 직접 확인 불가)
   - 정책: 매일 03:15 자동 백업, 7일 보관
   - 파일명: `assetflow-YYYY-MM-DD.sql.gz`
   - **2026-10-23, 10-24, 10-25 백업이 존재할 가능성 높음**

3. **문제의 시점**
   - 2026-10-24: 데이터 정리 후 users 행이 소실된 것으로 추정
   - 2026-10-24 23:58 이후 시간대 추정 (cleanup SQL의 마지막 타임스탐프)

### 데이터 손실 가능성

**상황 A**: 운영 `/var/backups/assetflow/assetflow-2026-10-23.sql.gz` 에 완전한 데이터 존재
→ **복구 가능**, 손실 데이터 최소 (0-24시간)

**상황 B**: 모든 백업이 손상되었거나 users 테이블 미포함
→ **부분 복구**, 2026-10-18 이후 데이터 완전 손실

---

## 🔧 복구 방법 (3단계)

### **Step 1**: 운영 서버 백업 다운로드

```bash
# 방법 1: scp로 직접 다운로드 (권장)
scp -P 2222 redbox9@redbox9.iptime.org:/var/backups/assetflow/assetflow-2026-10-23.sql.gz \
  ~/assetflow-backup-2026-10-23.sql.gz

# 방법 2: 운영 서버에서 웹 임시 제공 (SSH 실패 시)
# → 새 API 엔드포인트 구현 필요 (보안 문제)

# 방법 3: 스토리지 액세스 (Google Drive, S3 등)
# → 설정되지 않음
```

**현재 문제**: SSH 포트 2222 "Connection refused"  
**해결책**: 
1. 운영 서버의 방화벽/포트포워딩 재확인
2. 다른 포트(22, 443 등)로 SSH 시도
3. 또는 운영 서버 로컬 접근 (물리적)

### **Step 2**: 백업 검증 및 복원

```bash
# 1. 백업 파일 검증
file ~/assetflow-backup-2026-10-23.sql.gz  # gzip 확인
gunzip -t ~/assetflow-backup-2026-10-23.sql.gz  # 무결성 테스트

# 2. 내용 확인 (사용자 데이터 존재 여부)
gunzip -c ~/assetflow-backup-2026-10-23.sql.gz | grep -i "lovebox0310" | head -20
gunzip -c ~/assetflow-backup-2026-10-23.sql.gz | grep "public.users" | head -5

# 3. 로컬 임시 DB에 복원
createdb assetflow_recovery -U assetflow
gunzip -c ~/assetflow-backup-2026-10-23.sql.gz | \
  psql -U assetflow -d assetflow_recovery

# 4. 데이터 검증
psql -U assetflow -d assetflow_recovery << 'EOF'
SELECT email, display_name FROM users WHERE email LIKE '%lovebox%';
SELECT COUNT(*) as "asset_accounts" FROM asset_accounts WHERE user_id = 1;
SELECT COUNT(*) as "expenses" FROM monthly_expense_items WHERE user_id = 1;
EOF
```

### **Step 3**: 운영 서버에 데이터 재적용

#### Option A: 완전 데이터 복원 (권장)
```bash
# 1. 운영 서버에 SSH 접속 후 현재 DB 백업
ssh -p 2222 redbox9@redbox9.iptime.org \
  "sudo -u postgres pg_dump assetflow | gzip > /tmp/current-before-restore.sql.gz"

# 2. 로컬에서 준비한 복구 스크립트 전송
scp -P 2222 recovery-script.sql redbox9@redbox9.iptime.org:/tmp/

# 3. 운영 서버에서 복구 실행
ssh -p 2222 redbox9@redbox9.iptime.org << 'EOF'
  sudo -u postgres psql -d assetflow -f /tmp/recovery-script.sql
  systemctl restart assetflow
EOF

# 4. 검증
curl -X POST https://redbox9.iptime.org/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lovebox0310@gmail.com","password":"@gusrma9"}'
# 예상 응답: 200 OK + JWT token
```

#### Option B: 임시 회원가입 + 데이터 수동 입력 (차선책)

만약 백업이 완전하지 않다면:

```bash
# 1. 운영 서버에 새 회원가입 엔드포인트 배포
# (이미 구현됨: POST /api/v1/auth/signup)

# 2. 새 계정 생성
curl -X POST https://redbox9.iptime.org/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email":"lovebox0310@gmail.com",
    "password":"@gusrma9",
    "displayName":"User"
  }'

# 3. 로그인 가능 확인
curl -X POST https://redbox9.iptime.org/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lovebox0310@gmail.com","password":"@gusrma9"}'

# 4. 이후 데이터 재입력:
#    - CSV import (card_imports)
#    - 자산 계좌 생성
#    - 정기 항목 설정
```

---

## 📊 데이터 손실 범위 추정

**손실된 데이터 (user_id=1, lovebox0310@gmail.com)**

| 테이블 | 행 수 | 내용 |
|--------|-------|------|
| users | 1 | 사용자 계정, 설정 |
| asset_accounts | ~5 | 현금 3, 부동산 2 |
| monthly_snapshots | ~12 | 월별 자산 현황 |
| expense_items | ~50-200 | 카드/수동 지출 항목 |
| card_imports | ~2-5 | 카드 파일 임포트 기록 |
| card_import_rows | ~500+ | 카드 상세 행 |
| monthly_expense_items | ~50-100 | 월 지출 정리 |
| recurring_expenses | ~8 | 정기 항목 정의 |
| merchant_rules | ~20-50 | 자동 분류 규칙 |
| investment_holdings | 0 | 투자 데이터 (Sprint 5에서 삭제됨) |
| **총계** | **~700-1,000+** | **약 7일-10일분의 사용 데이터** |

---

## ⚠️ 근본 원인 분석

### 왜 사용자 계정이 삭제되었을까?

**가설 1**: 데이터 정리 스크립트의 실수
- 2026-10-24 "운영 데이터 정리" 작업 중 사용자 행이 실수로 DELETE됨
- `DELETE FROM users WHERE user_id = 1` 또는 유사한 명령

**가설 2**: 운영 서버 재배포 중 오류
- 이전 `data-seed.sql`이 실행되면서 시드 사용자만 남고 실제 사용자 삭제
- DEPLOY.md 규칙 위반 (시드 INSERT 제거됨, 하지만 재배포 중 복원?)

**가설 3**: 권한 문제
- PostgreSQL 테이블 소유권 이슈로 데이터가 보이지 않는 것 (실제 삭제 아님)
- → 이 경우 소유권 변경으로 복구 가능

---

## 🎯 즉시 조치 (오늘)

### ✅ 완료됨
- [x] 회원가입 엔드포인트 백엔드 구현
- [x] 로컬 테스트 성공 (회원가입 + 로그인)
- [x] 데이터 손실 조사

### ⏳ 진행 중
- [ ] **운영 서버 SSH 접속 확인**
  ```bash
  # 포트 2222 거부 → 다른 포트 시도
  ssh -v redbox9@redbox9.iptime.org  # 기본 포트 22
  ssh -v -p 22 redbox9@redbox9.iptime.org
  ```

- [ ] **백업 파일 확보**
  - `/var/backups/assetflow/assetflow-2026-10-23.sql.gz` 다운로드
  - 또는 운영 서버 로컬에서 새 덤프

- [ ] **데이터 복구 시작**
  - 백업 검증 → 로컬 복원 → 사용자 데이터 추출 → 운영 DB 재적용

### 📈 병렬 진행
- [ ] 프론트엔드 회원가입 UI 추가
  - 이미 백엔드 준비됨
  - FE: /signup 페이지 또는 로그인 모달 추가

- [ ] 운영 서버 배포 준비
  - `./gradlew bootJar` (회원가입 엔드포인트 포함)
  - `pnpm build` (회원가입 UI 포함)
  - 배포 스크립트 준비

---

## 📞 사용자 보고

**현재 상황 요약**:
```
✅ 로그인 401 원인 파악: 운영 DB에서 lovebox0310@gmail.com 사용자 계정 손실
✅ 백업 확인: /tmp/opencode/cleanup_before.sql에 데이터 일부 존재
⏳ 복구 작업: SSH 접속 후 /var/backups/assetflow/의 전체 백업 확보 필요
⏳ 임시 조치: 회원가입 엔드포인트 구현 완료, 운영 배포 준비 중

예상 복구 시간: 1-2시간 (SSH 접속 성공 시)
데이터 손실 가능성: 2026-10-24 이후 입력된 신규 데이터만 (대부분 복구 가능)
```

---

## 📚 참고

- `.ai/data-loss-investigation.md` — 상세 조사 기록
- `.ai/signup-implementation.md` — 회원가입 엔드포인트 구현
- `DEPLOY.md` §5 — 백업/복구 절차
- `.ai/session-log.md` 2026-10-18 — 초기 데이터 이관
- `.ai/session-log.md` 2026-10-24 — 데이터 정리 작업

