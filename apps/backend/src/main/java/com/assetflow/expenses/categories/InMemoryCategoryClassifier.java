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
 */
@Component
@Profile("!postgres")
public class InMemoryCategoryClassifier implements CategoryClassifier {

    private final Map<String, Classification> merchantRules = new ConcurrentHashMap<>();
    private final List<KeywordMapping> keywords = new CopyOnWriteArrayList<>();

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

    @Override
    public Classification classify(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        String normalized = merchantName.toLowerCase().replaceAll("\\s+", "");

        Classification rule = merchantRules.get(merchantName);
        if (rule != null) {
            if (rule.subCategory() != null && !rule.subCategory().isBlank()) {
                return rule;
            }
            String sub = keywordSubFor(normalized, rule.category());
            return new Classification(rule.category(), sub);
        }

        for (KeywordMapping kw : keywords) {
            if (normalized.contains(kw.keyword().toLowerCase().replaceAll("\\s+", ""))) {
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
            if (normalizedMerchant.contains(kw.keyword().toLowerCase().replaceAll("\\s+", ""))) {
                return kw.subCategory();
            }
        }
        return "";
    }

    private record KeywordMapping(String keyword, String categoryName, String subCategory, int priority) {}
}
