package com.assetflow.investments.snapshot;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** PostgreSQL 스냅샷 원장 (이슈 #52). postgres 프로필에서만 활성화. */
@Component
@Profile("postgres")
public class PostgresPortfolioSnapshotLedger implements PortfolioSnapshotLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresPortfolioSnapshotLedger(JdbcTemplate jdbc,
                                           @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject("SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    @Override
    public void save(long ignored, Snapshot s) {
        jdbc.update("""
                INSERT INTO portfolio_snapshots
                    (user_id, taken_on, taken_at, total_cost, total_value, cash, source)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, userId, Date.valueOf(s.takenOn()), Timestamp.from(Instant.now()),
                s.totalCost(), s.totalValue(), s.cash(), s.source());
    }

    @Override
    public List<Snapshot> range(long ignored, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT taken_on, total_cost, total_value, cash, source
                FROM portfolio_snapshots
                WHERE user_id = ? AND taken_on BETWEEN ? AND ?
                ORDER BY taken_on, id
                """, (rs, n) -> new Snapshot(
                rs.getDate("taken_on").toLocalDate(),
                rs.getLong("total_cost"),
                rs.getLong("total_value"),
                rs.getLong("cash"),
                rs.getString("source")), userId, Date.valueOf(from), Date.valueOf(to));
    }
}
