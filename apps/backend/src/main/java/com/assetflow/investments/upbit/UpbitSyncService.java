package com.assetflow.investments.upbit;

import com.assetflow.assets.AssetLedger;
import com.assetflow.investments.CryptoQuoteService;
import com.assetflow.investments.InvestmentLedger;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService;
import com.assetflow.investments.QuoteService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * 업비트 보유 자산을 '업비트' invest 계좌/보유종목으로 동기화한다 (UPBIT-2).
 *
 * 규칙:
 * - 자격증명이 없으면 {@link UpbitNotConfiguredException}.
 * - 계좌: invest 이면서 이름이 "업비트"(공백 무시)인 행을 재사용하고, 없으면 만든다.
 * - 코인: currency KRW(현금) skip, unit_currency != KRW skip, balance+locked <= 0 skip.
 * - 심볼(대문자) 기준 upsert — 같은 심볼이 이미 있으면 update, 없으면 create. 중복 생성 없음.
 * - 현재가: 업비트 공개 시세 우선 → 기존 저장가 → 평단가. 기준일도 같은 우선순위.
 * - **삭제하지 않는다** — 업비트에서 사라진 종목도 사용자의 기록으로 보존한다.
 */
@Service
public class UpbitSyncService {

    public record SyncResult(PortfolioService.Portfolio portfolio, long accountId,
                             int created, int updated, int skipped) {}

    private static final String ACCOUNT_NAME = "업비트";

    private final UpbitCredentialsService credentials;
    private final UpbitAccountClient client;
    private final AssetLedger assets;
    private final InvestmentLedger holdings;
    private final CryptoQuoteService cryptoQuotes;
    private final PortfolioService portfolioService;

    public UpbitSyncService(UpbitCredentialsService credentials, UpbitAccountClient client,
                            AssetLedger assets, InvestmentLedger holdings,
                            CryptoQuoteService cryptoQuotes, PortfolioService portfolioService) {
        this.credentials = credentials;
        this.client = client;
        this.assets = assets;
        this.holdings = holdings;
        this.cryptoQuotes = cryptoQuotes;
        this.portfolioService = portfolioService;
    }

    public SyncResult sync(long userId) {
        UpbitCredentials creds = credentials.findDecrypted(userId)
                .orElseThrow(() -> new UpbitNotConfiguredException("upbit credentials are not configured"));
        List<UpbitAccount> accounts = client.accounts(creds);

        AssetLedger.AssetRow account = assets.all().stream()
                .filter(row -> "invest".equals(row.accountType()))
                .filter(row -> row.name() != null && row.name().trim().equalsIgnoreCase(ACCOUNT_NAME))
                .findFirst()
                .orElseGet(() -> assets.create("invest", ACCOUNT_NAME, ACCOUNT_NAME, 0, false, null));

        Map<String, HoldingRow> existing = new HashMap<>();
        for (HoldingRow row : holdings.all()) {
            if (row.accountId() == account.id() && "crypto".equals(row.assetClass())
                    && row.symbol() != null) {
                existing.put(row.symbol().toUpperCase(Locale.ROOT), row);
            }
        }

        int created = 0;
        int updated = 0;
        int skipped = 0;
        for (UpbitAccount upbit : accounts) {
            String currency = upbit.currency() == null ? "" : upbit.currency().trim();
            if (currency.isEmpty() || currency.equalsIgnoreCase("KRW")) {
                skipped++;
                continue;
            }
            if (!"KRW".equalsIgnoreCase(upbit.unitCurrency())) {
                skipped++;
                continue;
            }
            BigDecimal quantity = nullToZero(upbit.balance()).add(nullToZero(upbit.locked()));
            if (quantity.signum() <= 0) {
                skipped++;
                continue;
            }

            String symbol = currency.toUpperCase(Locale.ROOT);
            HoldingRow previous = existing.get(symbol);
            Optional<QuoteService.Quote> quote = cryptoQuotes.quote(symbol, "KRW");

            BigDecimal marketPrice = quote.map(QuoteService.Quote::price)
                    .filter(price -> price != null && price.signum() > 0)
                    .orElseGet(() -> previousMarketPrice(previous, upbit.avgBuyPrice()));
            String priceAsOf = quote.map(QuoteService.Quote::priceAsOf)
                    .filter(value -> value != null && !value.isBlank())
                    .orElseGet(() -> previousPriceAsOf(previous));
            BigDecimal avgPrice = upbit.avgBuyPrice() != null && upbit.avgBuyPrice().signum() > 0
                    ? upbit.avgBuyPrice()
                    : previousAvgPrice(previous, marketPrice);
            String name = previous != null && previous.name() != null && !previous.name().isBlank()
                    ? previous.name()
                    : symbol;

            HoldingRow row = new HoldingRow(
                    previous == null ? 0 : previous.id(), account.id(), "crypto", symbol, name,
                    "KRW", quantity, avgPrice, marketPrice, BigDecimal.ONE, priceAsOf);
            if (previous == null) {
                holdings.create(row);
                created++;
            } else {
                holdings.update(previous.id(), row);
                updated++;
            }
        }
        return new SyncResult(portfolioService.portfolio(), account.id(), created, updated, skipped);
    }

    private static BigDecimal nullToZero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static BigDecimal previousMarketPrice(HoldingRow previous, BigDecimal avgBuyPrice) {
        if (previous != null && previous.marketPrice() != null && previous.marketPrice().signum() > 0) {
            return previous.marketPrice();
        }
        return nullToZero(avgBuyPrice);
    }

    private static String previousPriceAsOf(HoldingRow previous) {
        if (previous != null && previous.priceAsOf() != null && !previous.priceAsOf().isBlank()) {
            return previous.priceAsOf();
        }
        return LocalDate.now().toString();
    }

    private static BigDecimal previousAvgPrice(HoldingRow previous, BigDecimal marketPrice) {
        if (previous != null && previous.avgPrice() != null && previous.avgPrice().signum() > 0) {
            return previous.avgPrice();
        }
        return marketPrice;
    }
}
