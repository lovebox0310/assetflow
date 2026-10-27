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
                    // Postgres 와 동일: 같은 recurring_id 면 skip, 수동 행은 같은 label 이면 skip
                    if (r.month().equals(month)
                            && (def.id() == r.recurringId() || r.label().equals(def.label()))) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    rows.add(new ExpenseItem(nextId++, month, def.label(), def.amount(), def.isEssential(), def.purchaseVat(), def.id(), def.category()));
                }
            }
        }
    }

    public void renameRecurringRows(long recurringId, String oldLabel, String newLabel) {
        synchronized (rows) {
            for (ExpenseItem r : rows) {
                if (r.recurringId() != null && r.recurringId() == recurringId
                        && r.label().equals(newLabel)) {
                    continue; // 이미 원하는 이름 — 충돌 검사에서 제외
                }
                if (r.label().equals(newLabel) && (r.recurringId() == null || r.recurringId() != recurringId)) {
                    throw new IllegalArgumentException("label conflict in month " + r.month());
                }
            }
            for (int i = 0; i < rows.size(); i++) {
                ExpenseItem r = rows.get(i);
                if (r.recurringId() != null && r.recurringId() == recurringId && r.label().equals(oldLabel)) {
                    rows.set(i, new ExpenseItem(r.id(), r.month(), newLabel, r.amount(), r.isEssential(), r.purchaseVat(), r.recurringId(), r.category()));
                }
            }
        }
    }

    public void updateRecurringRows(long recurringId,
                                    long oldAmount, boolean oldEssential, long oldPurchaseVat,
                                    long newAmount, boolean newEssential, long newPurchaseVat) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                ExpenseItem r = rows.get(i);
                if (r.recurringId() != null && r.recurringId() == recurringId
                        && r.amount() == oldAmount
                        && r.isEssential() == oldEssential
                        && r.purchaseVat() == oldPurchaseVat) {
                    rows.set(i, new ExpenseItem(r.id(), r.month(), r.label(), newAmount, newEssential, newPurchaseVat, r.recurringId(), r.category()));
                }
            }
        }
    }

    public void updateRecurringCategory(long recurringId, String oldCategory, String newCategory) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                ExpenseItem r = rows.get(i);
                if (r.recurringId() != null && r.recurringId() == recurringId
                        && java.util.Objects.equals(r.category(), oldCategory)) {
                    rows.set(i, new ExpenseItem(r.id(), r.month(), r.label(), r.amount(),
                            r.isEssential(), r.purchaseVat(), r.recurringId(), newCategory));
                }
            }
        }
    }

    public List<MonthlyItemTotal> monthlyCategoryTotals(String from, String to) {
        java.util.Map<String, Long> totals = new java.util.TreeMap<>();
        synchronized (rows) {
            for (ExpenseItem r : rows) {
                if (r.month().compareTo(from) < 0 || r.month().compareTo(to) > 0) continue;
                if (r.category() == null || r.category().isBlank()) continue;
                totals.merge(r.month() + "|" + r.category(), r.amount(), Long::sum);
            }
        }
        List<MonthlyItemTotal> out = new ArrayList<>();
        for (java.util.Map.Entry<String, Long> e : totals.entrySet()) {
            String[] parts = e.getKey().split("\\|", 2);
            out.add(new MonthlyItemTotal(parts[0], parts[1], e.getValue()));
        }
        return out;
    }

    public void linkRecurring(long id, Long recurringId) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).id() == id) {
                    rows.set(i, new ExpenseItem(id, rows.get(i).month(), rows.get(i).label(),
                            rows.get(i).amount(), rows.get(i).isEssential(), rows.get(i).purchaseVat(), recurringId,
                            rows.get(i).category()));
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
                    if (!t2.month().equals(to)) continue;
                    // Postgres 와 동일: 같은 recurring_id(정기) 또는 같은 label 이면 skip
                    if ((r.recurringId() != null && r.recurringId().equals(t2.recurringId()))
                            || r.label().equals(t2.label())) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    copies.add(new ExpenseItem(nextId++, to, r.label(), r.amount(), r.isEssential(), r.purchaseVat(), r.recurringId(), r.category()));
                    copied++;
                }
            }
            rows.addAll(copies);
            return copied;
        }
    }

    public ExpenseItem create(String month, String label, long amount, boolean isEssential, long purchaseVat, String category) {
        synchronized (rows) {
            for (ExpenseItem r : rows) {
                if (r.month().equals(month) && r.label().equals(label)) {
                    throw new IllegalArgumentException("duplicate label: " + label);
                }
            }
            ExpenseItem row = new ExpenseItem(nextId++, month, label, amount, isEssential, purchaseVat, null, category);
            rows.add(row);
            return row;
        }
    }

    public ExpenseItem update(long id, String month, String label, long amount, boolean isEssential, long purchaseVat, String category) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).id() == id) {
                    for (ExpenseItem r : rows) {
                        if (r.id() != id && r.month().equals(month) && r.label().equals(label)) {
                            throw new IllegalArgumentException("duplicate label: " + label);
                        }
                    }
                    ExpenseItem row = new ExpenseItem(id, month, label, amount, isEssential, purchaseVat, rows.get(i).recurringId(), category);
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
