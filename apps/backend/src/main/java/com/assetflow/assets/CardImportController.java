package com.assetflow.assets;

import com.assetflow.assets.CardImportLedger.ImportedRow;
import com.assetflow.assets.MerchantRuleLedger.MerchantRule;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.expenses.categories.CategoryClassifier;
import com.assetflow.expenses.categories.CategoryClassifier.Classification;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 카드매입 임포트 확정 API (§41).
 * §29.2 신뢰 경계: 조작된/오류난 미리보기가 그대로 저장되지 않게 서버가 재검증한다.
 * §29.7: 합계는 요청에서 받지 않고 저장된 행에서 재계산해 돌려준다.
 * §55.10: 카테고리는 대분류(expenseKind) + 세부 분류(subCategory) 두 단계다.
 */
@RestController
@RequestMapping("/api/v1/assets")
public class CardImportController {

    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern MONTH_PATTERN = Pattern.compile("\\d{4}-(0[1-9]|1[0-2])");

    private final CardImportLedger ledger;
    private final MerchantRuleLedger ruleLedger;
    private final CategoryClassifier categoryClassifier;

    public CardImportController(CardImportLedger ledger,
                                MerchantRuleLedger ruleLedger,
                                CategoryClassifier categoryClassifier) {
        this.ledger = ledger;
        this.ruleLedger = ruleLedger;
        this.categoryClassifier = categoryClassifier;
    }

    public record ImportRow(String rowKey, String approvedAt, String merchantName,
                            Long supplyExVat, Long vat, Long grossAmount,
                            String cardMasked, String expenseKind, String subCategory,
                            String businessNo, String businessCategory) {}

    public record ImportRequest(List<ImportRow> rows, Map<String, MerchantRule> merchantRules) {}

    public record CategoryUpdate(String rowKey, String category, String subCategory) {}

    public record MerchantCategoryUpdate(String merchantName, String category, String subCategory) {}

    /**
     * 가맹점별 카테고리 제안 (§55.8, §55.10).
     * 저장된 사용자 규칙이 1순위, 없으면 키워드 기반 자동 분류 결과를 함께 돌려준다.
     * merchant 파라미터가 없으면 저장된 규칙 전체만 반환한다(키워드 제안은 대상 가맹점이 필요).
     */
    @GetMapping("/card-imports/merchant-rules")
    public ApiResponse<Map<String, MerchantRule>> merchantRules(
            @RequestParam(value = "merchant", required = false) List<String> merchants) {
        if (merchants == null || merchants.isEmpty()) {
            return new ApiResponse<>("OK", "Merchant rules loaded", Map.copyOf(ruleLedger.allRuleDetails()));
        }
        Map<String, MerchantRule> rules = new HashMap<>(ruleLedger.ruleDetailsFor(Set.copyOf(merchants)));
        for (String merchant : merchants) {
            if (merchant == null || merchant.isBlank()) {
                continue;
            }
            MerchantRule stored = rules.get(merchant);
            if (stored != null && !isBlank(stored.subCategory())) {
                continue;
            }
            Classification classified = categoryClassifier.classify(merchant);
            if (classified == null) {
                continue;
            }
            if (stored == null) {
                rules.put(merchant, new MerchantRule(classified.category(), safe(classified.subCategory())));
            } else if (isBlank(stored.subCategory())) {
                // 대분류만 저장된 규칙에는 같은 대분류의 키워드 세부를 붙인다.
                String sub = classified.category().equals(stored.category())
                        ? safe(classified.subCategory()) : "";
                rules.put(merchant, new MerchantRule(stored.category(), sub));
            }
        }
        return new ApiResponse<>("OK", "Merchant rules loaded", Map.copyOf(rules));
    }

    @GetMapping("/card-imports/row-keys")
    public ApiResponse<List<String>> rowKeys() {
        return new ApiResponse<>("OK", "Row keys loaded", List.copyOf(ledger.existingRowKeys()));
    }

    /** 월별 반영 행 조회 — 지출 화면의 "가져온 카드내역" 표용 (§42/§43 월 단위와 정렬). */
    @GetMapping("/card-imports")
    public ApiResponse<List<ImportedRow>> monthRows(@RequestParam("month") String month) {
        if (!MONTH_PATTERN.matcher(month).matches()) {
            throw new IllegalArgumentException("month must be YYYY-MM");
        }
        return new ApiResponse<>("OK", "Card imports loaded", ledger.inMonth(month));
    }

    @PostMapping("/card-imports")
    public ApiResponse<Map<String, Object>> submit(@RequestBody ImportRequest request) {
        if (request.rows() == null || request.rows().isEmpty()) {
            throw new IllegalArgumentException("rows is empty");
        }
        Map<String, MerchantRule> submittedRules = request.merchantRules() == null
                ? Map.of() : request.merchantRules();

        // §49: 저장된 규칙을 먼저 읽어 미분류 행에 자동 적용한다.
        Set<String> merchantNames = new HashSet<>();
        for (ImportRow row : request.rows()) {
            merchantNames.add(row.merchantName());
        }
        Map<String, MerchantRule> storedRules = new HashMap<>(ruleLedger.ruleDetailsFor(merchantNames));

        List<ImportedRow> incoming = new ArrayList<>();
        int supplyInconsistent = 0;
        for (ImportRow row : request.rows()) {
            MerchantRule rule = submittedRules.get(row.merchantName());
            if (rule == null || isBlank(rule.category())) {
                rule = storedRules.get(row.merchantName());
            }
            String category = rule == null ? "" : safe(rule.category());
            String subCategory = rule == null ? "" : safe(rule.subCategory());
            // §55.8: 제출/저장 규칙이 없으면 키워드 기반 자동 분류를 제안한다.
            if (isBlank(category)) {
                Classification classified = categoryClassifier.classify(row.merchantName());
                if (classified != null) {
                    category = safe(classified.category());
                    subCategory = safe(classified.subCategory());
                }
            } else if (isBlank(subCategory)) {
                // 규칙에 세부가 없으면 같은 대분류의 키워드 세부를 빌려 온다.
                Classification classified = categoryClassifier.classify(row.merchantName());
                if (classified != null && category.equals(classified.category())) {
                    subCategory = safe(classified.subCategory());
                }
            }
            // 행이 직접 세부를 들고 오면 그 값을 우선한다.
            if (!isBlank(row.subCategory())) {
                subCategory = row.subCategory().trim();
            }
            if (!isBlank(row.expenseKind())) {
                category = row.expenseKind().trim();
            }
            if (isBlank(category)) {
                subCategory = "";
            }
            String businessNo = row.businessNo() == null ? "" : row.businessNo().replaceAll("-", "").trim();
            String businessCategory = row.businessCategory() == null ? "" : row.businessCategory().trim();
            ImportedRow r = new ImportedRow(
                    requiredText(row.rowKey(), "rowKey"),
                    requiredIsoDate(row.approvedAt()),
                    requiredText(row.merchantName(), "merchantName"),
                    requiredLong(row.supplyExVat(), "supplyExVat"),
                    requiredLong(row.vat(), "vat"),
                    requiredLong(row.grossAmount(), "grossAmount"),
                    row.cardMasked() == null ? "" : row.cardMasked(),
                    category,
                    subCategory,
                    businessNo,
                    businessCategory);
            // §29.3 공급가액+세액=공급대가 를 행마다 검사한다 — 어긋나면 저장은 하되
            // 경고를 돌려준다(현대카드의 가맹점 신고 부가세 변형이 정상 범위라 잘라내지 않는다).
            if (r.supplyExVat() + r.vat() != r.grossAmount()) {
                supplyInconsistent++;
            }
            incoming.add(r);
        }

        // §49: 제출된 규칙을 저장한다. 사용자가 수정한 값은 이후 반영에 적용된다.
        Map<String, MerchantRule> rulesToSave = new HashMap<>(submittedRules);
        for (ImportedRow r : incoming) {
            if (!r.expenseKind().isBlank()) {
                rulesToSave.put(r.merchantName(), new MerchantRule(r.expenseKind(), r.subCategory()));
            }
        }
        ruleLedger.saveAllDetails(rulesToSave);

        // §29.6: 중복 rowKey 는 한 건만 반영 — 건수를 결과로 알린다
        int stored = ledger.addAll(incoming);
        List<ImportedRow> all = ledger.all();

        // 합계는 행에서 재계산 (§29.7 — 스냅샷에 합계를 두지 않는다)
        long gross = 0, vat = 0, supply = 0;
        for (ImportedRow r : all) {
            gross += r.grossAmount();
            vat += r.vat();
            supply += r.supplyExVat();
        }
        Set<String> keys = ledger.existingRowKeys();
        int duplicatesInBatch = incoming.size() - new HashSet<String>(incoming.stream().map(ImportedRow::rowKey).toList()).size();
        return new ApiResponse<>("OK", "Card imports stored", Map.of(
                "stored", stored,
                "received", incoming.size(),
                "totalRows", all.size(),
                "duplicatesInBatch", duplicatesInBatch,
                "knownRowKeys", keys.size(),
                "totals", Map.of("gross", gross, "vat", vat, "supplyExVat", supply),
                "supplyInconsistentRows", supplyInconsistent));
    }

    /** 기존 카드 내역을 키워드/규칙 기반으로 일괄 재분류한다 (§55.8, §55.10). */
    @PostMapping("/card-imports/reclassify")
    public ApiResponse<Map<String, Object>> reclassify() {
        List<ImportedRow> rows = ledger.all();
        int updated = 0;
        for (ImportedRow row : rows) {
            if (row.merchantName() == null || row.merchantName().isBlank()) {
                continue;
            }
            Classification classified = categoryClassifier.classify(row.merchantName());
            if (classified == null || isBlank(classified.category())) {
                continue;
            }
            String category = classified.category();
            String subCategory = safe(classified.subCategory());
            if (!category.equals(row.expenseKind()) || !subCategory.equals(safe(row.subCategory()))) {
                ledger.updateClassification(row.rowKey(), category, subCategory);
                updated++;
            }
        }
        return new ApiResponse<>("OK", "Reclassification completed", Map.of(
                "total", rows.size(),
                "updated", updated));
    }

    /** 한 카드 행의 카테고리를 사용자가 직접 바꾼다. 같은 가맹점 행 전체 + 향후 임포트 규칙에 반영한다. */
    @PatchMapping("/card-imports/category")
    public ApiResponse<Map<String, Object>> updateCategory(@RequestBody CategoryUpdate request) {
        String rowKey = requiredText(request.rowKey(), "rowKey");
        String category = validCategory(request.category());
        String subCategory = validSubCategory(request.subCategory());
        ImportedRow row = ledger.find(rowKey)
                .orElseThrow(() -> new IllegalArgumentException("unknown rowKey: " + rowKey));
        // 같은 가맹점의 다른 달 행도 함께 맞춘다 — 월별 합계가 서로 어긋나지 않게.
        int updatedRows = ledger.updateClassificationByMerchant(row.merchantName(), category, subCategory);
        ruleLedger.saveAllDetails(Map.of(row.merchantName(), new MerchantRule(category, subCategory)));
        return new ApiResponse<>("OK", "Category updated", Map.of(
                "rowKey", rowKey,
                "merchantName", row.merchantName(),
                "category", category,
                "subCategory", subCategory,
                "updatedRows", updatedRows));
    }

    /** 미분류 정리 작업함 — 가맹점별 묶음 (§55.8). */
    @GetMapping("/card-imports/unclassified")
    public ApiResponse<List<CardImportLedger.UnclassifiedGroup>> unclassified() {
        return new ApiResponse<>("OK", "Unclassified groups loaded", ledger.unclassifiedGroups());
    }

    /**
     * 가맹점 단위 일괄 분류/되돌리기 (§55.8 작업함).
     * category 가 비어 있으면 그 가맹점 행을 모두 미분류로 되돌리고 규칙도 지운다.
     */
    @PatchMapping("/card-imports/merchant-category")
    public ApiResponse<Map<String, Object>> updateMerchantCategory(@RequestBody MerchantCategoryUpdate request) {
        String merchantName = requiredText(request.merchantName(), "merchantName");
        String category = request.category() == null ? "" : request.category().trim();
        String subCategory = request.subCategory() == null ? "" : request.subCategory().trim();
        if (!category.isBlank()) {
            category = validCategory(category);
            subCategory = validSubCategory(subCategory);
        }
        int updatedRows;
        if (category.isBlank()) {
            updatedRows = ledger.clearClassificationByMerchant(merchantName);
            ruleLedger.delete(merchantName);
            subCategory = "";
        } else {
            updatedRows = ledger.updateClassificationByMerchant(merchantName, category, subCategory);
            ruleLedger.saveAllDetails(Map.of(merchantName, new MerchantRule(category, subCategory)));
        }
        return new ApiResponse<>("OK", "Merchant category updated", Map.of(
                "merchantName", merchantName,
                "category", category,
                "subCategory", subCategory,
                "updatedRows", updatedRows));
    }

    private String validCategory(String value) {
        String category = requiredText(value, "category").trim();
        if (category.length() > 20) {
            throw new IllegalArgumentException("category must be 20 characters or fewer");
        }
        return category;
    }

    private String validSubCategory(String value) {
        String subCategory = value == null ? "" : value.trim();
        if (subCategory.length() > 30) {
            throw new IllegalArgumentException("subCategory must be 30 characters or fewer");
        }
        return subCategory;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private String requiredText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }

    private String requiredIsoDate(String value) {
        if (value == null || !ISO_DATE.matcher(value).matches()) {
            throw new IllegalArgumentException("approvedAt must be an ISO date (YYYY-MM-DD)");
        }
        return value;
    }

    /** 정수 검증. 음수는 허용 — 취소 행이 음수 금액으로 온다(§29.5.2 삼성). */
    private long requiredLong(Long value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        return value;
    }
}
