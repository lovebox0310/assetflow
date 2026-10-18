# 작업 진행 로그

시간순 작업 기록입니다. **영구 결정은 `.ai/project.md` 에 있습니다.** 여기엔
"지금 무엇을 했고 무엇이 남았는가" 만 적습니다.

- 항목 하나의 근거와 규약은 `project.md` 의 해당 장(§)을 따릅니다
- 새 항목은 위(최신)에 추가합니다
- 커밋 여부는 `git status` 로 확인합니다

> **이 파일 하나로 부족하다고 새 문서를 만들지 않습니다.** 기록할 곳이 없으면
> `project.md` 에 다음 장을 추가합니다. 판단 기준은 `project.md` §32 다.
> 문서의 성격은 **경로**로 구분합니다(§32.2). `.ai/` 루트에 새 파일을 늘리지
> 말고, 분류가 필요하면 전용 폴더를 만듭니다

---

---

## 2026-10-18 — 진짜 인증 연결: BCrypt 비밀번호 검증 + 실제 JWT 발급·검증

### 무엇을 했나

가짜 인증(어떤 자격증명이든 mock-jwt-token 반환)을 실제 인증으로 교체했다. DEPLOY.md Known Issues "JWT_SECRET 미발급" 해소.

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 의존성 | spring-security-crypto(BCrypt 검증만 — Spring Security 본체 미도입), jjwt 0.12(HS512) |
| 2 | TokenService 신설 | JWT 발급·검증 단일 출처. JWT_SECRET env(HS256 32바이트 이상), 미설정 시 부팅마다 무작위(재시작 시 기존 토큰 무효화되므로 운영은 고정값 필수) |
| 3 | AuthService 프로필 분리 | 인터페이스화 + InMemory(테스트·CI — BCrypt 상수 검증) / Postgres(users 테이블 조회·BCrypt matches) |
| 4 | 인터셉터 실검증 | BearerTokenInterceptor 가 토큰 서명·만료를 검증 — 무효·만료 토큰은 401 |
| 5 | 405·404 정리 | GET 으로 POST 전용 API 접근 시 405, 루트·favicon 등 정적 부재는 404(catch-all 500 오탐 제거) |
| 6 | 시드 | data-seed.sql 과 서버 users 행의 password_hash 를 BCrypt("password") 로 교체 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| BE 테스트 | gradlew test | PASS(AuthServiceTest 재작성 — 올바른 자격증명/잘못된 비밀번호/미등록 이메일/null) |
| 서버 스모크 | HTTPS 실호출 | 올바른 자격증명 → 200 + 실제 JWT(HS512, expiresAt 포함) / 잘못된 비밀번호 → 401 / 정상 토큰 → 보호 API 200 / 변조 토큰 → 401 |

### 남은 것

- [ ] 운영 비밀번호 변경 — 시드 자격증명(user@example.com/password)은 개발용. 실제 비밀번호로 교체 필요(BCrypt 해시 재생성)

---

## 2026-10-18 — 사무실 홈서버 구축: Postgres·백엔드 배포 (비용 0원 구성)

### 무엇을 했나

카페24 가입 실패 → 가비아 Gen2 가입했으나 1vCore/1GB+공인IP 가 월 20,000원(예산 9,000원 초과) → **사무실 우분투 컴퓨터(Ubuntu 26.04, 15GB RAM) 를 홈서버로 사용**하기로 결정(사용자 확인: 상시 운영 가능, Postgres+백엔드 공존, ipTIME DDNS·포트포워딩 가능).

| # | 작업 | 산출물 |
|---|---|---|
| 1 | SSH 접속 확립 | `redbox9@redbox9.iptime.org:2222` — plink 로 첫 접속 후 배포 공개키 등록, OpenSSH 키 접속 전환 |
| 2 | Postgres 18.6 설치 | DB `assetflow`(소유자 assetflow), 계정 비밀번호 인증(localhost 전용). §37.1 누락됐던 테이블 소유자 문제는 DB 재생성으로 해결 |
| 3 | 원장 데이터 이관 | 로컬 `schema.sql`·`data-seed.sql` 전송·적용 — 테이블 5종 생성, users 시드 1행 |
| 4 | 백엔드 배포 | 서버에 openjdk-21-jre 설치, bootJar 전송(sha256 일치), systemd `assetflow.service`(postgres 프로필, -Xmx512m, Restart=always) |
| 5 | 장애 처리 | 8080 을 점유한 **어제 수동 기동한 구 백엔드 프로세스** 발견·정리 — 재시작 후 health=200, 로그인·계좌 API 200(postgres 원장) |
| 6 | HTTPS 프록시 | Caddy 설치·Caddyfile 구성(`redbox9.iptime.org` → localhost:8080), ufw 에 80/443 허용. 인증서 발급은 공유기 포트포워딩 후 자동 완료 |
| 7 | 문서 | `DEPLOY.md` §7 을 홈서버 구성으로 갱신(데이터 이관·재배포 절차), VPS 절차는 §8 참고용으로 이동 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| BE 테스트 | `gradlew test` | 25건 PASS(인메모리 경로) |
| 서버 API | localhost 실호출 | /health 200, 로그인 200, 계좌 조회 200 — §36.2 시드 응답(postgres 원장) |
| jar 무결성 | sha256 비교 | 전송 후 해시 일치 |
| 서비스 | `systemctl is-active` | active(8080 리스너 = systemd 인스턴스) |

### 남은 것

- [x] 공유기 80/443 포트포워딩(사용자 완료) → HTTPS 외부 접속 검증 완료: `https://redbox9.iptime.org/health` = UP, 로그인·계좌 API 200. 자체 서명 인증서라 브라우저 경고 수락 필요(정식 인증서는 도메인 구입 후 Caddyfile 교체로 전환)
- [x] 500 오탐 수정 — 루트(/)·favicon 접근 시 NoResourceFoundException 이 catch-all 500 으로 응답하던 문제. 404 전용 핸들러 추가 + 500 핸들러에 서버 로깅 추가(사용자 500 제보의 원인이 바로 이것). 재배포 후 https 외부 경로에서 루트 404·health 200 확인
- [x] login 주소창(GET) 접속 시 500 → 405 핸들러 추가(HttpRequestMethodNotSupportedException) — POST 전용 API 안내 표준화. 재배포·검증 완료(GET 405 / POST 200)
- [x] 로그인 자격증명 변경(사용자 요청) — lovebox0310@gmail.com / 개인 비밀번호(BCrypt). 코드에는 자격증명을 두지 않고 OWNER_EMAIL 설정으로 분리(PostgresAssetLedger·application-postgres.yml), systemd 에 OWNER_EMAIL 적용. 구 자격증명(user@example.com) 행 삭제 — 시드 재생성 방지를 위해 data-seed.sql 의 시드 INSERT 도 제거(운영 사용자는 수동 생성 원칙, DEPLOY.md §7). 외부 HTTPS 검증: 새 자격증명 로그인 200+expiresAt / 구 자격증명 401 / 변조 토큰 401
- [x] 프론트 홈서버 서빙 — dist 전송 후 Caddy 구성(/api/*·/health → 백엔드 프록시, 나머지 SPA 정적 서빙). `https://redbox9.iptime.org` 에서 로그인 화면 직접 접속 가능(같은 출처라 CORS·인증서 문제 없음). 외부 검증: root 200(HTML)·health UP·POST login 200
- [x] card-imports POST 500 수정
- [x] DB 백업 자동화 설치 — 홈서버 cron(매일 03:15, /etc/cron.d/assetflow-backup → /opt/assetflow/backup.sh), 백업 /var/backups/assetflow(7일분 보관). 첫 백업 실행·복원 검증 완료(임시 DB 복원 → users 1·accounts 2·imports 1341 일치, 오류 0)
- [x] 최종 확인 — 병합된 main jar 로 서버 재배포 후 login 200·card-imports POST 200·health 200 재검증, 스모크 행 정리
- [x] 반영 완료 후 "다른 파일 가져오기" 버튼 추가 — done 분기에서 파일 선택으로 복귀(resetToIdle: 상태 초기화 + row-keys 재조회). FE 테스트 59건 PASS, 빌드 후 홈서버 프론트 교체·외부 검증(health UP·login 200) — PostgresCardImportLedger 에 하드코딩된 시드 이메일 잔존(user@example.com → id 17)이OWNER_EMAIL 전환·임시 사용자 삭제 후 FK 위반을 일으킴. OWNER_EMAIL 설정 주입으로 수정, 재배포 후 POST 200·스모크 행 정리. **교훈: 하드코딩 이메일 전수 검색(git grep)을 배포 전 수행할 것** — data-seed 시드 INSERT 제거도 함께 반영(운영 사용자는 수동 생성, DEPLOY.md §7)
- [ ] 프론트 배포(Vercel) + `ALLOWED_ORIGIN`·`VITE_API_BASE_URL` 연결
- [ ] CI backend-gate 는 인메모리 경로만 검증 — postgres 경로는 본 항목의 bootRun/서버 스모크로 수동 검증

---

## 2026-10-18 — DB 연결: 로컬 PostgreSQL 구축 + 원장 영속 교체 (§39 단일 교체 지점 수행)

### 무엇을 했나

사용자 요구: “로컬에 PostgreSQL 운영, 추후 카페24 VPS 설치·데이터 이관”. §39 DB 전략대로 단일 교체 지점을 갈아끼웠다.

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 로컬 Postgres 17.5 설치 | EDB 바이너리 zip(관리자 권한 불필요) → `D:/study/pgsql`, `initdb`(trust, UTF-8) → `pg_ctl` 기동(포트 5432) — 서비스 등록 아닌 수동 운영 |
| 2 | DB 구축 | `assetflow` DB 생성, `schema.sql` 적용(테이블 5종), users 시드(user@example.com) |
| 3 | 원장 교체 | `AssetLedger`·`CardImportLedger` 를 인터페이스로 전환. `InMemory*`(기본값, 테스트·CI) + `Postgres*`(postgres 프로필, JdbcTemplate) |
| 4 | 스키마 보완 | §37에 누락됐던 `card_imports` 테이블 추가 — `(user_id, row_key)` UNIQUE 로 §29.6 중복 금지를 DB 가 보증. `project.md §37.1` 갱신(4종→5종) |
| 5 | 프로필 활성화 | `application-postgres.yml`(베이스 exclude 를 빈 값으로 덮어써 DataSource 활성화, Spring SQL init 으로 schema/data-seed 자동 적용), `build.gradle` resources 에 db/ 추가 |
| 6 | 이관 문서 | `DEPLOY.md` §7 신설 — 카페24 VPS(Ubuntu) 설치·pg_dump/pg_restore 이관·보안 설정·cron 백업. 만료 항목 갱신(모크 안내·보호 규칙) |
| 7 | 환경 정비 | Gradle 8.10+JBR(Java 25) 조합에서 빌드 스크립트 파싱 실패(major 69) → Temurin JDK 21 설치 후 `~/.gradle/gradle.properties` 에 `org.gradle.java.home` 고정 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| BE 테스트(인메모리 경로) | `gradlew test` (JDK 21) | **25건 PASS** — 테스트 3곳이 인터페이스 직접 생성을 InMemory* 로 교정 |
| postgres 프로필 bootRun | 실 DB 스모크 | 시드 7행(§36.2 일치) / 계좌 생성 / 카드 반영 시 DB 행에서 합계 재계산(gross 11,000) |
| **영속성 증명** | 서버 재시작 후 재조회 | 계좌 8행 유지(id=8 스모크 행), row-keys 유지 — 재시작해도 데이터 유지 확인 후 스모크 데이터 정리 |
| FE | 변경 없음 | 기존 59건 PASS 상태 유지 |

### 남은 것

- [x] 커밋/PR — PR #27 병합 완료(e24c93b)
- [x] VPS 검토 결과 — 가비아 Gen2 월 20,000원 예산 초과로 사무실 홈서버 구성으로 전환(위 항목)
- [ ] CI backend-gate 는 인메모리 경로만 검증 — postgres 경로는 bootRun 스모크로 수동 검증(로컬 기록은 본 항목)

---

## 2026-10-18 — #22 카드 임포트 UI·API + #23 도넛 차트 검증 완료 (커밋 대기)

### 무엇을 했나

작업 트리에 남아 있던 #22·#23 미커밋 구현의 잔여 오류를 고치고 전체 게이트를 돌렸다.

| # | 작업 | 산출물 |
|---|---|---|
| 1 | #22 카드 임포트 | `CardImportPanel`(업로드→매직바이트 판별→카드사 판별→가맹점 미리보기→반영) + `CardImportController`/`CardImportLedger`(서버 재검증) + `cardImportApi`. 자산 화면에 패널 장착 |
| 2 | #23 도넛 | `CompositionDonut`(recharts, §36.1 assetComposition 산출물 재사용) — 대시보드 lazy import 로 청크 분리. **범례 3종 variant**(`variant` prop: `inline`/`table`/`chips`, 기본값 inline): inline은 도트+이름+금액+백분% 인접 배치, table은 유형·금액·비중 고정폭 3열, chips는 2×2 칩(도트+이름+비중). §35 중단점 반응 — md 이상 도넛 좌측·범례 우측, 미만 상하 스택. `CompositionDonut.stories.tsx` — Inline/Table/Chips/Empty 4 스토리로 실렌더 비교 가능 |
| 3 | 잔여 오류 수정 | lint: 미사용 `waitFor` 제거 / tsc: 계약 JSON 타입 단언 교정·미사용 `@ts-expect-error` 제거·recharts Tooltip formatter 문맥 추론 전환 / vite 경고: 동적 import 확장자를 정적 부분으로 이동 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| FE 단위·시나리오 | `vitest run` | **59건 PASS** (CardImportPanel — 실제 익명화 샘플 판별·CFB 거부·zip 미지원·반영 대역 포함) |
| FE 타입·lint | `tsc --noEmit` / `eslint` | 클린 |
| FE 빌드 | `vite build` | 성공 — 파서 2종(samsung/hyundai)·도넛(recharts 315KB) 별도 청크 분리 확인 |
| BE 테스트 | `gradlew test` (JAVA_HOME=IntelliJ jbr) | **25건 PASS** (5파일, failures 0) |
| API smoke | bootRun + 실호출 | row-keys 미인증 **401** / 인증 **200** / POST 반영 **200** — 응답 totals 가 행에서 서버 재계산(gross 1100·vat 100), knownRowKeys 중복 집계 확인 |
| 범례 렌더 | Storybook + 헤드리스 브라우저(900px) | inline/table/chips 3 variant 실렌더 확인. 금액은 천단위 원 표기(formatKrwExact 단일 출처). 캡처 `.ai/donut-v-inline.png` / `.ai/donut-v-table.png` / `.ai/donut-v-chips.png` |

### 남은 것

- [x] **커밋/PR** — PR #26 병합 완료(8b0e66a), 이슈 #22·#23 종결. 보호 규칙 승인 요구 제거(단독 개발 병합 가능)
- [ ] **DB 연결** — 계정 연결 시 AssetLedger·CardImportLedger 교체만 수행(§39, 스프린트 3 첫 이슈 후보)
- [ ] **배포 실행** — DEPLOY.md 2~6단계(DB 생성·Render/Vercel 연결·도메인·알람) — 계정 준비가 선행되는 사용자 작업
- [ ] main 청크 940KB 경고 — 인덱스 청크 기준이며 기능 동작에는 무관. 후속 분리 검토

---

## 2026-10-18 — Storybook 차단 해제: VC++ 런타임이 원인 (§36.3 갱신)

### 무엇을 했나

`pnpm storybook` 이 oxc-resolver dlopen 실패로 안 뜨는 차단(§36.3, Known Issues 4번)을 해제했다.

### 원인 (착각했던 것 → 실제)

| 착각 | 실제 |
|---|---|
| "npm optional deps 버그 — node_modules 재설치 필요" (에러 메시지의 권장 문구) | **Visual C++ 재배포 가능 패키지 부재** |
| node_modules 재설치 → 바인딩 .node 사라짐(동일 실패) | 재설치 후에도 동일 — 파일은 원래 정상이었다 |

판단 근거:
1. `resolver.win32-x64-msvc.node` — 1,886,720 bytes, `MZ` 매직 (진짜 DLL)
2. System32 검사 — `vcruntime140.dll` / `msvcp140.dll` / `vcruntime140_1.dll` **전부 없음**
3. vc_redist.x64.exe 설치(UAC 승인) → 세 DLL 전부 존재 → `pnpm storybook` 즉시 기동

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 기동 | `pnpm storybook` → 6006 | "Storybook ready", HTTP 200 |
| UI | 헤드리스 브라우저 렌더 | 스토리 8종 사이드바, 순자산 카드 렌더, Controls 동작. 캡처 `.ai/storybook-fixed.png` |

### 교훈 (§36.3 에 기록)

- 네이티브 모듈 dlopen 실패에서는 **파일 존재(매직·크기) → 의존 DLL(System32) 순서**로 확인한다.
  에러 메시지의 npm 재설치 권장은 문구일 뿐, 이 PC 의 경우 원인이 아니었다.
- Known Issues 4번 해제. 남은 Known Issues: 배포 플랫폼 단계(2~6), 서버 만료시, 401 UX, 헬스체크 제외

---

## 2026-10-18 — 스프린트 2 시작: 계획(§39) + 자산 CRUD API·화면 (#21 종료)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 스프린트 2 작업표 확정 | project.md **§39** — 목표·DoD·DB 전략(모크 원장 유지 + 단일 교체 지점)·이슈 3건 |
| 2 | 스프린트 2 이슈 등록 | **#21**(자산 화면+CRUD, 종료) / **#22**(카드 임포트) / **#23**(도넛 차트) |
| 3 | 자산 원장 일반화 | `AssetLedger` — 모크 행의 교체 가능 컴포넌트. 대시보드 summary 가 같은 원장을 읽는 것을 테스트로 고정(§31.1) |
| 4 | CRUD API | GET/POST/PUT/DELETE `/api/v1/assets/accounts` + 명세 **§40**. NOT_FOUND 표준 오류 추가 |
| 5 | 자산 화면 이관 | `AssetsPage` — §31.2 편집/읽기전용 구분, 합계 재계산(저장 안 함), 헤더 내비게이션(대시보드↔자산) |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| BE 테스트 | `gradlew test` | **17건 PASS** (CRUD 8건 + §31.1 동기화) |
| FE 테스트 | vitest 전체 | **54건 PASS** (AssetsPage 6건 — 추가/편집/삭제/401/빈부채/시드) |
| 타입·lint | tsc / eslint | 클린 |
| E2E | bootRun + 브라우저 | 화면 추가 흐름: UI에서 행 추가 → POST → 목록 재로딩 → 합계 773,200,000원 재계산. 캡처 `.ai/assets-add-e2e.png` |

### 진행 중 (다음 세션)

- [ ] **#22 카드 임포트 UI·API 연결** — 파서(lib/card)는 완성, 화면 흐름(업로드→미리보기→반영) 남음
- [ ] **#23 도넛 차트** — recharts 선정·적용
- [ ] DB 연결 — 계정 연결 시 AssetLedger 교체만 수행(§39)

---

## 2026-10-18 — main 보호 규칙 설정 + 이슈 #3 종료 (스프린트 1 이슈 전종료)

### 무엇을 했나

- 저장소 public 전환(사용자) → 이전에 403 이던 브랜치 보호 API가 가능해짐
- **backend-gate 잡을 CI에 추가**(quality-gate.yml): 워크플로 주석의 약속("빌드가 돌아가는 날 추가한다")이 실행 가능해진 날의 이행. 컴파일·테스트(temurin 21, DB 없이)
- **CI 첫 실행에서 실패 2건 잡음**:
  1. `./gradlew: Permission denied` — Windows 에서 커밋한 gradlew 에 실행 비트가 없었다
     → `git update-index --chmod=+x gradlew` (모드만 바꾸는 커밋)
  2. frontend-gate 에 eslint 단계 추가 (PR #19 에서 만든 스크립트가 CI 에는 없었다)
- 최종 CI: quality-gate=success, frontend-gate=success, backend-gate=success (run 39101080566)
- **main 보호 규칙 설정**: required checks 3종 + PR 승인 1명 + force-push/삭제 금지
- 이슈 #3 종료 → **스프린트 1 이슈 8종 전부 CLOSED**

### 남은 것 (다음 스프린트 창구)

- 실배포 실행(DEPLOY.md 1~6단계: Neon/Render/Vercel 계정 연결)
- 도넛 차트 라이브러리 선정
- 카드 임포트 UI 연결(lib/card 파서 → 화면/API)

---

## 2026-10-18 — eslint 게이트 구축 + 배포 준비 (이슈 #3 집행, PR #19)

- typescript-eslint flat config(`eslint.config.js`) + `pnpm run lint` — **클린 통과**, 전 테스트 동시 재실행 PASS(FE 48/48, BE 9건, 빌드 성공)
- 배포 준비 코드: `GET /health`(플랫폼 헬스체크 대상), CORS(`ALLOWED_ORIGIN` env, 미설정 시 동일 출처만 — 안전 기본값), 프론트 `VITE_API_BASE_URL` 프리픽스
- `DEPLOY.md` 런북 작성: Neon(DB) → Render(Backend) → Vercel(Front) 단계별 집행용, 롤백 리허설 절차 포함
- main 보호 규칙: **무료 개인 저장소에서는 설정 불가**(GitHub Pro 또는 public 전환 필요, 403 확인) — 사용자 결정 사항으로 이관
- 이슈 #3의 잔여는 "보호 규칙 설정(플랜 필요)" 하나뿐 — eslint 항목은 해소

---

## 2026-10-18 — Issue 8 테스트·문서화·릴리즈 리허설 (GitHub #10)

### 무엇을 했나

머지된 main(8f56399) 기준으로 품질 게이트를 전부 다시 돌리고, 스프린트 1 종료 산출물을 기록했다.

### 테스트 결과 요약 (AC "핵심 테스트 통과 결과 확보")

| 게이트 | 방법 | 결과 |
|---|---|---|
| FE 단위·시나리오 | `pnpm run test` | **48/48 PASS** (formatters·metrics 경계, 로그인 흐름, 대시보드 연동 시나리오: 정상/로딩/오류/401/빈/중복방지) |
| FE 타입 | `tsc --noEmit` | 클린 |
| FE 빌드 | `vite build` | 성공 (JS 532.4KB gzip 175.3KB, CSS 1.1KB) |
| BE 단위·smoke | `gradlew test` | **9건 PASS** |
| API smoke | bootRun + 실제 호출 | me/summary/cashflow **200**, 토큰 없음 **401** |
| 보호 라우트 접근 제어 | 同上 + 인터셉터 | 미인증 차단 확인 (§21/§38.5) |

### 반응형 기본 점검 (AC "모바일/데스크톱 상태 UI 일관성")

| 뷰포트 | 관찰 |
|---|---|
| 360–380 (모바일) | 카드 1열 스택, 실 API 데이터 렌더, scrollW ≤ innerW (가로 스크롤 없음). 캡처 `.ai/responsive-360.png` |
| 1280 (데스크톱) | 카드 4열, 4개 섹션 순서 §35와 일치. 캡처 `.ai/responsive-1280.png` |

### 배포 체크리스트 리허설 (§12 "배포 순서" 대조)

| §12 순서 | 리허설 상태 |
|---|---|
| 1. main 보호 규칙 (build/test/lint 체크) | **미확인** — GitHub 설정 화면에서 확인 필요 (lint 게이트는 아직 없음, 아래 Known Issues) |
| 2. DB 생성 (dev/prod 분리) | **미착수** — Neon/Supabase 가입·발급 필요. 이 PC 에 Postgres 없음 |
| 3. Backend 배포 (DB_URL/DB_USER/DB_PASSWORD/JWT_SECRET) | **미착수** — application.yml 의 autoconfig exclude 를 실 DB 접속으로 교체하는 작업이 선행 |
| 4. Frontend 배포 (API_BASE_URL) | **미착수** — Vercel/CF Pages 연결 필요. 리버스 프록시 또는 CORS 설정이 함께 필요 |
| 5. 도메인 + HTTPS | **미착수** |
| 6. 헬스체크 + 알람 | **미착수** — 헬스체크 엔드포인트(`/actuator/health`)도 미추가 |
| 7. 롤백 절차 (직전 정상 버전 재배포) | 절차 문서화는 §7/§12 존재. **실제 리허설은 DB·배포 플랫폼 준비 후에만 가능** |

**리허설 결론**: 로컬 품질 게이트는 모두 통과. §12 의 1–7 중 2·3·4·6 이 남아 있고,
이는 코드 작업이 아니라 계정·플랫폼 준비 작업이라 이 세션에서 진행하지 못했다.
**스프린트 1 완료 판정은 사용자 확인이 필요한 지점** — 위 표를 기준으로 어디까지 본
스프린트에 포함할지 정한다. (예: "리허설 = 1·7 절차 확인만으로 종료" 또는 "3까지 실배포")

### 릴리즈 노트 초안 (스프린트 1)

- 이메일 로그인 (FE 검증 + POST /api/v1/auth/login, 공통 오류 메시지 정책 §21)
- 대시보드: 핵심 지표 카드 4종(순자산·월 수지·비상금 개월·자산 구성비), 반응형 4상태 블록
- 대시보드 API 3종 (§38 표준 포맷) + Bearer 접근 제어
- 데이터 모델 초안 DDL (users·asset_accounts·expense_categories·monthly_snapshots, §37)
- FE-BE 실연동 (vite dev 프록시, 카드 단위 오류 복구)

### Known Issues

1. **lint 게이트 부재** — FE/BE 모두 eslint가 없다. `tsc --noEmit`이 정적 게이트의 실질 역할. eslint 도입 시 CI 체크에 추가할 것 (이슈 #3 잔여)
2. **PostgreSQL 미연결** — 원장은 백엔드 `MockDashboardSource` 모크. DB 도입 시 이 클래스만 교체(§38)
3. **서버 토큰 만료시 미제공** — 클라 TTL 1시간. 백엔드 JWT 발급 시 서버 expiresAt 로 대체
4. **Storybook 정적 빌드 이 PC 차단** — oxc-resolver win32 dlopen 실패(§36.3). CI에서는 통과
5. **401 자동 로그아웃 UX 미구현** — 인증 오류 시 메시지 노출까지. 자동 전환은 후속
6. **배포 환경 프록시 필요** — vite 프록시는 dev 전용. 배포 시 리버스 프록시/백엔드 CORS
7. **헬스체크 엔드포인트 없음** — 배포 6단계 전에 actuator 또는 경량 /health 추가 필요

---

## 2026-10-18 — Issue 7 FE-BE 연동·상태 처리 안정화 (GitHub #9)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 공통 API 클라이언트 | `src/api/client.ts` — Bearer 자동 부착, 오류 4분류(auth/network/server/client, 사용자 친화 한국어 문구), in-flight dedupe(§26 "중복 호출 방지") |
| 2 | 로그인 실연동 | `authApi.ts` → POST /api/v1/auth/login(§38.2). 실패는 §21 공통 메시지로 감춤 |
| 3 | 대시보드 실연동 | `dashboardApi.ts`(summary + cashflow) → DashboardPage 가 mock 대신 API 데이터 사용. 계산은 여전히 metrics.ts 단일 출처 |
| 4 | 카드 단위 상태·재시도 | summary 계열(핵심 4카드·구성비·현금 3계좌)과 cashflow(월별 현금흐름 표)가 각각 loading/empty/error + 재시도 — 한쪽 실패가 다른쪽을 중단시키지 않는다 |
| 5 | dev 프록시 | `vite.config.ts` server.proxy /api → 8080. CORS 없이 동일 출처로 동작 |
| 6 | 현금 3계좌/현금흐름 실렌더 | placeholder → summary 의 cash 계좌 목록, cashflow 3개월 표로 교체(도넛 차트만 라이브러리 선정 후) |
| 7 | 테스트 갱신 | fetch 대역(§38 포맷)으로 정상/로딩/오류/401/빈/중복방지 시나리오 — 48건 전부 통과 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 타입 | `tsc --noEmit` | 클린 |
| 단위·통합 | vitest 48건 | 48 PASS (fetch 대역, 시나리오별) |
| 실 E2E | bootRun(새 코드) + vite 5174 + 헤드리스 브라우저 | 로그인 → 대시보드에 실 API 데이터(현금 계좌, 현금흐름 표) 렌더. 캡처 `.ai/e2e-integration.png` |

### 디버그 기록 (다음 사람을 위해)

- **dedupe in-flight 맵은 모듈 단위다.** 끝나지 않는 fetch 를 심는 테스트가 멈춘 Promise 를
  남기면 이후 테스트가 그 Promise 를 재사용해 무한 로딩이 된다. `clearInflight()` 를 테스트
  afterEach 에서 부른다. 프로덕션에서는 브라우저가 hang 요청을 타임아웃 시켜 정리된다.
- testing-library `findByText` 는 **복수 매치에서 예외를 던진다.** 카드 4종+섹션이 같은
  오류 문구를 동시에 보일 수 있어 오류 문구 검사는 findAllByText 를 쓴다.

### 알려진 연동 이슈 (산출물)

- 배포(dev 밖)에서는 vite 프록시가 없으므로 **리버스 프록시나 백엔드 CORS 설정이 필요하다** — 스프린트 1 배포 리허설(Issue 8)에서 처리
- 서버는 아직 토큰 만료시를 주지 않는다 → 클라 TTL 1시간(§21 유지). 백엔드 토큰 실발급이 이어지는 작업에서 서버 expiresAt 로 대체
- 401 재시도 흐름: 인증 오류 시 재시도가 아니라 로그아웃→재로그인이 맞는 UX. 현재는 오류 메시지 노출까지 — 자동 로그아웃 전환은 후속 작업

---

## 2026-10-18 — Issue 6 대시보드 API 3종 명세·구현 (GitHub #8)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | API 3종 구현 | `auth/MeController`(GET /me), `dashboard/DashboardController`(summary, cashflow) |
| 2 | 표준 오류 포맷 | `common/api/ErrorResponse` + `@RestControllerAdvice` — 실패 전부 code/message/details/timestamp, 401/403/400/500 구분(§25) |
| 3 | 접근 제어 | `common/web/BearerTokenInterceptor` — Bearer 없으면 401. 실제 JWT 검증은 이슈 7에서(§38.5) |
| 4 | mock 원장 | `dashboard/MockDashboardSource` — §36.2 기준선 고정. DB 연결 때 교체되는 유일한 클래스 |
| 5 | API 명세 | project.md **§38** — 요청/응답 예시, 계산 미담당 원칙(§34.6), 접근 제어 한계 |
| 6 | smoke 테스트 6건 | "standalone MockMvc — 토큰/포맷/월 범위" |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 컴파일·테스트 | `./gradlew test` | BUILD SUCCESSFUL, **9건 PASS** |
| summary | bootRun(8081 격리) + fetch | 200 — asOf 2026-10, 기준선 값 그대로 |
| me / cashflow | 同上 | 200 — months=3 인 3행 desc |
| 토큰 없음 | 同上 | **401 AUTH_REQUIRED** + timestamp |
| months=13 | 同上 | **400 INVALID_REQUEST** + details |

### 주의 (사용자 8080 인스턴스)

bootRun 은 부팅 시점에 코드를 컴파일하므로, **이 작업 전에 띄워둔 8080 인스턴스는
새 API 가 없다.** 재시작이 필요하다. 스모크는 사용자 인스턴스와 격리하도록 8081 로 돌렸고 종료했다.

### 남은 것

- [ ] JSR-310 serial 검토: Instant 직렬화 대신 문자열 timestamp 사용 중 — 스프린트 이슈 7 토큰 대체 시 정리
- [ ] 백엔드 테스트가 dashboardMock 기준선과 한 곳에 고정되면(스프린트 이슈 7) FE 테스트와 상호 대조
- [ ] Spring Security 도입 여부는 이슈 7에서 결정

---

---

## 2026-10-17 — Issue 3 후반(백엔드 부팅 가능화) + Issue 5(데이터 모델 초안)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | Spring Boot 메인 클래스 + `application.yml` | `AssetflowApplication`, DataSource/JPA/MyBatis 자동 구성 제외(§37.6) — DB 전 부팅 |
| 2 | Gradle wrapper | `gradlew` + `gradle/wrapper/*` (Gradle 8.10). 스프린트 1 대상 JDK 21 |
| 3 | 최소 테스트 3건 | `ApiResponseTest`, `AuthServiceTest` — `gradlew test` 가 실제 돌아가는 상태 |
| 4 | 데이터 모델 초안 | `apps/backend/db/schema.sql` + 설계 노트 project.md **§37** |

### 이 PC 환경 (§37.6 중복 아님 — 실행 명령만 여기)
- JDK 21: `C:/Users/H/tools/jdk-21.0.12.1+1` (Temurin), Gradle 8.10: `C:/Users/H/tools/gradle-8.10`
- **JAVA_HOME 을 사용자 환경변수로 영구 등록 완료(레지스트리 검증)**. 새 PowerShell 창에서는 설정 없이 `./gradlew` 가 돈다 — 열려 있던 창은 다시 열어야 한다
- 실행(수동 지정이 필요한 경우만): `JAVA_HOME="C:/Users/H/tools/jdk-21.0.12.1+1" ./gradlew test` (apps/backend)

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 컴파일·테스트 | `./gradlew compileJava test` | BUILD SUCCESSFUL, 3건 PASS |
| 부팅 | `./gradlew bootRun` → 8080 | Tomcat 기동, 1.046초 |
| API 스모크 | `POST /api/v1/auth/login` | HTTP 200, `{"code":"OK",...,"token":"mock-jwt-token"}` |
| 문서 규약 | §32.2 배치·CRLF 보존 | schema.sql 은 apps/backend/, 결정은 §37, CRLF 유지 |

### 남은 것

- [ ] PostgreSQL 로컬 설치 및 DDL 적용 검증 (독립 — 이 PC 에 Postgres 미준비)
- [ ] Issue 6(API 3종, GitHub #8) 진행 시 §25 응답 표준과 §37 스키마 대조
- [ ] GitHub 이슈 번호와 스프린트 Issue 번호 불일치(스프린트 Issue 5 = GitHub #7) — 이슈 제목에 스프린트 번호 명기 제안

---

## 2026-10-17 — Issue 4 대시보드 핵심 카드 4종 (PR — 대상 #6)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | antd v6 deprecation 교정 | StateBlock `Alert message` → `title` (vite 콘솔 경고에서 발견, CI 정적 게이트는 못 잡음) |
| 2 | §36 계산 구현 계약 확정 (문서) | `project.md` §36 — 산식·mock 기준선·스토리북 상태 |
| 3 | 포맷 단일 출처 | `src/utils/formatters.ts` — §28.3 예시·경계를 그대로 계약으로. 축약 단위 천단위 구분자 없음(3800.0만) |
| 4 | 계산 단일 출처 | `src/dashboard/metrics.ts` + `src/data/dashboardMock.ts` — 구성비 잔차 보정 포함 |
| 5 | 카드 4종 구현 | `MetricCard`(배치·상태만) + `AssetCompositionList` — DashboardPage 인라인 플레이스홀더 교체 |
| 6 | Storybook 스토리 8종 | storybook@10+react-vite — 값 하드코딩 없이 metrics 산출물 사용. §10 필수 4상태 |
| 7 | 테스트 27→42건 | formatter 경계·지표 산식· 금지선(현금 분자 反例 포함)·mock 기준선·상태 전환 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 타입·단일·빌드 | `tsc --noEmit` / vitest / `vite build` | 클린 / **42건 PASS** / 성공 |
| 실측 1440 | CDP 뷰포트 강제 + DOM 검사 | 4열 top=137 균일, 카드 4개 값(`6.9억`/`+3,240,000원`/`23.5개월`/`84.1% · 6.4억`) 실제 브라우저 렌더 |
| 실측 360 | 同上 | 1열, scrollW=360 (가로 스크롤 0), 같은 4개 값 렌더 |
| CJK | U+3040-9FFF 전수 | CLEAN (작업 중 2건 자체 검출·교정) |

### 잡은 것

- **§28.3 예시가 곧 기준**: 축약 표기 `3800.0만` — Intl 그룹핑 기본값(`3,800.0만`)과 어긋난 것을
  테스트가 잡아 `useGrouping:false` 로 교정. 테스트가 먼저 맞고 구현이 틀렸다.
- **플레이스홀더 잔재 테스트**: ready 상태 어설션을 `/Issue 4/` 문구 대신 실계산 값으로 전환
  — 플레이스홀더가 남아도 조용히 통과하던 취약한 검증이었다.

### 차단 (환경 부채, §36.3)

- Storybook **정적 빌드가 이 PC 에서만** 실패: oxc-resolver win32 바인딩 dlopen 실패
  (실물 .node 직접 require 도 동일, vite 자체 oxc 는 정상 → 패키지 DLL 의존성 문제).
  스토리 파일 자체는 tsc 로 검증되고 CI가 통과한다. 캡처 증거는 제출 불가 — Issue 7 전 해제 시도.

### 남은 것

- [x] PR #13 머지 후 #6 자동 종료 확인 (2026-10-17: GitHub 이슈 #6 CLOSED 확인. `gh issue view 6 --json state`)
- [ ] 구성비 도넛·현금 3계좌·현금흐름 차트 — §36 소관 아님, Issue 6/7 연계 시 (§22 영역 유지)
- [ ] 비상금 미확정 경고 상태의 실제 화면 노출 — 데이터에 미확정이 생긴 날 테스트

---

## 2026-10-17 — Issue 3 대시보드 정보구조·레이아웃 (PR #5/#12 대상)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | §35 정보구조·레이아웃 규칙 확정 (와이어프레임 포함) | `.ai/project.md` §35, `design/wireframes/issue3-dashboard-layout.svg` |
| 2 | antd@6.6.6 도입 (§28.1 정책 정렬) | `package.json`·lock — Issue 1 스캐폴딩의 무-antd 편차를 이번 세션에서 해소 |
| 3 | 공통 레이아웃 컴포넌트 | `src/layout/AppLayout.tsx`(헤더/컨테이너), `src/layout/ResponsiveGrid.tsx`(Row/Col span 24/12/6) |
| 4 | 상태 4종 단일 구현 | `src/components/StateBlock.tsx` (로딩/빈/오류+재시도/데이터) |
| 5 | 대시보드 레이아웃 구현 | `DashboardPage.tsx` — 지표→구성비→현금→현금흐름 순서, 상태 미리보기 토글(§31 관례) |
| 6 | 테스트 확장 | 26→27건 (영역 순서·Col 분할 계약·상태 전환·로그아웃) |

### 검증

| 대상 | 명령/방법 | 결과 |
|---|---|---|
| 타입 | `npx tsc --noEmit` | 클린 |
| 단위 | `node node_modules/vitest/vitest.mjs run` | **27건 PASS** |
| 빌드 | `npx vite build` | 성공 (536 kB / gzip 176 kB — antd 도입 효과) |
| 실측(데스크톱 1440) | WebView + getBoundingClientRect | 핵심 카드 4종 top 137 동일·폭 270 동일 → **4열 1스크린** |
| 실측(태블릿 768) | CDP `Emulation.setDeviceMetricsOverride` | 2×2 정렬(폭 360 균일), scrollW=768 |
| 실측(모바일 360) |同上 | 1열, 폭 328 균일, **scrollW=360 (가로 스크롤 0)** |
| CJK 스캔 | U+3040-9FFF 전수 | 교정 후 CLEAN (한자 혼입 1건 직접 검출·수정) |

### 도구 함정 (§34.8 계열 — 기록 필요)

`Bun.WebView` 창 크기는 Windows 최소 폭(~500px)에 막힌다. 창을 360으로 열어
스크린샷은 360으로 나오지만 **CSS 뷰포트는 500에서 미디어쿼리가 평가**됐다.
이대로 찍은 Issue 2 "360px 캡처"도 부정확했다. 교정: `cdp("Emulation.
setDeviceMetricsOverride", {width, height, mobile})` 로 실제 뷰포트를 강제하고
`window.innerWidth`/`scrollWidth`를 같이 측정해 캡처를 증거로 쓴다. 캡처만 보고
레이아웃을 판정하지 말 것.

### 남은 것

- [ ] 카드 내용·계산·포맷 (Issue 4 = #6), Storybook (§10)
- [ ] 로그인 폼 antd Form 이전 — §35.4 부채로 명시적 유예
- [ ] 번들 536kB → Issue 7에서 code-splitting 검토

---

## 2026-10-17 — Issue 1 마감(커밋·푸시·원격 등록) + Issue 2 FE 구현

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | Issue 1 결과물을 6개 원자 커밋으로 마감 | `dd2cac7`~`0f0ad02` (docs/ci/build/chore 계열) |
| 2 | 브랜치 원격 푸시 | `origin/feature/prototype-debt-ui` (트래킹 설정) |
| 3 | GitHub 라벨 23종 등록 | §19 체계 전부 (`--force`로 docs 갱신) |
| 4 | Sprint 1 Issue 1-8 원격 등록 | 원격 #3~#10, §19 라벨 매핑·§21~27 최종 본문 사용 |
| 5 | Issue 2 FE 구현 (§21) | `auth/validate.ts` 신규, authApi·authStore·App·LoginPage·DashboardPage 갱신, `app.css` 360px 대응 |
| 6 | Issue 2 테스트 확장 | 8건 → **23건** (App 종단·만료·필드 검증·로그아웃) |

### 검증

| 대상 | 명령 | 결과 |
|---|---|---|
| FE 타입 검사 | `npx tsc --noEmit` | 클린 |
| FE 단위 테스트 | `node node_modules/vitest/vitest.mjs run` | 5파일 23건 PASS |
| FE 빌드 | `npx vite build` | 성공 (143.31 kB) |
| 프로토타입 회귀 | `node design/prototype/tools/run-all.mjs` | 3/3 스위트 PASS |
| 카드 파서 3종 | `node samples/card/tools/test-*.mjs` | PASS |
| 라벨·이슈 원격 | `gh issue view 3,4 --json labels` | §19 매핑 일치 확인 |

### 구현에서 결정한 것

- **라우터 없음**: 화면 2종은 `App` 조건부 렌더로 보호 라우트를 대체한다. 토큰
  없거나 만료되면 대시보드가 마운트되지 않는다. reload 대신 `onSuccess`/`onLogout`
  상태 전환. 화면이 늘면 Issue 7에서 라우터 검토.
- **검증은 두 곳에서**: 화면은 필드별 메시지를, `loginWithEmail` 경계는 형식 검증을
  다시 거쳐 공통 메시지(`Invalid credentials`)만 뱉는다 (§21 보안 기준).
- **토큰 만료**: `saveToken(token, expiresAt?)`. mock API는 1시간 TTL. 서버 만료시는
  Issue 6/7 연결 시 `LoginOutput.expiresAt` 로 대체.
- **API 연동·비밀번호 해시**: 백엔드 없음(이 PC JDK/Gradle 부재)이라 mock 유지.
  실제 연동은 Issue 6(API 명세)·Issue 7(FE-BE), 해시 저장은 BE 측 §21 보안 기준.

### 남은 것 (Issue 2)

- [ ] **Issue 2 작업분 미커밋** — 명시 요청 없음 (`src/` 11개 파일 변경·신규)
- [ ] AC 화면 증거 — §9 의 PR 캡처 요구: 360px/데스크톱 로그인·대시보드 캡처
- [ ] 실제 로그인 API 연동 — Issue 6/7 종속
- [ ] 원격 #3 (Issue 1) 상태 라벨 `status:ready` → `status:done` 전환 — PR 머지 시
      `issue-label-automation.yml`이 처리하므로 PR 전까지 보류

---

## 2026-10-17 — Issue 1 착수 (구조/품질 게이트) + init-deep

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | init-deep 지식 기반 | `AGENTS.md` (root·apps·design·samples) |
| 2 | init-deep 스냅샷 실측 교정 | `.omo/init-deep.json` (실제 SHA·파일수·LOC) |
| 3 | BE 빌드 파일 (빌드도구 Gradle 고정) | `apps/backend/build.gradle`, `settings.gradle` |
| 4 | PR/이슈 템플릿 | `.github/PULL_REQUEST_TEMPLATE.md`, `ISSUE_TEMPLATE/*.md` |
| 5 | 품질 게이트에 FE 잡 추가 | `.github/workflows/quality-gate.yml` `frontend-gate` |

### 검증

| 대상 | 명령 | 결과 |
|---|---|---|
| FE 단위 테스트 | `node node_modules/vitest/vitest.mjs run` | 3파일 8건 PASS |
| FE 타입 검사 | `npx tsc --noEmit` | 클린 |
| FE 빌드 | `npx vite build` | 성공 (142.36 kB) |
| 프로토타입 회귀 | `node design/prototype/tools/run-all.mjs` | 3/3 스위트 PASS |
| 카드 파서·번들 | test-parse-samsung / hyundai / test-card-ui | 40·50·44건 PASS |
| 워크플로 YAML | `Bun.YAML.parse` | jobs = quality-gate, frontend-gate |

### 남은 것 (Issue 1)

- [ ] BE 로컬 실행 확인 — **이 PC 에 Java/Gradle 이 없어 미검증.** gradle wrapper 와
      Spring Boot 메인 클래스가 아직 없어 `backend-gate` 도 넣지 않았다(워크플로 주석에 명시).
- [ ] GitHub labels + Issue 1-8 등록 — 템플릿 파일만 준비, 원격 등록은 미실행.
- [ ] 커밋 — 명시 요청 없음.

> `AGENTS.md` 의 Commit/Branch 와 `.omo/init-deep.json` 은 초판이 자리표시자였다.
> 이번에 실측값(a071fc0, feature/prototype-debt-ui, 파일 77, LOC 6874)으로 교정했다.

---

## 2026-10-05 — 프론트엔드 스캐폴딩 (React 18 + Vite + TS)

### 무엇을 했나

FE 빌드가 없던 상태에서 `apps/frontend` 에 실행 가능한 스캐폴딩을 만들었습니다.
기존에 있던 소스(Auth/페이지/API 타입)를 유지하면서, 도구체인만 추가했습니다.

| # | 작업 | 산출물 |
|---|---|---|
| 1 | Vite + React 18 + TypeScript 설정 | `apps/frontend/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` |
| 2 | 테스트 환경(Vitest + jsdom + RTL) | `vite.config.ts`, `*.test.ts(x)` 3건 |
| 3 | README 갱신(pnpm/corepack) | `apps/frontend/README.md` |

검증: `corepack pnpm run --dir apps/frontend typecheck` → PASS, `test` → 8건 PASS,
`build` → PASS. 프로토타입 회귀도 그대로 PASS(3/3, 408건).

### 결정과 근거

- 패키지 매니저: **pnpm 단독**(§30). `packageManager` 필드로 pnpm@9.15.4 고정.
  Windows의 Device Guard 문제 때문에 corepack 12.10.1 네이티브가 막혀 있던 환경도
  9.15.4 체인으로 정리했다.
- FE 버전: React 18.3.1 + Vite 8 + TS 5.9. 저장소 기존 계획(React 18, Vite)과 일치.
- 계산은 단일 출처를 지킨다. `design/prototype/assets.html` 의 로직을 React 로
  옮길 때는 계산 함수를 분리해 두 화면이 같은 코드를 쓰게 할 것(§34.6).

### 남은 것

- `design/prototype/assets.html` 의 금융자산·부채 UI/계산을 FE 컴포넌트로 이식.
- 대시보드 카드(§23)의 파생값: 합계·순자산·비상금개월·투자가능현금·세금 잔액을
  실제 데이터로 계산하도록 연결.

---


### 무엇을 했나

부채 목록을 "언제나 편집 가능" 이던 별도 취급에서 빼내, 자산과 **같은 읽기/수정
모드 + 스냅샷·확정·취소** 로 맞췄습니다. 그 위에 행에서 파생되는 상환 계획을 얹었습니다.

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 부채 열 확장(항목·기관·유형·금액·금리·만기·월납입액·삭제) | `design/prototype/assets.html` |
| 2 | 원리금균등 계층(납입액·기간·스케줄·만기·계획) + 시드 교체 | `common/mock-data.js` `AF.debt` |
| 3 | `snapshotOf`/`cancelEdit`/`removeInstitution`/`removeGroup` 을 `store.apply` 경로로 통일 | `assets.html` |
| 4 | 상환 계획 파생 블록 `#liabPlan` (저장하지 않음) | `assets.html` |
| 5 | 회귀 테스트 부채 구간 추가 | `tools/test-assets-page.mjs` 섹션 16–24 (163건) |
| 6 | 부채 수학 계약 | `tools/test-mock-data.mjs` 섹션 9 (60건) |

검증: `node design/prototype/tools/run-all.mjs` → **3/3 스위트, 408건 전량 PASS**.

### 사람이 정한 것 (§34.6 반영)

- **예적금 수익률**: 원금과 평가금액이 다르면 차이가 수익률에 반영된다. 둘이
  같다고 0%로 고정하는 것은 버그다.
- **부채 상환 방식**: 원리금균등 **하나만**. 화면의 월 필수지출이 고정값 하나라
  회차마다 달라지는 방식을 못 받는다.
- **부채도 자산과 같은 UI/UX**, 열만 기관·유형·금리·만기를 더한다.

### 손으로 잡은 실제 값

잔액 **69,355,560원** (원금 아님) · 연 **2.05%** · 월납입 **317,180원** ·
기관 **우리은행** · 유형 **주택담보대출** · 남은 **274회차** · 만기 **2049-07**.

- 공식 월 납입액은 317,180.78원. 제공값과 **0.78원** 어긋나는데, **제공값을 쓴다**
  — 역산값으로 갈아끼우면 지출 시드 `대출상환및이자 317,180원`과 화면이 어긋난다.
- 1회차: 이자 118,482 + 원금 198,698 = 317,180. 총이자 17,552,034,
  총납입 86,907,594, 마지막 회차 317,454, 잔액 0.

### 구조에서 실제로 밟은 것

- `mock-data.js` 의 클로저 배열과 `data.*` 는 **같은 참조**여야 한다.
  `data.x = newArray` 재할당은 `computeAssetTotals()` 가 구식 배열을 읽어
  합계가 어긋난다 → `assetStorage.apply = applyAssetSnapshot` 으로 통일했다.
  같은 이유로 `cancelEdit`·`removeInstitution`·`removeGroup` 도 `store.apply({...})` 다.
- 하네스는 **정적 마크업을 DOM 트리로 만들지 않는다**(id 요소만 뒤늦게 만든다).
  표 머리글 계약은 그래서 소스에서 읽어 검증한다.
- `Element.textContent` 는 자식이 없으면 `this.value || this._text` 다.
  테스트는 `<option>` 텍스트 대신 `value` 로 검증해야 한다.
- 이자·원금·납입액을 각자 반올림하면 **합이 1원 어긋날 수 있다.** 마지막
  회차에서만 실제로 나타나며(잔액 정리를 흡수) 테스트는 그 사실을 계약으로 삼는다.

### 남은 것

- `main` 에 미커밋 파일이 있다. 실제 앱 스캐폴딩으로 넘어가기 전에 `feature/*`
  브랜치가 필요하다(`CONTRIBUTING.md` §90).
- 아직 미결: 신용카드 등 **만기 없는 상품** 표현, 금리 고정/변동 구분,
  부채비율·이자비용·만기도래 산식.

---

## 2026-10-05 — 무인 진행 품질 게이트 (프로토타입 검증 + CI)

### 무엇을 했나

사람이 브라우저로 손으로 확인해야만 검증되던 상태를 없앴습니다. 실행 가능한
검증을 저장소에 넣고, PR 에서 자동으로 돌리게 만들었습니다.

| # | 작업 | 산출물 | project.md |
|---|---|---|---|
| 1 | 프로토타입 회귀 테스트 하네스 + 3개 스위트 | `design/prototype/tools/*.mjs` (157건) | §34 |
| 2 | 카드 도구 이식성 결함 제거 | `samples/card/tools/*.mjs` 7개 | §34.2 |
| 3 | GitHub Actions 품질 게이트 | `.github/workflows/quality-gate.yml` | §34.3 |
| 4 | 문서 정합성 | `design/prototype/README.md` | §34.4 |

### 테스트가 실제로 잡은 버그 3건

검증을 붙인 이유는 확인 편의가 아니다. **눈으로 못 잡는 결함을 잡는 것**이 목적이었다.
3건이 나왔고, 셋 다 "조용히 틀린 채 사용자에게 남는" 종류였다.

1. **`cleanAssetRows()` 검증이 통째로 무의미했다** (`common/mock-data.js`)
   `Object.assign(defaults, r)` 로 합성하고 있어서 원본 행 `r` 이 `amount: -5000` 처럼
   검증 통과한 값을 그대로 덮어썼다. 음수 봉정·문자 제거가 모두 장식이었다.
   → `Object.assign({}, r, { 검증값 })` 로 순서를 뒤집었다.
2. **음수 `currentValue` 가 총자산을 깎았다**
   `>= 0` 검사가 `amount` 에만 있었고 `currentValue`·`principal*` 에는 없었다.
   주석은 "음수·문자 금액을 걸러낸다"고 적고 있었다 — 구현이 주석을 못 믿은 상태.
   → `nonNegative()` / `moneyOf()` 로 한 곳에 모았다. `returnRate` 만 음수를 허용한다
   (실제 손실이 남는 자리).
3. **투자자산 원금이 파생되지 않았다** (`assets.html`)
   `investPrincipalFromParts()` 가 정의만 되고 **호출되는 곳이 없었다**. 원금칸은
   "수량 × 평단가로 계산됩니다"라고 안내하면서 옛 값을 보여 주고, 수익률도 옛 원금으로
   계산했다. 수량을 바꿔도 원금칸과 수익률이 둘 다 거짓말을 했다.
   → `readPrincipal()` 이 저장을 신뢰하지 않고 파생값을 쓰게 하고, 편집 시 저장값도
   맞춰 주도록 했다.

> 3건 모두 "이미 문서에 적힌 규칙"과 구현이 어긋난 것이었다. 규칙을 새로 정한 게 아니다.

### 테스트가 제자리에 둔 것

- 예적금 원금과 평가금액의 관계(원금 = 누적 납입액, 평가금액 = 원금 + 이자)를 편집 시
  그대로 재계산하면 원금 50,000,000 · 평가 50,000,000인 예적금의 수익률이 2.5% → 0%로
  바뀐다. 예적금 이자 정책 문제이며 테스트를 통과시키려고 임의로 고치지 **않았다**.
- 투자자산 열 구조는 유형과 무관하게 동일하다(예적금에도 수량·평단가 열이 있음).
  처음에는 "예적금에 수량 칸이 없어야 한다" 고 가정했으나 실제 구현과 다르고, 일관된
  열 구조가 더 나은 판단이어서 **테스트를 구현에 맞췄다.**

### 이식성 결함 (CI 파결 원인)

`samples/card/tools/*.mjs` 에 저장소 절대경로 `D:/study/assetflow/...` 20곳과
개인 경로 `C:/Users/H/Downloads/...` 가 박혀 있었다. 이 저장소를 처음 받는 사람과
CI 에서는 **전부 실패**한다.

- 모든 경로를 `import.meta.url` 기준 `ROOT` 상대 경로로 교체.
- 실제 카드 명세(개인정보)는 `ASSETFLOW_CARD_REAL_DIR` 환경변수로만 받는다.
- **부재를 실패로 세던 버그도 제거했다.** `readFileSync(REAL)` 이 `try` 안에서
  던져서 `check(..., false)` 로 기록됐다. 개인정보 파일이 없는 게 정상인데 정상 상태가
  실패로 보고되는 구조였다. 이제 "건너뜀" 으로 끝난다.

검증: 임의 작업 폴더(`C:\Users\H\AppData\Local\Temp\opencode`)에서 3개 스위트
전부 PASS. 예전에 여기서는 전부 깨졌다.

### 이중 실행 함정 (직접 만든 것)

하네스가 `mock-data.js` 를 먼저 한 번 적재하고, 화면의 `<script src>` 가 또 불러
**두 번 실행**됐다. 두 번째 실행이 `data` 를 시드로 덮어써서 `asOf` 조작이 무효화되고
`upcoming = null` 테스트가 이상하게 실패했다. 스크립트를 문서 순서대로 실행하는 방식으로
바꿨고, **왜 이렇게 하면 안 되는지 하네스에 주석으로 남겼다.**

### 하지 않은 것

- 앱(React/Spring) 빌드·린트·테스트. `package.json`·`tsconfig`·`vite.config`·
  `pom.xml`·`build.gradle` 이 저장소에 없다. 워크플로에 없는 걸 돌아가는 척하지 않고
  "빌드 파일이 아직 없다"를 워크플로 주석에 그대로 적었다.
- 커밋. `main` 브랜치이고 `CONTRIBUTING.md` 는 `feature/*` 를 요구한다. 명시 요청이 없다.

### 검증 결과

```
node design/prototype/tools/run-all.mjs     → PASS (3/3, 157건)
node samples/card/tools/test-parse-samsung.mjs  → PASS (40건)
node samples/card/tools/test-parse-hyundai.mjs  → PASS (50건)
node samples/card/tools/test-card-ui.mjs         → PASS (44건)
생성물 드리프트 검사                            → 0건
```

---

## 2026-10-05 — 품질 게이트를 실제로 돌려보고 잡은 것

### 무엇을 했나

PR 을 열기 전에, 워크플로와 **똑같은 명령을 깨끗한 클론에서 그대로 돌렸다.**
그랬더니 3건이 실패했다. 로컬에서는 전부 PASS 였다.

### 이 세션의 진짜 값

테스트 291건이 통과한다는 사실이 아무것도 아니었다. **어디서 돌렸느냐가
전부였다.** 로컬 워킹 트리는 이 PC 의 상태가 섞여 있어서, 깨끗한 체크아웃과
달랐다. CI 러너는 전부 깨끗한 체크아웃에서 돈다.

| # | 버그 | 로컬에서 왜 통과했나 |
|---|---|---|
| 1 | 픽스처 바이트 비교가 `core.autocrlf` 에 의존 (8635B vs 8547B) | 파일이 이미 LF 로 재생성되어 있었음 |
| 2 | samsung 익명화기가 CRLF, 커밋본은 LF | `autocrlf` 가 우연히 체크아웃을 CRLF 로 만들어 맞춤 |
| 3 | 번들이 파서 소스의 줄바꿈을 그대로 인라인 | `apps/frontend` 파서를 이 PC 에서 만진 적이 없어 LF 로 있었음 |

2번이 가장 나빴다. **검사가 스스로 고장나 있는데 통과를 보고하고 있었다.**
원인은 `core.autocrlf` 다 — 전역 설정이라 GitHub 러너에서는 `false` 다.
즉 로컬과 CI 는 서로 반대편에서 도는 환경이 항상 존재한다.

3번은 `strip()` 이 소스 **경로** 를 받고 있어서 내용에 결코 적용되지 않은 것이었다.
내용을 읽는 지점(`readSource`)에서 정규화하는 게 맞다.

### 고친 것

- `.gitattributes` — 생성물에 `-text`. 줄바꿈 변환을 하지 말고 바이트를 그대로
  취급한다. **전역 `text=auto` 규칙은 넣지 않았다** — 이 저장소 blob 은 CRLF 이고
  정규화돼 있지 않아서, 언젠가 `git add --renormalize .` 가 실행되면 전 파일이
  다시 쓰여 실제 변경이 수천 줄 뒤에 묻힌다. 그건 별도 작업이다
- samsung 생성기 → LF
- 번들 생성기 → 소스를 읽을 때 LF 로 정규화

### 기록해야 할 교훈

> **검증은 어디서 돌렸는지가 검증의 일부다.**
> 깨끗한 클론에서 돌리지 않은 통과 결과는 통과가 아니다. 앞으로 생성물 바이트
> 비교가 있으면 클론에서 실행한다. `project.md` §34.8 에 남겼다.

그리고 하나 더 — **`on: push` 가 `branches: [main]` 이라 feature 브랜치 push로는
CI 가 돌지 않는다.** PR 을 열어야 발동한다. 로컬에서 전부 통과해서 "CI 도
통과하겠지" 하고 넘어가면, CI 는 한 번도 실행되지 않은 채 통과로 오해된다.

---

## 2026-09-30 — /assets 자산 입력·조회 화면

### 무엇을 했나

작업 2건을 한 세션에서 처리했습니다.

| # | 작업 | 산출물 | project.md |
|---|---|---|---|
| 1 | 패키지 매니저를 pnpm 으로 통일 | 문서만 | §30 |
| 2 | /assets 자산 입력·조회 화면 구현 | `assets.html` + `mock-data.js` 확장 | §31 |
| 3 | 문서 관리 규약 + 폴더 구분 | `.ai/roles/` | §32 |

작업 2는 IA 맵을 훑고 다음 작업으로 자산을 골라 진행했습니다.

### 작업 1 요약 (pnpm)

- `package.json` 은 **만들지 않았습니다.** 지금 박아두는 버전 숫자는 검증된 값이 아니고,
  FE 스캐폴딩과 함께 넣는 편이 맞습니다
- 적용: `apps/frontend/README.md` 의 명령을 전부 pnpm 으로 교체, 락 파일은
  `pnpm-lock.yaml` 하나만 허용
- 예외: `samples/card/tools/*.mjs` 는 의존성이 없어 `node` 직접 실행 유지 (§30.4)

### 작업 2 요약 (자산 화면)

- 금융자산·부채 행을 편집·추가·삭제하고, 투자금을 고칠 수 있습니다
- 자동이체·부가가치세 잔액은 **읽기 전용**입니다. 지출 화면과 Filing 로직이
  각각 단일 출처라 여기서 고쳐 쓰면 근거가 사라집니다 (§31.2)
- 합계·구성비는 저장하지 않고 `AF.recompute()` 가 행에서 다시 만듭니다 (§31.1)
- 저장은 `assetflow.assets.v1` 에 목록 2개와 투자금만. 편집 뒤에만 저장합니다
- 데이터/로딩/빈 데이터/오류 상태 4종을 상태 미리보기 버튼으로 전환해 볼 수 있습니다

### 고친 실제 결함 4건

모두 기존 결함이며, 이번 화면을 만들며 드러났습니다.

| 대상 | 증상 | 원인 |
|---|---|---|
| `assets.html` | 금액을 바꿔도 총액이 그대로 | 편집 시 `AF.recompute()` 호출 누락 |
| `assets.html` | 초기값 복구 후 목록이 0행 | `reset()` 이 배열을 새로 만들는데 화면은 옛 배열을 참조 |
| `assets.html` | 초기값 복구 후에도 저장소가 남음 | 복구 직후 곧바로 재저장 (리팩터링 중 생긴 회귀) |
| `mock-data.js` | Filing 을 바꿔도 대시보드 카운트다운이 낡음 | `vat.upcoming` 을 로드 시 1회만 계산 |

`dashboard.html` 의 "다음 Filing" 크래시는 위 마지막 항목의 같은 원인이었습니다.
마지막 Filing 이 지나면 `nextFiling()` 이 `null` 인데, `up.month` 를 바로 읽고 있었습니다.
`AF.recompute()` 가 `upcoming` 을 함께 다시 정하도록 고쳤고, 화면도 `null` 일 때
"예정 없음" 을 안내하도록 가드를 넣었습니다.

### 바로잡은 판단 1건

저장 로더가 **빈 배열을 손상으로 보고 시드로 되돌리고 있었습니다.** 사용자가
항목을 전부 지워도 새로고침하면 되살아나는 상태였습니다.

- 빈 배열 = 사용자가 지운 정상 상태로 존중
- 비어 있지 않은데 살아남는 행이 0개 = 손상으로 보고 시드 복구

### 검증

| 대상 | 명령 | 결과 |
|---|---|---|
| 카드 파서 3종 | `node samples/card/tools/test-*.mjs` | PASS |
| mock-data 저장·계산 | temp `verify-af.mjs` | ALL PASS |
| 자산 화면 렌더·인터랙션 | temp `verify-assets-page.mjs` | ALL PASS |
| 6개 화면 부트 | temp `verify-all-pages.mjs` | ALL PASS |
| 번들 최신성 | `build-card-import-bundle.mjs` 재생성 | 불변 |

`verify-assets-page.mjs` 는 대시보드 인라인 스크립트를 **실제로 실행**해
`upcoming === null` 에서 예외가 나지 않고 뒤 패널까지 그려지는지 봅니다.
가드를 정규식으로만 검사하면 이런 결함을 못 잡습니다.

### 변경 파일 (미커밋)

```
  M .ai/project.md                    §30, §31, §32 추가
  M README.md                         문서 색인 + 폴더 구조
  M apps/frontend/README.md           pnpm 명령
  M design/prototype/README.md        자산 화면 절 + 다음 Filing 절 + 경로
  M design/prototype/dashboard.html    upcoming 가드 + 내비게이션 + 경로
  M design/prototype/expenses.html    내비게이션 + 경로
  M design/prototype/index.html       IA 카드 상태 + 경로
  M design/prototype/login.html       경로
  M design/prototype/settings.html    내비게이션 + 경로
  M samples/card/README.md            번들 경로
  M samples/card/tools/build-card-import-bundle.mjs   번들 출력 경로
  M samples/card/tools/test-card-ui.mjs               번들·mock-data 경로
  R .ai/{analyst,architect,developer,reviewer,tester}.md
   -> .ai/roles/                     폴더 구분 (git mv, 이력 보존)
  R design/prototype/assets/{base.css,card-import.js,tokens.css}
   -> design/prototype/common/       이름 충돌 해소 (git mv, 이력 보존)
  RM design/prototype/assets/mock-data.js
   -> design/prototype/common/       위와 함께 이동 + §31 변경
?? .ai/session-log.md                신규
?? design/prototype/assets.html      신규 (자산 화면)
```

### 문서 구조 변경 (작업 3)

문서가 늘어날 때마다 무엇이 최신인지 알 수 없게 되는 문제를 규약으로 막았다.

- `.ai/project.md` §32 신설 — 기록은 계속하되 **파일은 늘리지 않는다**
  - 기본은 기존 문서에 장(§)을 덧붙임. `session-log.md` 는 시간순 이력 전용
  - 새 문서 허용 조건 5개, 금지 파일 목록, 분기 점검 절차
- **역할 가이드 5종을 `.ai/roles/` 로 이동.** `.ai/` 루트에 성격이 다른 파일
  7개가 나란히 있어 경로로 구분되지 않았다. 이제 **경로가 곧 문서의 성격**이다
  - 이동 전후로 이 경로를 참조하던 곳이 없어 링크 수정이 필요 없었다
  - `git mv` 를 써서 이력을 보존했다 (git 이 R 로 인식)
  - `project.md` 와 `session-log.md` 는 가장 자주 참조되므로 루트에 남겼다


### 남은 것

- [ ] 커밋 (브랜치 규칙은 `CONTRIBUTING.md`: `feature/*`)
- [ ] 화면 증거 캡처 — `project.md` §9 가 UI PR 에 캡처를 요구합니다.
      대시보드와 자산 화면의 모바일(360px) / 데스크톱(1200px) 4장이 필요합니다
- [ ] 검증 스크립트 3개를 저장소로 올릴지 결정 — 기준선 숫자가 화면에 박혀 있어
      올리면 이후 값 변경 때마다 근거가 사라집니다. §29.7 에도 같은 판단이 남습니다
- [ ] `settings.html` 의 비상금 목표 개월 입력이 무동작인 기존 결함 (이번 세션 범위 밖)
- [ ] 대시보드 오류 패널의 재시도 버튼이 비활성인 기존 결함 (이번 세션 범위 밖)
- [ ] §32.5 분기 점검 — 이번엔 스프린트 마무리 시점에 수행한다

---

## 2026-09-30 — AI 역할을 서브에이전트로 (실행되게 만들기)

### 무엇을 했나

`.ai/roles/` 에 있던 역할 5종이 **실행되지 않고 있었다**는 것을 확인하고,
`.opencode/agent/` 서브에이전트로 옮겼다. `.ai/roles/` 는 삭제했다.

| # | 작업 | 산출물 | project.md |
|---|---|---|---|
| 1 | 역할 5종을 서브에이전트로 | `.opencode/agent/*.md` 5종 | §33.1-33.3 |
| 2 | 호출 진입점 2개 | `.opencode/command/feature.md`, `review.md` | §33.4 |
| 3 | `.ai/roles/` 폐기 + 문서 갱신 | `project.md` §32·§33, `README.md` | §33.1 |

### 발견한 사실

사용자가 "역할을 정의했는데 하나의 AI만 일하는 느낌이다" 라고 물었다. 확인한 결과
**느낌이 아니라 사실**이었다.

| 확인한 것 | 결과 |
|---|---|
| `.ai/roles/*.md` 를 읽는 코드 | **없음** |
| `AGENTS.md` / `opencode.json` / `.opencode/` | 없음 |
| CI 에서 읽는 단계 | 없음 |
| 참조하는 유일한 곳 | `README.md` 색인, `project.md` §32 |

파일은 있었고 내용도 괜찮았는데 **읽히지 않았다.** 즉 장식이었다.

그런데 작업은 계속 진행됐다. 역할 문서가 있어서가 아니라 `project.md` 를 읽고
AI 혼자 판단해서였다. 아래 2026-09-30 항목의 "작업 2건을 한 세션에서 처리했습니다" 가
그 증거다.

### 짚은 지점 (이번 세션의 실질)

**역할을 문서로 나누는 것과 리뷰를 분리하는 것은 다르다.** 리뷰어의 가치는
"코드를 한 번도 생각해 본 적 없는 상태로 본다"는 데 있다. 같은 컨텍스트면 개발자의
근거를 이미 알고 있어서 자기 설득이 되고, 리뷰가 아니라 동의 확인이 된다.

근거는 §31 에 있다. 그때 고친 결함 4건은 전부 "쓰면서 동시에 기억하던 것"이
어긋나 생긴 것이었다. 같은 AI 는 그 기억을 대조하는데, **기억이 틀렸을 때 같이
틀린다.** 분리하지 않으면 이걸 못 잡는다.

그래서 reviewer 와 tester 를 **별도 컨텍스트 서브에이전트**로 만들었고,
권한으로 강제했다. developer 만 쓰기가 된다.

### 자기 검토에서 나온 모순 8건 (같은 세션)

작업을 마치고 다시 읽었더니 앞 작업과 어긋나는 것이 있었다. 전부 고쳤다.

| # | 모순 | 어디 | 고친 것 |
|---|---|---|---|
| 1 | **스키마에 없는 색상값.** `color` 는 `primary\|secondary\|accent\|success\|warning\|error\|info` 또는 `#RRGGBB` 인데 `blue`·`green`·`magenta` 를 5종 전부 적었다 | 에이전트 5종 | 올바른 열거로 교체. 스키마는 직접 받아 확인했다 |
| 2 | **reviewer 가 AC 충족을 판정하라고 했는데 AC 를 넘기지 않았다.** reviewer.md 의 지시와 커맨드 규칙이 정면으로 충돌 | reviewer.md ↔ command 2종 | AC(요구 사실)는 넘기고 근거("왜")는 안 넘긴다. 구분을 문서에 적었다 |
| 3 | **`git diff` 는 untracked 파일을 안 보여준다.** 이 저장소는 새 파일 변경이 많아 reviewer 가 아무것도 못 볼 수 있었다 | reviewer.md, tester.md, command 2종 | `git status --porcelain` 을 1단계로. AC 처럼 누락 시 조용히 약해지지 않게 명시 |
| 4 | **analyst 에게 권한 우회하라고 적혀 있었다.** "권한이 막혀 있으므로 설계 판단으로 대신 쓴다" | analyst.md ↔ §33.6 | "막힌 것은 정상. 다른 수단을 찾지 말고 그 제약을 보고서에 적는다" 로 교체 |
| 5 | **§33.3 이 강제를 과장했다.** `edit: deny` 는 `bash` 를 통한 쓰기를 못 막는다(`git diff --output=`). tester 는 `bash: allow` 인데 "저장소 안 건드린다" 는 프롬프트 약속이었다 | project.md §33.3, README.md | 강제되는 것과 안 되는 것을 나눠 씀다. README 도 고쳤다 |
| 6 | **tester 가 temp 스크립트를 못 만들 수 있었다.** `edit: deny` 인데 §29.7·§31.6 은 temp 스크립트를 요구한다. 규약이 실행되지 않는 구조였다 | tester.md ↔ §33.3 | `edit: ask` 로 변경. 승인을 요청하는 게 정상 동작이고 temp 파일이 눈에 보인다 |
| 7 | **경로 이동을 §32.7 에 남기지 않았다.** §32.2 가 "경로를 옮기면 §32.7 에 남긴다"고 정해놓고 2차 이동을 §33 에만 적었다 | project.md §32.7 | 1차·2차 이동을 §32.7 에 함께 기록. 현재 경로는 `.opencode/agent/` |
| 8 | **§32.2 는 문서 분류 규칙인데 실행 설정을 표에 넣었다.** 서브에이전트는 문서가 아니라 권한 설정이면서 동시에 프롬프트다 | project.md §32.2 | `.opencode/` 는 문서 저장소가 아니라 실행 설정이라고 명시. 32.3 표에는 넣지 않는다 |

**5번이 가장 중요하다.** 31.5(파생값을 로드 시 1회만 계산)와 같은 종류다 —
**문서가 실제보다 강한 보장을 주장하는 것.** 문서가 좋아 보이는데 실행이 안 되면
다음 사람이 그 문서를 근거로 삼는다. 그래서 "강제한다"를 "어디까지 강제하고
어디부터 프롬프트인지"로 쪼개 썼다.

**문자 오류도 하나 있었다.** §33.3 본문에 CJK 3자(선언 이라는 단어에 해당)가
섞여 들어갔다. 한자를 그대로 옮겨 적지 않고 영문 설명으로 남긴다.
전 파일 CJK 스캔(U+4E00–9FFF)으로 잡아 지웠다.

### 인코딩 사고 (기록해 둔다)

PowerShell 로 `project.md` 를 고치다가 **줄바꿈이 LF 로 바뀌어 파일 전체가
diff 로 잡혔다**(2000줄 전부). `core.autocrlf=true` 인 저장소에서 CRLF 파일을
LF 로 쓰면 그렇게 된다. `git checkout` 으로 되돌리고 `edit` 도구로 다시 고쳤다.
**문서 파일은 PowerShell 로 통째로 쓰지 않는다.** 도구가 기존 바이트를 보존한다.

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 프런트매터 유효성 | 스키마(`opencode.ai/config.json`)를 받아 5종 검사 | ALL VALID |
| 색상값 | 스키마 열거와 대조 | 5종 전부 교정 |
| 권한 배정 | write `allow` 는 developer 뿐 | 유지 |
| 모순 | 8건 식별 → 전부 수정 | 통과 |
| CJK 유입 | 전 파일 U+4E00–9FFF 스캔 | CLEAN |
| 줄바꿈 | CRLF 파일 byte 비교 | 정상 복구 |
| 참조 끊김 | `.ai/roles` 전수 grep | 과거 기록만 남음(의도) |
| gitignore | `git check-ignore` | 안 무시됨 |

**에이전트를 실제로 실행해 보지는 않았다.** 설정은 시작 시 1회 읽으므로
재시작이 먼저다. 실행 확인은 남은 것으로 둔다.

### 남은 것

- [ ] **opencode 재시작 후 5개 에이전트가 뜨는지 확인** (§33.6)
- [ ] `/review` 로 리뷰어가 실제로 `git diff` 를 보는지 확인 — 못 본다면 실패다
- [ ] **untracked 파일이 실제로 리뷰되는지 확인.** 3번을 고쳤지만 실행 확인은 안 했다
- [ ] tester 의 `edit: ask` 가 실제로 뜨는지 확인. temp 스크립트 작성 시 승인 절차를
      한 번 겪어봐야 한다
- [ ] `AGENTS.md` 도입 여부. `project.md` 1800줄 중 자주 안 지켜지는 하드 규칙만
      추려 담는다. 지금은 근거가 없어 만들지 않았다(§33.5)
- [ ] architect → developer 사이의 컨텍스트 손실 (§33.5). 5단계를 유지한 대가
- [ ] 이전 항목 남은 것: 화면 캡처, `settings.html` 비상금 입력 무동작,
      대시보드 재시도 버튼 비활성

### 이 로그의 쓰임

- 새 항목은 **위(최신)에** 추가합니다
- 항목마다 다음을 적습니다: 무엇을 했나 / 고친 결함 / 검증 결과 / 남은 것
- 결정의 **근거**는 여기 적지 않고 `project.md` 의 해당 § 로만 링크합니다.
  같은 내용을 두 곳에 쓰면 어느 쪽이 최신인지 알 수 없게 됩니다
- 검증 명령은 실행한 그대로 적습니다. 통과했다고 적힌 명령만 다시 돌리면 됩니다
