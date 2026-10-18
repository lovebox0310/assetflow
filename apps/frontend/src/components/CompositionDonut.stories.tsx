import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompositionDonut } from "./CompositionDonut";
import type { CompositionSlice } from "../dashboard/metrics";

const meta: Meta<typeof CompositionDonut> = {
  title: "dashboard/CompositionDonut",
  component: CompositionDonut,
};
export default meta;

/** §36.2 기준선 값 — 현금성 42.6% · 예적금 34.1% · 투자 18.9% · 부동산·기타 4.4% (합계 100.0) */
const slices: CompositionSlice[] = [
  { type: "cash", label: "현금성", value: 329_420_000, percent: 42.6 },
  { type: "deposit", label: "예적금", value: 263_780_000, percent: 34.1 },
  { type: "invest", label: "투자", value: 146_000_000, percent: 18.9 },
  { type: "realty", label: "부동산·기타", value: 34_000_000, percent: 4.4 },
];

export const Inline: StoryObj<typeof CompositionDonut> = {
  args: { slices, variant: "inline" },
};

export const Table: StoryObj<typeof CompositionDonut> = {
  args: { slices, variant: "table" },
};

export const Chips: StoryObj<typeof CompositionDonut> = {
  args: { slices, variant: "chips" },
};

export const Empty: StoryObj<typeof CompositionDonut> = {
  args: { slices: [] },
};
