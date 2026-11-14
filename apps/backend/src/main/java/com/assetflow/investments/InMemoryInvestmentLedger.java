package com.assetflow.investments;

import com.assetflow.common.api.NotFoundException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 인메모리 보유종목 원장 (§54.2). postgres 프로필이 아닌 환경의 기본값.
 * 시드는 §36.2 기준선을 유지하도록 구성했다 — invest 계좌 총액(예수금 + 평가액)이
 * 기존 31,000,000 / 23,500,000 과 같아진다(§54.3).
 */
@Component
@Profile("!postgres")
public class InMemoryInvestmentLedger implements InvestmentLedger {

    private final List<HoldingRow> rows = new ArrayList<>(seed());
    private final AtomicLong nextId = new AtomicLong(100);
    /** §70 KIS 동기화로 들어온 행 id. deleteKisOnly 가 이것만 정리한다. */
    private final Set<Long> kisIds = new HashSet<>();

    private static List<HoldingRow> seed() {
        // 계좌 id 는 InMemoryAssetLedger 시드 순서(4=키움 투자금, 5=미국주식)를 따른다.
        BigDecimal krw = BigDecimal.ONE;
        List<HoldingRow> seed = new ArrayList<>();
        seed.add(new HoldingRow(1, 4, "stock", "005930", "삼성전자", "KRW",
                new BigDecimal("200"), new BigDecimal("70000"), new BigDecimal("75000"), krw, "2026-10-24"));
        seed.add(new HoldingRow(2, 4, "etf", "069500", "KODEX 200", "KRW",
                new BigDecimal("300"), new BigDecimal("30000"), new BigDecimal("32000"), krw, "2026-10-24"));
        seed.add(new HoldingRow(3, 4, "bond", "114260", "국고채 10년", "KRW",
                new BigDecimal("100"), new BigDecimal("50000"), new BigDecimal("51000"), krw, "2026-10-24"));
        // 원금 1,500만 원 상당(100주 × $150 × 1,300) · 평가 2,340만 원
        seed.add(new HoldingRow(4, 5, "stock", "AAPL", "애플", "USD",
                new BigDecimal("100"), new BigDecimal("150"), new BigDecimal("180"),
                new BigDecimal("1300"), "2026-10-24"));
        return seed;
    }

    @Override
    public List<HoldingRow> all() {
        synchronized (rows) {
            return List.copyOf(rows);
        }
    }

    @Override
    public HoldingRow create(HoldingRow row) {
        HoldingRow saved = new HoldingRow(nextId.getAndIncrement(), row.accountId(), row.assetClass(),
                row.symbol(), row.name(), row.currency(), row.quantity(), row.avgPrice(),
                row.marketPrice(), row.fxRate(), row.priceAsOf(), row.issueDate(), row.maturityDate(),
                row.issuerName(), row.couponRate(), row.faceAmount());
        synchronized (rows) {
            rows.add(saved);
        }
        return saved;
    }

    @Override
    public HoldingRow update(long id, HoldingRow row) {
        synchronized (rows) {
            for (int i = 0; i < rows.size(); i++) {
                if (rows.get(i).id() == id) {
                    HoldingRow saved = new HoldingRow(id, row.accountId(), row.assetClass(), row.symbol(),
                            row.name(), row.currency(), row.quantity(), row.avgPrice(),
                            row.marketPrice(), row.fxRate(), row.priceAsOf(),
                            row.issueDate(), row.maturityDate(), row.issuerName(), row.couponRate(), row.faceAmount());
                    rows.set(i, saved);
                    return saved;
                }
            }
        }
        throw new NotFoundException("holding id " + id);
    }

    @Override
    public void delete(long id) {
        synchronized (rows) {
            if (!rows.removeIf(r -> r.id() == id)) {
                throw new NotFoundException("holding id " + id);
            }
            kisIds.remove(id);
        }
    }

    @Override
    public void deleteByAccountId(long accountId) {
        synchronized (rows) {
            rows.removeIf(r -> {
                if (r.accountId() == accountId) {
                    kisIds.remove(r.id());
                    return true;
                }
                return false;
            });
        }
    }

    /** §70 Postgres 구현과 같은 규칙: 같은 심볼 → 심볼 없는 같은 이름 순으로 흡수한다. */
    @Override
    public HoldingRow upsertKis(HoldingRow row) {
        synchronized (rows) {
            if (row.symbol() != null && !row.symbol().isBlank()) {
                List<HoldingRow> sameSymbol = rows.stream()
                        .filter(r -> r.accountId() == row.accountId() && row.symbol().equals(r.symbol()))
                        .toList();
                if (!sameSymbol.isEmpty()) {
                    return applyKis(sameSymbol, row);
                }
            }

            String name = row.name() == null ? "" : row.name().trim();
            List<HoldingRow> sameName = rows.stream()
                    .filter(r -> r.accountId() == row.accountId() && !kisIds.contains(r.id()))
                    .filter(r -> r.symbol() == null || r.symbol().isBlank())
                    .filter(r -> r.name() != null && r.name().trim().equalsIgnoreCase(name))
                    .toList();
            if (!sameName.isEmpty()) {
                return applyKis(sameName, row);
            }

            HoldingRow saved = new HoldingRow(nextId.getAndIncrement(), row.accountId(), row.assetClass(),
                    row.symbol(), row.name(), row.currency(), row.quantity(), row.avgPrice(),
                    row.marketPrice(), row.fxRate(), row.priceAsOf(), row.issueDate(), row.maturityDate(),
                    row.issuerName(), row.couponRate(), row.faceAmount());
            rows.add(saved);
            kisIds.add(saved.id());
            return saved;
        }
    }

    /** 첫 행만 갱신하고 나머지는 같은 종목의 중복 행이므로 삭제한다. */
    private HoldingRow applyKis(List<HoldingRow> matches, HoldingRow row) {
        long keepId = matches.get(0).id();
        // KIS 동기화는 채권 발행일/만기일·발행기관/표면이율을 모른다 — 기존 값을 보존한다.
        LocalDate issueDate = row.issueDate() != null ? row.issueDate() : matches.get(0).issueDate();
        LocalDate maturityDate = row.maturityDate() != null ? row.maturityDate() : matches.get(0).maturityDate();
        HoldingRow saved = new HoldingRow(keepId, row.accountId(), row.assetClass(), row.symbol(),
                row.name(), row.currency(), row.quantity(), row.avgPrice(), row.marketPrice(),
                row.fxRate(), row.priceAsOf(), issueDate, maturityDate,
                matches.get(0).issuerName(), matches.get(0).couponRate(), matches.get(0).faceAmount());
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i).id() == keepId) {
                rows.set(i, saved);
                break;
            }
        }
        kisIds.add(keepId);
        for (int i = 1; i < matches.size(); i++) {
            long duplicateId = matches.get(i).id();
            rows.removeIf(r -> r.id() == duplicateId);
            kisIds.remove(duplicateId);
        }
        return saved;
    }

    @Override
    public int deleteKisOnly(long accountId, Collection<String> keepSymbols) {
        Set<String> keep = new HashSet<>();
        if (keepSymbols != null) {
            for (String symbol : keepSymbols) {
                if (symbol != null && !symbol.isBlank()) {
                    keep.add(symbol);
                }
            }
        }
        synchronized (rows) {
            List<Long> removed = rows.stream()
                    .filter(r -> r.accountId() == accountId && kisIds.contains(r.id()))
                    .filter(r -> r.symbol() == null || !keep.contains(r.symbol()))
                    .map(HoldingRow::id)
                    .toList();
            rows.removeIf(r -> removed.contains(r.id()));
            removed.forEach(kisIds::remove);
            return removed.size();
        }
    }
}
