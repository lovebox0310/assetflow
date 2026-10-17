package com.assetflow.dashboard;

import java.util.List;

/**
 * 리포지토리 자리의 mock 원장 (Issue 5 스키마가 DB 로 이어지기 전까지).
 * 값은 §36.2 mock 기준선(프론트 dashboardMock.ts)과 동일해야 테스트가 양쪽에서
 * 같은 기준을 본다. 계산(순자산·구성비 등)은 여기서 하지 않는다 — 계산 단일
 * 출처는 프론트 metrics.ts 다 (§34.6). 서버는 행(로우)만 내려준다.
 */
public final class MockDashboardSource {

    public record AssetRow(String id, String type, String name, long value) {}
    public record LiabilityRow(String id, String name, long balance) {}
    public record MonthlySummary(long income, long expenses, long essentialExpenses,
                                 boolean essentialComplete) {}
    public record CashflowMonth(String month, long income, long expenses) {}

    public static final String AS_OF = "2026-10";

    public static List<AssetRow> assets() {
        return List.of(
                new AssetRow("c1", "cash", "우리 파킹통장", 18_500_000L),
                new AssetRow("c2", "cash", "씨티 요구불", 6_200_000L),
                new AssetRow("d1", "deposit", "우리 예적금", 42_000_000L),
                new AssetRow("i1", "invest", "키움 투자금", 31_000_000L),
                new AssetRow("i2", "invest", "미국주식", 23_500_000L),
                new AssetRow("r1", "realty", "실거주 아파트", 640_000_000L));
    }

    public static List<LiabilityRow> liabilities() {
        return List.of(new LiabilityRow("l1", "주택담보대출", 69_355_560L));
    }

    public static MonthlySummary monthly() {
        // §36.2 기준선과 동일: 총수입 820.0만, 지출 496.0만, 필수 2,317,180
        return new MonthlySummary(8_200_000L, 4_960_000L, 2_317_180L, true);
    }

    /** 최근 월 순(desc). 2026-10 은 기준선, 이전 월은 연동 데모용 가짜 값. */
    public static List<CashflowMonth> cashflow() {
        return List.of(
                new CashflowMonth("2026-10", 8_200_000L, 4_960_000L),
                new CashflowMonth("2026-09", 7_950_000L, 5_310_000L),
                new CashflowMonth("2026-08", 8_200_000L, 4_720_000L),
                new CashflowMonth("2026-07", 7_600_000L, 5_050_000L),
                new CashflowMonth("2026-06", 8_200_000L, 4_880_000L),
                new CashflowMonth("2026-05", 7_950_000L, 5_240_000L));
    }

    private MockDashboardSource() {}
}
