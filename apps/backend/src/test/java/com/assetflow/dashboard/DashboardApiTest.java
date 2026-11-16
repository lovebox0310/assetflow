package com.assetflow.dashboard;

import com.assetflow.auth.MeController;
import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.InMemoryCardImportLedger;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.auth.TokenService;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.expenses.ExpenseSnapshotLedger;
import com.assetflow.expenses.InMemoryExpenseItemLedger;
import com.assetflow.expenses.InMemoryExpenseSnapshotLedger;
import com.assetflow.expenses.MonthlyExpenseTotals;
import com.assetflow.settings.InMemoryUserSettingsLedger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §25 smoke: 3종 API 정상 응답 · 토큰 차단 · 표준 오류 포맷.
 * Spring 컨텍스트 없이 standalone MockMvc 로 — 빠르고 DB 독립.
 */
class DashboardApiTest {

    private MockMvc mvc;
    private InMemoryExpenseSnapshotLedger snapshotLedger;
    private InMemoryCardImportLedger cardLedger;
    private InMemoryExpenseItemLedger itemLedger;

    @BeforeEach
    void setUp() {
        snapshotLedger = new InMemoryExpenseSnapshotLedger();
        cardLedger = new InMemoryCardImportLedger();
        itemLedger = new InMemoryExpenseItemLedger();
        InMemoryAssetLedger assets = new InMemoryAssetLedger();
        DashboardService service = new DashboardService(assets, snapshotLedger,
                new com.assetflow.investments.PortfolioService(assets,
                        new com.assetflow.investments.InMemoryInvestmentLedger()),
                new MonthlyExpenseTotals(cardLedger, itemLedger));
        mvc = MockMvcBuilders.standaloneSetup(new DashboardController(service), new MeController(new InMemoryUserSettingsLedger(), new com.assetflow.settings.AuthEmailResolver() {
                    @Override public String currentEmail() { return "user@example.com"; }
                }))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService("test-secret-0123456789-0123456789-0123456789")))
                .build();
    }

    @Test
    void summaryReturnsBaselineRows() throws Exception {
        mvc.perform(get("/api/v1/dashboard/summary").header("Authorization", "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("OK"))
                .andExpect(jsonPath("$.data.asOf").value("2026-10"))
                .andExpect(jsonPath("$.data.assets[5].name").value("실거주 아파트"))
                .andExpect(jsonPath("$.data.assets[5].value").value(640_000_000))
                // §54.3: invest 행은 예수금 + 보유종목 평가액 (기준선 총액 유지)
                .andExpect(jsonPath("$.data.assets[3].value").value(31_000_000))
                .andExpect(jsonPath("$.data.assets[4].value").value(23_500_000))
                .andExpect(jsonPath("$.data.liabilities[0].balance").value(69_355_560))
                .andExpect(jsonPath("$.data.monthly.income").value(8_200_000))
                .andExpect(jsonPath("$.data.monthly.vatSetAside").value(0))
                .andExpect(jsonPath("$.data.monthly.balance").value(3_240_000))
                .andExpect(jsonPath("$.data.monthly.essentialExpenses").value(2_317_180));
    }

    @Test
    void meReturnsMockUser() throws Exception {
        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value("user@example.com"));
    }

    @Test
    void cashflowReturnsRequestedMonthsNewestFirst() throws Exception {
        mvc.perform(get("/api/v1/dashboard/cashflow?months=3").header("Authorization", "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[0].month").value("2026-10"))
                .andExpect(jsonPath("$.data[0].income").value(8_200_000));

        mvc.perform(get("/api/v1/dashboard/cashflow").header("Authorization", "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3)); // 기본값 months=3
    }

    @Test
    void cashflowUsesSnapshotIncomeAndLiveExpenses() throws Exception {
        // 스냅샷 확정 시점 지출(5,000,000 / 4,800,000)은 이미 낡았다 — 현재 카드·항목 합계가 우선이다.
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 1_000_000L, 5_000_000L, 0, true));
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-09", 0, 0, 8_500_000L, 0L, 4_800_000L, 0, true));
        cardLedger.addAll(java.util.List.of(card("c10", "2026-10-05", 3_000_000)));
        itemLedger.create("2026-10", "임대료", 1_000_000, true, 0, "교육");
        itemLedger.create("2026-10", "기타", 300_000, false, 0, "교육");
        cardLedger.addAll(java.util.List.of(card("c09", "2026-09-05", 2_000_000)));
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");

        mvc.perform(get("/api/v1/dashboard/cashflow?months=3").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].month").value("2026-10"))
                // 수입·부가세이체는 확정 스냅샷 값 그대로
                .andExpect(jsonPath("$.data[0].income").value(9_000_000))
                .andExpect(jsonPath("$.data[0].vatSetAside").value(1_000_000))
                // 지출 = 카드 3,000,000 + 항목 1,300,000 (저장된 5,000,000 이 아니다)
                .andExpect(jsonPath("$.data[0].expenses").value(4_300_000))
                // 수지 = 수입 - 이체 - 지출
                .andExpect(jsonPath("$.data[0].balance").value(3_700_000))
                .andExpect(jsonPath("$.data[1].month").value("2026-09"))
                .andExpect(jsonPath("$.data[1].income").value(8_500_000))
                // 9월 지출도 9월 라이브 합계 — 10월 값을 더한 누적이 아니다.
                .andExpect(jsonPath("$.data[1].expenses").value(2_000_000))
                .andExpect(jsonPath("$.data[1].balance").value(6_500_000));
    }

    @Test
    void cashflowReflectsCardChangesWithoutReconfirming() throws Exception {
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 0L, 0L, 0, true));
        cardLedger.addAll(java.util.List.of(card("c1", "2026-10-05", 1_000_000)));

        mvc.perform(get("/api/v1/dashboard/cashflow?months=1").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.data[0].expenses").value(1_000_000));

        // 월 확정을 다시 하지 않고 카드 행만 추가한다.
        cardLedger.addAll(java.util.List.of(card("c2", "2026-10-06", 500_000)));

        mvc.perform(get("/api/v1/dashboard/cashflow?months=1").header("Authorization", "Bearer " + token))
                .andExpect(jsonPath("$.data[0].expenses").value(1_500_000))
                .andExpect(jsonPath("$.data[0].balance").value(7_500_000));
    }

    @Test
    void cashflowRecomputesPastMonthsFromCurrentData() throws Exception {
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
        // 2026-09 스냅샷의 expenses 111,111 은 확정 시점 저장값 — 응답에 쓰이면 안 된다.
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-09", 0, 0, 8_000_000L, 500_000L, 111_111L, 0, true));
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 0L, 0L, 0, true));
        cardLedger.addAll(java.util.List.of(
                card("p09a", "2026-09-10", 700_000),
                card("p09b", "2026-09-20", 300_000),
                card("p10a", "2026-10-05", 1_000_000)));
        itemLedger.create("2026-09", "기타", 200_000, false, 0, "교육");

        mvc.perform(get("/api/v1/dashboard/cashflow?months=2").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].month").value("2026-10"))
                .andExpect(jsonPath("$.data[0].expenses").value(1_000_000))
                // 과거 월도 조회 시점 합계: 카드 1,000,000 + 항목 200,000
                .andExpect(jsonPath("$.data[1].month").value("2026-09"))
                .andExpect(jsonPath("$.data[1].expenses").value(1_200_000))
                .andExpect(jsonPath("$.data[1].expenses").value(not(111_111)))
                // 수지 = 수입 - 부가세이체 - 지출 = 8,000,000 - 500,000 - 1,200,000
                .andExpect(jsonPath("$.data[1].balance").value(6_300_000));

        // 2026-09 카드 행만 추가 — 월 재확정 없이 과거 월 지출이 따라 바뀌어야 한다.
        cardLedger.addAll(java.util.List.of(card("p09c", "2026-09-25", 50_000)));

        mvc.perform(get("/api/v1/dashboard/cashflow?months=2").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].expenses").value(1_000_000))
                .andExpect(jsonPath("$.data[1].expenses").value(1_250_000))
                .andExpect(jsonPath("$.data[1].balance").value(6_250_000));
    }

    @Test
    void summaryExpensesAreCardPlusItemsAndEssentialIsEssentialItems() throws Exception {
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
        // 저장된 지출·필수지출 값은 의도적으로 틀리게 둔다 — 라이브 재계산이 덮어써야 한다.
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 0L, 999L, 123L, true));
        cardLedger.addAll(java.util.List.of(
                card("s1", "2026-10-01", 1_100),
                card("s2", "2026-10-02", 2_200)));
        itemLedger.create("2026-10", "임대료", 1_000_000, true, 0, "교육");
        itemLedger.create("2026-10", "기타", 300_000, false, 0, "교육");

        mvc.perform(get("/api/v1/dashboard/summary").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                // expenses = 카드 3,300 + 항목 1,300,000
                .andExpect(jsonPath("$.data.monthly.expenses").value(1_303_300))
                // essential = 필수 항목 1,000,000 (카드 행은 필수 여부가 없다)
                .andExpect(jsonPath("$.data.monthly.essentialExpenses").value(1_000_000))
                .andExpect(jsonPath("$.data.monthly.income").value(9_000_000))
                .andExpect(jsonPath("$.data.monthly.balance").value(7_696_700));
    }

    @Test
    void monthWithoutSnapshotIsAbsentFromCashflowEvenWithCardRows() throws Exception {
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 0L, 0L, 0, true));
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-08", 0, 0, 8_000_000L, 0L, 0L, 0, true));
        // 2026-09 는 카드 데이터가 있어도 스냅샷(월 확정)이 없으므로 cashflow 에 나오지 않는다.
        cardLedger.addAll(java.util.List.of(card("m09", "2026-09-15", 4_000_000)));

        mvc.perform(get("/api/v1/dashboard/cashflow?months=3").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].month").value("2026-10"))
                .andExpect(jsonPath("$.data[1].month").value("2026-08"));
    }

    private static CardImportLedger.ImportedRow card(String rowKey, String approvedAt, long gross) {
        return new CardImportLedger.ImportedRow(rowKey, approvedAt, "가맹점", gross, 0, gross,
                "", "", "", "", "", "", "");
    }

    @Test
    void monthlyIncomeReturnsOnlyConfirmedMonthsOldestFirst() throws Exception {
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-08", 0, 0, 7_000_000L, 0L, 5_000_000L, 0, true));
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 0L, 5_000_000L, 0, true));
        // 범위 밖(2026-07)은 응답에 없어야 한다.
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-07", 0, 0, 6_000_000L, 0L, 5_000_000L, 0, true));

        mvc.perform(get("/api/v1/dashboard/monthly-income?from=2026-08&to=2026-10")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].month").value("2026-08"))
                .andExpect(jsonPath("$.data[0].income").value(7_000_000))
                .andExpect(jsonPath("$.data[0].vatSetAside").value(0))
                .andExpect(jsonPath("$.data[0].disposableIncome").value(7_000_000))
                // 스냅샷이 없는 2026-09 는 0 이 아니라 아예 행이 없다 — 화면이 "미확정"으로 그린다.
                .andExpect(jsonPath("$.data[1].month").value("2026-10"))
                .andExpect(jsonPath("$.data[1].income").value(9_000_000))
                .andExpect(jsonPath("$.data[1].vatSetAside").value(0))
                .andExpect(jsonPath("$.data[1].disposableIncome").value(9_000_000));
    }

    @Test
    void monthlyIncomeKeepsZeroIncomeAsConfirmedMonth() throws Exception {
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2025-02", 0, 0, 0L, 0L, 3_100_000L, 0, true));

        mvc.perform(get("/api/v1/dashboard/monthly-income?from=2025-01&to=2025-03")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].month").value("2025-02"))
                .andExpect(jsonPath("$.data[0].income").value(0))
                .andExpect(jsonPath("$.data[0].vatSetAside").value(0))
                .andExpect(jsonPath("$.data[0].disposableIncome").value(0));
    }

    @Test
    void monthlyIncomeRejectsBadRange() throws Exception {
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");

        mvc.perform(get("/api/v1/dashboard/monthly-income?from=2026-10&to=2026-08")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        mvc.perform(get("/api/v1/dashboard/monthly-income?from=2023-10&to=2026-10")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/dashboard/monthly-income?from=2026-13&to=2026-10")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isBadRequest());
    }

    @Test
    void missingTokenIsBlockedWithStandardError() throws Exception {
        mvc.perform(get("/api/v1/dashboard/summary"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"))
                .andExpect(jsonPath("$.timestamp").exists());
    }

    @Test
    void malformedAuthHeaderIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/me").header("Authorization", "Basic abc"))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/v1/me").header("Authorization", "Bearer   "))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void invalidMonthsIsAStandard400() throws Exception {
        mvc.perform(get("/api/v1/dashboard/cashflow?months=0").header("Authorization", "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.timestamp").exists());

        mvc.perform(get("/api/v1/dashboard/cashflow?months=13").header("Authorization", "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com")))
                .andExpect(status().isBadRequest());
    }
}
