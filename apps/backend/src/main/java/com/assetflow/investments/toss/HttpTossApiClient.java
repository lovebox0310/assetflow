package com.assetflow.investments.toss;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * 토스증권 Open API 실제 HTTP 클라이언트 (이슈 #55 Stage 2).
 *
 * <p>스펙(OpenAPI JSON 확인):</p>
 * <ul>
 *   <li>{@code POST /oauth2/token} — form-urlencoded {@code grant_type=client_credentials},
 *       {@code client_id}, {@code client_secret} → {@code {access_token, token_type, expires_in}}</li>
 *   <li>{@code GET /api/v1/accounts} — Bearer → {@code {result:[{accountNo, accountSeq, accountType}]}}</li>
 *   <li>{@code GET /api/v1/holdings} — Bearer + {@code X-Tossinvest-Account: {accountSeq}}</li>
 *   <li>{@code GET /api/v1/exchange-rate} — Bearer → {@code {result:{baseCurrency,quoteCurrency,rate}}}</li>
 * </ul>
 *
 * <p>오류 envelope 는 {@code {"error":{requestId, code, message, data}}} 이며 code 를
 * {@link TossApiException} 으로 넘긴다(문구는 {@link TossErrorMessages}).</p>
 *
 * <p>규칙:</p>
 * <ul>
 *   <li>토큰은 {@link TossTokenCache} 로 자격증명(client_id)당 1개만 유지하고 만료 60초 전 재발급.
 *       토스는 재발급 시 이전 토큰을 무효화하므로 동시 요청에서도 발급은 1회여야 한다.</li>
 *   <li>401({@code invalid-token}/{@code expired-token}/{@code token-revoked}) → 캐시를 교체하고
 *       <b>1회만</b> 재시도한다.</li>
 *   <li>429 → {@code Retry-After} 만큼 1회 대기 후 1회 재시도.</li>
 *   <li>403 {@code ip-not-allowed} 는 코드 그대로 올린다(안내 문구는 TossErrorMessages).</li>
 *   <li>키·토큰·Authorization 헤더는 로그에 남기지 않는다(로그 자체를 쓰지 않는다).</li>
 * </ul>
 *
 * <p>{@code app.toss.enabled=true} 일 때만 빈으로 등록된다 — 꺼져 있으면
 * {@link TossApiClientFallback} 이 503 을 돌려준다.</p>
 */
@Component
@ConditionalOnProperty(prefix = "app.toss", name = "enabled", havingValue = "true")
public class HttpTossApiClient implements TossApiClient {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(10);
    private static final String USER_AGENT = "AssetFlow";
    private static final String TOKEN_PATH = "/oauth2/token";
    private static final String ACCOUNTS_PATH = "/api/v1/accounts";
    private static final String HOLDINGS_PATH = "/api/v1/holdings";
    private static final String EXCHANGE_RATE_PATH = "/api/v1/exchange-rate";
    /** Retry-After 가 비정상적으로 길어도 요청을 오래 붙잡지 않는다. */
    private static final long MAX_RETRY_AFTER_SECONDS = 10;
    private static final long DEFAULT_EXPIRES_IN_SECONDS = 3600;

    private final ObjectMapper mapper;
    private final TossProperties properties;
    private final TossTokenCache tokenCache;
    private final HttpClient http;

    /**
     * Spring 주입용. 생성자가 둘이라(테스트용 파싱 생성자와 구분) {@code @Autowired} 로
     * 이 생성자를 명시한다 — 없으면 Spring 이 기본 생성자를 찾다가 부팅이 실패한다.
     */
    @Autowired
    public HttpTossApiClient(ObjectMapper mapper, TossProperties properties) {
        this(mapper, properties, new TossTokenCache(),
                HttpClient.newBuilder()
                        .connectTimeout(CONNECT_TIMEOUT)
                        .followRedirects(HttpClient.Redirect.NORMAL)
                        .build());
    }

    /** 테스트용 — 파싱만 검증할 때 HttpClient 를 만들지 않도록 열어 둔다. */
    HttpTossApiClient(ObjectMapper mapper, TossProperties properties, TossTokenCache tokenCache,
                      HttpClient http) {
        this.mapper = mapper;
        this.properties = properties;
        this.tokenCache = tokenCache;
        this.http = http;
    }

    @Override
    public void verify(TossCredentials credentials) {
        get(ACCOUNTS_PATH, credentials, null);
    }

    @Override
    public List<TossAccount> accounts(TossCredentials credentials) {
        return parseAccounts(get(ACCOUNTS_PATH, credentials, null));
    }

    @Override
    public TossHoldings holdings(TossCredentials credentials) {
        String seq = credentials.tossAccountSeq();
        if (seq == null || seq.isBlank()) {
            throw new IllegalArgumentException("toss account seq is required");
        }
        return parseHoldings(get(HOLDINGS_PATH, credentials, seq.trim()));
    }

    @Override
    public BigDecimal usdKrwRate(TossCredentials credentials) {
        return parseUsdKrwRate(get(EXCHANGE_RATE_PATH, credentials, null));
    }

    // ---------------------------------------------------------------- HTTP

    /** Bearer GET. 401 은 토큰 캐시를 갱신해 1회만 재시도한다. */
    private String get(String path, TossCredentials credentials, String accountSeq) {
        boolean retriedToken = false;
        while (true) {
            TossToken token = tokenCache.token(credentials.clientId(), credentials.clientSecret(),
                    this::requestToken);
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl() + path))
                    .timeout(REQUEST_TIMEOUT)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "application/json")
                    .header("Authorization", token.authorization())
                    .GET();
            if (accountSeq != null) {
                builder.header("X-Tossinvest-Account", accountSeq);
            }
            HttpResponse<String> response = sendWithRateLimitRetry(builder.build());
            if (response.statusCode() == 200) {
                return response.body();
            }
            if (response.statusCode() == 401 && !retriedToken) {
                // 이전 토큰은 이제 무효다 — 캐시를 교체하고 1회만 다시 부른다.
                tokenCache.invalidate(credentials.clientId());
                retriedToken = true;
                continue;
            }
            throw new TossApiException(errorCode(response.statusCode(), response.body()));
        }
    }

    /** 토큰 발급. 실패는 {@link TossApiException}. 응답의 access_token 은 로그에 남기지 않는다. */
    private TossToken requestToken(String clientId, String clientSecret) {
        String form = "grant_type=client_credentials"
                + "&client_id=" + encode(clientId)
                + "&client_secret=" + encode(clientSecret);
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl() + TOKEN_PATH))
                .timeout(REQUEST_TIMEOUT)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "application/json")
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = sendWithRateLimitRetry(request);
        if (response.statusCode() != 200) {
            throw new TossApiException(errorCode(response.statusCode(), response.body()));
        }
        JsonNode node = readTree(response.body());
        String accessToken = text(node, "access_token");
        if (accessToken == null) {
            throw new TossApiException("invalid-token");
        }
        long expiresIn = longValue(node.get("expires_in"), DEFAULT_EXPIRES_IN_SECONDS);
        if (expiresIn <= 0) {
            expiresIn = DEFAULT_EXPIRES_IN_SECONDS;
        }
        return new TossToken(accessToken, text(node, "token_type"),
                Instant.now().plusSeconds(expiresIn));
    }

    /** 429 는 Retry-After 만큼 1회 대기 후 1회 재시도한다. */
    private HttpResponse<String> sendWithRateLimitRetry(HttpRequest request) {
        HttpResponse<String> response = send(request);
        if (response.statusCode() == 429) {
            sleep(retryAfterMillis(response));
            response = send(request);
        }
        return response;
    }

    private HttpResponse<String> send(HttpRequest request) {
        try {
            return http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new TossApiException("interrupted", e);
        } catch (IOException e) {
            // IOException 메시지에 URL 이 섞일 수 있어 그대로 노출하지 않는다.
            throw new TossApiException("unreachable", e);
        }
    }

    private static void sleep(long millis) {
        if (millis <= 0) {
            return;
        }
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new TossApiException("interrupted", e);
        }
    }

    private static long retryAfterMillis(HttpResponse<?> response) {
        long seconds = response.headers().firstValue("Retry-After")
                .map(value -> parseLong(value.trim(), 1L))
                .orElse(1L);
        seconds = Math.max(0, Math.min(seconds, MAX_RETRY_AFTER_SECONDS));
        return seconds * 1000L;
    }

    private String baseUrl() {
        String base = properties.getBaseUrl();
        if (base == null || base.isBlank()) {
            return "https://openapi.tossinvest.com";
        }
        String trimmed = base.trim();
        return trimmed.endsWith("/") ? trimmed.substring(0, trimmed.length() - 1) : trimmed;
    }

    // -------------------------------------------------------------- parsing

    /**
     * 오류 코드. envelope {@code {"error":{"code":...}}} 의 code 를 쓰고,
     * 형식이 다르면 {@code http-<status>} 로 대체한다(코드 문자열은 화면에 그대로 노출하지 않는다).
     */
    String errorCode(int status, String body) {
        if (body != null && !body.isBlank()) {
            try {
                String code = text(mapper.readTree(body).path("error"), "code");
                if (code != null) {
                    return code;
                }
            } catch (Exception ignored) {
                // 본문이 JSON 이 아니면 상태 기반 코드를 쓴다.
            }
        }
        return "http-" + status;
    }

    /** {@code {"result":[...]}} 파싱. 배열이 아니면 빈 목록(손상으로 단정하지 않는다). */
    List<TossAccount> parseAccounts(String body) {
        List<TossAccount> accounts = new ArrayList<>();
        JsonNode result = result(body);
        if (result == null || !result.isArray()) {
            return accounts;
        }
        for (JsonNode node : result) {
            accounts.add(new TossAccount(
                    text(node, "accountNo"),
                    integer(node.get("accountSeq")),
                    text(node, "accountType")));
        }
        return accounts;
    }

    /** {@code {"result":{...}}} 파싱. items 가 없으면 빈 리스트다. */
    TossHoldings parseHoldings(String body) {
        JsonNode result = result(body);
        if (result == null || result.isNull()) {
            return new TossHoldings(List.of(), null, null);
        }
        List<TossHolding> items = new ArrayList<>();
        JsonNode nodes = result.path("items");
        if (nodes.isArray()) {
            for (JsonNode node : nodes) {
                items.add(new TossHolding(
                        text(node, "symbol"),
                        text(node, "name"),
                        text(node, "marketCountry"),
                        text(node, "currency"),
                        decimal(node.get("quantity")),
                        decimal(node.get("lastPrice")),
                        decimal(node.get("averagePurchasePrice")),
                        decimal(node.path("marketValue").get("amount")),
                        decimal(node.path("profitLoss").get("amount")),
                        decimal(node.path("profitLoss").get("rate"))));
            }
        }
        return new TossHoldings(items,
                decimal(result.path("totalPurchaseAmount").get("krw")),
                decimal(result.path("marketValue").path("amount").get("krw")));
    }

    /** {@code {"result":{"rate":"1380.5"}}} 파싱. 값이 없으면 예외(동기화는 warning 으로 낮춘다). */
    BigDecimal parseUsdKrwRate(String body) {
        JsonNode result = result(body);
        BigDecimal rate = result == null ? null : decimal(result.get("rate"));
        if (rate == null || rate.signum() <= 0) {
            throw new TossApiException("invalid-exchange-rate");
        }
        return rate;
    }

    private JsonNode result(String body) {
        JsonNode root = readTree(body);
        if (root == null) {
            return null;
        }
        JsonNode result = root.get("result");
        if (result == null || result.isMissingNode()) {
            throw new TossApiException("invalid-response");
        }
        return result;
    }

    private JsonNode readTree(String body) {
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            return mapper.readTree(body);
        } catch (Exception e) {
            throw new TossApiException("invalid-response", e);
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText("").trim();
        return text.isEmpty() ? null : text;
    }

    /** 토스는 숫자를 문자열로 준다. 숫자 타입도 허용한다. 값이 없으면 null. */
    private static BigDecimal decimal(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String text = node.isNumber() ? node.decimalValue().toPlainString() : node.asText("").trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return new BigDecimal(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Integer integer(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.asInt();
        }
        String text = node.asText("").trim();
        if (text.isEmpty()) {
            return null;
        }
        try {
            return Integer.valueOf(text);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static long longValue(JsonNode node, long fallback) {
        if (node == null || node.isNull()) {
            return fallback;
        }
        if (node.isNumber()) {
            return node.asLong(fallback);
        }
        return parseLong(node.asText("").trim(), fallback);
    }

    private static long parseLong(String text, long fallback) {
        try {
            return Long.parseLong(text);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }
}
