package com.assetflow.assets;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
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
                rs.getString("member_relation") == null ? "" : rs.getString("member_relation"),
                rs.getString("card_company") == null ? "" : rs.getString("card_company"),
                CardImportLedger.normalizeSource(rs.getString("source")));
    }

    /** 모든 조회가 같은 컬럼 목록을 쓰도록 한 곳에 둔다(source 포함). */
    private static final String SELECT_COLUMNS = """
            SELECT row_key, approved_at, merchant_name, supply_ex_vat, vat, gross_amount,
                   card_masked, expense_kind, sub_category, business_no, business_category,
                   member_relation, card_company, source
            FROM card_imports
            """;

    public List<CardImportLedger.ImportedRow> all() {
        return jdbc.query(SELECT_COLUMNS + " WHERE user_id = ? ORDER BY id",
                PostgresCardImportLedger::map, userId);
    }

    public List<ImportedRow> inMonth(String month) {
        java.sql.Date start = java.sql.Date.valueOf(month + "-01");
        java.sql.Date end = java.sql.Date.valueOf(java.time.YearMonth.parse(month).plusMonths(1).atDay(1));
        return jdbc.query(SELECT_COLUMNS + """
                WHERE user_id = ? AND approved_at >= ? AND approved_at < ?
                ORDER BY approved_at, id
                """, PostgresCardImportLedger::map, userId, start, end);
    }

    @Override
    public List<ImportedRow> byBusinessNo(String businessNo) {
        if (businessNo == null || businessNo.isBlank()) {
            return List.of();
        }
        return jdbc.query(SELECT_COLUMNS + """
                WHERE user_id = ? AND business_no = ?
                ORDER BY id
                """, PostgresCardImportLedger::map, userId, businessNo);
    }

    @Override
    public String businessNoForMerchant(String merchantName) {
        if (merchantName == null || merchantName.isBlank()) {
            return null;
        }
        List<String> values = jdbc.queryForList("""
                SELECT business_no FROM card_imports
                WHERE user_id = ? AND merchant_name = ? AND business_no IS NOT NULL AND business_no <> ''
                ORDER BY id LIMIT 1
                """, String.class, userId, merchantName);
        return values.isEmpty() ? null : values.get(0);
    }

    public Set<String> existingRowKeys() {
        return new HashSet<>(jdbc.queryForList(
                "SELECT row_key FROM card_imports WHERE user_id = ?", String.class, userId));
    }

    public int addAll(List<CardImportLedger.ImportedRow> incoming) {
        int stored = 0;
        // CARD-MERGE-1: 자연키는 (카드사·이용일·금액). 같은 키가 실제로 여러 번 있을 수
        // 있으므로 배치 안에서의 발생 순번(#n)에 해당하는 기존 행과 짝지어 판단한다.
        Map<String, Integer> batchCounts = new HashMap<>();
        for (CardImportLedger.ImportedRow r : incoming) {
            String natural = CardImportLedger.naturalKey(
                    r.cardCompany(), r.approvedAt(), r.grossAmount());
            int nth = batchCounts.merge(natural, 1, Integer::sum);
            stored += saveOne(r, nth);
        }
        return stored;
    }

    /** 같은 자연키의 nth 번째(1부터) 기존 행. 없으면 빈 값. */
    private Optional<ImportedRow> nthExisting(ImportedRow r, int nth) {
        String company = r.cardCompany() == null ? "" : r.cardCompany();
        return jdbc.query(SELECT_COLUMNS + """
                WHERE user_id = ? AND COALESCE(card_company, '') = ?
                  AND approved_at = ? AND gross_amount = ?
                ORDER BY id
                OFFSET ? LIMIT 1
                """, PostgresCardImportLedger::map,
                userId, company, Date.valueOf(r.approvedAt()), r.grossAmount(), nth - 1)
                .stream().findFirst();
    }

    /**
     * 한 행 저장. CARD-MERGE-1 대체 규칙:
     * <ol>
     *   <li>기존 행 없음 → INSERT(출처 포함)</li>
     *   <li>기존 unknown/email + 신규 csv → CSV 값으로 대체</li>
     *   <li>기존 csv + 신규 email → 무시(CSV 정본)</li>
     *   <li>그 외 → 빈 필드만 보강(business_no/business_category), updated_at 갱신</li>
     * </ol>
     */
    private int saveOne(ImportedRow r, int nth) {
        Optional<ImportedRow> existing = nthExisting(r, nth);
        if (existing.isEmpty()) {
            return insert(r);
        }
        ImportedRow current = existing.get();
        String currentSource = CardImportLedger.normalizeSource(current.source());
        String incomingSource = CardImportLedger.normalizeSource(r.source());
        if (CardImportLedger.SOURCE_CSV.equals(currentSource)
                && !CardImportLedger.SOURCE_CSV.equals(incomingSource)) {
            return 0; // CSV 정본 — 이메일 수집이 덮어쓰지 않는다
        }
        if (CardImportLedger.SOURCE_CSV.equals(incomingSource)
                && !CardImportLedger.SOURCE_CSV.equals(currentSource)) {
            return replaceWithCsv(current, r);
        }
        return supplement(current, r);
    }

    private int insert(ImportedRow r) {
        return jdbc.update("""
                INSERT INTO card_imports (user_id, row_key, approved_at, merchant_name,
                                          supply_ex_vat, vat, gross_amount, card_masked,
                                          expense_kind, sub_category, business_no, business_category,
                                          member_relation, card_company, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, row_key) DO UPDATE SET
                    business_no = COALESCE(NULLIF(EXCLUDED.business_no, ''), card_imports.business_no),
                    business_category = COALESCE(NULLIF(EXCLUDED.business_category, ''), card_imports.business_category),
                    member_relation = EXCLUDED.member_relation,
                    card_company = COALESCE(NULLIF(EXCLUDED.card_company, ''), card_imports.card_company),
                    source = CASE WHEN card_imports.source = 'csv' AND EXCLUDED.source <> 'csv'
                                  THEN 'csv' ELSE EXCLUDED.source END,
                    updated_at = now()
                """, userId, r.rowKey(), Date.valueOf(r.approvedAt()), r.merchantName(),
                r.supplyExVat(), r.vat(), r.grossAmount(), r.cardMasked(),
                r.expenseKind(), r.subCategory(), r.businessNo(), r.businessCategory(),
                r.memberRelation(), r.cardCompany(), CardImportLedger.normalizeSource(r.source()));
    }

    /**
     * CARD-MERGE-1 2번 규칙: 이메일/미확인 행을 CSV 값으로 대체한다.
     * 분류(expense_kind/sub_category)는 기존 값이 있으면 유지하고 CSV 분류가 있으면 갱신한다.
     * card_imports.category_id 는 어떤 코드도 채우지 않으므로 건드리지 않는다(기존 값 유지).
     *
     * <p>승인번호는 row_key 안에만 있으므로 row_key 도 CSV 값으로 바꾼다. 다만 그 키를
     * 이미 다른 행이 쓰고 있으면(카드사 표기가 달라 자연키가 갈린 희귀한 경우) UNIQUE
     * 위반으로 임포트를 실패시키지 않고 기존 키를 유지한다.</p>
     */
    private int replaceWithCsv(ImportedRow current, ImportedRow csv) {
        boolean csvHasCategory = csv.expenseKind() != null && !csv.expenseKind().isBlank();
        String kind = csvHasCategory ? csv.expenseKind() : current.expenseKind();
        String sub = csvHasCategory
                ? (csv.subCategory() == null ? "" : csv.subCategory())
                : current.subCategory();
        String relation = csv.memberRelation() == null || csv.memberRelation().isBlank()
                ? current.memberRelation() : csv.memberRelation();
        String company = csv.cardCompany() == null || csv.cardCompany().isBlank()
                ? current.cardCompany() : csv.cardCompany();
        return jdbc.update("""
                UPDATE card_imports target
                SET row_key = CASE WHEN EXISTS (
                        SELECT 1 FROM card_imports other
                        WHERE other.user_id = target.user_id
                          AND other.row_key = ?
                          AND other.id <> target.id)
                    THEN target.row_key ELSE ? END,
                    merchant_name = ?, supply_ex_vat = ?, vat = ?,
                    card_masked = ?, business_no = ?, business_category = ?,
                    expense_kind = ?, sub_category = ?, member_relation = ?,
                    card_company = ?, source = 'csv', updated_at = now()
                WHERE target.user_id = ? AND target.row_key = ?
                """, csv.rowKey(), csv.rowKey(), csv.merchantName(), csv.supplyExVat(), csv.vat(),
                csv.cardMasked(), csv.businessNo(), csv.businessCategory(),
                kind, sub, relation, company, userId, current.rowKey());
    }

    /** 같은 출처(또는 미확인 행)에는 빈 필드만 보강한다. 바뀐 값이 없으면 0. */
    private int supplement(ImportedRow current, ImportedRow r) {
        String relation = r.memberRelation() == null || r.memberRelation().isBlank()
                ? current.memberRelation() : r.memberRelation();
        return jdbc.update("""
                UPDATE card_imports
                SET business_no = COALESCE(NULLIF(?, ''), business_no),
                    business_category = COALESCE(NULLIF(?, ''), business_category),
                    member_relation = ?,
                    card_company = COALESCE(NULLIF(?, ''), card_company),
                    updated_at = now()
                WHERE user_id = ? AND row_key = ?
                  AND ((COALESCE(business_no, '') = '' AND COALESCE(?, '') <> '')
                    OR (COALESCE(business_category, '') = '' AND COALESCE(?, '') <> '')
                    OR (member_relation IS DISTINCT FROM ?)
                    OR (COALESCE(card_company, '') = '' AND COALESCE(?, '') <> ''))
                """, r.businessNo(), r.businessCategory(), relation, r.cardCompany(),
                userId, current.rowKey(),
                r.businessNo(), r.businessCategory(), relation, r.cardCompany());
    }

    public Optional<CardImportLedger.ImportedRow> find(String rowKey) {
        return jdbc.query(SELECT_COLUMNS + " WHERE user_id = ? AND row_key = ?",
                        PostgresCardImportLedger::map, userId, rowKey)
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

    public int backfillCardCompany() {
        return jdbc.update("""
                UPDATE card_imports target
                SET card_company = known.company,
                    updated_at = now()
                FROM (
                    SELECT DISTINCT ON (user_id, card_masked) user_id, card_masked, card_company AS company
                    FROM card_imports
                    WHERE card_company IS NOT NULL AND card_company <> ''
                      AND card_masked IS NOT NULL AND card_masked <> ''
                ) known
                WHERE target.user_id = ?
                  AND target.user_id = known.user_id
                  AND target.card_masked = known.card_masked
                  AND (target.card_company IS NULL OR target.card_company = '');
                """, userId);
    }
}
