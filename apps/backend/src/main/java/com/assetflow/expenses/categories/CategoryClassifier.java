package com.assetflow.expenses.categories;

import jakarta.annotation.Nullable;

/**
 * 가맹점명과 카드 명세서 업종을 보고 카테고리를 추론한다 (§55.8, §55.10, §55.8.9).
 * 1순위: 사용자가 이전에 지정한 merchant_rules
 * 2순위: merchant_category_keywords 키워드 매칭
 * 3순위: 카드사가 붙인 업종(businessCategory) — 명확한 값만
 * 실패 시 null 을 반환한다 — 호출 측에서 "미분류"로 처리.
 */
public interface CategoryClassifier {

    /** 대분류 + 세부 분류. 세부는 없을 수 있다. */
    record Classification(String category, String subCategory) {
        public boolean unclassified() {
            return category == null || category.isBlank();
        }
    }

    @Nullable
    Classification classify(String merchantName);

    /**
     * 업종을 3순위 fallback 으로 붙인 분류 (§55.8.9).
     *
     * <p>규칙·키워드가 이미 대분류를 정했으면 그대로 쓴다. 다만 세부 분류가 비어 있고
     * 업종이 같은 대분류를 가리키면 세부만 업종에서 빌려 온다 — 대분류를 업종으로
     * 덮어쓰지 않는다(사용자 규칙·가맹점명이 항상 우선).
     */
    default Classification classify(String merchantName, String businessCategory) {
        Classification primary = classify(merchantName);
        Classification hint = BusinessCategoryHints.classify(businessCategory);
        if (primary == null || primary.unclassified()) {
            return hint;
        }
        boolean subMissing = primary.subCategory() == null || primary.subCategory().isBlank();
        if (subMissing && hint != null && primary.category().equals(hint.category())) {
            return new Classification(primary.category(), hint.subCategory());
        }
        return primary;
    }
}
