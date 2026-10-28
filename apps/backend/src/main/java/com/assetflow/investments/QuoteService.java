package com.assetflow.investments;

import java.math.BigDecimal;
import java.util.Optional;

/**
 * §54.4 시세 조회 — 현재가는 저장값이 아니라 조회값이다.
 * 외부 시세 API 키가 없으므로 네이버 금융의 공개 JSON 을 서버가 대신 호출한다
 * (브라우저 직접 호출은 CORS 로 막힌다). 실패는 예외가 아니라 empty 로 돌려준다 —
 * 시세가 없다고 종목 저장·조회가 막히면 안 된다.
 */
public interface QuoteService {

    /**
     * @param symbol      사용자가 입력한 심볼(005930, AAPL …)
     * @param quoteSymbol 네이버가 돌려준 심볼(AAPL.O 등)
     * @param priceAsOf   시세 기준일(거래소 현지 날짜, YYYY-MM-DD)
     */
    record Quote(String symbol, String quoteSymbol, String name, String currency,
                 BigDecimal price, String priceAsOf) {}

    record FxRate(String currency, BigDecimal rate, String priceAsOf) {}

    Optional<Quote> quote(String symbol);

    Optional<FxRate> fxRate(String currency);
}
