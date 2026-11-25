package com.assetflow.investments.snapshot;

import com.assetflow.assets.InMemoryAssetLedger;
import com.assetflow.investments.InMemoryInvestmentLedger;
import com.assetflow.investments.InvestmentLedger;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #52 — 투자 추이 스냅샷 계산.
 *
 * <p>원금·평가·예수금의 정의가 화면·차트·지출에서 갈리지 않도록 계산을 고정한다.
 * 반올림은 <b>합계에서 한 번</b>이다(§54.4) — 행별로 반올림하면 합이 어긋난다.</p>
 */
class PortfolioSnapshotServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final LocalDate TODAY = LocalDate.of(2026, 11, 25);

    private PortfolioSnapshotService service(InMemoryPortfolioSnapshotLedger ledger,
                                             InMemoryInvestmentLedger investments,
                                             InMemoryAssetLedger assets) {
        Clock clock = Clock.fixed(Instant.parse("2026-11-25T03:00:00Z"), SEOUL);
        return new PortfolioSnapshotService(ledger, investments, assets, clock);
    }

    /**
     * InMemoryInvestmentLedger 는 **시드 보유종목**을 갖고 시작한다(다른 테스트가 그 값을 쓴다).
     * 그래서 절대값이 아니라 "캡처 전 → 후"의 차이로 검증한다 — 시드에 의존하지 않게.
     */
    private PortfolioSnapshotLedger.Snapshot delta(PortfolioSnapshotService svc, long userId,
                                                   PortfolioSnapshotLedger.Snapshot before) {
        var after = svc.capture(userId, "manual");
        return new PortfolioSnapshotLedger.Snapshot(after.takenOn(),
                after.totalCost() - before.totalCost(),
                after.totalValue() - before.totalValue(),
                after.cash() - before.cash(), after.source());
    }

    private static InvestmentLedger.HoldingRow holding(long accountId, String symbol, String currency,
                                                       String qty, String avg, String price, String fx) {
        return new InvestmentLedger.HoldingRow(0, accountId, "stock", symbol, symbol, currency,
                new BigDecimal(qty), new BigDecimal(avg), new BigDecimal(price), new BigDecimal(fx),
                "2026-11-25");
    }

    @Test
    void capturesCostValueAndCash() {
        InMemoryPortfolioSnapshotLedger ledger = new InMemoryPortfolioSnapshotLedger();
        InMemoryInvestmentLedger investments = new InMemoryInvestmentLedger();
        InMemoryAssetLedger assets = new InMemoryAssetLedger();
        var account = assets.create("invest", "토스", "토스증권", 500_000L, false, "2026-01-01");
        investments.create(holding(account.id(), "005930", "KRW", "10", "70000", "75000", "1"));
        assets.create("cash", "생활비", "우리은행", 1_000_000L, false, "2026-01-01");

        var svc = service(ledger, investments, assets);
        var before = svc.capture(1L, "manual");   // 시드 기준선
        assets.create("invest", "토스2", "토스증권", 500_000L, false, "2026-01-01");
        var after = svc.capture(1L, "manual");
        // 방금 만든 invest 계좌의 예수금만 증가분에 잡힌다(현금성 1,000,000 은 제외).
        assertThat(after.cash() - before.cash()).isEqualTo(500_000L);
        assertThat(after.takenOn()).isEqualTo(TODAY);
        assertThat(after.source()).isEqualTo("manual");
    }

    @Test
    void appliesFxRateToUsdHoldings() {
        InMemoryPortfolioSnapshotLedger ledger = new InMemoryPortfolioSnapshotLedger();
        InMemoryInvestmentLedger investments = new InMemoryInvestmentLedger();
        InMemoryAssetLedger assets = new InMemoryAssetLedger();
        var account = assets.create("invest", "토스", "토스증권", 0L, false, "2026-01-01");
        investments.create(holding(account.id(), "AAPL", "USD", "10", "150", "180", "1380"));

        var svc = service(ledger, investments, assets);
        var before = svc.capture(1L, "manual");
        investments.create(holding(account.id(), "AAPL", "USD", "10", "150", "180", "1380"));
        var after = svc.capture(1L, "manual");

        assertThat(after.totalCost() - before.totalCost()).isEqualTo(2_070_000L);   // 10×150×1380
        assertThat(after.totalValue() - before.totalValue()).isEqualTo(2_484_000L); // 10×180×1380
    }

    @Test
    void roundsOnceOnTheTotalNotPerRow() {
        InMemoryPortfolioSnapshotLedger ledger = new InMemoryPortfolioSnapshotLedger();
        InMemoryInvestmentLedger investments = new InMemoryInvestmentLedger();
        InMemoryAssetLedger assets = new InMemoryAssetLedger();
        var account = assets.create("invest", "토스", "토스증권", 0L, false, "2026-01-01");
        // 두 행 모두 0.5 미만 소수 — 행별 반올림이면 0+0, 합계 반올림이면 1
        var svc = service(ledger, investments, assets);
        var before = svc.capture(1L, "manual");
        investments.create(holding(account.id(), "AAA", "KRW", "1", "0.4", "0.4", "1"));
        investments.create(holding(account.id(), "BBB", "KRW", "1", "0.4", "0.4", "1"));
        var after = svc.capture(1L, "manual");

        // 0.4 + 0.4 = 0.8 → 반올림 1. 행별로 하면 0 + 0 = 0 이 된다.
        assertThat(after.totalCost() - before.totalCost()).isEqualTo(1L);
        assertThat(after.totalValue() - before.totalValue()).isEqualTo(1L);
    }

    @Test
    void allowsMultiplePointsOnTheSameDay() {
        InMemoryPortfolioSnapshotLedger ledger = new InMemoryPortfolioSnapshotLedger();
        var svc = service(ledger, new InMemoryInvestmentLedger(), new InMemoryAssetLedger());

        svc.capture(1L, "schedule");
        svc.capture(1L, "schedule");

        // 하루 두 점(09:05·15:35) — 덮어쓰지 않는다.
        assertThat(ledger.range(1L, TODAY, TODAY)).hasSize(2);
    }

    @Test
    void rangeIsInclusiveAndEmptyWhenNothingSaved() {
        InMemoryPortfolioSnapshotLedger ledger = new InMemoryPortfolioSnapshotLedger();
        var svc = service(ledger, new InMemoryInvestmentLedger(), new InMemoryAssetLedger());
        svc.capture(1L, "manual");

        assertThat(svc.range(1L, TODAY, TODAY)).hasSize(1);
        assertThat(svc.range(1L, TODAY.plusDays(1), TODAY.plusDays(2))).isEmpty();
    }

    @Test
    void rowsAreScopedToUser() {
        InMemoryPortfolioSnapshotLedger ledger = new InMemoryPortfolioSnapshotLedger();
        var svc = service(ledger, new InMemoryInvestmentLedger(), new InMemoryAssetLedger());
        svc.capture(1L, "manual");
        svc.capture(2L, "manual");

        assertThat(svc.range(1L, TODAY, TODAY)).hasSize(1);
        assertThat(svc.range(2L, TODAY, TODAY)).hasSize(1);
    }
}
