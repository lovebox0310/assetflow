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
        Map<String, String> out = new HashMap<>();
        allRuleDetails().forEach((merchant, rule) -> out.put(merchant, rule.category()));
        return Map.copyOf(out);
    }

    @Override
    public Map<String, String> rulesFor(Set<String> merchantNames) {
        Map<String, String> out = new HashMap<>();
        ruleDetailsFor(merchantNames).forEach((merchant, rule) -> out.put(merchant, rule.category()));
        return Map.copyOf(out);
    }

    @Override
    public Map<String, MerchantRule> allRuleDetails() {
        return jdbc.query(
                """
                        SELECT r.merchant_name, COALESCE(c.name, r.expense_kind) AS kind,
                               COALESCE(r.sub_category, '') AS sub_category
                        FROM merchant_rules r
                        LEFT JOIN expense_categories c ON c.id = r.category_id
                        WHERE r.user_id = ?
                        """,
                (rs, n) -> Map.entry(rs.getString("merchant_name"),
                        new MerchantRule(rs.getString("kind"), rs.getString("sub_category"))),
                userId)
                .stream()
                .filter(e -> e.getValue().category() != null)
                .collect(HashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), HashMap::putAll);
    }

    @Override
    public Map<String, MerchantRule> ruleDetailsFor(Set<String> merchantNames) {
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
                        SELECT r.merchant_name, COALESCE(c.name, r.expense_kind) AS kind,
                               COALESCE(r.sub_category, '') AS sub_category
                        FROM merchant_rules r
                        LEFT JOIN expense_categories c ON c.id = r.category_id
                        WHERE r.user_id = ? AND r.merchant_name IN (""" + placeholders + ")",
                (rs, n) -> Map.entry(rs.getString("merchant_name"),
                        new MerchantRule(rs.getString("kind"), rs.getString("sub_category"))),
                params)
                .stream()
                .filter(e -> e.getValue().category() != null)
                .collect(HashMap::new, (m, e) -> m.put(e.getKey(), e.getValue()), HashMap::putAll);
    }

    @Override
    public void saveAll(Map<String, String> rules) {
        if (rules == null || rules.isEmpty()) {
            return;
        }
        Map<String, MerchantRule> details = new HashMap<>();
        rules.forEach((merchant, category) -> details.put(merchant, new MerchantRule(category, "")));
        saveAllDetails(details);
    }

    @Override
    public void saveAllDetails(Map<String, MerchantRule> rules) {
        if (rules == null || rules.isEmpty()) {
            return;
        }
        for (Map.Entry<String, MerchantRule> e : rules.entrySet()) {
            jdbc.update("""
                    INSERT INTO merchant_rules (user_id, merchant_name, expense_kind, sub_category)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT (user_id, merchant_name) DO UPDATE SET expense_kind = EXCLUDED.expense_kind,
                                                                       sub_category = EXCLUDED.sub_category,
                                                                       updated_at = now()
                    """, userId, e.getKey(), e.getValue().category(), e.getValue().subCategory());
        }
    }

    @Override
    public void delete(String merchantName) {
        jdbc.update("DELETE FROM merchant_rules WHERE user_id = ? AND merchant_name = ?",
                userId, merchantName);
    }
}
