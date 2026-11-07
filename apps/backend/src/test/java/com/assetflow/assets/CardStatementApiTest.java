package com.assetflow.assets;

import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** §72 명세서 요약 API — 이용기간 시작 월로 조회한다. */
class CardStatementApiTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");

    private InMemoryCardStatementLedger ledger;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        ledger = new InMemoryCardStatementLedger();
        mvc = MockMvcBuilders
                .standaloneSetup(new CardStatementController(ledger))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    @Test
    void returnsStatementsInRequestedMonthRange() throws Exception {
        ledger.upsert(new CardStatementLedger.StatementRow(
                0, "현대카드", "billing", "2026-10", "2026-10-02", "2026-11-03", 3_326_643));
        ledger.upsert(new CardStatementLedger.StatementRow(
                0, "삼성카드", "billing", "2026-09", "2026-09-03", "2026-10-02", 890_156));

        mvc.perform(get("/api/v1/assets/card-imports/statements?from=2026-10&to=2026-10")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].cardCompany").value("현대카드"))
                .andExpect(jsonPath("$.data[0].usageMonth").value("2026-10"))
                .andExpect(jsonPath("$.data[0].totalAmount").value(3_326_643));
    }

    @Test
    void invalidMonthIsRejected() throws Exception {
        mvc.perform(get("/api/v1/assets/card-imports/statements?from=2026-13&to=2026-10")
                        .header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
    }
}
