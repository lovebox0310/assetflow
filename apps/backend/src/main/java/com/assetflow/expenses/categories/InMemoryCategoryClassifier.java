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

    private final Map<String, String> merchantRules = new ConcurrentHashMap<>();
    private final List<KeywordMapping> keywords = new CopyOnWriteArrayList<>();

    public void addKeyword(String keyword, String categoryName, int priority) {
        keywords.add(new KeywordMapping(keyword, categoryName, priority));
        keywords.sort(Comparator.comparingInt(KeywordMapping::priority).reversed()
                .thenComparing(k -> k.keyword().length(), Comparator.reverseOrder()));
    }

    public void addRule(String merchantName, String categoryName) {
        merchantRules.put(merchantName, categoryName);
    }

    @Override
    public String classify(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        String normalized = merchantName.toLowerCase().replaceAll("\\s+", "");

        String rule = merchantRules.get(merchantName);
        if (rule != null) {
            return rule;
        }

        for (KeywordMapping kw : keywords) {
            if (normalized.contains(kw.keyword().toLowerCase().replaceAll("\\s+", ""))) {
                return kw.categoryName();
            }
        }
        return null;
    }

    private record KeywordMapping(String keyword, String categoryName, int priority) {}
}
