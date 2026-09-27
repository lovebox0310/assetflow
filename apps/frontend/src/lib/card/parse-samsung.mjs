// 삼성카드 개인사업자용 명세서 CSV 파서.
//
// 설계 원칙:
//   1. 규격은 card-columns.json 이 단일 출처다. 이 모듈은 헤더 이름을 직접 알지
//      못하고 주입받은 계약의 headerAliases 로 매핑한다. 계약과 어긋나게 하드코딩
//      한 별칭이 있으면 어느 쪽이 진짜인지 알 수 없어진다.
//   2. 헤더 행 위치를 고정으로 박지 않는다. 실제 파일은 19행째지만 다른 발급
//      연도·다른 명세 종류는 위치가 다를 수 있다. 헤더 후보 행을 점수로 골라
//      잡고, 그래도 못 찾으면 에러를 낸다(0건 조용히 반환 금지).
//   3. 표가 아닌 행은 값으로 판별한다. '발행정보' 같은 문자열 목록에 의존하지
//      않고, 금액 컬럼이 숫자로 파싱되고 가맹점명이 비어 있지 않으면 데이터다.
//      합계행은 거래에 더하지 않고 교차검증에만 쓴다.
//   4. 파서가 쓰지 않는 값(성명·주민등록번호·사업자번호)은 읽어도 반환하지 않는다.
//
// 이 모듈은 원본 파일 bytes 와 비밀번호를 다루지 않는다. 암호화된 파일은
// 사용자가 입력한 비밀번호로 열린 평문 바이트가 이 모듈에 넘어온다.
// CSV 파싱·헤더 매칭 원시 함수는 card-common.mjs 의 한 벌을 쓴다.

import {
  parseCsv, parseAmount, findHeaderRow,
} from "./card-common.mjs";

export { parseCsv };

/**
 * 명세서가 밝힌 총액/부가세총액. 교차검증용.
 *
 * 실제 삼성 명세는 라벨과 값이 서로 다른 행에 있다.
 *   14행: 이용기간 | 총 합계 | 부가세 합계 | 일시불 | ...
 *   15행: 2025-07-01 ~ 2025-12-31 | 2,385,860 | 8,453 | ...
 * 라벨 행에서 숫자를 뽑으면 안 된다(라벨 행에는 숫자가 없다). 라벨 행을 찾고
 * 바로 아래 행의 숫자를 쓴다.
 */
function extractDeclaredTotals(rowsBeforeHeader) {
  const flat = (r) => r.map((c) => String(c).trim()).join("").replace(/\s/g, "");
  for (let i = 0; i < rowsBeforeHeader.length; i++) {
    if (!/총합계/.test(flat(rowsBeforeHeader[i]))) continue;
    // 라벨 바로 아래 행에서 숫자를 뽑는다. 없으면 다음 1행까지 본다.
    for (let j = i + 1; j < Math.min(i + 2, rowsBeforeHeader.length); j++) {
      const nums = rowsBeforeHeader[j].map(parseAmount).filter((n) => n !== null);
      if (nums.length >= 2) return { gross: nums[0], vat: nums[1], labelRow: i + 1, valueRow: j + 1 };
    }
  }
  return null;
}

/**
 * 삼성 개인사업자용 명세서 CSV 를 정규화 행으로 바꾼다.
 * @param {Uint8Array|string} input  UTF-8 바이트(권장) 또는 문자열
 * @param {object} contract        card-columns.json 내용
 * @returns {{rows, header, declaredTotals, crossCheck, warnings}}
 */
export function parseSamsungCardStatement(input, contract) {
  if (!contract) throw new Error("card-columns.json 규격이 없다. 추측으로 파싱하지 않는다.");

  let text;
  if (typeof input === "string") text = input;
  else {
    const u = input instanceof Uint8Array ? input : new Uint8Array(input);
    const hasBom = u.length >= 3 && u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf;
    text = new TextDecoder("utf-8").decode(hasBom ? u.subarray(3) : u);
  }

  const rows = parseCsv(text);
  const header = findHeaderRow(rows, contract, "이용일 / 이용금액(원) / 부가세(원) / 가맹점명");

  const col = header.col;
  const at = (r, f) => (col[f] === undefined ? "" : (r[col[f]] == null ? "" : String(r[col[f]]).trim()));
  const declaredTotals = extractDeclaredTotals(rows.slice(0, header.rowIndex));

  const out = [];
  const warnings = [];

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((c) => String(c).trim() === "")) continue;

    const gross = parseAmount(at(r, "grossAmount"));
    const merchant = at(r, "merchantName");
    // 데이터 판별은 라벨 목록이 아니라 값으로 한다.
    if (gross === null || merchant === "") continue;

    const vatRaw = parseAmount(at(r, "vat"));
    const vat = vatRaw === null ? 0 : vatRaw;

    // 공급가액: 컬럼이 있으면 그 값을 쓰고, 없으면 역산한다.
    // 삼성 명세는 컬럼이 없으므로 역산 경로가 실제로 쓰인다.
    const supplyCol = parseAmount(at(r, "supplyExVat"));
    const supplyExVat = supplyCol === null ? gross - vat : supplyCol;
    if (supplyCol !== null && supplyCol + vat !== gross) {
      warnings.push({
        row: i + 1, code: "supplyInconsistent",
        message: "공급가액 " + supplyCol + " + 세액 " + vat + " = " + (supplyCol + vat) +
          " 인데 이용금액은 " + gross + " 다.",
      });
    }

    const approvalNo = at(r, "approvalNo");
    const approvedAt = at(r, "approvedAt");
    const cardMasked = at(r, "cardMasked");

    const row = {
      approvedAt,
      merchantName: merchant,
      grossAmount: gross,
      supplyExVat,
      vat,
      expenseKind: (contract.fields && contract.fields.expenseKind && contract.fields.expenseKind.default) || "unclassified",
      approvalNo: approvalNo || null,
      cardMasked: cardMasked || null,
      businessCategory: at(r, "businessCategory") || null,
      // 별도 취소 컬럼이 없으므로 음수 금액이 취소다.
      reversal: gross < 0 ? "매입취소" : "매입",
      _sourceRow: i + 1,
    };

    // 중복 키: 승인번호 단독으로는 잡히지 않는다(취소/재승인이 같은 번호를 쓴다).
    row.rowKey = [row.approvedAt, row.merchantName, row.grossAmount, row.vat, row.approvalNo || "", row.cardMasked || ""].join("|");

    // 세액 검산: 역산한 공급가액의 10% 가 적힌 세액과 1원 이내로 맞아야 한다.
    if (row.vat !== 0) {
      const expect = row.supplyExVat * 0.1;
      if (Math.abs(expect - row.vat) >= 1) {
        warnings.push({
          row: row._sourceRow,
          code: "vatMismatch",
          message: "공급가액 " + row.supplyExVat + " 의 10% 는 " + expect.toFixed(1) +
            " 인데 세액은 " + row.vat + " 이다. supplyExVat 역산이 맞지 않을 수 있다.",
        });
      }
    }
    // 부호 반대면 금액/세액이 어긋난 것. 취소 행은 둘 다 음수라 통과한다.
    if (row.vat !== 0 && Math.sign(row.vat) !== Math.sign(row.grossAmount)) {
      warnings.push({ row: row._sourceRow, code: "signMismatch", message: "이용금액과 세액의 부호가 반대다." });
    }

    out.push(row);
  }

  // 교차검증: 행 합계가 명세서가 밝힌 합계와 맞아야 한다.
  let crossCheck = null;
  if (declaredTotals) {
    const rowGross = out.reduce((a, r) => a + r.grossAmount, 0);
    const rowVat = out.reduce((a, r) => a + r.vat, 0);
    crossCheck = {
      rowSumGross: rowGross, declaredGross: declaredTotals.gross, grossDelta: rowGross - declaredTotals.gross,
      rowSumVat: rowVat, declaredVat: declaredTotals.vat, vatDelta: rowVat - declaredTotals.vat,
    };
    crossCheck.grossOk = crossCheck.grossDelta === 0;
    crossCheck.vatOk = crossCheck.vatDelta === 0;
  }

  return {
    rows: out,
    header: { rowNumber: header.rowIndex + 1, columnCount: rows[header.rowIndex].length, mapped: col },
    declaredTotals,
    crossCheck,
    warnings,
  };
}
