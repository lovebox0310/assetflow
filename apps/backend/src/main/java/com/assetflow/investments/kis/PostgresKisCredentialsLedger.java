package com.assetflow.investments.kis;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

/**
 * KIS 자격증명 원장의 PostgreSQL 구현. postgres 프로필에서 활성화.
 */
@Component
@Profile("postgres")
public class PostgresKisCredentialsLedger implements KisCredentialsLedger {

    private final JdbcTemplate jdbc;

    public PostgresKisCredentialsLedger(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<KisCredentials> findByAccountId(long accountId) {
        List<KisCredentials> rows = jdbc.query("""
                SELECT account_id, app_key_enc, app_secret_enc, base_url, cano, acnt_prdt_cd
                FROM kis_account_credentials
                WHERE account_id = ?
                """, PostgresKisCredentialsLedger::map, accountId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public List<KisCredentials> findByUserId(long userId) {
        return jdbc.query("""
                SELECT account_id, app_key_enc, app_secret_enc, base_url, cano, acnt_prdt_cd
                FROM kis_account_credentials
                WHERE user_id = ?
                ORDER BY account_id
                """, PostgresKisCredentialsLedger::map, userId);
    }

    @Override
    public KisCredentials save(long userId, KisCredentials credentials) {
        jdbc.update("""
                INSERT INTO kis_account_credentials
                    (user_id, account_id, app_key_enc, app_secret_enc, base_url, cano, acnt_prdt_cd, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, now())
                ON CONFLICT (account_id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    app_key_enc = EXCLUDED.app_key_enc,
                    app_secret_enc = EXCLUDED.app_secret_enc,
                    base_url = EXCLUDED.base_url,
                    cano = EXCLUDED.cano,
                    acnt_prdt_cd = EXCLUDED.acnt_prdt_cd,
                    updated_at = now()
                """,
                userId, credentials.accountId(), credentials.appKey(), credentials.appSecret(),
                credentials.baseUrl(), credentials.cano(), credentials.acntPrdtCd());
        return credentials;
    }

    @Override
    public void delete(long userId, long accountId) {
        jdbc.update("DELETE FROM kis_account_credentials WHERE user_id = ? AND account_id = ?",
                userId, accountId);
    }

    private static KisCredentials map(ResultSet rs, int rowNum) throws SQLException {
        return new KisCredentials(
                rs.getLong("account_id"),
                rs.getString("app_key_enc"),
                rs.getString("app_secret_enc"),
                rs.getString("base_url"),
                rs.getString("cano"),
                rs.getString("acnt_prdt_cd"));
    }
}
