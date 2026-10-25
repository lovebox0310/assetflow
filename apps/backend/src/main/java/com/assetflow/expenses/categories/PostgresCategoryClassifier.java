package com.assetflow.expenses.categories;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * PostgreSQL 기반 카테고리 분류기 (§55.8).
 * 가맹점 규칙 → 키워드 매칭 순서로 분류한다.
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
                        SELECT k.keyword, c.name AS category_name, k.priority
                        FROM merchant_category_keywords k
                        JOIN expense_categories c ON c.id = k.category_id
                        ORDER BY k.priority DESC, LENGTH(k.keyword) DESC, k.keyword
                        """,
                (rs, n) -> new KeywordMapping(
                        rs.getString("keyword"),
                        rs.getString("category_name"),
                        rs.getInt("priority")));
    }

    @Override
    public String classify(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        String normalized = merchantName.toLowerCase().replaceAll("\\s+", "");

        // 1순위: 사용자가 지정한 가맹점 규칙
        // category_id 가 있으면 표준 카테고리명, 없으면 legacy expense_kind 문자열을 그대로 사용
        List<String> rules = jdbc.queryForList("""
                SELECT COALESCE(c.name, r.expense_kind) AS kind
                FROM merchant_rules r
                LEFT JOIN expense_categories c ON c.id = r.category_id
                WHERE r.user_id = ? AND r.merchant_name = ?
                """, String.class, userId, merchantName);
        if (!rules.isEmpty() && rules.get(0) != null && !rules.get(0).isBlank()) {
            return rules.get(0);
        }

        // 2순위: 키워드 매칭 (긴 키워드 우선)
        for (KeywordMapping kw : keywords()) {
            if (normalized.contains(kw.keyword().toLowerCase().replaceAll("\\s+", ""))) {
                return kw.categoryName();
            }
        }
        return null;
    }

    private record KeywordMapping(String keyword, String categoryName, int priority) {}
}
