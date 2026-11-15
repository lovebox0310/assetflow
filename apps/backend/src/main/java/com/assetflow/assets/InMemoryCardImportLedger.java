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

    @Override
    public List<ImportedRow> byBusinessNo(String businessNo) {
        if (businessNo == null || businessNo.isBlank()) {
            return List.of();
        }
        synchronized (rows) {
            return rows.stream().filter(r -> businessNo.equals(r.businessNo())).toList();
        }
    }

    @Override
    public String businessNoForMerchant(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        synchronized (rows) {
            return rows.stream()
                    .filter(r -> merchantName.equals(r.merchantName()))
                    .map(ImportedRow::businessNo)
                    .filter(b -> b != null && !b.isBlank())
                    .findFirst().orElse(null);
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
            // (카드사·이용일·금액) 자연키 → 그 키를 가진 행 인덱스 목록(저장 순서).
            // 순번(#1, #2)이 곧 이 목록의 위치다 — 같은 날 같은 금액이 실제로
            // 여러 번 있을 수 있으므로 개수만 세지 않고 자리로 맞춘다.
            Map<String, Integer> indexByKey = new LinkedHashMap<>();
            Map<String, List<Integer>> slotsByNatural = new LinkedHashMap<>();
            for (int i = 0; i < rows.size(); i++) {
                ImportedRow row = rows.get(i);
                indexByKey.put(row.rowKey(), i);
                slotsByNatural.computeIfAbsent(naturalKeyOf(row), k -> new ArrayList<>()).add(i);
            }
            Map<String, Integer> batchCounts = new LinkedHashMap<>();
            for (ImportedRow r : incoming) {
                String natural = naturalKeyOf(r);
                int nth = batchCounts.merge(natural, 1, Integer::sum);
                List<Integer> slots = slotsByNatural.computeIfAbsent(natural, k -> new ArrayList<>());
                Integer sameRowKey = indexByKey.get(r.rowKey());
                int slot = -1;
                ImportedRow current = null;
                if (sameRowKey != null) {
                    slot = sameRowKey;
                    current = rows.get(slot);
                } else if (slots.size() >= nth) {
                    slot = slots.get(nth - 1);
                    current = rows.get(slot);
                }
                if (current == null) {
                    rows.add(r);
                    int index = rows.size() - 1;
                    indexByKey.put(r.rowKey(), index);
                    slots.add(index);
                    stored++;
                    continue;
                }
                ImportedRow merged = merge(current, r);
                if (merged == null || merged == current) {
                    // null: CSV 정본을 이메일 값으로 덮어쓰지 않는다 / 같은 인스턴스: 바뀐 값 없음
                    continue;
                }
                String beforeNatural = naturalKeyOf(current);
                String afterNatural = naturalKeyOf(merged);
                if (!beforeNatural.equals(afterNatural)) {
                    List<Integer> before = slotsByNatural.get(beforeNatural);
                    if (before != null) {
                        before.remove(Integer.valueOf(slot));
                    }
                    slotsByNatural.computeIfAbsent(afterNatural, k -> new ArrayList<>()).add(slot);
                }
                if (!merged.rowKey().equals(current.rowKey())) {
                    indexByKey.remove(current.rowKey());
                    indexByKey.put(merged.rowKey(), slot);
                }
                rows.set(slot, merged);
                stored++;
            }
        }
        return stored;
    }

    private static String naturalKeyOf(ImportedRow r) {
        return CardImportLedger.naturalKey(r.cardCompany(), r.approvedAt(), r.grossAmount());
    }

    private static String sourceOf(ImportedRow r) {
        return CardImportLedger.normalizeSource(r.source());
    }

    /**
     * 같은 자연키 자리의 기존 행과 새 행을 합친다. 병합 결과가 없으면(null) 무시한다.
     * <ol>
     *   <li>기존 csv + 신규 email → 무시(CSV 정본)</li>
     *   <li>기존 unknown/email + 신규 csv → CSV 값으로 대체</li>
     *   <li>그 외(같은 출처) → 빈 필드만 보강</li>
     * </ol>
     */
    private static ImportedRow merge(ImportedRow current, ImportedRow incoming) {
        String currentSource = sourceOf(current);
        String incomingSource = sourceOf(incoming);
        if (CardImportLedger.SOURCE_CSV.equals(currentSource)
                && !CardImportLedger.SOURCE_CSV.equals(incomingSource)) {
            return null;
        }
        if (CardImportLedger.SOURCE_CSV.equals(incomingSource)
                && !CardImportLedger.SOURCE_CSV.equals(currentSource)) {
            return replacedByCsv(current, incoming);
        }
        ImportedRow updated = current;
        // business_no/business_category 가 비어 있는 기존 행에 최신 값을 채운다
        if (isBlank(current.businessNo()) && !isBlank(incoming.businessNo())) {
            updated = withBusinessInfo(updated, incoming.businessNo(), incoming.businessCategory());
        }
        // 같은 거래라도 카드 소유 구분(본인/가족)은 명세서 최신 값을 따른다
        if (!java.util.Objects.equals(current.memberRelation(), incoming.memberRelation())) {
            updated = withMemberRelation(updated, incoming.memberRelation());
        }
        return updated;
    }

    /**
     * CARD-MERGE-1 2번 규칙: 이메일/미확인 행을 CSV 값으로 대체한다.
     * 가맹점명·부가세·공급가·승인번호(row_key)·카드번호·사업자번호·업종·카드사·출처를 CSV 값으로,
     * 분류는 기존 값이 있으면 유지하고 CSV 분류가 있으면 CSV 값으로 갱신한다.
     */
    private static ImportedRow replacedByCsv(ImportedRow current, ImportedRow csv) {
        boolean csvHasCategory = !isBlank(csv.expenseKind());
        return new ImportedRow(
                csv.rowKey(), csv.approvedAt(), csv.merchantName(),
                csv.supplyExVat(), csv.vat(), csv.grossAmount(),
                csv.cardMasked(),
                csvHasCategory ? csv.expenseKind() : safe(current.expenseKind()),
                csvHasCategory ? safe(csv.subCategory()) : safe(current.subCategory()),
                csv.businessNo(), csv.businessCategory(),
                isBlank(csv.memberRelation()) ? safe(current.memberRelation()) : csv.memberRelation(),
                isBlank(csv.cardCompany()) ? safe(current.cardCompany()) : csv.cardCompany(),
                CardImportLedger.SOURCE_CSV);
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static ImportedRow withBusinessInfo(ImportedRow r, String businessNo, String businessCategory) {
        return new ImportedRow(
                r.rowKey(), r.approvedAt(), r.merchantName(),
                r.supplyExVat(), r.vat(), r.grossAmount(),
                r.cardMasked(), r.expenseKind(), r.subCategory(),
                businessNo, businessCategory,
                r.memberRelation(), r.cardCompany(), r.source());
    }

    private static ImportedRow withMemberRelation(ImportedRow r, String memberRelation) {
        return new ImportedRow(
                r.rowKey(), r.approvedAt(), r.merchantName(),
                r.supplyExVat(), r.vat(), r.grossAmount(),
                r.cardMasked(), r.expenseKind(), r.subCategory(),
                r.businessNo(), r.businessCategory(),
                memberRelation == null || memberRelation.isBlank() ? "본인" : memberRelation,
                r.cardCompany(), r.source());
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
                String businessCategory = list.stream()
                        .map(ImportedRow::businessCategory)
                        .filter(v -> v != null && !v.isBlank())
                        .distinct()
                        .collect(java.util.stream.Collectors.joining(", "));
                String businessNo = list.stream()
                        .map(ImportedRow::businessNo)
                        .filter(v -> v != null && !v.isBlank())
                        .distinct()
                        .collect(java.util.stream.Collectors.joining(", "));
                groups.add(new UnclassifiedGroup(e.getKey(), list.size(), gross, first, last, businessCategory, businessNo));
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

    public List<MonthlyCategoryTotal> monthlyCategoryTotals(String fromMonth, String toMonth) {
        String from = fromMonth + "-01";
        String untilExclusive = nextMonth(toMonth) + "-01";
        Map<String, Long> totals = new java.util.TreeMap<>();
        synchronized (rows) {
            for (ImportedRow r : rows) {
                if (r.approvedAt() == null
                        || r.approvedAt().compareTo(from) < 0
                        || r.approvedAt().compareTo(untilExclusive) >= 0) {
                    continue;
                }
                if ("저축/투자".equals(r.subCategory())) {
                    continue;
                }
                String category = isUnclassified(r.expenseKind()) ? "미분류" : r.expenseKind();
                String key = r.approvedAt().substring(0, 7) + "|" + category;
                totals.merge(key, r.grossAmount(), Long::sum);
            }
        }
        List<MonthlyCategoryTotal> out = new ArrayList<>();
        for (Map.Entry<String, Long> e : totals.entrySet()) {
            String[] parts = e.getKey().split("\\|", 2);
            out.add(new MonthlyCategoryTotal(parts[0], parts[1], e.getValue()));
        }
        return out;
    }

    /** "2026-12" → "2027-01" */
    private static String nextMonth(String month) {
        int year = Integer.parseInt(month.substring(0, 4));
        int m = Integer.parseInt(month.substring(5, 7));
        return m == 12 ? (year + 1) + "-01" : year + "-" + String.format("%02d", m + 1);
    }

    private static boolean isUnclassified(String kind) {
        return kind == null || kind.isBlank() || "unclassified".equals(kind);
    }

    private static ImportedRow withClassification(ImportedRow r, String category, String subCategory) {
        return new ImportedRow(
                r.rowKey(), r.approvedAt(), r.merchantName(),
                r.supplyExVat(), r.vat(), r.grossAmount(),
                r.cardMasked(), category, subCategory == null ? "" : subCategory,
                r.businessNo(), r.businessCategory(),
                r.memberRelation(), r.cardCompany(), r.source());
    }

    public int backfillCardCompany() {
        int updated = 0;
        synchronized (rows) {
            Map<String, String> companyByMasked = new LinkedHashMap<>();
            for (ImportedRow r : rows) {
                if (isBlank(r.cardCompany()) || isBlank(r.cardMasked())) continue;
                companyByMasked.putIfAbsent(r.cardMasked(), r.cardCompany());
            }
            for (int i = 0; i < rows.size(); i++) {
                ImportedRow r = rows.get(i);
                if (!isBlank(r.cardCompany()) || isBlank(r.cardMasked())) continue;
                String company = companyByMasked.get(r.cardMasked());
                if (company != null) {
                    rows.set(i, new ImportedRow(
                            r.rowKey(), r.approvedAt(), r.merchantName(),
                            r.supplyExVat(), r.vat(), r.grossAmount(),
                            r.cardMasked(), r.expenseKind(), r.subCategory(),
                            r.businessNo(), r.businessCategory(),
                            r.memberRelation(), company, r.source()));
                    updated++;
                }
            }
        }
        return updated;
    }
}
