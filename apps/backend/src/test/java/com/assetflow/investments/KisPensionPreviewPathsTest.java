package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.kis.InMemoryKisCredentialsLedger;
import com.assetflow.investments.kis.KisApiClient;
import com.assetflow.investments.kis.KisApiException;
import com.assetflow.investments.kis.KisBalanceService;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 연금 진단이 <b>세 경로 원본</b>과 <b>동기화가 쓸 경로(usedPath)</b>를 함께 돌려주는지 확인한다.
 *
 * <p>목적: "KIS 가 실제로 0 을 보냈는가" 와 "우리 파싱이 0 으로 만드는가" 를 화면에서
 * 구분하기 위해서는 TTTC8434R · CTRP6548R · TTTC2208R 원본이 모두 필요하다.
 * 한 경로가 실패해도 진단은 200 이어야 한다.</p>
 */
class KisPensionPreviewPathsTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");
    /** InMemoryAssetLedger 시드의 invest 계좌. */
    private static final long ACCOUNT_ID = 4L;
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static JsonNode json(String body) {
        try {
            return MAPPER.readTree(body);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** 주식잔고(TTTC8434R) — 예수금 1,000,000 + 보유 1종목. */
    private static final String STOCK_BODY = """
            {"rt_cd":"0","msg":"정상","output1":[
              {"pdno":"005930","prdt_name":"삼성전자","hldg_qty":"10","pchs_avg_pric":"70000",
               "prpr":"75000","evlu_amt":"750000","evlu_pfls_amt":"50000"}
            ],"output2":[{"dnca_tot_amt":"1,000,000","tot_evlu_amt":"1,750,000"}]}
            """;

    /** 계좌자산현황(CTRP6548R) — 예수금만. */
    private static final String ACCOUNT_BODY = """
            {"rt_cd":"0","output1":[],"output2":[{"dnca_tot_amt":"1,000,000"}]}
            """;

    /** 퇴직연금(TTTC2208R) — 비어 있는 응답(운영 사례). */
    private static final String EMPTY_PENSION_BODY = """
            {"rt_cd":"0","msg":"","output1":[],"output2":{}}
            """;

    /** 퇴직연금(TTTC2208R) — 값이 온 응답(IRP 정상). */
    private static final String IRP_PENSION_BODY = """
            {"rt_cd":"0","msg":"","output1":[
              {"pdno":"458730","prdt_name":"TIGER 미국배당다우존스","hldg_qty":"358",
               "pchs_avg_pric":"14693","prpr":"15250","evlu_amt":"5459500","evlu_pfls_amt":"199406"}
            ],"output2":[{"dnca_tot_amt":"500000","tot_evlu_amt":"5959500"}]}
            """;

    /**
     * 식별 필드가 섞여 온 주식잔고 응답 — 계좌번호·고객ID·주민번호는 진단 응답에 원문으로
     * 나가면 안 된다. 금액·종목코드는 진단 목적이므로 그대로 남아야 한다.
     */
    private static final String STOCK_BODY_WITH_IDENTIFIERS = """
            {"rt_cd":"0","msg":"정상","msg1":"계좌 64116780 조회",
             "output1":[{"pdno":"005930","prdt_name":"삼성전자","hldg_qty":"10",
              "pchs_avg_pric":"70000","prpr":"75000","evlu_amt":"750000","evlu_pfls_amt":"50000"}],
             "output2":[{"dnca_tot_amt":"1,000,000","tot_evlu_amt":"1,750,000",
              "cano":"64116780","acnt_no":"64116780-01","cust_id":"redbox9","rrno":"900101-1234567"}]}
            """;

    /** 퇴직연금(TTTC2208R) — 식별 필드가 섞여 오는 경우(마스킹 대상). */
    private static final String PENSION_BODY_WITH_IDENTIFIERS = """
            {"rt_cd":"0","msg":"","msg_cd":"KIOK0560","output1":[],
             "output2":[{"dnca_tot_amt":"0","cano":"64116780","cust_id":"redbox9"}]}
            """;

    /**
     * 상품코드별로 컨트롤러를 세운다. {@code handler} 는 path 를 받아 원본 JSON 을 돌려주거나
     * {@link KisApiException} 으로 실패한다(실전처럼).
     */
    private MockMvc wire(String productCode, Function<String, JsonNode> handler) {
        AssetLedger assets = new InMemoryAssetLedger();
        InvestmentLedger ledger = new InMemoryInvestmentLedger();
        KisCredentialsService credentialsService = new KisCredentialsService(
                new InMemoryKisCredentialsLedger(), new CardImportCipher("test", null));
        credentialsService.save(1L, new KisCredentials(
                ACCOUNT_ID, "key", "secret", "https://openapi.koreainvestment.com:9443",
                "64116780", productCode));

        KisApiClient client = new KisApiClient() {
            @Override
            public JsonNode get(KisCredentials credentials, String path,
                                Map<String, String> params, String trId) {
                return handler.apply(path);
            }

            @Override
            public JsonNode post(KisCredentials credentials, String path,
                                 Map<String, String> params, Object body, String trId) {
                throw new UnsupportedOperationException();
            }
        };

        return MockMvcBuilders
                .standaloneSetup(new InvestmentController(ledger, assets,
                        new PortfolioService(assets, ledger), new KisBalanceService(client), null,
                        credentialsService))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    private JsonNode previewData(MockMvc mvc) throws Exception {
        MvcResult result = mvc.perform(post("/api/v1/investments/accounts/" + ACCOUNT_ID
                        + "/kis-pension-preview")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andReturn();
        return MAPPER.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("data");
    }

    @Test
    void previewReturnsRawJsonForAllThreePaths() throws Exception {
        MockMvc mvc = wire("22", path -> {
            if (path.contains("trading/inquire-balance")) return json(STOCK_BODY);
            if (path.contains("trading/inquire-account-balance")) return json(ACCOUNT_BODY);
            return json(EMPTY_PENSION_BODY);
        });

        JsonNode data = previewData(mvc);

        // 1) 세 경로가 모두 원본으로 담긴다.
        assertThat(data.path("stock").path("response").path("rt_cd").asText()).isEqualTo("0");
        assertThat(data.path("stock").path("response").path("output1").get(0)
                .path("pdno").asText()).isEqualTo("005930");
        assertThat(data.path("stock").path("trId").asText()).isEqualTo("TTTC8434R");
        assertThat(data.path("account").path("response").path("output2").get(0)
                .path("dnca_tot_amt").asText()).isEqualTo("1,000,000");
        assertThat(data.path("account").path("trId").asText()).isEqualTo("CTRP6548R");
        assertThat(data.path("pension").path("trId").asText()).isEqualTo("TTTC2208R");
        // 비어 있는 퇴직연금 원본은 error 가 아니라 response 로 그대로 온다(0 과 구분용).
        assertThat(data.path("pension").path("response").path("output2").isObject()).isTrue();
        assertThat(data.path("pension").path("error").isNull()).isTrue();
        // 기존 계약 — balance 는 퇴직연금 원본과 같은 데이터.
        assertThat(data.path("balance").path("rt_cd").asText()).isEqualTo("0");
        assertThat(data.path("acntPrdtCd").asText()).isEqualTo("22");
        // 회귀: 유량성 문구가 없으면 transient 는 false.
        assertThat(data.path("transient").asBoolean()).isFalse();
    }

    /** §126 — 진단 1회 KIS 호출은 경로당 1회(총 3회)다. 경로 선택은 응답을 재사용한다. */
    @Test
    void previewMakesExactlyOneCallPerPath() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        MockMvc mvc = wire("22", path -> {
            calls.incrementAndGet();
            if (path.contains("inquire-account-balance")) return json(ACCOUNT_BODY);
            if (path.contains("trading/inquire-balance")) return json(STOCK_BODY);
            return json(EMPTY_PENSION_BODY);
        });

        JsonNode data = previewData(mvc);

        assertThat(calls.get()).isEqualTo(3);
        // 경로 판정은 재사용한 응답으로 하므로 기존과 같다(회귀).
        assertThat(data.path("usedPath").asText()).isEqualTo("stock");
        assertThat(data.path("balancePreview").path("cash").asLong()).isEqualTo(1_000_000L);
    }

    /** 세 경로가 모두 실패해 최후 수단까지 가도 재호출하지 않는다(예전 6회). */
    @Test
    void previewStillMakesThreeCallsWhenEveryPathFails() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        MockMvc mvc = wire("22", path -> {
            calls.incrementAndGet();
            throw new KisApiException("MCI전송 오류");
        });

        JsonNode data = previewData(mvc);

        assertThat(calls.get()).isEqualTo(3);
        assertThat(data.path("usedPath").asText()).isEqualTo("unknown");
        // 유량성 문구 → 화면이 "일시적 오류" 안내를 띄울 수 있어야 한다.
        assertThat(data.path("transient").asBoolean()).isTrue();
    }

    /** AC2 — 계좌번호·고객ID·주민번호는 원문으로 나가지 않는다. 진단 필드는 남는다. */
    @Test
    void previewMasksAccountIdentifiersButKeepsDiagnosticFields() throws Exception {
        MockMvc mvc = wire("22", path -> {
            if (path.contains("inquire-account-balance")) return json(ACCOUNT_BODY);
            if (path.contains("trading/inquire-balance")) return json(STOCK_BODY_WITH_IDENTIFIERS);
            return json(PENSION_BODY_WITH_IDENTIFIERS);
        });

        JsonNode data = previewData(mvc);
        JsonNode summary = data.path("stock").path("response").path("output2").get(0);

        // 마스킹 형태로만 존재한다(앞 2자리 유지).
        assertThat(summary.path("cano").asText()).isEqualTo("64****");
        assertThat(summary.path("acnt_no").asText()).isEqualTo("64****");
        assertThat(summary.path("cust_id").asText()).isEqualTo("re****");
        assertThat(summary.path("rrno").asText()).isEqualTo("90****");
        // 문자열에 섞여 온 계좌번호도 가린다.
        assertThat(data.path("stock").path("response").path("msg1").asText())
                .isEqualTo("계좌 64**** 조회");
        // balance(= pension.response) 도 같은 규칙으로 마스킹된다.
        assertThat(data.path("balance").path("output2").get(0).path("cano").asText())
                .isEqualTo("64****");
        assertThat(data.path("pension").path("response").path("output2").get(0)
                .path("cust_id").asText()).isEqualTo("re****");
        // 진단에 필요한 응답코드·메시지 코드는 남는다.
        assertThat(data.path("balance").path("msg_cd").asText()).isEqualTo("KIOK0560");

        // 원문 계좌번호·주민번호는 응답 어디에도 없다.
        assertThat(data.toString()).doesNotContain("64116780");
        assertThat(data.toString()).doesNotContain("900101-1234567");
        assertThat(data.toString()).doesNotContain("redbox9");

        // 진단에 필요한 정보는 그대로 남는다.
        assertThat(summary.path("dnca_tot_amt").asText()).isEqualTo("1,000,000");
        assertThat(summary.path("tot_evlu_amt").asText()).isEqualTo("1,750,000");
        assertThat(data.path("stock").path("response").path("rt_cd").asText()).isEqualTo("0");
        assertThat(data.path("stock").path("response").path("output1").get(0)
                .path("pdno").asText()).isEqualTo("005930");
        assertThat(data.path("stock").path("response").path("output1").get(0)
                .path("hldg_qty").asText()).isEqualTo("10");
    }

    /** 유량성 오류가 한 경로에만 있어도 transient 로 알린다 — §119 의 실제 증상. */
    @Test
    void transientFlowControlErrorIsFlaggedWhenOnlyOnePathFails() throws Exception {
        MockMvc mvc = wire("22", path -> {
            if (path.contains("trading/inquire-balance")) {
                throw new KisApiException("MCI전송 오류");
            }
            if (path.contains("inquire-account-balance")) return json(ACCOUNT_BODY);
            return json(EMPTY_PENSION_BODY);
        });

        JsonNode data = previewData(mvc);

        assertThat(data.path("transient").asBoolean()).isTrue();
        assertThat(data.path("usedPath").asText()).isEqualTo("account");
        assertThat(data.path("stock").path("error").asText()).contains("MCI전송");
    }

    @Test
    void usedPathIsStockWhenPersonalPensionReadsStockBalance() throws Exception {
        MockMvc mvc = wire("22", path -> {
            if (path.contains("trading/inquire-balance")) return json(STOCK_BODY);
            if (path.contains("trading/inquire-account-balance")) return json(ACCOUNT_BODY);
            return json(EMPTY_PENSION_BODY);
        });

        JsonNode data = previewData(mvc);

        assertThat(data.path("usedPath").asText()).isEqualTo("stock");
        assertThat(data.path("balancePreview").path("path").asText()).isEqualTo("stock");
        assertThat(data.path("balancePreview").path("cash").asLong()).isEqualTo(1_000_000L);
        assertThat(data.path("balancePreview").path("holdingCount").asInt()).isEqualTo(1);
        assertThat(data.path("balancePreview").path("error").isNull()).isTrue();
    }

    @Test
    void usedPathIsPensionForIrpAccount() throws Exception {
        MockMvc mvc = wire("29", path -> {
            if (path.contains("pension/inquire-balance")) return json(IRP_PENSION_BODY);
            // IRP 부가 조회(체결기준잔고·채권)는 실패해도 진단은 계속된다.
            throw new KisApiException("위탁계좌 전용: " + path);
        });

        JsonNode data = previewData(mvc);

        assertThat(data.path("usedPath").asText()).isEqualTo("pension");
        assertThat(data.path("balancePreview").path("path").asText()).isEqualTo("pension");
        assertThat(data.path("balancePreview").path("cash").asLong()).isEqualTo(500_000L);
        // 위탁 경로 원본은 실패 사유만 담기고 예외는 전파되지 않는다.
        assertThat(data.path("stock").path("response").isNull()).isTrue();
        assertThat(data.path("stock").path("error").asText()).contains("위탁계좌 전용");
        assertThat(data.path("balancePreview").path("warning").asText())
                .contains("체결기준잔고");
    }

    @Test
    void onePathFailureStillReturns200WithOtherRawResponses() throws Exception {
        MockMvc mvc = wire("22", path -> {
            if (path.contains("trading/inquire-balance")) {
                throw new KisApiException("주식잔고 TR 거부(EGW00002)");
            }
            if (path.contains("trading/inquire-account-balance")) return json(ACCOUNT_BODY);
            return json(EMPTY_PENSION_BODY);
        });

        JsonNode data = previewData(mvc);

        assertThat(data.path("stock").path("response").isNull()).isTrue();
        assertThat(data.path("stock").path("error").asText()).contains("EGW00002");
        assertThat(data.path("account").path("response").path("rt_cd").asText()).isEqualTo("0");
        assertThat(data.path("pension").path("response").path("rt_cd").asText()).isEqualTo("0");
        // 주식잔고는 실패했지만 계좌자산현황이 예수금을 읽었으므로 sync 경로는 account 다.
        assertThat(data.path("usedPath").asText()).isEqualTo("account");
        // EGW00002 는 유량성 문구가 아니다 — transient 를 잘못 켜지 않는다.
        assertThat(data.path("transient").asBoolean()).isFalse();
    }
}
