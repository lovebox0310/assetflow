package com.assetflow.expenses.categories;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 사업자번호 기반 카테고리 시드 (§67).
 *
 * <p>카드 명세서의 사업자번호는 가맹점을 가장 안정적으로 식별하는 키다. 다만 PG(결제대행)
 * 사업자번호는 여러 가맹점이 공유하므로(예: KCP {@code 1138521083} = 넷플릭스·쿠팡·배달의민족),
 * 사업자번호만 보고 분류하면 엉뚱한 카테고리가 붙는다. 그래서 두 단계로 나눈다.</p>
 * <ul>
 *   <li>업종이 하나뿐인 사업자번호 → {@code businessNo} 만으로 매칭(generic)</li>
 *   <li>PG·복합 사업자번호 → {@code businessNo} + {@code merchantPattern}(가맹점명 부분 문자열)</li>
 * </ul>
 *
 * <p>시드는 AI 가 카드 내역의 가맹점 목록을 보고 작성했다. 카테고리 이름과 세부는
 * {@link CategoryTaxonomy} 안에서만 고른다 — 로드할 때 검증하고, 어긋나면 즉시 실패한다.</p>
 */
public final class BusinessCategorySeed {

    /** 매칭 단위. pattern 이 비어 있으면 사업자번호 전체에 적용한다. */
    public record Entry(String businessNo, String pattern, String category, String subCategory) {
        public boolean generic() {
            return pattern.isEmpty();
        }
    }

    private static final String RESOURCE = "/categories/merchant-business-categories.json";
    private static final List<Entry> ENTRIES = load();

    private BusinessCategorySeed() {
    }

    public static List<Entry> entries() {
        return ENTRIES;
    }

    private static List<Entry> load() {
        try (InputStream in = BusinessCategorySeed.class.getResourceAsStream(RESOURCE)) {
            if (in == null) {
                throw new IllegalStateException("사업자번호 카테고리 시드가 없습니다: " + RESOURCE);
            }
            JsonNode root = new ObjectMapper().readTree(in);
            JsonNode items = root.path("entries");
            if (!items.isArray() || items.isEmpty()) {
                throw new IllegalStateException("사업자번호 카테고리 시드가 비어 있습니다: " + RESOURCE);
            }
            List<Entry> entries = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (JsonNode item : items) {
                Entry entry = parse(item);
                validate(entry);
                String key = entry.businessNo() + "|" + entry.pattern();
                if (!seen.add(key)) {
                    throw new IllegalStateException("사업자번호 시드 중복: " + key);
                }
                entries.add(entry);
            }
            return List.copyOf(entries);
        } catch (IOException e) {
            throw new IllegalStateException("사업자번호 카테고리 시드를 읽지 못했습니다: " + RESOURCE, e);
        }
    }

    private static Entry parse(JsonNode item) {
        String businessNo = digits(item.path("businessNo").asText(""));
        // 패턴은 가맹점명 부분 문자열이라 공백·대소문자를 무시하고 비교한다 — 미리 정규화해 둔다.
        String pattern = normalize(item.path("pattern").asText(""));
        return new Entry(
                businessNo,
                pattern,
                item.path("category").asText(""),
                item.path("subCategory").asText(""));
    }

    private static void validate(Entry entry) {
        if (entry.businessNo().length() != 10) {
            throw new IllegalStateException("사업자번호는 10자리여야 합니다: " + entry);
        }
        String group = CategoryTaxonomy.groupOfSub(entry.subCategory());
        if (group == null) {
            throw new IllegalStateException("알 수 없는 세부 분류: " + entry);
        }
        if (!group.equals(entry.category())) {
            throw new IllegalStateException(
                    "세부 분류가 대분류와 맞지 않습니다: " + entry.subCategory()
                            + " → " + group + " (시드: " + entry.category() + ")");
        }
    }

    private static String digits(String value) {
        return value == null ? "" : value.replaceAll("\\D", "");
    }

    /** 가맹점명·패턴 비교용 정규화 — 공백 제거 + 소문자. */
    static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }
}
