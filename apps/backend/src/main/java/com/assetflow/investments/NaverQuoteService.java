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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 네이버 금융 공개 JSON 을 읽는 {@link QuoteService} 구현 (§54.4).
 *
 * - 국내 종목: {@code https://m.stock.naver.com/api/stock/{6자리}/basic}
 * - 해외 종목: {@code https://api.stock.naver.com/stock/{심볼}.{거래소}/basic}
 *   거래소 접미사는 .O(NASDAQ) → .N(NYSE) → .A(AMEX) 순으로 시도한다.
 * - 환율: {@code https://api.stock.naver.com/marketindex/exchange/FX_USDKRW}
 *
 * 호출 실패·타임아웃·형식 오류는 모두 empty 로 흡수한다. 결과는 메모리에 캐시해
 * 로그인·화면 진입 때 반복 호출해도 네이버를 두들기지 않는다(성공 10분, 실패 2분).
 */
@Component
public class NaverQuoteService implements QuoteService {

    private static final String KR_BASIC = "https://m.stock.naver.com/api/stock/%s/basic";
    private static final String WORLD_BASIC = "https://api.stock.naver.com/stock/%s/basic";
    private static final String FX_USD_KRW = "https://api.stock.naver.com/marketindex/exchange/FX_USDKRW";

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration SUCCESS_TTL = Duration.ofMinutes(10);
    private static final Duration EMPTY_TTL = Duration.ofMinutes(2);
    /** 해외 심볼 접미사 — 네이버는 거래소 코드를 붙인 심볼만 안다. */
    private static final List<String> WORLD_SUFFIXES = List.of(".O", ".N", ".A");

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ObjectMapper mapper;
    private final Map<String, CacheEntry<Quote>> quoteCache = new ConcurrentHashMap<>();
    private final Map<String, CacheEntry<FxRate>> fxCache = new ConcurrentHashMap<>();

    private record CacheEntry<T>(Optional<T> value, Instant expiresAt) {}

    public NaverQuoteService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Optional<Quote> quote(String symbol) {
        if (symbol == null || symbol.isBlank()) return Optional.empty();
        String key = symbol.trim().toUpperCase(Locale.ROOT);
        return cached(quoteCache, key, SUCCESS_TTL, EMPTY_TTL, () -> fetchQuote(key));
    }

    @Override
    public Optional<FxRate> fxRate(String currency) {
        if (currency == null || !"USD".equalsIgnoreCase(currency.trim())) {
            return Optional.empty();
        }
        return cached(fxCache, "USD", SUCCESS_TTL, EMPTY_TTL, this::fetchUsdKrw);
    }

    private <T> Optional<T> cached(Map<String, CacheEntry<T>> cache, String key,
                                   Duration hitTtl, Duration emptyTtl,
                                   java.util.function.Supplier<Optional<T>> loader) {
        CacheEntry<T> entry = cache.get(key);
        if (entry != null && entry.expiresAt().isAfter(Instant.now())) {
            return entry.value();
        }
        Optional<T> loaded = loader.get();
        cache.put(key, new CacheEntry<>(loaded, Instant.now().plus(loaded.isPresent() ? hitTtl : emptyTtl)));
        return loaded;
    }

    private Optional<Quote> fetchQuote(String symbol) {
        for (String candidate : candidates(symbol)) {
            Optional<JsonNode> node = fetchJson(basicUrl(candidate));
            if (node.isEmpty()) continue;
            JsonNode body = node.get();
            BigDecimal price = parseNumber(body.path("closePrice").asText(null));
            if (price == null || price.signum() <= 0) continue;
            String currency = body.path("currencyType").path("code").asText("KRW");
            if (currency.isBlank()) currency = "KRW";
            String name = body.path("stockName").asText(symbol);
            String quoteSymbol = body.path("reutersCode").asText(candidate);
            return Optional.of(new Quote(symbol, quoteSymbol, name, currency.toUpperCase(Locale.ROOT),
                    price, dateOf(body.path("localTradedAt").asText(null))));
        }
        return Optional.empty();
    }

    private Optional<FxRate> fetchUsdKrw() {
        Optional<JsonNode> node = fetchJson(FX_USD_KRW);
        if (node.isEmpty()) return Optional.empty();
        JsonNode info = node.get().path("exchangeInfo");
        BigDecimal rate = parseNumber(info.path("closePrice").asText(null));
        if (rate == null || rate.signum() <= 0) return Optional.empty();
        return Optional.of(new FxRate("USD", rate, dateOf(info.path("localTradedAt").asText(null))));
    }

    /** 국내는 6자리 코드, 해외는 거래소 접미사가 붙은 심볼만 네이버가 인식한다. */
    private static List<String> candidates(String symbol) {
        if (symbol.matches("\\d{6}")) return List.of(symbol);
        if (symbol.contains(".")) return List.of(symbol);
        return WORLD_SUFFIXES.stream().map(symbol::concat).toList();
    }

    private static String basicUrl(String candidate) {
        return candidate.matches("\\d{6}")
                ? KR_BASIC.formatted(candidate)
                : WORLD_BASIC.formatted(candidate);
    }

    private Optional<JsonNode> fetchJson(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(REQUEST_TIMEOUT)
                    .header("User-Agent", "Mozilla/5.0 (AssetFlow)")
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200 || response.body() == null || response.body().isBlank()) {
                return Optional.empty();
            }
            JsonNode node = mapper.readTree(response.body());
            // 네이버 오류는 200 + {"code":"StockConflict"} 로 올 때가 있다.
            if (node.hasNonNull("closePrice") || node.has("exchangeInfo")) {
                return Optional.of(node);
            }
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception e) {
            // 시세는 보조값이다 — 실패해도 저장된 현재가를 쓴다.
            return Optional.empty();
        }
    }

    /** "244,000" / "347.10" / "1,339.00" → BigDecimal. */
    private static BigDecimal parseNumber(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return new BigDecimal(raw.replace(",", "").trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String dateOf(String tradedAt) {
        if (tradedAt != null && tradedAt.length() >= 10) {
            return tradedAt.substring(0, 10);
        }
        return LocalDate.now().toString();
    }
}
