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
