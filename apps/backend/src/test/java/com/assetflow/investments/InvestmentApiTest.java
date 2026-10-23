package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
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
 * §54.2 E1 smoke: 보유종목 CRUD·계좌 총액 계산·검증.
 * 총액 = 예수금 + Σ(수량×현재가×환율) 이며 저장하지 않는다(§54.3~§54.4).
 */
class InvestmentApiTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        AssetLedger assets = new InMemoryAssetLedger();
        InvestmentLedger ledger = new InMemoryInvestmentLedger();
        mvc = MockMvcBuilders
                .standaloneSetup(new InvestmentController(ledger, assets,
                        new PortfolioService(assets, ledger)))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    private static String body(long accountId, String assetClass, String symbol, String name,
                               String currency, String quantity, String avgPrice,
                               String marketPrice, String fxRate, String priceAsOf) {
        return "{\"accountId\":" + accountId
                + ",\"assetClass\":\"" + assetClass + "\""
                + ",\"symbol\":\"" + symbol + "\""
                + ",\"name\":\"" + name + "\""
                + ",\"currency\":\"" + currency + "\""
                + ",\"quantity\":" + quantity
                + ",\"avgPrice\":" + avgPrice
                + ",\"marketPrice\":" + marketPrice
                + ",\"fxRate\":" + fxRate
                + ",\"priceAsOf\":" + (priceAsOf == null ? "null" : "\"" + priceAsOf + "\"") + "}";
    }

    @Test
    void seededPortfolioKeepsBaselineTotals() throws Exception {
        mvc.perform(get("/api/v1/investments/holdings").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("OK"))
                .andExpect(jsonPath("$.data.holdings.length()").value(4))
                .andExpect(jsonPath("$.data.accounts.length()").value(2))
                // 키움: 예수금 130만 + 평가 2,970만 = 3,100만 (§36.2 기준선 유지)
                .andExpect(jsonPath("$.data.accounts[0].accountName").value("키움 투자금"))
                .andExpect(jsonPath("$.data.accounts[0].cashBalance").value(1_300_000))
                .andExpect(jsonPath("$.data.accounts[0].holdingsValue").value(29_700_000))
                .andExpect(jsonPath("$.data.accounts[0].totalValue").value(31_000_000))
                // 미국주식: 10만 + 2,340만 = 2,350만
                .andExpect(jsonPath("$.data.accounts[1].totalValue").value(23_500_000));
    }

    @Test
    void createCryptoWithFractionalQuantity() throws Exception {
        mvc.perform(post("/api/v1/investments/holdings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(4, "crypto", "BTC", "비트코인", "KRW",
                                "0.5", "40000000", "46000000", "1", "2026-10-24")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assetClass").value("crypto"))
                .andExpect(jsonPath("$.data.quantity").value(0.5));

        mvc.perform(get("/api/v1/investments/holdings").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.holdings.length()").value(5))
                // 0.5 × 46,000,000 = 23,000,000 추가
                .andExpect(jsonPath("$.data.accounts[0].totalValue").value(54_000_000));
    }

    @Test
    void nonInvestAccountIsRejected() throws Exception {
        mvc.perform(post("/api/v1/investments/holdings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(1, "stock", "005930", "삼성전자", "KRW",
                                "1", "70000", "75000", "1", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void unknownAccountAndAssetClassAreRejected() throws Exception {
        mvc.perform(post("/api/v1/investments/holdings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(999, "stock", "x", "x", "KRW", "1", "1", "1", "1", null)))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/v1/investments/holdings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(4, "gold", "x", "x", "KRW", "1", "1", "1", "1", null)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void negativeQuantityAndZeroFxRateAreRejected() throws Exception {
        mvc.perform(post("/api/v1/investments/holdings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(4, "stock", "x", "x", "KRW", "-1", "1", "1", "1", null)))
                .andExpect(status().isBadRequest());

        mvc.perform(post("/api/v1/investments/holdings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(4, "stock", "x", "x", "KRW", "1", "1", "1", "0", null)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void invalidPriceDateIsRejected() throws Exception {
        mvc.perform(post("/api/v1/investments/holdings").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(4, "stock", "x", "x", "KRW", "1", "1", "1", "1", "2026-13-01")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updatePriceMovesTheAccountTotal() throws Exception {
        mvc.perform(put("/api/v1/investments/holdings/1").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(4, "stock", "005930", "삼성전자", "KRW",
                                "200", "70000", "80000", "1", "2026-10-25")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.marketPrice").value(80000));

        // 200 × 80,000 = 16,000,000 (기존 15,000,000 + 1,000,000)
        mvc.perform(get("/api/v1/investments/holdings").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.accounts[0].totalValue").value(32_000_000));
    }

    @Test
    void deleteRemovesHoldingAndValue() throws Exception {
        mvc.perform(delete("/api/v1/investments/holdings/3").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").value(3));

        mvc.perform(get("/api/v1/investments/holdings").header("Authorization", TOKEN))
                .andExpect(jsonPath("$.data.holdings.length()").value(3))
                .andExpect(jsonPath("$.data.accounts[0].totalValue").value(25_900_000));

        mvc.perform(delete("/api/v1/investments/holdings/3").header("Authorization", TOKEN))
                .andExpect(status().isNotFound());
    }
}
