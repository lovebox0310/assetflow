package com.assetflow.investments.kis;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

/**
 * §62 한국투자증권 REST API 공통 호출 계약.
 * 구현체는 authorization/appkey/appsecret/tr_id 등 공통 헤더를 채운다.
 */
public interface KisApiClient {

    JsonNode get(KisCredentials credentials, String path, Map<String, String> params, String trId);

    JsonNode post(KisCredentials credentials, String path, Map<String, String> params, Object body, String trId);
}
