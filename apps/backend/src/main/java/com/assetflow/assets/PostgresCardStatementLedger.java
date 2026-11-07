package com.assetflow.assets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Date;
import java.util.List;

/** PostgreSQL 명세서 요약 원장 (§72). postgres 프로필에서만 활성화. */
@Component
@Profile("postgres")
public class PostgresCardStatementLedger implements CardStatementLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresCardStatementLedger(JdbcTemplate jdbc,
                                       @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private static StatementRow map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new StatementRow(
                rs.getLong("id"),
                rs.getString("card_company"),
                rs.getString("kind"),
                rs.getString("usage_month"),
                rs.getDate("period_start").toLocalDate().toString(),
                rs.getDate("period_end").toLocalDate().toString(),
                rs.getLong("total_amount"));
    }

    @Override
    public List<StatementRow> inRange(String fromMonth, String toMonth) {
        return jdbc.query("""
                SELECT id, card_company, kind, usage_month, period_start, period_end, total_amount
                FROM card_statements
                WHERE user_id = ? AND usage_month BETWEEN ? AND ?
                ORDER BY usage_month, card_company
                """, PostgresCardStatementLedger::map, userId, fromMonth, toMonth);
    }

    @Override
    public void upsert(StatementRow row) {
        jdbc.update("""
                INSERT INTO card_statements
                    (user_id, card_company, kind, usage_month, period_start, period_end, total_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, card_company, period_start, period_end) DO UPDATE SET
                    kind = EXCLUDED.kind,
                    usage_month = EXCLUDED.usage_month,
                    total_amount = EXCLUDED.total_amount,
                    updated_at = now()
                """, userId, row.cardCompany(), row.kind(), row.usageMonth(),
                Date.valueOf(row.periodStart()), Date.valueOf(row.periodEnd()), row.totalAmount());
    }
}
