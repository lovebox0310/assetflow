package com.assetflow.expenses.categories;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * §55.8.9 — 카드 명세서 업종을 대분류 3순위 fallback 으로 옮기는 규칙.
 * 업종은 카드사가 붙인 업태라 오분류 위험이 있으므로, 명확한 값만 매핑하고
 * PG·온라인거래처럼 구매처를 알 수 없는 값은 반드시 비워 둔다.
 */
class BusinessCategoryHintsTest {

    @Test
    void mapsUnambiguousBusinessCategories() {
        assertHint("한식", "식비", "외식");
        assertHint("주유소", "교통/차량", "차량유지비");
        assertHint("약국", "건강/의료", "약국");
        assertHint("미용실", "쇼핑/생활", "미용/뷰티");
        assertHint("아파트관리", "주거/통신", "주거비");
    }

    @Test
    void longerKeywordWinsSoCarInsuranceIsNotGenericInsurance() {
        // "자동차보험" 은 "보험" 보다 길어 먼저 매칭된다 — 금융/세금이 아니라 차량유지비.
        assertHint("자동차보험", "교통/차량", "차량유지비");
        assertHint("생명보험", "금융/세금", "보험료");
    }

    @Test
    void paymentGatewayAndOnlineCategoriesStayUnclassified() {
        assertNull(BusinessCategoryHints.classify("PG_일반인증"));
        assertNull(BusinessCategoryHints.classify("온라인거래일반인증외"));
        assertNull(BusinessCategoryHints.classify("인터넷쇼핑몰일반인증외"));
        assertNull(BusinessCategoryHints.classify("통신판매"));
        // 통신판매를 통신비로 오분류하지 않는다.
        assertNull(BusinessCategoryHints.classify("통신판매업"));
    }

    @Test
    void petCareAndBlankValuesAreNotMappedToHumanMedical() {
        assertNull(BusinessCategoryHints.classify("동물병원"));
        assertNull(BusinessCategoryHints.classify(""));
        assertNull(BusinessCategoryHints.classify("   "));
        assertNull(BusinessCategoryHints.classify(null));
        assertNull(BusinessCategoryHints.classify("기타"));
    }

    private void assertHint(String businessCategory, String category, String subCategory) {
        CategoryClassifier.Classification result = BusinessCategoryHints.classify(businessCategory);
        assertEquals(category, result.category(), businessCategory);
        assertEquals(subCategory, result.subCategory(), businessCategory);
    }
}
