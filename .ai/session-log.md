# 작업 진행 로그

시간순 작업 기록입니다. **영구 결정은 `.ai/project.md` 에 있습니다.** 여기엔
"지금 무엇을 했고 무엇이 남았는가" 만 적습니다.

- 항목 하나의 근거와 규약은 `project.md` 의 해당 장(§)을 따릅니다
- 새 항목은 위(최신)에 추가합니다
- 커밋 여부는 `git status` 로 확인합니다

> **이 파일 하나로 부족하다고 새 문서를 만들지 않습니다.** 기록할 곳이 없으면
> `project.md` 에 다음 장을 추가합니다. 판단 기준은 `project.md` §32 다.
> 문서의 성격은 **경로**로 구분합니다(§32.2). `.ai/` 루트에 새 파일을 늘리지
> 말고, 분류가 필요하면 전용 폴드를 만듭니다

---

## 2026-10-27 — 대시보드 지출 추이 (월별 대분류 스택 막대)

대시보드에 최근 1년 대분류 지출 추이를 스택 막대로 넣고, 년월~년월 범위 선택을 붙였다.
(결정 근거: project.md §57)

- 백엔드
  - `CardImportLedger.MonthlyCategoryTotal(month, category, gross)` 계약 추가
  - `PostgresCardImportLedger.monthlyCategoryTotals`: `GROUP BY` 1회, `저축/투자` 제외,
    빈/`unclassified` → `미분류`
  - `InMemoryCardImportLedger.monthlyCategoryTotals` + `nextMonth` 헬퍼
  - `GET /api/v1/assets/card-imports/monthly-categories?from&to` — `from<=to`, 36개월 상한 400
  - 테스트: `monthlyCategoriesAggregateByMonthAndExcludeAssetTransfers`,
    `monthlyCategoriesRejectBadRange`
- 프론트엔드
  - `dashboard/expenseTrend.ts`: `monthsBetween` · `buildExpenseTrend` · `lastMonthsRange` ·
    `formatMonthTick` · 카테고리 색 매핑
  - `components/ExpenseTrendChart.tsx`: recharts 스택 막대, 범례에 범위 합계
  - `DashboardPage`: `DatePicker.RangePicker picker="month"`, 기본 최근 12개월,
    별도 상태·재시도, 차트는 lazy 로딩
  - `theme/tokens.ts`: `--af-cat-*` 10색(라이트/다크)
  - `dayjs` 를 직접 의존성으로 추가(antd 전이 의존만 있던 상태)
  - 테스트: `expenseTrend.test.ts` 10건(연 경계·0 채움·합계·미분류 정렬·색 매핑)
- 검증: `./gradlew test bootJar`, `pnpm typecheck/lint/test/build` 통과(161 tests),
  운영 배포·헬스 OK
  - 운영 API 실호출 `from=2026-09&to=2026-10` → 9개 대분류 × 2개월, `저축/투자` 미포함 확인
- 고친 결함
  - 36개월 상한이 백엔드에서 **한 달 느슨했다**. 두 월의 차이만 세어 37개월(2023-10~2026-10)이
    통과했다. 양끝 포함 개월 수(`monthCountInclusive`)로 바꿔 36개월 허용 / 37개월 400 을
    테스트로 고정했다(`monthlyCategoriesAllowUpTo36MonthsInclusive`)
- 메모
  - antd v6 에서는 `rangePicker` prop 이 아니라 `DatePicker.RangePicker` 컴포넌트다
  - `tsconfig` 의 `noUncheckedIndexedAccess` 로 배열 접근 결과가 `undefined` 일 수 있다 —
    집계 헬퍼와 테스트 모두 `?? 0` 로 처리했다
  - 요약/현금흐름 재시도(`load`)가 추이 범위를 되돌리지 않도록, 추이 조회는 마운트 이펙트에서
    따로 1회만 부른다

---

## 2026-10-26 — 사업자 정보 모달 (bizno.net 수집·캐시)

사업자번호를 누르면 화면 이동 없이 사업자 정보를 보여준다. 백엔드가 bizno.net 을 읽어
`merchant_business_info` 에 캐시하고, 모달은 그 값을 표시한다. (결정 근거: project.md §56)

- 백엔드
  - `merchant_business_info` 테이블 + 마이그레이션(운영 적용 완료)
  - `BiznoScraper` (Jsoup): 라벨/값 표·dl·본문 텍스트 3단 파싱, "접속대기" 감지
  - 접속대기면 리더 폴백(`r.jina.ai`, `X-Respond-With: html`)으로 실제 페이지 HTML 수집
  - `MerchantBusinessInfoService`: 30일 캐시, 수집 실패 시 만료 캐시 반환
  - `GET /api/v1/assets/business-info/{businessNo}` → `503 / BIZNO_BUSY` 처리
  - 테스트: `BiznoScraperTest` (표·dl·평문·인라인 span·주소 정리·접속대기)
  - 실제 페이지 HTML 로 파서 출력 전 필드 일치 확인(임시 프로브, 저장소 미포함)
- 프론트엔드
  - `api/businessInfoApi.ts`, `components/BusinessInfoModal.tsx` (+ 테스트 2건)
  - 카드 표·미분류 정리 표의 사업자번호를 링크로 변경(여러 개면 각각)
  - 조회 실패 시 모달 안에서 재시도, 원문은 `bizno.net에서 열기`(새 탭)
- 검증: `./gradlew test bootJar`, `pnpm typecheck/lint/test/build` 통과, 운영 배포·헬스 OK
  - 운영 API 실호출: `2208155597`·`2028145602`·`4801702202` 200 OK(첫 호출 수집, 재호출 38ms 캐시)
  - `bigserial`/`Instant` 바인딩 오류(`Can't infer the SQL type`) 발견 → `Timestamp` 로 수정 후 재배포

---

## 2026-10-26 — 카드 내역 표에서 부가세 컬럼 숨김

사용자 요청으로 지출 화면의 카드 내역 표에서 **부가세 컬럼**을 제거했다.
공급가액·이용금액·업종·카테고리·사업자번호는 그대로 노출.
모바일 카드 리스트에서도 부가세 텍스트를 제거.

- 변경: `apps/frontend/src/pages/ExpensesPage.tsx`
- 검증: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 통과
- 배포: FE dist만 교체, 운영 정상

---

## 2026-10-26 — 가맹점 규칙 조회를 POST 로 변경

사용자가 `/card-imports/merchant-rules` 호출에서 `HTTP 400`을 받았다.
원인은 GET 쿼리스트링으로 긴 가맹점 목록(특수문자/공백 포함)을 본낼 때
Tomcat/Spring 이 요청을 거부한 것으로 추정.

- 백엔드: `CardImportController.merchantRules` 를 `@GetMapping` → `@PostMapping` 으로 변경
  - 요청 본문: `MerchantRulesRequest(List<String> merchants)`
- 프론트엔드: `getMerchantRules` 를 POST JSON body 로 변경
- 테스트 갱신: `CardImportApiTest`, `cardImportApi.test.ts`, `CardImportPanel.test.tsx`
- 검증: 백엔드/프론트엔드 테스트·빌드 통과, 운영 배포 후 POST 호출 200 OK 확인

---

## 2026-10-26 — 중복 재임포트 시 사업자번호/업종 채우기

사용자가 CSV 재업로드 후에도 `business_no`/`business_category`가 비어 있었다.
원인은 `rowKey`가 기존과 같아 `ON CONFLICT DO NOTHING`으로 무시되었기 때문.

- `PostgresCardImportLedger.addAll`: `ON CONFLICT DO UPDATE SET business_no/business_category`
  - 단, 기존 `business_no`가 비어 있을 때만 업데이트
- `InMemoryCardImportLedger.addAll`: 동일 정책 적용
- 배포 후 사용자가 같은 파일을 다시 업로드하면 기존 행의 사업자번호/업종이 채워짐

---

## 2026-10-26 — 미분류 정리에 업종·사업자번호 컬럼 추가

사용자가 미분류 정리 작업함에서 업종/사업자번호를 보고 분류 결정을 내리고 싶다고 해서
해당 컬럼을 추가했다.

- 백엔드 `UnclassifiedGroup` 에 `businessCategory`, `businessNo` 추가
- `PostgresCardImportLedger.unclassifiedGroups()` 에서 `STRING_AGG(DISTINCT ...)` 로 집계
- `InMemoryCardImportLedger.unclassifiedGroups()` 에서도 고유값 수집
- 프론트엔드 `UnclassifiedGroup` 타입 확장 + `ExpensesPage` 미분류 테이블에 컬럼 추가
- 검증·빌드·배포 완료

---

## 2026-10-26 — 카드 내역 표에서 공급가액 컬럼 숨김

사용자 요청으로 지출 화면 카드 내역 표에서 **공급가액 컬럼**도 제거했다.
이용금액·업종·대분류·세부분류·사업자번호만 노출.
모바일 카드 리스트에서도 공급가액 텍스트 제거.

- 변경: `apps/frontend/src/pages/ExpensesPage.tsx`
- 검증: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 통과
- 배포: FE dist 교체, 운영 정상

---

## 2026-10-26 — 카드 내역에 가맹점 사업자번호·업종 저장

사용자가 카드 원본을 다시 임포트하면 `business_no`/`business_category` 가 채워지도록
백엔드·프론트엔드·DB 계약을 함께 확장했다.

### 변경

- `samples/card/card-columns.json`
  - `businessNo` 필드 신규 (mapsTo 추가)
  - 삼성/현대 프로파일의 `사업자번호`/`사업자등록번호` mapsTo 를 `businessNo` 로 변경
- `apps/frontend/src/lib/card/parse-samsung.mjs` / `parse-hyundai.mjs`
  - `businessNo` 추출 시 하이픈 제거
  - 삼성은 `businessCategory` 그대로 추출
- `apps/backend/db/schema.sql` + 마이그레이션 `2026-10-26-add-business-info.sql`
  - `card_imports` 에 `business_no VARCHAR(20)`, `business_category VARCHAR(50)` 추가
- 백엔드
  - `CardImportLedger.ImportedRow` 에 `businessNo`, `businessCategory` 추가
  - `CardImportController.ImportRow` 에 동일 필드 추가
  - `PostgresCardImportLedger` / `InMemoryCardImportLedger` 읽기/쓰기/보존
- 프론트엔드
  - `CardImportRow`, `CardImportRowFull` 타입 확장
  - `CardImportPanel` 미리보기에 업종 컬럼 추가
  - `ExpensesPage` 카드 표에 업종·사업자번호 컬럼 추가, summary colSpan/index 조정
- 테스트 갱신: `CardImportApiTest`, `ExpenseSnapshotApiTest`

### 검증

- 백엔드: `./gradlew test bootJar` 통과
- 프론트엔드: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 통과
- DB 마이그레이션 적용 완료
- 운영 배포 완료 (assetflow.service 재시작, 헬스 OK)

### 다음 단계

- 사용자가 카드 원본 파일을 다시 업로드하면 `business_no`/`business_category` 가 채워진다.
- 업종/사업자번호 기반 자동 분류는 아직 연결하지 않았다 — 별도 기획 후 진행.

---

## 2026-10-26 — 가계부 카테고리 기준 도입 (§55.10)

사용자가 제시한 8개 그룹을 보완해 **9개 대분류 + 세부 분류** 체계로 확정하고
반영했다. 문서·커밋·배포까지 진행.

### 변경

- `docs/category-standard.md` 신규 — 가계부 카테고리 기준, 보충, 매핑, 출력 규칙
- `.ai/project.md` §55.10 등록
- `README.md` 에 `docs/category-standard.md` 색인 추가
- 백엔드
  - `CategoryTaxonomy` (9그룹/세부/고정비/자산이동)
  - `CategoryClassifier` → `Classification(category, subCategory)`
  - `CategorySeedData` 9그룹 키워드 시드
  - `CardImportController`, `CardImportLedger`, `MerchantRuleLedger` 대분류+세부 처리
  - DB 마이그레이션 `2026-10-26-category-groups.sql`, `schema.sql` 에 `sub_category` 컬럼 추가
- 프론트엔드
  - `expenseCategories.ts` 9그룹 + 세부 + 고정비/자산이동 헬퍼
  - `CardImportPanel` 대분류·세부 각각 선택
  - `ExpensesPage` 대분류/세부 컬럼, 카테고리별 합계(고정비/변동비/자산이동), CSV 다운로드
- 테스트 갱신: `CardImportApiTest`, `InMemoryCategoryClassifierTest`, `ExpenseSnapshotApiTest`,
  `cardImportApi.test.ts`, `CardImportPanel.test.tsx`, `ExpensesPage.test.tsx`, `expenseCategories.test.ts`

### 검증

- 백엔드: `./gradlew test bootJar` 통과
- 프론트엔드: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 통과
- 운영: DB 마이그레이션 적용 후 `POST /card-imports/reclassify` 실행 → 2,710행 중 **2,078행** 재분류
- 운영 현황: 분류된 지출 합계 81,511,418원 / 고정비 14,560,434원 / 변동비 66,950,984원 / 자산 이동 332,900원 / 미분류 177건 2,684,813원

---

## 2026-10-26 — 미분류 정리 진행 상황 + 키워드 보강안

사용자가 미분류 작업함에서 직접 정리했다. 하루 만에 **267묶음 → 143묶음**으로 줄었다.
코드 변경 없이 현재 상태와 다음 자동 분류 후보만 기록한다.

### 현재 (2026-10-26)

| 항목 | 10/25 밤 | 10/26 |
|---|---|---|
| 미분류 행 | 487 | **224** |
| 가맹점 묶음 | 267 | **143** |
| 미분류 금액 | 8,824,788원 | **3,324,178원** |

- 143묶음 중 **107개가 1건짜리** — 남은 작업의 대부분이 단발성 가맹점
- 저장된 `merchant_rules` **142개** — 여기서 지정한 가맹점은 다음 임포트부터 자동 적용
- 상위 미분류: 한국정보통신-코어솔루션 11건 205,360원 · 나이스-이지피쥐 7건 113,500원 ·
  (주)케이원 피에스 92,500원 · 코지하우스처인점 91,500원 · 로드1950 2건 85,100원

### 키워드 보강안 (미적용 — 검토용)

| 카테고리 | 추가 후보 | 근거 |
|---|---|---|
| 식비 | 농협하나로, 본죽, 더벤티, 코이라멘, 솔솥, 카츠랩 | 하나로마트·분식/카페 프랜차이즈 |
| 여가/취미 | 벌툰, 볼링, 방방, 피나클랜드, 사진관 | 만화카페·오락·테마파크·사진관 |
| 쇼핑 | 미니골드, aliexpress | 주얼리·해외 직구 |

- 적용하면 **14묶음 / 16행 / 351,905원**이 자동 분류될 것으로 예상 (현재 데이터 기준)

**넣지 말아야 할 것**
- `나이스`, `갤럭시아머니트리`, `세틀뱅크`, `토스페이먼츠`, `다우데이타`, `한국정보통신` 등
  PG/VAN 사업자명은 실제 구매처를 가리지 않는다 → 키워드로 묶으면 다른 결제까지 오분류된다
- `OPENCODE`, `PADDLE.NET` 은 사업비용/기타 판단이 필요해 자동 분류에서 제외
- legacy `사업비용` 3건의 분류 기준은 아직 정하지 않았다

### 남은 것

- [x] 위 키워드 보강안 적용 여부 결정(적용 시 재분류 1회) — **2026-10-26 00:19 적용 완료**
- [ ] 1건짜리 가맹점 107개는 키워드보다 수동 처리가 빠름 — 작업함에서 금액 큰 순으로
- [ ] 카테고리별 월 집계 API·화면(§55.8.3) — 여전히 없음

### 적용 결과 (2026-10-26 00:19)

- `CategorySeedData` 4차 키워드 13개 추가: 식비 6(농협하나로·본죽·더벤티·코이라멘·솔솥·카츠랩),
  여가/취미 5(벌툰·볼링·방방·피나클랜드·사진관), 쇼핑 2(미니골드·aliexpress)
- 재배포 후 `POST /card-imports/reclassify` → 2,710행 중 **16행** 갱신
- 미분류 **224행/143묶음/3,324,178원 → 208행/129묶음/2,972,273원** (예상치와 일치)
- PG/VAN 사업자명은 계속 수동 분류 대상으로 남김

---

## 2026-10-25 — 미용·의류 카테고리 추가 + 기존 카드 재분류

"카테고리에 미용/의류가 있나?" — 없었다(11종). 살롱미담 19건 1,579,000원이 미분류로
남아 있었고 옷가게는 쇼핑에 섞여 있어, 둘을 분리했다 (§55.8.7).

### 변경

- `CategorySeedData`: 기본 카테고리 **13종** (쇼핑 뒤에 `미용`, `의류`)
  - 미용 키워드: 살롱·미용·헤어·네일·에스테틱·왁싱·속눈썹·바버샵·뷰티
    - `피부`는 제외 — `피부과`(의료비)와 겹친다
  - 의류 키워드: 의류·패션·무신사·유니클로·자라·신발·아울렛·에이블리·스쿨룩스·폴햄·휠라
    - 쇼핑에 있던 무신사·에이블리·스쿨룩스·폴햄·휠라를 의류로 이동(시드 upsert)
- `src/data/expenseCategories.ts` 13종 동기화 + `expenseCategories.test.ts` 신규

### 검증

```
cd apps/backend && ./gradlew test     # BUILD SUCCESSFUL (85)
cd apps/frontend && pnpm typecheck / lint / test  # 144 passed (17 files)
cd apps/frontend && pnpm build        # index-TqU7gsCB.js
```

### 배포·재분류

- 재배포 후 부팅 시드 적용: `expense_categories` 13종, 키워드 27개 추가/갱신 확인
- `POST /card-imports/reclassify` → 2,710행 중 **47행** 갱신
  - 살롱미담 19건 1,579,000원 → **미용**
  - 의류 28건 1,243,149원 (에이션패션 등) → **의류**
  - 미분류 작업함 274 → **267묶음**
- 참고: 사용자가 `merchant_rules` 로 이미 지정한 가맹점은 규칙이 우선이라 자동으로 안 바뀐다

---

## 2026-10-25 — 미분류 정리 작업함 + 카드 표 필터/페이지 유지

미분류 559행/274가맹점을 한 건씩 고치면 목록이 새로 조회되며 페이지를 잃는 문제.
검색으로 확인한 패턴(Monarch `Edit Multiple`, YNAB payee 자동 적용, "Needs review" 큐,
표는 수정 후 재조회하지 않는다)을 참고해 **가맹점 단위 작업함(B) + 표 필터/페이지 유지(A)** 로 정리했다.

### 백엔드 (§55.8.6)

- `CardImportLedger.UnclassifiedGroup` + `unclassifiedGroups()`
  - Postgres: `merchant_name` GROUP BY, `SUM(gross_amount)` DESC
  - InMemory: 같은 규칙을 메모리에서 집계 (테스트용)
  - 미분류 = `NULL` / `''` / legacy `'unclassified'`
- `clearExpenseKindByMerchant(merchantName)` — 되돌리기용, 행 전체를 `''` 로
- `MerchantRuleLedger.delete(merchantName)` — 되돌릴 때 저장 규칙도 삭제
- `GET /api/v1/assets/card-imports/unclassified`
- `PATCH /api/v1/assets/card-imports/merchant-category` `{merchantName, category}`
  - 빈 `category` = 되돌리기(행 전체 미분류 + 규칙 삭제)
- `CardImportApiTest`: 묶음 집계·정렬, 일괄 지정, 되돌리기 3건 추가 (총 85)

### 프론트엔드

- `ExpensesPage` 상단 **미분류 정리** 섹션
  - 진행률 `정리한 가맹점/처음 가맹점`, 남은 가맹점·건수·금액, 금액 큰 순
  - 가맹점 이름 검색, 페이지 10개, 행마다 카테고리 Select → PATCH
  - 지정 즉시 목록에서 사라지고 알림 카드의 **되돌리기**로 복원
- 카드 표: **미분류만 보기** 체크박스(건수 표시), 승인일·가맹점·이용금액 정렬,
  페이지 상태를 컴포넌트가 소유
- 카테고리 수정은 재조회 없이 해당 가맹점 행만 로컬 갱신 → 페이지·스크롤 유지
- `cardImportApi`: `listUnclassifiedGroups()`, `assignMerchantCategory()` + 타입
- 테스트: API 2건(경로·본문·되돌리기 빈 값), 화면 3건(작업함 지정/되돌리기,
  미분류 필터, 데스크톱 2페이지에서 수정 후 재조회 없음·페이지 유지) — 총 142

### 검증

```
cd apps/backend && ./gradlew test     # BUILD SUCCESSFUL (85)
cd apps/frontend && pnpm typecheck    # 통과
cd apps/frontend && pnpm lint         # 통과
cd apps/frontend && pnpm test         # 142 passed
cd apps/frontend && pnpm build        # 성공 (index-DwM2PKtP.js)
```

### 배포·실호출

- 홈서버 재배포 (BE jar + FE `index-DwM2PKtP.js`), `/health` UP
- `GET /card-imports/unclassified` → 274묶음, 금액 DESC(네이버페이 37건 1,658,960원 → …)
- `PATCH /merchant-category`: `홍콩반점` 1행 지정 → 273묶음, 규칙 저장 → 되돌리기 →
  274묶음 복원, `expense_kind=''`, `merchant_rules` 0건

### 남은 것

- [ ] 사용자 실제 화면 확인(작업함에서 정리 → 되돌리기 → 표 필터)
- [ ] 카테고리별 월 집계 API·화면(§55.8.3) — 아직 없음

---

## 2026-10-25 — 카드 내역 카테고리 자동 분류 (규칙 + 키워드)

카드 내역이 많아 수동 분류가 부담이라는 요구(§55.8.4). LLM 없이 규칙 기반으로
가맹점 규칙 → 키워드 → "미분류" 순서로 분류하고, 기존에 등록된 카드 내역도
한 번에 재분류할 수 있게 했다.

### 백엔드

- `expenses/categories` 패키지 신설: `CategoryClassifier` + Postgres/InMemory 구현
  - 1순위 `merchant_rules`(사용자가 지정한 가맹점), 2순위 `merchant_category_keywords`
  - 반환값은 카테고리 **이름** — 기존 `expense_kind` 계약을 그대로 쓴다
- `CategorySeedData`: 기본 카테고리 10종과 키워드 시드. `CommandLineRunner` 라
  분류기 생성자보다 늦게 돈다 → 분류기는 키워드를 지연 로드한다
- `GET /card-imports/merchant-rules?merchant=`: 저장 규칙 + 키워드 제안 병합
- `POST /card-imports`: 분류가 비어 있으면 자동 분류 결과로 채움
- `POST /card-imports/reclassify`: 기존 카드 행 일괄 재분류, `{total, updated}` 반환
- `PATCH /card-imports/category` `{rowKey, category}`: 한 행을 고치면 **같은 가맹점 행 전체**가 바뀌고
  `merchant_rules` 에 저장돼 다음 임포트에도 적용된다
- `schema.sql` + `db/migrations/2026-10-25-add-category-classification.sql`:
  `merchant_rules.category_id`, `card_imports.category_id`, `monthly_expense_items.category_id`,
  `merchant_category_keywords` 추가

### 프론트엔드

- 미리보기는 기존 `merchant-rules` 호출을 그대로 쓴다 — 서버가 키워드 제안까지
  섞어 주므로 추가 호출 없이 자동 선택된다
- 카테고리 선택지 10종 + legacy 3종(`src/data/expenseCategories.ts`)
- 지출 화면 "가져온 카드내역" 옆 **카테고리 자동 분류** 버튼 → reclassify → 목록 재조회
- 카드 표의 카테고리 셀이 Select 로 바뀌어 행마다 직접 수정 가능(→ PATCH)
- 이 달 카드 사용금의 **카테고리별 합계** 표 추가
- 열 이름 "용도구분" → "카테고리" (저장 컬럼은 `expense_kind` 그대로)

### 검증

```
cd apps/backend && ./gradlew test          # BUILD SUCCESSFUL
cd apps/frontend && pnpm typecheck          # 통과
cd apps/frontend && pnpm lint               # 통과
cd apps/frontend && pnpm test               # 137 passed
cd apps/frontend && pnpm build              # 성공 (index-BO5deL05.js)
```

- 추가 테스트: `InMemoryCategoryClassifierTest`(5), `CardImportApiTest`(제안·재분류·카테고리 수정 6),
  `ExpensesPage`(재분류 버튼), `CardImportPanel`(키워드 제안 채움), `cardImportApi`(2)

### 배포·데이터

- 홈서버 DB 마이그레이션 적용, FE/BE 재배포 (index-DXRuw2nu.js)
- 부팅 시드: 카테고리 11종, 키워드 177개
- 기존 카드 2,710행 재분류 — 미분류 2,073 → **678행**
  - 식비 1,056 · 교통비 292 · 쇼핑 227 · 의료비 157 · 통신비 85 · 여가/취미 80 ·
    주거비 53 · 보험료 40 · 교육비 33 · 기타 8 · 경조사비 1
- 실호출 확인: `POST /reclassify`(1,253 → 150 → 6행 갱신), `PATCH /category`(가맹점 12행 갱신 + 규칙 저장),
  없는 rowKey → 400

### 남은 것

- [x] 홈서버 DB 마이그레이션 적용 + 재배포 (2026-10-25 22:12)
- [ ] 배포 후 실제 카드 내역에서 재분류 버튼 동작 확인(사용자 확인 예정)
- [ ] 카테고리별 월 집계 API·화면(§55.8.3) — 아직 없음
- [ ] `category_id` 쓰기 경로 — 지금은 `expense_kind` 문자열만 채운다

---

## 2026-10-24 — 정기 항목 금액·필수·세액 변경도 연결 행에 소급 + 재배포

사용자 추가 제보("정기 항목 수정 맥엔피씨임대료 동작 안됨"): 금액을 200,000 → 2,000,003 으로
바꿔도 2026-10 월 행이 여전히 200,000 으로 남아 있음.

### 원인

§45.2 가 "금액은 이후 달에만 반영"으로 돼 있었고, 구현도 정말로 미래 달에만
적용했다. 사용자 입장에서는 정기 항목 금액을 바꾸면 당연히 연결된 월 행도
따라야 한다고 봄.

### 수정 (PR #105)

- 정기 항목의 `amount`/`isEssential`/`purchaseVat` 변경 시, 아직 수동으로 바꾸지 않은
  연결 월 행에도 소급
- 수동 오버라이드 판정: 월 행의 amount·isEssential·purchaseVat 이 **모두** 정의의
  예전 값과 같으면 새 값으로 갱신, 하나라도 다륾면 그 행은 "이 달만 수정"으로 보존
- §45.2 문서 반영
- `RecurringExpenseApiTest.amountChangePropagatesToUntouchedRowsOnly` 추가

### 배포·데이터 정리

- 홈서버 재배포 완료
- `recurring_id=1` 이고 `amount=200000` 이던 23개 월 행을 `2000003` 으로 일괄 갱신
  (수동으로 바꾼 행은 없었음)

### 검증

- `GET /api/v1/expenses/items?month=2026-10` → `맥엔피씨임대료` 2,000,003원
- BE `./gradlew test` PASS, FE `pnpm test` 131 PASS, `pnpm build` PASS

---

## 2026-10-24 — 서비스 식별/동기화 헛점 추가 수정 + 재배포

사용자 의견("이런 헛점이 많을 것 같은데 서비스마다 확인이 필요")에 따라 전체
백엔드를 점검하고 추가 수정·재배포를 했다.

### 추가 수정 (PR #103)

| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| 1 | `Postgres/InMemoryExpenseItemLedger.copyMonth` | 중복 판단을 `label`만 함 | `recurring_id` 기준도 추가 |
| 2 | `InMemoryExpenseItemLedger.ensureRecurringRows` | Postgres 와 dedup 정책 불일치 | 같은 `label`이면 무조건 skip (Postgres 와 동일) |
| 3 | `PostgresExpenseItemLedger.update` | 반환 객체에 `recurring_id`가 null | 기존 `recurring_id` 보존 |
| 4 | `AssetAccountController` | `invest` 계정 타입 변경/삭제 시 보유종목 동기화 누락 | 타입 변경 가드 400, 삭제 시 `deleteByAccountId` cascade |
| 5 | `AssetLedger` | `byId` 메서드 없음 | 추가 (Postgres/InMemory) |

### 검증

- BE `./gradlew test` PASS
- FE `pnpm test` 131 PASS, `pnpm build` PASS
- 홈서버 재배포 완료 — `/health` UP, `/api/v1/me` 200, 지출/자산 API 정상

### 남은 점검 항목

- `PostgresInvestmentLedger.seedIfEmpty` 가 계정을 `name` 문자열로 찾는 부분은
  1회성 마이그레이션/시드이므로 현재 운영에는 영향 없음. 향후 시드 구조 변경 시
  안정적인 식별자 사용 검토.

---

## 2026-10-24 — 정기 항목 이름 변경 버그 수정 + 운영 데이터 정리 + 재배포

사용자 제보("월 지출 항목 정기 항목 수정 시 행이 추가됨")를 받아 원인을
분석하고 수정·재배포·데이터 정리를 했다.

### 원인

- `ensureRecurringRows` 가 `(user_id, month, label)` 로만 중복을 판단
- 정의 이름을 바꾸면 기존 `recurring_id` 와 연결된 행은 무시되고, 새 이름 행이
  INSERT 되어 **중복 발생**
- 정의 수정이 월 행 이름에 전혀 반영되지 않음

### 수정

| 범위 | 내용 |
|---|---|
| BE | `ensureRecurringRows` — `recurring_id` 우선 매칭, 수동 행은 label 우선 |
| BE | `PUT /api/v1/expenses/recurring/{id}` — 이름 변경 시 연결된 월 행 소급(금액·필수·세액은 시점값 유지) |
| FE | 정의 금액과 다른 행에 "이 달만 수정" 배지, 정기 항목 수정 폼에 힌트 |
| 문서 | §45.2 개정: 멱등 조건 및 이름 소급 규칙 기록 |
| 테스트 | `RecurringExpenseApiTest` 3건 추가, `ExpensesPage.test.tsx` 1건 추가 |

### PR / 배포

- PR #100(JWT_SECRET 매핑 누락) · PR #101(정기 항목 수정 버그) main 머지
- 홈서버 재배포 완료 — BE jar + FE `index-DL4L9JsB.js`

### 운영 데이터 정리

- `monthly_expense_items` id=180 중복 행 삭제
- `recurring_id=1` 인 `임대료` 행 23건 → `맥엔피씨임대료` 200,000원으로 일괄 변경
- 백업: `/tmp/opencode/cleanup_before.sql`

### 검증

- `GET /api/v1/expenses/items?month=2026-10` — `맥엔피씨임대료` 200,000원 1걸음, 중복 없음
- `GET /api/v1/expenses/recurring` — `맥엔피씨임대료` 200,000원
- `./gradlew test bootJar` PASS, `pnpm test` 131 PASS, `pnpm build` PASS

---

## 2026-10-24 — Sprint 5 홈서버 배포 + 배포 후 스모크 23/23 PASS (JWT 매핑 버그 수정)

Sprint 5 머지분을 홈서버 운영 환경에 배포하고 스모크를 돌렸다. 스모크 중 운영
`JWT_SECRET` 이 실제로 적용되지 않는 버그를 발견해 함께 고쳤다.

### 배포

| # | 작업 | 결과 |
|---|---|---|
| 1 | BE `bootJar`(테스트 포함) | `assetflow-backend-0.0.1-SNAPSHOT.jar` (48.9MB) |
| 2 | FE `pnpm build` | `dist/` — `assets/index-CMqwnAFT.js` |
| 3 | 스테이징·교체 | `/tmp/opencode/deploy` → 백업(`app.jar.bak-20261024-103738`, `backup-frontend-20261024-103738/`) 후 jar 원자적 교체, `assetflow.service` 재시작, FE rsync |

### 발견·수정 — JWT_SECRET 무시

- `TokenService` 는 `@Value("${app.jwt-secret:}")` 를 읽는데 `application.yml` 에 매핑이 없어
  **부팅마다 랜덤 키**가 생성됐다. 운영 `JWT_SECRET` 은 계속 무시되고, 재시작 때마다 모든 토큰이 무효화됐다.
- `application.yml` 에 `jwt-secret: ${JWT_SECRET:}` 추가 → 재빌드·재배포 → 발급 토큰으로 `/api/v1/me` 200 확인.

### 스모크 결과 (23/23 PASS)

| 영역 | 확인 |
|---|---|
| 인프라 | `systemctl is-active`=active, `/health`=UP, `/api/v1/me`=owner |
| 스키마 | `investment_holdings` 테이블 생성 확인 |
| 투자 API | 임시 invest 계좌(예수금 1,000,000) + 종목(2주×100,000) → 총액 1,200,000 · 평가액 200,000 |
| 연동 | 대시보드 invest 행 = 계좌 총액 1,200,000, 자산 계좌 `balance` 는 예수금 유지 |
| E4 | 현재가 150,000 갱신 → `priceAsOf` 2026-10-24, 총액 1,300,000 |
| 원복 | 임시 계좌·종목 삭제, 보유종목 0건 복귀 |
| FE | title·새 번들 HTTP 200·`investments` 라우트 포함·`#/investments` 딥링크 200 |

### 운영 데이터 상태 (스모크 후)

- `asset_accounts` 5건(cash 3·realty 2), 투자 계좌 **0건**, `investment_holdings` **0건**
- 즉 투자 화면은 **빈 상태**로 뜬다. 로그에 적힌 invest 시드(31,000,000·23,500,000)는
  운영 DB 에 존재하지 않는다(과거 삭제됨). 예수금 전환 로직은 해당 행이 없어 동작하지 않는다.

### 남은 것

- [ ] 실브라우저 확인 — `#/investments` 진입·종목 추가·가격 갱신, 좁은 화면 레이아웃
- [ ] 라벨 자동화 수정 — OAuth 토큰 `workflow` 스코프 필요 (`gh auth refresh -s workflow`)

---

## 2026-10-24 — Sprint 5 완료: 투자 포트폴리오 E1~E4 (#95~#98)

Sprint 5 범위 E1~E4 를 모두 머지했다. CI 3잡(quality/frontend/backend) PASS, Blocker/Critical 0.

### 무엇을 했나

| PR | 이슈 | 내용 | 검증 |
|---|---|---|---|
| #95 | #90 E1 | `investment_holdings` 스키마·원장(인메모리/Postgres)·CRUD API, `PortfolioService` 총액 | BE 58건 |
| #96 | #91 E2 | `#/investments` 화면 — 요약·필터·계좌 그룹·자산군 도넛·추가/편집/삭제 | FE 128건 |
| #97 | #92 E3 | 자산 화면 invest 행을 총액으로 표시, 편집을 투자 화면으로 위임 | FE 129건 |
| #98 | #93 E4 | 현재가 인라인 일괄 갱신·기준일, 코인 소수·HALF_UP 회귀 | FE 130건 · BE 60건 |

### 계약·결정 반영
- invest 계좌 `balance` = **예수금**. 총액 = 예수금 + Σ(수량×현재가×환율) — 저장하지 않음 (§54.3)
- 기존 운영 DB: holdings 가 비어 있고 balance 가 옛 시드값(3,100만·2,350만)과 **정확히 같을 때만** 예수금으로 전환
- 대시보드 구성비·월 확정 총자산·자산 화면이 같은 `PortfolioService` 총액을 소비 — 이중 계상 없음
- 기준선 유지: invest 31,000,000 / 23,500,000, 월 확정 총자산 761,200,000
- 가격 갱신은 변경분만 PUT, 저장 시 `priceAsOf` = 오늘 (시세 API 는 범위 밖 §54.6)

### 남은 것
- [ ] **홈서버 배포** — sprint 종료 시 수동. BE bootJar + FE dist 교체, `sudo` 단계는 사용자 실행 (DEPLOY.md·2026-10-24 배포 항목과 같은 절차)
- [ ] **배포 후 스모크** — `#/investments` 진입·종목 추가/가격 갱신·자산 화면 총액 일치·대시보드 31,000,000/23,500,000 확인
- [ ] 라벨 자동화 수정 — OAuth 토큰 `workflow` 스코프 필요 (`gh auth refresh -s workflow`)

---

## 2026-10-24 — Sprint 5 착수: 투자 포트폴리오 (E1~E4 이슈 등록)

사용자 지시("스프린트 5 진행")로 §53 후보 E 를 Sprint 5 범위로 확정하고, §54 설계를 기준으로
이슈 4건을 등록했다.

### 무엇을 했나

| # | 이슈 | 내용 |
|---|---|---|
| E1 | #90 | `investment_holdings` 스키마·CRUD API |
| E2 | #91 | `#/investments` 화면 |
| E3 | #92 | 자산·대시보드 투자 총액 연동 |
| E4 | #93 | 현재가 갱신 UX·회귀 테스트 |

- `sprint:5` 라벨 생성 후 4건에 적용
- §53 제목을 "스프린트 5 작업표"로 개정하고 §53.5 실행 범위 추가
- 이슈 라벨 자동화는 여전히 `sprint:1` 하드코딩 — 이슈 생성 직후 `sprint:1` 을 제거했다.
  수정안은 준비했으나 OAuth 토큰에 `workflow` 스코프가 없어 푸시가 거부됐다(사용자 조치 필요)

### 남은 것

- [x] E1(#90) 구현 착수 → E1~E4 완료 (#95~#98)
- [ ] 라벨 자동화 수정 — `gh auth refresh -s workflow` 후 푸시

---

## 2026-10-24 — 투자 포트폴리오 화면 설계 확정 (§54) · Sprint 5 후보 E 등록

사용자 요청("투자된 계좌·주식·채권·코인을 넣을 페이지")에 대해 현재 모델과 프로토타입의 간극을
확인하고 화면 위치·저장 구조·계산 계약을 확정했다. 구현은 보류한다(§53.4).

### 무엇을 했나

| 항목 | 결정 |
|---|---|
| 화면 위치 | `#/investments` 신설 + 자산 화면의 자산·투자 탭. 전역 nav 4개 유지 |
| 저장 구조 | `asset_accounts`(invest) = 계좌·예수금, 신규 `investment_holdings` = 종목 |
| 예수금 | invest 계좌의 `balance` = 예수금. 총액 = balance + Σ평가액 (저장 안 함) |
| 자산군 | stock · etf · bond · fund · **crypto** |
| 계산 | 원금·평가액·손익·수익률·비중 전부 파생, 원 단위 HALF_UP 1회 |
| 범위 | 시세·환율 API, 채권 경과이자, 세금, 과거 복원 제외 |

### 근거 확인

- `schema.sql` — `asset_accounts` 는 4유형 + BIGINT `balance` 하나뿐이라 종목을 담을 자리가 없다
- `design/prototype/assets.html` — 수량·평단가·평가금액·수익률(PRD 5.2/5.3)은 이미 있다
- IA 맵 — `/simulation`(시나리오)만 있고 **보유종목 화면은 없음**
- `StandardNav` — 4개 항목, 모바일 13px·nowrap 이라 5번째 확장은 보류

### 남은 것

- [ ] E1~E4 이슈 등록·착수는 Sprint 5 확정 시(§53.3)
- [ ] 기존 invest 시드(키움 31,000,000 · 미국주식 23,500,000)를 예수금+종목으로 재구성 — E1
- [ ] 프로토타입 `INVEST_CLASSES` 에 crypto 추가 — E2

---

## 2026-10-24 — 홈서버 FE·BE 배포 (Sprint 4 결과 반영)

Sprint 4 머지분(main `dfd34f0`)을 홈서버 운영 환경에 배포했다. 서버에서 직접 빌드·스테이징한 뒤
sudo 단계만 사용자가 실행했고, 배포 후 헬스·정적 자산·타이틀을 재확인했다.

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | BE 빌드 | 시스템 JRE 에 javac 가 없어 `JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-21-amd64-linux.2` 로 빌드 → `assetflow-backend-0.0.1-SNAPSHOT.jar` (48.9MB) |
| 2 | FE 빌드 | `pnpm build` → `dist/` (title `AssetFlow — 가계부·자산관리`, 해시 라우팅 포함) |
| 3 | 스테이징 | `/tmp/opencode/deploy/{app.jar,dist}` + `deploy-assetflow.sh` (백업 → jar 원자적 교체 → 재시작 → 헬스 대기 → FE rsync → 검증) |
| 4 | 배포 | `sudo bash /tmp/opencode/deploy-assetflow.sh` (사용자 실행) — jar 교체 후 `assetflow.service` 재시작, FE 를 `/opt/assetflow/frontend` 로 rsync |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| BE 헬스 | `curl http://127.0.0.1:8080/health` | `{"status":"UP"}` · `systemctl is-active assetflow` = active |
| FE 타이틀 | `curl -k --resolve ... https://redbox9.iptime.org/` | `<title>AssetFlow — 가계부·자산관리</title>` (한국어 반영) |
| 새 번들 | `/assets/index-D1EksHsi.js` · `index-Yn_P6Oaf.css` | HTTP **200** |
| 롤백 자산 | `app.jar.bak-20261024-002450` · `backup-frontend-20261024-002450/frontend` | 존재 확인 |

### 남은 것

- [ ] **실브라우저 확인** — 해시 딥링크 새로고침(`#/assets` 등)·키보드 뒤로가기·탭 제목 변화는 jsdom 밖 실측이 필요하다
- [ ] 이전 항목에서 이어진 것: 화면 캡처, 스크린리더 실측
- [x] **다음 스프린트 확정** — 후보 12건을 §53 에 기록 → 2026-10-24 Sprint 5 = E(투자
      포트폴리오)로 확정, 이슈 #90~#93 등록

---

## 2026-10-23 — Sprint 4 착수: 로그인 한국어화(#74) · 대시보드 6개월 현금흐름(#73) · URL 동기화(#72)

열린 Sprint 4 이슈 3건을 **독립 브랜치 3개**로 처리했다. 선행 조건인 PR #75(백엔드 현금흐름
실스냅샷)는 브랜치를 최신화해 CI 3잡 통과 후 머지했다.

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | PR #75 최신화·머지 | `feat/dashboard-cashflow-snapshot-data` → main. BE `cashflow` 가 확정 스냅샷을 서빙(§46.5) |
| 2 | #74 로그인 화면 한국어화 | `LoginPage` 카피를 프로토타입 `login.html` 과 일치 · `validate.ts` 메시지 한국어 · `index.html` title · `htmlFor`/`id` + `aria-invalid` + `aria-describedby`(도움말·오류). 영문 잔존 검사 테스트 추가 |
| 3 | #73 대시보드 정적 값 제거 + 6개월 현금흐름 | `metrics.cashAccountCount()` 로 "현금 N계좌" 계산 · `metrics.cashflowWindow()` 로 최근 6개월 창 생성, 행 없는 월은 `confirmed:false` → 화면 "미확정"(0원·mock 으로 메우지 않음) · `AssetsPage`·`CardImportPanel` 의 `toLocaleString` 포맷을 `formatKrwExact()` 로 통일 · §35.5 기록 |
| 4 | #72 URL 상태 동기화 | `app/routes.ts`(해시 경로·제목 단일 출처) + `App` 이 `pushState`/`popstate`/`hashchange` 로 화면 동기화 · 새로고침·딥링크·뒤로가기 · `aria-current` 가 URL 과 같은 출처 · 로그인 후 원래 경로 복귀 · 미지 해시는 `#/` 로 정규화 · §52 기록 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| FE 타입·린트 | `pnpm typecheck` · `pnpm lint` | PASS · PASS |
| FE 테스트 (#74) | `pnpm test` | 13파일 **106건** PASS (기존 103 + 신규 3) |
| FE 테스트 (#73) | `pnpm test` | 13파일 **109건** PASS (기존 103 + 신규 6) |
| FE 테스트 (#72) | `pnpm test` | 14파일 **112건** PASS (기존 103 + 신규 9) |
| FE 빌드 | `pnpm build` | 3개 브랜치 모두 성공 (기존 chunk 크기 경고만) |
| CI | PR #75 · #82 · #83 · #84 | quality/frontend/backend 게이트 전부 PASS |
| 머지 후 통합 | main 에서 `pnpm test` | **14파일 121건** PASS (세 브랜치 테스트가 함께 돈다) |
| 이슈 라벨 자동화 | #76 smoke 재검증 (새 이슈 #85 생성) | run success · `sprint:1`·`status:ready` 적용 확인 → #76·#85 종료 |

### 남은 것

- [x] **PR 3건 머지** — #82(로그인) → #83(대시보드) → #84(URL 동기화) 순서로 최신화·머지.
      각 PR 은 머지 전 strict 규칙 때문에 `update-branch` 후 CI 를 다시 통과했다
- [ ] **실브라우저 확인** — 해시 딥링크 새로고침, 키보드 뒤로가기, 탭 제목은 jsdom 한계로 실측 필요
- [x] **#76 CI smoke 이슈 정리** — 과거 `issues:opened` 실패는 쉼표 구분 라벨을 한 이름으로
      취급한 탓이었고, `actions/github-script` 로 교체된 수정은 새 이슈 #85 로 검증했다(라벨 적용 확인)
- [ ] 이전 항목에서 이어진 것: 화면 캡처, 스크린리더 실측

---

## 2026-10-23 — 프로토타입 비상금 저장 복구 + FE 접근성 AA 정합성 (#70) + 모바일 헤더 잘림

세 작업을 **독립 브랜치 3개**로 나눠 커밋하고 **PR 3건 생성·CI 전부 통과**했다 (각각 main 기준 — `fix/mobile-header-wrap` · `fix/settings-emergency-save` · `feat/a11y-issue-70`).

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 모바일 헤더 잘림 | `AppLayout` 헤더 모바일 `flexWrap: wrap` + `height: auto`/`minHeight 48` (데스크톱 64 유지) |
| 2 | `settings.html` 비상금 입력 무동작 (이전 남은 것) | 목표 개월 input 이 **어떤 폼 안에도 없었다** → `<form id=emergencyForm>` 감싸기 · 저장/취소 버튼 · 1~24 정수 검증(오류 경고+aria-invalid) · `d.emergency.targetMonths` 갱신 후 `AF.recompute()` · 상태라인(role=status) 표시. 프로필 폼도 id 로 찾도록 교정 — `querySelector("form")` 은 첫 폼에만 묶여 **두 번째 폼 저장을 놓쳤다**. 프로필 저장값은 `d.user` 에 반영하고 취소 시 그 값으로 복원 (기본 리셋은 JS 주입 readonly 필드를 비우므로 preventDefault) |
| 3 | 프로토타입 회귀 테스트 신규 | `tools/test-settings-page.mjs` **70건** (문서 구조 원문 검사 · 저장 · 검증 · 복원 · 폼 분리), `run-all.mjs` 에 4번째 스위트로 등록 |
| 4 | #70 현재 페이지 내비 | `StandardNav`: `disabled` → `aria-current="page"` + 잉크색(--af-foreground)·굵기. 대비 재계산 **16.01:1(라이트) / 14.51:1(다크)** · 링크 slate **6.13 / 6.00:1** · 구 disabled 색 **3.49:1** (이슈 실측과 일치 — 미달이었음이 재확인) |
| 5 | #70 제목 체계 | 4개 화면 h1 정확히 1개(대시보드·자산·지출·설정, 24px — 프로토타입 page-title 과 동일) + 섹션 h4→h2(시각 16px 유지) + MetricCard 제목 h3 (프로토타입 h3.card__label 체계와 일치) |
| 6 | #70 키보드 요소 | 정기 칩 `span onClick` → **실제 `<button type=button>`** (✕ 중지 버튼은 형제로 분리 — button 안의 button 제거). 지출 행 액션 접근 이름에 항목명 결합 ("부가가치세 이 달만 수정") — "편집" ×5 중복 라벨 해소 |
| 7 | #70 알림·표 | 지출 notice `role=status aria-live=polite`, 오류 블록·카드 오류 `aria-live=assertive`(role=alert 유지), 카드 안내 role=status. antd 표 4개 `aria-label`, 원시 표 3개 `aria-labelledby` + `th scope="col"` (CompositionDonut 범례는 이미 aria-label 보유) |
| 8 | #70 스킵 링크·랜드마크 | 문서 첫 `<a href="#main">본문으로 건너뛰기</a>` + `<main id="main" tabIndex=-1>`, `.af-skip-link` (포커스 전 -9999px, 포커스 시 좌상단 + 링) |
| 9 | a11y 통합 테스트 | `src/app/AppA11y.test.tsx` **16건** — h1 개수(4화면)·aria-current·대비(토큰에서 WCAG 공식 직접 계산해 고정)·스킵 링크 순서·칩 button 동작·액션 이름 결합·알림 role/aria-live·표 접근 이름 4종 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 프로토타입 | `node design/prototype/tools/run-all.mjs` | **4/4 스위트 PASS** (513건) |
| FE 타입·린트 | `pnpm typecheck` · `pnpm lint` | PASS · PASS |
| FE 테스트 | `pnpm test` | **13파일 103건 전부 PASS** (기존 87 + 신규 16) |
| FE 빌드 | `pnpm build` | 성공 (경고는 기존 chunk 크기·동적 import 관련만) |
| 대비 | WCAG 공식을 토큰 hex 에 직접 계산, 테스트로 고정 | 16.01 / 14.51 / 6.13 / 6.00:1 — 전부 4.5:1 이상 |

기존 테스트 2건은 접근 이름이 바뀐 것을 반영하지 못해 깨진 것이었다: `CardImportPanel`(안내 → role=status), `ExpensesPage`(행 액션 이름에 항목명 결합). 둘 다 새 시맨틱에 맞춰 갱신했다 — 규칙을 억지로 되돌리지 않았다.

### 남은 것

- [x] **3개 브랜치 푸시 + PR 생성** — `gh auth setup-git` 으로 git HTTPS 인증 연결 후 푸시. **PR #79(접근성, Closes #70) · #80(모바일 헤더) · #81(프로토타입 비상금 저장)**. PR #79 본문에 대비 계산 결과(16.01/14.51/6.13/6.00:1)·테스트 결과 첨부
- [x] **CI quality-gate** — 3개 PR 전 게이트(backend·frontend·quality·label) **전부 PASS** (frontend-gate: 103 테스트)
- [ ] **PR 3건 머지** — 리뷰어 승인 대기 (CONTRIBUTING: Blocker/Critical 0이면 머지 가능). 머지 순서는 #80 → #81 → #79 가 안전하다 (AppLayout 충돌 가능성; 실제로는 병합 무충돌·103건 PASS 확인済)
- [ ] **실브라우저 키보드/스크린리더 실측** — jsdom 한계. 스킵 링크 첫 Tab · 포커스 링 · NVDA/보이스오버 낭독은 배포 후 수동 확인이 필요하다 (AC "이동할 수 있다/읽힌다" 의 실측)
- [ ] 이전 항목에서 이어진 것: 화면 캡처, 대시보드 재시도 버튼 비활성 (이번 범위 밖)
- [ ] settings.html 비상금 저장은 세션 내 반영이다 — 프로토타입 localStorage 정책은 지출·자산만 저장하는 기존 규약 유지 (새로고침 시 시드 복귀)

---

## 2026-10-21 — 상위 10개 저장소 스킬 2차 설치 (59종 추가, 누적 88종)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 10곳 저장소 실물 스캔 | `SKILL.md` 158개 발견 → 실제 배포 대상 147개 (테스트 픽스처 5 · ponytail 중복 6 제외) |
| 2 | 도구 종속 판정 | **88개(60%)는 특정 CLI/앱 없이는 동작 불가** — OmniRoute 52 · Orca 11 · deepseek-harness 22 · archify 2 → **제외** |
| 3 | 전역 설치 | mattpocock 38 · deepseek office 8 · ponytail 6 · archify 3 · diagram-design 1 · watermarks-remover 2 · MoneyPrinterTurbo 1 = **59종 추가** (누적 **88종**) |
| 4 | ID 충돌 해결 | mattpocock `prototype` → **`throwaway-prototype`** (기존 Emil Kowalski `prototype` 와 폴더명 충돌) |
| 5 | 자체 스킬 | `workflow-playbook`(엔진/문서 라우팅 인덱스) — `design-playbook` 짝 |
| 6 | 런타임 추가 | `openpyxl` `pandas` `numpy` `python-docx` `python-pptx` `Pillow` `playwright` + Chromium |
| 7 | `remove-ai-marks` 자립화 | 업스트림에 없는 `service/scripts/` 46개를 스킬 폴더에 동봉 (전부 표준 라이브러리만 사용) |
| 8 | 자동 호출 정리 | 배치 2에서 21종에 `metadata.opencode/autoinvoke: false` 추가. 그중 8종은 업스트림이 이미 숨긴 상태였다. **누적 숨김 42개 · 노출 47개** |
| 9 | 문서 | `project.md` §51 · `AGENTS.md` 코드맵 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 설치 완결 | 디렉터리 대조 | 59/59 존재 · 전부 `SKILL.md` 보유 · 전부 `LICENSE.upstream` 보유 |
| frontmatter | 전수 파싱 | 이름 중복 0건 · frontmatter malformed 0건 · **노출 47 / 숨김 42** (OpenCode 목록과 일치 확인) |
| `archify` | `archify.mjs render` (번들 예제) | 806KB HTML 생성 · `check` → `ok: true`. **`npm install` 불필요** |
| `diagram-design` | `export_png.py` (Playwright) | 6.3KB PNG 생성. 입력 SVG 에 `viewBox` 가 없으면 실패(설계대로) |
| `clean-user-facing-text` | `inspect_text.py --audit --json` | U+200B·U+00A0 탐지 확인 |
| `remove-ai-marks` | `service/scripts/audit_dir.py <dir> --json` | `suspicious_text` 1건 검출 (호스팅 서비스 없이 로컬 동작) |
| `office` (xlsx) | `openpyxl` 로 `samples/card/anonymized/synthetic-sample.xlsx` | 1시트 12행×8열 · 한국어 헤더 정상 |
| OpenCode 인식 | 스킬 목록 | 자동 노출 47종 + 내장 2종(`opencode` `report`) · 숨김 42종 (숨겨도 ID 지정 호출은 가능) |

### 남은 것

- [ ] **LibreOffice sidecar 미설치** — `office-export-pdf` `office-render` `office-recalculate` 는 PDF 변환/렌더/재계산 불가
- [ ] `office` 계열의 docx/pptx/pdf 경로 **미검증** (xlsx 읽기만 실측)
- [ ] `dsh-*` 16종이 제외되어 아깝다 — description 이 "DeepSeek Harness" 를 명시하기 때문
- [ ] 스킬 업데이트 절차 여전히 없음 — 2차 배치도 업스트림 스냅샷
- [ ] `setup-matt-pocock-skills` 를 돌리지 않은 상태다 — `triage` `to-spec` `to-tickets` `wayfinder` 는 `docs/agents/` 레이아웃을 전제한다
- [ ] **Python PATH 반영**: 레지스트리(HKCU\Environment)에는 `Python313\` 이 `WindowsApps` 보다 **앞**에 있다.
      그래서 **새 터미널**에서는 `python` → 3.13.15 로 정상 해석된다(Store 스텁이 밀린다).
      **하지만 이미 떠 있는 opencode 서비스는 옛 PATH 를 물려받는다.**
      → **새 터미널을 연 뒤** `opencode service restart` 해야 한다.
      옛 터미널에서 그대로 실행하면 옛 PATH 를 물려받아 또 Store 스텁이 잡힌다
- [ ] 스킬 스크립트는 PATH 를 믿지 말고 **절대 경로**로 부른다 (playbook 에 절대경로를 적어 둠)
- [ ] **세션의 시스템 프롬프트는 시작 시점 스냅샷** — 스킬 숨김 변경은 새 세션에서만 반영됨

---

## 2026-10-21 — 디자인 스킬 스위트 29개 설치 (전역) + Python 3.13 도입

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 출처 8곳 실물 확인 | UI UX Pro Max · Vercel web-design-guidelines · Emil Kowalski · taste-skill · Hallmark · Impeccable · Anthropic frontend-design · Awesome Opus 5.5 videos |
| 2 | 전역 설치 | `C:\Users\H\.config\opencode\skills\` — 업스트림 27개 + 자체 2개 = **29개 폴더(16.7MB)** |
| 3 | 런타임 확보 | Python 3.13.15(winget user scope) — ui-ux-pro-max 검색 CLI 의 선행 조건. Node v24.22.0 는 기존 |
| 4 | OpenCode 호환 패치 | `ui-ux-pro-max/SKILL.md` 의 `${CLAUDE_PLUGIN_ROOT}` 11곳 → 스킬 상대 경로(`scripts/search.py`) |
| 5 | 자체 스킬 2종 | `awesome-opus-videos`(프롬프트 703건 + 검색 스크립트 `scripts/search.mjs`) · `design-playbook`(라우팅 인덱스) |
| 6 | 라이선스 보존 | 스킬 폴더마다 `LICENSE.upstream` |
| 7 | 자동 호출 정리 | Swift/React Native/Sonner 3종에 `metadata.opencode/autoinvoke: false` 추가 (업스트림이 이미 숨긴 3종과 합쳐 6종 숨김) |
| 8 | 문서 | `project.md` §50 · `AGENTS.md` 코드맵 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| 스킬 인식 | opencode 스킬 목록 | 23종 자동 노출 + 6종 숨김(명시 호출은 가능) + 자체 2종 노출 = 29 |
| ui-ux-pro-max 검색 | `search.py "personal finance dashboard" --domain style` | `data-dense-dashboard` 등 3건 반환 |
| ui-ux-pro-max 디자인 시스템 | `search.py "personal finance planning dashboard" --design-system -p AssetFlow` | 패턴·스타일·색·토큰 생성 |
| awesome-opus-videos | `search.mjs "dashboard animation" --limit 2` | 2건 매칭, 프롬프트·링크 출력 |
| taste-skill | `draw.mjs --list sectors` · `lint.mjs` | 섹터 14종 출력 · 저장소 대상 lint 동작 |
| impeccable | `impeccable.cmd context` | projectRoot `D:\study\assetflow` 인식 (PRODUCT.md 없음 경고는 정상) |

### 남은 것

- [ ] 팀 공용 설치가 필요해지면 저장소 반영 방식 결정 (§50.6) — 현재는 이 PC 전용
- [ ] 스킬 업데이트 절차 없음 — upstream 을 수동으로 다시 가져와 덮어써야 한다
- [ ] `taste-skill` 린트가 지적한 모노스페이스 2건(`src/theme/tokens.ts`) vs §28.2 충돌 여부 판정
- [ ] Python PATH 반영: 새 터미널은 자동, **이미 떠 있는 opencode 서비스는 `opencode service restart` 필요**
- [ ] `ui-styling` 은 antd 6 이 아닌 shadcn/Tailwind 전제 — 패턴 참고로만 쓸 것 (§50.5)

---

## 2026-10-21 — 잉크(ink) 팔레트 테마 교체 + 다크 모드 (FieldRank 참고)

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 참고 사이트 분해 | fieldrank.run 3개 페이지의 CSS 청크(87KB)를 직접 받아 `:root`/`.dark` 토큰 72개 + 타이포/레이아웃/컴포넌트 규칙 추출 |
| 2 | FE 토큰 모듈 | `apps/frontend/src/theme/tokens.ts` — `AF_COLORS`(라이트/다크 2세트) · `createAfTheme(mode)` · `afCssVars()`. **원시 색상값의 단일 보유처**(§28.2/§28.4) |
| 3 | 테마 스토어 | `src/theme/themeStore.ts` — `assetflow.theme` 키 · 기본 `system` · `useSyncExternalStore` 구독 · matchMedia 부재 시 light 폴백 |
| 4 | 다크 모드 UI | 헤더(로그아웃 옆) 토글 버튼 — 인라인 SVG 해/달, `aria-label`/`aria-pressed`, 라이트↔다크 2상태 |
| 5 | 하드코딩 색 제거 | `app.css` · `AppLayout` · `CompositionDonut` · `MobileListCard` · `ExpensesPage` · `.storybook/preview.tsx` → `var(--af-*)` 33종 |
| 6 | 접근성 보정 | 포커스 링(`colorPrimaryBorder` = ring) 3:1 확보 · `borderStrong` 라이트 `#807b71`/다크 `#7d786f` · 다크 3·4단계 텍스트 `#969186` · 로그인 버튼 hover/active 전용 토큰 · 네이티브 컨트롤 `:focus-visible` |
| 7 | 테스트 | `src/theme/theme.test.tsx` 8건(저장·복원·토글·system 폴백·다크 시나리오) |
| 8 | 문서 | `.ai/project.md` §28.2 색상 토큰 확정 · §28.4 다크 모드 MVP 제외 해제 · §28.5 대비 기준·조정값 · §28.6 잔여 위험 |
| 9 | 설정 화면 결함 | 비상금 기준 카드의 도움 문장("지출 화면의 '필수' 항목 합계 · 월 확정 시 스냅샷에 저장")이 카드 밖으로 넘침. 원인 = antd 인라인 폼(`flex: none` + `control` max-content). Form.Item `flex: 0 1 320px` + 문장 `maxWidth 260`/`whiteSpace: normal` 로 줄바꿈 처리 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| FE 테스트 | `pnpm test` | 82건 PASS (기존 74 + 신규 8) |
| FE 타입 | `pnpm typecheck` | 클린 |
| FE lint | `pnpm lint` | 클린 |
| FE 빌드 | `pnpm build` | 성공 |
| Storybook | `pnpm build-storybook` | 성공 (다크 스토리 포함) |
| 하드코딩 색 | grep `hex`/`rgba` | `src/theme/tokens.ts` 밖 **0건** |
| 미정의 CSS 변수 | 사용 vs 정의 대조 | 0건 |
| 프로토타입 | `node design/prototype/tools/run-all.mjs` | PASS (3/3) — 프로토타입 무변경 |

### 남은 것

- [ ] 커밋/PR (사용자 확인 후) — 미추적 3파일(`themeStore.ts`·`theme.test.tsx`·`MobileListCard.tsx`) 포함 필수
- [ ] 브랜치 정리 — 워킹 트리가 `feat/merchant-rule-inheritance` 에 있고 이번 작업과 무관한 백엔드 5파일 변경이 섞여 있음
- [ ] 다크 모드 육안 확인 (Storybook `대시보드/핵심카드--다크모드`, 앱 헤더 토글)
- [ ] `design/prototype/common/tokens.css` 정렬 (FE 토큰과 동일 값으로) — 별건
- [ ] `colorPrimaryBorder` 전역 오버라이드 — Slider/DatePicker/Notification 도입 시 재검토
- [ ] Storybook a11y addon 도입 (§28.5 미이행 항목)

---

## 2026-10-20 — #49 카드 가맹점 용도구분 자동 승계 구현

### 무엇을 했나

| # | 작업 | 산출물 |
|---|---|---|
| 1 | 이슈 정리 | GitHub #36, #37, #38, #44, #48, #53 CLOSE (이미 머지된 Sprint 3 작업) |
| 2 | DB 스키마 | `apps/backend/db/schema.sql` 에 `merchant_rules` 테이블 추가 (§49) |
| 3 | BE 원장 | `MerchantRuleLedger` 인터페이스 + `InMemoryMerchantRuleLedger` + `PostgresMerchantRuleLedger` |
| 4 | BE API | `GET /api/v1/assets/card-imports/merchant-rules`, POST 시 자동 적용·저장 |
| 5 | FE 미리보기 | `CardImportPanel` 이 파싱 후 `/merchant-rules` 호출 → Select 자동 채움 |
| 6 | 문서 | `.ai/project.md` §49 추가 |

### 검증

| 대상 | 방법 | 결과 |
|---|---|---|
| BE 테스트 | `gradlew test` | PASS (CardImportApiTest 3건 추가) |
| FE 테스트 | `pnpm run test` | 74건 PASS |
| FE 타입 | `tsc --noEmit` | 클린 |
| FE lint | `eslint src` | 클린 |
| FE 빌드 | `vite build` | 성공 |

### 남은 것

- [ ] 커밋/PR 생성 필요 (사용자 확인 후 진행)
- [ ] 운영 DB에 `merchant_rules` 테이블 적용 필요 (`schema.sql` 또는 ALTER)
- [ ] `.ai/` 추적되지 않은 스크린샷 25개 정리 필요

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
- [x] DB 백업 자동화 설치
- [x] #36 프론트 완료
- [x] 월 지출 항목 UI 정리(사용자 피드백)
- [x] 지출 화면 모바일 UX(사용자 피드백 2차)
- [x] 모바일 카드 배지 정렬(사용자 피드백 3차)
- [x] #48 정기 항목 UI 완료
- [x] 지출 항목 PUT 500 수정(사용자 제보)
- [x] 고정지출 변환 기능(사용자 요청 §45.5)
- [x] 변환 UX 개선(사용자 피드백)
- [x] #53 메뉴 일관화
- [x] #38 401 자동 로그아웃 UX
- [x] #37 설정 화면 이관
- [x] 모바일 헤더 깨짐 수정(사용자 피드백) — 브랜드 14px·내비 13px·간격 축약·헤더 높이 48px·nowrap·overflow hidden — 360px에서 한 줄 유지(§35 축약 원칙). 테스트 70건 PASS·배포 — SettingsPage(프로필·비상금 기준·계정 요약 사이드바) + StandardNav에 설정 추가(4 페이지) + me 실검증(users 테이블 반환 — JWT subject 일치) + 스냅샷↔대시보드 연동(summary.monthly: AS_OF 월 스냅샷 있으면 실데이터, 없으면 모크 폴백). users.target_months 컬럼. BE 테스트 46건·FE 73건 PASS·배포. 라이브 최종 확인은 사용자 자격증명으로 브라우저에서 수행 예정 — apiFetch 가 401 에서 토큰 정리 + assetflow:unauthorized 이벤트 발화, App 이 이벤트를 받아 로그인 화면 즉시 전환(어떤 화면에서든). 1시간 토큰 만료 시 재로그인 유도 완성(Known Issues 5 해소). 테스트 70건 PASS·배포 — StandardNav 신설: 세 화면 모두 "대시보드·자산·지출" 동일 구성·순서, 현재 화면은 비활성+굵게로 식별, 로그아웃 우측 고정. 자산 화면에도 지출 진입 버튼. FE 테스트 69건 PASS·빌드·배포 — 변환을 서버 연산으로: POST /items/{id}/convert-to-recurring 이 정의 생성+행 링크(linkRecurring)를 1클릭으로. 명칭 통일: "고정지출로 등록"→"정기 항목으로 등록"(정기 항목 수정과 동일 용어). 변환된 행은 recurringId 세팅 → 배지와 버튼이 "정기 항목 수정"으로 전환. BE 테스트 45건·FE 69건 PASS·배포 — 월 항목(수동 행)의 "고정지출로 등록" 작업: 행의 값(항목·금액·필수·매입세액·시작월)이 채워진 정기 폼 열림 → 저장 시 정의 생성. 현재 월은 같은 label 행이 있어 자동 등록과 중복되지 않음(다음 달부터 정기 배지). 테스트 69건 PASS·배포 — PostgresExpenseItemLedger.byId 의 SELECT 에 recurring_id 컬럼 누락(이전 다중 치환 실패 잔존)이 map 읽기와 불일치 → 500. 컬럼 추가로 교정. PR #59 병합·배포·라이브 재현(항목 9 갱신 200) 완료. **교훈: 다중 문자열 치환의 성공 판정은 바꾼 지점 자체를 검사해야 한다(인접 지점만 검사하면 무소득 치환이 통과됨)** — 정기 항목 관리 섹션(칩 목록·기간 폼: 시작월/종료월-무기한, 칩 클릭 편집·✕ 정기 중지), 표/모바일 카드의 정기/수동 배지, 작업의 "이 달만 수정/정기 항목 수정" 2계단, 빈 월의 지난달 복사 배너(§45.4 멱등). FE 테스트 71건 PASS·tsc/lint/빌드 클린·홈서버 배포. PR #57 병합. 라이브 검증은 이미 완료(정기 등록→2026-11 조회 시 자동 등장 recurringId 배지) — 라벨+필수 배지를 왼쪽 그룹(inline-flex·gap 6·세로 중앙)으로 묶고 금액은 우측 고정 — 사이 정렬 해소 — 필수 요약 셀에서 "필수" 텍스트 제거(금액만), 입력 폼 줄바꿈 간격 적용(flex gap 10/12), md 미만에서 두 표를 카드형 리스트로 전환(6열 표는 좁은 폭에서 읽을 수 없음 — 항목별 카드 + 더보기 20건 단위, 합계는 요약 행 유지). 테스트 65건 PASS·배포 — 명칭 "목록 합계"→"합계", 필수 요약 셀 3줄 줄바꿈 해소(라벨+금액 2단 스택·nowrap), 입력란 세로 정렬 수정(antd Form component={false} 제거 — inline 레이아웃 클래스 부재가 원인). 테스트 65건 PASS·배포 — ExpensesPage(월 지출 항목 CRUD 표 + 수입 입력·월 확정 §44 + 가져온 카드내역 표 §41) + 지출 내비게이션. FE 테스트 65건 PASS, 빌드·홈서버 배포, 외부 HTTPS에서 POST/GET/DELETE 실호출 검증 완료(검증행 정리)
- [x] 스프린트 3 시작
- [x] 월별 카드 원장 조회 배포 완료 — PR #42 병합 후 발견된 SQL 문법 오류(date ?::date)는 PR #43으로 교정·병합·배포. 라이브 스모크: GET /assets/card-imports?month=2025-01 → 실제 데이터(2025-01 토스페이먼츠 등) 반환 확인 — 계획(§41 카드 임포트 명세 기록·§42 스프린트 3 작업표·§43 월 지출 항목 API 명세) + 이슈 #36·#37·#38 등록. #36 백엔드 완료: monthly_expense_items 스키마 + ExpenseItemLedger 원장 3종 + CRUD API(§43), 테스트 34건 PASS, PR #39 병합. 라이브 500 발견·수정: 테이블이 postgres 소유라 assetflow 계정에 권한 없음(42xxx→BadSqlGrammar) — 소유권 이전으로 해소, POST/GET 200 확인·스모크 행 정리. **교훈: 운영 DB에 스키마를 적용할 때는 앱 계정(assetflow)으로 실행하거나 소유권을 즉시 이전** — 홈서버 cron(매일 03:15, /etc/cron.d/assetflow-backup → /opt/assetflow/backup.sh), 백업 /var/backups/assetflow(7일분 보관). 첫 백업 실행·복원 검증 완료(임시 DB 복원 → users 1·accounts 2·imports 1341 일치, 오류 0)
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
