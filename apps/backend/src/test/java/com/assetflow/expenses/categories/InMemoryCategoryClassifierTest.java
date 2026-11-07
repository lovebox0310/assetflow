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
    void userBusinessRuleOverridesSeedPattern() {
        // §73: 시드 KCP 1138521083 + 넷플릭스 → 문화/여가. 사용자가 바꾸면 사용자 규칙이 이긴다.
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        assertEquals("문화/여가",
                classifier.classifyByBusinessNo("1138521083", "KCP - 넷플릭스서비시스코리아").category());

        classifier.addUserBusinessNoPattern("1138521083", "넷플릭스", "교육", "학원/교육");

        CategoryClassifier.Classification result =
                classifier.classifyByBusinessNo("1138521083", "KCP - 넷플릭스서비시스코리아");
        assertEquals("교육", result.category());
        assertEquals("학원/교육", result.subCategory());
    }

    @Test
    void userGenericBusinessRuleBeatsSeedSpecificPattern() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addUserBusinessNoPattern("1138521083", "", "기타/경조사", "기타");

        assertEquals("기타/경조사",
                classifier.classifyByBusinessNo("1138521083", "KCP - 넷플릭스서비시스코리아").category());
        assertEquals("기타/경조사",
                classifier.classifyByBusinessNo("1138521083", "KCP - 쿠팡").category());
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

    @Test
    void businessNumberTakesPrecedenceOverKeyword() {
        // §67: 사업자번호는 가맹점명 키워드보다 정확하다 — 이름에 병원이 있어도 주유소면 주유소다.
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addKeyword("병원", "건강/의료", "병원비", 0);
        classifier.addBusinessNo("9999999901", "교통/차량", "차량유지비");

        CategoryClassifier.Classification result =
                classifier.classify("서울병원", "", "999-99-99901");
        assertEquals("교통/차량", result.category());
        assertEquals("차량유지비", result.subCategory());
    }

    @Test
    void merchantRuleStillBeatsBusinessNumber() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addBusinessNo("9999999901", "교통/차량", "차량유지비");
        classifier.addRule("서울병원", "건강/의료", "병원비");

        assertEquals("건강/의료", classifier.classify("서울병원", "", "9999999901").category());
    }

    @Test
    void pgBusinessNumberIsDisambiguatedByMerchantPattern() {
        // §67: KCP 같은 PG 사업자번호는 여러 가맹점이 공유한다 — 가맹점명 패턴으로 나눈다.
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addBusinessNoPattern("1138521083", "넷플릭스", "문화/여가", "취미/여가");
        classifier.addBusinessNoPattern("1138521083", "우아한형제들", "식비", "배달");

        assertEquals("문화/여가",
                classifier.classify("KCP - 넷플릭스서비시스코리아 유한회사", "", "1138521083").category());
        assertEquals("식비",
                classifier.classify("KCP - 주식회사 우아한형제들", "", "1138521083").category());
        assertNull(classifier.classify("KCP - 알수없는가맹점", "", "1138521083"));
    }

    @Test
    void longestBusinessPatternWins() {
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();
        classifier.addBusinessNo("1138521083", "쇼핑/생활", "생활용품");
        classifier.addBusinessNoPattern("1138521083", "쿠팡", "식비", "배달");
        classifier.addBusinessNoPattern("1138521083", "쿠팡이츠", "식비", "배달");

        assertEquals("식비", classifier.classify("KCP - 쿠팡이츠", "", "1138521083").category());
        // 패턴이 맞지 않으면 사업자번호 전체 매핑으로 내려간다.
        assertEquals("쇼핑/생활", classifier.classify("KCP - 다른가맹점", "", "1138521083").category());
    }

    @Test
    void bundledSeedClassifiesRealCardMerchants() {
        // 실제 카드 내역에서 뽑은 대표 조합 — 시드 파일이 깨지면 여기서 먼저 실패한다.
        InMemoryCategoryClassifier classifier = new InMemoryCategoryClassifier();

        assertEquals("교통/차량", classifier.classify("한국도로공사 0001건", "", "1298200103").category());
        assertEquals("차량유지비", classifier.classify("한국도로공사 0001건", "", "1298200103").subCategory());
        assertEquals("건강/의료", classifier.classify("다솜이비인후과", "", "1359128490").category());
        assertEquals("식비", classifier.classify("GS25뉴정자백궁점", "", "2353301753").category());
        assertEquals("문화/여가",
                classifier.classify("KCP - 넷플릭스서비시스코리아 유한회사", "", "1138521083").category());
        assertEquals("식비",
                classifier.classify("KCP - 주식회사 우아한형제들", "", "1138521083").category());
        assertEquals("주거/통신",
                classifier.classify("한국정보통신 - 삼천리도시가스자동이체", "", "1168119948").category());
    }
}
