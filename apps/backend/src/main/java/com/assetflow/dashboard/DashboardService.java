package com.assetflow.dashboard;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.dashboard.MockDashboardSource.CashflowMonth;
import com.assetflow.dashboard.MockDashboardSource.LiabilityRow;
import com.assetflow.dashboard.MockDashboardSource.MonthlySummary;
import com.assetflow.expenses.ExpenseSnapshotLedger;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 대시보드 API 3종(§25)의 서비스 계층. §31.1 단일 출처: 자산·부채 행은
 * AssetLedger 원장 한 곳에서 읽는다 — 대시보드와 자산 화면이 같은 데이터를 본다.
 * monthly·cashflow 는 지출 도메인이 완성되기 전까지 MockDashboardSource 모크다.
 */
@Service
public class DashboardService {

    public record DashboardSummary(String asOf, List<MockDashboardSource.AssetRow> assets,
                                   List<LiabilityRow> liabilities, MonthlySummary monthly) {}

    public record Me(Long id, String email, String displayName) {}

    private final AssetLedger ledger;
    private final ExpenseSnapshotLedger snapshotLedger;

    public DashboardService(AssetLedger ledger, ExpenseSnapshotLedger snapshotLedger) {
        this.ledger = ledger;
        this.snapshotLedger = snapshotLedger;
    }

    public DashboardSummary summary() {
        List<AssetRow> rows = ledger.all();
        List<MockDashboardSource.AssetRow> assets = rows.stream()
                .filter(r -> !r.isDebt())
                .map(r -> new MockDashboardSource.AssetRow(String.valueOf(r.id()),
                        r.accountType(), r.name(), r.balance()))
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

    /** months: 1..12. 범위 밖이면 400(INVALID_REQUEST) — §25 오류 표준. */
    public List<CashflowMonth> cashflow(int months) {
        if (months < 1 || months > 12) {
            throw new IllegalArgumentException("months must be between 1 and 12");
        }
        List<CashflowMonth> all = MockDashboardSource.cashflow();
        return all.subList(0, Math.min(months, all.size()));
    }
}
