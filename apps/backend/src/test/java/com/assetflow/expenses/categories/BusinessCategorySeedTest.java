package com.assetflow.expenses.categories;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * §67: 사업자번호 카테고리 시드의 정합성.
 *
 * <p>시드는 AI 가 작성했고 코드가 검증한다 — 카테고리/세부가
 * {@link CategoryTaxonomy} 밖으로 나가거나, 같은 키가 두 번 나오면 부팅이 실패한다.
 * 이 테스트는 그 계약을 문서화한다.</p>
 */
class BusinessCategorySeedTest {

    /** 여러 가맹점이 공유하는 PG(결제대행) 사업자번호 — 전체 매핑을 두면 안 된다. */
    private static final Set<String> PG_BUSINESS_NUMBERS = Set.of(
            "2178114493", "4118601799", "1138521083", "2208155597",
            "2208115770", "8158100527", "1168119948", "2208182546",
            "2148631917", "1208160844", "1048136565", "2138140742",
            "1018163383", "2208101733");

    @Test
    void 모든_시드는_표준_카테고리와_세부를_쓴다() {
        assertThat(BusinessCategorySeed.entries()).isNotEmpty();
        for (BusinessCategorySeed.Entry entry : BusinessCategorySeed.entries()) {
            assertThat(entry.businessNo())
                    .as("사업자번호 %s", entry.businessNo())
                    .hasSize(10)
                    .containsOnlyDigits();
            assertThat(CategoryTaxonomy.groupOfSub(entry.subCategory()))
                    .as("%s 의 세부 %s", entry.category(), entry.subCategory())
                    .isEqualTo(entry.category());
        }
    }

    @Test
    void 사업자번호와_패턴_조합은_유일하다() {
        Map<String, Integer> counts = new HashMap<>();
        for (BusinessCategorySeed.Entry entry : BusinessCategorySeed.entries()) {
            counts.merge(entry.businessNo() + "|" + entry.pattern(), 1, Integer::sum);
        }
        assertThat(counts).allSatisfy((key, count) ->
                assertThat(count).as("중복 키 %s", key).isEqualTo(1));
    }

    @Test
    void 패턴은_공백없는_소문자로_정규화된다() {
        for (BusinessCategorySeed.Entry entry : BusinessCategorySeed.entries()) {
            assertThat(entry.pattern()).isEqualTo(BusinessCategorySeed.normalize(entry.pattern()));
        }
    }

    @Test
    void PG_사업자번호에는_전체매핑을_두지_않는다() {
        // PG 번호에 generic 매핑을 두면 넷플릭스 결제가 '식비' 로 분류되는 식의 오분류가 생긴다.
        Map<String, List<BusinessCategorySeed.Entry>> byNumber = new HashMap<>();
        for (BusinessCategorySeed.Entry entry : BusinessCategorySeed.entries()) {
            byNumber.computeIfAbsent(entry.businessNo(), k -> new java.util.ArrayList<>()).add(entry);
        }
        for (String pg : PG_BUSINESS_NUMBERS) {
            List<BusinessCategorySeed.Entry> entries = byNumber.getOrDefault(pg, List.of());
            assertThat(entries)
                    .as("PG 사업자번호 %s", pg)
                    .allMatch(entry -> !entry.generic());
        }
    }

    @Test
    void 대표_가맹점이_시드에_들어_있다() {
        Set<String> keys = BusinessCategorySeed.entries().stream()
                .map(entry -> entry.businessNo() + "|" + entry.pattern())
                .collect(java.util.stream.Collectors.toSet());

        assertThat(keys).contains(
                "1298200103|",        // 한국도로공사 → 통행료
                "1359128490|",        // 다솜이비인후과 → 병원비
                "2138152063|",        // 다이소
                "2028145602|",        // 아파트관리비
                "1138521083|넷플릭스", // KCP 공유 번호 → 가맹점 패턴
                "1138521083|우아한형제들",
                "1168119948|삼천리도시가스");
    }
}
