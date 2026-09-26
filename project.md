# 프로젝트 운영 기준 (AI + Agile)

## 1) 기술 스택
현행 기준 (레거시 호환):
Frontend:
- React 16
- TypeScript
- antd 4
- ag-grid 21
- webpack

Backend:
- Language: Java
- JDK: Java 17
- Framework: Spring Boot
- ORM / SQL Mapper: MyBatis
- Database: [Oracle / PostgreSQL / MySQL 등]
- Build Tool: Maven
- API: REST

권장 기준 (2026, 한국 실무 다수 패턴):
Frontend:
- React 18+
- TypeScript (strict)
- Vite (신규/개선 화면 우선)
- Next.js (SSR/SEO 요구 화면이 있을 때 선택)
- 상태 관리: TanStack Query + 최소 전역 상태
- UI: antd 유지 가능, 공통 컴포넌트는 Storybook으로 문서화

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