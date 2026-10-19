package com.assetflow.expenses;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** 정기 지출 정의 원장의 인메모리 구현 (테스트·CI). */
@Component
@Profile("!postgres")
public class InMemoryRecurringExpenseLedger implements RecurringExpenseLedger {

    private final List<Recurring> rows = new ArrayList<>();
    private long nextId = 1;

    public List<Recurring> all() {
        synchronized (rows) {
            return List.copyOf(rows);
        }
    }

    public List<Recurring> activeIn(String month) {
        synchronized (rows) {
            List<Recurring> out = new ArrayList<>();
            for (Recurring r : rows) {
                if (r.startMonth().compareTo(month) <= 0
                        && (r.endMonth() == null || r.endMonth().compareTo(month) >= 0)) {
                    out.add(r);
                }
            }
            return List.copyOf(out);
        }
    }

    public Recurring create(String label, long amount, boolean isEssential, long purchaseVat, String startMonth, String endMonth) {
        Recurring row = new Recurring(nextId++, label, amount, isEssential, purchaseVat, startMonth, endMonth);
        synchronized (rows) {
            rows.add(row);
        }
        return row;
    }

    public Recurring update(long id, String label, long amount, boolean isEssential, long purchaseVat, String startMonth, String endMonth) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).id() == id) {
                    Recurring row = new Recurring(id, label, amount, isEssential, purchaseVat, startMonth, endMonth);
                    rows.set(i, row);
                    return row;
                }
            }
        }
        throw new com.assetflow.common.api.NotFoundException("recurring id " + id);
    }

    public void delete(long id) {
        synchronized (rows) {
            boolean removed = rows.removeIf(r -> r.id() == id);
            if (!removed) {
                throw new com.assetflow.common.api.NotFoundException("recurring id " + id);
            }
        }
    }
}
