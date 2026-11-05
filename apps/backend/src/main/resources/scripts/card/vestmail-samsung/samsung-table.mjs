/**
 * 삼성카드 VestMail 복호화 후 DOM에서 거래 행을 뽑는 함수.
 *
 * 이 함수는 Playwright `page.evaluate()` 안에서 실행된다. 따라서 **모듈 스코프의
 * 값이나 import 를 참조하면 안 된다** — Playwright 는 함수 소스만 직렬화해
 * 브라우저로 보낸다. 모든 도우미는 함수 안에 둔다.
 *
 * 컬럼 계약은 호출부가 `card-columns.json` 의 `companies.samsungcard.columns`
 * 에서 만들어 `{ 정규화된헤더명: 필드명 }` 형태로 넘긴다. 헤더 이름을 여기에
 * 하드코딩하지 않는다(단일 출처 규칙).
 *
 * 삼성 명세서는 table 이 중첩돼 있다. `tr.querySelectorAll('td,th')` 를 쓰면
 * 바깥 <tr> 이 자손 셀 200여 개를 모두 물고 와 헤더로 오인된다. 반드시
 * **직계 자식 셀**만 본다.
 *
 * @param {Record<string,string>} mapping 정규화된 헤더명 → 필드명
 * @returns {Array<object>} 정규화된 거래 행
 */
export function extractSamsungRows(mapping) {
  const normalize = (value) => String(value == null ? "" : value)
    .replace(/\s+/g, "")
    .toLowerCase();

  const directCells = (tr) => Array.from(tr.children)
    .filter((c) => c.tagName === "TD" || c.tagName === "TH");

  const cellText = (cell) => {
    const text = cell.innerText == null ? cell.textContent : cell.innerText;
    return String(text == null ? "" : text).trim();
  };

  const parseAmount = (value) => {
    const cleaned = String(value == null ? "" : value).replace(/[^0-9-]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = Number.parseInt(cleaned, 10);
    return Number.isNaN(n) ? null : n;
  };

  // 헤더 행은 표의 몇 번째 줄에 있어도 찾는다. 여러 표(발행정보·합계·거래)가
  // 함께 있으므로 "이용일 + 가맹점명 + 이용금액" 을 모두 갖춘 행을 고른다.
  const allRows = Array.from(document.querySelectorAll("tr"));
  let headerIndex = -1;
  let col = null;
  for (let i = 0; i < allRows.length; i++) {
    const cells = directCells(allRows[i]).map(cellText);
    // 컨테이너 <tr> 은 직계 셀이 1~3개뿐이다 — 계약 컬럼 수 범위로 걸러낸다.
    if (cells.length < 3 || cells.length > 40) continue;
    const found = {};
    cells.forEach((text, index) => {
      const field = mapping[normalize(text)];
      if (field && found[field] === undefined) found[field] = index;
    });
    if (found.approvedAt !== undefined
        && found.merchantName !== undefined
        && found.grossAmount !== undefined) {
      headerIndex = i;
      col = found;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new Error("삼성카드 거래 테이블 헤더를 찾지 못했습니다(이용일/가맹점명/이용금액).");
  }

  const at = (cells, field) => col[field] === undefined ? "" : (cells[col[field]] || "");
  const rows = [];
  // 중첩 표를 포함해 문서 순서대로 훑되, 컨테이너 행은 값 판별에서 걸러진다.
  for (let i = headerIndex + 1; i < allRows.length; i++) {
    const cells = directCells(allRows[i]).map(cellText);
    const approvedAt = at(cells, "approvedAt").trim();
    const merchantName = at(cells, "merchantName").trim();
    const grossAmount = parseAmount(at(cells, "grossAmount"));
    // 데이터 판별은 라벨이 아니라 값으로 한다 — 합계·안내·빈 줄을 걸러낸다.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(approvedAt) || merchantName === "" || grossAmount === null) {
      continue;
    }
    const vatRaw = parseAmount(at(cells, "vat"));
    const vat = vatRaw === null ? 0 : vatRaw;

    rows.push({
      approvedAt,
      merchantName,
      grossAmount,
      vat,
      supplyExVat: grossAmount - vat,
      cardMasked: at(cells, "cardMasked").trim(),
      approvalNo: at(cells, "approvalNo").trim(),
      businessNo: at(cells, "businessNo").replace(/\D/g, ""),
      businessCategory: at(cells, "businessCategory").trim(),
      memberRelation: at(cells, "memberRelation").trim() || "본인",
    });
  }
  return rows;
}
