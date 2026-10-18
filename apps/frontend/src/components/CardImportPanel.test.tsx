import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
// fs 는 쓰지 않는다 — vitest 의 cwd 가 실행 환경마다 달라진다. Vite 변환 파이프라인으로 읽는다.
import contractJson from "../../../../samples/card/card-columns.json";
import hyundaiCsv from "../../../../samples/card/anonymized/hyundaicard-personal-anon.csv?raw";
import { CardImportPanel } from "./CardImportPanel";
import { clearInflight } from "../api/client";
import { detectCardCompany, inspectContainer } from "../lib/card/detect-card.mjs";
import { clearToken, saveToken } from "../auth/authStore";

/**
 * #22 AC: 샘플 업로드 → 판별 → 가맹점 분류 → 반영 API 까지.
 * 판별·파싱은 실제 익명화 샘플(samples/card/anonymized)로 — 조작된 대역이
 * "정상 파싱"을 증명하는 걸 막는다. 반영(POST)만 표준 포맷 대역으로 심는다.
 */

// 실제 익명화 샘플/계약 — Vite ?raw 로 문자열/JSON 주입
const HYUNDAI_TEXT = hyundaiCsv as unknown as string;
const CONTRACT = contractJson as unknown as Parameters<typeof detectCardCompany>[1];

function apiResponse(data: unknown, ok = true, status = 200): Response {
  const body = ok
    ? { code: "OK", message: "loaded", data }
    : { code: "INVALID_REQUEST", message: "Invalid request", details: "", timestamp: "" };
  return { ok, status, json: async () => body } as Response;
}

function fileFrom(bytes: Uint8Array | string, name = "statement.csv"): File {
  const part = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return new File([part as BlobPart], name, { type: "text/csv" });
}

function chooseFile(bytes: Uint8Array | string) {
  const input = screen.getByTestId("card-file") as HTMLInputElement;
  const file = fileFrom(bytes);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

describe("CardImportPanel (§29.7 흐름 이관)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    clearInflight();
  });

  beforeEach(() => {
    clearToken();
    saveToken("tok", Date.now() + 60_000);
    // row-keys 초기 로딩 + 반영 POST 대역
    fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/card-imports/row-keys")) return Promise.resolve(apiResponse([]));
      if (init?.method === "POST") {
        return Promise.resolve(apiResponse({
          stored: 75, received: 75, totalRows: 75, duplicatesInBatch: 0, knownRowKeys: 75,
          totals: { gross: 47_533_063, vat: 1_487_321, supplyExVat: 46_045_742 },
          supplyInconsistentRows: 0,
        }));
      }
      return Promise.resolve(apiResponse({}, false, 500));
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("실제 익명화 샘플이 현대카드로 판별된다", () => {
    const bytes = new TextEncoder().encode(HYUNDAI_TEXT);
    expect(inspectContainer(bytes)).toBe("csv");
    expect(detectCardCompany(HYUNDAI_TEXT, CONTRACT)).toBe("hyundaicard");
  });

  it("암호화 CFB 컨테이너는 열지 않고 안내한다 (§29.5.1 — 비밀번호 입력란 없음)", async () => {
    render(<CardImportPanel />);
    const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    chooseFile(cfb);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/암호화된 카드사 파일/);
    // 비밀번호 입력란이 없어야 한다 — 열기 구현이 없는데 입력만 두면 사용자를 속인다
    expect(screen.queryByPlaceholderText(/비밀번호/i)).toBeNull();
  });

  it("xlsx(zip)는 아직 미지원 안내", async () => {
    render(<CardImportPanel />);
    chooseFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/xlsx 파일은 지원하지 않습니다/);
  });

  it("판별 불가 파일은 거절한다", async () => {
    render(<CardImportPanel />);
    chooseFile(new Uint8Array([1, 2, 3, 4, 5]));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/카드사를 판별할 수 없습니다/);
  });

  it("실제 현대카드 CSV → 가맹점 미리보기 → 확정 POST", async () => {
    render(<CardImportPanel />);
    chooseFile(HYUNDAI_TEXT);

    // 가맹점 그룹이 렌더된다 (샘플의 실제 가맹점)
    await screen.findByText("가맹점");
    // 미분류 상태에서 합계 안내 문구가 뜬다
    await screen.findByText(/미분류 .*곳은 어느 합계에도 들어가지 않습니다/);

    // 확정
    fireEvent.click(screen.getByRole("button", { name: "서버에 반영" }));
    const banner = await screen.findByText(/반영 완료 — 새로 저장 75건/);
    expect(banner).toBeDefined();

    // POST 로 행이 갔는지: 호출 본문 검사
    const postCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes("/card-imports") && c[1]?.method === "POST",
    );
    if (!postCall) throw new Error("POST 없음");
    const sent = JSON.parse(String(postCall[1].body));
    expect(sent.rows.length).toBe(75);
    expect(sent.totals).toBeUndefined(); // §29.7 — 합계를 싣지 않는다
  });
});
