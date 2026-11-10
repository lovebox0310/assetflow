package com.assetflow.investments.upbit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * 업비트 {@code GET /v1/accounts} 클라이언트 (UPBIT-2).
 *
 * - JWT HS256({@link UpbitJwt})을 Authorization: Bearer 로 보낸다. 쿼리가 없어 query_hash 는 없다.
 * - connect 3s / request 7s. User-Agent 지정.
 * - 4xx/5xx 는 {@link UpbitApiException}(status, code) 로 던진다.
 * - 키·JWT·Authorization 헤더는 로그에 남기지 않는다.
 */
@Component
public class HttpUpbitAccountClient implements UpbitAccountClient {

    private static final String ENDPOINT = "https://api.upbit.com/v1/accounts";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(7);
    private static final String USER_AGENT = "Mozilla/5.0 (AssetFlow)";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ObjectMapper mapper;
    private final UpbitJwt jwt;

    public HttpUpbitAccountClient(ObjectMapper mapper, UpbitJwt jwt) {
        this.mapper = mapper;
        this.jwt = jwt;
    }

    @Override
    public List<UpbitAccount> accounts(UpbitCredentials creds) {
        String token = jwt.create(creds.accessKey(), creds.secretKey(), "");
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(ENDPOINT))
                    .timeout(REQUEST_TIMEOUT)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "application/json")
                    .header("Authorization", "Bearer " + token)
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw error(response.statusCode(), response.body());
            }
            return parseAccounts(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new UpbitApiException(0, "UPBIT_INTERRUPTED", "upbit request was interrupted");
        } catch (UpbitApiException e) {
            throw e;
        } catch (Exception e) {
            // IOException(타임아웃 포함) — 원인 문자열에 키가 섞일 수 있어 그대로 노출하지 않는다.
            throw new UpbitApiException(0, "UPBIT_UNAVAILABLE", "upbit is unreachable");
        }
    }

    /**
     * 응답 배열 파싱 (HTTP 없이 테스트 가능). 배열이 아니거나 형식이 깨졌으면 빈 목록.
     * 숫자는 JSON number/string 모두 허용한다.
     */
    List<UpbitAccount> parseAccounts(String body) {
        List<UpbitAccount> accounts = new ArrayList<>();
        if (body == null || body.isBlank()) return accounts;
        try {
            JsonNode root = mapper.readTree(body);
            if (root == null || !root.isArray()) return accounts;
            for (JsonNode node : root) {
                accounts.add(new UpbitAccount(
                        node.path("currency").asText(""),
                        decimal(node.get("balance")),
                        decimal(node.get("locked")),
                        decimal(node.get("avg_buy_price")),
                        node.path("unit_currency").asText("KRW")));
            }
        } catch (Exception e) {
            return List.of();
        }
        return accounts;
    }

    private UpbitApiException error(int status, String body) {
        String code = "UPBIT_HTTP_" + status;
        String message = "upbit request failed with HTTP " + status;
        try {
            JsonNode error = mapper.readTree(body == null ? "" : body).path("error");
            String name = error.path("name").asText("");
            String errorMessage = error.path("message").asText("");
            if (!name.isBlank()) code = name;
            if (!errorMessage.isBlank()) message = errorMessage;
        } catch (Exception ignored) {
            // 본문이 JSON 이 아니면 상태 기반 코드/메시지를 유지한다.
        }
        return new UpbitApiException(status, code, message);
    }

    private static BigDecimal decimal(JsonNode node) {
        if (node == null || node.isNull()) return BigDecimal.ZERO;
        String text = node.isNumber() ? node.decimalValue().toPlainString() : node.asText("");
        if (text.isBlank()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(text.trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }
}
