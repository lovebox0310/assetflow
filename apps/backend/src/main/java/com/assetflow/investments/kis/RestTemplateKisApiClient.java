package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Map;

/**
 * §62 RestTemplate 기반 KIS API 클라이언트.
 * - Authorization: Bearer {access_token}
 * - appkey, appsecret, tr_id, custtype 헤더 자동 첨부
 * - 2xx 가 아니거나 rt_cd != "0" 이면 KisApiException
 */
@Component
public class RestTemplateKisApiClient implements KisApiClient {

    private static final String CUST_TYPE = "P";

    private final KisTokenClient tokenClient;
    private final RestTemplate restTemplate;
    private final ObjectMapper mapper;

    public RestTemplateKisApiClient(KisTokenClient tokenClient, ObjectMapper mapper) {
        this.tokenClient = tokenClient;
        this.mapper = mapper;
        this.restTemplate = new RestTemplate();
    }

    @Override
    public JsonNode get(KisCredentials credentials, String path, Map<String, String> params, String trId) {
        String url = buildUrl(credentials, path, params);
        HttpEntity<Void> request = new HttpEntity<>(headers(credentials, trId));
        return exchange(url, HttpMethod.GET, request);
    }

    @Override
    public JsonNode post(KisCredentials credentials, String path, Map<String, String> params, Object body, String trId) {
        String url = buildUrl(credentials, path, params);
        HttpEntity<Object> request = new HttpEntity<>(body, headers(credentials, trId));
        return exchange(url, HttpMethod.POST, request);
    }

    private String buildUrl(KisCredentials credentials, String path, Map<String, String> params) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(credentials.effectiveBaseUrl("https://openapivts.koreainvestment.com:29443") + path);
        if (params != null) {
            params.forEach(builder::queryParam);
        }
        return builder.toUriString();
    }

    private HttpHeaders headers(KisCredentials credentials, String trId) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(tokenClient.accessToken(credentials));
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("appkey", credentials.appKey());
        headers.set("appsecret", credentials.appSecret());
        headers.set("tr_id", trId);
        headers.set("custtype", CUST_TYPE);
        return headers;
    }

    private JsonNode exchange(String url, HttpMethod method, HttpEntity<?> request) {
        try {
            ResponseEntity<String> response = restTemplate.exchange(url, method, request, String.class);
            JsonNode node = mapper.readTree(response.getBody());
            String rtCd = node.path("rt_cd").asText("0");
            if (!"0".equals(rtCd)) {
                String msg = node.path("msg1").asText("KIS API returned rt_cd=" + rtCd);
                throw new KisApiException(msg);
            }
            return node;
        } catch (RestClientResponseException e) {
            throw new KisApiException("KIS API request failed: " + e.getStatusText(), e);
        } catch (KisApiException e) {
            throw e;
        } catch (Exception e) {
            throw new KisApiException("KIS API request failed: " + url, e);
        }
    }
}
