package com.assetflow.expenses.categories;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * PostgreSQL 기반 카테고리 분류기 (§55.8, §55.10).
 * 가맹점 규칙 → 키워드 매칭 순서로 대분류와 세부 분류를 정한다.
 */
@Component
@Profile("postgres")
public class PostgresCategoryClassifier implements CategoryClassifier {

    private final JdbcTemplate jdbc;
    private final long userId;
    /**
     * 키워드 시드는 CommandLineRunner(CategorySeedData)가 넣는다 — 이 빈의 생성자보다 늦게 실행되므로
     * 생성 시점에 읽으면 첫 부팅에서 빈 목록이 된다. 그래서 비어 있으면 매번 다시 읽는다.
     */
    private volatile List<KeywordMapping> keywords = List.of();

    public PostgresCategoryClassifier(JdbcTemplate jdbc,
                                      @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private List<KeywordMapping> keywords() {
        List<KeywordMapping> cached = keywords;
        if (cached.isEmpty()) {
            cached = loadKeywords();
            keywords = cached;
        }
        return cached;
    }

    private List<KeywordMapping> loadKeywords() {
        return jdbc.query("""
                        SELECT k.keyword, c.name AS category_name, k.sub_category, k.priority
                        FROM merchant_category_keywords k
                        JOIN expense_categories c ON c.id = k.category_id
                        ORDER BY k.priority DESC, LENGTH(k.keyword) DESC, k.keyword
                        """,
                (rs, n) -> new KeywordMapping(
                        rs.getString("keyword"),
                        rs.getString("category_name"),
                        rs.getString("sub_category"),
                        rs.getInt("priority")));
    }

    @Override
    public Classification classify(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        String normalized = normalize(merchantName);

        // 1순위: 사용자가 지정한 가맹점 규칙
        // category_id 가 있으면 표준 카테고리명, 없으면 legacy expense_kind 문자열을 그대로 사용
        List<RuleMapping> rules = jdbc.query("""
                SELECT COALESCE(c.name, r.expense_kind) AS kind, r.sub_category
                FROM merchant_rules r
                LEFT JOIN expense_categories c ON c.id = r.category_id
                WHERE r.user_id = ? AND r.merchant_name = ?
                """,
                (rs, n) -> new RuleMapping(rs.getString("kind"), rs.getString("sub_category")),
                userId, merchantName);
        if (!rules.isEmpty() && rules.get(0).category() != null && !rules.get(0).category().isBlank()) {
            RuleMapping rule = rules.get(0);
            // 규칙에 세부가 없으면 같은 대분류의 키워드 세부를 빌려 온다.
            String sub = rule.subCategory();
            if (sub == null || sub.isBlank()) {
                sub = keywordSubFor(normalized, rule.category());
            }
            return new Classification(rule.category(), sub);
        }

        // 2순위: 키워드 매칭 (긴 키워드 우선)
        for (KeywordMapping kw : keywords()) {
            if (normalized.contains(normalize(kw.keyword()))) {
                return new Classification(kw.categoryName(), kw.subCategory());
            }
        }
        return null;
    }

    /** 같은 대분류에 속한 첫 키워드의 세부를 돌려준다 — 규칙에 세부가 없을 때만 쓴다. */
    private String keywordSubFor(String normalizedMerchant, String category) {
        for (KeywordMapping kw : keywords()) {
            if (!kw.categoryName().equals(category)) {
                continue;
            }
            if (normalizedMerchant.contains(normalize(kw.keyword()))) {
                return kw.subCategory();
            }
        }
        return "";
    }

    private static String normalize(String value) {
        return value.toLowerCase().replaceAll("\\s+", "");
    }

    private record KeywordMapping(String keyword, String categoryName, String subCategory, int priority) {}

    private record RuleMapping(String category, String subCategory) {}
}
