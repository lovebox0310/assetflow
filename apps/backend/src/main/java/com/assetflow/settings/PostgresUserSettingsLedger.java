package com.assetflow.settings;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 사용자 설정 원장의 PostgreSQL 구현 (§37 users — target_months).
 */
@Component
@Profile("postgres")
public class PostgresUserSettingsLedger implements UserSettingsLedger {

    private final JdbcTemplate jdbc;

    public PostgresUserSettingsLedger(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static UserSettingsLedger.UserSettings map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new UserSettingsLedger.UserSettings(
                rs.getLong("id"),
                rs.getString("email"),
                rs.getString("display_name"),
                rs.getInt("target_months"));
    }

    public UserSettingsLedger.UserSettings get(String email) {
        var rows = jdbc.query("""
                SELECT id, email, display_name, target_months
                FROM users WHERE email = ?
                """, PostgresUserSettingsLedger::map, email);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public UserSettingsLedger.UserSettings updateTargetMonths(String email, int targetMonths) {
        int updated = jdbc.update(
                "UPDATE users SET target_months = ? WHERE email = ?", targetMonths, email);
        if (updated == 0) {
            throw new com.assetflow.common.api.NotFoundException("user " + email);
        }
        return get(email);
    }
}
