package com.assetflow.expenses.categories;

import jakarta.annotation.Nullable;

/**
 * 가맹점명·사업자번호·카드 명세서 업종을 보고 카테고리를 추론한다
 * (§55.8, §55.10, §55.8.9, §67).
 *
 * <p>우선순위:</p>
 * <ol>
 *   <li>사용자가 지정한 merchant_rules</li>
 *   <li>사업자번호 매핑 merchant_business_categories (§67)</li>
 *   <li>가맹점명 키워드 merchant_category_keywords</li>
 *   <li>카드사가 붙인 업종(businessCategory) — 명확한 값만</li>
 * </ol>
 *
 * <p>사업자번호는 가맹점명보다 안정적인 키라 키워드보다 먼저 본다. 다만 사용자가 직접
 * 고친 규칙이 항상 이긴다. 실패 시 null 을 반환한다 — 호출 측에서 "미분류"로 처리.</p>
 */
public interface CategoryClassifier {

    /** 대분류 + 세부 분류. 세부는 없을 수 있다. */
    record Classification(String category, String subCategory) {
        public boolean unclassified() {
            return category == null || category.isBlank();
        }
    }

    /** 1순위: 사용자가 지정한 가맹점 규칙. */
    @Nullable
    Classification classifyByRule(String merchantName);

    /** 2순위: 사업자번호(+가맹점 패턴) 매핑 (§67). */
    @Nullable
    Classification classifyByBusinessNo(String businessNo, String merchantName);

    /** 3순위: 가맹점명 키워드 매칭. */
    @Nullable
    Classification classifyByKeyword(String merchantName);

    /** 기존 계약: 규칙 → 키워드. 사업자번호를 모르는 호출부가 쓴다. */
    @Nullable
    default Classification classify(String merchantName) {
        Classification rule = classifyByRule(merchantName);
        return rule != null ? rule : classifyByKeyword(merchantName);
    }

    /** 업종 힌트만 있는 기존 계약. */
    default Classification classify(String merchantName, String businessCategory) {
        return classify(merchantName, businessCategory, "");
    }

    /**
     * 업종·사업자번호까지 붙인 전체 분류 (§55.8.9, §67).
     *
     * <p>규칙·사업자번호·키워드가 이미 대분류를 정했으면 그대로 쓴다. 다만 세부 분류가
     * 비어 있고 업종이 같은 대분류를 가리키면 세부만 업종에서 빌려 온다 — 대분류를
     * 업종으로 덮어쓰지 않는다(사용자 규칙·사업자번호가 항상 우선).</p>
     */
    default Classification classify(String merchantName, String businessCategory, String businessNo) {
        Classification primary = classifyByRule(merchantName);
        if (primary == null) {
            primary = classifyByBusinessNo(businessNo, merchantName);
        }
        if (primary == null) {
            primary = classifyByKeyword(merchantName);
        }
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
