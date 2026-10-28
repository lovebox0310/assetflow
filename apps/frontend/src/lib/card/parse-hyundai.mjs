// 현대카드 이용내역 CSV 파서.
//
// 삼성 파서와 다른 점은 규격(card-columns.json hyundaicard 프로파일)에 기록돼
// 있다. 코드와 규격이 어긋나면 규격을 먼저 고친다.
//   - 합계행이 데이터 뒤에 있다(삼성은 헤더 앞). 합계행 탐색은 헤더 뒤를 본다.
//   - 승인 금액과 이용 금액이 별도다. grossAmount 는 이용 금액(청구 기준)이다.
//     승인 금액은 approvedAmount 로 별도 필드다.
//   - 부가세는 가맹점이 신고한 값이라 이용금액의 순수 함수가 아니다(1,323행 중
//     838행이 이용금액/11 검산과 어긋난다). 그래서 vatMismatch 검사를 하지 않는다.
//     삼성 방식으로 검산하면 거짓 경고가 838건 나온다.
//   - 상태 컬럼(취소/정상)이 취소 판별의 1차 신호다. 부호는 교차검증에 쓴다.
//   - 카드번호가 전체 번호로 온다(삼성은 이미 마스킹돼 온다). 파서가 마스킹하고
//     원본은 어디에도 남기지 않는다.
//   - 날짜가 YYYY.MM.DD 점 구분이다. ISO 로 정규화한다.
//   - 승인번호 컬럼이 없다. 그리고 내용이 완전히 같은 행이 실제로 있다(13그룹).
//     rowKey 는 내용 + 동일내용 발생차수(#n)로 유일성을 만든다.
//
// 이 모듈은 원본 파일 bytes 와 비밀번호를 다루지 않는다. 암호화된 파일은
// 사용자가 입력한 비밀번호로 열린 평문 바이트가 이 모듈에 넘어온다.

import {
  parseCsv, parseAmount, findHeaderRow,
  maskCardNumber, normalizeIsoDate, normHeader,
} from "./card-common.mjs";

/**
 * 합계행에서 명세가 밝힌 총액/부가세/건수를 뽑는다.
 * 실제 합계행: 합 계 | (빈칸) | 1323건 | 49,283,063 | 47,533,063 | 1,487,321
 * 승인 합계(approvedAmount 칸)도 같이 둔다. 합계행은 데이터 뒤에 있다.
 */
function extractDeclaredTotals(rowsAfterHeader, col, grandTotalPatterns) {
  const patterns = new Set((grandTotalPatterns || []).map(normHeader));
  for (let i = 0; i < rowsAfterHeader.length; i++) {
    const r = rowsAfterHeader[i];
    if (!r.some((c) => patterns.has(normHeader(c)))) continue;
    // 합계행은 날짜가 없다. 데이터 행과 구별하는 근거다.
    const dateCell = col.approvedAt === undefined ? "" : (r[col.approvedAt] || "");
    if (normalizeIsoDate(dateCell) !== null) continue;

    const at = (f) => (col[f] === undefined ? "" : String(r[col[f]] == null ? "" : r[col[f]]).trim());
    const gross = parseAmount(at("grossAmount"));
    const vat = parseAmount(at("vat"));
    if (gross === null || vat === null) continue;
    // 건수는 가맹점명 칸("1323건")에 있다. 없으면 행 전체에서 찾는다.
    const countCell = at("merchantName");
    const m = /(\d+)\s*건/.test(countCell) ? countCell.match(/(\d+)\s*건/) : r.join(" ").match(/(\d+)\s*건/);
    return {
      gross, vat,
      count: m ? Number(m[1]) : null,
      approved: parseAmount(at("approvedAmount")),
      labelRow: null, valueRow: i + 1,
    };
  }
  return null;
}

/**
 * 현대카드 "관계" 컬럼 값을 정규화한다. 명시되지 않으면 본인으로 본다.
 * @param {string} raw
 * @returns {string}
 */
function normalizeMemberRelation(raw) {
  const v = (raw || "").trim();
  if (!v) return "본인";
  // "본인 732건" 같은 값이 들어올 수 있으면 앞 단어만 취한다.
  const first = v.split(/\s+/)[0];
  if (first === "본인" || first === "가족") return first;
  return v;
}

/**
 * 현대카드 이용내역 CSV 를 정규화 행으로 바꾼다.
 * @param {Uint8Array|string} input  UTF-8 바이트(권장) 또는 문자열
 * @param {object} contract        card-columns.json 내용
 * @returns {{rows, header, declaredTotals, crossCheck, warnings}}
 */
export function parseHyundaiCardStatement(input, contract) {
  if (!contract) throw new Error("card-columns.json 규격이 없다. 추측으로 파싱하지 않는다.");

  let text;
  if (typeof input === "string") text = input;
  else {
    const u = input instanceof Uint8Array ? input : new Uint8Array(input);
    const hasBom = u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf;
    text = new TextDecoder("utf-8").decode(hasBom ? u.subarray(3) : u);
  }

  const rows = parseCsv(text);
  const header = findHeaderRow(rows, contract, "이용일 / 이용 금액 / 부가세 / 가맹점명");
  const col = header.col;
  const at = (r, f) => (col[f] === undefined ? "" : (r[col[f]] == null ? "" : String(r[col[f]]).trim()));

  const out = [];
  const warnings = [];
  // 동일내용 발생차수. 내용이 완전히 같은 행이 실제로 있으므로(13그룹)
  // 내용만으로는 rowKey 가 유일하지 않다. 같은 내용끼리만 센다.
  const occurrence = new Map();

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((c) => String(c).trim() === "")) continue;

    const gross = parseAmount(at(r, "grossAmount"));
    const merchant = at(r, "merchantName");
    // 데이터 판별은 값으로 한다.
    if (gross === null || merchant === "") continue;

    const isoDate = normalizeIsoDate(at(r, "approvedAt"));
    if (isoDate === null) {
      // 날짜 없고 건수만 있는 행은 합계행이다. 거래가 아니므로 조용히 건너뛴다.
      // (합계행은 extractDeclaredTotals 에서 따로 읽는다)
      if (/^\d+건$/.test(merchant)) continue;
      // 그 외에 가맹점과 금액이 있는데 날짜가 없으면 데이터 손실이다. 조용히 버리면 안 된다.
      warnings.push({
        row: i + 1, code: "rowSkippedNoDate",
        message: "가맹점 '" + merchant + "', 금액 " + gross + " 인 행의 날짜를 읽지 못했다(" +
          at(r, "approvedAt") + "). 이 행은 결과에 없다.",
      });
      continue;
    }

    const vatRaw = parseAmount(at(r, "vat"));
    const vat = vatRaw === null ? 0 : vatRaw;

    // 취소 판별: 상태 컬럼이 1차 신호다. 부호는 교차검증이다.
    // 공급가액 경고보다 먼저 계산한다. 취소 행은 공급가액이 음수인 게 정상이므로.
    const statusRaw = at(r, "reversal");
    let reversal;
    if (statusRaw !== "") reversal = statusRaw === "취소" ? "매입취소" : "매입";
    else reversal = gross < 0 ? "매입취소" : "매입";

    // 공급가액: 컬럼이 있으면 그 값을 쓰고, 없으면 역산한다.
    // 현대 명세는 컬럼이 없으므로 역산 경로가 실제로 쓰인다.
    const supplyCol = parseAmount(at(r, "supplyExVat"));
    const supplyExVat = supplyCol === null ? gross - vat : supplyCol;
    if (supplyCol !== null && supplyCol + vat !== gross) {
      warnings.push({
        row: i + 1, code: "supplyInconsistent",
        message: "공급가액 " + supplyCol + " + 세액 " + vat + " = " + (supplyCol + vat) +
          " 인데 이용금액은 " + gross + " 다.",
      });
    }
    // 포인트 전액 결제 행(이용=0, 부가세>0)은 역산 공급가액이 음수가 된다.
    // 값을 조용히 0으로 자르면 부가세 합계와 대조가 어긋난다. 그대로 두고 보여준다.
    // 취소 행은 음수가 정상이므로 여기서 제외한다.
    if (supplyExVat < 0 && reversal !== "매입취소") {
      warnings.push({
        row: i + 1, code: "vatExceedsGross",
        message: "이용금액 " + gross + " 보다 부가세 " + vat + " 가 크다(공급가액 역산 " + supplyExVat +
          "). 포인트 전액 결제일 가능성이 있다. 승인금액 " + at(r, "approvedAmount") + " 을 확인한다.",
      });
    }

    if ((reversal === "매입취소") !== (gross < 0)) {
      warnings.push({
        row: i + 1, code: "reversalSignMismatch",
        message: "상태 '" + statusRaw + "' 인데 이용금액이 " + (gross < 0 ? "음수" : "양수") + " 다. 둘 중 무엇이 맞은지 확인해야 한다.",
      });
    }

    const businessNo = at(r, "businessNo").replace(/-/g, "");

    const row = {
      approvedAt: isoDate,
      merchantName: merchant,
      grossAmount: gross,
      supplyExVat,
      vat,
      expenseKind: (contract.fields && contract.fields.expenseKind && contract.fields.expenseKind.default) || "unclassified",
      approvalNo: null, // 현대 명세에는 승인번호 컬럼이 없다
      cardMasked: maskCardNumber(at(r, "cardMasked")),
      businessNo: businessNo || null,
      businessCategory: at(r, "businessCategory") || null,
      approvedAmount: parseAmount(at(r, "approvedAmount")),
      installmentCount: parseAmount(at(r, "installmentCount")),
      memberRelation: normalizeMemberRelation(at(r, "memberRelation")),
      reversal,
      _sourceRow: i + 1,
    };

    // 중복 키: 승인번호가 없으므로 내용으로 만든다. 내용이 같은 행 사이에서만
    // 발생차수를 센다. 내용이 같은 행의 순서가 바뀌어도 키 집합이 같아서
    // 재임포트 중복 제거가 유지된다.
    const base = [row.approvedAt, row.merchantName, row.grossAmount, row.vat,
      row.cardMasked || "", row.reversal, row.installmentCount === null ? "" : row.installmentCount].join("|");
    const n = (occurrence.get(base) || 0) + 1;
    occurrence.set(base, n);
    row.rowKey = base + "#" + n;

    out.push(row);
  }

  // 교차검증: 행 합계가 명세 합계행과 맞아야 한다.
  const declaredTotals = extractDeclaredTotals(rows.slice(header.rowIndex + 1), col, contract.rowRoles && contract.rowRoles.grandTotal);
  let crossCheck = null;
  if (declaredTotals) {
    const rowGross = out.reduce((a, r) => a + r.grossAmount, 0);
    const rowVat = out.reduce((a, r) => a + r.vat, 0);
    crossCheck = {
      rowSumGross: rowGross, declaredGross: declaredTotals.gross, grossDelta: rowGross - declaredTotals.gross,
      rowSumVat: rowVat, declaredVat: declaredTotals.vat, vatDelta: rowVat - declaredTotals.vat,
      rowCount: out.length, declaredCount: declaredTotals.count,
    };
    crossCheck.grossOk = crossCheck.grossDelta === 0;
    crossCheck.vatOk = crossCheck.vatDelta === 0;
    crossCheck.countOk = declaredTotals.count === null ? null : out.length === declaredTotals.count;
  }

  return {
    rows: out,
    header: { rowNumber: header.rowIndex + 1, columnCount: rows[header.rowIndex].length, mapped: col },
    declaredTotals,
    crossCheck,
    warnings,
  };
}
