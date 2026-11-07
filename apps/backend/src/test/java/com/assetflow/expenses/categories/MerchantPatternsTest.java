package com.assetflow.expenses.categories;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** §73 PG 공유 사업자번호용 가맹점 패턴 추출. */
class MerchantPatternsTest {

    @Test
    void stripsPgPrefixAndCorporateMarker() {
        assertEquals("우아한형제들", MerchantPatterns.derive("KCP - (주)우아한형제들"));
        assertEquals("널리소프트", MerchantPatterns.derive("토스페이먼츠 - (주)널리소프트"));
        assertEquals("우아한형제들", MerchantPatterns.derive("나이스 - 우아한형제들(주)"));
        assertEquals("씨제이푸드빌", MerchantPatterns.derive("한국신용카드결제(주) - 씨제이푸드빌㈜"));
    }

    @Test
    void keepsMerchantNameWhenThereIsNoPgPrefix() {
        assertEquals("쿠팡", MerchantPatterns.derive("쿠팡"));
        assertEquals("gsshop", MerchantPatterns.derive("GS SHOP"));
    }

    @Test
    void patternIsContainedInTheNormalizedMerchantName() {
        String merchant = "KCP - (주)우아한형제들";
        String pattern = MerchantPatterns.derive(merchant);
        assertTrue(BusinessCategorySeed.normalize(merchant).contains(pattern));
    }
}
