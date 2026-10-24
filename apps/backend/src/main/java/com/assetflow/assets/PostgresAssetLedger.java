package com.assetflow.assets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.sql.Date;
import java.util.List;

/**
 * 자산 원장의 PostgreSQL 구현 (§37 asset_accounts). postgres 프로필에서만 활성화.
 * §39: 계약(§40)은 인메모리 구현과 동일 — DB 가 계산이 아니라 행의 영속 저장만 담당한다.
 * 단일 사용자 MVP: user_id 는 data-seed.sql 이 시드하는 user@example.com 행에 고정한다.
 */
@Component
@Profile("postgres")
public class PostgresAssetLedger implements AssetLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresAssetLedger(JdbcTemplate jdbc,
                               @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    /** §36.2 mock 기준선 시드 — 비어 있을 때만 채운다(재시작해도 사용자 데이터를 덮지 않는다). */
    @PostConstruct
    void seedIfEmpty() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM asset_accounts WHERE user_id = ?", Integer.class, userId);
        if (count != null && count == 0) {
            for (AssetRow r : List.of(
                    new AssetRow(0, "cash", "우리 파킹통장", "우리은행", 18_500_000L, false, null),
                    new AssetRow(0, "cash", "씨티 요구불", "씨티은행", 6_200_000L, false, null),
                    new AssetRow(0, "deposit", "우리 예적금", "우리은행", 42_000_000L, false, null),
                    // §54.3: invest 계좌의 balance 는 예수금이다. 총액은 보유종목과 합쳐 계산한다.
                    new AssetRow(0, "invest", "키움 투자금", "키움증권", 1_300_000L, false, null),
                    new AssetRow(0, "invest", "미국주식", "", 100_000L, false, null),
                    new AssetRow(0, "realty", "실거주 아파트", "", 640_000_000L, false, null),
                    new AssetRow(0, "realty", "주택담보대출", "", 69_355_560L, true, null))) {
                jdbc.update("""
                        INSERT INTO asset_accounts (user_id, account_type, name, institution_name,
                                                   balance, is_debt, opened_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, userId, r.accountType(), r.name(), r.institutionName(),
                        r.balance(), r.isDebt(), openedAtOrNull(r.openedAt()));
            }
        }
    }

    private static Date openedAtOrNull(String openedAt) {
        return openedAt == null ? null : Date.valueOf(openedAt);
    }

    private static AssetRow map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new AssetRow(
                rs.getLong("id"),
                rs.getString("account_type"),
                rs.getString("name"),
                rs.getString("institution_name") == null ? "" : rs.getString("institution_name"),
                rs.getLong("balance"),
                rs.getBoolean("is_debt"),
                rs.getString("opened_at"));
    }

    public List<AssetRow> all() {
        return jdbc.query("""
                SELECT id, account_type, name, institution_name, balance, is_debt, opened_at
                FROM asset_accounts WHERE user_id = ? ORDER BY id
                """, PostgresAssetLedger::map, userId);
    }

    public AssetRow byId(long id) {
        List<AssetRow> rows = jdbc.query("""
                SELECT id, account_type, name, institution_name, balance, is_debt, opened_at
                FROM asset_accounts WHERE id = ? AND user_id = ?
                """, PostgresAssetLedger::map, id, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public AssetRow create(String accountType, String name, String institutionName,
                           long balance, boolean isDebt, String openedAt) {
        Long id = jdbc.queryForObject("""
                INSERT INTO asset_accounts (user_id, account_type, name, institution_name,
                                           balance, is_debt, opened_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, userId, accountType, name,
                institutionName == null ? "" : institutionName, balance, isDebt, openedAtOrNull(openedAt));
        return new AssetRow(id, accountType, name,
                institutionName == null ? "" : institutionName, balance, isDebt, openedAt);
    }

    public AssetRow update(long id, String accountType, String name, String institutionName,
                           long balance, boolean isDebt, String openedAt) {
        int updated = jdbc.update("""
                UPDATE asset_accounts
                SET account_type = ?, name = ?, institution_name = ?, balance = ?,
                    is_debt = ?, opened_at = ?, updated_at = now()
                WHERE id = ? AND user_id = ?
                """, accountType, name, institutionName == null ? "" : institutionName,
                balance, isDebt, openedAtOrNull(openedAt), id, userId);
        if (updated == 0) {
            throw new com.assetflow.common.api.NotFoundException("account id " + id);
        }
        return new AssetRow(id, accountType, name,
                institutionName == null ? "" : institutionName, balance, isDebt, openedAt);
    }

    public void delete(long id) {
        int deleted = jdbc.update(
                "DELETE FROM asset_accounts WHERE id = ? AND user_id = ?", id, userId);
        if (deleted == 0) {
            throw new com.assetflow.common.api.NotFoundException("account id " + id);
        }
    }
}
