package com.assetflow.expenses.categories;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class InMemoryCategoryClassifierTest {

    @Test
    void merchantRuleTakesPrecedenceOverKeyword() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("스타벅스", "식비", "카페/간식", 0);
        classifier.addRule("스타벅스 강남역점", "문화/여가", "취미/여가");

        CategoryClassifier.Classification result = classifier.classify("스타벅스 강남역점");
        assertEquals("문화/여가", result.category());
        assertEquals("취미/여가", result.subCategory());
    }

    @Test
    void keywordMatchesNormalizedMerchantName() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("병원", "건강/의료", "병원비", 0);

        assertEquals("건강/의료", classifier.classify("서울성모병원").category());
        assertEquals("건강/의료", classifier.classify("서울 성모 병원").category());
    }

    @Test
    void returnsNullWhenNothingMatches() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        assertNull(classifier.classify("알 수 없는 가맹점"));
    }

    @Test
    void longerKeywordWins() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("주유", "교통/차량", "차량유지비", 0);
        classifier.addKeyword("주유소", "교통/차량", "차량유지비", 0);

        assertEquals("교통/차량", classifier.classify("SK주유소").category());
    }

    @Test
    void higherPriorityKeywordWinsOverLongerKeyword() {
        // "메가커피 ... 서울병원점" 은 병원이 아니라 커피집 — 업종 키워드가 우선한다
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("병원", "건강/의료", "병원비", 0);
        classifier.addKeyword("커피", "식비", "카페/간식", 10);

        CategoryClassifier.Classification result = classifier.classify("메가엠지씨커피용인서울병원점");
        assertEquals("식비", result.category());
        assertEquals("카페/간식", result.subCategory());
    }
}
