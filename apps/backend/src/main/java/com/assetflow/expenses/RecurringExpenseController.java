package com.assetflow.expenses;

import com.assetflow.common.api.ApiResponse;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.regex.Pattern;

/**
 * 정기(고정) 지출 정의 CRUD API (§45.3). Bearer 검증은 WebConfig(/api/v1/expenses/**).
 */
@RestController
@RequestMapping("/api/v1/expenses")
public class RecurringExpenseController {

    private static final Pattern MONTH = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private final RecurringExpenseLedger ledger;

    public RecurringExpenseController(RecurringExpenseLedger ledger) {
        this.ledger = ledger;
    }

    public record RecurringBody(String label, Long amount, Boolean isEssential, Long purchaseVat,
                                String startMonth, String endMonth) {}

    /** 변환용 기간 본문 (§45.5) — 둘 다 선택, null 이면 기존 행의 월/무기한. */
    public record PeriodBody(String startMonth, String endMonth) {}

    private void validate(RecurringBody body) {
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
        if (body.startMonth() == null || !MONTH.matcher(body.startMonth()).matches()) {
            throw new IllegalArgumentException("startMonth must be YYYY-MM");
        }
        if (body.endMonth() != null && !MONTH.matcher(body.endMonth()).matches()) {
            throw new IllegalArgumentException("endMonth must be YYYY-MM or null");
        }
        if (body.endMonth() != null && body.endMonth().compareTo(body.startMonth()) < 0) {
            throw new IllegalArgumentException("endMonth must be after or equal to startMonth");
        }
    }

    @GetMapping("/recurring")
    public ApiResponse<List<RecurringExpenseLedger.Recurring>> list() {
        return new ApiResponse<>("OK", "Recurring loaded", ledger.all());
    }

    @PostMapping("/recurring")
    public ApiResponse<RecurringExpenseLedger.Recurring> create(@RequestBody RecurringBody body) {
        validate(body);
        try {
            return new ApiResponse<>("OK", "Recurring created",
                    ledger.create(body.label().trim(), body.amount(),
                            body.isEssential() == null ? false : body.isEssential(),
                            body.purchaseVat() == null ? 0 : body.purchaseVat(),
                            body.startMonth(), body.endMonth()));
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new IllegalArgumentException("duplicate recurring: " + body.label());
        }
    }

    @PutMapping("/recurring/{id}")
    public ApiResponse<RecurringExpenseLedger.Recurring> update(@PathVariable long id, @RequestBody RecurringBody body) {
        validate(body);
        return new ApiResponse<>("OK", "Recurring updated",
                ledger.update(id, body.label().trim(), body.amount(),
                        body.isEssential() == null ? false : body.isEssential(),
                        body.purchaseVat() == null ? 0 : body.purchaseVat(),
                        body.startMonth(), body.endMonth()));
    }

    @DeleteMapping("/recurring/{id}")
    public ApiResponse<Long> delete(@PathVariable long id) {
        ledger.delete(id);
        return new ApiResponse<>("OK", "Recurring deleted", id);
    }
}
