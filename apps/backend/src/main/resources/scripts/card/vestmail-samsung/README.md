# 삼성카드 VestMail 이메일 명세서 추출기

AssetFlow 백엔드에서 호출하는 Node.js 보조 스크립트입니다. 삼성카드가 보내는
**「삼성카드이용상세내역서(엑셀 다운로드 가능)」** 메일의 VestMail 암호화 HTML
첨부를 Playwright 브라우저에서 복호화하고, 12컬럼 거래 표를
`samples/card/card-columns.json` 규격의 JSON으로 변환합니다.

## 왜 별도 추출기인가

현대카드 추출기(`vestmail-hyundai`)와 같은 VestMail 이지만 폼과 결과물이 다릅니다.

| | 현대카드 | 삼성카드 |
|---|---|---|
| 복호화 폼 | `input[name=p2_temp]` + `input#password` + `alt="보안메일 확인"` | `#decForm` + `#password` + `#confirm` |
| 복호화 후 | 원본 DOM 안에 거래 표가 남음 | `document.write()` 로 **문서 전체 교체** |
| 이용일 | `MM.DD` → 연도 추정 필요 | `YYYY-MM-DD` 완전형 |
| 사업자번호·업종 | 없음 | 표에 포함 (§67 자동 분류에 바로 사용) |
| 표 구조 | 컬럼 사이 빈 `td` | 12컬럼, 단 **table 중첩** |

`doAction()` 은 HTML 안의 base64 인코딩된 스크립트 블록에 들어있는 **순수
JavaScript** 입니다. 외부 ActiveX/플러그인이 필요 없어 headless Chromium 에서
그대로 복호화됩니다. (초기 분석에서 "외부 플러그인 의존"으로 보였던 것은 이
base64 블록을 보지 못했기 때문입니다.)

## 어떤 메일을 쓰는가

삼성카드는 두 종류의 메일을 보냅니다.

- **`이용상세내역서`** (`sscyber@samsungcard.com`) — ✅ 수집 대상.
  암호화 페이로드 6청크(약 58KB)에 실제 거래 표 + 암호화 XLSX 첨부.
- **`이용대금 명세서`** (`billing@samsungcard.com`) — ❌ 제외.
  페이로드 1청크(약 1KB)라 요약/안내문일 가능성이 큼.

XLSX 첨부는 `d0cf11e0` 매직바이트의 ECMA-376 암호화 문서입니다. 프로젝트
정책(§29.5.1)상 사용자가 직접 입력한 비밀번호 없이는 열지 않으므로 **쓰지
않습니다**. HTML만 복호화합니다.

> **한계 — 완전 자동은 아니다**: 이 메일 본문에 "회원님이 요청하신 …",
> "조회 가능 기간 60일 … 기간이 지난 경우 재신청" 이라고 명시돼 있다.
> 즉 **정기 발송이 아니라 삼성카드 앱/홈페이지(또는 ARS 1599-8700)에서
> 기간을 지정해 요청할 때 1회 발송되는 서류**다. 스케줄러는 새 메일이
> 없으면 같은 메일을 다시 읽고 `rowKey` 중복 제거로 끝난다.
> 새 거래를 넣으려면 원하는 기간으로 내역서를 다시 이메일 신청해야 하며,
> 그 뒤 AssetFlow 가 "지금 수집" 또는 1일 2회 스케줄로 자동 반영한다.
> 진짜 실시간/무인 수집이 필요하면 상용 API(CODEF/바로빌)가 별도로 필요하다.

## 설치

```bash
./install.sh          # npm install + Playwright Chromium
```

운영에서는 `deploy.sh` 가 `/opt/assetflow/scripts/card/vestmail-samsung` 에
복사하고 설치하며, `VESTMAIL_SAMSUNG_SCRIPT_DIR` 환경변수를 자동 등록합니다.

## 사용법

```bash
SAMSUNG_VESTMAIL_PASSWORD=<password> \
  node extract-samsung-vestmail.mjs <input.html> --contract=samples/card/card-columns.json
```

- 비밀번호는 `--password=` 또는 `SAMSUNG_VESTMAIL_PASSWORD` 환경변수.
  **틀리면 재시도 없이 즉시 실패**합니다(벤더 alert 을 그대로 보고).
- `--contract` 는 생략하면 개발 트리의 `samples/card/card-columns.json` 을 찾습니다.
  운영에서는 Java 가 classpath 계약을 임시 파일로 뽑아 절대 경로를 넘깁니다.
  **헤더 이름을 스크립트에 하드코딩하지 않고 계약에서 읽습니다.**
- stdout 으로 `{ source, extractedAt, count, rows }` JSON을 출력하고,
  `<input>_extracted.json` 파일도 씁니다.

## 출력 행

```
approvedAt, merchantName, grossAmount, vat, supplyExVat,
cardMasked, approvalNo, businessNo, businessCategory, memberRelation
```

`rowKey` 는 CSV 수동 업로드(`parse-samsung.mjs`)와 같은 조합
`approvedAt|merchantName|grossAmount|vat|approvalNo|cardMasked` 를 써서
이메일 수집과 업로드 사이에서 같은 거래가 중복 저장되지 않게 합니다.

## 보안

- 비밀번호는 파일이나 커맨드라인 인자에 남기지 않습니다(`ps` 노출 방지).
- 복호화된 HTML/거래 데이터는 브라우저 메모리에만 있고, stdout/출력 파일에는
  정규화된 행만 나옵니다.
- 실제 명세서 파일은 저장소에 커밋하지 않습니다. 익명화된 픽스처만
  `fixtures/` 에 둡니다.
