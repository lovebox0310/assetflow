package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * §62 한국투자증권 접근토큰 발급·캐싱.
 *
 * <p>계좌별 appKey/appSecret/baseUrl 조합마다 별도 토큰을 관리한다.</p>
 */
@Component
public class KisTokenClient {

    private static final String TOKEN_PATH = "/oauth2/tokenP";
    private static final int RENEW_MARGIN_SECONDS = 600;
    /**
     * §69.2 KIS 게이트웨이는 기본 Java/Python User-Agent(예: {@code Java/21.0.x})를
     * 403 EGW00002 로 거부하는 사례가 보고돼 있다. 공식 문서에는 없는 제약이라
     * 토큰 요청에만 브라우저 형태의 UA를 명시한다.
     */
    private static final String USER_AGENT = "Mozilla/5.0 (compatible; AssetFlow/1.0)";

    private final KisProperties properties;
    private final RestTemplate restTemplate;
    private final ObjectMapper mapper;

    private final Map<String, Token> tokens = new ConcurrentHashMap<>();

    public KisTokenClient(KisProperties properties, ObjectMapper mapper) {
        this.properties = properties;
        this.mapper = mapper;
        this.restTemplate = new RestTemplate();
    }

    public String accessToken(KisCredentials credentials) {
        if (!properties.isEnabled()) {
            throw new KisNotConfiguredException("KIS is not enabled");
        }
        if (!credentials.hasCredentials()) {
            throw new KisNotConfiguredException("KIS appkey/appsecret is not configured for account " + credentials.accountId());
        }
        String cacheKey = cacheKey(credentials);
        Token token = tokens.get(cacheKey);
        if (token != null && token.isValidWithMargin(RENEW_MARGIN_SECONDS)) {
            return token.value();
        }
        Token fetched = fetchToken(credentials);
        tokens.put(cacheKey, fetched);
        return fetched.value();
    }

    private Token fetchToken(KisCredentials credentials) {
        String url = credentials.effectiveBaseUrl(properties.getBaseUrl()) + TOKEN_PATH;
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set(HttpHeaders.USER_AGENT, USER_AGENT);
        Map<String, String> body = Map.of(
                "grant_type", "client_credentials",
                "appkey", credentials.appKey(),
                "appsecret", credentials.appSecret());
        HttpEntity<Map<String, String>> request = new HttpEntity<>(body, headers);
        try {
            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);
            JsonNode node = mapper.readTree(response.getBody());
            String accessToken = node.path("access_token").asText(null);
            if (accessToken == null || accessToken.isBlank()) {
                throw new KisApiException("KIS token response missing access_token: " + response.getBody());
            }
            int expiresIn = node.path("expires_in").asInt(properties.getTokenExpirySeconds());
            return new Token(accessToken, Instant.now().plusSeconds(expiresIn));
        } catch (RestClientResponseException e) {
            // 상태 텍스트("Forbidden")만 던지면 EGW00002·EGW02004 같은 실제 사유를
            // 사용자가 알 수 없다. KIS 본문의 error_code/error_description 을 붙인다.
            String reason = KisErrorMessages.describe(e.getResponseBodyAsString());
            throw new KisApiException("KIS token request failed: "
                    + (reason.isEmpty() ? e.getStatusText() : reason), e);
        } catch (KisApiException e) {
            throw e;
        } catch (Exception e) {
            throw new KisApiException("KIS token request failed", e);
        }
    }

    private String cacheKey(KisCredentials credentials) {
        return credentials.appKey() + "|" + credentials.appSecret() + "|" + credentials.effectiveBaseUrl(properties.getBaseUrl());
    }

    private record Token(String value, Instant expiresAt) {
        boolean isValidWithMargin(int marginSeconds) {
            return Instant.now().plusSeconds(marginSeconds).isBefore(expiresAt);
        }
    }
}
