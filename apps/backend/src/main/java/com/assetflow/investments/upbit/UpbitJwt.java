package com.assetflow.investments.upbit;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 업비트 Open API JWT 생성 (UPBIT-2).
 *
 * <p>HS256. payload 는 {@code access_key, nonce} 이고, 쿼리스트링이 있으면
 * {@code query_hash(SHA-512 hex), query_hash_alg} 를 더한다. 서명은
 * {@code base64url(header.payload)} 를 secret 으로 HMAC-SHA256 한 값이며
 * base64url 패딩은 붙이지 않는다.</p>
 *
 * <p>생성한 토큰과 secret 은 로그에 남기지 않는다.</p>
 */
@Component
public class UpbitJwt {

    private final ObjectMapper mapper;

    public UpbitJwt(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * @param queryString 서명 대상 쿼리(예: {@code markets=KRW-BTC&state=wait}). 없으면 빈 문자열/null.
     */
    public String create(String accessKey, String secretKey, String queryString) {
        if (accessKey == null || accessKey.isBlank() || secretKey == null || secretKey.isBlank()) {
            throw new IllegalArgumentException("upbit access/secret key is required");
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("access_key", accessKey);
        payload.put("nonce", UUID.randomUUID().toString());
        if (queryString != null && !queryString.isEmpty()) {
            payload.put("query_hash", sha512Hex(queryString));
            payload.put("query_hash_alg", "SHA512");
        }
        try {
            String header = base64Url(mapper.writeValueAsBytes(Map.of("alg", "HS256", "typ", "JWT")));
            String body = base64Url(mapper.writeValueAsBytes(payload));
            String unsigned = header + "." + body;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String signature = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(unsigned.getBytes(StandardCharsets.UTF_8)));
            return unsigned + "." + signature;
        } catch (Exception e) {
            throw new IllegalStateException("failed to create upbit jwt", e);
        }
    }

    private static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static String sha512Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-512")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16));
                hex.append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("failed to hash upbit query", e);
        }
    }
}
