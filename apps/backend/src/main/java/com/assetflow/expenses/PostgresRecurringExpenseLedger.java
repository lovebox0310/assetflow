package com.assetflow.expenses;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.util.List;

/**
 * 정기 지출 정의 원장의 PostgreSQL 구현 (§45 recurring_expenses). postgres 프로필에서만 활성화.
 */
@Component
@Profile("postgres")
public class PostgresRecurringExpenseLedger implements RecurringExpenseLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresRecurringExpenseLedger(JdbcTemplate jdbc,
                                          @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private static RecurringExpenseLedger.Recurring map(ResultSet rs, int n) throws java.sql.SQLException {
        return new RecurringExpenseLedger.Recurring(
                rs.getLong("id"),
                rs.getString("label"),
                rs.getLong("amount"),
                rs.getBoolean("is_essential"),
                rs.getLong("purchase_vat"),
                rs.getString("start_month"),
                rs.getString("end_month"));
    }

    public List<RecurringExpenseLedger.Recurring> all() {
        return jdbc.query("""
                SELECT id, label, amount, is_essential, purchase_vat, start_month, end_month
                FROM recurring_expenses WHERE user_id = ? ORDER BY id
                """, PostgresRecurringExpenseLedger::map, userId);
    }

    public List<RecurringExpenseLedger.Recurring> activeIn(String month) {
        return jdbc.query("""
                SELECT id, label, amount, is_essential, purchase_vat, start_month, end_month
                FROM recurring_expenses
                WHERE user_id = ? AND start_month <= ? AND (end_month IS NULL OR end_month >= ?)
                ORDER BY id
                """, PostgresRecurringExpenseLedger::map, userId, month, month);
    }

    public RecurringExpenseLedger.Recurring create(String label, long amount, boolean isEssential, long purchaseVat, String startMonth, String endMonth) {
        Long id = jdbc.queryForObject("""
                INSERT INTO recurring_expenses (user_id, label, amount, is_essential, purchase_vat, start_month, end_month)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, userId, label, amount, isEssential, purchaseVat, startMonth, endMonth);
        return new RecurringExpenseLedger.Recurring(id, label, amount, isEssential, purchaseVat, startMonth, endMonth);
    }

    public RecurringExpenseLedger.Recurring update(long id, String label, long amount, boolean isEssential, long purchaseVat, String startMonth, String endMonth) {
        int updated = jdbc.update("""
                UPDATE recurring_expenses
                SET label = ?, amount = ?, is_essential = ?, purchase_vat = ?,
                    start_month = ?, end_month = ?, updated_at = now()
                WHERE id = ? AND user_id = ?
                """, label, amount, isEssential, purchaseVat, startMonth, endMonth, id, userId);
        if (updated == 0) {
            throw new com.assetflow.common.api.NotFoundException("recurring id " + id);
        }
        return new RecurringExpenseLedger.Recurring(id, label, amount, isEssential, purchaseVat, startMonth, endMonth);
    }

    public void delete(long id) {
        // 시점값 원칙(§37.3): 이미 물리행이 된 과거·현재 월은 유지 — recurring_id 만 해제한다.
        jdbc.update("UPDATE monthly_expense_items SET recurring_id = NULL WHERE recurring_id = ? AND user_id = ?", id, userId);
        int deleted = jdbc.update("DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?", id, userId);
        if (deleted == 0) {
            throw new com.assetflow.common.api.NotFoundException("recurring id " + id);
        }
    }
}
