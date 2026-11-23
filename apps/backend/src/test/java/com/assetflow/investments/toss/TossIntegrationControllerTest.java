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

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 이슈 #55 Stage 2 토스 API 표면: sync / accounts / toss-preview 응답 형태와 accountNo 마스킹.
 * 실제 HTTP 는 쓰지 않는다 — {@link TossApiClient} fake 만 주입한다.
 */
class TossIntegrationControllerTest {

    private static final String JWT_SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(JWT_SECRET).issue("user@example.com");
    private static final String CLIENT_ID = "toss-client-id-0001";
    private static final String CLIENT_SECRET = "toss-client-secret-9999";
    private static final String RAW_ACCOUNT_NO = "12345678901";

    private static final class FakeTossClient implements TossApiClient {
        private boolean fail = false;

        @Override
        public void verify(TossCredentials credentials) {
        }

        @Override
        public List<TossAccount> accounts(TossCredentials credentials) {
            if (fail) {
                throw new TossApiException("ip-not-allowed");
            }
            return List.of(new TossAccount(RAW_ACCOUNT_NO, 42, "BROKERAGE"));
        }

        @Override
        public TossHoldings holdings(TossCredentials credentials) {
            if (fail) {
                throw new TossApiException("invalid-token");
            }
            return new TossHoldings(List.of(new TossHolding("005930", "삼성전자", "KR", "KRW",
                    new BigDecimal("100"), new BigDecimal("72000"), new BigDecimal("65000"),
                    new BigDecimal("7200000"), new BigDecimal("700000"), new BigDecimal("0.1077"))),
                    new BigDecimal("6500000"), new BigDecimal("7200000"));
        }

        @Override
        public BigDecimal usdKrwRate(TossCredentials credentials) {
            return new BigDecimal("1380.5");
        }
    }

    private InMemoryAssetLedger assets;
    private InMemoryInvestmentLedger holdings;
    private TossCredentialsService credentials;
    private FakeTossClient client;
    private long investAccountId;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        assets = new InMemoryAssetLedger();
        holdings = new InMemoryInvestmentLedger();
        credentials = new TossCredentialsService(new InMemoryTossCredentialsLedger(),
                new CardImportCipher("test-key", null));
        client = new FakeTossClient();
        investAccountId = assets.create("invest", "토스증권", "토스증권", 0, false, null).id();

        TossProperties properties = new TossProperties();
        properties.setEnabled(true);
        mvc = MockMvcBuilders
                .standaloneSetup(new TossIntegrationController(credentials, client,
                        new TossSyncService(credentials, client, assets, holdings,
                                new PortfolioService(assets, holdings)),
                        properties, new InMemoryUserSettingsLedger(), new AuthEmailResolver()))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(JWT_SECRET)))
                .build();
    }

    private void saveCredentials(Long accountId) {
        credentials.save(1L, new TossCredentials(accountId, CLIENT_ID, CLIENT_SECRET, "42"));
    }

    @Test
    void syncStoresHoldingsAndReturnsPortfolio() throws Exception {
        saveCredentials(investAccountId);

        mvc.perform(post("/api/v1/investments/toss/sync").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accountId").value(investAccountId))
                .andExpect(jsonPath("$.data.created").value(1))
                .andExpect(jsonPath("$.data.updated").value(0))
                .andExpect(jsonPath("$.data.skipped").value(0))
                .andExpect(jsonPath("$.data.warning").doesNotExist())
                .andExpect(jsonPath("$.data.portfolio.holdings").isArray())
                .andExpect(content().string(not(containsString(CLIENT_SECRET))));

        assertThat(holdings.all()).anySatisfy(row -> {
            assertThat(row.accountId()).isEqualTo(investAccountId);
            assertThat(row.symbol()).isEqualTo("005930");
        });
    }

    @Test
    void syncRejectsAccountOwnedByNothing() throws Exception {
        saveCredentials(9999L);

        mvc.perform(post("/api/v1/investments/toss/sync").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
    }

    @Test
    void accountsAreMaskedInDiagnostics() throws Exception {
        saveCredentials(investAccountId);

        mvc.perform(get("/api/v1/integrations/toss/accounts").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accounts[0].accountSeq").value(42))
                .andExpect(jsonPath("$.data.accounts[0].accountNo").value("12****"))
                .andExpect(jsonPath("$.data.accounts[0].accountType").value("BROKERAGE"))
                .andExpect(jsonPath("$.data.error").doesNotExist())
                .andExpect(content().string(not(containsString(RAW_ACCOUNT_NO))));
    }

    @Test
    void accountsReportErrorWith200WhenCredentialsMissing() throws Exception {
        mvc.perform(get("/api/v1/integrations/toss/accounts").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accounts").isEmpty())
                .andExpect(jsonPath("$.data.error").value("토스 자격증명이 없습니다"));
    }

    @Test
    void accountsReportApiFailureWith200() throws Exception {
        saveCredentials(investAccountId);
        client.fail = true;

        mvc.perform(get("/api/v1/integrations/toss/accounts").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.error")
                        .value(TossErrorMessages.message("ip-not-allowed")));
    }

    @Test
    void previewReturnsHoldingsWithoutWriting() throws Exception {
        saveCredentials(investAccountId);
        int before = holdings.all().size();

        mvc.perform(post("/api/v1/accounts/" + investAccountId + "/toss-preview")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.holdings.items[0].symbol").value("005930"))
                .andExpect(jsonPath("$.data.holdings.items[0].averagePurchasePrice").value(65000))
                .andExpect(jsonPath("$.data.error").doesNotExist());

        assertThat(holdings.all()).hasSize(before);
    }

    @Test
    void previewReportsApiFailureWith200() throws Exception {
        saveCredentials(investAccountId);
        client.fail = true;

        mvc.perform(post("/api/v1/accounts/" + investAccountId + "/toss-preview")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.holdings").doesNotExist())
                .andExpect(jsonPath("$.data.error")
                        .value(TossErrorMessages.message("invalid-token")));
    }

    @Test
    void previewRejectsNonInvestAccount() throws Exception {
        saveCredentials(investAccountId);

        mvc.perform(post("/api/v1/accounts/1/toss-preview").header("Authorization", TOKEN))
                .andExpect(status().isBadRequest());
    }

    @Test
    void syncRejectsWhenCredentialsMissing() throws Exception {
        mvc.perform(post("/api/v1/investments/toss/sync").header("Authorization", TOKEN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("TOSS_NOT_CONFIGURED"));
    }

    @Test
    void accountsRequiresAuthentication() throws Exception {
        mvc.perform(get("/api/v1/integrations/toss/accounts")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized());
    }
}
