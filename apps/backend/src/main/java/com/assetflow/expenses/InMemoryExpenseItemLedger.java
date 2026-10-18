package com.assetflow.expenses;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** 월 지출 항목 원장의 인메모리 구현 (테스트·CI). 시드 없음 — 빈 원장에서 시작. */
@Component
@Profile("!postgres")
public class InMemoryExpenseItemLedger implements ExpenseItemLedger {

    private final List<ExpenseItem> rows = new ArrayList<>();
    private long nextId = 1;

    public List<ExpenseItem> all(String month) {
        synchronized (rows) {
            List<ExpenseItem> out = new ArrayList<>();
            for (ExpenseItem r : rows) {
                if (r.month().equals(month)) out.add(r);
            }
            return List.copyOf(out);
        }
    }

    public ExpenseItem create(String month, String label, long amount, boolean isEssential, long purchaseVat) {
        synchronized (rows) {
            for (ExpenseItem r : rows) {
                if (r.month().equals(month) && r.label().equals(label)) {
                    throw new IllegalArgumentException("duplicate label: " + label);
                }
            }
            ExpenseItem row = new ExpenseItem(nextId++, month, label, amount, isEssential, purchaseVat);
            rows.add(row);
            return row;
        }
    }

    public ExpenseItem byId(long id) {
        synchronized (rows) {
            for (ExpenseItem r : rows) {
                if (r.id() == id) return r;
            }
        }
        return null;
    }

    public ExpenseItem update(long id, String month, String label, long amount, boolean isEssential, long purchaseVat) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).id() == id) {
                    for (ExpenseItem r : rows) {
                        if (r.id() != id && r.month().equals(month) && r.label().equals(label)) {
                            throw new IllegalArgumentException("duplicate label: " + label);
                        }
                    }
                    ExpenseItem row = new ExpenseItem(id, month, label, amount, isEssential, purchaseVat);
                    rows.set(i, row);
                    return row;
                }
            }
        }
        throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
    }

    public void delete(long id) {
        synchronized (rows) {
            boolean removed = rows.removeIf(r -> r.id() == id);
            if (!removed) {
                throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
            }
        }
    }
}
