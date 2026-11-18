package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.kis.InMemoryKisCredentialsLedger;
import com.assetflow.investments.kis.KisApiClient;
import com.assetflow.investments.kis.KisApiException;
import com.assetflow.investments.kis.KisBalanceService;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §62.3 개인연금(22) 빈 잔고 응답 회귀.
 *
 * <p>운영 사고: TTTC2208R 이 {@code rt_cd=0} 이지만 output1/output2 가 비어 왔는데
 * "정상 0원" 으로 판정되어 동기화가 KIS 출처 보유종목을 삭제했다. 빈 응답은
 * <b>예수금 알 수 없음</b> 이어야 하고, 그때는 아무것도 지우지 않아야 한다.</p>
 */
class KisPersonalPensionTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");
    /** InMemoryAssetLedger 시드의 invest 계좌(예수금 1,300,000). */
    private static final long ACCOUNT_ID = 4L;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private AssetLedger assets;
    private InvestmentLedger ledger;
    private MockMvc mvc;

    private static JsonNode json(String body) {
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 상품코드 22 개인연금 계좌 + 진짜 {@link KisBalanceService} 로 컨트롤러를 세운다.
     * 가짜 KIS 는 연금 TR 만 응답하고, 위탁계좌 전용 API 는 실전처럼 거부한다.
     */
    private void wire(Supplier<JsonNode> pensionResponse) {
        assets = new InMemoryAssetLedger();
        ledger = new InMemoryInvestmentLedger();
        KisCredentialsService credentialsService = new KisCredentialsService(
                new InMemoryKisCredentialsLedger(), new CardImportCipher("test", null));
        credentialsService.save(1L, new KisCredentials(
                ACCOUNT_ID, "key", "secret", "https://openapi.koreainvestment.com:9443",
                "64116780", "22"));

        KisApiClient client = new KisApiClient() {
            @Override
            public JsonNode get(KisCredentials credentials, String path,
                                Map<String, String> params, String trId) {
                if (path.contains("pension/inquire-balance")) {
                    return pensionResponse.get();
                }
                throw new KisApiException("위탁계좌 전용: " + path);
            }

            @Override
            public JsonNode post(KisCredentials credentials, String path,
                                 Map<String, String> params, Object body, String trId) {
                throw new UnsupportedOperationException();
            }
        };

        mvc = MockMvcBuilders
                .standaloneSetup(new InvestmentController(ledger, assets,
                        new PortfolioService(assets, ledger), new KisBalanceService(client), null,
                        credentialsService))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    /** 이전 동기화가 남긴 KIS 출처 행 — 빈 응답에서 지워지면 안 된다. */
    private void seedKisHolding() {
        ledger.upsertKis(new HoldingRow(0, ACCOUNT_ID, "etf", "458730",
                "TIGER 미국배당다우존스", "KRW", new BigDecimal("358"),
                new BigDecimal("14693"), new BigDecimal("15250"), BigDecimal.ONE, "2026-11-01"));
    }

    private void sync() throws Exception {
        mvc.perform(post("/api/v1/investments/holdings/sync-kis").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + ACCOUNT_ID + "}"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("KIS_API_ERROR"))
                // 실패 사유가 "빈 응답" 이어야 한다 — 다른 이유로 실패한 테스트가 아니어야 한다.
                .andExpect(jsonPath("$.details").value(containsString("비어 있습니다")));
    }

    private List<HoldingRow> accountHoldings() {
        return ledger.all().stream().filter(h -> h.accountId() == ACCOUNT_ID).toList();
    }

    // ── 동기화 가드 ────────────────────────────────────────────────────────

    @Test
    void emptyPensionResponseFailsSyncAndKeepsStaleHoldings() throws Exception {
        wire(() -> json("{\"rt_cd\":\"0\",\"output1\":[],\"output2\":{}}"));
        seedKisHolding();

        sync();

        assertThat(accountHoldings()).extracting(HoldingRow::symbol).contains("458730");
        // 예수금도 0 으로 덮어쓰지 않는다.
        assertThat(assets.byId(ACCOUNT_ID).balance()).isEqualTo(1_300_000L);
    }

    @Test
    void trustworthyZeroResponseAppliesZeroAndCleansStaleHoldings() throws Exception {
        // 총평가 0 이 명시된 "진짜 빈 계좌" 는 기존처럼 정상 0원으로 처리한다.
        wire(() -> json("{\"rt_cd\":\"0\",\"output1\":[],\"output2\":[{\"tot_evlu_amt\":\"0\"}]}"));
        seedKisHolding();

        mvc.perform(post("/api/v1/investments/holdings/sync-kis").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + ACCOUNT_ID + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.warning").value(nullValue()));

        assertThat(assets.byId(ACCOUNT_ID).balance()).isZero();
        assertThat(accountHoldings()).extracting(HoldingRow::symbol).doesNotContain("458730");
    }

    // ── 진단 API (읽기 전용) ────────────────────────────────────────────────

    @Test
    void pensionPreviewReturnsRawJSONWithoutTouchingDB() throws Exception {
        wire(() -> json("{\"rt_cd\":\"0\",\"msg\":\"\",\"output1\":[],\"output2\":{}}"));
        seedKisHolding();
        long balanceBefore = assets.byId(ACCOUNT_ID).balance();
        List<HoldingRow> holdingsBefore = ledger.all();

        mvc.perform(post("/api/v1/investments/accounts/" + ACCOUNT_ID + "/kis-pension-preview")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.acntPrdtCd").value("22"))
                .andExpect(jsonPath("$.data.isMock").value(false))
                .andExpect(jsonPath("$.data.error").value(nullValue()))
                // 원본 JSON 그대로 — output2 가 빈 객체인지 눈으로 확인할 수 있어야 한다.
                .andExpect(jsonPath("$.data.balance.rt_cd").value("0"))
                .andExpect(jsonPath("$.data.balance.output2").isMap())
                // 비어 있다는 사실은 warning 으로 안내한다.
                .andExpect(jsonPath("$.data.warning").value(containsString("output2")));

        assertThat(assets.byId(ACCOUNT_ID).balance()).isEqualTo(balanceBefore);
        assertThat(ledger.all()).containsExactlyElementsOf(holdingsBefore);
    }

    @Test
    void pensionPreviewReportsKisFailureAs200WithError() throws Exception {
        wire(() -> {
            throw new KisApiException("연금 TR 거부(EGW00002)");
        });
        long balanceBefore = assets.byId(ACCOUNT_ID).balance();
        List<HoldingRow> holdingsBefore = ledger.all();

        mvc.perform(post("/api/v1/investments/accounts/" + ACCOUNT_ID + "/kis-pension-preview")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.acntPrdtCd").value("22"))
                .andExpect(jsonPath("$.data.balance").value(nullValue()))
                .andExpect(jsonPath("$.data.error").value(containsString("EGW00002")));

        assertThat(assets.byId(ACCOUNT_ID).balance()).isEqualTo(balanceBefore);
        assertThat(ledger.all()).containsExactlyElementsOf(holdingsBefore);
    }

    @Test
    void pensionPreviewWithoutCredentialsReturns200WithError() throws Exception {
        wire(() -> json("{\"rt_cd\":\"0\",\"output1\":[],\"output2\":{}}"));

        // 5번은 invest 계좌지만 KIS 자격증명이 없다.
        mvc.perform(post("/api/v1/investments/accounts/5/kis-pension-preview")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.acntPrdtCd").value(nullValue()))
                .andExpect(jsonPath("$.data.error").value("KIS 자격증명이 없습니다"));
    }
}
