package com.assetflow.investments.toss;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/**
 * 토스증권 접근토큰 캐시 (이슈 #55 Stage 2).
 *
 * <p>토스는 클라이언트당 토큰 1개만 유효하므로(재발급 시 이전 토큰 {@code token-revoked}),
 * 같은 순간 여러 요청이 와도 <b>발급은 1회</b>여야 한다. 발급은 {@code synchronized} 로
 * 직렬화한다 — 발급은 드물고(만료 전까지 재사용) 네트워크 1회 비용이라 락 경합이 문제되지 않는다.</p>
 *
 * <p>HTTP 를 모르는 순수 캐시라 단위 테스트로 "발급 1회·만료 전 재사용·만료 시 재발급"을
 * 고정할 수 있다. 실제 HTTP 는 {@link HttpTossApiClient} 가 담당한다.</p>
 */
final class TossTokenCache {

    /** 만료 토큰을 실제로 발급하는 함수. 실패는 {@link TossApiException} 으로 던진다. */
    interface TokenFetcher {
        TossToken fetch(String clientId, String clientSecret);
    }

    private final Map<String, TossToken> tokens = new HashMap<>();
    private final Clock clock;

    TossTokenCache() {
        this(Clock.systemUTC());
    }

    TossTokenCache(Clock clock) {
        this.clock = clock;
    }

    /**
     * 재사용 가능한 토큰을 돌려주고, 없으면 1회 발급한다.
     *
     * @param clientId 자격증명 단위 키(평문 secret 은 키로 쓰지 않는다)
     */
    synchronized TossToken token(String clientId, String clientSecret, TokenFetcher fetcher) {
        String key = clientId == null ? "" : clientId;
        TossToken cached = tokens.get(key);
        if (cached != null && cached.usableAt(clock.instant())) {
            return cached;
        }
        TossToken fresh = fetcher.fetch(clientId, clientSecret);
        if (fresh == null) {
            throw new TossApiException("invalid-token");
        }
        tokens.put(key, fresh);
        return fresh;
    }

    /** 401({@code invalid-token}/{@code token-revoked}) 을 받았을 때 캐시를 비운다. */
    synchronized void invalidate(String clientId) {
        tokens.remove(clientId == null ? "" : clientId);
    }
}
