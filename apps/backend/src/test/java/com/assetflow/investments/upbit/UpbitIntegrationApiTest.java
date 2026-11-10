package com.assetflow.investments.upbit;

import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.CryptoQuoteService;
import com.assetflow.investments.InMemoryInvestmentLedger;
import com.assetflow.investments.PortfolioService;
import com.assetflow.investments.QuoteService;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.InMemoryUserSettingsLedger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * UPBIT-2 연동 API: 설정 여부/마스킹/삭제, 503·502 매핑, sync 계약.
 * 응답 어디에도 secret 평문이 없어야 한다.
 */
class UpbitIntegrationApiTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");
    private static final String ACCESS_KEY = "abcd1234efgh";
    private static final String SECRET_KEY = "secret-key-9999";

    private static final class FakeAccounts implements UpbitAccountClient {
        @Override
        public List<UpbitAccount> accounts(UpbitCredentials creds) {
            return List.of(
                    new UpbitAccount("BTC", new BigDecimal("0.5"), BigDecimal.ZERO,
                            new BigDecimal("90000000"), "KRW"),
                    new UpbitAccount("KRW", new BigDecimal("1000"), BigDecimal.ZERO,
                            BigDecimal.ONE, "KRW"));
        }
    }

    private static final class FakeCryptoQuotes implements CryptoQuoteService {
        @Override
        public Optional<QuoteService.Quote> quote(String symbol, String currency) {
            if ("BTC".equalsIgnoreCase(symbol) && "KRW".equalsIgnoreCase(currency)) {
                return Optional.of(new QuoteService.Quote("BTC", "KRW-BTC", "BTC", "KRW",
                        new BigDecimal("100642000"), "2026-11-10"));
            }
            return Optional.empty();
        }
    }

    private InMemoryUpbitCredentialsLedger credentialsLedger;
    private UpbitCredentialsService credentials;
    private InMemoryAssetLedger assets;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        credentialsLedger = new InMemoryUpbitCredentialsLedger();
        credentials = new UpbitCredentialsService(
                credentialsLedger, new CardImportCipher("test-key", null));
        assets = new InMemoryAssetLedger();
        InMemoryInvestmentLedger holdings = new InMemoryInvestmentLedger();
        FakeAccounts client = new FakeAccounts();
        UpbitSyncService syncService = new UpbitSyncService(credentials, client, assets, holdings,
                new FakeCryptoQuotes(), new PortfolioService(assets, holdings));

        mvc = MockMvcBuilders
                .standaloneSetup(new UpbitIntegrationController(credentials, client, syncService,
                        new InMemoryUserSettingsLedger(), new AuthEmailResolver()))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    @Test
    void getIsNotConfiguredBeforeSave() throws Exception {
        mvc.perform(get("/api/v1/integrations/upbit").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false));
    }

    @Test
    void putStoresEncryptedKeysAndGetsMaskedAccessKeyOnly() throws Exception {
        mvc.perform(put("/api/v1/integrations/upbit").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accessKey\":\"" + ACCESS_KEY + "\",\"secretKey\":\"" + SECRET_KEY + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.accessKeyMasked").value("abcd****efgh"))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(SECRET_KEY))));

        // DB(원장)에는 암호문만 저장된다.
        UpbitCredentials stored = credentialsLedger.findByUserId(1L).orElseThrow();
        assertThat(stored.accessKey()).isNotEqualTo(ACCESS_KEY);
        assertThat(stored.secretKey()).isNotEqualTo(SECRET_KEY);
        assertThat(credentials.findDecrypted(1L).orElseThrow().secretKey()).isEqualTo(SECRET_KEY);

        mvc.perform(get("/api/v1/integrations/upbit").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(true))
                .andExpect(jsonPath("$.data.accessKeyMasked").value("abcd****efgh"))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(SECRET_KEY))))
                .andExpect(content().string(org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.containsString(ACCESS_KEY))));
    }

    @Test
    void deleteRemovesCredentials() throws Exception {
        mvc.perform(put("/api/v1/integrations/upbit").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accessKey\":\"" + ACCESS_KEY + "\",\"secretKey\":\"" + SECRET_KEY + "\"}"))
                .andExpect(status().isOk());

        mvc.perform(delete("/api/v1/integrations/upbit").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false));

        mvc.perform(get("/api/v1/integrations/upbit").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.configured").value(false));
    }

    @Test
    void testEndpointReturns503WhenNotConfigured() throws Exception {
        mvc.perform(post("/api/v1/integrations/upbit/test").header("Authorization", TOKEN))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("UPBIT_NOT_CONFIGURED"));
    }

    @Test
    void testEndpointReturnsAccountCountWhenConfigured() throws Exception {
        mvc.perform(put("/api/v1/integrations/upbit").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accessKey\":\"" + ACCESS_KEY + "\",\"secretKey\":\"" + SECRET_KEY + "\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/integrations/upbit/test").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ok").value(true))
                .andExpect(jsonPath("$.data.accounts").value(2));
    }

    @Test
    void syncCreatesUpbitInvestAccount() throws Exception {
        mvc.perform(put("/api/v1/integrations/upbit").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accessKey\":\"" + ACCESS_KEY + "\",\"secretKey\":\"" + SECRET_KEY + "\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/investments/upbit/sync").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(1))
                .andExpect(jsonPath("$.data.updated").value(0))
                .andExpect(jsonPath("$.data.skipped").value(1))
                .andExpect(jsonPath("$.data.portfolio.holdings.length()").value(5))
                .andExpect(jsonPath("$.data.portfolio.holdings[4].symbol").value("BTC"))
                .andExpect(jsonPath("$.data.portfolio.holdings[4].marketPrice").value(100642000));

        assertThat(assets.all()).anySatisfy(row -> {
            assertThat(row.accountType()).isEqualTo("invest");
            assertThat(row.name()).isEqualTo("업비트");
        });
    }

    @Test
    void putRejectsBlankKeys() throws Exception {
        mvc.perform(put("/api/v1/integrations/upbit").header("Authorization", TOKEN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"accessKey\":\"  \",\"secretKey\":\"secret\"}"))
                .andExpect(status().isBadRequest());
    }
}
