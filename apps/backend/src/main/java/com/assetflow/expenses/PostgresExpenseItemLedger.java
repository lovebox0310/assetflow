package com.assetflow.expenses;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.util.List;

/**
 * 월 지출 항목 원장의 PostgreSQL 구현 (§43 monthly_expense_items). postgres 프로필에서만 활성화.
 * (user_id, month, label) UNIQUE 로 같은 월 같은 이름 항목 중복을 DB 가 보증한다.
 */
@Component
@Profile("postgres")
public class PostgresExpenseItemLedger implements ExpenseItemLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresExpenseItemLedger(JdbcTemplate jdbc,
                                     @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private static ExpenseItem map(ResultSet rs, int n) throws java.sql.SQLException {
        return new ExpenseItem(
                rs.getLong("id"),
                rs.getString("month"),
                rs.getString("label"),
                rs.getLong("amount"),
                rs.getBoolean("is_essential"),
                rs.getLong("purchase_vat"),
                rs.getObject("recurring_id") == null ? null : rs.getLong("recurring_id"));
    }

    public List<ExpenseItem> all(String month) {
        return jdbc.query("""
                SELECT id, month, label, amount, is_essential, purchase_vat, recurring_id
                FROM monthly_expense_items WHERE user_id = ? AND month = ? ORDER BY id
                """, PostgresExpenseItemLedger::map, userId, month);
    }

    public ExpenseItem create(String month, String label, long amount, boolean isEssential, long purchaseVat) {
        try {
            Long id = jdbc.queryForObject("""
                    INSERT INTO monthly_expense_items (user_id, month, label, amount, is_essential, purchase_vat)
                    VALUES (?, ?, ?, ?, ?, ?)
                    RETURNING id
                    """, Long.class, userId, month, label, amount, isEssential, purchaseVat);
            return new ExpenseItem(id, month, label, amount, isEssential, purchaseVat, null);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException("duplicate label: " + label);
        }
    }

    public void ensureRecurringRows(String month, List<RecurringExpenseLedger.Recurring> defs) {
        for (RecurringExpenseLedger.Recurring def : defs) {
            // §45.2 개정: 같은 recurring_id 가 이미 물리행으로 있으면 중복 삽입하지 않는다.
            // 수동 행이 같은 이름이면 그 행을 우선해 정의 행을 생성하지 않는다.
            jdbc.update("""
                    INSERT INTO monthly_expense_items (user_id, month, label, amount, is_essential, purchase_vat, recurring_id)
                    SELECT ?, ?, ?, ?, ?, ?, ?
                    WHERE NOT EXISTS (
                        SELECT 1 FROM monthly_expense_items
                        WHERE user_id = ? AND month = ?
                          AND (recurring_id = ? OR label = ?)
                    )
                    """, userId, month, def.label(), def.amount(), def.isEssential(), def.purchaseVat(), def.id(),
                    userId, month, def.id(), def.label());
        }
    }

    public void renameRecurringRows(long recurringId, String oldLabel, String newLabel) {
        List<String> conflicts = jdbc.queryForList("""
                SELECT month FROM monthly_expense_items
                WHERE user_id = ? AND label = ? AND recurring_id IS DISTINCT FROM ?
                LIMIT 1
                """, String.class, userId, newLabel, recurringId);
        if (!conflicts.isEmpty()) {
            throw new IllegalArgumentException("label conflict in month " + conflicts.get(0));
        }
        jdbc.update("""
                UPDATE monthly_expense_items
                SET label = ?, updated_at = now()
                WHERE user_id = ? AND recurring_id = ? AND label = ?
                """, newLabel, userId, recurringId, oldLabel);
    }

    public void updateRecurringRows(long recurringId,
                                    long oldAmount, boolean oldEssential, long oldPurchaseVat,
                                    long newAmount, boolean newEssential, long newPurchaseVat) {
        jdbc.update("""
                UPDATE monthly_expense_items
                SET amount = ?, is_essential = ?, purchase_vat = ?, updated_at = now()
                WHERE user_id = ? AND recurring_id = ?
                  AND amount = ? AND is_essential = ? AND purchase_vat = ?
                """, newAmount, newEssential, newPurchaseVat, userId, recurringId,
                oldAmount, oldEssential, oldPurchaseVat);
    }

    public void linkRecurring(long id, Long recurringId) {
        int updated = jdbc.update(
                "UPDATE monthly_expense_items SET recurring_id = ?, updated_at = now() WHERE id = ? AND user_id = ?",
                recurringId, id, userId);
        if (updated == 0) {
            throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
        }
    }

    public int copyMonth(String from, String to) {
        return jdbc.update("""
                INSERT INTO monthly_expense_items (user_id, month, label, amount, is_essential, purchase_vat, recurring_id)
                SELECT user_id, ?, label, amount, is_essential, purchase_vat, recurring_id
                FROM monthly_expense_items src
                WHERE user_id = ? AND month = ?
                  AND NOT EXISTS (
                      SELECT 1 FROM monthly_expense_items dst
                      WHERE dst.user_id = ? AND dst.month = ?
                        AND (
                            (src.recurring_id IS NOT NULL AND dst.recurring_id IS NOT DISTINCT FROM src.recurring_id)
                            OR dst.label = src.label
                        )
                  )
                """, to, userId, from, userId, to);
    }

    public ExpenseItem byId(long id) {
        List<ExpenseItem> rows = jdbc.query("""
                SELECT id, month, label, amount, is_essential, purchase_vat, recurring_id
                FROM monthly_expense_items WHERE id = ? AND user_id = ?
                """, PostgresExpenseItemLedger::map, id, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public ExpenseItem update(long id, String month, String label, long amount, boolean isEssential, long purchaseVat) {
        try {
            int updated = jdbc.update("""
                    UPDATE monthly_expense_items
                    SET month = ?, label = ?, amount = ?, is_essential = ?, purchase_vat = ?, updated_at = now()
                    WHERE id = ? AND user_id = ?
                    """, month, label, amount, isEssential, purchaseVat, id, userId);
            if (updated == 0) {
                throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
            }
            ExpenseItem existing = byId(id);
            return existing != null
                    ? new ExpenseItem(id, month, label, amount, isEssential, purchaseVat, existing.recurringId())
                    : new ExpenseItem(id, month, label, amount, isEssential, purchaseVat, null);
        } catch (DataIntegrityViolationException e) {
            throw new IllegalArgumentException("duplicate label: " + label);
        }
    }

    public void delete(long id) {
        int deleted = jdbc.update(
                "DELETE FROM monthly_expense_items WHERE id = ? AND user_id = ?", id, userId);
        if (deleted == 0) {
            throw new com.assetflow.common.api.NotFoundException("expense item id " + id);
        }
    }
}
