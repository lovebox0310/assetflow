package com.assetflow.investments;

import java.math.BigDecimal;
import java.util.List;

/**
 * 투자 보유종목 원장 (§54.2, Sprint 5 E1).
 * §31.1 승계: 평가액·손익·총액은 여기서 저장하지 않는다 — 행만 보관한다.
 * postgres 프로필은 PostgresInvestmentLedger, 그 외(테스트·CI)는 InMemoryInvestmentLedger.
 */
public interface InvestmentLedger {

    record HoldingRow(long id, long accountId, String assetClass, String symbol, String name,
                      String currency, BigDecimal quantity, BigDecimal avgPrice,
                      BigDecimal marketPrice, BigDecimal fxRate, String priceAsOf) {}

    List<HoldingRow> all();

    HoldingRow create(HoldingRow row);

    HoldingRow update(long id, HoldingRow row);

    void delete(long id);

    /** 계좌 삭제/타입 변경 시 해당 계좌의 보유종목을 일괄 삭제한다. */
    void deleteByAccountId(long accountId);
}
