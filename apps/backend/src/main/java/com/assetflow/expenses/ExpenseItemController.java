package com.assetflow.expenses;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.expenses.categories.CategoryTaxonomy;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 월 지출 항목 CRUD API (§43). 합계는 응답에 없다 — 프론트가 행에서 계산한다(§34.6).
 * Bearer 검증은 WebConfig 인터셉터(/api/v1/assets/** 패턴에 expenses 도 추가).
 */
@RestController
@RequestMapping("/api/v1/expenses")
public class ExpenseItemController {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private final ExpenseItemLedger ledger;
    private final RecurringExpenseLedger recurringLedger;

    public ExpenseItemController(ExpenseItemLedger ledger, RecurringExpenseLedger recurringLedger) {
        this.ledger = ledger;
        this.recurringLedger = recurringLedger;
    }

    public record ItemBody(String label, Long amount, Boolean isEssential, Long purchaseVat, String category) {}

    /** §45.5 변환(멱등): 같은 label 의 활성 정의가 이미 있으면 그 정의에 연결, 없으면 새로 만들어 연결. */
    @PostMapping("/items/{id}/convert-to-recurring")
    public ApiResponse<RecurringExpenseLedger.Recurring> convertToRecurring(@PathVariable long id, @RequestBody RecurringExpenseController.PeriodBody body) {
        ExpenseItemLedger.ExpenseItem existing = ledger.byId(id);
        if (existing == null) {
            throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
        }
        if (existing.recurringId() != null) {
            throw new IllegalArgumentException("already recurring");
        }
        String startMonth = body.startMonth() == null ? existing.month() : body.startMonth();
        String endMonth = body.endMonth() == null ? null : body.endMonth();
        RecurringExpenseLedger.Recurring def = null;
        for (RecurringExpenseLedger.Recurring d : recurringLedger.activeIn(existing.month())) {
            if (d.label().equals(existing.label())) { def = d; break; }
        }
        if (def == null) {
            def = recurringLedger.create(
                    existing.label(), existing.amount(), existing.isEssential(), existing.purchaseVat(),
                    startMonth, endMonth, existing.category());
        } else if (def.category() == null && existing.category() != null) {
            // 기존 정의에 대분류가 없으면 이 월 항목의 분류를 정의에 채워 다음 달부터도 추이에 잡히게 한다.
            def = recurringLedger.update(def.id(), def.label(), def.amount(), def.isEssential(), def.purchaseVat(),
                    def.startMonth(), def.endMonth(), existing.category());
        }
        ledger.linkRecurring(id, def.id());
        return new ApiResponse<>("OK", "Converted to recurring", def);
    }

    /** month 쿼리 파라미터 필수 — YYYY-MM 이 아니면 400(§43.2). */
    private String requireMonth(String month) {
        if (month == null || !MONTH.matcher(month).matches()) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
        return month;
    }

    /**
     * §57.6 대분류 검증. 빈 문자열/null 은 "추이 제외"로 저장하고, 9개 대분류 밖의 값은 400.
     */
    static String normalizeCategory(String category) {
        if (category == null || category.isBlank()) {
            return null;
        }
        String value = category.trim();
        if (!CategoryTaxonomy.groupNames().contains(value)) {
            throw new IllegalArgumentException("category must be one of " + CategoryTaxonomy.groupNames());
        }
        return value;
    }

    private ExpenseItemLedger.ExpenseItem validate(String month, ItemBody body) {
        if (body.label() == null || body.label().isBlank()) {
            throw new IllegalArgumentException("label is required");
        }
        if (body.amount() == null || body.amount() < 0) {
            throw new IllegalArgumentException("amount must be a non-negative integer");
        }
        long vat = body.purchaseVat() == null ? 0 : body.purchaseVat();
        if (vat < 0) {
            throw new IllegalArgumentException("purchaseVat must be non-negative");
        }
        boolean essential = body.isEssential() == null ? false : body.isEssential();
        return new ExpenseItemLedger.ExpenseItem(0, month, body.label().trim(), body.amount(), essential, vat, null,
                normalizeCategory(body.category()));
    }

    @GetMapping("/items")
    public ApiResponse<List<ExpenseItemLedger.ExpenseItem>> list(@RequestParam("month") String month) {
        String m = requireMonth(month);
        // §45.2: 정의가 있는 정기 항목을 그 월에 멱등 등록 후 반환 — cron 없이 개월 밀림 방지
        ledger.ensureRecurringRows(m, recurringLedger.activeIn(m));
        return new ApiResponse<>("OK", "Expense items loaded", ledger.all(m));
    }

    /** §45.3 지난달 복사 — 새 월 진입 배너의 1클릭 반영. */
    @PostMapping("/items/copy")
    public ApiResponse<Integer> copy(@RequestParam("from") String from, @RequestParam("to") String to) {
        String f = requireMonth(from);
        String t2 = requireMonth(to);
        if (f.compareTo(t2) >= 0) {
            throw new IllegalArgumentException("to must be after from");
        }
        return new ApiResponse<>("OK", "Items copied", ledger.copyMonth(f, t2));
    }

    @PostMapping("/items")
    public ApiResponse<ExpenseItemLedger.ExpenseItem> create(@RequestParam("month") String month, @RequestBody ItemBody body) {
        String m = requireMonth(month);
        ExpenseItemLedger.ExpenseItem v = validate(m, body);
        return new ApiResponse<>("OK", "Expense item created",
                ledger.create(m, v.label(), v.amount(), v.isEssential(), v.purchaseVat(), v.category()));
    }

    @PutMapping("/items/{id}")
    public ApiResponse<ExpenseItemLedger.ExpenseItem> update(@PathVariable long id, @RequestBody ItemBody body) {
        if (body.label() == null || body.label().isBlank()) {
            throw new IllegalArgumentException("label is required");
        }
        if (body.amount() == null || body.amount() < 0) {
            throw new IllegalArgumentException("amount must be a non-negative integer");
        }
        long vat = body.purchaseVat() == null ? 0 : body.purchaseVat();
        if (vat < 0) {
            throw new IllegalArgumentException("purchaseVat must be non-negative");
        }
        boolean essential = body.isEssential() == null ? false : body.isEssential();
        String category = normalizeCategory(body.category());
        // PUT 은 월을 바꾸지 않는다(월 단위 화면 흐름) — 기존 행의 month 를 유지.
        ExpenseItemLedger.ExpenseItem existing = ledger.byId(id);
        if (existing == null) {
            throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
        }
        String month = existing.month();
        return new ApiResponse<>("OK", "Expense item updated",
                ledger.update(id, month, body.label().trim(), body.amount(), essential, vat, category));
    }

    @DeleteMapping("/items/{id}")
    public ApiResponse<Long> delete(@PathVariable long id) {
        ledger.delete(id);
        return new ApiResponse<>("OK", "Expense item deleted", id);
    }

}
