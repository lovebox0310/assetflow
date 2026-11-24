package com.assetflow.investments.sync;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 테스트·비 postgres 프로필용 원장.
 *
 * <p>사용자별로 (제공자, 계좌) 조합당 1행을 유지한다. 실제 DB 의 UNIQUE 제약과
 * 같은 의미이며, accountId 가 null 인 계정 단위 연동도 한 행만 남는다.</p>
 */
@Component
@Profile("!postgres")
public class InMemoryProviderSyncStatusLedger implements ProviderSyncStatusLedger {

    /** userId → (provider|accountId → 상태) */
    private final Map<Long, Map<String, SyncStatus>> rows = new LinkedHashMap<>();

    private static String key(String provider, Long accountId) {
        return provider + "|" + (accountId == null ? "-" : accountId);
    }

    @Override
    public synchronized List<SyncStatus> all(long userId) {
        return new ArrayList<>(rows.getOrDefault(userId, Map.of()).values());
    }

    @Override
    public synchronized void recordOk(long userId, String provider, Long accountId) {
        Instant now = Instant.now();
        rows.computeIfAbsent(userId, k -> new LinkedHashMap<>())
                .put(key(provider, accountId), new SyncStatus(provider, accountId, now, "ok", null, now));
    }

    @Override
    public synchronized void recordError(long userId, String provider, Long accountId, String message) {
        Instant now = Instant.now();
        Map<String, SyncStatus> userRows = rows.computeIfAbsent(userId, k -> new LinkedHashMap<>());
        SyncStatus prev = userRows.get(key(provider, accountId));
        // 마지막 성공 시각은 유지한다 — 재시도 판단에 쓴다.
        userRows.put(key(provider, accountId), new SyncStatus(provider, accountId,
                prev == null ? null : prev.lastSyncedAt(), "error", message, now));
    }
}
