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
 * §45.3 smoke: 정기 항목 CRUD · 기간 검증(end < start 는 400) · 404 · 미인증 차단.
 */
class RecurringExpenseApiTest {

    private MockMvc mvc;

    private static final String TOKEN = "Bearer "
            + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");
    private final InMemoryRecurringExpenseLedger ledger = new InMemoryRecurringExpenseLedger();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new RecurringExpenseController(ledger))
                .addInterceptors(new BearerTokenInterceptor(new TokenService("test-secret-0123456789-0123456789-0123456789")))
                .setControllerAdvice(new com.assetflow.common.api.ApiExceptionHandler())
                .build();
    }

    @Test
    void createListUpdateDelete() throws Exception {
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":1200000,\"isEssential\":true,\"startMonth\":\"2026-10\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.label").value("임대료"))
                .andExpect(jsonPath("$.data.endMonth").doesNotExist());

        mvc.perform(get("/api/v1/expenses/recurring").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(1));

        mvc.perform(put("/api/v1/expenses/recurring/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":1300000,\"startMonth\":\"2026-10\",\"endMonth\":\"2027-03\"}"))
                .andExpect(jsonPath("$.data.amount").value(1_300_000))
                .andExpect(jsonPath("$.data.endMonth").value("2027-03"));

        mvc.perform(delete("/api/v1/expenses/recurring/1").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(1));
        mvc.perform(delete("/api/v1/expenses/recurring/1").header("Authorization", TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    void periodValidationIs400() throws Exception {
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"x\",\"amount\":1,\"startMonth\":\"2026-10\",\"endMonth\":\"2026-09\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"x\",\"amount\":1,\"startMonth\":\"2026/10\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void missingTokenIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/expenses/recurring"))
                .andExpect(status().isUnauthorized());
    }
}
