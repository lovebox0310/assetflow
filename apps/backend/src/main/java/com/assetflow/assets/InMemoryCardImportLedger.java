package com.assetflow.assets;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/** 카드매입 원장의 인메모리 구현. postgres 프로필이 아닌 환경(테스트·CI)의 기본값. */
@Component
@Profile("!postgres")
public class InMemoryCardImportLedger implements CardImportLedger {

    private final List<ImportedRow> rows = new ArrayList<>();

    public List<ImportedRow> all() {
        synchronized (rows) {
            return List.copyOf(rows);
        }
    }

    public List<ImportedRow> inMonth(String month) {
        synchronized (rows) {
            List<ImportedRow> out = new ArrayList<>();
            for (ImportedRow r : rows) {
                if (r.approvedAt().startsWith(month)) out.add(r);
            }
            return List.copyOf(out);
        }
    }

    public Set<String> existingRowKeys() {
        synchronized (rows) {
            Set<String> keys = new HashSet<>();
            for (ImportedRow r : rows) keys.add(r.rowKey());
            return keys;
        }
    }

    public int addAll(List<ImportedRow> incoming) {
        int stored = 0;
        synchronized (rows) {
            Set<String> keys = new HashSet<>();
            for (ImportedRow r : rows) keys.add(r.rowKey());
            for (ImportedRow r : incoming) {
                if (keys.add(r.rowKey())) {
                    rows.add(r);
                    stored++;
                }
            }
        }
        return stored;
    }

    public Optional<ImportedRow> find(String rowKey) {
        synchronized (rows) {
            return rows.stream().filter(r -> r.rowKey().equals(rowKey)).findFirst();
        }
    }

    public boolean updateExpenseKind(String rowKey, String expenseKind) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                ImportedRow r = rows.get(i);
                if (r.rowKey().equals(rowKey)) {
                    rows.set(i, withKind(r, expenseKind));
                    return true;
                }
            }
        }
        return false;
    }

    public int updateExpenseKindByMerchant(String merchantName, String expenseKind) {
        int updated = 0;
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                ImportedRow r = rows.get(i);
                if (r.merchantName().equals(merchantName)) {
                    rows.set(i, withKind(r, expenseKind));
                    updated++;
                }
            }
        }
        return updated;
    }

    private static ImportedRow withKind(ImportedRow r, String expenseKind) {
        return new ImportedRow(
                r.rowKey(), r.approvedAt(), r.merchantName(),
                r.supplyExVat(), r.vat(), r.grossAmount(),
                r.cardMasked(), expenseKind);
    }
}
