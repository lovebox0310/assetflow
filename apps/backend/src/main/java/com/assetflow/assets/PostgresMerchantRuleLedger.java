package com.assetflow.assets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@Component
@Profile("postgres")
public class PostgresMerchantRuleLedger implements MerchantRuleLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresMerchantRuleLedger(JdbcTemplate jdbc,
                                      @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    @Override
    public Map<String, String> allRules() {
        return jdbc.query(
                """
                        SELECT r.merchant_name, COALESCE(c.name, r.expense_kind) AS kind
                        FROM merchant_rules r
                        LEFT JOIN expense_categories c ON c.id = r.category_id
                        WHERE r.user_id = ?
                        """,
                (rs, n) -> Map.entry(rs.getString("merchant_name"), rs.getString("kind")),
                userId)
                .stream()
                .filter(e -> e.getValue() != null)
                .collect(HashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), HashMap::putAll);
    }

    @Override
    public Map<String, String> rulesFor(Set<String> merchantNames) {
        if (merchantNames == null || merchantNames.isEmpty()) {
            return Map.of();
        }
        String placeholders = String.join(",", java.util.Collections.nCopies(merchantNames.size(), "?"));
        Object[] params = new Object[merchantNames.size() + 1];
        params[0] = userId;
        int i = 1;
        for (String name : merchantNames) {
            params[i++] = name;
        }
        return jdbc.query(
                """
                        SELECT r.merchant_name, COALESCE(c.name, r.expense_kind) AS kind
                        FROM merchant_rules r
                        LEFT JOIN expense_categories c ON c.id = r.category_id
                        WHERE r.user_id = ? AND r.merchant_name IN (""" + placeholders + ")",
                (rs, n) -> Map.entry(rs.getString("merchant_name"), rs.getString("kind")),
                params)
                .stream()
                .filter(e -> e.getValue() != null)
                .collect(HashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), HashMap::putAll);
    }

    @Override
    public void saveAll(Map<String, String> rules) {
        if (rules == null || rules.isEmpty()) {
            return;
        }
        for (Map.Entry<String, String> e : rules.entrySet()) {
            jdbc.update("""
                    INSERT INTO merchant_rules (user_id, merchant_name, expense_kind)
                    VALUES (?, ?, ?)
                    ON CONFLICT (user_id, merchant_name) DO UPDATE SET expense_kind = EXCLUDED.expense_kind,
                                                                       updated_at = now()
                    """, userId, e.getKey(), e.getValue());
        }
    }

    @Override
    public void delete(String merchantName) {
        jdbc.update("DELETE FROM merchant_rules WHERE user_id = ? AND merchant_name = ?",
                userId, merchantName);
    }
}
