package com.assetflow.dashboard;

import com.assetflow.dashboard.MockDashboardSource.AssetRow;
import com.assetflow.dashboard.MockDashboardSource.CashflowMonth;
import com.assetflow.dashboard.MockDashboardSource.LiabilityRow;
import com.assetflow.dashboard.MockDashboardSource.MonthlySummary;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 대시보드 API 3종(§25)의 서비스 계층. 현 단계 원장은 MockDashboardSource 고정값이고,
 * Issue 5 스키마(mybatis/postgres) 연결 때 교체된다. 서비스는 원장 행을 모아
 * 프론트 DashboardData 와 같은 모양으로 내려주는 역할만 한다 — 계산은 프론트가 한다.
 */
@Service
public class DashboardService {

    public record DashboardSummary(String asOf, List<AssetRow> assets,
                                   List<LiabilityRow> liabilities, MonthlySummary monthly) {}

    public record Me(Long id, String email, String displayName) {}

    public DashboardSummary summary() {
        return new DashboardSummary(MockDashboardSource.AS_OF, MockDashboardSource.assets(),
                MockDashboardSource.liabilities(), MockDashboardSource.monthly());
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
