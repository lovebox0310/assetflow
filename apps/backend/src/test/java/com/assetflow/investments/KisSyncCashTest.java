package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.kis.InMemoryKisCredentialsLedger;
import com.assetflow.investments.kis.KisBalanceResponse;
import com.assetflow.investments.kis.KisBalanceService;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §62.3 회귀: KIS 동기화가 예수금을 못 읽었을 때 기존 잔액을 0 으로 덮어쓰면
 * 비상금 잔액이 사라진다. 실패는 **유지 + 경고**여야 한다.
 */
class KisSyncCashTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");
    /** InMemoryAssetLedger 시드의 invest 계좌(예수금 1,300,000). */
    private static final long INVEST_ACCOUNT_ID = 4L;

    private AssetLedger assets;
    private KisBalanceService kisBalanceService;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        assets = new InMemoryAssetLedger();
        InvestmentLedger ledger = new InMemoryInvestmentLedger();
        KisCredentialsService credentialsService = new KisCredentialsService(
                new InMemoryKisCredentialsLedger(), new CardImportCipher("test", null));
        credentialsService.save(1L, new KisCredentials(
                INVEST_ACCOUNT_ID, "key", "secret", "https://openapi.koreainvestment.com:9443",
                "64116780", "21"));
        kisBalanceService = mock(KisBalanceService.class);
        mvc = MockMvcBuilders
                .standaloneSetup(new InvestmentController(ledger, assets,
                        new PortfolioService(assets, ledger), kisBalanceService, null, credentialsService))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    private static KisBalanceResponse withCash(String cash) {
        return new KisBalanceResponse(List.of(), new KisBalanceResponse.Summary(
                new BigDecimal(cash), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO));
    }

    @Test
    void unresolvedCashKeepsExistingBalanceAndReturnsWarning() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(withCash("0"));

        mvc.perform(post("/api/v1/investments/holdings/sync-kis").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + INVEST_ACCOUNT_ID + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warning").isString());

        assertThat(assets.byId(INVEST_ACCOUNT_ID).balance()).isEqualTo(1_300_000L);
    }

    @Test
    void resolvedCashUpdatesBalanceWithoutWarning() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(withCash("8800000"));

        mvc.perform(post("/api/v1/investments/holdings/sync-kis").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + INVEST_ACCOUNT_ID + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warning").value(org.hamcrest.Matchers.nullValue()));

        assertThat(assets.byId(INVEST_ACCOUNT_ID).balance()).isEqualTo(8_800_000L);
    }

    @Test
    void maskedCredentialsAreRejected() throws Exception {
        mvc.perform(post("/api/v1/investments/accounts/" + INVEST_ACCOUNT_ID + "/kis-credentials")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"appKey":"abcd****wxyz","appSecret":"abcd****wxyz",
                                 "baseUrl":"https://openapi.koreainvestment.com:9443",
                                 "cano":"64116780","acntPrdtCd":"21"}
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void blankCredentialsKeepExistingKeys() throws Exception {
        mvc.perform(post("/api/v1/investments/accounts/" + INVEST_ACCOUNT_ID + "/kis-credentials")
                        .header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"appKey":"","appSecret":"",
                                 "baseUrl":"https://openapi.koreainvestment.com:9443",
                                 "cano":"64116780","acntPrdtCd":"21"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.appKey").value("****"));
    }

    @Test
    void connectionTestReportsCashWithoutTouchingBalance() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(withCash("2261716"));

        mvc.perform(post("/api/v1/investments/accounts/" + INVEST_ACCOUNT_ID + "/kis-credentials/test")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.cash").value(2261716));

        // 테스트는 조회만 한다 — 잔액을 바꾸지 않는다.
        assertThat(assets.byId(INVEST_ACCOUNT_ID).balance()).isEqualTo(1_300_000L);
    }

    @Test
    void connectionTestSurfacesKisReason() throws Exception {
        when(kisBalanceService.fetchBalance(any()))
                .thenThrow(new com.assetflow.investments.kis.KisApiException(
                        "서버 에러가 발생했습니다. (EGW00002)"));

        mvc.perform(post("/api/v1/investments/accounts/" + INVEST_ACCOUNT_ID + "/kis-credentials/test")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(false))
                .andExpect(jsonPath("$.data.message").value(
                        org.hamcrest.Matchers.containsString("EGW00002")));
    }
}
