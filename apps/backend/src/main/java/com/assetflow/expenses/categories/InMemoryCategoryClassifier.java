package com.assetflow.expenses.categories;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 인메모리 카테고리 분류기 (테스트·CI용).
 *
 * <p>운영(Postgres)과 같은 시드를 메모리에 올려 우선순위 동작을 맞춘다 (§67).</p>
 */
@Component
@Profile("!postgres")
public class InMemoryCategoryClassifier implements CategoryClassifier {

    private final Map<String, Classification> merchantRules = new ConcurrentHashMap<>();
    private final List<KeywordMapping> keywords = new CopyOnWriteArrayList<>();
    private final List<BusinessMapping> businessCategories = new CopyOnWriteArrayList<>();

    public InMemoryCategoryClassifier() {
        for (BusinessCategorySeed.Entry entry : BusinessCategorySeed.entries()) {
            businessCategories.add(new BusinessMapping(
                    entry.businessNo(),
                    entry.pattern(),
                    new Classification(entry.category(), entry.subCategory())));
        }
    }

    public void addKeyword(String keyword, String categoryName, int priority) {
        addKeyword(keyword, categoryName, "", priority);
    }

    public void addKeyword(String keyword, String categoryName, String subCategory, int priority) {
        keywords.add(new KeywordMapping(keyword, categoryName, subCategory == null ? "" : subCategory, priority));
        keywords.sort(Comparator.comparingInt(KeywordMapping::priority).reversed()
                .thenComparing(k -> k.keyword().length(), Comparator.reverseOrder()));
    }

    public void addRule(String merchantName, String categoryName) {
        addRule(merchantName, categoryName, "");
    }

    public void addRule(String merchantName, String categoryName, String subCategory) {
        merchantRules.put(merchantName, new Classification(categoryName, subCategory == null ? "" : subCategory));
    }

    /** 테스트용 사업자번호 매핑 (§67). */
    public void addBusinessNo(String businessNo, String categoryName, String subCategory) {
        businessCategories.add(new BusinessMapping(
                businessNo.replaceAll("\\D", ""),
                "",
                new Classification(categoryName, subCategory == null ? "" : subCategory)));
    }

    /** 테스트용 사업자번호 + 가맹점 패턴 매핑 (§67). */
    public void addBusinessNoPattern(String businessNo, String pattern, String categoryName, String subCategory) {
        businessCategories.add(new BusinessMapping(
                businessNo.replaceAll("\\D", ""),
                BusinessCategorySeed.normalize(pattern),
                new Classification(categoryName, subCategory == null ? "" : subCategory)));
    }

    @Override
    public Classification classifyByRule(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        String normalized = BusinessCategorySeed.normalize(merchantName);
        Classification rule = merchantRules.get(merchantName);
        if (rule == null) {
            return null;
        }
        // §66: 'unclassified' 는 카테고리가 아니다 — 세부로 대분류를 되살리거나 규칙을 버린다.
        if (CategoryTaxonomy.isUnset(rule.category())) {
            String derived = CategoryTaxonomy.groupOfSub(rule.subCategory());
            if (derived != null) {
                return new Classification(derived, rule.subCategory().trim());
            }
            return null;
        }
        if (rule.subCategory() != null && !rule.subCategory().isBlank()) {
            return rule;
        }
        return new Classification(rule.category(), keywordSubFor(normalized, rule.category()));
    }

    @Override
    public Classification classifyByBusinessNo(String businessNo, String merchantName) {
        String digits = businessNo == null ? "" : businessNo.replaceAll("\\D", "");
        if (digits.isEmpty()) {
            return null;
        }
        String normalized = BusinessCategorySeed.normalize(merchantName);
        BusinessMapping generic = null;
        BusinessMapping specific = null;
        for (BusinessMapping mapping : businessCategories) {
            if (!mapping.businessNo().equals(digits)) {
                continue;
            }
            if (mapping.pattern().isEmpty()) {
                if (generic == null) {
                    generic = mapping;
                }
                continue;
            }
            if (normalized.contains(mapping.pattern())) {
                if (specific == null || mapping.pattern().length() > specific.pattern().length()) {
                    specific = mapping;
                }
            }
        }
        BusinessMapping matched = specific != null ? specific : generic;
        return matched == null ? null : matched.classification();
    }

    @Override
    public Classification classifyByKeyword(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        String normalized = BusinessCategorySeed.normalize(merchantName);
        for (KeywordMapping kw : keywords) {
            if (normalized.contains(BusinessCategorySeed.normalize(kw.keyword()))) {
                return new Classification(kw.categoryName(), kw.subCategory());
            }
        }
        return null;
    }

    private String keywordSubFor(String normalizedMerchant, String category) {
        for (KeywordMapping kw : keywords) {
            if (!kw.categoryName().equals(category)) {
                continue;
            }
            if (normalizedMerchant.contains(BusinessCategorySeed.normalize(kw.keyword()))) {
                return kw.subCategory();
            }
        }
        return "";
    }

    private record KeywordMapping(String keyword, String categoryName, String subCategory, int priority) {}

    private record BusinessMapping(String businessNo, String pattern, Classification classification) {}
}
