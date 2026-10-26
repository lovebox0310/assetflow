package com.assetflow.assets;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
            Map<String, Integer> indexByKey = new LinkedHashMap<>();
            for (int i = 0; i < rows.size(); i++) {
                indexByKey.put(rows.get(i).rowKey(), i);
            }
            for (ImportedRow r : incoming) {
                Integer existing = indexByKey.get(r.rowKey());
                if (existing == null) {
                    rows.add(r);
                    indexByKey.put(r.rowKey(), rows.size() - 1);
                    stored++;
                } else if (isBlank(rows.get(existing).businessNo()) && !isBlank(r.businessNo())) {
                    // business_no/business_category 가 비어 있는 기존 행에 최신 값을 채운다
                    rows.set(existing, withBusinessInfo(rows.get(existing), r.businessNo(), r.businessCategory()));
                    stored++;
                }
            }
        }
        return stored;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static ImportedRow withBusinessInfo(ImportedRow r, String businessNo, String businessCategory) {
        return new ImportedRow(
                r.rowKey(), r.approvedAt(), r.merchantName(),
                r.supplyExVat(), r.vat(), r.grossAmount(),
                r.cardMasked(), r.expenseKind(), r.subCategory(),
                businessNo, businessCategory);
    }

    public Optional<ImportedRow> find(String rowKey) {
        synchronized (rows) {
            return rows.stream().filter(r -> r.rowKey().equals(rowKey)).findFirst();
        }
    }

    public boolean updateClassification(String rowKey, String category, String subCategory) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                ImportedRow r = rows.get(i);
                if (r.rowKey().equals(rowKey)) {
                    rows.set(i, withClassification(r, category, subCategory));
                    return true;
                }
            }
        }
        return false;
    }

    public int updateClassificationByMerchant(String merchantName, String category, String subCategory) {
        int updated = 0;
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                ImportedRow r = rows.get(i);
                if (r.merchantName().equals(merchantName)) {
                    rows.set(i, withClassification(r, category, subCategory));
                    updated++;
                }
            }
        }
        return updated;
    }

    public List<UnclassifiedGroup> unclassifiedGroups() {
        synchronized (rows) {
            Map<String, List<ImportedRow>> byMerchant = new LinkedHashMap<>();
            for (ImportedRow r : rows) {
                if (isUnclassified(r.expenseKind())) {
                    byMerchant.computeIfAbsent(r.merchantName(), k -> new ArrayList<>()).add(r);
                }
            }
            List<UnclassifiedGroup> groups = new ArrayList<>();
            for (Map.Entry<String, List<ImportedRow>> e : byMerchant.entrySet()) {
                List<ImportedRow> list = e.getValue();
                long gross = list.stream().mapToLong(ImportedRow::grossAmount).sum();
                String first = list.stream().map(ImportedRow::approvedAt).min(String::compareTo).orElse("");
                String last = list.stream().map(ImportedRow::approvedAt).max(String::compareTo).orElse("");
                groups.add(new UnclassifiedGroup(e.getKey(), list.size(), gross, first, last));
            }
            groups.sort(Comparator
                    .comparingLong(UnclassifiedGroup::grossTotal).reversed()
                    .thenComparing(Comparator.comparingInt(UnclassifiedGroup::count).reversed())
                    .thenComparing(UnclassifiedGroup::merchantName));
            return groups;
        }
    }

    public int clearClassificationByMerchant(String merchantName) {
        return updateClassificationByMerchant(merchantName, "", "");
    }

    private static boolean isUnclassified(String kind) {
        return kind == null || kind.isBlank() || "unclassified".equals(kind);
    }

    private static ImportedRow withClassification(ImportedRow r, String category, String subCategory) {
        return new ImportedRow(
                r.rowKey(), r.approvedAt(), r.merchantName(),
                r.supplyExVat(), r.vat(), r.grossAmount(),
                r.cardMasked(), category, subCategory == null ? "" : subCategory,
                r.businessNo(), r.businessCategory());
    }
}
