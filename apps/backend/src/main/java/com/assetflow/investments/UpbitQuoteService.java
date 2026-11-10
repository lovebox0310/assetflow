package com.assetflow.investments;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 업비트 공개 ticker 로 코인 현재가를 읽는 {@link CryptoQuoteService} 구현 (UPBIT-1).
 *
 * - {@code GET https://api.upbit.com/v1/ticker?markets=KRW-BTC} — 공개 시세, API 키 불필요.
 * - 응답은 **배열**이며 첫 원소의 {@code trade_price}(숫자/문자 모두 허용)와
 *   {@code trade_date_kst}(YYYYMMDD)를 쓴다.
 * - **KRW 보유만 조회한다.** USD 보유를 KRW-BTC 로 오매핑하지 않도록 통화를 먼저 확인한다.
 * - 실패·타임아웃·형식 오류는 모두 empty 로 흡수해 저장값을 유지한다(예외 금지).
 * - 메모리 캐시: 성공 10분, 실패 2분 (key=market). 화면 진입·로그인 반복 호출을 막는다.
 */
@Component
public class UpbitQuoteService implements CryptoQuoteService {

    private static final String ENDPOINT = "https://api.upbit.com/v1/ticker";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration SUCCESS_TTL = Duration.ofMinutes(10);
    private static final Duration EMPTY_TTL = Duration.ofMinutes(2);
    private static final String USER_AGENT = "Mozilla/5.0 (AssetFlow)";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ObjectMapper mapper;
    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

    private record CacheEntry(Optional<QuoteService.Quote> value, Instant expiresAt) {}

    public UpbitQuoteService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<QuoteService.Quote> quote(String symbol, String currency) {
        if (symbol == null || symbol.isBlank()) return Optional.empty();
        // 업비트는 KRW 마켓만 조회한다 — USD 보유는 USDT 페어로 오매핑하지 않고 건너뛴다.
        if (currency == null || !"KRW".equalsIgnoreCase(currency.trim())) return Optional.empty();
        String market = "KRW-" + symbol.trim().toUpperCase(Locale.ROOT);
        return cached(market, () -> fetchTicker(symbol.trim(), market));
    }

    private Optional<QuoteService.Quote> cached(String market,
                                                java.util.function.Supplier<Optional<QuoteService.Quote>> loader) {
        CacheEntry entry = cache.get(market);
        if (entry != null && entry.expiresAt().isAfter(Instant.now())) {
            return entry.value();
        }
        Optional<QuoteService.Quote> loaded = loader.get();
        cache.put(market, new CacheEntry(loaded,
                Instant.now().plus(loaded.isPresent() ? SUCCESS_TTL : EMPTY_TTL)));
        return loaded;
    }

    private Optional<QuoteService.Quote> fetchTicker(String symbol, String market) {
        try {
            HttpRequest request = HttpRequest.newBuilder(
                            URI.create(ENDPOINT + "?markets=" + market))
                    .timeout(REQUEST_TIMEOUT)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body() == null || response.body().isBlank()) {
                return Optional.empty();
            }
            return parseTicker(symbol, market, response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    /**
     * 업비트 ticker 응답 파싱 (HTTP 없이 테스트 가능하게 분리).
     * 배열이 아니거나 비었으면 empty. {@code trade_price} 가 0 이하이거나 없으면 empty.
     */
    Optional<QuoteService.Quote> parseTicker(String symbol, String market, String body) {
        if (body == null || body.isBlank()) return Optional.empty();
        try {
            JsonNode root = mapper.readTree(body);
            if (!root.isArray() || root.isEmpty()) return Optional.empty();
            JsonNode ticker = root.get(0);
            BigDecimal price = parseNumber(ticker.get("trade_price"));
            if (price == null || price.signum() <= 0) return Optional.empty();
            String priceAsOf = kstDate(ticker.path("trade_date_kst").asText(null));
            return Optional.of(new QuoteService.Quote(symbol, market, symbol, "KRW", price, priceAsOf));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private static BigDecimal parseNumber(JsonNode node) {
        if (node == null || node.isNull()) return null;
        String text = node.isNumber() ? node.decimalValue().toPlainString() : node.asText(null);
        if (text == null || text.isBlank()) return null;
        try {
            return new BigDecimal(text.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 업비트 trade_date_kst 는 YYYYMMDD(KST) — 화면 계약은 YYYY-MM-DD. */
    private static String kstDate(String raw) {
        if (raw == null || !raw.matches("\\d{8}")) return null;
        try {
            return LocalDate.parse(raw, DateTimeFormatter.BASIC_ISO_DATE).toString();
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
