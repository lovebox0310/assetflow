package com.assetflow.dashboard;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.AssetLedger.AssetRow;
import com.assetflow.dashboard.MockDashboardSource.CashflowMonth;
import com.assetflow.dashboard.MockDashboardSource.LiabilityRow;
import com.assetflow.dashboard.MockDashboardSource.MonthlySummary;
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

    public DashboardService(AssetLedger ledger) {
        this.ledger = ledger;
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
        return new DashboardSummary(MockDashboardSource.AS_OF, assets, liabilities,
                MockDashboardSource.monthly());
    }

    /** months: 1..12. 범위 밖이면 400(INVALID_REQUEST) — §25 오류 표준. */
    public List<CashflowMonth> cashflow(int months) {
        if (months < 1 || months > 12) {
            throw new IllegalArgumentException("months must be between 1 and 12");
        }
        List<CashflowMonth> all = MockDashboardSource.cashflow();
        return all.subList(0, Math.min(months, all.size()));
    }

    public Me me() {
        // 토큰→사용자 조회가 실서비스가 되기 전까지의 모크 사용자 (§21).
        return new Me(1L, "user@example.com", "사용자");
    }
}
