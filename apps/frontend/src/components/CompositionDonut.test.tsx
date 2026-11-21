import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CompositionDonut } from "./CompositionDonut";
import type { CompositionSlice } from "../dashboard/metrics";

/**
 * A-07 후속: 도넛 요약이 스크린리더에 **한 번만** 노출된다.
 *
 * 도넛은 `<figure>` 안에 sr-only `<figcaption>`(요약)과 `role="img"` 래퍼(같은 요약)를
 * 둬서 요약을 두 번 읽게 했다. figcaption 에 aria-hidden 을 주는 것으로는 부족하다 —
 * HTML-AAM 이 figure 의 이름을 figcaption 에서 가져오므로(aria-hidden 무시) 여전히 두 번
 * 노출된다(실측 ariaSnapshot: `figure "요약" > img "요약"`). 그래서 캡션 요소를 없애고
 * 이름은 `role="img"` 하나만 갖는다.
 */

const SLICES: CompositionSlice[] = [
  { type: "cash", label: "현금", value: 6_000_000, percent: 60 },
  { type: "invest", label: "투자", value: 4_000_000, percent: 40 },
];

describe("CompositionDonut 요약 노출 (A-07)", () => {
  afterEach(cleanup);

  it("요약은 role=img 이름으로 한 번만 노출된다 (figcaption 없음)", () => {
    const { container } = render(<CompositionDonut slices={SLICES} />);

    const chart = screen.getByRole("img", { name: /자산 구성 도넛 차트/ });
    expect(chart.getAttribute("aria-label")).toBe(
      "자산 구성 도넛 차트 — 현금 60.0%, 투자 40.0%",
    );

    // figcaption 은 aria-hidden 으로도 figure 의 이름이 되어(HTML-AAM) 중복 낭독을 만든다.
    // 캡션 요소를 두지 않고 이름은 role="img" 하나가 갖는다 — 요약 문구도 한 곳뿐이다.
    expect(container.querySelector("figcaption")).toBeNull();
    const summary = chart.getAttribute("aria-label") as string;
    expect(container.innerHTML.split(summary).length - 1).toBe(1);
  });

  it("figcaption 이 없어도 범례는 그대로 읽힌다", () => {
    render(<CompositionDonut slices={SLICES} />);

    const legend = screen.getByLabelText("자산 구성비 범례");
    expect(legend.textContent).toContain("현금");
    expect(legend.textContent).toContain("60.0%");
  });
});
