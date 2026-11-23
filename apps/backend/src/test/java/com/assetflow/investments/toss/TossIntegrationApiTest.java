package com.assetflow.investments.toss;

import com.assetflow.auth.TokenService;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.InMemoryInvestmentLedger;
import com.assetflow.investments.PortfolioService;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.InMemoryUserSettingsLedger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 이슈 #55 Stage 1 토스증권 연동 API: 저장/조회/삭제, test 3경우(성공·자격증명 없음·비활성).
 * 응답 어디에도 clientSecret 평문이 없어야 한다.
 */
class TossIntegrationApiTest {

    private static final String JWT_SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(JWT_SECRET).issue("user@example.com");
    private static final String CLIENT_ID = "toss-client-id-0001";
    private static final String CLIENT_SECRET = "toss-client-secret-9999";
    private static final long ACCOUNT_ID = 7L;

    /** Stage 1 의 test 는 클라이언트 계약만 호출한다 — fake 로 대체해 실제 HTTP 없이 확인한다. */
    private static final class FakeTossApiClient implements TossApiClient {
        private final List<TossCredentials> calls = new ArrayList<>();

        @Override
        public void verify(TossCredentials credentials) {
            calls.add(credentials);
        }

        @Override
        public List<TossAccount> accounts(TossCredentials credentials) {
            throw new UnsupportedOperationException("not used in this test");
        }

        @Override
        public TossHoldings holdings(TossCredentials credentials) {
            throw new UnsupportedOperationException("not used in this test");
        }

        @Override
        public java.math.BigDecimal usdKrwRate(TossCredentials credentials) {
            throw new UnsupportedOperationException("not used in this test");
        }

        @Override
        public TossApiClient.TokenDiagnosis diagnoseToken(TossCredentials credentials) {
            return new TossApiClient.TokenDiagnosis(200, null, null, null);
        }
    }

    private InMemoryTossCredentialsLedger ledger;
    private TossCredentialsService credentials;
    private FakeTossApiClient client;
    private TossProperties properties;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        ledger = new InMemoryTossCredentialsLedger();
        credentials = new TossCredentialsService(ledger, new CardImportCipher("test-key", null));
        client = new FakeTossApiClient();
        properties = new TossProperties();
        properties.setEnabled(true);
        InMemoryAssetLedger assets = new InMemoryAssetLedger();
        InMemoryInvestmentLedger holdings = new InMemoryInvestmentLedger();
        mvc = MockMvcBuilders
                .standaloneSetup(new TossIntegrationController(credentials, client,
                        new TossSyncService(credentials, client, assets, holdings,
                                new PortfolioService(assets, holdings)),
                        properties,
                        new InMemoryUserSettingsLedger(), new AuthEmailResolver()))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(JWT_SECRET)))
                .build();
    }

    @Test
    void getIsNotConfiguredBeforeSave() throws Exception {
        mvc.perform(get("/api/v1/integrations/toss").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false))
                .andExpect(jsonPath("$.data.accountId").doesNotExist())
                .andExpect(jsonPath("$.data.hasAccountSeq").value(false));
    }

    @Test
    void putStoresEncryptedCredentialsAndNeverExposesSecret() throws Exception {
        mvc.perform(put("/api/v1/integrations/toss").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accountId\":" + ACCOUNT_ID
                                + ",\"clientId\":\"" + CLIENT_ID + "\""
                                + ",\"clientSecret\":\"" + CLIENT_SECRET + "\""
                                + ",\"tossAccountSeq\":\"seq-1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.accountId").value(ACCOUNT_ID))
                .andExpect(jsonPath("$.data.hasAccountSeq").value(true))
                .andExpect(jsonPath("$.data.clientSecret").doesNotExist())
                .andExpect(jsonPath("$.data.clientId").doesNotExist())
                .andExpect(content().string(not(containsString(CLIENT_SECRET))))
                .andExpect(content().string(not(containsString(CLIENT_ID))));

        // 원장에는 암호문만 남는다.
        TossCredentials stored = ledger.findByUserId(1L).orElseThrow();
        assertThat(stored.clientId()).isNotEqualTo(CLIENT_ID);
        assertThat(stored.clientSecret()).isNotEqualTo(CLIENT_SECRET);

        mvc.perform(get("/api/v1/integrations/toss").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.accountId").value(ACCOUNT_ID))
                .andExpect(content().string(not(containsString(CLIENT_SECRET))));
    }

    @Test
    void deleteRemovesCredentials() throws Exception {
        mvc.perform(put("/api/v1/integrations/toss").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + CLIENT_ID + "\",\"clientSecret\":\""
                                + CLIENT_SECRET + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.accountId").doesNotExist());

        mvc.perform(delete("/api/v1/integrations/toss").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false));

        mvc.perform(get("/api/v1/integrations/toss").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false));
    }

    @Test
    void testReturnsOkWithDecryptedCredentials() throws Exception {
        mvc.perform(put("/api/v1/integrations/toss").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + CLIENT_ID + "\",\"clientSecret\":\""
                                + CLIENT_SECRET + "\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/integrations/toss/test").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true));

        // 서비스 경계 안에서만 평문이 복원된다.
        assertThat(client.calls).hasSize(1);
        assertThat(client.calls.get(0).clientId()).isEqualTo(CLIENT_ID);
        assertThat(client.calls.get(0).clientSecret()).isEqualTo(CLIENT_SECRET);
    }

    @Test
    void testReturns404WhenCredentialsMissing() throws Exception {
        mvc.perform(post("/api/v1/integrations/toss/test").header("Authorization", TOKEN))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.details").value("토스 자격증명이 없습니다"));
    }

    @Test
    void testReturns503WhenIntegrationDisabled() throws Exception {
        properties.setEnabled(false);

        mvc.perform(put("/api/v1/integrations/toss").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"" + CLIENT_ID + "\",\"clientSecret\":\""
                                + CLIENT_SECRET + "\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/integrations/toss/test").header("Authorization", TOKEN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("TOSS_NOT_CONFIGURED"))
                .andExpect(jsonPath("$.details").value(
                        "토스 연동이 비활성화되어 있습니다(app.toss.enabled)"));

        assertThat(client.calls).isEmpty();
    }

    @Test
    void putRejectsBlankCredentials() throws Exception {
        mvc.perform(put("/api/v1/integrations/toss").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\":\"  \",\"clientSecret\":\"secret\"}"))
                .andExpect(status().isBadRequest());
    }
}
