package com.assetflow.expenses;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.auth.TokenService;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.InMemoryCardImportLedger;
import com.assetflow.common.web.BearerTokenInterceptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §44 smoke: 수입 입력·월 확정 — 원장에서 재계산된 스냅샷 · month 검증 · 미인증 차단.
 */
class ExpenseSnapshotApiTest {

    private MockMvc mvc;

    private static final TokenService TOKENS = new TokenService("test-secret-0123456789-0123456789-0123456789");
    private static final String TOKEN = "Bearer " + TOKENS.issue("user@example.com");

    private final InMemoryExpenseSnapshotLedger snapshots = new InMemoryExpenseSnapshotLedger();
    private final InMemoryCardImportLedger cardLedger = new InMemoryCardImportLedger();
    private final InMemoryExpenseItemLedger items = new InMemoryExpenseItemLedger();
    private final InMemoryAssetLedger assets = new InMemoryAssetLedger();
    private final com.assetflow.assets.InMemoryCardStatementLedger statementLedger =
            new com.assetflow.assets.InMemoryCardStatementLedger();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(
                        new ExpenseSnapshotController(snapshots,
                                new MonthlyExpenseTotals(cardLedger, items, statementLedger), assets,
                                new com.assetflow.investments.PortfolioService(assets,
                                        new com.assetflow.investments.InMemoryInvestmentLedger())))
                .addInterceptors(new BearerTokenInterceptor(TOKENS))
                .setControllerAdvice(new com.assetflow.common.api.ApiExceptionHandler())
                .build();
    }

    @Test
    void confirmComputesSnapshotFromLedgers() throws Exception {
        cardLedger.addAll(java.util.List.of(
                new CardImportLedger.ImportedRow("r1", "2026-10-01", "가맹점A", 1000, 100, 1100, "", "", "", "", "", "", ""),
                new CardImportLedger.ImportedRow("r2", "2026-10-02", "가맹점B", 2000, 200, 2200, "", "", "", "", "", "", "")));
        items.create("2026-10", "임대료", 1_000_000, true, 0, "교육");
        items.create("2026-10", "기타", 300_000, false, 0, "교육");

        mvc.perform(put("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"income\":8200000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.month").value("2026-10"))
                .andExpect(jsonPath("$.data.income").value(8_200_000))
                .andExpect(jsonPath("$.data.expenses").value(1_303_300))   // 카드 3,300 + 항목 1,300,000
                .andExpect(jsonPath("$.data.essentialExpenses").value(1_000_000))
                .andExpect(jsonPath("$.data.essentialComplete").value(true))
                .andExpect(jsonPath("$.data.totalAssets").value(761_200_000L))
                .andExpect(jsonPath("$.data.totalDebts").value(69_355_560));

        // GET 으로 다시 읽는다 — 시점값이 남아 있다
        mvc.perform(get("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.expenses").value(1_303_300));

        // 재확정은 UPDATE — 중복 스냅샷이 아니다
        mvc.perform(put("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"income\":9000000}"))
                .andExpect(jsonPath("$.data.income").value(9_000_000));
        mvc.perform(get("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.income").value(9_000_000));
    }

    @Test
    void getReturnsLiveExpensesEssentialAndBalanceWhenLedgersChangedAfterConfirm() throws Exception {
        cardLedger.addAll(java.util.List.of(
                new CardImportLedger.ImportedRow("r1", "2026-10-01", "가맹점A", 1_000_000, 100_000, 1_100_000, "", "", "", "", "", "", "")));
        items.create("2026-10", "임대료", 1_000_000, true, 0, "교육");

        // 확정 시점: 카드 1,100,000 + 항목 1,000,000 = 2,100,000
        mvc.perform(put("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"income\":8200000}"))
                .andExpect(jsonPath("$.data.expenses").value(2_100_000));

        // 확정 후 카드내역·항목이 바뀐다 — 재확정 없이 GET 이 라이브 값을 돌려줘야 한다.
        cardLedger.addAll(java.util.List.of(
                new CardImportLedger.ImportedRow("r2", "2026-10-02", "가맹점B", 900_000, 0, 900_000, "", "", "", "", "", "", "")));
        items.create("2026-10", "기타", 300_000, false, 0, "교육");

        mvc.perform(get("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                // 수입·부가세이체는 저장 시점값 유지
                .andExpect(jsonPath("$.data.income").value(8_200_000))
                .andExpect(jsonPath("$.data.vatSetAside").value(0))
                // 지출·필수지출·수지는 라이브 재계산
                .andExpect(jsonPath("$.data.expenses").value(3_300_000))
                .andExpect(jsonPath("$.data.essentialExpenses").value(1_000_000))
                .andExpect(jsonPath("$.data.balance").value(4_900_000));

        // GET 은 사본만 바꾼다 — 저장된 스냅샷(확정 시점값)은 그대로다(이력 보존).
        org.junit.jupiter.api.Assertions.assertEquals(
                2_100_000L, snapshots.get("2026-10").expenses());
    }

    @Test
    void unconfirmedMonthReturnsNullData() throws Exception {
        mvc.perform(get("/api/v1/expenses/snapshots?month=2026-09").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void monthFormatAndNegativeIncomeAre400() throws Exception {
        mvc.perform(get("/api/v1/expenses/snapshots?month=2026/10").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"income\":-1}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/v1/expenses/snapshots?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void missingTokenIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/expenses/snapshots?month=2026-10"))
                .andExpect(status().isUnauthorized());
    }
}
