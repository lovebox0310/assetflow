package com.assetflow.investments.upbit;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * UPBIT-2 JWT: HS256 서명·payload(access_key/nonce, query_hash) 계약.
 * 실제 키가 아닌 테스트 문자열만 쓴다.
 */
class UpbitJwtTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final UpbitJwt jwt = new UpbitJwt(mapper);

    @Test
    void signsPayloadWithHs256AndContainsAccessKeyAndNonce() throws Exception {
        String secret = "test-secret-key-for-upbit-jwt";
        String token = jwt.create("test-access-key", secret, "");

        String[] parts = token.split("\\.");
        assertThat(parts).hasSize(3);

        // 서명 검증: base64url(header.payload) 를 secret 으로 HMAC-SHA256.
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String expected = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal((parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8)));
        assertThat(parts[2]).isEqualTo(expected);

        JsonNode header = mapper.readTree(Base64.getUrlDecoder().decode(parts[0]));
        assertThat(header.path("alg").asText()).isEqualTo("HS256");
        assertThat(header.path("typ").asText()).isEqualTo("JWT");

        JsonNode payload = mapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
        assertThat(payload.path("access_key").asText()).isEqualTo("test-access-key");
        assertThat(payload.path("nonce").asText()).isNotBlank();
        assertThat(payload.has("query_hash")).isFalse();
        assertThat(payload.has("query_hash_alg")).isFalse();
    }

    @Test
    void includesSha512QueryHashWhenQueryStringIsPresent() throws Exception {
        String query = "markets=KRW-BTC&state=wait";
        String token = jwt.create("test-access-key", "secret", query);

        String payloadPart = token.split("\\.")[1];
        JsonNode payload = mapper.readTree(Base64.getUrlDecoder().decode(payloadPart));

        MessageDigest digest = MessageDigest.getInstance("SHA-512");
        byte[] hash = digest.digest(query.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            hex.append(Character.forDigit((b >> 4) & 0xF, 16));
            hex.append(Character.forDigit(b & 0xF, 16));
        }

        assertThat(payload.path("query_hash").asText()).isEqualTo(hex.toString());
        assertThat(payload.path("query_hash_alg").asText()).isEqualTo("SHA512");
    }
}
