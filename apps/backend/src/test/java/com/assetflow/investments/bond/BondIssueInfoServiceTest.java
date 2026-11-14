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

/** BOND-INFO-1 KIS 발행정보 매핑·실패 처리. */
class BondIssueInfoServiceTest {

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

    private static JsonNode json(String body) {
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void mapsIssueInfoFieldsAndCreditRatingFallback() {
        String body = """
                {"rt_cd":"0","output":{
                  "prdt_name":"국고03000-3412(24-13)",
                  "issu_istt_name":"기획재정부",
                  "srfc_inrt":"3.00000000",
                  "issu_dt":"20241210",
                  "expd_dt":"20341210",
                  "bond_cls_kor_name":"국고채",
                  "kis_crdt_grad_text":"",
                  "kbp_crdt_grad_text":"AAA",
                  "nice_crdt_grad_text":"AA+",
                  "fnp_crdt_grad_text":"AAA"
                }}
                """;
        BondIssueInfoService service = new BondIssueInfoService(client(() -> body));

        BondIssueInfoService.BondIssueInfo info = service.fetch(CREDENTIALS, "KR103502GEC4");

        assertThat(info.error()).isNull();
        assertThat(info.issuerName()).isEqualTo("기획재정부");
        assertThat(info.couponRate()).isEqualByComparingTo(new BigDecimal("3.0"));
        assertThat(info.issueDate()).isEqualTo(LocalDate.parse("2024-12-10"));
        assertThat(info.maturityDate()).isEqualTo(LocalDate.parse("2034-12-10"));
        assertThat(info.bondClass()).isEqualTo("국고채");
        assertThat(info.creditRating()).isEqualTo("AAA");
    }

    @Test
    void kisFailureReturnsErrorInsteadOfThrowing() {
        KisApiClient api = new KisApiClient() {
            @Override
            public JsonNode get(KisCredentials c, String path, Map<String, String> params, String trId) {
                throw new KisApiException("EGW00002 발행정보 조회 실패");
            }

            @Override
            public JsonNode post(KisCredentials c, String path, Map<String, String> params,
                                 Object requestBody, String trId) {
                throw new UnsupportedOperationException();
            }
        };

        BondIssueInfoService.BondIssueInfo info =
                new BondIssueInfoService(api).fetch(CREDENTIALS, "KR103502GEC4");

        assertThat(info.error()).contains("채권 발행정보를 가져오지 못했습니다").contains("EGW00002");
        assertThat(info.issuerName()).isNull();
        assertThat(info.couponRate()).isNull();
    }

    @Test
    void missingCredentialsReturns200WithError() throws Exception {
        String secret = "test-secret-0123456789-0123456789-0123456789";
        String token = "Bearer " + new TokenService(secret).issue("user@example.com");
        InMemoryAssetLedger assets = new InMemoryAssetLedger();
        KisCredentialsService credentials = new KisCredentialsService(
                new InMemoryKisCredentialsLedger(), new CardImportCipher("test", null));
        BondIssueInfoService service = new BondIssueInfoService(
                client(() -> "{\"rt_cd\":\"0\",\"output\":{}}"));

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new BondIssueInfoController(assets, credentials, service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(secret)))
                .build();

        mvc.perform(get("/api/v1/investments/accounts/4/bond-issue-info?pdno=KR103502GEC4")
                        .header("Authorization", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.error").value("KIS 자격증명이 없습니다"))
                .andExpect(jsonPath("$.data.issuerName").value(org.hamcrest.Matchers.nullValue()));
    }
}
