# AssetFlow 배포 런북 (스프린트 1 리허설 - §12 "배포 순서" 집행용)

목표 조합: **Neon(PostgreSQL) + Render(Backend) + Vercel(Frontend)** — 월 비용 Free~Starter 범위(§12 상한 50,000원).

## 0. 현재 코드 상태

- 백엔드 원장은 `MockDashboardSource`(모크). **DB 연결 코드는 이 런북 2단계에서 활성화한다.**
- `application.yml` 의 DataSource 자동 구성 exclude 는 DB 접속을 넣는 그 시점에 제거한다(파일 안에 주석으로 활성화 블록이 준비돼 있다).
- 프론트는 `VITE_API_BASE_URL` 이 없으면 상대경로(dev 프록시), 있으면 절대 URL.

## 1. DB 생성 (Neon)

1. neon.tech 가입 → 새 프로젝트 생성 (지역: 서울 또는 가까운 리전)
2. 연결 문자열 확인: `postgresql://<user>:<password>@<host>/<db>?sslmode=require`
3. **dev/prod 분리**: 브랜치 또는 별도 프로젝트로 두 개 발급 (§12 2단계)
4. DDL 적용 — 로컬에서:
   ```bash
   psql "<연결 문자열>" -f apps/backend/db/schema.sql
   ```

## 2. Backend 배포 (Render)

1. render.com 가입 → New → Web Service → 이 저장소 연결
2. 설정:
   - Runtime: Java 21 (Render 기본 JDK 선택, 없으면 Dockerfile)
   - Build: `./gradlew clean build -x test`
   - Start: `./gradlew bootRun --args="--server.port=$PORT"` 또는 jar 실행
3. 환경변수:
   - `DB_URL`, `DB_USER`, `DB_PASSWORD` — 1단계 값
   - `ALLOWED_ORIGIN` — Vercel 도메인(3단계 후 확정, 쉼표 구분)
   - `SERVER_PORT` — Render가 주는 `$PORT` 사용 권장
4. **DB 연결 활성화(필수 코드 변경)**: `application.yml` 에서 `autoconfigure.exclude` 4줄을 제거하고 주석된 datasource 블록을 활성화. 그 전 배포는 모크 원장으로 뜬다(부팅은 됨).
5. 배포 후 확인: `curl https://<render-domain>/health` → `{"status":"UP"}`

## 3. Frontend 배포 (Vercel)

1. vercel.com 가입 → Add New Project → 저장소 연결
2. Root Directory: `apps/frontend`, Build Command: `corepack pnpm install && corepack pnpm build`
3. 환경변수:
   - `VITE_API_BASE_URL` — 2단계 Render 도메인 (`https://...`, 슬래시 없이)
4. 배포 후 확인: 대시보드에서 로그인 → 실 데이터 렌더
5. 도메인 접속 허용: Render의 `ALLOWED_ORIGIN`에 Vercel 도메인 추가 → 재배포

## 4. 헬스체크 + 알람

- Render 대시보드의 Health Check Path: `/health`
- 알람: Render 이메일 알림 활성화 (무료 tier 기준, §12 6단계의 최소 충족)

## 5. 롤백 절차 리허설 (§12 7단계)

1. Render → Deployments 탭 → 직전 배포 선택 → **Rollback**
2. 롤백 후 `/health` 재확인
3. 기록: 롤백 소요 시간과 성공 여부를 `.ai/session-log.md`에 남긴다

## 6. main 보호 규칙 (GitHub 설정)

- Settings → Branches → main protection:
  - Require pull request reviews: 1
  - Require status checks: `build`(FE), `test`(FE/BE), `lint`(FE) — CI 워크플로가 이 이름으로 있어야 한다. 현재 저장소 CI 확인 후 이름을 맞춘다

## 알려진 한계

- JWT_SECRET: 백엔드가 아직 실제 JWT를 발급하지 않는다(모크 토큰). 실발급 도입 시 `JWT_SECRET` 환경변수를 Render에 추가 (§13 환경변수 표준)
- Render 무료 인스턴스는 비활성 시 sleep → 첫 요청 지연. 월 1만~1.8천원 Starter로 해결(§12 예산선 내)
