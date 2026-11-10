package com.assetflow.investments.upbit;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.investments.CryptoQuoteService;
import com.assetflow.investments.InMemoryInvestmentLedger;
import com.assetflow.investments.InvestmentLedger;
import com.assetflow.investments.PortfolioService;
import com.assetflow.investments.QuoteService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * UPBIT-2 동기화 규칙: '업비트' 계좌 자동 생성/재사용, 심볼 upsert(중복 0),
 * KRW·비KRW unit·0수량 skip, 공개 시세 우선.
 */
class UpbitSyncServiceTest {

    private static final class FakeAccounts implements UpbitAccountClient {
        @Override
        public List<UpbitAccount> accounts(UpbitCredentials creds) {
            return List.of(
                    new UpbitAccount("BTC", new BigDecimal("0.5"), BigDecimal.ZERO,
                            new BigDecimal("90000000"), "KRW"),
                    // 현금(KRW) — skip
                    new UpbitAccount("KRW", new BigDecimal("120000"), BigDecimal.ZERO,
                            BigDecimal.ONE, "KRW"),
                    // unit_currency 가 KRW 가 아님 — skip
                    new UpbitAccount("USDT", new BigDecimal("10"), BigDecimal.ZERO,
                            new BigDecimal("1300"), "USDT"),
                    // 수량 0 — skip
                    new UpbitAccount("ETH", BigDecimal.ZERO, BigDecimal.ZERO,
                            new BigDecimal("3000000"), "KRW"));
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

    @Test
    void createsUpbitAccountAndUpsertsCryptoWithoutDuplicates() {
        AssetLedger assets = new InMemoryAssetLedger();
        InvestmentLedger holdings = new InMemoryInvestmentLedger();
        PortfolioService portfolioService = new PortfolioService(assets, holdings);
        UpbitCredentialsService credentials = new UpbitCredentialsService(
                new InMemoryUpbitCredentialsLedger(), new CardImportCipher("test-key", null));
        credentials.save(1L, new UpbitCredentials("access-key-1234", "secret-key-5678"));

        UpbitSyncService service = new UpbitSyncService(credentials, new FakeAccounts(), assets,
                holdings, new FakeCryptoQuotes(), portfolioService);

        UpbitSyncService.SyncResult first = service.sync(1L);

        assertThat(first.created()).isEqualTo(1);
        assertThat(first.updated()).isZero();
        assertThat(first.skipped()).isEqualTo(3);

        AssetLedger.AssetRow upbit = assets.all().stream()
                .filter(row -> "invest".equals(row.accountType()) && "업비트".equals(row.name()))
                .findFirst().orElseThrow();
        assertThat(upbit.id()).isEqualTo(first.accountId());

        InvestmentLedger.HoldingRow btc = holdings.all().stream()
                .filter(row -> "BTC".equals(row.symbol()))
                .findFirst().orElseThrow();
        assertThat(btc.accountId()).isEqualTo(upbit.id());
        assertThat(btc.assetClass()).isEqualTo("crypto");
        assertThat(btc.currency()).isEqualTo("KRW");
        assertThat(btc.quantity()).isEqualByComparingTo(new BigDecimal("0.5"));
        assertThat(btc.avgPrice()).isEqualByComparingTo(new BigDecimal("90000000"));
        assertThat(btc.marketPrice()).isEqualByComparingTo(new BigDecimal("100642000"));
        assertThat(btc.priceAsOf()).isEqualTo("2026-11-10");
        assertThat(btc.fxRate()).isEqualByComparingTo(BigDecimal.ONE);

        // 재실행: 같은 계좌/같은 행을 update, create 0.
        UpbitSyncService.SyncResult second = service.sync(1L);

        assertThat(second.accountId()).isEqualTo(first.accountId());
        assertThat(second.created()).isZero();
        assertThat(second.updated()).isEqualTo(1);
        assertThat(second.skipped()).isEqualTo(3);
        long cryptoRows = holdings.all().stream()
                .filter(row -> row.accountId() == upbit.id() && "crypto".equals(row.assetClass()))
                .count();
        assertThat(cryptoRows).isEqualTo(1);
        assertThat(second.portfolio().holdings())
                .anySatisfy(row -> {
                    assertThat(row.symbol()).isEqualTo("BTC");
                    assertThat(row.marketPrice()).isEqualByComparingTo(new BigDecimal("100642000"));
                });
    }
}
