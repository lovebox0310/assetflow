// 평문 xlsx(zip 컨테이너)를 기존 CSV 파서가 읽을 수 있는 텍스트로 바꾼다.
//
// §29.2: 표 파싱은 브라우저에서 한다 — 원본 파일은 서버로 보내지 않는다.
// §29.5.1: 암호화된 CFB 컨테이너는 여기 오지 않는다(열지 않는다). 매직 바이트
// 판별은 detect-card.mjs 가 하고, 이 모듈은 zip 만 다룬다.
//
// SheetJS 는 동적 import 로만 불러 대시보드 번들에 섞이지 않게 한다.

/**
 * 시트마다 CSV 후보를 만든다. 어느 시트가 명세 표인지는 호출자가 카드사
 * 판별(detectCardCompany)로 고른다 — 시트 이름을 추측하지 않는다.
 * @param {Uint8Array} bytes
 * @returns {Promise<Array<{ name: string, csv: string }>>}
 */
export async function sheetCsvCandidates(bytes) {
  const XLSX = await import("xlsx");
  let wb;
  try {
    wb = XLSX.read(bytes, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
  } catch {
    // 암호화·손상 파일을 "카드사를 판별할 수 없다"로 뭉뚱그리지 않는다.
    throw new Error("XLSX 파일을 읽지 못했습니다. 파일이 손상됐거나 암호화되어 있는지 확인해 주세요.");
  }
  return wb.SheetNames.map((name) => ({
    name,
    // 날짜 셀은 Date 로 읽고 ISO 로 내보낸다 — 로케일 표기에 따라
    // normalizeIsoDate 가 못 읽는 형식이 되지 않게 한다.
    csv: XLSX.utils.sheet_to_csv(wb.Sheets[name], {
      blankrows: false,
      FS: ",",
      dateNF: "yyyy-mm-dd",
    }),
  }));
}
