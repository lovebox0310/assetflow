package com.assetflow.investments;

import com.fasterxml.jackson.annotation.JsonFormat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

/**
 * 투자 보유종목 원장 (§54.2, Sprint 5 E1).
 * §31.1 승계: 평가액·손익·총액은 여기서 저장하지 않는다 — 행만 보관한다.
 * postgres 프로필은 PostgresInvestmentLedger, 그 외(테스트·CI)는 InMemoryInvestmentLedger.
 */
public interface InvestmentLedger {

    record HoldingRow(long id, long accountId, String assetClass, String symbol, String name,
                      String currency, BigDecimal quantity, BigDecimal avgPrice,
                      BigDecimal marketPrice, BigDecimal fxRate, String priceAsOf,
                      /** 채권 발행일/만기일. 다른 자산군은 null. API 는 YYYY-MM-DD 문자열. */
                      @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
                      LocalDate issueDate,
                      @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd")
                      LocalDate maturityDate,
                      /** 채권 발행기관·표면이율(%). 다른 자산군은 null. */
                      String issuerName,
                      BigDecimal couponRate) {

        /** 기존 호출부 호환 — 발행기관/표면이율 없이(다른 자산군·KIS 동기화). */
        public HoldingRow(long id, long accountId, String assetClass, String symbol, String name,
                          String currency, BigDecimal quantity, BigDecimal avgPrice,
                          BigDecimal marketPrice, BigDecimal fxRate, String priceAsOf,
                          LocalDate issueDate, LocalDate maturityDate) {
            this(id, accountId, assetClass, symbol, name, currency, quantity, avgPrice,
                    marketPrice, fxRate, priceAsOf, issueDate, maturityDate, null, null);
        }

        /** 기존 호출부 호환 — 날짜도 없이 만든다. */
        public HoldingRow(long id, long accountId, String assetClass, String symbol, String name,
                          String currency, BigDecimal quantity, BigDecimal avgPrice,
                          BigDecimal marketPrice, BigDecimal fxRate, String priceAsOf) {
            this(id, accountId, assetClass, symbol, name, currency, quantity, avgPrice,
                    marketPrice, fxRate, priceAsOf, null, null, null, null);
        }
    }

    List<HoldingRow> all();

    HoldingRow create(HoldingRow row);

    HoldingRow update(long id, HoldingRow row);

    void delete(long id);

    /** 계좌 삭제/타입 변경 시 해당 계좌의 보유종목을 일괄 삭제한다. */
    void deleteByAccountId(long accountId);

    /**
     * §70 KIS 동기화 결과를 반영한다. 사용자가 직접 넣은 행과 중복되지 않도록
     * 같은 계좌에서 ① 같은 심볼 → ② 심볼 없는 같은 이름 순으로 기존 행을 찾아
     * 갱신하고, 출처를 {@code 'kis'} 로 표시한다. 찾지 못하면 새로 만든다.
     */
    HoldingRow upsertKis(HoldingRow row);

    /**
     * §70 동기화가 완전히 성공했을 때, 이번 결과에 없는 {@code 'kis'} 출처 행만
     * 삭제한다. 사용자가 직접 입력한 {@code 'manual'} 행은 건드리지 않는다.
     *
     * @param keepSymbols 이번 동기화 결과에 남아 있는 심볼
     * @return 삭제한 행 수
     */
    int deleteKisOnly(long accountId, Collection<String> keepSymbols);
}
