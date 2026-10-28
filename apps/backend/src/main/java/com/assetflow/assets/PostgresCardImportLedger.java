package com.assetflow.assets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 카드매입 원장의 PostgreSQL 구현 (§37 card_imports). postgres 프로필에서만 활성화.
 * §29.6 중복 반영 금지는 (user_id, row_key) UNIQUE + ON CONFLICT DO NOTHING 으로 DB 가 보증한다.
 */
@Component
@Profile("postgres")
public class PostgresCardImportLedger implements CardImportLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresCardImportLedger(JdbcTemplate jdbc,
                                    @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    private static CardImportLedger.ImportedRow map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new CardImportLedger.ImportedRow(
                rs.getString("row_key"),
                rs.getString("approved_at"),
                rs.getString("merchant_name"),
                rs.getLong("supply_ex_vat"),
                rs.getLong("vat"),
                rs.getLong("gross_amount"),
                rs.getString("card_masked") == null ? "" : rs.getString("card_masked"),
                rs.getString("expense_kind") == null ? "" : rs.getString("expense_kind"),
                rs.getString("sub_category") == null ? "" : rs.getString("sub_category"),
                rs.getString("business_no") == null ? "" : rs.getString("business_no"),
                rs.getString("business_category") == null ? "" : rs.getString("business_category"),
                rs.getString("member_relation") == null ? "" : rs.getString("member_relation"));
    }

    public List<CardImportLedger.ImportedRow> all() {
        return jdbc.query("""
                SELECT row_key, approved_at, merchant_name, supply_ex_vat, vat, gross_amount,
                       card_masked, expense_kind, sub_category, business_no, business_category, member_relation
                FROM card_imports WHERE user_id = ? ORDER BY id
                """, PostgresCardImportLedger::map, userId);
    }

    public List<ImportedRow> inMonth(String month) {
        java.sql.Date start = java.sql.Date.valueOf(month + "-01");
        java.sql.Date end = java.sql.Date.valueOf(java.time.YearMonth.parse(month).plusMonths(1).atDay(1));
        return jdbc.query("""
                SELECT row_key, approved_at, merchant_name, supply_ex_vat, vat, gross_amount,
                       card_masked, expense_kind, sub_category, business_no, business_category, member_relation
                FROM card_imports
                WHERE user_id = ? AND approved_at >= ? AND approved_at < ?
                ORDER BY approved_at, id
                """, PostgresCardImportLedger::map, userId, start, end);
    }

    public Set<String> existingRowKeys() {
        return new HashSet<>(jdbc.queryForList(
                "SELECT row_key FROM card_imports WHERE user_id = ?", String.class, userId));
    }

    public int addAll(List<CardImportLedger.ImportedRow> incoming) {
        int stored = 0;
        for (CardImportLedger.ImportedRow r : incoming) {
            stored += jdbc.update("""
                    INSERT INTO card_imports (user_id, row_key, approved_at, merchant_name,
                                              supply_ex_vat, vat, gross_amount, card_masked,
                                              expense_kind, sub_category, business_no, business_category,
                                              member_relation)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (user_id, row_key) DO UPDATE SET
                        business_no = EXCLUDED.business_no,
                        business_category = EXCLUDED.business_category,
                        member_relation = EXCLUDED.member_relation,
                        updated_at = now()
                    WHERE card_imports.business_no IS NULL OR card_imports.business_no = ''
                    """, userId, r.rowKey(), Date.valueOf(r.approvedAt()), r.merchantName(),
                    r.supplyExVat(), r.vat(), r.grossAmount(), r.cardMasked(),
                    r.expenseKind(), r.subCategory(), r.businessNo(), r.businessCategory(),
                    r.memberRelation());
        }
        return stored;
    }

    public Optional<CardImportLedger.ImportedRow> find(String rowKey) {
        return jdbc.query("""
                SELECT row_key, approved_at, merchant_name, supply_ex_vat, vat, gross_amount,
                       card_masked, expense_kind, sub_category, business_no, business_category, member_relation
                FROM card_imports WHERE user_id = ? AND row_key = ?
                """, PostgresCardImportLedger::map, userId, rowKey)
                .stream().findFirst();
    }

    public boolean updateClassification(String rowKey, String category, String subCategory) {
        return jdbc.update("""
                UPDATE card_imports
                SET expense_kind = ?, sub_category = ?, updated_at = now()
                WHERE user_id = ? AND row_key = ?
                """, category, subCategory, userId, rowKey) > 0;
    }

    public int updateClassificationByMerchant(String merchantName, String category, String subCategory) {
        return jdbc.update("""
                UPDATE card_imports
                SET expense_kind = ?, sub_category = ?, updated_at = now()
                WHERE user_id = ? AND merchant_name = ?
                """, category, subCategory, userId, merchantName);
    }

    public List<UnclassifiedGroup> unclassifiedGroups() {
        return jdbc.query("""
                SELECT merchant_name, COUNT(*) AS cnt, SUM(gross_amount) AS gross_total,
                       MIN(approved_at) AS first_at, MAX(approved_at) AS last_at,
                       STRING_AGG(DISTINCT NULLIF(business_category, ''), ', ' ORDER BY NULLIF(business_category, '')) AS business_category,
                       STRING_AGG(DISTINCT NULLIF(business_no, ''), ', ' ORDER BY NULLIF(business_no, '')) AS business_no
                FROM card_imports
                WHERE user_id = ? AND (expense_kind IS NULL OR expense_kind = '' OR expense_kind = 'unclassified')
                GROUP BY merchant_name
                ORDER BY gross_total DESC, cnt DESC, merchant_name
                """,
                (rs, n) -> new UnclassifiedGroup(
                        rs.getString("merchant_name"),
                        rs.getInt("cnt"),
                        rs.getLong("gross_total"),
                        rs.getString("first_at"),
                        rs.getString("last_at"),
                        rs.getString("business_category"),
                        rs.getString("business_no")),
                userId);
    }

    public int clearClassificationByMerchant(String merchantName) {
        return jdbc.update("""
                UPDATE card_imports
                SET expense_kind = '', sub_category = '', updated_at = now()
                WHERE user_id = ? AND merchant_name = ?
                """, userId, merchantName);
    }

    public List<MonthlyCategoryTotal> monthlyCategoryTotals(String fromMonth, String toMonth) {
        // fromMonth 1일 ~ toMonth 말일 (다음 달 1일 미만)
        Date from = Date.valueOf(fromMonth + "-01");
        Date until = Date.valueOf(toMonth + "-01");
        return jdbc.query("""
                SELECT to_char(approved_at, 'YYYY-MM') AS ym,
                       CASE WHEN expense_kind IS NULL OR expense_kind = '' OR expense_kind = 'unclassified'
                            THEN '미분류' ELSE expense_kind END AS category,
                       SUM(gross_amount) AS gross
                FROM card_imports
                WHERE user_id = ?
                  AND approved_at >= ?
                  AND approved_at < (CAST(? AS DATE) + INTERVAL '1 month')
                  AND (sub_category IS NULL OR sub_category <> '저축/투자')
                GROUP BY ym, category
                ORDER BY ym, category
                """,
                (rs, n) -> new MonthlyCategoryTotal(
                        rs.getString("ym"),
                        rs.getString("category"),
                        rs.getLong("gross")),
                userId, from, until);
    }
}
