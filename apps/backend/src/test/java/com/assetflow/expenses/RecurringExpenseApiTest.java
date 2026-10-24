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
    private final InMemoryExpenseItemLedger itemLedger = new InMemoryExpenseItemLedger();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(
                        new RecurringExpenseController(ledger, itemLedger),
                        new ExpenseItemController(itemLedger, ledger))
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
                        .content("{\"label\":\"임대료\",\"amount\":1300000,\"isEssential\":true,\"startMonth\":\"2026-10\",\"endMonth\":\"2027-03\"}"))
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
                        .content("{\"label\":\"x\",\"amount\":1,\"isEssential\":false,\"startMonth\":\"2026-10\",\"endMonth\":\"2026-09\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"x\",\"amount\":1,\"isEssential\":false,\"startMonth\":\"2026/10\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void missingTokenIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/expenses/recurring"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void renamePropagatesToLinkedRowsAndDoesNotDuplicate() throws Exception {
        // 임대료 정의(200,000)를 2026-10 에 물리행으로 생성
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":200000,\"isEssential\":true,\"startMonth\":\"2025-01\"}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].label").value("임대료"))
                .andExpect(jsonPath("$.data[0].amount").value(200_000));

        // 10월 행만 1,200,000 으로 수정(시점값)
        mvc.perform(put("/api/v1/expenses/items/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":1200000,\"isEssential\":true}"))
                .andExpect(status().isOk());

        // 정의 이름을 맥엔피씨임대료로 변경 → 연결된 행 이름도 소급, 금액은 유지
        mvc.perform(put("/api/v1/expenses/recurring/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"맥엔피씨임대료\",\"amount\":200000,\"isEssential\":true,\"startMonth\":\"2025-01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.label").value("맥엔피씨임대료"));

        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].label").value("맥엔피씨임대료"))
                .andExpect(jsonPath("$.data[0].amount").value(1_200_000));

        // 다른 달은 정의 금액 그대로이며, 이름만 바뀌고 중복 없음
        mvc.perform(get("/api/v1/expenses/items?month=2026-09").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].label").value("맥엔피씨임대료"))
                .andExpect(jsonPath("$.data[0].amount").value(200_000));
    }

    @Test
    void labelConflictBlocksRename() throws Exception {
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":200000,\"isEssential\":true,\"startMonth\":\"2026-10\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(1));

        // 같은 달에 수동으로 맥엔피씨임대료가 있으면 이름 충돌
        mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"맥엔피씨임대료\",\"amount\":100000}"))
                .andExpect(status().isOk());

        mvc.perform(put("/api/v1/expenses/recurring/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"맥엔피씨임대료\",\"amount\":200000,\"isEssential\":true,\"startMonth\":\"2026-10\"}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[?(@.recurringId==1)].label").value("임대료"));
    }

    @Test
    void rowLabelEditDoesNotCauseDuplicateOnEnsure() throws Exception {
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":200000,\"isEssential\":true,\"startMonth\":\"2026-10\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(1));

        // 이 달만 수정으로 행 이름을 바꾸더라도 recurring_id 는 유지
        mvc.perform(put("/api/v1/expenses/items/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료(10월)\",\"amount\":200000,\"isEssential\":true}"))
                .andExpect(status().isOk());

        // 재조회: recurring_id 기준으로 중복 없음
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].label").value("임대료(10월)"));
    }
}
