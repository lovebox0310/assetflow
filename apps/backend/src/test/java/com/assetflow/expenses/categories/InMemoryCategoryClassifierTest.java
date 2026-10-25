package com.assetflow.expenses.categories;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class InMemoryCategoryClassifierTest {

    @Test
    void merchantRuleTakesPrecedenceOverKeyword() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("스타벅스", "식비", 0);
        classifier.addRule("스타벅스 강남역점", "여가/취미");

        assertEquals("여가/취미", classifier.classify("스타벅스 강남역점"));
    }

    @Test
    void keywordMatchesNormalizedMerchantName() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("병원", "의료비", 0);

        assertEquals("의료비", classifier.classify("서울성모병원"));
        assertEquals("의료비", classifier.classify("서울 성모 병원"));
    }

    @Test
    void returnsNullWhenNothingMatches() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        assertNull(classifier.classify("알 수 없는 가맹점"));
    }

    @Test
    void longerKeywordWins() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("주유", "교통비", 0);
        classifier.addKeyword("주유소", "교통비", 0);

        assertEquals("교통비", classifier.classify("SK주유소"));
    }

    @Test
    void higherPriorityKeywordWinsOverLongerKeyword() {
        // "메가커피 ... 서울병원점" 은 병원이 아니라 커피집 — 업종 키워드가 우선한다
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("병원", "의료비", 0);
        classifier.addKeyword("커피", "식비", 10);

        assertEquals("식비", classifier.classify("메가엠지씨커피용인서울병원점"));
    }
}
