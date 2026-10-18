package com.assetflow.expenses;

import com.assetflow.auth.TokenService;
import com.assetflow.common.web.BearerTokenInterceptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §43 smoke: 월 지출 항목 CRUD · month 검증 · 중복 400 · 404 · 미인증 차단.
 * Spring 컨텍스트 없이 standalone MockMvc — DB 독립.
 */
class ExpenseItemApiTest {

    private MockMvc mvc;

    private static final String TOKEN = "Bearer "
            + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
    private final InMemoryExpenseItemLedger ledger = new InMemoryExpenseItemLedger();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new ExpenseItemController(ledger))
                .addInterceptors(new BearerTokenInterceptor(new TokenService("test-secret-0123456789-0123456789-0123456789")))
                .setControllerAdvice(new com.assetflow.common.api.ApiExceptionHandler())
                .build();
    }

    @Test
    void createsAndListsByMonth() throws Exception {
        mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":1200000,\"isEssential\":true,\"purchaseVat\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.label").value("임대료"))
                .andExpect(jsonPath("$.data.isEssential").value(true));
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1));
        // 다른 월에는 없다
        mvc.perform(get("/api/v1/expenses/items?month=2026-09").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(0));
    }

    @Test
    void duplicateLabelInSameMonthIs400() throws Exception {
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                            .contentType("application/json")
                            .content("{\"label\":\"주유비\",\"amount\":100000}"))
                    .andExpect(status().is(i == 0 ? 200 : 400));
        }
    }

    @Test
    void monthFormatIs400() throws Exception {
        mvc.perform(get("/api/v1/expenses/items?month=2026/10").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/expenses/items").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
    }

    @Test
    void negativeAmountIs400() throws Exception {
        mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"음수\",\"amount\":-1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateKeepsMonthAnd404OnUnknown() throws Exception {
        mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"통신비\",\"amount\":50000}"))
                .andExpect(status().isOk());
        mvc.perform(put("/api/v1/expenses/items/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"통신비\",\"amount\":60000,\"isEssential\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(60000))
                .andExpect(jsonPath("$.data.month").value("2026-10"))
                .andExpect(jsonPath("$.data.isEssential").value(true));
        mvc.perform(put("/api/v1/expenses/items/999").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"x\",\"amount\":1}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteRemovesAnd404OnUnknown() throws Exception {
        mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"구독료\",\"amount\":15000}"))
                .andExpect(status().isOk());
        mvc.perform(delete("/api/v1/expenses/items/1").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(1));
        mvc.perform(delete("/api/v1/expenses/items/1").header("Authorization", TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    void missingTokenIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/expenses/items?month=2026-10"))
                .andExpect(status().isUnauthorized());
    }
}
