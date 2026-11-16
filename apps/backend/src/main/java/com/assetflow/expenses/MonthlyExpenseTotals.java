package com.assetflow.expenses;

import com.assetflow.assets.CardImportLedger;
import org.springframework.stereotype.Service;

/**
 * 지출 합계의 단일 출처.
 *
 * <p>월 확정 스냅샷의 {@code expenses} 는 확정 시점값이라, 이후 카드내역(CSV 반영·정리)이
 * 바뀌어도 갱신되지 않는다. 그래서 지출은 <b>조회 시점의 원장 행</b>에서 계산한다 —
 * 월 확정 여부와 무관하게 계산 가능해야 한다.</p>
 *
 * <pre>
 * expenses(month)  = Σ card_imports.gross_amount(승인일이 그 달) + Σ monthly_expense_items.amount(그 달)
 * essential(month) = Σ monthly_expense_items.amount where is_essential
 * </pre>
 *
 * <p>§34.6 계산 중복 금지: 대시보드·지출 스냅샷 API 가 모두 이 클래스를 쓴다.</p>
 */
@Service
public class MonthlyExpenseTotals {

    public record Totals(long expenses, long essential) {}

    private final CardImportLedger cardLedger;
    private final ExpenseItemLedger expenseLedger;

    public MonthlyExpenseTotals(CardImportLedger cardLedger, ExpenseItemLedger expenseLedger) {
        this.cardLedger = cardLedger;
        this.expenseLedger = expenseLedger;
    }

    /** @param month "YYYY-MM" */
    public Totals compute(String month) {
        long cardSpend = 0;
        for (CardImportLedger.ImportedRow r : cardLedger.inMonth(month)) {
            cardSpend += r.grossAmount();
        }
        long itemSpend = 0;
        long essential = 0;
        for (ExpenseItemLedger.ExpenseItem it : expenseLedger.all(month)) {
            itemSpend += it.amount();
            if (it.isEssential()) {
                essential += it.amount();
            }
        }
        return new Totals(cardSpend + itemSpend, essential);
    }
}
