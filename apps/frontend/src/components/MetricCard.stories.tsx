import type { Meta, StoryObj } from "@storybook/react-vite";
import { MetricCard } from "./MetricCard";
import { AssetCompositionList } from "../dashboard/AssetCompositionList";
import { dashboardMock } from "../data/dashboardMock";
import { assetComposition, emergencyMonths, monthlyBalance, netWorth } from "../dashboard/metrics";
import {
  formatKrwAbbr,
  formatKrwExact,
  formatMonths,
  formatSignedKrw,
} from "../utils/formatters";

// §10 필수 스토리: 기본 / 로딩 / 빈 데이터 / 에러.
// 값은 실제 metrics·formatters 산출물 — 목업 문자열을 스토리에 하드코딩하지 않는다.

const meta = {
  title: "대시보드/핵심카드",
  component: MetricCard,
  args: { title: "순자산", status: "ready" },
} satisfies Meta<typeof MetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const net = netWorth(dashboardMock);
const bal = monthlyBalance(dashboardMock);
const months = emergencyMonths(dashboardMock);
const slices = assetComposition(dashboardMock);

export const 순자산: Story = {
  args: {
    title: "순자산",
    status: "ready",
    hint: formatKrwExact(net),
    children: formatKrwAbbr(net),
  },
};

export const 월수지: Story = {
  args: { title: "월 수지", status: "ready", children: formatSignedKrw(bal) },
};

export const 비상금유지개월: Story = {
  args: { title: "비상금 유지 개월", status: "ready", children: formatMonths(months) },
};

export const 자산구성비: Story = {
  args: { title: "자산 구성비", status: "ready", children: <AssetCompositionList slices={slices} /> },
};

export const 로딩: Story = {
  args: { title: "순자산", status: "loading", children: formatKrwAbbr(net) },
};

export const 빈데이터: Story = {
  args: { title: "순자산", status: "empty", children: null },
};

export const 에러: Story = {
  args: { title: "순자산", status: "error", children: null },
};

export const 구성비빈목록: Story = {
  args: { title: "자산 구성비", status: "ready", children: <AssetCompositionList slices={[]} /> },
};
