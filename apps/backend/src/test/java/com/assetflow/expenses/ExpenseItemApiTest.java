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
    private final InMemoryRecurringExpenseLedger recurring = new InMemoryRecurringExpenseLedger();

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(
                        new ExpenseItemController(ledger, recurring),
                        new RecurringExpenseController(recurring, ledger))
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

    @Test
    void recurringItemsMaterializeIntoMonthAndStopAfterEndMonth() throws Exception {
        recurring.create("임대료", 1_200_000, true, 0, "2026-10", null);
        recurring.create("구독료", 14_900, false, 0, "2026-01", "2026-12");

        // 2026-10 조회 → 정기 항목이 물리행으로 등장 + recurringId 배지
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].recurringId").value(1));

        // 그 달의 행을 수정해도(시점값) 정의는 그대로
        mvc.perform(put("/api/v1/expenses/items/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":1300000,\"isEssential\":true}"))
                .andExpect(jsonPath("$.data.amount").value(1_300_000));

        // 2027-01 조회 → 종료월이 지난 구독료는 없고 임대료는 이후 달 금액(정의값 1,200,000)으로 새로 등록
        mvc.perform(get("/api/v1/expenses/items?month=2027-01").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].label").value("임대료"))
                .andExpect(jsonPath("$.data[0].amount").value(1_200_000));
    }

    @Test
    void copyLastMonthIsIdempotent() throws Exception {
        mvc.perform(post("/api/v1/expenses/items?month=2026-09").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"주유비\",\"amount\":100000}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/expenses/items/copy?from=2026-09&to=2026-10").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(1));
        // 두 번 복사해도 중복 없음
        mvc.perform(post("/api/v1/expenses/items/copy?from=2026-09&to=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data").value(0));
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[0].label").value("주유비"))
                .andExpect(jsonPath("$.data[0].amount").value(100000));
    }

    @Test
    void copyMonthDoesNotDuplicateAfterRecurringRename() throws Exception {
        // 2026-09에 정기 항목 "임대료"를 만들고 복사
        mvc.perform(post("/api/v1/expenses/recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"임대료\",\"amount\":200000,\"isEssential\":true,\"startMonth\":\"2026-09\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/expenses/items?month=2026-09").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(1));
        mvc.perform(post("/api/v1/expenses/items/copy?from=2026-09&to=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data").value(1));

        // 정의 이름 변경 → 9월 행도 이름이 바뀜
        mvc.perform(put("/api/v1/expenses/recurring/1").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"맥엔피씨임대료\",\"amount\":200000,\"isEssential\":true,\"startMonth\":\"2026-09\"}"))
                .andExpect(status().isOk());

        // 9월 → 10월 다시 복사핟도 recurring_id 기준으로 중복 없음
        mvc.perform(post("/api/v1/expenses/items/copy?from=2026-09&to=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data").value(0));
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].label").value("맥엔피씨임대료"));
    }

    @Test
    void convertToRecurringCreatesDefAndLinksRow() throws Exception {
        mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"DB손해보험\",\"amount\":34160,\"isEssential\":true}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/expenses/items/1/convert-to-recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.label").value("DB손해보험"))
                .andExpect(jsonPath("$.data.amount").value(34160));

        // 행이 정의에 연결됐다 — 재조회에서 recurringId 배지
        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[0].recurringId").value(1));

        // 이중 변환은 400
        mvc.perform(post("/api/v1/expenses/items/1/convert-to-recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void convertIsIdempotentWhenDefAlreadyExists() throws Exception {
        // 항목 생성 → 동일 label·시작월의 정의를 미리 만들어 둠 (사용자가 직접 등록한 경우)
        mvc.perform(post("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{\"label\":\"교육비\",\"amount\":30000}"))
                .andExpect(status().isOk());
        recurring.create("교육비", 30000, false, 0, "2026-10", null);

        // 변환 → 새로 만들지 않고 기존 정의(id 1)에 연결 — 200
        mvc.perform(post("/api/v1/expenses/items/1/convert-to-recurring").header("Authorization", TOKEN)
                        .contentType("application/json")
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(1));

        mvc.perform(get("/api/v1/expenses/items?month=2026-10").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[0].recurringId").value(1));
    }
}
