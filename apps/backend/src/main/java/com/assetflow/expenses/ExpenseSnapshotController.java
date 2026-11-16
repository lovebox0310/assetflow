package com.assetflow.expenses;

import com.assetflow.assets.AssetLedger;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.investments.PortfolioService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * 월 기준 입력 API (§44): 수입은 수동 입력, 지출·필수지출·자산 총계는
 * 원장 행에서 서버가 재계산한다(§34.6 — 계산 중복 금지, 스냅샷은 시점값 §37.3).
 */
@RestController
@RequestMapping("/api/v1/expenses")
public class ExpenseSnapshotController {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private final ExpenseSnapshotLedger snapshots;
    private final MonthlyExpenseTotals expenseTotals;
    private final AssetLedger assetLedger;
    private final PortfolioService portfolioService;

    public ExpenseSnapshotController(ExpenseSnapshotLedger snapshots,
                                     MonthlyExpenseTotals expenseTotals,
                                     AssetLedger assetLedger,
                                     PortfolioService portfolioService) {
        this.snapshots = snapshots;
        this.expenseTotals = expenseTotals;
        this.assetLedger = assetLedger;
        this.portfolioService = portfolioService;
    }

    /**
     * 월 확정 요청 본문(§57.9).
     * @param income 세전 월 총수입
     * @param vatSetAside 부가세통장 적립 이체(지출 아님)
     */
    public record IncomeBody(Long income, Long vatSetAside) {}

    private String requireMonth(String month) {
        if (month == null || !MONTH.matcher(month).matches()) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
        return month;
    }

    /**
     * 저장된 스냅샷이 있으면 지출·필수지출·수지를 조회 시점 원장 합계로 덮어쓴 사본을 돌려준다.
     * 수입·부가세이체·자산·부채·필수지출 완료 여부는 저장 시점값을 유지한다(확정은 수입에 관한 것).
     */
    @GetMapping("/snapshots")
    public ApiResponse<ExpenseSnapshotLedger.Snapshot> get(@RequestParam("month") String month) {
        String m = requireMonth(month);
        ExpenseSnapshotLedger.Snapshot saved = snapshots.get(m);
        if (saved == null) {
            return new ApiResponse<>("OK", "Snapshot loaded", null);
        }
        MonthlyExpenseTotals.Totals totals = expenseTotals.compute(m);
        ExpenseSnapshotLedger.Snapshot live = new ExpenseSnapshotLedger.Snapshot(
                saved.month(), saved.totalAssets(), saved.totalDebts(),
                saved.income(), saved.vatSetAside(), totals.expenses(), totals.essential(),
                saved.essentialComplete());
        return new ApiResponse<>("OK", "Snapshot loaded", live);
    }

    /** 월 확정: 수입만 받고 나머지는 원장에서 재계산해 스냅샷을 갱신한다. */
    @PutMapping("/snapshots")
    public ApiResponse<ExpenseSnapshotLedger.Snapshot> confirm(@RequestParam("month") String month, @RequestBody IncomeBody body) {
        String m = requireMonth(month);
        if (body.income() == null || body.income() < 0) {
            throw new IllegalArgumentException("income must be a non-negative integer");
        }
        long vatSetAside = body.vatSetAside() == null ? 0 : body.vatSetAside();
        if (vatSetAside < 0 || vatSetAside > body.income()) {
            throw new IllegalArgumentException("vatSetAside must be between 0 and income");
        }
        long totalAssets = 0, totalDebts = 0;
        Map<Long, Long> investTotals = portfolioService.totalByAccount();
        for (AssetLedger.AssetRow a : assetLedger.all()) {
            if (a.isDebt()) {
                totalDebts += a.balance();
            } else if ("invest".equals(a.accountType())) {
                totalAssets += investTotals.getOrDefault(a.id(), a.balance());
            } else {
                totalAssets += a.balance();
            }
        }
        MonthlyExpenseTotals.Totals totals = expenseTotals.compute(m);
        ExpenseSnapshotLedger.Snapshot snap = new ExpenseSnapshotLedger.Snapshot(
                m, totalAssets, totalDebts, body.income(), vatSetAside,
                totals.expenses(), totals.essential(), true);
        snapshots.upsert(snap);
        return new ApiResponse<>("OK", "Snapshot confirmed", snap);
    }
}
