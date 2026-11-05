package com.assetflow.expenses.categories;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * §66: 세부 분류 → 대분류 역추적과 파서 기본값 처리.
 */
class CategoryTaxonomyTest {

    @Test
    void 세부분류로_대분류를_되짚는다() {
        assertThat(CategoryTaxonomy.groupOfSub("통신비")).isEqualTo("주거/통신");
        assertThat(CategoryTaxonomy.groupOfSub("대중교통")).isEqualTo("교통/차량");
        assertThat(CategoryTaxonomy.groupOfSub("가전/가구")).isEqualTo("쇼핑/생활");
        assertThat(CategoryTaxonomy.groupOfSub("카페/간식")).isEqualTo("식비");
        assertThat(CategoryTaxonomy.groupOfSub("저축/투자")).isEqualTo("금융/세금");
        assertThat(CategoryTaxonomy.groupOfSub("학교/등록금")).isEqualTo("교육");
    }

    @Test
    void 모든_세부분류는_단일_대분류에_속한다() {
        // 역추적이 유일해야 한다 — 같은 세부가 두 대분류에 있으면 되살릴 수 없다.
        for (CategoryTaxonomy.Group group : CategoryTaxonomy.GROUPS) {
            for (String sub : group.subs()) {
                assertThat(CategoryTaxonomy.groupOfSub(sub))
                        .as("%s 의 대분류", sub)
                        .isEqualTo(group.name());
            }
        }
    }

    @Test
    void 알수없는_세부분류는_null() {
        assertThat(CategoryTaxonomy.groupOfSub("없는세부")).isNull();
        assertThat(CategoryTaxonomy.groupOfSub("")).isNull();
        assertThat(CategoryTaxonomy.groupOfSub("   ")).isNull();
        assertThat(CategoryTaxonomy.groupOfSub(null)).isNull();
    }

    @Test
    void 파서_기본값과_빈값은_미설정으로_본다() {
        assertThat(CategoryTaxonomy.isUnset(null)).isTrue();
        assertThat(CategoryTaxonomy.isUnset("")).isTrue();
        assertThat(CategoryTaxonomy.isUnset("   ")).isTrue();
        assertThat(CategoryTaxonomy.isUnset("unclassified")).isTrue();
        assertThat(CategoryTaxonomy.isUnset("UNCLASSIFIED")).isTrue();
        assertThat(CategoryTaxonomy.isUnset(" unclassified ")).isTrue();
        assertThat(CategoryTaxonomy.isUnset("식비")).isFalse();
    }
}
