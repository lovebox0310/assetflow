# 프로젝트 운영 기준 (AI + Agile)

## 1) 기술 스택
현행 기준 (레거시 호환, 신규 화면에 적용 금지):
Frontend:
- React 16
- TypeScript
- antd 4
- ag-grid 21 (폐기: 현 MVP는 antd Table 사용. 대용량 표 필요 시 도입)
- webpack

Backend:
- Language: Java
- JDK: Java 17
- Framework: Spring Boot
- ORM / SQL Mapper: MyBatis
- Database: [Oracle / PostgreSQL / MySQL 등]
- Build Tool: Maven
- API: REST

권장 기준 (2026, 한국 실무 다수 패턴) - 확정:
Frontend:
- React 18
- TypeScript (strict)
- Vite (신규/개선 화면 우선)
- Next.js (SSR/SEO 요구 화면이 있을 때 선택) - AssetFlow는 해당 없음
- 상태 관리: TanStack Query + 최소 전역 상태
- UI: antd 6
	- antd 4에서 6으로 상향: 하위 호환 없음, React 18+ 필수
- 스타일: antd ConfigProvider theme 토큰만 사용. 유틸리티 CSS/CSS-in-JS 미도입
- 차트: Apache ECharts(Apache-2.0) + echarts-for-react(MIT)
- 공통 컴포넌트: Storybook으로 문서화

Backend:
- Language: Java 21 (LTS 권장)
- Framework: Spring Boot 3.3+
- Data Access: MyBatis 유지 + JPA/QueryDSL 선택 병행
- Database: PostgreSQL 우선, 필요 시 기존 DB 병행
- Build Tool: Gradle 또는 Maven (팀 표준 1개로 고정)
- API: REST + OpenAPI 스펙 관리
- Cache/Async: Redis, 메시지 큐(Kafka/RabbitMQ) 필요 시 도입

DevOps:
- GitHub Actions 기반 CI
- 필수 체크: build, test, lint, security
- 컨테이너 표준: Docker

단계적 적용 우선순위:
1. PR/리뷰/테스트 게이트 고정 (이미 적용)
2. FE 신규 화면부터 Vite + Storybook 적용
3. BE 신규 모듈부터 Spring Boot 3.3+/Java 21 적용
4. API OpenAPI 문서화 및 계약 테스트 도입
5. CI 필수 체크 자동화 고도화

## 2) 절대 원칙
- 기존 공통 Grid 컴포넌트를 직접 수정하지 않는다.
- API 변경 시 다른 화면 사용 여부를 반드시 확인한다.
- 요구사항에 없는 리팩토링은 하지 않는다.
- 변경은 최소 단위로 하고, 근거를 남긴다.

## 3) 애자일 운영 규칙
- 스프린트 기간: 1~2주
- 작업 단위: 사용자 스토리 + 수용 기준(AC)
- WIP 제한: 한 담당자당 진행중 이슈 최대 2개
- 이벤트: 계획(Plan) -> 데일리(Daily) -> 리뷰(Review) -> 회고(Retrospective)

## 4) DoR / DoD
DoR (착수 조건):
- 요구사항이 사용자 스토리로 정리되어 있다.
- 수용 기준(AC)이 3개 이상 있다.
- 영향 범위(FE/BE/DB/API)가 명시되어 있다.
- 불확실 항목과 질의사항이 정리되어 있다.

DoD (완료 조건):
- 코드 구현 + 리뷰 + 테스트 결과가 문서화되어 있다.
- 회귀 영향 확인이 끝났다.
- 배포/롤백 포인트가 정리되어 있다.
- 남은 리스크와 후속 과제가 기록되어 있다.

## 5) AI 사용 정책
- 허용: 코드 요약, 영향 분석, 테스트 케이스 초안, 리뷰 체크리스트 생성
- 금지: 비밀키/개인정보/고객식별정보/내부 인증정보 입력
- 검증 책임: AI가 제안한 내용은 각 담당자가 코드/로그/테스트로 검증 후 확정
- 기록 의무: AI 사용 시 "무엇을 물었고 무엇을 채택했는지"를 작업 메모에 남긴다.

## 6) 브랜치/PR 규칙
- 브랜치: feature/*, bugfix/*, hotfix/*
- PR 필수 항목: 변경 요약, 영향 범위, 테스트 결과, 롤백 방법
- 병합 조건: Blocker/Critical 이슈 0건

## 7) 릴리즈/롤백 기준
- API/DB 스키마 변경 시 하위 호환 여부를 먼저 명시한다.
- 롤백 가능한 단위로 배포한다.
- 장애 발생 시 복구 절차와 담당자를 사전에 지정한다.

## 8) 최근 개발 트렌드 반영 기준 (React + Java)
- 큰 변경 1건보다 작은 PR 여러 건을 우선한다.
- Feature Flag를 활용해 배포와 기능 오픈 시점을 분리한다.
- 모듈러 모놀리스 기반으로 시작하고, 운영 필요 시에만 서비스 분리를 검토한다.
- API는 계약(OpenAPI/요청-응답 스키마) 중심으로 관리한다.
- 관측성(로그/메트릭/트레이싱)과 장애 복구 가능성을 설계 단계에서 포함한다.
- AI는 초안 생성 도구로 사용하고, 최종 책임은 사람 검증으로 확정한다.

## 9) PR 운영 상세 규칙
PR 목적:
- 코드 품질 확보
- 변경 이력과 의사결정 기록
- 회귀/장애 예방

PR 작성 규칙:
- 한 PR은 한 가지 목적만 담는다.
- PR 본문에 변경 목적, 영향 범위, 테스트 결과, 롤백 방법을 반드시 작성한다.
- UI 변경이 있으면 화면 증거(캡처 또는 Storybook 링크)를 첨부한다.

PR 병합 규칙:
- 빌드/테스트/린트/보안 체크 통과 후 병합한다.
- Blocker/Critical 이슈가 하나라도 있으면 병합하지 않는다.
- CODEOWNERS 대상 영역은 지정 리뷰어 승인 후 병합한다.

권장 PR 템플릿:
1. 변경 목적
2. 변경 내용
3. 영향 범위 (FE/BE/API/DB)
4. 테스트 방법 및 결과
5. 리스크 및 롤백 방법
6. 체크리스트 (AC 충족/호환성/문서 업데이트)

## 10) Storybook 운영 기준
목적:
- UI 컴포넌트를 독립적으로 개발/검증/문서화한다.

적용 대상:
- 공통 UI 컴포넌트
- 재사용 가능한 도메인 컴포넌트

필수 스토리:
- 기본 상태
- 로딩 상태
- 빈 데이터 상태
- 에러 상태
- 비활성/권한 제한 상태

운영 규칙:
- UI 변경 PR에는 관련 Storybook 스토리를 함께 갱신한다.
- 스토리 이름은 도메인/컴포넌트/상태를 일관되게 사용한다.
- 테스트 담당자는 Storybook 기준으로 시각 회귀를 우선 확인한다.

## 11) FE 개발자용 백엔드 학습 병행 트랙
원칙:
- 업무와 학습을 분리하지 않고 같은 이슈에서 함께 진행한다.
- 스프린트마다 백엔드 학습 목표 1개만 설정한다.
- 이론보다 현재 프로젝트 코드와 로그 기반으로 학습한다.

권장 비율:
- 업무 구현 70%
- 백엔드 학습/검증 30%

12주 학습 로드맵:
1. 1~2주: HTTP/REST/상태코드, API 요청-응답 구조 이해
2. 3~4주: Spring Boot 기본 계층 (Controller/Service/Repository)
3. 5~6주: SQL 기초, 조인, 인덱스, 트랜잭션, MyBatis 매퍼 읽기
4. 7~8주: 예외 처리, Validation, 로깅 표준
5. 9~10주: 단위/통합 테스트, API 테스트 자동화 기초
6. 11~12주: Docker, CI, 배포/롤백 기초

스프린트 산출물:
- 백엔드 학습 목표 1개
- 실제 코드 적용 1개
- 학습 메모 (문제/원인/해결/다음 액션)

## 12) 배포 전략 (월 5만원 이하)
권장 결론:
- 운영 서비스는 매니지드 우선, 개인 리눅스 서버는 학습/실험용으로 분리한다.

확정 권장 조합 (Starter):
1. Frontend: Vercel Free 또는 Cloudflare Pages Free
2. Backend: Render Starter 1개 또는 Railway Hobby 1개
3. DB: Neon Free 또는 Supabase Free (PostgreSQL)
4. Storage: Cloudflare R2 (필요 시)
5. CI/CD: GitHub Actions

월 비용 가이드:
- Backend: 10,000 ~ 18,000원
- DB: Free tier 내 0원
- Storage/egress: 0 ~ 5,000원
- Domain (연 환산 월 비용): 1,000 ~ 2,000원
- 합계 목표: 12,000 ~ 35,000원 (상한 50,000원)

예산 통제 규칙:
- 경고선: 40,000원
- 차단선: 50,000원
- 단일 백엔드 인스턴스부터 시작하고, 수직/수평 확장은 실제 병목 확인 후 진행

배포 순서 (실행용):
1. GitHub main 보호 규칙 설정 (필수 체크: build/test/lint)
2. DB 생성 및 접속 정보 발급 (dev/prod 분리)
3. Backend 배포 연결 (환경변수: DB_URL, DB_USER, DB_PASSWORD, JWT_SECRET)
4. Frontend 배포 연결 (환경변수: API_BASE_URL)
5. 도메인 연결 + HTTPS 확인
6. 헬스체크 엔드포인트와 기본 알람 설정
7. 롤백 절차 검증 (직전 정상 버전 재배포)

필수 운영 체크:
- 일 1회 오류 로그 확인
- 주 1회 비용 대시보드 점검
- 주 1회 DB 백업/복구 리허설
- 월 1회 미사용 리소스 정리

개인 리눅스 서버 사용 원칙:
- 서비스 본 운영에는 기본 비권장
- 사용 시에도 학습용/스테이징 용도로 제한
- 운영 서비스로 전환하려면 백업/모니터링/보안 패치 자동화가 선행되어야 함

## 13) 환경변수 표준 (dev/stg/prod)
원칙:
- 민감정보는 코드/PR/이슈에 직접 기록하지 않는다.
- 환경별 값은 분리하고, 키 이름은 동일하게 유지한다.
- 기본값 의존을 줄이고 필수 키 누락 시 애플리케이션이 즉시 실패하도록 설정한다.

공통 키 (Backend):
- APP_ENV
- SERVER_PORT
- DB_URL
- DB_USER
- DB_PASSWORD
- JWT_SECRET
- CORS_ALLOWED_ORIGINS
- LOG_LEVEL
- HEALTH_CHECK_PATH

공통 키 (Frontend):
- API_BASE_URL
- APP_ENV
- SENTRY_DSN (선택)

환경별 예시 값:
| Key | dev | stg | prod |
|---|---|---|---|
| APP_ENV | dev | stg | prod |
| SERVER_PORT | 8080 | 8080 | 8080 |
| API_BASE_URL | https://api-dev.example.com | https://api-stg.example.com | https://api.example.com |
| DB_URL | jdbc:postgresql://dev-host:5432/app | jdbc:postgresql://stg-host:5432/app | jdbc:postgresql://prod-host:5432/app |
| DB_USER | app_dev | app_stg | app_prod |
| DB_PASSWORD | secret manager 사용 | secret manager 사용 | secret manager 사용 |
| JWT_SECRET | 32자 이상 랜덤 | 32자 이상 랜덤 | 32자 이상 랜덤 |
| CORS_ALLOWED_ORIGINS | http://localhost:3000 | https://stg.example.com | https://example.com |
| LOG_LEVEL | DEBUG | INFO | WARN |
| HEALTH_CHECK_PATH | /actuator/health | /actuator/health | /actuator/health |

플랫폼 권장 설정:
1. Vercel/Cloudflare Pages: Frontend 키만 등록
2. Render/Railway: Backend 키 등록 + Secret 기능 사용
3. DB 플랫폼(Neon/Supabase): 접속 문자열은 복사 후 즉시 Secret 저장

검증 체크리스트:
1. 배포 전: 필수 키 누락 여부 점검
2. 배포 직후: 헬스체크 및 로그인/핵심 API 1건 확인
3. 롤백 시: 직전 릴리즈의 환경변수 버전과 일치 여부 확인

## 14) 환경 파일 샘플 (.env.dev / .env.stg / .env.prod)
주의:
- 아래 값은 예시이며 실제 비밀값을 직접 입력해야 한다.
- 실제 비밀값 파일(.env*)은 저장소에 커밋하지 않는다.

.env.dev (backend 예시):
```env
APP_ENV=dev
SERVER_PORT=8080
DB_URL=jdbc:postgresql://dev-host:5432/app
DB_USER=app_dev
DB_PASSWORD=CHANGE_ME_DEV
JWT_SECRET=CHANGE_ME_DEV_32_PLUS
CORS_ALLOWED_ORIGINS=http://localhost:3000
LOG_LEVEL=DEBUG
HEALTH_CHECK_PATH=/actuator/health
```

.env.stg (backend 예시):
```env
APP_ENV=stg
SERVER_PORT=8080
DB_URL=jdbc:postgresql://stg-host:5432/app
DB_USER=app_stg
DB_PASSWORD=CHANGE_ME_STG
JWT_SECRET=CHANGE_ME_STG_32_PLUS
CORS_ALLOWED_ORIGINS=https://stg.example.com
LOG_LEVEL=INFO
HEALTH_CHECK_PATH=/actuator/health
```

.env.prod (backend 예시):
```env
APP_ENV=prod
SERVER_PORT=8080
DB_URL=jdbc:postgresql://prod-host:5432/app
DB_USER=app_prod
DB_PASSWORD=CHANGE_ME_PROD
JWT_SECRET=CHANGE_ME_PROD_32_PLUS
CORS_ALLOWED_ORIGINS=https://example.com
LOG_LEVEL=WARN
HEALTH_CHECK_PATH=/actuator/health
```

.env.dev (frontend 예시):
```env
APP_ENV=dev
API_BASE_URL=https://api-dev.example.com
SENTRY_DSN=
```

.env.stg (frontend 예시):
```env
APP_ENV=stg
API_BASE_URL=https://api-stg.example.com
SENTRY_DSN=
```

.env.prod (frontend 예시):
```env
APP_ENV=prod
API_BASE_URL=https://api.example.com
SENTRY_DSN=
```

추가 권장:
1. 저장소에는 .env.example만 커밋한다.
2. 배포 플랫폼에는 각 환경 변수 키를 동일한 이름으로 등록한다.
3. 비밀값 회전 주기(예: 90일)를 운영 규칙으로 정의한다.

## 15) MVP 기획 확정안 (가계부 + 자산관리)
서비스 한 줄 정의:
- 개인 사용자가 현금흐름, 자산, 미래 지출, 투자 시뮬레이션을 통합 관리하는 반응형 웹 서비스

핵심 문제:
1. 월 현금흐름 파악이 늦어 과소비를 통제하기 어렵다.
2. 주식/현금/부동산/연금 자산이 파편화되어 전체 판단이 어렵다.
3. 비상금이 실제로 몇 개월 유지되는지 계산이 어렵다.

MVP 포함 범위:
1. 로그인 기반 개인 계정
2. 자산 입력/조회 (현금/주식/부동산/연금)
3. 고정지출 + 이벤트성 지출 관리
4. 3/6/12개월 지출 전망
5. 비상금 유지 기간 계산
6. 투자 시뮬레이션 (보수/기준/공격)
7. CSV 업로드 1종
8. 웹/모바일 반응형 UI

MVP 제외 범위:
1. 토스 API 연동
2. 한국투자증권 API 연동
3. 다중 사용자 공유 기능

성공 기준 (MVP):
1. 사용자가 10분 내 자산/지출 기초 데이터 입력 완료
2. 대시보드에서 비상금 유지 개월 수를 즉시 확인
3. 시뮬레이션 3개 시나리오 비교 가능
4. 핵심 화면 모바일 사용성 확보

## 16) 스프린트 1 상세 작업표 (2주)
목표:
- 정보구조와 화면 골격을 확정하고, 로그인 및 기본 대시보드를 동작시킨다.

완료 기준 (DoD):
1. 로그인 성공 후 대시보드 진입 가능
2. 대시보드에서 더미 데이터 기준 핵심 카드 노출
3. 반응형 레이아웃(모바일/데스크톱) 깨짐 없음
4. PR 템플릿/리뷰/테스트 규칙 적용 확인

백로그 (우선순위 순):
1. 프로젝트 구조 확정 (FE/BE 폴더, 공통 규칙)
2. 인증 방식 결정 (이메일 로그인 또는 소셜 1종)
3. 대시보드 와이어프레임 확정
4. 대시보드 핵심 카드 4종 구현
5. 자산/지출 도메인 최소 데이터 모델 초안
6. 기본 API 3종 설계 (프로필, 요약, 월별 현금흐름)
7. Storybook 기본 세팅 및 공통 컴포넌트 2종 등록
8. 테스트 기본 세팅 (단위 + API smoke)

화면 범위:
1. 로그인
2. 대시보드
3. 설정(프로필 최소 항목)

API 범위 (초안):
1. GET /api/v1/me
2. GET /api/v1/dashboard/summary
3. GET /api/v1/dashboard/cashflow?months=3

데이터 모델 초안 (스프린트 1 수준):
1. users
2. asset_accounts
3. expense_categories
4. monthly_snapshots

일정 예시:
1. Day 1~2: 요구사항 고정, 와이어프레임, 데이터 모델 초안
2. Day 3~5: 로그인 + 기본 레이아웃 + 대시보드 카드
3. Day 6~8: API 3종 + FE 연동
4. Day 9~10: 테스트/반응형 보정/문서화/리뷰 반영

리스크 및 대응:
1. 범위 확장 위험 -> 스프린트 1은 대시보드 최소 기능만 고정
2. 백엔드 난이도 상승 -> API 3종 우선, 나머지는 더미/목업 병행
3. 반응형 품질 저하 -> 모바일 우선 점검 체크리스트 적용

스프린트 1 산출물:
1. 화면 3종 동작 데모
2. API 3종 명세 + 구현
3. 데이터 모델 초안 문서
4. 테스트 결과 및 알려진 이슈 목록

## 17) 스프린트 1 이슈 템플릿 (바로 등록용)
이슈 작성 규칙:
1. 한 이슈는 하나의 완료 결과물만 가진다.
2. 수용 기준(AC)이 모호하면 이슈를 시작하지 않는다.
3. PR은 이슈 1개 기준으로 연결한다.

Issue 1. 프로젝트 초기 구조 및 품질 게이트
- 목적: FE/BE 구조와 공통 개발 규칙을 고정한다.
- 작업:
	- FE/BE 기본 디렉터리 구성
	- lint/test 스크립트 확인
	- PR 템플릿 및 브랜치 규칙 점검
- 수용 기준:
	- FE/BE 로컬 실행 확인
	- 기본 lint/test 명령 성공
	- PR 체크리스트가 문서 규칙과 일치
- 완료 산출물: 초기 구조 커밋 + 실행 방법 문서
- 예상: 0.5~1일

Issue 2. 로그인 방식 확정 및 로그인 화면 구현
- 목적: 개인 사용자 로그인 흐름을 확정하고 진입점을 만든다.
- 작업:
	- 이메일 로그인 또는 소셜 1종 선택
	- 로그인 화면/폼/검증 구현
	- 로그인 성공 시 대시보드 이동
- 수용 기준:
	- 잘못된 입력에 유효성 메시지 표시
	- 성공 시 대시보드 진입
	- 실패 시 오류 메시지 표시
- 완료 산출물: 로그인 화면 + 인증 흐름 시연 영상(또는 캡처)
- 예상: 1~1.5일

Issue 3. 대시보드 와이어프레임 및 레이아웃
- 목적: 모바일/데스크톱 공통 레이아웃을 확정한다.
- 작업:
	- 대시보드 정보 구조 정의
	- 카드/차트 배치 와이어프레임 작성
	- 반응형 그리드 레이아웃 구현
- 수용 기준:
	- 모바일 360px 기준 레이아웃 깨짐 없음
	- 데스크톱에서 핵심 카드 4개 1스크린 내 확인
- 완료 산출물: 와이어프레임 + 기본 레이아웃 화면
- 예상: 1일

Issue 4. 대시보드 핵심 카드 4종 구현
- 목적: MVP 가치 지표를 첫 화면에 노출한다.
- 작업:
	- 순자산
	- 월 수지
	- 비상금 유지 개월
	- 자산 구성비
- 수용 기준:
	- 더미 데이터 기준 계산값 일치
	- 로딩/빈값/오류 상태 표시
- 완료 산출물: 카드 4종 컴포넌트 + Storybook 스토리
- 예상: 1~1.5일

Issue 5. 데이터 모델 초안 작성 (BE)
- 목적: 스프린트 1에서 필요한 최소 스키마를 확정한다.
- 작업:
	- users, asset_accounts, expense_categories, monthly_snapshots 설계
	- 필수 인덱스/제약조건 초안 작성
	- 향후 확장 필드 메모
- 수용 기준:
	- 각 테이블 PK/FK/nullable 기준 문서화
	- 월별 조회 기준 인덱스 정의
- 완료 산출물: 스키마 초안 문서 + DDL 초안
- 예상: 1일

Issue 6. API 3종 명세 및 구현
- 목적: 대시보드 초기 구동에 필요한 API를 제공한다.
- 작업:
	- GET /api/v1/me
	- GET /api/v1/dashboard/summary
	- GET /api/v1/dashboard/cashflow?months=3
	- 에러 응답 표준 구조 통일
- 수용 기준:
	- 정상/인증실패/서버오류 응답 케이스 확인
	- FE 연동 시 카드 데이터 정상 렌더링
- 완료 산출물: API 구현 + 명세 문서
- 예상: 2일

Issue 7. FE-BE 연동 및 상태 처리
- 목적: 실제 API를 연결하고 화면 상태를 안정화한다.
- 작업:
	- 대시보드 API 연동
	- 로딩/오류/재시도 처리
	- 오류 토스트 또는 안내 메시지 처리
- 수용 기준:
	- API 지연 시 로딩 UI 표시
	- 실패 시 사용자 액션 가능한 메시지 표시
- 완료 산출물: 연동 완료 화면 + 오류 처리 확인 결과
- 예상: 1일

Issue 8. 테스트/문서화/릴리즈 리허설
- 목적: 스프린트 종료 품질 기준을 충족한다.
- 작업:
	- 단위 테스트 최소 세트
	- API smoke 테스트
	- 배포 전 체크리스트 실행
	- 알려진 이슈 목록 정리
- 수용 기준:
	- 핵심 기능 테스트 통과
	- 배포 순서 리허설 완료
	- 남은 리스크 문서화
- 완료 산출물: 테스트 결과 보고 + 릴리즈 노트 초안
- 예상: 1~1.5일

우선순위:
1. Issue 1 -> 2 -> 3 -> 5 -> 6 -> 4 -> 7 -> 8

권장 분담 (1인 개발 기준):
1. 오전: 설계/백엔드
2. 오후: 프론트/연동
3. 마감 전 30분: 테스트/메모/다음날 계획

## 18) GitHub Issue 본문 템플릿 (복붙용)
사용 규칙:
1. 제목은 [Sprint1] 접두어를 사용한다.
2. 본문은 아래 템플릿을 그대로 사용하고 필요한 값만 바꾼다.
3. AC 미충족 시 Done 처리하지 않는다.

공통 본문 템플릿:
```md
## 목적
- 

## 작업
- [ ] 
- [ ] 
- [ ] 

## 수용 기준 (AC)
- [ ] 
- [ ] 

## 완료 산출물
- 

## 예상 소요
- 

## 의존 이슈
- 
```

Issue 1 템플릿
제목: [Sprint1] 프로젝트 초기 구조 및 품질 게이트
```md
## 목적
- FE/BE 구조와 공통 개발 규칙을 고정한다.

## 작업
- [ ] FE/BE 기본 디렉터리 구성
- [ ] lint/test 스크립트 확인
- [ ] PR 템플릿 및 브랜치 규칙 점검

## 수용 기준 (AC)
- [ ] FE/BE 로컬 실행 확인
- [ ] 기본 lint/test 명령 성공
- [ ] PR 체크리스트가 문서 규칙과 일치

## 완료 산출물
- 초기 구조 커밋 + 실행 방법 문서

## 예상 소요
- 0.5~1일

## 의존 이슈
- 없음
```

Issue 2 템플릿
제목: [Sprint1] 로그인 방식 확정 및 로그인 화면 구현
```md
## 목적
- 개인 사용자 로그인 흐름을 확정하고 진입점을 만든다.

## 작업
- [ ] 이메일 로그인 또는 소셜 1종 선택
- [ ] 로그인 화면/폼/검증 구현
- [ ] 로그인 성공 시 대시보드 이동

## 수용 기준 (AC)
- [ ] 잘못된 입력에 유효성 메시지 표시
- [ ] 성공 시 대시보드 진입
- [ ] 실패 시 오류 메시지 표시

## 완료 산출물
- 로그인 화면 + 인증 흐름 캡처

## 예상 소요
- 1~1.5일

## 의존 이슈
- Issue 1
```

## 22) Issue 3 최종 본문 (대시보드 와이어프레임/레이아웃 확정)
제목:
- [Sprint1] 대시보드 정보구조 및 반응형 레이아웃 확정

본문 (복붙용):
```md
## 목적
- 자산/현금흐름/비상금 핵심 정보를 한 화면에서 이해할 수 있도록 대시보드 정보구조와 반응형 레이아웃을 확정한다.

## 작업
- [ ] 대시보드 정보 구조 정의 (카드/차트/요약 영역)
- [ ] 모바일 우선 와이어프레임 작성
- [ ] 데스크톱 확장 레이아웃 정의
- [ ] 공통 레이아웃 컴포넌트(헤더/컨테이너/카드 그리드) 구현
- [ ] 빈 상태/로딩 상태 레이아웃 정의

## 설계 기준
- [ ] 핵심 카드 4종이 첫 화면에서 우선 노출되도록 배치
- [ ] 모바일(360px)에서 스크롤 흐름이 자연스럽도록 구성
- [ ] 데스크톱에서 핵심 카드/차트가 1스크린 내 최대한 확인 가능하도록 구성

## 수용 기준 (AC)
- [ ] 모바일 360px 기준 레이아웃 깨짐 없음
- [ ] 태블릿/데스크톱에서 그리드 정렬 이상 없음
- [ ] 대시보드 핵심 카드 영역이 시각적으로 구분됨
- [ ] 로딩/빈 데이터 상태 UI 제공

## 완료 산출물
- 와이어프레임 이미지 또는 링크
- 레이아웃 구현 화면 캡처 (모바일/데스크톱)
- 레이아웃 규칙 간단 문서 (간격, 컬럼, 우선순위)

## 예상 소요
- 1일

## 의존 이슈
- Issue 1, Issue 2
```

## 23) Issue 4 최종 본문 (대시보드 핵심 카드 4종 구현)
제목:
- [Sprint1] 대시보드 핵심 카드 4종 구현 및 상태 처리

본문 (복붙용):
```md
## 목적
- 대시보드 첫 화면에서 사용자 의사결정에 필요한 핵심 지표를 빠르게 확인할 수 있도록 카드 4종을 구현한다.

## 카드 범위
- 순자산
- 월 수지
- 비상금 유지 개월
- 자산 구성비

## 작업
- [ ] 카드 4종 UI 컴포넌트 구현
- [ ] 더미 데이터 기준 계산 로직 반영
- [ ] 숫자 포맷 규칙 적용 (통화, 천단위 구분)
- [ ] 로딩/빈값/오류 상태 UI 구현
- [ ] 카드 4종 Storybook 스토리 작성

## 표시 규칙
- [ ] 순자산 = 총자산 - 총부채
- [ ] 월 수지 = 월 총수입 - 월 총지출
- [ ] 비상금 유지 개월 = 투자금 잔액 / 월 필수지출
	- 총 현금이 아니라 **투자금만** 분자에 넣는다 (§28.7)
	- 자동이체 잔액은 분모와 이중 계상되므로 넣지 않는다
- [ ] 자산 구성비 = 자산 유형별 비율(합계 100%)

## 수용 기준 (AC)
- [ ] 카드 4종이 대시보드 첫 화면에서 확인 가능
- [ ] 더미 데이터 기준 계산값이 기대값과 일치
- [ ] 로딩/빈값/오류 상태가 각각 구분되어 노출
- [ ] 모바일(360px)과 데스크톱에서 카드 레이아웃 깨짐 없음

## 완료 산출물
- 카드 4종 구현 화면 캡처
- Storybook 링크 또는 스토리 캡처
- 계산 기준 간단 문서

## 예상 소요
- 1~1.5일

## 의존 이슈
- Issue 3
```

## 24) Issue 5 최종 본문 (데이터 모델 초안 작성)
제목:
- [Sprint1] 데이터 모델 초안 작성 (users, assets, expenses, snapshots)

본문 (복붙용):
```md
## 목적
- 스프린트 1에서 필요한 최소 데이터 스키마를 확정하여 인증/대시보드/API 구현의 기반을 만든다.

## 테이블 범위
- users
- asset_accounts
- expense_categories
- monthly_snapshots

## 작업
- [ ] 테이블별 필드/타입/nullable 정의
- [ ] PK/FK 관계 정의
- [ ] 기본 인덱스 설계
- [ ] 생성/수정 시각 컬럼(created_at, updated_at) 기준 통일
- [ ] 소프트 삭제 필요 여부 판단 및 규칙 문서화

## 설계 기준
- [ ] users는 인증 식별자(email) 유니크 보장
- [ ] asset_accounts는 사용자별 다중 계정 허용
- [ ] expense_categories는 사용자 커스텀 + 기본 카테고리 확장 가능
- [ ] monthly_snapshots는 월 기준 집계 조회 최적화

## 수용 기준 (AC)
- [ ] 4개 테이블 DDL 초안 작성 완료
- [ ] PK/FK/nullable/기본값이 문서화됨
- [ ] 월별 조회 성능을 위한 인덱스가 정의됨
- [ ] 데이터 무결성 제약조건(유니크/참조) 반영됨

## 완료 산출물
- ERD 또는 관계 다이어그램
- DDL 초안 SQL
- 설계 노트 (필드 선택 이유, 확장 포인트)

## 예상 소요
- 1일

## 의존 이슈
- Issue 1
```

## 25) Issue 6 최종 본문 (대시보드 API 3종 명세/구현)
제목:
- [Sprint1] 대시보드 API 3종 명세 및 구현

본문 (복붙용):
```md
## 목적
- 대시보드 초기 동작에 필요한 API 3종을 명세하고 구현하여 FE 연동 가능한 상태를 만든다.

## API 범위
- GET /api/v1/me
- GET /api/v1/dashboard/summary
- GET /api/v1/dashboard/cashflow?months=3

## 작업
- [ ] API 요청/응답 스펙 문서화
- [ ] 컨트롤러/서비스/리포지토리 구현
- [ ] 인증 필요 엔드포인트 접근 제어 적용
- [ ] 공통 에러 응답 포맷 통일
- [ ] API smoke 테스트 작성

## 응답/오류 표준
- [ ] 성공 응답: code, message, data 구조 일관성 유지
- [ ] 실패 응답: code, message, details, timestamp 포함
- [ ] 인증 실패(401), 권한 실패(403), 서버 오류(500) 구분

## 수용 기준 (AC)
- [ ] 3개 API가 정상 응답을 반환
- [ ] 인증 없는 요청은 보호 API 접근 차단
- [ ] 오류 상황에서 표준 포맷으로 응답
- [ ] FE 대시보드 카드와 연동 시 데이터 정상 표시

## 완료 산출물
- API 명세 문서 (요청/응답 예시 포함)
- 구현 코드 + 테스트 결과
- FE 연동 검증 캡처 또는 로그

## 예상 소요
- 2일

## 의존 이슈
- Issue 5
```

## 26) Issue 7 최종 본문 (FE-BE 연동/상태 처리)
제목:
- [Sprint1] FE-BE 연동 및 대시보드 상태 처리 안정화

본문 (복붙용):
```md
## 목적
- 대시보드 화면을 실제 API와 연결하고, 사용자 경험에 필요한 로딩/오류/재시도 상태를 안정화한다.

## 작업
- [ ] GET /api/v1/dashboard/summary 연동
- [ ] GET /api/v1/dashboard/cashflow?months=3 연동
- [ ] 카드별 로딩 상태 UI 처리
- [ ] 빈 데이터 상태 UI 처리
- [ ] 오류 상태 UI 및 재시도 동작 구현
- [ ] 에러 메시지 사용자 친화 문구 적용

## 연동 기준
- [ ] API 실패 시 전체 화면 중단이 아닌 카드 단위 복구 우선
- [ ] 네트워크 오류/인증 오류 메시지 구분
- [ ] 재요청 시 중복 호출 방지 처리

## 수용 기준 (AC)
- [ ] 정상 응답 시 대시보드 카드 데이터 노출
- [ ] API 지연 시 로딩 UI가 명확히 표시
- [ ] API 실패 시 오류 UI와 재시도 액션 제공
- [ ] 모바일/데스크톱 모두 상태 UI 동작 일관성 유지

## 완료 산출물
- FE-BE 연동 완료 화면 캡처
- 오류/재시도 시나리오 테스트 결과
- 알려진 연동 이슈 목록

## 예상 소요
- 1일

## 의존 이슈
- Issue 4, Issue 6
```

## 27) Issue 8 최종 본문 (테스트/문서화/릴리즈 리허설)
제목:
- [Sprint1] 테스트/문서화/릴리즈 리허설 완료

본문 (복붙용):
```md
## 목적
- 스프린트 1 종료 전 품질 게이트를 통과하고, 실제 배포 가능한 수준의 테스트/문서 상태를 확보한다.

## 작업
- [ ] 핵심 기능 단위 테스트 최소 세트 작성
- [ ] API smoke 테스트 실행
- [ ] 반응형 기본 점검 (모바일/데스크톱)
- [ ] 배포 체크리스트 리허설
- [ ] 알려진 이슈/리스크 문서화

## 테스트 범위
- [ ] 로그인/로그아웃
- [ ] 대시보드 카드 데이터 표시
- [ ] API 오류 처리
- [ ] 보호 라우트 접근 제어

## 수용 기준 (AC)
- [ ] 핵심 테스트 통과 결과 확보
- [ ] 릴리즈 절차 1회 리허설 완료
- [ ] 롤백 절차 확인
- [ ] 남은 리스크와 후속 작업 명시

## 완료 산출물
- 테스트 결과 요약 보고
- 릴리즈 노트 초안
- Known Issues 문서

## 예상 소요
- 1~1.5일

## 의존 이슈
- Issue 7
```

Issue 3 템플릿
제목: [Sprint1] 대시보드 와이어프레임 및 레이아웃
```md
## 목적
- 모바일/데스크톱 공통 레이아웃을 확정한다.

## 작업
- [ ] 대시보드 정보 구조 정의
- [ ] 카드/차트 배치 와이어프레임 작성
- [ ] 반응형 그리드 레이아웃 구현

## 수용 기준 (AC)
- [ ] 모바일 360px 기준 레이아웃 깨짐 없음
- [ ] 데스크톱에서 핵심 카드 4개 1스크린 내 확인

## 완료 산출물
- 와이어프레임 + 기본 레이아웃 화면

## 예상 소요
- 1일

## 의존 이슈
- Issue 1, Issue 2
```

Issue 4 템플릿
제목: [Sprint1] 대시보드 핵심 카드 4종 구현
```md
## 목적
- MVP 가치 지표를 첫 화면에 노출한다.

## 작업
- [ ] 순자산 카드
- [ ] 월 수지 카드
- [ ] 비상금 유지 개월 카드
- [ ] 자산 구성비 카드

## 수용 기준 (AC)
- [ ] 더미 데이터 기준 계산값 일치
- [ ] 로딩/빈값/오류 상태 표시

## 완료 산출물
- 카드 4종 컴포넌트 + Storybook 스토리

## 예상 소요
- 1~1.5일

## 의존 이슈
- Issue 3
```

Issue 5 템플릿
제목: [Sprint1] 데이터 모델 초안 작성 (BE)
```md
## 목적
- 스프린트 1에서 필요한 최소 스키마를 확정한다.

## 작업
- [ ] users 설계
- [ ] asset_accounts 설계
- [ ] expense_categories 설계
- [ ] monthly_snapshots 설계
- [ ] 인덱스/제약조건 초안 작성

## 수용 기준 (AC)
- [ ] PK/FK/nullable 기준 문서화
- [ ] 월별 조회 기준 인덱스 정의

## 완료 산출물
- 스키마 초안 문서 + DDL 초안

## 예상 소요
- 1일

## 의존 이슈
- Issue 1
```

Issue 6 템플릿
제목: [Sprint1] 대시보드 API 3종 명세 및 구현
```md
## 목적
- 대시보드 초기 구동에 필요한 API를 제공한다.

## 작업
- [ ] GET /api/v1/me
- [ ] GET /api/v1/dashboard/summary
- [ ] GET /api/v1/dashboard/cashflow?months=3
- [ ] 에러 응답 표준 구조 통일

## 수용 기준 (AC)
- [ ] 정상/인증실패/서버오류 케이스 확인
- [ ] FE 연동 시 카드 데이터 정상 렌더링

## 완료 산출물
- API 구현 + 명세 문서

## 예상 소요
- 2일

## 의존 이슈
- Issue 5
```

Issue 7 템플릿
제목: [Sprint1] FE-BE 연동 및 상태 처리
```md
## 목적
- 실제 API를 연결하고 화면 상태를 안정화한다.

## 작업
- [ ] 대시보드 API 연동
- [ ] 로딩/오류/재시도 처리
- [ ] 오류 토스트/안내 메시지 처리

## 수용 기준 (AC)
- [ ] API 지연 시 로딩 UI 표시
- [ ] 실패 시 사용자 액션 가능한 메시지 표시

## 완료 산출물
- 연동 완료 화면 + 오류 처리 확인 결과

## 예상 소요
- 1일

## 의존 이슈
- Issue 4, Issue 6
```

Issue 8 템플릿
제목: [Sprint1] 테스트/문서화/릴리즈 리허설
```md
## 목적
- 스프린트 종료 품질 기준을 충족한다.

## 작업
- [ ] 단위 테스트 최소 세트
- [ ] API smoke 테스트
- [ ] 배포 전 체크리스트 실행
- [ ] 알려진 이슈 목록 정리

## 수용 기준 (AC)
- [ ] 핵심 기능 테스트 통과
- [ ] 배포 순서 리허설 완료
- [ ] 남은 리스크 문서화

## 완료 산출물
- 테스트 결과 보고 + 릴리즈 노트 초안

## 예상 소요
- 1~1.5일

## 의존 이슈
- Issue 7
```

## 19) GitHub 라벨 체계 (스프린트 1)
라벨 원칙:
1. 모든 이슈는 영역 라벨 1개 이상 + 단계 라벨 1개 + 우선순위 라벨 1개를 가진다.
2. Blocked 상태는 별도 라벨로 표시한다.
3. 완료 조건은 AC 기준이며, 라벨 상태로 대체하지 않는다.

권장 라벨 목록:
1. 영역 라벨
- fe
- be
- api
- db
- infra
- qa
- docs

2. 단계 라벨
- phase:plan
- phase:build
- phase:review
- phase:test
- phase:release

3. 우선순위 라벨
- p0-critical
- p1-high
- p2-medium
- p3-low

4. 상태 라벨
- status:blocked
- status:ready
- status:in-progress
- status:needs-review
- status:done

5. 스프린트 라벨
- sprint:1

이슈별 라벨 매핑:
1. Issue 1
- fe, be, infra, docs, phase:plan, p0-critical, status:ready, sprint:1

2. Issue 2
- fe, api, phase:build, p0-critical, status:ready, sprint:1

3. Issue 3
- fe, docs, phase:plan, p1-high, status:ready, sprint:1

4. Issue 4
- fe, qa, phase:build, p1-high, status:ready, sprint:1

5. Issue 5
- be, db, docs, phase:plan, p0-critical, status:ready, sprint:1

6. Issue 6
- be, api, qa, phase:build, p0-critical, status:ready, sprint:1

7. Issue 7
- fe, be, api, phase:test, p1-high, status:ready, sprint:1

8. Issue 8
- qa, docs, infra, phase:release, p0-critical, status:ready, sprint:1

운영 팁:
1. 작업 시작 시 status:ready -> status:in-progress 변경
2. PR 생성 시 status:in-progress -> status:needs-review 변경
3. AC 충족 + 머지 완료 시 status:done 변경
4. 외부 의존 발생 시 status:blocked 추가하고 blocker 내용을 코멘트로 남김

## 20) GitHub Actions 라벨 자동화 초안
목적:
- 이슈/PR 이벤트에 따라 기본 라벨을 자동으로 보정해 수동 작업을 줄인다.

자동화 범위 (권장):
1. 새 이슈 생성 시 sprint:1 + status:ready 기본 부여
2. PR 열림 시 연결 이슈의 status:in-progress 제거 + status:needs-review 부여
3. PR 머지 시 연결 이슈의 status:needs-review 제거 + status:done 부여

워크플로우 예시 (초안):
```yaml
name: issue-label-automation

on:
	issues:
		types: [opened]
	pull_request:
		types: [opened, closed]

permissions:
	issues: write
	pull-requests: read

jobs:
	label-issue-open:
		if: github.event_name == 'issues' && github.event.action == 'opened'
		runs-on: ubuntu-latest
		steps:
			- name: Add default labels to new issue
				uses: actions-ecosystem/action-add-labels@v1
				with:
					github_token: ${{ secrets.GITHUB_TOKEN }}
					labels: sprint:1,status:ready

	label-pr-open:
		if: github.event_name == 'pull_request' && github.event.action == 'opened'
		runs-on: ubuntu-latest
		steps:
			- name: Mark linked issues as needs-review
				uses: actions/github-script@v7
				with:
					github-token: ${{ secrets.GITHUB_TOKEN }}
					script: |
						const body = context.payload.pull_request.body || "";
						const matches = body.match(/#(\d+)/g) || [];
						const issueNumbers = [...new Set(matches.map(v => Number(v.slice(1))))];
						for (const issue_number of issueNumbers) {
							try {
								await github.rest.issues.removeLabel({
									owner: context.repo.owner,
									repo: context.repo.repo,
									issue_number,
									name: 'status:in-progress'
								});
							} catch (e) {}
							await github.rest.issues.addLabels({
								owner: context.repo.owner,
								repo: context.repo.repo,
								issue_number,
								labels: ['status:needs-review']
							});
						}

	label-pr-merged:
		if: github.event_name == 'pull_request' && github.event.action == 'closed' && github.event.pull_request.merged == true
		runs-on: ubuntu-latest
		steps:
			- name: Mark linked issues as done
				uses: actions/github-script@v7
				with:
					github-token: ${{ secrets.GITHUB_TOKEN }}
					script: |
						const body = context.payload.pull_request.body || "";
						const matches = body.match(/#(\d+)/g) || [];
						const issueNumbers = [...new Set(matches.map(v => Number(v.slice(1))))];
						for (const issue_number of issueNumbers) {
							try {
								await github.rest.issues.removeLabel({
									owner: context.repo.owner,
									repo: context.repo.repo,
									issue_number,
									name: 'status:needs-review'
								});
							} catch (e) {}
							await github.rest.issues.addLabels({
								owner: context.repo.owner,
								repo: context.repo.repo,
								issue_number,
								labels: ['status:done']
							});
						}
```

운영 규칙:
1. PR 본문에 반드시 연결 이슈 번호를 포함한다. 예: #12
2. 라벨 자동화는 상태 보조 수단이며, 최종 Done 판단은 AC 충족으로 한다.
3. 예외 케이스(핫픽스/긴급복구)는 수동 라벨 변경을 허용한다.

적용 순서:
1. 저장소 라벨 목록을 먼저 생성한다.
2. 워크플로우 파일을 .github/workflows/issue-label-automation.yml 로 추가한다.
3. 테스트용 이슈/PR 1건으로 자동 라벨 동작을 검증한다.

## 21) Issue 2 최종 본문 (이메일 로그인 확정)
제목:
- [Sprint1] 이메일 로그인 구현 및 인증 기본 흐름 완성

본문 (복붙용):
```md
## 목적
- 스프린트 1에서 로그인 방식을 이메일 로그인으로 확정하고, 대시보드 진입을 위한 최소 인증 흐름을 완성한다.

## 결정 사항
- 로그인 방식: 이메일 로그인 (소셜 로그인은 스프린트 3~4 이후 검토)

## 작업
- [ ] 로그인 화면 구현 (이메일, 비밀번호)
- [ ] 입력값 검증 (이메일 형식, 비밀번호 최소 길이)
- [ ] 로그인 API 연동
- [ ] 로그인 성공 시 대시보드 라우팅
- [ ] 로그인 실패 메시지 처리
- [ ] 로그아웃 처리
- [ ] 보호 라우트 접근 제어 (미로그인 시 로그인 페이지 이동)

## 보안 최소 기준
- [ ] 비밀번호는 해시 저장(평문 저장 금지)
- [ ] 로그인 실패 응답은 계정 유무를 노출하지 않는 공통 메시지 사용
- [ ] 인증 토큰 만료 처리 및 만료 시 재로그인 유도

## 수용 기준 (AC)
- [ ] 정상 계정으로 로그인 시 대시보드 진입
- [ ] 잘못된 자격 증명 입력 시 오류 메시지 노출
- [ ] 로그아웃 후 보호 페이지 재접근 차단
- [ ] 모바일 화면(360px)에서 폼 레이아웃 깨짐 없음

## 제외 범위 (이번 스프린트 미포함)
- 비밀번호 재설정
- 소셜 로그인
- 2단계 인증(2FA)

## 완료 산출물
- 로그인/로그아웃 동작 데모 캡처
- 인증 플로우 간단 문서

## 예상 소요
- 1~1.5일

## 의존 이슈
- Issue 1
```

## 28) 프론트엔드 디자인·스타일 기준 확정 (스프린트 1 선행)

확정일: 2026-09-27
적용 범위: Issue 3(와이어프레임) ~ Issue 4(카드 4종), 이후 전 화면

### 28.1 스타일 전략
- 유틸리티 CSS(Tailwind 등) 미도입
- 런타임 CSS-in-JS(styled-components, Emotion) 미도입
- 커스텀은 antd ConfigProvider의 theme 토큰으로 처리한다
- 레이아웃은 antd Grid(Row/Col) + Grid.useBreakpoint()를 사용한다
- 전역 CSS는 global.css 1개(리셋, font-family, body 배경)만 유지한다
- 근거: antd 6가 CSS Modules를 사용하므로 별도 스타일 시스템 병용 시 토큰 충돌 위험

### 28.2 디자인 토큰
구조 토큰(확정):
- fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif
	- 근거: §12 비용 제약상 웹폰트 로딩 비용 회피
- 숫자 표기: font-variant-numeric: tabular-nums (금액/숫자 세로 정렬)
- 간격: 4px 기준 4 / 8 / 12 / 16 / 24 / 32 / 48
- borderRadius: 4(입력) / 6(카드, antd 기본) / 8(컨테이너)
- boxShadow: 0 1px 2px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.08)
- 컨테이너: max-width 1200px, gutter 데스크톱 24px / 모바일 16px
- 반응형: antd 기본 분할 유지 (xs<576 / sm>=576 / md>=768 / lg>=992 / xl>=1200)

색상 토큰(보류):
- colorPrimary은 v1에서 antd 기본값 #1677ff을 사용한다
- 브랜드 컬러는 프로토타입 리뷰 후 ConfigProvider 1줄로 교체한다
- 상태 색상은 antd 시드: 성공 #52c41a / 경고 #faad14 / 위험 #ff4d4f

### 28.3 통화·날짜 포맷
- 새 의존성 없이 Intl 내장만 사용한다 (dayjs는 antd 6가 이미 번들)
- 구현 위치: apps/frontend/src/utils/formatters.ts 단일 모듈
- 축약 경계: 1억 이상은 "X.X억", 1만 이상은 "X.X만", 미만은 정수 원 표기 (1.4억 / 3800.0만 / 7,160,000원)
- 규칙:
	- 카드 대용량 금액: 축약 표기 (1.4억)
	- 상세 금액: 통화 기호 포함, 소수점 0자리 (142,850,000원)
	- 금액 + 비중 동시 표기 시 상세 금액을 뒤에 붙인다 (38.0% · 1.6억)
	- 월 수지: 부호 포함 (+1,240,000원)
	- 비상금 유지 개월: 소수점 1자리 (7.2개월)
	- 구성비: 소수점 1자리 (32.0%)
	- 날짜: ko-KR (2026년 9월), 차트 축은 2026.09 축약
- Issue 6 API 명세에 금액 단위(원 단위 정수) 명칭 규칙을 포함한다

### 28.4 다크 모드
- MVP 범위에서 제외한다 (§15 포함 범위에 없음)
- 추가 시 antd theme.darkAlgorithm 전환으로 1줄이면 충분하다
- 규칙: 하드코딩 색상값 금지. antd 토큰 참조만 사용한다

### 28.5 접근성 기준
- 기준: WCAG 2.1 AA
- 본문 텍스트 대비 4.5:1, 큰 텍스트 3:1
- 포커스 표시 제거 금지
- 폼 라벨은 프로그램적으로 연결한다
- 오류 메시지는 role="alert"를 사용한다
- 전 기능을 키보드로 도달할 수 있어야 한다
- Storybook에 a11y 체크를 추가한다

### 28.6 리스크 기록
- antd는 shadcn/Radix 대비 접근성 지원이 약하다.
  28.5 기준을 antd 채택의 선행 조건으로 보고 매 Storybook 스토리에 검증한다
- 이 문서에는 기술 부채 관리 전용 섹션이 없으므로,
  DoD의 "남은 리스크와 후속 과제가 기록되어 있다"에 28.5 위반분을 매번 남긴다

### 28.7 현금 계좌 구분과 지표 분자
현금은 계좌별 성격이 다르므로 합쳐서 하나의 지표로 쓰지 않는다. 3계좌로 구분한다.

| 구분 | 성격 | 지표 포함 여부 |
|---|---|---|
| 투자금 | 순수 사용가능. 투자 여력 | 비상금 유지 개월의 분자에 포함 |
| 자동이체 | 고정지출 배정분. 기간 내 소진 | 제외 (월 필수지출로 이미 반영됨) |
| 부가가치세 | 세금 적립 보관. Filing 후 투자금으로 이체 | 제외 (Filing 전 인출 불가) |
- 비상금 유지 개월 = 투자금 잔액 / 월 필수지출
  - 총 현금을 분자에 넣으면 사용 불가능한 금액으로 유지 개월이 부풀려진다
  - 자동이체 잔액과 부가가치세 잔액을 더하면 분모와 이중 계상된다
- 투자 가능 현금 = 투자금 잔액, 현금 전체 대비 비율을 함께 표기한다
- 월 필수지출은 **지출 화면이 단일 출처**다. 자동이체 계좌 설정값이나 대시보드가
  따로 들고 있으면 계산 근거가 어긋나므로 코드에서 단일화한다 (§28.10).
  - 월 필수지출 = 필수로 표시한 지출 항목 합계 + 금액이 확정된 미반영 항목
    (미확정 항목은 0원 취급하되 `emergency.incomplete`로 드러낸다)
  - 전체 지출 합계와 필수지출 합계는 다른 값이다. 기부금 등 선택지출은
    필수지출에서 빠지지만 월 수지에는 총지출이 반영된다
  - **미확정 항목에 0원을 넣어 지표를 조작하지 않는다.** 미확정이면 경고를 띄운다
- 부가가치세 적립·정산 산식:
	- **[가장 중요] 부가가치세는 "공급대가"에서 낸다. 순수익이 아니다.**
		- 사용자가 말하는 "사업소득"은 이 컨텍스트에서 **공급가액(부가세 제외 매출)** 이다.
		  순수익(필요경비 차감 후)으로 오해하면 지표 전체가 틀어진다.
		- 확인: 공급대가 = 공급가액 + 부가세. 사용자는 9,020,000 = 8,200,000 + 820,000 이다.
		- 월 수지는 공급대가가 아니라 **공급가액**에서 지출을 뺀다.
		  부가세는 현금으로 쓸 수 없으므로 별도 계좌로 이동한다.
	- 실제 납부세액을 확정하려면 두 값이 반드시 필요하다.
	  없으면 실제 납부세액을 계산하지 않고 계획 기준으로만 표기한다
	  (`hasActualFilingData: false` 로 노출한다).
		- `grossSales`  - 월 공급대가 (부가세 포함 매출)
		- `purchaseTax` - 월 매입세액 (실제 인정분)
	- **용어를 구분한다.** 공급가액(부가세 제외 매출) / 공급대가(부가세 포함 매출) /
	  매출세액(공급대가에서 뽑은 세액) / 매입세액(매입하면서 낸 세액).
	  `10/110`은 **공급대가**에 곱한다. 공급가액에 10%를 다시 곱하면 이중 계상이다.
	- **산식이 사용자의 실제 신고 내역과 일치하는지 검증한다.**
	  실사용자 데이터에서는 아래가 모두 성립해야 한다. 하나라도 어긋나면 원인을 확인한다.
		- 6개월 매출세액 = 6개월 납부세액 + 6개월 매입세액
		- 6개월 납부세액 = 반기 예정고지 + 반기 확정고지
		- 예정고지 / 확정고지 공식이 실제 고지서 금액을 재현한다
	- 10/110 자체가 금지되는 이유는 세액 추출이 아니라,
	  매입세액과 카드 발행세액공제를 빠뜨려 실제 납부세액을 과대 평가하기 때문이다
	- 납부세액(공제 전) = 매출세액 - 매입세액
	- 카드 발행세액공제 (부가가치세법 제46조)
		- 기준: 카드·현금영수증으로 받은 **매출**의 공급대가 (지출이 아니라 매출)
		- 대상: 개인사업자, 직전연도 공급가액 10억원 이하 (법인 제외)
		- 공제율: 1.3% (2026-12-31까지) / 음식점·숙박업 등 2.6%
		- 한도: 연 1,000만원 (2026-12-31까지)
		- 환급 불가: 공제액은 납부세액을 초과할 수 없다 (0원 바닥)
		- 공제율·한도는 개정되므로 상수로 박지 말고 정책 객체로 분리한다
		- 2026 세제개편안에 따라 2027년부터 1.2%·연 500만원 변경 예정 (확정 여부 확인 필요)
	- **공제를 실제 적용받는지 여부를 별도로 기록한다.**
	  - `cardCreditClaimed` 로 신청 여부를 명시한다
	  - 실제 고지서 금액이 공제 전 금액과 같으면 미신청이다
	  - 미신청 공제액(`unclaimedCreditAnnual`)을 계산해 손실로 표시한다
	  - UI에서 신청 여부를 숨기지 않는다
	- 실제 납부세액 = 납부세액(공제 전) - 카드 발행세액공제 (신청한 경우)
	- **신고는 반기(6개월) 단위**다. 12분의 1이 아니다.
		- 1기 = 1~6월 실적, 2기 = 7~12월 실적
		- 예정고지세액 = 직전 반기 실제 납부세액 x 1/3  (4월 / 10월)
		- 확정고지세액 = 당기 실제 납부세액 - 당기 예정고지세액  (7월 / 다음해 1월)
		- 고지액 산식에서 원 미만을 절삭한다
		- 예정고지는 **직전 반기** 실적 기준이다. 매출이 절반기별로 달라면
		  당기 납부세액으로 예정고지를 다시 계산하면 실제 고지서와 어긋난다.
		  검증용으로 실제 고지서 금액을 별도로 보관하고 공식과 대조한다
	- **적립액 기준을 확인한다.** 적립액이 매출세액 기준이면 매입세액을 반영하지 않아
	  실제 납부세액보다 많이 쌓인다. 고지액 대비 비율을 함께 표기하고,
	  차액이 나면 "Filing 후 이체액"으로 안내한다 (카드공제분만이 아니다).
	- Filing 후 세금 계좌 잔액 전액을 투자금으로 이체
	- 한투 발행어음 CMA는 이자가 발생하나 Filing 전 인출하지 않는다
		- 사용자는 '기타 자산'으로 보는 운영 관점을 우선한다
		- 현금성 자산 포함 여부·총 현금 집계는 이 관점에 맞춰 일관화한다
	- **매입세액과 지출 목록을 대조한다** (`purchaseReconciliationGap`)
		- 매입세액 = 매입 공급가액 x 10/110 이므로 역산하면 매입 규모가 드러난다
		- 역산한 매입 규모가 지출 목록 합계보다 크면 지출 목록이 불완전하다
		- 업태와 실제 수입은 다를 수 있다. 업태만 보고 비용 성분을 추측하지 않는다
		  (예: 업태가 컴퓨터수리업이어도 실제 수입이 소프트웨어 개발 용역일 수 있다)
		- 성분을 확인할 수 없으면 임의로 분류하지 말고 '미분류'로 두고 양쪽 값을 모두 제시한다
		- `impliedPurchaseExVat` / `purchaseReconciliationGap` / `unclassifiedBusinessCost` /
		  `emergencyMonthsOnPurchases` 로 코드에 노출한다
		- 목록 합계가 매입 규모를 넘으면 성질이 반대이므로 `overStatedList`로 경고한다
		- 세금계산서로 확인된 매입 규모는 실재하는 사업 비용이므로,
		  목록 기준 수지/비상금은 낙관적인 값이다. 보수적 값을 함께 보여준다
		- 보수적 사업 비용은 `max(목록 합계, 역산 매입 규모)` 다. 작은 쪽을 쓰면
		  목록을 크게 고쳤을 때 비상금이 부풀려진다 (양쪽 값을 모두 만족해야 한다)
		- `impliedPurchaseExVat`은 **부가세 제외** 금액이다. 세금을 포함한 invoice
		  총액과는 다르므로, 비상금 분모에 순사업비용과 invoice 현금 중 무엇을 쓸지
		  §28.7에서 확정한다

- [ ] **지출 화면이 실제 값의 단일 출처다** (§28.10)
	- `expenses.html`에서 항목·금액·필수 여부·매입세액 공제 여부·미확정 항목을 편집한다
	- 대시보드와 설정은 값을 직접 들고 있지 않고 **계산 결과만** 읽는다
		- 설정의 월 필수지출은 읽기 전용이다. 지출 화면으로 링크한다
	- 파생값 계산은 데이터 계층 한 곳에 모은다
		- `AF.recompute()` : 항목 합계 → 필수지출 → 월 수지 → 비상금 → 매입 대조 순으로
		  전부 다시 계산한다. 화면마다 계산하지 않는다
		- `AF.storage.load()/save()/reset()` : 저장과 복구를 데이터 계층이 담당한다
		- `AF.seed` : 초기값 원본
	- 저장은 데이터 계층이 소유한다
		- 화면은 localStorage를 직접 다루지 않는다. `AF.storage`만 호출한다
		- **화면을 열기만 해서는 저장소가 생기지 않는다.** 값을 바꾼 뒤에만 저장한다
		- 항목 추가·삭제뿐 아니라 이름·금액·필수 여부·공제 여부·미확정 금액도 저장 대상이다
		- 이름이 바뀌면 그 항목의 다른 입력 `aria-label`도 함께 갱신한다
	- 저장값이 손상됐으면 무시하지 않고 초기값으로 되돌린다
		- JSON 파싱 실패·형식 불일치·빈 목록은 시드를 쓴다
		- 음수·NaN 금액은 0원으로 봉정하고, 불필요한 플래그는 기본값으로 채운다
		- 조용히 실패하면 "내 값이 반영 안 된다"는 버그로 이어진다
	- 목업은 localStorage(키 `assetflow.expenses.v1`)를 쓴다.
	  실제 구현에서는 이 계층을 서버 API로 교체하고 이력 관리를 붙인다
	- 값이 불완전함을 보여줘야 한다
		- 미확정 항목이 있으면 목표 달성으로 표시하지 않고 경고를 띄운다
		- 대시보드의 산식 설명은 미확정 항목이 있을 때만 "미반영"이라고 적는다.
		  금액이 확정됐으면 그 금액이 분모에 들어갔음을 함께 알린다
		- 매입 대조 결과(목록에 없는 비용 / 목록이 매입 규모 초과)를 항상 함께 본다

- [ ] **필수지출과 총지출을 구분한다** (§28.7)
	- 필수지출 합계와 전체 지출 합계는 다른 값이다. 둘 다 화면에 함께 보여준다
	- 선택지출(기부금 등)은 필수지출에서 빠지지만 월 수지에는 총지출로 반영된다
	- 어느 항목을 필수로 볼지 확정되면 지출 화면의 `essential` 플래그로 관리한다
	- 문서와 테스트 기대값은 항상 같은 기준을 쓴다. 한쪽만 고치지 않는다

- [ ] **지출 목록은 확정 가능한 세금을 포함한다** (§28.8)
	- 월 필수지출에 고용보험·종합소득세·지방세 등 recurring 세금을 포함한다
	- 고용보험은 `items`에 이미 들어 있다. 누락시키지 않는다
	- 납부 시점이 불규칙하거나 금액이 0원인 항목이 있으면 `expenses.notIncluded`에
	  `amount: null` 로 명시한다
	- 미확정 항목이 남아 있으면 "목표 달성"을 표시하지 않는다.
	  UI는 **"세금 미반영"** 경고를 띄운다 (0원을 임의로 넣어 지표를 조작하지 않는다)

## 29) 카드매입 엑셀 임포트 (2026-09-27 결정)

결정일: 2026-09-27
적용 범위: Issue 8(데이터 모델) ~ 이후 지출/매입 대조 전부

### 29.1 왜 카드 엑셀인가
지출 목록의 미분류 사업비용 1,466,247원을 매번 수작업으로 추정하지 않으려면
실제 카드 매입 내역이 필요하다. 그 출처는 카드사 엑셀이므로 임포트를 넣는다.

- 목적은 **매입 대조**다. 카드 엑셀의 매입세액 합계가 VAT 신고서의
  `purchaseTax`(월 320,000원)와 맞아야 지출 목록의 불완전성이 증명된다
- 카드사가 곧 정확한 지출 분류는 아니다. 업태와 실제 수입이 다를 수 있으므로
  가맹점명으로 자동 분류하지 않고 사용자 확인을 거친다

### 29.2 파싱 위치: FE 미리보기 + BE 검증
파서는 두 벌이지만 **판정 기준은 한 곳에 둔다.**

| 계층 | 역할 | 근거 |
|---|---|---|
| FE (SheetJS) | 표를 브라우저에서 파싱해 미리보기 | 원본 파일이 서버로 올라가지 않는다. 업로드 전 검토가 가능하다 |
| BE (Apache POI) | 정규화된 행 재검증 후 저장 | 신뢰 경계를 서버에 둔다. 조작된 미리보기로 데이터가 확정되지 않는다 |

- 컬럼 규격 `samples/card/card-columns.json`이 **단일 출처**다
- FE 파서와 BE 파서는 같은 규격 파일을 읽어 검증한다
- **규격을 고칠 때 양쪽 파서를 같은 PR에서 함께 고친다.**
  한쪽만 고치면 미리보기와 실제 저장 결과가 어긋난다
- **사용자가 확인·승인하기 전에는 BE가 어떤 값도 확정하지 않는다**

### 29.3 컬럼 규격 (`samples/card/card-columns.json`)
- 필수: `approvedAt` / `merchantName` / `supplyExVat` / `vat` / `grossAmount`
- **총 결제금액만 있고 공급가액·세액 분해가 안 되는 카드사는 미지원으로 명시한다.**
  임의로 나누면 매입 대조가 틀어진다 (§28.7 공급가액/공급대가 원칙과 동일)
- 선택: `installmentCount` / `approvalNo` / `taxKind` / `reversal`
- 행 역할(metadata/header/subtotal/grandTotal)을 구분한다.
  한국 카드 명세서에는 표가 아닌 행이 섞여 있고, **소계·총합 행을 합계에 넣으면
  매입 규모가 부풀려진다**
- `공급가액 + 세액 = 공급대가`를 행마다 검사한다. 어긋나면 저장하지 않고 보여준다
- 영세·면세 거래는 매입세액 0이므로 역산 매입 규모에 섞지 않는다
- 매입취소는 차감한다. 무조건 합산하면 매입 규모가 부풀려진다

### 29.4 카드사 프로파일은 추측하지 않는다
- `card-columns.json`의 `companies`는 **실제 샘플을 확인한 뒤에만** 채운다
- 카드사별 헤더 문자열·합계 행 표현을 그대로 적는다
- 형식을 미리 추측해 채우면 실제 파일과 어긋나고, 그 상태로 검증하면
  잘못된 파서가 "정상"으로 통과한다

### 29.5 샘플 보관과 익명화
- 위치: `samples/card/` (FE/BE 공용), 커밋 가능한 것은 `samples/card/anonymized/`
- **실제 명세서는 커밋하지 않는다.** 카드번호·회원명·가맹점명·승인번호를 제거한다
- 엑셀 문서 속성에 작성자명이 남으므로 저장 시 확인한다
- 실명 파일이 실수로 커밋되지 않도록 `.gitignore`에 차단 규칙을 둔다
- 원본은 로컬에만 두고, 커밋은 익명화 사본만 한다
- 조사를 돕는 `samples/card/tools/inspect-xlsx.mjs`를 둔다.
  외부 의존성 없이 zlib 내장 기능만으로 xlsx 를 읽는다
  (이 저장소에는 아직 pom.xml/package.json 이 없다)
- **샘플은 CI에서도 돌아간다.** 실제 파일 없이 합성 샘플
  (`anonymized/synthetic-sample.xlsx`)로 규격 대조를 검증한다

### 29.6 올바름 기준
- 파싱 결과의 월 매입세액 합계가 `purchaseTax` 320,000원과 맞는지 확인한다
- `impliedPurchaseExVat` 3,520,000원(월 매입 공급가액)과 어긋나면
  지출 목록에 빠진 비용이 있다는 §28.7 근거로 이어진다
- 중복 승인번호는 한 건만 반영한다
- 실패한 행은 조용히 버리지 않고 사용자에게 보여준다
