package com.assetflow.expenses;

import com.assetflow.assets.AssetLedger;
import com.assetflow.assets.CardImportLedger;
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
    private final CardImportLedger cardLedger;
    private final ExpenseItemLedger expenseLedger;
    private final AssetLedger assetLedger;
    private final PortfolioService portfolioService;

    public ExpenseSnapshotController(ExpenseSnapshotLedger snapshots,
                                     CardImportLedger cardLedger,
                                     ExpenseItemLedger expenseLedger,
                                     AssetLedger assetLedger,
                                     PortfolioService portfolioService) {
        this.snapshots = snapshots;
        this.cardLedger = cardLedger;
        this.expenseLedger = expenseLedger;
        this.assetLedger = assetLedger;
        this.portfolioService = portfolioService;
    }

    public record IncomeBody(Long income) {}

    private String requireMonth(String month) {
        if (month == null || !MONTH.matcher(month).matches()) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
        return month;
    }

    @GetMapping("/snapshots")
    public ApiResponse<ExpenseSnapshotLedger.Snapshot> get(@RequestParam("month") String month) {
        return new ApiResponse<>("OK", "Snapshot loaded", snapshots.get(requireMonth(month)));
    }

    /** 월 확정: 수입만 받고 나머지는 원장에서 재계산해 스냅샷을 갱신한다. */
    @PutMapping("/snapshots")
    public ApiResponse<ExpenseSnapshotLedger.Snapshot> confirm(@RequestParam("month") String month, @RequestBody IncomeBody body) {
        String m = requireMonth(month);
        if (body.income() == null || body.income() < 0) {
            throw new IllegalArgumentException("income must be a non-negative integer");
        }
        long cardSpend = 0;
        for (CardImportLedger.ImportedRow r : cardLedger.inMonth(m)) cardSpend += r.grossAmount();
        long itemSpend = 0, essential = 0;
        for (ExpenseItemLedger.ExpenseItem it : expenseLedger.all(m)) {
            itemSpend += it.amount();
            if (it.isEssential()) essential += it.amount();
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
        ExpenseSnapshotLedger.Snapshot snap = new ExpenseSnapshotLedger.Snapshot(
                m, totalAssets, totalDebts, body.income(), cardSpend + itemSpend, essential, true);
        snapshots.upsert(snap);
        return new ApiResponse<>("OK", "Snapshot confirmed", snap);
    }
}
