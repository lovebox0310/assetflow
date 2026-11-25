package com.assetflow.investments.snapshot;

import com.assetflow.assets.AssetLedger;
import com.assetflow.investments.InvestmentLedger;
import com.assetflow.investments.PortfolioService;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/**
 * 투자 추이 스냅샷 계산·기록 (이슈 #52).
 *
 * <p>계산 규칙은 {@link PortfolioService} 와 같다 — 원가는 평단가, 평가는 현재가에
 * 환율을 곱한다. 행별로 반올림하면 합계가 어긋나므로 <b>BigDecimal 합계에서 한 번만</b>
 * 원 단위로 반올림한다(§54.4).</p>
 */
@Service
public class PortfolioSnapshotService {

    private final PortfolioSnapshotLedger ledger;
    private final InvestmentLedger investments;
    private final AssetLedger assets;
    private final Clock clock;

    public PortfolioSnapshotService(PortfolioSnapshotLedger ledger, InvestmentLedger investments,
                                    AssetLedger assets, Clock clock) {
        this.ledger = ledger;
        this.investments = investments;
        this.assets = assets;
        this.clock = clock;
    }

    /**
     * 지금 값으로 1점을 남긴다.
     *
     * @param source manual(수동 동기화) · schedule(스케줄) · auto(접속 시)
     * @return 저장한 점. 보유종목이 없어도 0 으로 1점을 남긴다 — "그날 자산이 0"도 정보다.
     */
    public PortfolioSnapshotLedger.Snapshot capture(long userId, String source) {
        BigDecimal cost = BigDecimal.ZERO;
        BigDecimal value = BigDecimal.ZERO;
        for (InvestmentLedger.HoldingRow h : investments.all()) {
            BigDecimal fx = h.fxRate() == null ? BigDecimal.ONE : h.fxRate();
            cost = cost.add(h.quantity().multiply(h.avgPrice()).multiply(fx));
            value = value.add(PortfolioService.value(h));
        }
        long cash = assets.all().stream()
                .filter(a -> "invest".equals(a.accountType()))
                .mapToLong(AssetLedger.AssetRow::balance)
                .sum();

        LocalDate today = LocalDate.now(clock);
        PortfolioSnapshotLedger.Snapshot snapshot = new PortfolioSnapshotLedger.Snapshot(
                today, PortfolioService.toWon(cost), PortfolioService.toWon(value), cash,
                source == null || source.isBlank() ? "manual" : source);
        ledger.save(userId, snapshot);
        return snapshot;
    }

    public List<PortfolioSnapshotLedger.Snapshot> range(long userId, LocalDate from, LocalDate to) {
        return ledger.range(userId, from, to);
    }
}
