package com.assetflow.dashboard;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.dashboard.MockDashboardSource.CashflowMonth;
import com.assetflow.dashboard.MockDashboardSource.LiabilityRow;
import com.assetflow.dashboard.MockDashboardSource.MonthlySummary;
import com.assetflow.expenses.ExpenseSnapshotLedger;
import com.assetflow.investments.PortfolioService;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 대시보드 API 3종(§25)의 서비스 계층. §31.1 단일 출처: 자산·부채 행은
 * AssetLedger 원장 한 곳에서 읽는다 — 대시보드와 자산 화면이 같은 데이터를 본다.
 * §54.3: invest 행의 value 는 예수금 + 보유종목 평가액(PortfolioService)이다 —
 * balance 만 더하면 종목이 사라지고, FE 가 둘 다 더하면 두 번 센다.
 * monthly·cashflow 는 지출 도메인이 완성되기 전까지 MockDashboardSource 모크다.
 */
@Service
public class DashboardService {

    public record DashboardSummary(String asOf, List<MockDashboardSource.AssetRow> assets,
                                   List<LiabilityRow> liabilities, MonthlySummary monthly) {}

    public record Me(Long id, String email, String displayName) {}

    private final AssetLedger ledger;
    private final ExpenseSnapshotLedger snapshotLedger;
    private final PortfolioService portfolioService;

    public DashboardService(AssetLedger ledger, ExpenseSnapshotLedger snapshotLedger,
                            PortfolioService portfolioService) {
        this.ledger = ledger;
        this.snapshotLedger = snapshotLedger;
        this.portfolioService = portfolioService;
    }

    public DashboardSummary summary() {
        List<AssetRow> rows = ledger.all();
        Map<Long, Long> investTotals = portfolioService.totalByAccount();
        List<MockDashboardSource.AssetRow> assets = rows.stream()
                .filter(r -> !r.isDebt())
                .map(r -> new MockDashboardSource.AssetRow(String.valueOf(r.id()),
                        r.accountType(), r.name(), valueOf(r, investTotals)))
                .toList();
        List<LiabilityRow> liabilities = rows.stream()
                .filter(AssetRow::isDebt)
                .map(r -> new LiabilityRow(String.valueOf(r.id()), r.name(), r.balance()))
                .toList();
        // §34.6 단일 출처: AS_OF 월의 스냅샷이 확정돼 있으면 실데이터, 없으면 모크.
        ExpenseSnapshotLedger.Snapshot snap = snapshotLedger.get(MockDashboardSource.AS_OF);
        MonthlySummary monthly = snap == null ? MockDashboardSource.monthly()
                : new MonthlySummary(snap.income(), snap.expenses(),
                        snap.essentialExpenses(), snap.essentialComplete());
        return new DashboardSummary(MockDashboardSource.AS_OF, assets, liabilities, monthly);
    }

    /** §54.3: invest 계좌는 예수금 + 보유종목 평가액. 그 외 계좌는 balance 그대로. */
    private static long valueOf(AssetRow r, Map<Long, Long> investTotals) {
        return "invest".equals(r.accountType())
                ? investTotals.getOrDefault(r.id(), r.balance())
                : r.balance();
    }

    /** months: 1..12. 범위 밖이면 400(INVALID_REQUEST) — §25 오류 표준. */
    public List<CashflowMonth> cashflow(int months) {
        if (months < 1 || months > 12) {
            throw new IllegalArgumentException("months must be between 1 and 12");
        }
        // §34.6: 확정된 월 스냅샷이 있으면 실데이터, 없으면 mock 기준선 폴다운.
        List<ExpenseSnapshotLedger.Snapshot> snaps = snapshotLedger.recent(MockDashboardSource.AS_OF, months);
        if (!snaps.isEmpty()) {
            return snaps.stream()
                    .map(s -> new CashflowMonth(s.month(), s.income(), s.expenses()))
                    .toList();
        }
        List<CashflowMonth> all = MockDashboardSource.cashflow();
        return all.subList(0, Math.min(months, all.size()));
    }
}
