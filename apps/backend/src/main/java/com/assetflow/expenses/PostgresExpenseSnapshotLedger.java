package com.assetflow.expenses;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 월 스냅샷 원장의 PostgreSQL 구현 (§37 monthly_snapshots — UNIQUE(user_id, month)).
 * 중복 스냅샷은 INSERT 가 아니라 UPDATE — ON CONFLICT DO UPDATE.
 */
@Component
@Profile("postgres")
public class PostgresExpenseSnapshotLedger implements ExpenseSnapshotLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresExpenseSnapshotLedger(JdbcTemplate jdbc,
                                         @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private static ExpenseSnapshotLedger.Snapshot map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new ExpenseSnapshotLedger.Snapshot(
                rs.getString("snapshot_month"),
                rs.getLong("total_assets"),
                rs.getLong("total_debts"),
                rs.getLong("income"),
                rs.getLong("expenses"),
                rs.getObject("essential_expenses") == null ? 0 : rs.getLong("essential_expenses"),
                rs.getBoolean("essential_complete"));
    }

    public Snapshot get(String month) {
        List<Snapshot> rows = jdbc.query("""
                SELECT snapshot_month, total_assets, total_debts, income, expenses,
                       essential_expenses, essential_complete
                FROM monthly_snapshots WHERE user_id = ? AND snapshot_month = ?
                """, PostgresExpenseSnapshotLedger::map, userId, month);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public List<Snapshot> recent(String asOf, int months) {
        return jdbc.query("""
                SELECT snapshot_month, total_assets, total_debts, income, expenses,
                       essential_expenses, essential_complete
                FROM monthly_snapshots
                WHERE user_id = ? AND snapshot_month <= ?
                ORDER BY snapshot_month DESC
                LIMIT ?
                """, PostgresExpenseSnapshotLedger::map, userId, asOf, months);
    }

    public List<Snapshot> between(String from, String to) {
        return jdbc.query("""
                SELECT snapshot_month, total_assets, total_debts, income, expenses,
                       essential_expenses, essential_complete
                FROM monthly_snapshots
                WHERE user_id = ? AND snapshot_month BETWEEN ? AND ?
                ORDER BY snapshot_month ASC
                """, PostgresExpenseSnapshotLedger::map, userId, from, to);
    }

    public void upsert(Snapshot s) {
        jdbc.update("""
                INSERT INTO monthly_snapshots (user_id, snapshot_month, total_assets, total_debts,
                                              income, expenses, essential_expenses, essential_complete)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, snapshot_month) DO UPDATE SET
                    total_assets = EXCLUDED.total_assets,
                    total_debts = EXCLUDED.total_debts,
                    income = EXCLUDED.income,
                    expenses = EXCLUDED.expenses,
                    essential_expenses = EXCLUDED.essential_expenses,
                    essential_complete = EXCLUDED.essential_complete,
                    updated_at = now()
                """, userId, s.month(), s.totalAssets(), s.totalDebts(),
                s.income(), s.expenses(), s.essentialExpenses(), s.essentialComplete());
    }
}
