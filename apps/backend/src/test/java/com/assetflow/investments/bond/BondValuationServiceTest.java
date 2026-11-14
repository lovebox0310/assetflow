package com.assetflow.investments.bond;

import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.kis.InMemoryKisCredentialsLedger;
import com.assetflow.investments.kis.KisApiClient;
import com.assetflow.investments.kis.KisApiException;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** BOND-VALUE-1 액면 × 평가단가 / 10,000 계산·최신일자 선택·실패 처리. */
class BondValuationServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final KisCredentials CREDENTIALS = new KisCredentials(
            4L, "key", "secret", "https://openapi.koreainvestment.com:9443", "64116780", "01");

    private static KisApiClient client(java.util.function.Supplier<String> body) {
        return new KisApiClient() {
            @Override
            public JsonNode get(KisCredentials c, String path, Map<String, String> params, String trId) {
                return json(body.get());
            }

            @Override
            public JsonNode post(KisCredentials c, String path, Map<String, String> params,
                                 Object requestBody, String trId) {
                throw new UnsupportedOperationException();
            }
        };
    }

    private static KisApiClient throwing() {
        return new KisApiClient() {
            @Override
            public JsonNode get(KisCredentials c, String path, Map<String, String> params, String trId) {
                throw new KisApiException("CTPF2005R 거부");
            }

            @Override
            public JsonNode post(KisCredentials c, String path, Map<String, String> params,
                                 Object requestBody, String trId) {
                throw new UnsupportedOperationException();
            }
        };
    }

    private static JsonNode json(String body) {
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void usesLatestDateRowAndComputesEvaluationAmount() {
        String body = """
                {"rt_cd":"0","output1":[
                  {"evlu_dt":"20261110","pdno":"KR103502GEC4","prdt_name":"국고03000-3412(24-13)",
                   "kis_unpr":"9700.0","kbp_unpr":"9710.0","nice_evlu_unpr":"9720.0","fnp_unpr":"9730.0",
                   "avg_evlu_unpr":"9700.00000000","avg_evlu_erng_rt":"3.1000"},
                  {"evlu_dt":"20261114","pdno":"KR103502GEC4","prdt_name":"국고03000-3412(24-13)",
                   "kis_unpr":"9750.0","kbp_unpr":"9760.0","nice_evlu_unpr":"9770.0","fnp_unpr":"9780.0",
                   "avg_evlu_unpr":"9758.65000000","avg_evlu_erng_rt":"3.8348"}
                ]}
                """;
        BondValuationService service = new BondValuationService(client(() -> body));

        BondValuationService.BondValuation valuation =
                service.fetch(CREDENTIALS, "KR103502GEC4", 1_000_000L);

        assertThat(valuation.error()).isNull();
        // 최신 2026-11-14 행
        assertThat(valuation.asOf()).isEqualTo(LocalDate.parse("2026-11-14"));
        assertThat(valuation.unitPrice()).isEqualByComparingTo(new BigDecimal("9758.65"));
        // 1,000,000 × 9,758.65 / 10,000 = 975,865
        assertThat(valuation.evaluated()).isEqualTo(975_865L);
        assertThat(valuation.avgYieldRate()).isEqualByComparingTo(new BigDecimal("3.8348"));
        assertThat(valuation.kisUnitPrice()).isEqualByComparingTo(new BigDecimal("9750"));
        assertThat(valuation.kbpUnitPrice()).isEqualByComparingTo(new BigDecimal("9760"));
        assertThat(valuation.niceUnitPrice()).isEqualByComparingTo(new BigDecimal("9770"));
        assertThat(valuation.fnpUnitPrice()).isEqualByComparingTo(new BigDecimal("9780"));
        assertThat(valuation.name()).isEqualTo("국고03000-3412(24-13)");
    }

    @Test
    void emptyOutputReturnsError() {
        BondValuationService service = new BondValuationService(
                client(() -> "{\"rt_cd\":\"0\",\"output1\":[]}"));

        BondValuationService.BondValuation valuation =
                service.fetch(CREDENTIALS, "KR103502GEC4", 1_000_000L);

        assertThat(valuation.error()).isEqualTo("평가단가가 없습니다");
        assertThat(valuation.evaluated()).isZero();
    }

    @Test
    void kisFailureReturnsErrorInsteadOfThrowing() {
        BondValuationService.BondValuation valuation =
                new BondValuationService(throwing()).fetch(CREDENTIALS, "KR103502GEC4", 1_000_000L);

        assertThat(valuation.error()).contains("채권 평가단가를 가져오지 못했습니다").contains("CTPF2005R");
    }

    @Test
    void nonPositiveFaceIsRejectedWith400() throws Exception {
        String secret = "test-secret-0123456789-0123456789-0123456789";
        String token = "Bearer " + new TokenService(secret).issue("user@example.com");
        BondValuationService service = new BondValuationService(
                client(() -> "{\"rt_cd\":\"0\",\"output1\":[]}"));
        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new BondValuationController(new InMemoryAssetLedger(),
                        new KisCredentialsService(new InMemoryKisCredentialsLedger(),
                                new CardImportCipher("test", null)), service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(secret)))
                .build();

        mvc.perform(get("/api/v1/investments/accounts/4/bond-valuation?pdno=KR103502GEC4&face=0")
                        .header("Authorization", token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
    }

    @Test
    void missingCredentialsReturns200WithError() throws Exception {
        String secret = "test-secret-0123456789-0123456789-0123456789";
        String token = "Bearer " + new TokenService(secret).issue("user@example.com");
        BondValuationService service = new BondValuationService(
                client(() -> "{\"rt_cd\":\"0\",\"output1\":[]}"));
        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new BondValuationController(new InMemoryAssetLedger(),
                        new KisCredentialsService(new InMemoryKisCredentialsLedger(),
                                new CardImportCipher("test", null)), service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(secret)))
                .build();

        mvc.perform(get("/api/v1/investments/accounts/4/bond-valuation?pdno=KR103502GEC4&face=1000000")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.error").value("KIS 자격증명이 없습니다"));
    }
}
