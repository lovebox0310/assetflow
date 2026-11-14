package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
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
    private InvestmentLedger ledger;
    private KisBalanceService kisBalanceService;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        assets = new InMemoryAssetLedger();
        ledger = new InMemoryInvestmentLedger();
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

    /** IRP(상품코드 29) 전용 조회처럼 예수금 0 도 신뢰할 수 있는 응답. */
    private static KisBalanceResponse withKnownCash(String cash) {
        return new KisBalanceResponse(List.of(), new KisBalanceResponse.Summary(
                new BigDecimal(cash), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                BigDecimal.ZERO, true));
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
    void knownZeroCashIsAppliedAsValidValueWithoutWarning() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(withKnownCash("0"));

        mvc.perform(post("/api/v1/investments/holdings/sync-kis").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + INVEST_ACCOUNT_ID + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warning").value(org.hamcrest.Matchers.nullValue()));

        assertThat(assets.byId(INVEST_ACCOUNT_ID).balance()).isZero();
    }

    @Test
    void connectionTestAcceptsKnownZeroCashForIrp() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(withKnownCash("0"));

        mvc.perform(post("/api/v1/investments/accounts/" + INVEST_ACCOUNT_ID + "/kis-credentials/test")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.cash").value(0))
                .andExpect(jsonPath("$.data.message").value(
                        org.hamcrest.Matchers.containsString("예수금 0원")));
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

    // ---------------------------------------------------------------------
    // §70 동기화 결과로 덮어쓰기 — 사용자가 입력한 것과 중복되면 안 된다.
    // ---------------------------------------------------------------------

    private static KisBalanceResponse.Holding holding(String symbol, String name,
                                                      String qty, String avg, String price) {
        return new KisBalanceResponse.Holding(symbol, name, new BigDecimal(qty), new BigDecimal(avg),
                new BigDecimal(price), BigDecimal.ZERO, BigDecimal.ZERO, "N");
    }

    private static KisBalanceResponse withHoldings(String cash, KisBalanceResponse.Holding... holdings) {
        return new KisBalanceResponse(List.of(holdings), new KisBalanceResponse.Summary(
                new BigDecimal(cash), BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO));
    }

    private void sync() throws Exception {
        mvc.perform(post("/api/v1/investments/holdings/sync-kis").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + INVEST_ACCOUNT_ID + "}"))
                .andExpect(status().isOk());
    }

    private List<HoldingRow> accountHoldings() {
        return ledger.all().stream().filter(h -> h.accountId() == INVEST_ACCOUNT_ID).toList();
    }

    @Test
    void syncTwiceDoesNotDuplicateHoldings() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(
                withHoldings("1000", holding("458730", "TIGER 미국배당다우존스", "358", "14693", "15250")));

        sync();
        sync();

        assertThat(accountHoldings()).filteredOn(h -> "458730".equals(h.symbol())).hasSize(1);
    }

    @Test
    void manualHoldingWithSameNameIsOverwrittenNotDuplicated() throws Exception {
        // 사용자가 심볼 없이 직접 입력해 둔 같은 종목.
        ledger.create(new HoldingRow(0, INVEST_ACCOUNT_ID, "etf", null, "TIGER 미국배당다우존스",
                "KRW", new BigDecimal("300"), new BigDecimal("14000"), new BigDecimal("14000"),
                BigDecimal.ONE, "2026-11-01"));
        when(kisBalanceService.fetchBalance(any())).thenReturn(
                withHoldings("1000", holding("458730", "TIGER 미국배당다우존스", "358", "14693", "15250")));

        sync();

        List<HoldingRow> matched = accountHoldings().stream()
                .filter(h -> "TIGER 미국배당다우존스".equals(h.name())).toList();
        assertThat(matched).hasSize(1);
        assertThat(matched.get(0).symbol()).isEqualTo("458730");
        assertThat(matched.get(0).quantity()).isEqualByComparingTo("358");
    }

    @Test
    void symbolDroppedFromKisIsDeleted() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(withHoldings("1000",
                holding("111111", "종목A", "10", "1000", "1100"),
                holding("222222", "종목B", "20", "2000", "2100")));
        sync();

        when(kisBalanceService.fetchBalance(any())).thenReturn(
                withHoldings("1000", holding("111111", "종목A", "10", "1000", "1100")));
        sync();

        assertThat(accountHoldings()).extracting(HoldingRow::symbol)
                .contains("111111")
                .doesNotContain("222222");
    }

    @Test
    void manualHoldingIsPreservedWhenKisSucceeds() throws Exception {
        ledger.create(new HoldingRow(0, INVEST_ACCOUNT_ID, "fund", null, "내가 직접 넣은 펀드",
                "KRW", BigDecimal.ONE, new BigDecimal("100000"), new BigDecimal("105000"),
                BigDecimal.ONE, "2026-11-01"));
        when(kisBalanceService.fetchBalance(any())).thenReturn(
                withHoldings("1000", holding("458730", "TIGER 미국배당다우존스", "358", "14693", "15250")));

        sync();

        assertThat(accountHoldings()).extracting(HoldingRow::name)
                .contains("내가 직접 넣은 펀드");
    }

    @Test
    void unresolvedCashDoesNotDeleteKisHoldings() throws Exception {
        when(kisBalanceService.fetchBalance(any())).thenReturn(withHoldings("1000",
                holding("111111", "종목A", "10", "1000", "1100"),
                holding("222222", "종목B", "20", "2000", "2100")));
        sync();

        // 예수금을 읽지 못한 부분 성공에서는 정리하지 않는다.
        when(kisBalanceService.fetchBalance(any())).thenReturn(
                withHoldings("0", holding("111111", "종목A", "10", "1000", "1100")));
        sync();

        assertThat(accountHoldings()).extracting(HoldingRow::symbol)
                .contains("111111", "222222");
    }
}
