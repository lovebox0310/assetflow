package com.assetflow.settings;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 사용자 설정 원장의 PostgreSQL 구현 (§37 users — target_months, §59 비상금 기준).
 * 비상금 통장은 `user_emergency_accounts` 조인 테이블에 여러 개를 저장한다.
 */
@Component
@Profile("postgres")
public class PostgresUserSettingsLedger implements UserSettingsLedger {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public PostgresUserSettingsLedger(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    private UserSettingsLedger.UserSettings map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new UserSettingsLedger.UserSettings(
                rs.getLong("id"),
                rs.getString("email"),
                rs.getString("display_name"),
                rs.getInt("target_months"),
                List.of(),
                rs.getInt("emergency_avg_months"),
                readCategories(rs.getString("emergency_categories")));
    }

    private List<String> readCategories(String json) {
        if (json == null || json.isBlank()) {
            return InMemoryUserSettingsLedger.DEFAULT_EMERGENCY_CATEGORIES;
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("emergency_categories is not valid JSON", e);
        }
    }

    private List<String> readAccountIds(long userId) {
        return jdbc.query("""
                SELECT account_id FROM user_emergency_accounts
                 WHERE user_id = ? ORDER BY account_id
                """, (rs, n) -> String.valueOf(rs.getLong("account_id")), userId);
    }

    public UserSettingsLedger.UserSettings get(String email) {
        var rows = jdbc.query("""
                SELECT id, email, display_name, target_months,
                       emergency_avg_months, emergency_categories
                FROM users WHERE email = ?
                """, this::map, email);
        if (rows.isEmpty()) {
            return null;
        }
        UserSettingsLedger.UserSettings base = rows.get(0);
        return new UserSettingsLedger.UserSettings(
                base.id(), base.email(), base.displayName(), base.targetMonths(),
                readAccountIds(base.id()), base.emergencyAvgMonths(), base.emergencyCategories());
    }

    /**
     * 설정 전체 갱신. 비상금 통장 목록은 조인 테이블을 통째로 교체한다 —
     * 사용자 한 명의 행만 지우므로 다른 사용자 지정에는 영향이 없다.
     */
    @Transactional
    public UserSettingsLedger.UserSettings update(String email, int targetMonths,
                                                  List<String> emergencyAccountIds,
                                                  int emergencyAvgMonths,
                                                  List<String> emergencyCategories) {
        String categoriesJson;
        try {
            categoriesJson = objectMapper.writeValueAsString(emergencyCategories);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("emergencyCategories cannot be serialized", e);
        }
        int updated = jdbc.update("""
                UPDATE users
                   SET target_months = ?,
                       emergency_avg_months = ?,
                       emergency_categories = ?::jsonb,
                       updated_at = now()
                 WHERE email = ?
                """, targetMonths, emergencyAvgMonths, categoriesJson, email);
        if (updated == 0) {
            throw new com.assetflow.common.api.NotFoundException("user " + email);
        }

        Long userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, email);
        jdbc.update("DELETE FROM user_emergency_accounts WHERE user_id = ?", userId);
        for (String accountId : emergencyAccountIds) {
            jdbc.update("""
                    INSERT INTO user_emergency_accounts (user_id, account_id)
                    VALUES (?, ?)
                    """, userId, Long.valueOf(accountId));
        }
        return get(email);
    }
}
