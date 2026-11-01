import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { sheetCsvCandidates } from "./card-xlsx.mjs";

function workbookBytes(sheets: Record<string, unknown[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}

describe("sheetCsvCandidates — 평문 xlsx → CSV 후보", () => {
  it("시트마다 CSV 를 만들고 시트 순서를 지킨다", async () => {
    const bytes = workbookBytes({
      둘째: [["b1", "b2"]],
      첫째: [["a1", "a2"], ["1", "2"]],
    });
    const candidates = await sheetCsvCandidates(bytes);
    expect(candidates.map((c) => c.name)).toEqual(["둘째", "첫째"]);
    const second = candidates[1]?.csv ?? "";
    expect(second).toContain("a1,a2");
    expect(second).toContain("1,2");
  });

  it("빈 행은 빼고, 쉼표가 든 셀은 CSV 규칙대로 인용한다", async () => {
    const bytes = workbookBytes({
      Sheet1: [["가맹점", "금액"], [], ["합성, 식당", 12000]],
    });
    const candidates = await sheetCsvCandidates(bytes);
    expect(candidates[0]?.csv).toBe('가맹점,금액\n"합성, 식당",12000');
  });

  it("날짜 셀은 ISO 표기로 내보낸다 — 파서의 normalizeIsoDate 가 읽을 수 있게", async () => {
    const bytes = workbookBytes({ Sheet1: [["승인일자"], [new Date(2026, 0, 5)]] });
    const candidates = await sheetCsvCandidates(bytes);
    expect(candidates[0]?.csv).toContain("2026-01-05");
  });

  it("xlsx 가 아닌 바이트는 읽기 실패 메시지로 구분한다", async () => {
    await expect(
      sheetCsvCandidates(new Uint8Array([0x50, 0x4b, 0x03, 0x04])),
    ).rejects.toThrow(/XLSX 파일을 읽지 못했습니다/);
  });
});
