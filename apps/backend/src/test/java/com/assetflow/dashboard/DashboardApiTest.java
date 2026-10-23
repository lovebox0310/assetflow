package com.assetflow.dashboard;

import com.assetflow.auth.MeController;
import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.auth.TokenService;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.expenses.ExpenseSnapshotLedger;
import com.assetflow.expenses.InMemoryExpenseSnapshotLedger;
import com.assetflow.settings.InMemoryUserSettingsLedger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

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

    @BeforeEach
    void setUp() {
        snapshotLedger = new InMemoryExpenseSnapshotLedger();
        DashboardService service = new DashboardService(new InMemoryAssetLedger(), snapshotLedger);
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
                .andExpect(jsonPath("$.data.liabilities[0].balance").value(69_355_560))
                .andExpect(jsonPath("$.data.monthly.income").value(8_200_000))
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
    void cashflowUsesSnapshotDataWhenAvailable() throws Exception {
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-10", 0, 0, 9_000_000L, 5_000_000L, 0, true));
        snapshotLedger.upsert(new ExpenseSnapshotLedger.Snapshot("2026-09", 0, 0, 8_500_000L, 4_800_000L, 0, true));
        String token = new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");

        mvc.perform(get("/api/v1/dashboard/cashflow?months=3").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].month").value("2026-10"))
                .andExpect(jsonPath("$.data[0].income").value(9_000_000))
                .andExpect(jsonPath("$.data[0].expenses").value(5_000_000))
                .andExpect(jsonPath("$.data[1].month").value("2026-09"))
                .andExpect(jsonPath("$.data[1].income").value(8_500_000));
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
