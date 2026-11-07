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
    /** §69.2 KIS 게이트웨이가 기본 Java UA를 거부하는 사례가 있어 브라우저 형태로 보낸다. */
    private static final String USER_AGENT = "Mozilla/5.0 (compatible; AssetFlow/1.0)";

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
        headers.set(HttpHeaders.USER_AGENT, USER_AGENT);
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
            // KIS 는 rt_cd!=0 을 HTTP 4xx/5xx 로도 돌려주며, **원인은 body 에만**
            // 들어있다. 상태 텍스트("Internal Server Error")만 보내면 사용자는
            // "모의투자 앱키로 실전 도메인 호출" 같은 실제 사유를 볼 수 없다.
            String reason = KisErrorMessages.describe(e.getResponseBodyAsString());
            throw new KisApiException("KIS API request failed: "
                    + (reason.isEmpty() ? e.getStatusText() : reason), e);
        } catch (KisApiException e) {
            throw e;
        } catch (Exception e) {
            throw new KisApiException("KIS API request failed: " + url, e);
        }
    }
}
