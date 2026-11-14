package com.assetflow.investments;

import com.assetflow.common.api.NotFoundException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.DependsOn;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

/**
 * PostgreSQL 보유종목 원장 (§54.2). postgres 프로필에서만 활성화.
 * postgresAssetLedger 가 계좌 시드를 먼저 만들도록 @DependsOn 을 둔다 — 보유종목 시드가
 * account_id 를 이름으로 찾기 때문이다.
 */
@Component
@Profile("postgres")
@DependsOn("postgresAssetLedger")
public class PostgresInvestmentLedger implements InvestmentLedger {

    private final JdbcTemplate jdbc;
    private final long userId;

    public PostgresInvestmentLedger(JdbcTemplate jdbc,
                                    @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    /**
     * §54.3 마이그레이션: 기존 invest 계좌의 balance 는 "총액"이었다. 보유종목이 하나도 없고
     * balance 가 옛 시드값과 정확히 같을 때만 예수금으로 바꾸고 종목을 심는다.
     * 사용자가 금액을 고쳤다면 건드리지 않는다(데이터 보존).
     */
    @PostConstruct
    void seedIfEmpty() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM investment_holdings WHERE user_id = ?", Integer.class, userId);
        if (count != null && count > 0) {
            return;
        }
        jdbc.update("""
                UPDATE asset_accounts SET balance = 1300000, updated_at = now()
                WHERE user_id = ? AND name = '키움 투자금' AND balance = 31000000
                """, userId);
        jdbc.update("""
                UPDATE asset_accounts SET balance = 100000, updated_at = now()
                WHERE user_id = ? AND name = '미국주식' AND balance = 23500000
                """, userId);

        Long keum = accountId("키움 투자금");
        if (keum != null) {
            insert(keum, "stock", "005930", "삼성전자", "KRW",
                    "200", "70000", "75000", "1", "2026-10-24");
            insert(keum, "etf", "069500", "KODEX 200", "KRW",
                    "300", "30000", "32000", "1", "2026-10-24");
            insert(keum, "bond", "114260", "국고채 10년", "KRW",
                    "100", "50000", "51000", "1", "2026-10-24");
        }
        Long us = accountId("미국주식");
        if (us != null) {
            insert(us, "stock", "AAPL", "애플", "USD",
                    "100", "150", "180", "1300", "2026-10-24");
        }
    }

    private Long accountId(String name) {
        List<Long> ids = jdbc.queryForList(
                "SELECT id FROM asset_accounts WHERE user_id = ? AND name = ?",
                Long.class, userId, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private void insert(long accountId, String assetClass, String symbol, String name, String currency,
                        String quantity, String avgPrice, String marketPrice, String fxRate,
                        String priceAsOf) {
        jdbc.update("""
                INSERT INTO investment_holdings (user_id, account_id, asset_class, symbol, name,
                                                 currency, quantity, avg_price, market_price, fx_rate, price_as_of)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, userId, accountId, assetClass, symbol, name, currency,
                new BigDecimal(quantity), new BigDecimal(avgPrice), new BigDecimal(marketPrice),
                new BigDecimal(fxRate), Date.valueOf(priceAsOf));
    }

    private static HoldingRow map(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        Date asOf = rs.getDate("price_as_of");
        return new HoldingRow(
                rs.getLong("id"),
                rs.getLong("account_id"),
                rs.getString("asset_class"),
                rs.getString("symbol"),
                rs.getString("name"),
                rs.getString("currency"),
                rs.getBigDecimal("quantity"),
                rs.getBigDecimal("avg_price"),
                rs.getBigDecimal("market_price"),
                rs.getBigDecimal("fx_rate"),
                asOf == null ? null : asOf.toLocalDate().toString(),
                rs.getObject("issue_date", LocalDate.class),
                rs.getObject("maturity_date", LocalDate.class));
    }

    @Override
    public List<HoldingRow> all() {
        return jdbc.query("""
                SELECT id, account_id, asset_class, symbol, name, currency,
                       quantity, avg_price, market_price, fx_rate, price_as_of,
                       issue_date, maturity_date
                FROM investment_holdings WHERE user_id = ? ORDER BY account_id, id
                """, PostgresInvestmentLedger::map, userId);
    }

    @Override
    public HoldingRow create(HoldingRow row) {
        Long id = jdbc.queryForObject("""
                INSERT INTO investment_holdings (user_id, account_id, asset_class, symbol, name,
                                                 currency, quantity, avg_price, market_price, fx_rate,
                                                 price_as_of, issue_date, maturity_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, userId, row.accountId(), row.assetClass(), row.symbol(), row.name(),
                row.currency(), row.quantity(), row.avgPrice(), row.marketPrice(), row.fxRate(),
                row.priceAsOf() == null ? null : Date.valueOf(row.priceAsOf()),
                row.issueDate(), row.maturityDate());
        return withId(id, row);
    }

    @Override
    public HoldingRow update(long id, HoldingRow row) {
        int updated = jdbc.update("""
                UPDATE investment_holdings
                SET account_id = ?, asset_class = ?, symbol = ?, name = ?, currency = ?,
                    quantity = ?, avg_price = ?, market_price = ?, fx_rate = ?, price_as_of = ?,
                    issue_date = ?, maturity_date = ?, updated_at = now()
                WHERE id = ? AND user_id = ?
                """, row.accountId(), row.assetClass(), row.symbol(), row.name(), row.currency(),
                row.quantity(), row.avgPrice(), row.marketPrice(), row.fxRate(),
                row.priceAsOf() == null ? null : Date.valueOf(row.priceAsOf()),
                row.issueDate(), row.maturityDate(), id, userId);
        if (updated == 0) {
            throw new NotFoundException("holding id " + id);
        }
        return withId(id, row);
    }

    @Override
    public void delete(long id) {
        int deleted = jdbc.update(
                "DELETE FROM investment_holdings WHERE id = ? AND user_id = ?", id, userId);
        if (deleted == 0) {
            throw new NotFoundException("holding id " + id);
        }
    }

    @Override
    public void deleteByAccountId(long accountId) {
        jdbc.update("DELETE FROM investment_holdings WHERE account_id = ? AND user_id = ?", accountId, userId);
    }

    /**
     * §70 같은 종목이 이미 있으면 그 행을 갱신하고(중복 행은 정리) {@code source='kis'} 로 바꾼다.
     * 심볼이 같은 행을 먼저 찾고, 없으면 심볼 없이 수동 입력한 같은 이름 행을 흡수한다.
     */
    @Override
    public HoldingRow upsertKis(HoldingRow row) {
        List<Long> sameSymbol = row.symbol() == null || row.symbol().isBlank()
                ? List.of()
                : jdbc.queryForList("""
                        SELECT id FROM investment_holdings
                        WHERE user_id = ? AND account_id = ? AND symbol = ?
                        ORDER BY id
                        """, Long.class, userId, row.accountId(), row.symbol());
        if (!sameSymbol.isEmpty()) {
            return applyKis(sameSymbol, row);
        }

        List<Long> sameName = jdbc.queryForList("""
                SELECT id FROM investment_holdings
                WHERE user_id = ? AND account_id = ? AND source = 'manual'
                  AND (symbol IS NULL OR btrim(symbol) = '')
                  AND lower(btrim(name)) = lower(btrim(?))
                ORDER BY id
                """, Long.class, userId, row.accountId(), row.name());
        if (!sameName.isEmpty()) {
            return applyKis(sameName, row);
        }

        Long id = jdbc.queryForObject("""
                INSERT INTO investment_holdings (user_id, account_id, asset_class, symbol, name,
                                                 currency, quantity, avg_price, market_price, fx_rate,
                                                 price_as_of, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'kis')
                RETURNING id
                """, Long.class, userId, row.accountId(), row.assetClass(), row.symbol(), row.name(),
                row.currency(), row.quantity(), row.avgPrice(), row.marketPrice(), row.fxRate(),
                row.priceAsOf() == null ? null : Date.valueOf(row.priceAsOf()));
        return withId(id, row);
    }

    /** 첫 행만 갱신하고 나머지는 같은 종목의 중복 행이므로 삭제한다. */
    private HoldingRow applyKis(List<Long> ids, HoldingRow row) {
        long keepId = ids.get(0);
        int updated = jdbc.update("""
                UPDATE investment_holdings
                SET asset_class = ?, symbol = ?, name = ?, currency = ?, quantity = ?, avg_price = ?,
                    market_price = ?, fx_rate = ?, price_as_of = ?, source = 'kis', updated_at = now()
                WHERE id = ? AND user_id = ?
                """, row.assetClass(), row.symbol(), row.name(), row.currency(), row.quantity(),
                row.avgPrice(), row.marketPrice(), row.fxRate(),
                row.priceAsOf() == null ? null : Date.valueOf(row.priceAsOf()), keepId, userId);
        if (updated == 0) {
            throw new NotFoundException("holding id " + keepId);
        }
        for (int i = 1; i < ids.size(); i++) {
            jdbc.update("DELETE FROM investment_holdings WHERE id = ? AND user_id = ?", ids.get(i), userId);
        }
        return withId(keepId, row);
    }

    private static HoldingRow withId(long id, HoldingRow row) {
        return new HoldingRow(id, row.accountId(), row.assetClass(), row.symbol(), row.name(),
                row.currency(), row.quantity(), row.avgPrice(), row.marketPrice(), row.fxRate(),
                row.priceAsOf(), row.issueDate(), row.maturityDate());
    }

    @Override
    public int deleteKisOnly(long accountId, Collection<String> keepSymbols) {
        List<String> symbols = keepSymbols == null ? List.of()
                : keepSymbols.stream().filter(s -> s != null && !s.isBlank()).distinct().toList();
        if (symbols.isEmpty()) {
            return jdbc.update(
                    "DELETE FROM investment_holdings WHERE user_id = ? AND account_id = ? AND source = 'kis'",
                    userId, accountId);
        }
        String placeholders = String.join(", ", Collections.nCopies(symbols.size(), "?"));
        String sql = "DELETE FROM investment_holdings "
                + "WHERE user_id = ? AND account_id = ? AND source = 'kis' "
                + "AND (symbol IS NULL OR symbol NOT IN (" + placeholders + "))";
        List<Object> args = new ArrayList<>(symbols.size() + 2);
        args.add(userId);
        args.add(accountId);
        args.addAll(symbols);
        return jdbc.update(sql, args.toArray());
    }
}
