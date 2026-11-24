package com.assetflow.investments.sync;

import java.time.Instant;
import java.util.List;

/**
 * API 연동 계좌의 마지막 동기화 상태 원장 (이슈 #58).
 *
 * <p>투자 화면 접속 시 "10분 이상 지난 계좌만" 자동 동기화하기 위한 판단 근거다.
 * {@code accountId} 가 null 이면 계정 단위 연동(업비트)이다.</p>
 */
public interface ProviderSyncStatusLedger {

    record SyncStatus(String provider, Long accountId, Instant lastSyncedAt,
                      String lastStatus, String lastError, Instant updatedAt) {}

    List<SyncStatus> all(long userId);

    /** 동기화 성공 — 마지막 시각을 지금으로, 상태를 ok 로. */
    void recordOk(long userId, String provider, Long accountId);

    /** 동기화 실패 — 사유를 남기고 상태를 error 로. 마지막 성공 시각은 유지한다. */
    void recordError(long userId, String provider, Long accountId, String message);
}
