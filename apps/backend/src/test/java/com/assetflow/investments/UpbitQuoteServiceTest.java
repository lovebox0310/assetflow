package com.assetflow.investments;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * UPBIT-1 업비트 ticker 파싱 — 네트워크 없이 응답 형식만 검증한다.
 * 실제 HTTP 는 {@code quote()} 가 담당하고, 실패는 empty 로 흡수하는 계약이다.
 */
class UpbitQuoteServiceTest {

    private final UpbitQuoteService service = new UpbitQuoteService(new ObjectMapper());

    private static final String SAMPLE = """
            [{
              "market": "KRW-BTC",
              "trade_date": "20261110",
              "trade_time": "123456",
              "trade_date_kst": "20261110",
              "trade_time_kst": "213456",
              "trade_price": 100642000.00000000,
              "timestamp": 1762774496000
            }]
            """;

    @Test
    void parsesPriceAndKstDateFromTickerArray() {
        Optional<QuoteService.Quote> quote = service.parseTicker("BTC", "KRW-BTC", SAMPLE);

        assertThat(quote).isPresent();
        assertThat(quote.get().price()).isEqualByComparingTo(new BigDecimal("100642000"));
        assertThat(quote.get().priceAsOf()).isEqualTo("2026-11-10");
        assertThat(quote.get().currency()).isEqualTo("KRW");
        assertThat(quote.get().quoteSymbol()).isEqualTo("KRW-BTC");
        assertThat(quote.get().name()).isEqualTo("BTC");
    }

    @Test
    void nonArrayOrEmptyArrayIsEmpty() {
        assertThat(service.parseTicker("BTC", "KRW-BTC", "{\"trade_price\": 1}")).isEmpty();
        assertThat(service.parseTicker("BTC", "KRW-BTC", "[]")).isEmpty();
        assertThat(service.parseTicker("BTC", "KRW-BTC", "")).isEmpty();
        assertThat(service.parseTicker("BTC", "KRW-BTC", "not-json")).isEmpty();
    }

    @Test
    void stringTradePriceIsParsed() {
        String body = """
                [{"market":"KRW-BTC","trade_date_kst":"20261109","trade_price":"100642000.5"}]
                """;

        Optional<QuoteService.Quote> quote = service.parseTicker("BTC", "KRW-BTC", body);

        assertThat(quote).isPresent();
        assertThat(quote.get().price()).isEqualByComparingTo(new BigDecimal("100642000.5"));
        assertThat(quote.get().priceAsOf()).isEqualTo("2026-11-09");
    }

    @Test
    void nonPositivePriceIsEmpty() {
        String body = """
                [{"market":"KRW-BTC","trade_date_kst":"20261110","trade_price":0}]
                """;

        assertThat(service.parseTicker("BTC", "KRW-BTC", body)).isEmpty();
    }

    @Test
    void nonKrwCurrencyIsSkippedWithoutHttpCall() {
        // USD 는 업비트 KRW 마켓으로 조회하지 않는다 — 네트워크가 없어도 즉시 empty.
        assertThat(service.quote("BTC", "USD")).isEmpty();
        assertThat(service.quote("ETH", "usd")).isEmpty();
        assertThat(service.quote("", "KRW")).isEmpty();
        assertThat(service.quote(null, "KRW")).isEmpty();
    }
}
