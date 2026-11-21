package com.assetflow.investments.toss;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

/**
 * 토스증권 자격증명 원장의 PostgreSQL 구현. postgres 프로필에서 활성화.
 *
 * <p>계좌별 1행(account_id UNIQUE)이며 account_id 가 NULL 인 행도 허용한다.
 * NULL 행은 UNIQUE 제약에 걸리지 않으므로, 계좌 미지정 저장은 UPDATE 후 없으면
 * INSERT 로 처리해 사용자당 1행을 유지한다. 암호문만 다루고 평문은 저장하지 않는다.</p>
 */
@Component
@Profile("postgres")
public class PostgresTossCredentialsLedger implements TossCredentialsLedger {

    private final JdbcTemplate jdbc;

    public PostgresTossCredentialsLedger(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<TossCredentials> findByUserId(long userId) {
        List<TossCredentials> rows = jdbc.query("""
                SELECT account_id, client_id_enc, client_secret_enc, toss_account_seq
                FROM toss_credentials
                WHERE user_id = ?
                ORDER BY account_id NULLS LAST, id
                LIMIT 1
                """, PostgresTossCredentialsLedger::map, userId);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    @Override
    public TossCredentials save(long userId, TossCredentials credentials) {
        if (credentials.accountId() == null) {
            int updated = jdbc.update("""
                    UPDATE toss_credentials
                       SET client_id_enc = ?, client_secret_enc = ?, toss_account_seq = ?,
                           updated_at = now()
                     WHERE user_id = ? AND account_id IS NULL
                    """,
                    credentials.clientId(), credentials.clientSecret(),
                    credentials.tossAccountSeq(), userId);
            if (updated == 0) {
                jdbc.update("""
                        INSERT INTO toss_credentials
                            (user_id, account_id, client_id_enc, client_secret_enc, toss_account_seq, updated_at)
                        VALUES (?, NULL, ?, ?, ?, now())
                        """,
                        userId, credentials.clientId(), credentials.clientSecret(),
                        credentials.tossAccountSeq());
            }
            return credentials;
        }
        jdbc.update("""
                INSERT INTO toss_credentials
                    (user_id, account_id, client_id_enc, client_secret_enc, toss_account_seq, updated_at)
                VALUES (?, ?, ?, ?, ?, now())
                ON CONFLICT (account_id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    client_id_enc = EXCLUDED.client_id_enc,
                    client_secret_enc = EXCLUDED.client_secret_enc,
                    toss_account_seq = EXCLUDED.toss_account_seq,
                    updated_at = now()
                """,
                userId, credentials.accountId(), credentials.clientId(),
                credentials.clientSecret(), credentials.tossAccountSeq());
        return credentials;
    }

    @Override
    public void delete(long userId) {
        jdbc.update("DELETE FROM toss_credentials WHERE user_id = ?", userId);
    }

    private static TossCredentials map(ResultSet rs, int rowNum) throws SQLException {
        return new TossCredentials(
                rs.getObject("account_id", Long.class),
                rs.getString("client_id_enc"),
                rs.getString("client_secret_enc"),
                rs.getString("toss_account_seq"));
    }
}
