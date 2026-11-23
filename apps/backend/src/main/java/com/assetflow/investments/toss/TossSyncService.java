package com.assetflow.investments.toss;

import com.assetflow.assets.AssetLedger;
import com.assetflow.investments.InvestmentLedger;
import com.assetflow.investments.InvestmentLedger.HoldingRow;
import com.assetflow.investments.PortfolioService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 토스증권 보유자산을 invest 계좌의 보유종목으로 동기화한다 (이슈 #55 Stage 2).
 *
 * <p>규칙:</p>
 * <ul>
 *   <li>자격증명이 없으면 {@link TossNotConfiguredException}(503).</li>
 *   <li>{@code credentials.accountId()} 는 <b>존재하는 invest 계좌</b>여야 한다 — 아니면 400.
 *       (Stage 1 에 남긴 "다른 계좌 ID → 500" 구멍을 여기서 막는다.)</li>
 *   <li>{@code tossAccountSeq} 가 비어 있으면 계좌 목록을 조회해 1개면 자동 선택,
 *       여러 개면 400 + 후보 목록, 0개면 400.</li>
 *   <li>매핑: {@code marketCountry KR|US} → {@code assetClass="stock"}.
 *       ETF 판별은 이번 단계에서 하지 않는다(토스 응답에 ETF 구분 필드가 없다).</li>
 *   <li>환율: USD 종목이 있을 때만 {@code usdKrwRate} 를 부르고, 실패하면 {@code fxRate=1} +
 *       warning("환율을 읽지 못해 USD 자산을 1:1로 표시했습니다"). 예외를 던지지 않는다.</li>
 *   <li><b>삭제하지 않는다</b> — 토스 응답에 없는 종목도 사용자의 기록으로 보존한다
 *       (업비트 {@code UpbitSyncService} 와 같은 규칙). 빈 items 도 "보유 0"일 뿐 삭제 신호가 아니다(§31.4).</li>
 * </ul>
 */
@Service
public class TossSyncService {

    /**
     * 동기화 결과. {@code portfolio} 는 업비트 {@code sync} 와 같은 형태로 최신 포트폴리오를
     * 함께 돌려준다(화면이 동기화 직후 재조회 없이 반영할 수 있게).
     *
     * @param warning 일부 값만 갱신됐을 때의 경고(예: 환율 실패). 없으면 null.
     */
    public record SyncResult(PortfolioService.Portfolio portfolio, long accountId,
                             int created, int updated, int skipped, String warning) {}

    /**
     * 보유자산 원본 진단 (읽기 전용, DB 변경 없음).
     *
     * @param error 자격증명 누락·토스 호출 실패 문구(성공이면 null)
     */
    public record TossPreview(TossHoldings holdings, String warning, String error) {}

    static final String FX_WARNING = "환율을 읽지 못해 USD 자산을 1:1로 표시했습니다";

    /** 토스 보유자산은 주식만 온다. ETF 판별은 하지 않는다(이번 단계 범위 아님). */
    private static final String ASSET_CLASS = "stock";
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private final TossCredentialsService credentials;
    private final TossApiClient client;
    private final AssetLedger assets;
    private final InvestmentLedger holdings;
    private final PortfolioService portfolioService;

    public TossSyncService(TossCredentialsService credentials, TossApiClient client,
                           AssetLedger assets, InvestmentLedger holdings,
                           PortfolioService portfolioService) {
        this.credentials = credentials;
        this.client = client;
        this.assets = assets;
        this.holdings = holdings;
        this.portfolioService = portfolioService;
    }

    public SyncResult sync(long userId) {
        TossCredentials creds = credentials.findDecrypted(userId)
                .filter(TossCredentials::hasCredentials)
                .orElseThrow(() -> new TossNotConfiguredException("토스 자격증명이 없습니다"));
        AssetLedger.AssetRow account = requireInvestAccount(creds.accountId());

        TossCredentials picked = withAccountSeq(creds, account.id());
        TossHoldings snapshot = client.holdings(picked);
        List<TossHolding> items = snapshot.items();

        BigDecimal usdRate = BigDecimal.ONE;
        String warning = null;
        if (holdsUsd(items)) {
            try {
                BigDecimal rate = client.usdKrwRate(picked);
                if (rate == null || rate.signum() <= 0) {
                    warning = FX_WARNING;
                } else {
                    usdRate = rate;
                }
            } catch (RuntimeException e) {
                // 환율 실패로 동기화 전체를 버리지 않는다 — 값을 1:1 로 두고 warning 으로 알린다.
                usdRate = BigDecimal.ONE;
                warning = FX_WARNING;
            }
        }

        Map<String, HoldingRow> existing = new HashMap<>();
        for (HoldingRow row : holdings.all()) {
            if (row.accountId() == account.id() && ASSET_CLASS.equals(row.assetClass())
                    && row.symbol() != null) {
                existing.put(row.symbol().trim().toUpperCase(Locale.ROOT), row);
            }
        }

        int created = 0;
        int updated = 0;
        int skipped = 0;
        String priceAsOf = LocalDate.now(KST).toString();
        for (TossHolding item : items) {
            String symbol = item.symbol() == null ? "" : item.symbol().trim().toUpperCase(Locale.ROOT);
            BigDecimal quantity = item.quantity() == null ? BigDecimal.ZERO : item.quantity();
            if (symbol.isEmpty() || quantity.signum() <= 0) {
                skipped++;
                continue;
            }
            HoldingRow previous = existing.get(symbol);
            String currency = currencyOf(item);
            BigDecimal fxRate = "USD".equals(currency) ? usdRate : BigDecimal.ONE;

            BigDecimal marketPrice = positive(item.lastPrice())
                    .orElseGet(() -> previousMarketPrice(previous, item.averagePurchasePrice()));
            BigDecimal avgPrice = positive(item.averagePurchasePrice())
                    .orElseGet(() -> previousAvgPrice(previous, marketPrice));
            String name = nameOf(item, previous, symbol);

            HoldingRow row = new HoldingRow(
                    previous == null ? 0 : previous.id(), account.id(), ASSET_CLASS, symbol, name,
                    currency, quantity, avgPrice, marketPrice, fxRate, priceAsOf);
            if (previous == null) {
                holdings.create(row);
                created++;
            } else {
                holdings.update(previous.id(), row);
                updated++;
            }
        }
        return new SyncResult(portfolioService.portfolio(), account.id(), created, updated, skipped,
                warning);
    }

    /**
     * 보유자산 원본 진단. 계좌 검증 실패는 400({@link IllegalArgumentException}),
     * 자격증명 누락·토스 호출 실패는 200 + error 로 돌려준다.
     */
    public TossPreview preview(long userId, long accountId) {
        requireInvestAccount(accountId);
        Optional<TossCredentials> found = credentials.findDecrypted(userId)
                .filter(TossCredentials::hasCredentials);
        if (found.isEmpty()) {
            return new TossPreview(null, null, "토스 자격증명이 없습니다");
        }
        TossCredentials picked = withAccountSeq(found.get(), accountId);
        try {
            return new TossPreview(client.holdings(picked), null, null);
        } catch (TossApiException e) {
            return new TossPreview(null, null, e.getMessage());
        }
    }

    // ------------------------------------------------------------- helpers

    /**
     * 계좌 소유·타입 검증. 없거나 invest 가 아니면 400(IllegalArgumentException → 400).
     * Stage 1 에서는 다른 계좌 ID 가 500 으로 새어 나왔다.
     */
    private AssetLedger.AssetRow requireInvestAccount(Long accountId) {
        if (accountId == null || accountId <= 0) {
            throw new IllegalArgumentException("연결할 투자 계좌를 선택하세요(accountId)");
        }
        AssetLedger.AssetRow account = assets.byId(accountId);
        if (account == null) {
            throw new IllegalArgumentException("account not found: " + accountId);
        }
        if (!"invest".equals(account.accountType())) {
            throw new IllegalArgumentException("account must be an invest account");
        }
        return account;
    }

    /**
     * 보유자산 호출에 쓸 자격증명. {@code tossAccountSeq} 가 비어 있으면 계좌 목록에서
     * 1개면 자동 선택, 여러 개면 400 + 후보 안내(마스킹된 계좌번호만 노출).
     */
    private TossCredentials withAccountSeq(TossCredentials creds, long accountId) {
        String seq = creds.hasAccountSeq() ? creds.tossAccountSeq().trim() : resolveAccountSeq(creds);
        return new TossCredentials(accountId, creds.clientId(), creds.clientSecret(), seq);
    }

    private String resolveAccountSeq(TossCredentials creds) {
        List<TossAccount> accounts = client.accounts(creds);
        if (accounts == null || accounts.isEmpty()) {
            throw new IllegalArgumentException("토스 계좌를 찾을 수 없습니다");
        }
        if (accounts.size() == 1) {
            Integer seq = accounts.get(0).accountSeq();
            if (seq == null) {
                throw new IllegalArgumentException("토스 계좌 식별자를 읽지 못했습니다");
            }
            return String.valueOf(seq);
        }
        String candidates = accounts.stream()
                .map(TossAccount::candidateLabel)
                .collect(Collectors.joining(", "));
        throw new IllegalArgumentException(
                "토스 계좌가 여러 개입니다 — 계좌 식별자(tossAccountSeq)를 지정하세요: " + candidates);
    }

    private static boolean holdsUsd(List<TossHolding> items) {
        for (TossHolding item : items) {
            if ("USD".equals(currencyOf(item)) || "US".equalsIgnoreCase(trim(item.marketCountry()))) {
                return true;
            }
        }
        return false;
    }

    private static String currencyOf(TossHolding item) {
        String currency = trim(item.currency());
        if (currency != null) {
            return currency.toUpperCase(Locale.ROOT);
        }
        return "US".equalsIgnoreCase(trim(item.marketCountry())) ? "USD" : "KRW";
    }

    private static String nameOf(TossHolding item, HoldingRow previous, String symbol) {
        String name = trim(item.name());
        if (name != null) {
            return name;
        }
        if (previous != null && previous.name() != null && !previous.name().isBlank()) {
            return previous.name();
        }
        return symbol;
    }

    private static Optional<BigDecimal> positive(BigDecimal value) {
        return value != null && value.signum() > 0 ? Optional.of(value) : Optional.empty();
    }

    private static BigDecimal previousMarketPrice(HoldingRow previous, BigDecimal avgPrice) {
        if (previous != null && previous.marketPrice() != null && previous.marketPrice().signum() > 0) {
            return previous.marketPrice();
        }
        return avgPrice == null ? BigDecimal.ZERO : avgPrice;
    }

    private static BigDecimal previousAvgPrice(HoldingRow previous, BigDecimal marketPrice) {
        if (previous != null && previous.avgPrice() != null && previous.avgPrice().signum() > 0) {
            return previous.avgPrice();
        }
        return marketPrice;
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
