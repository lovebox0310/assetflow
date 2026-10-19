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

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(
                        new ExpenseSnapshotController(snapshots, cardLedger, items, assets))
                .addInterceptors(new BearerTokenInterceptor(TOKENS))
                .setControllerAdvice(new com.assetflow.common.api.ApiExceptionHandler())
                .build();
    }

    @Test
    void confirmComputesSnapshotFromLedgers() throws Exception {
        cardLedger.addAll(java.util.List.of(
                new CardImportLedger.ImportedRow("r1", "2026-10-01", "가맹점A", 1000, 100, 1100, "", ""),
                new CardImportLedger.ImportedRow("r2", "2026-10-02", "가맹점B", 2000, 200, 2200, "", "")));
        items.create("2026-10", "임대료", 1_000_000, true, 0);
        items.create("2026-10", "기타", 300_000, false, 0);

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
