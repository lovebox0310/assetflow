package com.assetflow.investments;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import com.assetflow.investments.kis.InMemoryKisCredentialsLedger;
import com.assetflow.investments.kis.KisAccountMappingService;
import com.assetflow.investments.kis.KisCredentialsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * §54.4 시세 API: 외부 호출은 {@link QuoteService}·{@link CryptoQuoteService} 뒤에 있으므로
 * 테스트는 대역으로 검증한다 — 갱신 규칙(통화 일치·코인은 업비트)과 실패 시 404 가 계약이다.
 */
class InvestmentQuoteApiTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");

    /** 테스트마다 새 인스턴스(JUnit) — 시드 4종목 기준선이 유지된다. */
    private final InvestmentLedger ledger = new InMemoryInvestmentLedger();
    private MockMvc mvc;

    /** 시드 4종목 중 삼성전자(국내)·애플(해외)만 시세가 있고 코인·ETF 는 없는 상황. */
    private static final class FakeQuotes implements QuoteService {
        private final Map<String, Quote> quotes = Map.of(
                "005930", new Quote("005930", "005930", "삼성전자", "KRW",
                        new BigDecimal("244000"), "2026-10-28"),
                "AAPL", new Quote("AAPL", "AAPL.O", "애플", "USD",
                        new BigDecimal("347.10"), "2026-10-27"));

        @Override
        public Optional<Quote> quote(String symbol) {
            return Optional.ofNullable(quotes.get(symbol));
        }

        @Override
        public Optional<FxRate> fxRate(String currency) {
            return "USD".equalsIgnoreCase(currency)
                    ? Optional.of(new FxRate("USD", new BigDecimal("1339.00"), "2026-10-28"))
                    : Optional.empty();
        }
    }

    /** 업비트 대역 — BTC/KRW 만 시세가 있고 나머지는 실패(empty)로 둔다. */
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

    @BeforeEach
    void setUp() {
        AssetLedger assets = new InMemoryAssetLedger();
        KisCredentialsService kisCredentialsService = new KisCredentialsService(
                new InMemoryKisCredentialsLedger(), new CardImportCipher("test", null));
        mvc = MockMvcBuilders
                .standaloneSetup(new InvestmentController(ledger, assets,
                                new PortfolioService(assets, ledger), null,
                                new KisAccountMappingService(assets, kisCredentialsService), kisCredentialsService),
                        new InvestmentQuoteController(new FakeQuotes(), new FakeCryptoQuotes(), ledger,
                                new PortfolioService(assets, ledger)))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();
    }

    @Test
    void quoteIsReturnedWithCurrencyAndTradingDate() throws Exception {
        mvc.perform(get("/api/v1/investments/quotes?symbol=005930").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.symbol").value("005930"))
                .andExpect(jsonPath("$.data.name").value("삼성전자"))
                .andExpect(jsonPath("$.data.currency").value("KRW"))
                .andExpect(jsonPath("$.data.price").value(244000))
                .andExpect(jsonPath("$.data.priceAsOf").value("2026-10-28"));
    }

    @Test
    void unknownSymbolIsNotFound() throws Exception {
        mvc.perform(get("/api/v1/investments/quotes?symbol=NOPE").header("Authorization", TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    void usdKrwRateIsReturnedAndOtherCurrenciesAreNotFound() throws Exception {
        mvc.perform(get("/api/v1/investments/fx?currency=USD").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.currency").value("USD"))
                .andExpect(jsonPath("$.data.rate").value(1339.00));

        mvc.perform(get("/api/v1/investments/fx?currency=EUR").header("Authorization", TOKEN))
                .andExpect(status().isNotFound());
    }

    @Test
    void refreshUpdatesOnlyHoldingsWithMatchingCurrencyQuote() throws Exception {
        mvc.perform(post("/api/v1/investments/quotes/refresh").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                // 삼성전자만 국내 시세로 갱신된다 (KODEX·국고채는 시세 없음)
                .andExpect(jsonPath("$.data.holdings[0].marketPrice").value(244000))
                .andExpect(jsonPath("$.data.holdings[0].priceAsOf").value("2026-10-28"))
                // 애플은 달러 시세 + 기존 환율 1300 유지
                .andExpect(jsonPath("$.data.holdings[3].marketPrice").value(347.10))
                .andExpect(jsonPath("$.data.holdings[3].priceAsOf").value("2026-10-27"))
                // 키움: 1,300,000 + 48,800,000 + 9,600,000 + 5,100,000
                .andExpect(jsonPath("$.data.accounts[0].totalValue").value(64_800_000));
    }

    @Test
    void refreshUpdatesCryptoHoldingWithUpbitQuote() throws Exception {
        ledger.create(new InvestmentLedger.HoldingRow(0, 4, "crypto", "BTC", "비트코인", "KRW",
                new BigDecimal("0.5"), new BigDecimal("90000000"), new BigDecimal("90000000"),
                BigDecimal.ONE, "2026-10-24"));

        mvc.perform(post("/api/v1/investments/quotes/refresh").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.holdings.length()").value(5))
                .andExpect(jsonPath("$.data.holdings[4].symbol").value("BTC"))
                .andExpect(jsonPath("$.data.holdings[4].marketPrice").value(100642000))
                .andExpect(jsonPath("$.data.holdings[4].priceAsOf").value("2026-11-10"));
    }

    @Test
    void cryptoWithNonKrwCurrencyIsSkipped() throws Exception {
        // 업비트는 KRW 마켓만 조회한다 — USD 보유는 USDT 페어로 오매핑하지 않고 건너뛴다.
        ledger.create(new InvestmentLedger.HoldingRow(0, 5, "crypto", "ETH", "이더리움", "USD",
                new BigDecimal("2"), new BigDecimal("3000"), new BigDecimal("3500"),
                new BigDecimal("1300"), "2026-10-24"));

        mvc.perform(post("/api/v1/investments/quotes/refresh").header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.holdings[4].symbol").value("ETH"))
                .andExpect(jsonPath("$.data.holdings[4].marketPrice").value(3500))
                .andExpect(jsonPath("$.data.holdings[4].priceAsOf").value("2026-10-24"));
    }

    @Test
    void refreshKeepsBondIssueAndMaturityDates() throws Exception {
        // 시세가 있는 심볼(005930)을 쓰되 자산군은 bond — 가격만 갱신되고 날짜는 보존돼야 한다.
        InvestmentLedger.HoldingRow bond = ledger.create(new InvestmentLedger.HoldingRow(
                0, 4, "bond", "005930", "국고채 실험", "KRW",
                new BigDecimal("10"), new BigDecimal("50000"), new BigDecimal("51000"),
                BigDecimal.ONE, "2026-10-24",
                LocalDate.parse("2024-03-12"), LocalDate.parse("2034-03-12")));

        mvc.perform(post("/api/v1/investments/quotes/refresh").header("Authorization", TOKEN))
                .andExpect(status().isOk());

        InvestmentLedger.HoldingRow reloaded = ledger.all().stream()
                .filter(row -> row.id() == bond.id())
                .findFirst().orElseThrow();
        assertThat(reloaded.marketPrice()).isEqualByComparingTo(new BigDecimal("244000"));
        assertThat(reloaded.issueDate()).isEqualTo(LocalDate.parse("2024-03-12"));
        assertThat(reloaded.maturityDate()).isEqualTo(LocalDate.parse("2034-03-12"));
    }

    @Test
    void refreshRequiresToken() throws Exception {
        mvc.perform(post("/api/v1/investments/quotes/refresh"))
                .andExpect(status().isUnauthorized());
    }
}
