package com.assetflow.dashboard;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.InMemoryCardImportLedger;
import com.assetflow.assets.InMemoryCardStatementLedger;
import com.assetflow.dashboard.DashboardService.DashboardSummary;
import com.assetflow.dashboard.MockDashboardSource.CashflowMonth;
import com.assetflow.expenses.ExpenseSnapshotLedger;
import com.assetflow.expenses.InMemoryExpenseItemLedger;
import com.assetflow.expenses.InMemoryExpenseSnapshotLedger;
import com.assetflow.expenses.MonthlyExpenseTotals;
import com.assetflow.investments.InMemoryInvestmentLedger;
import com.assetflow.investments.PortfolioService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #57 — "이번 달"(asOf)은 상수가 아니라 주입된 {@link Clock} 에서 온다.
 *
 * <p>같은 원장 데이터에 시계만 바꿔 끼워 결과가 달라지는지 본다. 하드코딩 시절에는
 * 두 경우가 똑같이 2026-10 을 돌려줬다. 테스트는 실시간에 기대지 않도록 고정 시계만 쓴다.</p>
 */
class DashboardServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final Clock OCTOBER_2026 = fixedClock(2026, 10, 15);
    private static final Clock NOVEMBER_2026 = fixedClock(2026, 11, 23);

    private InMemoryExpenseSnapshotLedger snapshots;
    private InMemoryCardImportLedger cards;
    private InMemoryExpenseItemLedger items;
    private InMemoryCardStatementLedger statements;

    private static Clock fixedClock(int year, int month, int day) {
        return Clock.fixed(ZonedDateTime.of(year, month, day, 12, 0, 0, 0, SEOUL).toInstant(), SEOUL);
    }

    @BeforeEach
    void setUp() {
        snapshots = new InMemoryExpenseSnapshotLedger();
        cards = new InMemoryCardImportLedger();
        items = new InMemoryExpenseItemLedger();
        statements = new InMemoryCardStatementLedger();
    }

    private DashboardService serviceAt(Clock clock) {
        InMemoryAssetLedger assets = new InMemoryAssetLedger();
        return new DashboardService(assets, snapshots,
                new PortfolioService(assets, new InMemoryInvestmentLedger()),
                new MonthlyExpenseTotals(cards, items, statements), clock);
    }

    @Test
    void summaryAsOfIsTheCurrentMonthOfTheInjectedClock() {
        assertThat(serviceAt(OCTOBER_2026).summary().asOf()).isEqualTo("2026-10");
        assertThat(serviceAt(NOVEMBER_2026).summary().asOf()).isEqualTo("2026-11");
    }

    @Test
    void currentMonthIsYearMonthInTheClockZone() {
        assertThat(DashboardService.currentMonth(OCTOBER_2026)).isEqualTo("2026-10");
        assertThat(DashboardService.currentMonth(NOVEMBER_2026)).isEqualTo("2026-11");
        assertThat(DashboardService.currentMonth(fixedClock(2027, 1, 1))).isEqualTo("2027-01");
    }

    @Test
    void monthBoundaryIsKoreanTimeNotServerTime() {
        // 2026-11-01 00:30 KST == 2026-10-31 15:30 UTC — 달 경계를 건너는 순간이다.
        Instant instant = Instant.parse("2026-10-31T15:30:00Z");
        Clock kst = Clock.fixed(instant, SEOUL);

        // 계산은 시계의 시간대를 따른다: KST 로는 11월, UTC 로는 아직 10월.
        assertThat(DashboardService.currentMonth(kst)).isEqualTo("2026-11");
        assertThat(DashboardService.currentMonth(Clock.fixed(instant, ZoneOffset.UTC))).isEqualTo("2026-10");

        // asOf 도 같은 규칙 — 11월 스냅샷이 있으면 11월에 반영된다.
        snapshots.upsert(new ExpenseSnapshotLedger.Snapshot("2026-11", 0, 0, 9_500_000L, 0L, 0L, 0, true));
        assertThat(serviceAt(kst).summary().asOf()).isEqualTo("2026-11");

        // 그 1분 전(2026-10-31 23:59 KST)은 아직 10월이다.
        assertThat(DashboardService.currentMonth(Clock.fixed(Instant.parse("2026-10-31T14:59:00Z"), SEOUL)))
                .isEqualTo("2026-10");
    }

    @Test
    void sameLedgerWithDifferentClockGivesDifferentSummary() {
        // 11월만 확정돼 있다.
        snapshots.upsert(new ExpenseSnapshotLedger.Snapshot("2026-11", 0, 0, 9_500_000L, 0L, 0L, 0, true));
        cards.addAll(List.of(card("n11", "2026-11-03", 2_000_000)));

        DashboardSummary november = serviceAt(NOVEMBER_2026).summary();
        assertThat(november.asOf()).isEqualTo("2026-11");
        assertThat(november.monthly().income()).isEqualTo(9_500_000L);
        assertThat(november.monthly().expenses()).isEqualTo(2_000_000L);
        assertThat(november.monthly().balance()).isEqualTo(7_500_000L);

        // 같은 데이터·10월 시계: 10월 스냅샷이 없으므로 모크 기준선으로 폴다운(§34.6).
        // 실데이터(11월)와 모크를 섞지 않는다.
        DashboardSummary october = serviceAt(OCTOBER_2026).summary();
        assertThat(october.asOf()).isEqualTo("2026-10");
        assertThat(october.monthly().income()).isEqualTo(8_200_000L);
        assertThat(october.monthly().expenses()).isEqualTo(4_960_000L);
    }

    @Test
    void cashflowIncludesTheCurrentMonthOfTheClock() {
        snapshots.upsert(new ExpenseSnapshotLedger.Snapshot("2026-11", 0, 0, 9_500_000L, 0L, 0L, 0, true));
        snapshots.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 0L, 0L, 0, true));
        snapshots.upsert(new ExpenseSnapshotLedger.Snapshot("2026-09", 0, 0, 8_500_000L, 0L, 0L, 0, true));

        assertThat(months(serviceAt(NOVEMBER_2026).cashflow(2)))
                .containsExactly("2026-11", "2026-10");
        // 시계를 한 달 되돌리면 최신 월도 따라 내려간다 — 상수 월이면 둘 다 "2026-10" 이었다.
        assertThat(months(serviceAt(OCTOBER_2026).cashflow(2)))
                .containsExactly("2026-10", "2026-09");
    }

    @Test
    void cashflowFallsBackToMockOnlyWhenNoSnapshotExists() {
        // 스냅샷 0건: 모크 기준선으로 폴다운하고, 최신 월은 모크 라벨(과거)이다.
        List<CashflowMonth> rows = serviceAt(NOVEMBER_2026).cashflow(6);
        assertThat(rows).hasSize(6);
        assertThat(rows.get(0).month()).isEqualTo(MockDashboardSource.BASELINE_MONTH);
        assertThat(rows.get(0).income()).isEqualTo(8_200_000L);
    }

    @Test
    void cashflowDoesNotMixMockRowsWithRealSnapshots() {
        snapshots.upsert(new ExpenseSnapshotLedger.Snapshot("2026-11", 0, 0, 9_500_000L, 0L, 0L, 0, true));
        cards.addAll(List.of(card("n11", "2026-11-03", 2_000_000)));

        // months=6 이어도 스냅샷이 있는 달만 — 모크 행(2026-10 등)을 채워 넣지 않는다.
        List<CashflowMonth> rows = serviceAt(NOVEMBER_2026).cashflow(6);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).month()).isEqualTo("2026-11");
        assertThat(rows.get(0).expenses()).isEqualTo(2_000_000L);
        assertThat(rows.get(0).balance()).isEqualTo(7_500_000L);
    }

    @Test
    void futureSnapshotsAreNotCountedAsThisMonth() {
        // 12월 스냅샷이 미리 들어와도 11월 시계의 "이번 달"이 아니다.
        snapshots.upsert(new ExpenseSnapshotLedger.Snapshot("2026-12", 0, 0, 10_000_000L, 0L, 0L, 0, true));

        DashboardSummary summary = serviceAt(NOVEMBER_2026).summary();
        assertThat(summary.asOf()).isEqualTo("2026-11");
        assertThat(summary.monthly().income()).isEqualTo(8_200_000L); // 12월 값이 새지 않는다

        // cashflow 범위(asOf 이하)에도 12월이 없다 → 스냅샷 0건이므로 모크 폴백.
        assertThat(months(serviceAt(NOVEMBER_2026).cashflow(3)))
                .containsExactly("2026-10", "2026-09", "2026-08");
    }

    private static List<String> months(List<CashflowMonth> rows) {
        return rows.stream().map(CashflowMonth::month).toList();
    }

    private static CardImportLedger.ImportedRow card(String rowKey, String approvedAt, long gross) {
        return new CardImportLedger.ImportedRow(rowKey, approvedAt, "가맹점", gross, 0, gross,
                "", "", "", "", "", "", "");
    }
}
