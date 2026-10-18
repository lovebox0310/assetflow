package com.assetflow.auth;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Date;

/**
 * 실제 JWT 발급·검증 단일 출처 (Known Issues 3 — 서버 토큰 만료시 미제공 해소).
 * 시크릿은 JWT_SECRET 환경변수(HS256, 32바이트 이상). 미설정 시 부팅마다 무작위
 * 생성 — 재시작마다 기존 토큰이 무효화되므로 운영 배포에서는 반드시 고정값을 쓴다.
 * 토큰 만료는 1시간 — 클라이언트의 로컬 TTL(§21)과 정렬.
 */
@Component
public class TokenService {

    private static final long TTL_MILLIS = 3_600_000;

    private final SecretKey key;
    private final long ttlMillis;

    public TokenService(@Value("${app.jwt-secret:}") String secret) {
        String effective = (secret == null || secret.isBlank()) ? randomSecret() : secret;
        if (effective.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(effective.getBytes(StandardCharsets.UTF_8));
        this.ttlMillis = TTL_MILLIS;
    }

    private static String randomSecret() {
        byte[] bytes = new byte[48];
        new SecureRandom().nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x", b));
        return sb.toString();
    }

    public String issue(String email) {
        Date now = new Date();
        return Jwts.builder()
                .subject(email)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + ttlMillis))
                .signWith(key)
                .compact();
    }

    /** 서명·만료를 검증해 subject(이메일)를 돌려준다. 무효면 null. */
    public String verify(String token) {
        try {
            return Jwts.parser().verifyWith(key).build()
                    .parseSignedClaims(token).getPayload().getSubject();
        } catch (RuntimeException e) {
            return null;
        }
    }
}
