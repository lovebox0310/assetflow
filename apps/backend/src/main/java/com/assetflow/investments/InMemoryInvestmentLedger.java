package com.assetflow.investments;

import com.assetflow.common.api.NotFoundException;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
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
                row.marketPrice(), row.fxRate(), row.priceAsOf());
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
                            row.marketPrice(), row.fxRate(), row.priceAsOf());
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
        }
    }
}
