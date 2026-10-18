package com.assetflow.expenses;

import com.assetflow.common.api.ApiResponse;
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

    public ExpenseItemController(ExpenseItemLedger ledger) {
        this.ledger = ledger;
    }

    public record ItemBody(String label, Long amount, Boolean isEssential, Long purchaseVat) {}

    /** month 쿼리 파라미터 필수 — YYYY-MM 이 아니면 400(§43.2). */
    private String requireMonth(String month) {
        if (month == null || !MONTH.matcher(month).matches()) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
        return month;
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
        return new ExpenseItemLedger.ExpenseItem(0, month, body.label().trim(), body.amount(), essential, vat);
    }

    @GetMapping("/items")
    public ApiResponse<List<ExpenseItemLedger.ExpenseItem>> list(@RequestParam("month") String month) {
        String m = requireMonth(month);
        return new ApiResponse<>("OK", "Expense items loaded", ledger.all(m));
    }

    @PostMapping("/items")
    public ApiResponse<ExpenseItemLedger.ExpenseItem> create(@RequestParam("month") String month, @RequestBody ItemBody body) {
        String m = requireMonth(month);
        ExpenseItemLedger.ExpenseItem v = validate(m, body);
        return new ApiResponse<>("OK", "Expense item created", ledger.create(m, v.label(), v.amount(), v.isEssential(), v.purchaseVat()));
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
        // PUT 은 월을 바꾸지 않는다(월 단위 화면 흐름) — 기존 행의 month 를 유지.
        ExpenseItemLedger.ExpenseItem existing = ledger.byId(id);
        if (existing == null) {
            throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
        }
        String month = existing.month();
        return new ApiResponse<>("OK", "Expense item updated",
                ledger.update(id, month, body.label().trim(), body.amount(), essential, vat));
    }

    @DeleteMapping("/items/{id}")
    public ApiResponse<Long> delete(@PathVariable long id) {
        ledger.delete(id);
        return new ApiResponse<>("OK", "Expense item deleted", id);
    }

}
