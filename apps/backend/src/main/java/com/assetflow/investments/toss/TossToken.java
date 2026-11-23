package com.assetflow.investments.toss;

import java.time.Instant;

/**
 * 토스증권 접근토큰 1건 (이슈 #55 Stage 2).
 *
 * <p>토스는 <b>클라이언트당 토큰 1개만 유효</b>하다 — 새로 발급하면 이전 토큰은
 * {@code token-revoked} 가 된다. 그래서 캐시는 "교체"만 하고 두 개를 동시에 쓰지 않는다.
 * {@code accessToken} 은 로그·응답에 남기지 않는다.</p>
 */
public record TossToken(String accessToken, String tokenType, Instant expiresAt) {

    /** 만료 60초 전부터는 쓰지 않는다 — 요청 도중 만료로 401 이 나는 것을 막는다. */
    static final long REFRESH_MARGIN_SECONDS = 60;

    /** {@code now} 시점에 재사용해도 되는가. */
    public boolean usableAt(Instant now) {
        if (accessToken == null || accessToken.isBlank() || expiresAt == null) {
            return false;
        }
        return now.isBefore(expiresAt.minusSeconds(REFRESH_MARGIN_SECONDS));
    }

    /** Authorization 헤더 값. 토스는 항상 Bearer 지만 응답 값을 우선한다. */
    public String authorization() {
        String type = tokenType == null || tokenType.isBlank() ? "Bearer" : tokenType.trim();
        return type + " " + accessToken;
    }
}
