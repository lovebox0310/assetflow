package com.assetflow.expenses.categories;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 지출 카테고리 기준 (§55.10).
 *
 * <p>대분류 9개 + 세부 분류. DB 에는 문자열로 저장한다 — `card_imports.expense_kind`(대분류),
 * `card_imports.sub_category`(세부). 세부가 비어 있어도 된다.
 *
 * <p>이 파일과 `apps/frontend/src/data/expenseCategories.ts` 는 같은 목록을 유지한다.
 * 한쪽만 바꾸면 자동 분류 결과를 화면에서 고를 수 없다.
 */
public final class CategoryTaxonomy {

    public record Group(String name, boolean essential, List<String> subs) {}

    public static final List<Group> GROUPS = List.of(
            new Group("식비", false, List.of("장보기", "외식", "카페/간식", "배달")),
            new Group("주거/통신", true, List.of("주거비", "통신비")),
            new Group("교통/차량", false, List.of("대중교통", "차량유지비")),
            new Group("쇼핑/생활", false, List.of("생활용품", "의류/잡화", "가전/가구", "미용/뷰티")),
            new Group("건강/의료", false, List.of("병원비", "약국", "건강기능식품")),
            new Group("문화/여가", false, List.of("취미/여가", "여행/숙박")),
            new Group("금융/세금", true, List.of("보험료", "세금/공과금", "저축/투자")),
            new Group("기타/경조사", false, List.of("경조사비", "기타")),
            new Group("교육", false, List.of("학원/교육", "학교/등록금"))
    );

    /**
     * 고정비 — 매달 반복되고 금액이 예측되는 세부 분류.
     * "장보기"(문서의 고정 식비)는 반복 구매지만 금액이 변동되므로 변동비로 본다.
     */
    public static final Set<String> FIXED_SUBS = Set.of(
            "주거비", "통신비", "보험료", "세금/공과금", "학원/교육");

    /** 지출이 아니라 자산 이동 — 월 지출 합계에서 제외한다. */
    public static final String ASSET_TRANSFER_SUB = "저축/투자";

    private static final Map<String, List<String>> SUBS_BY_GROUP = buildSubsByGroup();

    private static Map<String, List<String>> buildSubsByGroup() {
        Map<String, List<String>> map = new LinkedHashMap<>();
        for (Group group : GROUPS) {
            map.put(group.name(), group.subs());
        }
        return Map.copyOf(map);
    }

    public static List<String> groupNames() {
        return GROUPS.stream().map(Group::name).toList();
    }

    public static List<String> subsOf(String group) {
        return SUBS_BY_GROUP.getOrDefault(group, List.of());
    }

    public static boolean isFixed(String subCategory) {
        return subCategory != null && FIXED_SUBS.contains(subCategory);
    }

    public static boolean isAssetTransfer(String subCategory) {
        return ASSET_TRANSFER_SUB.equals(subCategory);
    }

    private CategoryTaxonomy() {
    }
}
