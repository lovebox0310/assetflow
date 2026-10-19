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

    public ExpenseItem byId(long id) {
        synchronized (rows) {
            for (ExpenseItem r : rows) {
                if (r.id() == id) return r;
            }
        }
        return null;
    }

    public void ensureRecurringRows(String month, List<RecurringExpenseLedger.Recurring> defs) {
        synchronized (rows) {
            for (RecurringExpenseLedger.Recurring def : defs) {
                boolean exists = false;
                for (ExpenseItem r : rows) {
                    if (r.month().equals(month) && r.label().equals(def.label())) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    rows.add(new ExpenseItem(nextId++, month, def.label(), def.amount(), def.isEssential(), def.purchaseVat(), def.id()));
                }
            }
        }
    }

    public void linkRecurring(long id, Long recurringId) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).id() == id) {
                    rows.set(i, new ExpenseItem(id, rows.get(i).month(), rows.get(i).label(),
                            rows.get(i).amount(), rows.get(i).isEssential(), rows.get(i).purchaseVat(), recurringId));
                    return;
                }
            }
        }
        throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
    }

    public int copyMonth(String from, String to) {
        synchronized (rows) {
            int copied = 0;
            List<ExpenseItem> copies = new ArrayList<>();
            for (ExpenseItem r : rows) {
                if (!r.month().equals(from)) continue;
                boolean exists = false;
                for (ExpenseItem t2 : rows) {
                    if (t2.month().equals(to) && t2.label().equals(r.label())) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    copies.add(new ExpenseItem(nextId++, to, r.label(), r.amount(), r.isEssential(), r.purchaseVat(), r.recurringId()));
                    copied++;
                }
            }
            rows.addAll(copies);
            return copied;
        }
    }

    public ExpenseItem create(String month, String label, long amount, boolean isEssential, long purchaseVat) {
        synchronized (rows) {
            for (ExpenseItem r : rows) {
                if (r.month().equals(month) && r.label().equals(label)) {
                    throw new IllegalArgumentException("duplicate label: " + label);
                }
            }
            ExpenseItem row = new ExpenseItem(nextId++, month, label, amount, isEssential, purchaseVat, null);
            rows.add(row);
            return row;
        }
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
                    ExpenseItem row = new ExpenseItem(id, month, label, amount, isEssential, purchaseVat, rows.get(i).recurringId());
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
