package com.assetflow.expenses.categories;

import jakarta.annotation.Nullable;

/**
 * 가맹점명을 보고 카테고리를 추론한다 (§55.8, §55.10).
 * 1순위: 사용자가 이전에 지정한 merchant_rules
 * 2순위: merchant_category_keywords 키워드 매칭
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
}
