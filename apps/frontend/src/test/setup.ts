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
