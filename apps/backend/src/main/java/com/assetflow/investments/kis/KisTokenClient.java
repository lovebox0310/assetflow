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
            throw new KisApiException("KIS token request failed: " + e.getStatusText(), e);
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
