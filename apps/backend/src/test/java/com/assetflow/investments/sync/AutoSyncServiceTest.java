package com.assetflow.investments.sync;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #58 — 접속 시 자동 동기화의 stale 판정.
 *
 * <p>"10분 이상 지난 연동 계좌만" 이 화면·서버 양쪽에서 같은 의미가 되도록
 * 시간 경계를 고정 Clock 으로 검증한다. 장 시간 조건은 없다(사용자 결정).</p>
 */
class AutoSyncServiceTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private InMemoryProviderSyncStatusLedger statuses;

    @BeforeEach
    void setUp() {
        statuses = new InMemoryProviderSyncStatusLedger();
    }

    /** isStale 만 검증하기 위한 최소 구성 — 동기화 서비스는 호출되지 않는다. */
    private AutoSyncService serviceAt(Instant now) {
        Clock clock = Clock.fixed(now, SEOUL);
        return new AutoSyncService(statuses, null, null, null, null, null, null, null, null, clock);
    }

    private ProviderSyncStatusLedger.SyncStatus ok(Instant syncedAt) {
        return new ProviderSyncStatusLedger.SyncStatus("toss", 7L, syncedAt, "ok", null, syncedAt);
    }

    private ProviderSyncStatusLedger.SyncStatus error(Instant updatedAt, Instant lastOk) {
        return new ProviderSyncStatusLedger.SyncStatus("toss", 7L, lastOk, "error", "boom", updatedAt);
    }

    @Test
    void neverSyncedIsStale() {
        assertThat(serviceAt(Instant.parse("2026-11-25T01:00:00Z")).isStale(null)).isTrue();
    }

    @Test
    void nineMinutesIsNotStaleButTenIs() {
        Instant now = Instant.parse("2026-11-25T01:00:00Z");
        assertThat(serviceAt(now).isStale(ok(now.minus(Duration.ofMinutes(9))))).isFalse();
        assertThat(serviceAt(now).isStale(ok(now.minus(Duration.ofMinutes(10))))).isTrue();
        assertThat(serviceAt(now).isStale(ok(now.minus(Duration.ofMinutes(11))))).isTrue();
    }

    @Test
    void failedAttemptWaitsTwoMinutesBeforeRetry() {
        Instant now = Instant.parse("2026-11-25T01:00:00Z");
        assertThat(serviceAt(now).isStale(error(now.minus(Duration.ofMinutes(1)), null))).isFalse();
        assertThat(serviceAt(now).isStale(error(now.minus(Duration.ofMinutes(2)), null))).isTrue();
    }

    @Test
    void failureAfterOldSuccessStillRespectsRetryWindow() {
        Instant now = Instant.parse("2026-11-25T01:00:00Z");
        // 성공은 1시간 전이지만 방금 실패했다 — 10분 규칙이 아니라 2분 규칙이 우선한다.
        ProviderSyncStatusLedger.SyncStatus s =
                error(now.minus(Duration.ofSeconds(30)), now.minus(Duration.ofHours(1)));
        assertThat(serviceAt(now).isStale(s)).isFalse();
    }

    @Test
    void recordOkClearsErrorAndSetsTimestamp() {
        statuses.recordError(1L, "toss", 7L, "boom");
        statuses.recordOk(1L, "toss", 7L);
        var rows = statuses.all(1L);
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).lastStatus()).isEqualTo("ok");
        assertThat(rows.get(0).lastError()).isNull();
        assertThat(rows.get(0).lastSyncedAt()).isNotNull();
    }

    @Test
    void recordErrorKeepsLastSuccessTimestamp() {
        statuses.recordOk(1L, "toss", 7L);
        Instant lastOk = statuses.all(1L).get(0).lastSyncedAt();
        statuses.recordError(1L, "toss", 7L, "boom");
        var row = statuses.all(1L).get(0);
        assertThat(row.lastStatus()).isEqualTo("error");
        assertThat(row.lastError()).isEqualTo("boom");
        // 재시도 판단을 위해 마지막 성공 시각은 보존한다.
        assertThat(row.lastSyncedAt()).isEqualTo(lastOk);
    }

    @Test
    void oneRowPerProviderAndAccount() {
        statuses.recordOk(1L, "toss", 7L);
        statuses.recordOk(1L, "toss", 7L);
        statuses.recordOk(1L, "upbit", null);
        statuses.recordOk(1L, "upbit", null);
        assertThat(statuses.all(1L)).hasSize(2);
    }

    @Test
    void rowsAreScopedToUser() {
        statuses.recordOk(1L, "toss", 7L);
        statuses.recordOk(2L, "toss", 7L);
        assertThat(statuses.all(1L)).hasSize(1);
        assertThat(statuses.all(2L)).hasSize(1);
    }
}
