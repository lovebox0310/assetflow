import React from "react";
import { vi } from "vitest";

// jsdom 에는 matchMedia 가 없다. antd Grid.useBreakpoint 는 이것을 요구하므로
// 테스트 환경에서만 채워 넣는다 (프로덕션 런타임에는 브라우저 구현이 존재).
interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  onchange: null;
  addListener(): void;
  removeListener(): void;
  addEventListener(): void;
  removeEventListener(): void;
  dispatchEvent(): boolean;
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string): FakeMediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  }),
});

export {};

// jsdom 에는 ResizeObserver 도 없다. antd Popconfirm/Tooltip 이 요구한다.
// 프로덕션 아님 — 테스트 환경에서만 채워 넣는다.
class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;

// jsdom 에서 recharts ResponsiveContainer 는 부모 크기를 0 으로 보기 때문에
// 차트 전체가 렌더링되지 않는다. 테스트에서만 고정 크기 래퍼로 대체한다.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children, width = 800, height = 400 }: any) => {
      const child = React.Children.only(children);
      return React.createElement(
        "div",
        { style: { width, height } },
        React.cloneElement(child as React.ReactElement, { width, height }),
      );
    },
  };
});
