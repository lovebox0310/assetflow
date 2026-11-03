package com.assetflow.assets.bank;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * bankapi.co.kr 빠른조회 API 클라이언트 (§61).
 *
 * - 엔드포인트: {@code POST {base-url}/v1/transactions}
 * - 인증: {@code Authorization: Bearer {apiKey}:{secretKey}}
 * - 응답: 200 이어도 {@code success:false} 면 실패다 — 반드시 success 를 본다.
 *
 * 키가 없으면 조용히 실패하지 않고 {@code BANK_NOT_CONFIGURED} 로 알린다 —
 * "왜 잔액이 안 바뀌지" 를 화면에서 바로 알 수 있게 한다.
 * 이 API 는 국내 IP 에서만 호출된다(해외 배포는 403). 서버 위치는 §61 참고.
 */
@Component
public class BankApiClient implements BankInquiryClient {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(75);

    private final ObjectMapper mapper;
    private final String apiKey;
    private final String secretKey;
    private final String baseUrl;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            .build();

    public BankApiClient(ObjectMapper mapper,
                         @Value("${app.bank.api-key:}") String apiKey,
                         @Value("${app.bank.secret-key:}") String secretKey,
                         @Value("${app.bank.base-url:https://api.bankapi.co.kr}") String baseUrl) {
        this.mapper = mapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.secretKey = secretKey == null ? "" : secretKey.trim();
        this.baseUrl = baseUrl == null || baseUrl.isBlank()
                ? "https://api.bankapi.co.kr"
                : baseUrl.replaceAll("/+$", "");
    }

    @Override
    public BankQueryResult query(BankQuery query) {
        if (apiKey.isBlank() || secretKey.isBlank()) {
            throw new BankApiException("BANK_NOT_CONFIGURED",
                    "은행 조회 API 키가 설정되지 않았습니다. 서버에 BANK_API_KEY·BANK_SECRET_KEY 를 설정해 주세요.");
        }

        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/v1/transactions"))
                .timeout(REQUEST_TIMEOUT)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("Authorization", "Bearer " + apiKey + ":" + secretKey)
                .POST(HttpRequest.BodyPublishers.ofString(body(query)))
                .build();

        HttpResponse<String> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BankApiException("BANK_UNAVAILABLE", "은행 조회 요청이 중단되었습니다. 다시 시도해 주세요.");
        } catch (Exception e) {
            throw new BankApiException("BANK_UNAVAILABLE",
                    "은행 조회 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }

        return parse(response);
    }

    private String body(BankQuery query) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("bankCode", query.bankCode().name());
        payload.put("accountNumber", query.accountNumber());
        payload.put("accountPassword", query.accountPassword());
        payload.put("residentNumber", query.residentNumber());
        payload.put("accountType", query.accountType());
        payload.put("startDate", query.startDate());
        payload.put("endDate", query.endDate());
        try {
            return mapper.writeValueAsString(payload);
        } catch (Exception e) {
            throw new IllegalStateException("failed to serialize bank query", e);
        }
    }

    private BankQueryResult parse(HttpResponse<String> response) {
        JsonNode root = null;
        if (response.body() != null && !response.body().isBlank()) {
            try {
                root = mapper.readTree(response.body());
            } catch (Exception ignored) {
                root = null;
            }
        }

        if (root == null || !root.isObject()) {
            throw new BankApiException(defaultCode(response.statusCode()),
                    "은행 조회 서버가 예상하지 못한 응답을 보냈습니다. (HTTP " + response.statusCode() + ")");
        }

        boolean success = root.path("success").asBoolean(false);
        if (!success || response.statusCode() >= 400) {
            String code = text(root, "code");
            if (code.isBlank()) code = defaultCode(response.statusCode());
            String message = text(root, "message");
            if (message.isBlank()) message = text(root, "error");
            if (message.isBlank()) message = "은행 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.";
            long retryAfterSec = root.path("retryAfterSec").asLong(0L);
            throw new BankApiException(code, message, retryAfterSec);
        }

        JsonNode info = root.path("accountInfo");
        JsonNode balanceNode = info.path("balance");
        if (info.isMissingNode() || info.isNull() || balanceNode.isMissingNode() || balanceNode.isNull()) {
            throw new BankApiException("BANK_UNAVAILABLE",
                    "은행 응답에 잔액이 없습니다. 잠시 후 다시 시도해 주세요.");
        }

        List<BankTransaction> transactions = new ArrayList<>();
        JsonNode rows = root.path("transactions");
        if (rows.isArray()) {
            for (JsonNode row : rows) {
                transactions.add(transaction(row));
            }
        }

        return new BankQueryResult(
                text(info, "accountNumber"),
                asLong(balanceNode),
                blankToNull(text(info, "accountName")),
                blankToNull(text(info, "accountHolder")),
                List.copyOf(transactions),
                Instant.now());
    }

    private static BankTransaction transaction(JsonNode row) {
        return new BankTransaction(
                text(row, "date"),
                text(row, "time"),
                text(row, "description"),
                text(row, "displayName"),
                text(row, "counterparty"),
                asLong(row.path("amount")),
                asLong(row.path("balance")),
                text(row, "type"),
                text(row, "branch"),
                text(row, "memo"));
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isMissingNode() || value.isNull() ? "" : value.asText("");
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** 금액은 숫자 또는 "1,234" 문자열로 올 수 있다. */
    private static long asLong(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return 0L;
        if (node.isNumber()) return node.asLong();
        String raw = node.asText("").replace(",", "").trim();
        if (raw.isEmpty()) return 0L;
        try {
            return new BigDecimal(raw).longValue();
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static String defaultCode(int status) {
        return switch (status) {
            case 400 -> "INVALID_REQUEST";
            case 401 -> "UNAUTHORIZED";
            case 429 -> "TOO_MANY_REQUESTS";
            default -> status >= 500 ? "CRAWLER_UNAVAILABLE" : "UNKNOWN";
        };
    }
}
