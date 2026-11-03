package com.assetflow.assets.bank;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/**
 * 은행 연결 원장의 PostgreSQL 구현 (§61 bank_account_links). postgres 프로필에서만 활성화.
 * 단일 사용자 MVP — user_id 는 app.owner-email 행에 고정한다(§37과 동일 규칙).
 */
@Component
@Profile("postgres")
public class PostgresBankAccountLinkLedger implements BankAccountLinkLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresBankAccountLinkLedger(JdbcTemplate jdbc,
                                         @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    @Override
    public List<Link> all() {
        return jdbc.query("""
                SELECT account_id, bank_code, account_number_enc, account_type,
                       last_synced_at, last_balance
                FROM bank_account_links WHERE user_id = ? ORDER BY account_id
                """, PostgresBankAccountLinkLedger::map, userId);
    }

    @Override
    public Link byAccountId(long accountId) {
        List<Link> rows = jdbc.query("""
                SELECT account_id, bank_code, account_number_enc, account_type,
                       last_synced_at, last_balance
                FROM bank_account_links WHERE account_id = ? AND user_id = ?
                """, PostgresBankAccountLinkLedger::map, accountId, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    @Override
    public Link save(Link link) {
        jdbc.update("""
                INSERT INTO bank_account_links (user_id, account_id, bank_code,
                                                account_number_enc, account_type,
                                                last_synced_at, last_balance)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (account_id) DO UPDATE
                SET bank_code = EXCLUDED.bank_code,
                    account_number_enc = EXCLUDED.account_number_enc,
                    account_type = EXCLUDED.account_type,
                    last_synced_at = EXCLUDED.last_synced_at,
                    last_balance = EXCLUDED.last_balance,
                    updated_at = now()
                """, userId, link.accountId(), link.bankCode(), link.accountNumberEncrypted(),
                link.accountType(), timestamp(link.lastSyncedAt()), link.lastBalance());
        return link;
    }

    @Override
    public void deleteByAccountId(long accountId) {
        jdbc.update("DELETE FROM bank_account_links WHERE account_id = ? AND user_id = ?",
                accountId, userId);
    }

    private static Timestamp timestamp(String isoInstant) {
        return isoInstant == null ? null : Timestamp.from(Instant.parse(isoInstant));
    }

    private static Link map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Timestamp syncedAt = rs.getTimestamp("last_synced_at");
        long balance = rs.getLong("last_balance");
        // wasNull() 은 마지막으로 읽은 컬럼을 가리킨다 — 다른 컬럼을 읽기 전에 확정한다.
        Long lastBalance = rs.wasNull() ? null : balance;
        return new Link(
                rs.getLong("account_id"),
                rs.getString("bank_code"),
                rs.getString("account_number_enc"),
                rs.getString("account_type"),
                syncedAt == null ? null : syncedAt.toInstant().toString(),
                lastBalance);
    }
}
