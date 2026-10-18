package com.assetflow.assets;

import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.auth.TokenService;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.dashboard.DashboardController;
import com.assetflow.dashboard.DashboardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §40 smoke: 자산 행 CRUD가 원장에 반영되고, §31.1 에 따라 대시보드 summary 가
 * 같은 원장을 읽는지까지 검증한다 (계산은 프론트 단일 출처 — 서버는 행만).
 */
class AssetAccountApiTest {

    private MockMvc mvc;
    private AssetLedger ledger;

    @BeforeEach
    void setUp() {
        ledger = new InMemoryAssetLedger();
        mvc = MockMvcBuilders
                .standaloneSetup(
                        new AssetAccountController(ledger),
                        new DashboardController(new DashboardService(ledger)))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService("test-secret-0123456789-0123456789-0123456789")))
                .build();
    }

    private static final String TOKEN = "Bearer " + new TokenService("test-secret-0123456789-0123456789-0123456789").issue("user@example.com");

    private String json(long balance, String type, String name, boolean isDebt) {
        return "{\"accountType\":\"" + type + "\",\"name\":\"" + name
                + "\",\"institutionName\":\"\",\"balance\":" + balance
                + ",\"isDebt\":" + isDebt + ",\"openedAt\":null}";
    }

    @Test
    void listSeededFromBaseline() throws Exception {
        mvc.perform(get("/api/v1/assets/accounts").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("OK"))
                .andExpect(jsonPath("$.data.length()").value(7))
                .andExpect(jsonPath("$.data[0].accountType").value("cash"))
                .andExpect(jsonPath("$.data[6].isDebt").value(true));
    }

    @Test
    void createThenListContainsIt() throws Exception {
        mvc.perform(post("/api/v1/assets/accounts").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(5_000_000, "cash", "새 통장", false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").exists())
                .andExpect(jsonPath("$.data.balance").value(5_000_000));

        mvc.perform(get("/api/v1/assets/accounts").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(8));
    }

    @Test
    void updateChangesTheRow() throws Exception {
        mvc.perform(put("/api/v1/assets/accounts/1").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(19_000_000, "cash", "우리 파킹통장", false)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.balance").value(19_000_000));

        mvc.perform(get("/api/v1/assets/accounts").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data[0].balance").value(19_000_000));
    }

    @Test
    void updateMissingIdIsStandard404() throws Exception {
        mvc.perform(put("/api/v1/assets/accounts/999").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(1_000, "cash", "x", false)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.timestamp").exists());

        mvc.perform(delete("/api/v1/assets/accounts/999").header("Authorization", TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteRemovesTheRow() throws Exception {
        mvc.perform(delete("/api/v1/assets/accounts/6").header("Authorization", TOKEN))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/assets/accounts").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.length()").value(6));
    }

    @Test
    void invalidPayloadIsStandard400() throws Exception {
        // enum 위반
        mvc.perform(post("/api/v1/assets/accounts").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(1_000, "gold", "x", false)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));

        // 음수 잔액
        mvc.perform(post("/api/v1/assets/accounts").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(-1, "cash", "x", false)))
                .andExpect(status().isBadRequest());

        // 빈 이름
        mvc.perform(post("/api/v1/assets/accounts").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(1_000, "cash", " ", false)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void summaryReadsTheSameLedger_As31SingleSource() throws Exception {
        // 투자금 행을 추가하면 대시보드 summary 의 assets 에도 나타난다 (§31.1)
        mvc.perform(post("/api/v1/assets/accounts").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(7_000_000, "invest", "추가 투자금", false)))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/dashboard/summary").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assets.length()").value(7))
                .andExpect(jsonPath("$.data.assets[6].name").value("추가 투자금"))
                .andExpect(jsonPath("$.data.liabilities.length()").value(1));
    }

    @Test
    void unauthenticatedAccessIsBlocked() throws Exception {
        mvc.perform(get("/api/v1/assets/accounts"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REQUIRED"));
    }
}
