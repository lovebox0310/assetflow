package com.assetflow.settings;

import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §59 비상금 유지 개월 기준 저장 API.
 * 모든 필드는 선택이고, 빠진 필드는 기존 값을 유지한다(기존 {targetMonths} 호출 호환).
 * 비상금 계좌은 현금성(cash) 계좌 여러 개를 지정할 수 있다.
 */
class SettingsApiTest {

    private static final String TOKEN = "Bearer " + new TokenService(
            "test-secret-0123456789-0123456789-0123456789").issue("user@example.com");

    private final InMemoryUserSettingsLedger ledger = new InMemoryUserSettingsLedger();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(
                        new SettingsController(ledger, new InMemoryAssetLedger(), new AuthEmailResolver()))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(
                        "test-secret-0123456789-0123456789-0123456789")))
                .build();
    }

    @Test
    void getReturnsEmergencyBasisDefaults() throws Exception {
        mvc.perform(get("/api/v1/settings").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.targetMonths").value(6))
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(1))
                .andExpect(jsonPath("$.data.emergencyAccountIds[0]").value("1"))
                .andExpect(jsonPath("$.data.emergencyAvgMonths").value(3))
                .andExpect(jsonPath("$.data.emergencyCategories.length()").value(5))
                .andExpect(jsonPath("$.data.emergencyCategories[0]").value("식비"))
                .andExpect(jsonPath("$.data.emergencyCategories[4]").value("교육"));
    }

    @Test
    void targetMonthsOnlyKeepsEmergencyBasis() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetMonths\":9}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.targetMonths").value(9))
                .andExpect(jsonPath("$.data.emergencyAccountIds[0]").value("1"))
                .andExpect(jsonPath("$.data.emergencyAvgMonths").value(3))
                .andExpect(jsonPath("$.data.emergencyCategories.length()").value(5));
    }

    @Test
    void updatesMultipleCashAccountsAverageAndCategories() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"emergencyAccountIds":["1","2"],"emergencyAvgMonths":6,
                                 "emergencyCategories":["식비","교통/차량","문화/여가"]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.targetMonths").value(6))
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.emergencyAccountIds[0]").value("1"))
                .andExpect(jsonPath("$.data.emergencyAccountIds[1]").value("2"))
                .andExpect(jsonPath("$.data.emergencyAvgMonths").value(6))
                .andExpect(jsonPath("$.data.emergencyCategories.length()").value(3))
                .andExpect(jsonPath("$.data.emergencyCategories[1]").value("교통/차량"));

        mvc.perform(get("/api/v1/settings").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.emergencyAvgMonths").value(6));
    }

    @Test
    void duplicateAccountIdsAreCollapsedButOrderIsKept() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"2\",\"1\",\"2\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.emergencyAccountIds[0]").value("2"))
                .andExpect(jsonPath("$.data.emergencyAccountIds[1]").value("1"));
    }

    @Test
    void emptyAccountListClearsDesignation() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(0));
    }

    @Test
    void rejectsAccountsThatAreNotCashOrInvest() throws Exception {
        // id 3 = deposit, id 6 = realty (isDebt=false), id 4 = invest
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"3\"]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"1\",\"6\"]}"))
                .andExpect(status().isBadRequest());

        // §62: invest 는 이제 허용된다.
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"1\",\"4\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(2));
    }

    @Test
    void rejectsDebtAccounts() throws Exception {
        // id 7 = 주택담보대출 (is_debt)
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"7\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsUnknownAndBlankAccountIds() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"9999\"]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"1\",\"\"]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"abc\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsBadValues() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAvgMonths\":0}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAvgMonths\":13}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetMonths\":61}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyCategories\":[\"미분류\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsUnclassifiedCategoryButAllowsEmptySelection() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyCategories\":[\"식비\",\"없는분류\"]}"))
                .andExpect(status().isBadRequest());

        // 카테고리를 하나도 고르지 않으면 변동지출 평균은 0 — 고정지출만으로 계산한다.
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyCategories\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyCategories.length()").value(0));
    }

    // ── §89 구성비 "전액 현금성" 계좌 (비상금과 독립) ─────────────────────────

    @Test
    void compositionCashAccountIdsDefaultsToEmpty() throws Exception {
        mvc.perform(get("/api/v1/settings").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds").isArray())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(0));
    }

    @Test
    void compositionCashAcceptsAnyNonDebtType() throws Exception {
        // id 3 = deposit, id 6 = realty — 비상금과 달리 유형 제한이 없다.
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"3\",\"6\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[0]").value("3"))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[1]").value("6"));

        mvc.perform(get("/api/v1/settings").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[0]").value("3"));
    }

    @Test
    void compositionCashDuplicatesAreCollapsedButOrderIsKept() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"3\",\"1\",\"3\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[0]").value("3"))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[1]").value("1"));
    }

    @Test
    void compositionCashEmptyListClearsDesignation() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"3\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(1));

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(0));

        mvc.perform(get("/api/v1/settings").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(0));
    }

    @Test
    void compositionCashRejectsDebtUnknownBlankAndNonNumericIds() throws Exception {
        // id 7 = 주택담보대출(is_debt)
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"7\"]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"9999\"]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"3\",\"\"]}"))
                .andExpect(status().isBadRequest());

        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"abc\"]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void compositionCashAndEmergencyAccountsAreIndependent() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"emergencyAccountIds":["1","2"],
                                 "compositionCashAccountIds":["3"]}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(1));

        // 구성비 지정만 바꿔도 비상금은 유지된다.
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"6\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(2))
                .andExpect(jsonPath("$.data.emergencyAccountIds[0]").value("1"))
                .andExpect(jsonPath("$.data.emergencyAccountIds[1]").value("2"))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[0]").value("6"));

        // 비상금만 바꿔도 구성비 지정은 유지된다.
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"emergencyAccountIds\":[\"2\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.emergencyAccountIds.length()").value(1))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[0]").value("6"));
    }

    @Test
    void compositionCashIsKeptWhenFieldIsOmitted() throws Exception {
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"compositionCashAccountIds\":[\"3\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(1));

        // 다른 필드만 보낸다 — compositionCashAccountIds 생략.
        mvc.perform(put("/api/v1/settings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"targetMonths\":8}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.targetMonths").value(8))
                .andExpect(jsonPath("$.data.compositionCashAccountIds.length()").value(1))
                .andExpect(jsonPath("$.data.compositionCashAccountIds[0]").value("3"));
    }
}
