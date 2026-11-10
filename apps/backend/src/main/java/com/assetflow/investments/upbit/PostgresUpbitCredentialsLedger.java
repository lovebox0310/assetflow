package com.assetflow.investments.upbit;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

/**
 * 업비트 자격증명 원장의 PostgreSQL 구현. postgres 프로필에서 활성화.
 * 암호문만 저장하고 평문은 다루지 않는다.
 */
@Component
@Profile("postgres")
public class PostgresUpbitCredentialsLedger implements UpbitCredentialsLedger {

    private final JdbcTemplate jdbc;

    public PostgresUpbitCredentialsLedger(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<UpbitCredentials> findByUserId(long userId) {
        List<UpbitCredentials> rows = jdbc.query("""
                SELECT access_key_enc, secret_key_enc
                FROM upbit_credentials
                WHERE user_id = ?
                """, PostgresUpbitCredentialsLedger::map, userId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public UpbitCredentials save(long userId, UpbitCredentials credentials) {
        jdbc.update("""
                INSERT INTO upbit_credentials
                    (user_id, access_key_enc, secret_key_enc, updated_at)
                VALUES (?, ?, ?, now())
                ON CONFLICT (user_id) DO UPDATE SET
                    access_key_enc = EXCLUDED.access_key_enc,
                    secret_key_enc = EXCLUDED.secret_key_enc,
                    updated_at = now()
                """, userId, credentials.accessKey(), credentials.secretKey());
        return credentials;
    }

    @Override
    public void delete(long userId) {
        jdbc.update("DELETE FROM upbit_credentials WHERE user_id = ?", userId);
    }

    private static UpbitCredentials map(ResultSet rs, int rowNum) throws SQLException {
        return new UpbitCredentials(rs.getString("access_key_enc"), rs.getString("secret_key_enc"));
    }
}
