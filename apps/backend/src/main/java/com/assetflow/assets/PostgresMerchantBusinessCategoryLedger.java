package com.assetflow.assets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/** PostgreSQL 사용자 사업자번호 규칙 원장 (§67, §73). */
@Component
@Profile("postgres")
public class PostgresMerchantBusinessCategoryLedger implements MerchantBusinessCategoryLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresMerchantBusinessCategoryLedger(
            JdbcTemplate jdbc,
            @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private static Mapping map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new Mapping(
                rs.getLong("id"),
                rs.getString("business_no"),
                rs.getString("merchant_pattern") == null ? "" : rs.getString("merchant_pattern"),
                rs.getString("category"),
                rs.getString("sub_category") == null ? "" : rs.getString("sub_category"),
                rs.getString("source"));
    }

    @Override
    public List<Mapping> mappingsFor(String businessNo) {
        if (businessNo == null || businessNo.isBlank()) {
            return List.of();
        }
        return jdbc.query("""
                SELECT b.id, b.business_no, b.merchant_pattern, c.name AS category,
                       b.sub_category, b.source
                FROM merchant_business_categories b
                JOIN expense_categories c ON c.id = b.category_id
                WHERE b.user_id = ? AND b.business_no = ?
                ORDER BY b.merchant_pattern
                """, PostgresMerchantBusinessCategoryLedger::map, userId, businessNo);
    }

    @Override
    public boolean hasPatternMapping(String businessNo) {
        if (businessNo == null || businessNo.isBlank()) {
            return false;
        }
        Boolean exists = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM merchant_business_categories
                    WHERE user_id = ? AND business_no = ? AND merchant_pattern <> ''
                )
                """, Boolean.class, userId, businessNo);
        return Boolean.TRUE.equals(exists);
    }

    @Override
    public void upsertUser(String businessNo, String merchantPattern, String category, String subCategory) {
        List<Long> ids = jdbc.queryForList(
                "SELECT id FROM expense_categories WHERE name = ? AND user_id IS NULL",
                Long.class, category);
        if (ids.isEmpty()) {
            throw new IllegalArgumentException("unknown category: " + category);
        }
        jdbc.update("""
                INSERT INTO merchant_business_categories
                    (user_id, business_no, merchant_pattern, category_id, sub_category, source)
                VALUES (?, ?, ?, ?, ?, 'user')
                ON CONFLICT (user_id, business_no, merchant_pattern) DO UPDATE SET
                    category_id = EXCLUDED.category_id,
                    sub_category = EXCLUDED.sub_category,
                    source = 'user',
                    updated_at = now()
                """, userId, businessNo,
                merchantPattern == null ? "" : merchantPattern,
                ids.get(0), subCategory == null ? "" : subCategory);
    }

    @Override
    public void deleteUserMapping(String businessNo, String merchantPattern) {
        if (businessNo == null || businessNo.isBlank()) {
            return;
        }
        jdbc.update("""
                DELETE FROM merchant_business_categories
                WHERE user_id = ? AND business_no = ? AND merchant_pattern = ? AND source = 'user'
                """, userId, businessNo, merchantPattern == null ? "" : merchantPattern);
    }
}
