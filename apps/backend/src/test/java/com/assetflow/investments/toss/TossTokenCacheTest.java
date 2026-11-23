package com.assetflow.investments.toss;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 이슈 #55 Stage 2 토큰 캐시 — 실제 HTTP 는 검증하지 않는다(네트워크 없이 규칙만 고정).
 *
 * <p>토스는 클라이언트당 토큰 1개만 유효하다(재발급 시 이전 토큰 {@code token-revoked}).
 * 그래서 ① 동시 요청에서 발급 1회 ② 만료 전 재사용 ③ 만료 60초 전 재발급을 여기서 고정한다.</p>
 */
class TossTokenCacheTest {

    /** 테스트에서 시간을 수동으로 흘리는 Clock. */
    private static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    @Test
    void reusesTokenUntilExpiryMargin() {
        Instant start = Instant.parse("2026-11-23T00:00:00Z");
        MutableClock clock = new MutableClock(start);
        TossTokenCache cache = new TossTokenCache(clock);
        AtomicInteger issued = new AtomicInteger();

        TossTokenCache.TokenFetcher fetcher = (clientId, secret) -> {
            issued.incrementAndGet();
            return new TossToken("token-" + issued.get(), "Bearer", clock.instant().plusSeconds(600));
        };

        TossToken first = cache.token("client-a", "secret", fetcher);
        // 만료(600초) - 60초 여유 = 540초까지 재사용.
        clock.advance(Duration.ofSeconds(539));
        TossToken second = cache.token("client-a", "secret", fetcher);

        assertThat(issued.get()).isEqualTo(1);
        assertThat(second.accessToken()).isEqualTo(first.accessToken());

        // 540초를 넘기면(만료 60초 이내) 재발급한다.
        clock.advance(Duration.ofSeconds(2));
        TossToken third = cache.token("client-a", "secret", fetcher);

        assertThat(issued.get()).isEqualTo(2);
        assertThat(third.accessToken()).isNotEqualTo(first.accessToken());
    }

    @Test
    void issuesOncePerClientIdAndKeepsClientsSeparate() {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-23T00:00:00Z"));
        TossTokenCache cache = new TossTokenCache(clock);
        AtomicInteger issued = new AtomicInteger();
        TossTokenCache.TokenFetcher fetcher = (clientId, secret) -> {
            issued.incrementAndGet();
            return new TossToken("token-" + clientId + "-" + issued.get(), "Bearer",
                    clock.instant().plusSeconds(3600));
        };

        cache.token("client-a", "secret-a", fetcher);
        cache.token("client-b", "secret-b", fetcher);
        cache.token("client-a", "secret-a", fetcher);

        assertThat(issued.get()).isEqualTo(2);
    }

    @Test
    void concurrentRequestsIssueExactlyOneToken() throws Exception {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-23T00:00:00Z"));
        TossTokenCache cache = new TossTokenCache(clock);
        AtomicInteger issued = new AtomicInteger();
        int threads = 16;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        Set<String> tokens = ConcurrentHashMap.newKeySet();

        TossTokenCache.TokenFetcher fetcher = (clientId, secret) -> {
            issued.incrementAndGet();
            try {
                // 발급이 직렬화되지 않으면 여기서 여러 스레드가 겹친다.
                Thread.sleep(20);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return new TossToken("token-" + issued.get(), "Bearer",
                    clock.instant().plusSeconds(3600));
        };

        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            for (int i = 0; i < threads; i++) {
                pool.submit(() -> {
                    try {
                        start.await();
                        tokens.add(cache.token("client-a", "secret", fetcher).accessToken());
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }
            start.countDown();
            assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }

        assertThat(issued.get()).isEqualTo(1);
        assertThat(tokens).containsExactly("token-1");
    }

    @Test
    void invalidateForcesReissue() {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-23T00:00:00Z"));
        TossTokenCache cache = new TossTokenCache(clock);
        List<String> issued = new ArrayList<>();
        TossTokenCache.TokenFetcher fetcher = (clientId, secret) -> {
            issued.add("token-" + (issued.size() + 1));
            return new TossToken(issued.get(issued.size() - 1), "Bearer",
                    clock.instant().plusSeconds(3600));
        };

        cache.token("client-a", "secret", fetcher);
        cache.invalidate("client-a");
        cache.token("client-a", "secret", fetcher);

        assertThat(issued).hasSize(2);
    }

    @Test
    void propagatesFetcherFailureWithoutCaching() {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-23T00:00:00Z"));
        TossTokenCache cache = new TossTokenCache(clock);
        AtomicInteger attempts = new AtomicInteger();

        assertThatThrownBy(() -> cache.token("client-a", "secret", (clientId, secret) -> {
            attempts.incrementAndGet();
            throw new TossApiException("ip-not-allowed");
        })).isInstanceOf(TossApiException.class)
                .hasMessageContaining("허용 IP");

        assertThat(attempts.get()).isEqualTo(1);
        // 실패는 캐시되지 않는다 — 다음 호출은 다시 시도한다.
        cache.token("client-a", "secret", (clientId, secret) -> new TossToken("ok", "Bearer",
                clock.instant().plusSeconds(3600)));
    }

    @Test
    void expiredTokenIsNotReused() {
        MutableClock clock = new MutableClock(Instant.parse("2026-11-23T00:00:00Z"));
        TossTokenCache cache = new TossTokenCache(clock);
        AtomicInteger issued = new AtomicInteger();
        TossTokenCache.TokenFetcher fetcher = (clientId, secret) -> {
            issued.incrementAndGet();
            return new TossToken("token-" + issued.get(), "Bearer", clock.instant().plusSeconds(10));
        };

        cache.token("client-a", "secret", fetcher);
        clock.advance(Duration.ofSeconds(11));
        cache.token("client-a", "secret", fetcher);

        assertThat(issued.get()).isEqualTo(2);
    }
}
