package com.assetflow.investments.sync;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * PostgreSQL 동기화 상태 원장 (이슈 #58). postgres 프로필에서만 활성화.
 *
 * <p>{@code UNIQUE (user_id, provider, account_id)} 는 NULL 을 서로 다르게 보므로,
 * 계정 단위(account_id NULL) 연동은 UPDATE → 없으면 INSERT 로 한 행만 유지한다.</p>
 */
@Component
@Profile("postgres")
public class PostgresProviderSyncStatusLedger implements ProviderSyncStatusLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresProviderSyncStatusLedger(JdbcTemplate jdbc,
                                            @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private static SyncStatus map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Timestamp synced = rs.getTimestamp("last_synced_at");
        Timestamp updated = rs.getTimestamp("updated_at");
        long accountId = rs.getLong("account_id");
        return new SyncStatus(
                rs.getString("provider"),
                rs.wasNull() ? null : accountId,
                synced == null ? null : synced.toInstant(),
                rs.getString("last_status"),
                rs.getString("last_error"),
                updated == null ? null : updated.toInstant());
    }

    @Override
    public List<SyncStatus> all(long ignored) {
        return jdbc.query("""
                SELECT provider, account_id, last_synced_at, last_status, last_error, updated_at
                FROM provider_sync_status
                WHERE user_id = ?
                """, PostgresProviderSyncStatusLedger::map, userId);
    }

    @Override
    public void recordOk(long ignored, String provider, Long accountId) {
        Instant now = Instant.now();
        int updated = jdbc.update("""
                UPDATE provider_sync_status
                   SET last_synced_at = ?, last_status = 'ok', last_error = NULL, updated_at = ?
                 WHERE user_id = ? AND provider = ? AND account_id IS NOT DISTINCT FROM ?
                """, Timestamp.from(now), Timestamp.from(now), userId, provider, accountId);
        if (updated == 0) {
            jdbc.update("""
                    INSERT INTO provider_sync_status
                        (user_id, provider, account_id, last_synced_at, last_status, last_error, updated_at)
                    VALUES (?, ?, ?, ?, 'ok', NULL, ?)
                    """, userId, provider, accountId, Timestamp.from(now), Timestamp.from(now));
        }
    }

    @Override
    public void recordError(long ignored, String provider, Long accountId, String message) {
        Instant now = Instant.now();
        String trimmed = message == null ? null
                : message.length() > 500 ? message.substring(0, 500) : message;
        // 실패는 마지막 성공 시각을 유지한다(재시도 간격 판단에 쓴다).
        int updated = jdbc.update("""
                UPDATE provider_sync_status
                   SET last_status = 'error', last_error = ?, updated_at = ?
                 WHERE user_id = ? AND provider = ? AND account_id IS NOT DISTINCT FROM ?
                """, trimmed, Timestamp.from(now), userId, provider, accountId);
        if (updated == 0) {
            jdbc.update("""
                    INSERT INTO provider_sync_status
                        (user_id, provider, account_id, last_status, last_error, updated_at)
                    VALUES (?, ?, ?, 'error', ?, ?)
                    """, userId, provider, accountId, trimmed, Timestamp.from(now));
        }
    }
}
