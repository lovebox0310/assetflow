package com.assetflow.investments.sync;

import com.assetflow.assets.AssetLedger;
import com.assetflow.investments.kis.KisCredentials;
import com.assetflow.investments.kis.KisCredentialsLedger;
import com.assetflow.investments.toss.TossCredentials;
import com.assetflow.investments.toss.TossCredentialsLedger;
import com.assetflow.investments.toss.TossSyncService;
import com.assetflow.investments.sync.KisSyncService;
import com.assetflow.investments.upbit.UpbitCredentialsLedger;
import com.assetflow.investments.upbit.UpbitSyncService;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 투자 화면 접속 시 자동 동기화 (이슈 #58).
 *
 * <p>규칙:</p>
 * <ul>
 *   <li>마지막 성공 후 {@link #STALE} 이상 지난 연동 계좌만 대상이다(사용자 결정: 장 시간 조건 없음).</li>
 *   <li>한 번도 성공하지 않았으면 대상이다.</li>
 *   <li>직전 시도가 실패했으면 {@link #ERROR_RETRY} 뒤에만 다시 시도한다 —
 *       실패 직후 새로고침으로 KIS 유량을 소모하지 않게 한다.</li>
 *   <li>한 계좌가 실패해도 나머지는 계속한다(부분 실패 허용).</li>
 *   <li>같은 사용자의 동시 요청은 1회만 실행한다.</li>
 * </ul>
 *
 * <p>대상 판정은 자격증명 존재 여부로 한다 — "API 연동된 계좌"의 정의가 그것이다.
 * KIS·토스는 계좌 단위, 업비트는 계정 단위 1건이다.</p>
 */
@Service
public class AutoSyncService {

    /** 사용자 승인: 10분. */
    static final Duration STALE = Duration.ofMinutes(10);
    /** 실패 직후 반복 시도를 막는다(일시 오류는 이 시간이 지나야 재시도). */
    static final Duration ERROR_RETRY = Duration.ofMinutes(2);

    /** 화면에 보여 줄 대상 1건. */
    public record Due(String provider, Long accountId, String accountName,
                      String lastStatus, Instant lastSyncedAt, boolean stale) {}

    /** 계좌별 실행 결과. */
    public record SyncOutcome(String provider, Long accountId, boolean ok, String error) {}

    public record DueResult(int due, List<SyncOutcome> outcomes) {}

    private final ProviderSyncStatusLedger statuses;
    private final AssetLedger assets;
    private final KisCredentialsLedger kisCredentials;
    private final TossCredentialsLedger tossCredentials;
    private final UpbitCredentialsLedger upbitCredentials;
    private final TossSyncService tossSync;
    private final KisSyncService kisSync;
    private final UpbitSyncService upbitSync;
    private final Clock clock;

    /** 사용자별 실행 중 표시 — 접속이 겹쳐도 동기화는 1회. */
    private final Set<Long> running = ConcurrentHashMap.newKeySet();

    public AutoSyncService(ProviderSyncStatusLedger statuses, AssetLedger assets,
                           KisCredentialsLedger kisCredentials, TossCredentialsLedger tossCredentials,
                           UpbitCredentialsLedger upbitCredentials,
                           TossSyncService tossSync, KisSyncService kisSync,
                           UpbitSyncService upbitSync, Clock clock) {
        this.statuses = statuses;
        this.assets = assets;
        this.kisCredentials = kisCredentials;
        this.tossCredentials = tossCredentials;
        this.upbitCredentials = upbitCredentials;
        this.tossSync = tossSync;
        this.kisSync = kisSync;
        this.upbitSync = upbitSync;
        this.clock = clock;
    }

    /** 지금 동기화해야 하는 대상. 화면이 상태를 표시할 때도 쓴다. */
    public List<Due> due(long userId) {
        Map<String, ProviderSyncStatusLedger.SyncStatus> byKey = new LinkedHashMap<>();
        for (ProviderSyncStatusLedger.SyncStatus s : statuses.all(userId)) {
            byKey.put(key(s.provider(), s.accountId()), s);
        }

        List<Due> out = new ArrayList<>();
        // KIS — 계좌별 자격증명
        for (KisCredentials cred : kisCredentials.findByUserId(userId)) {
            addIfStale(out, byKey, "kis", cred.accountId(), nameOf(cred.accountId()));
        }
        // 토스 — 계좌별 자격증명(계좌 미지정 행은 제외: 동기화 대상이 아니다)
        tossCredentials.findByUserId(userId).ifPresent(cred -> {
            if (cred.accountId() != null) {
                addIfStale(out, byKey, "toss", cred.accountId(), nameOf(cred.accountId()));
            }
        });
        // 업비트 — 계정 단위 1건
        if (upbitCredentials.findByUserId(userId).isPresent()) {
            addIfStale(out, byKey, "upbit", null, "업비트");
        }
        return out;
    }

    /** 오래된 계좌만 동기화한다. 실행 중이면 빈 결과를 돌려준다(중복 실행 금지). */
    public DueResult syncDue(long userId) {
        List<Due> targets = due(userId);
        if (targets.isEmpty()) {
            return new DueResult(0, List.of());
        }
        if (!running.add(userId)) {
            // 이미 다른 요청이 돌고 있다 — 그쪽 결과를 기다리지 않고 넘어간다.
            return new DueResult(0, List.of());
        }
        try {
            List<SyncOutcome> outcomes = new ArrayList<>();
            for (Due target : targets) {
                outcomes.add(runOne(userId, target));
            }
            return new DueResult(targets.size(), outcomes);
        } finally {
            running.remove(userId);
        }
    }

    private SyncOutcome runOne(long userId, Due target) {
        try {
            if ("toss".equals(target.provider())) {
                tossSync.sync(userId);
            } else if ("upbit".equals(target.provider())) {
                upbitSync.sync(userId);
            } else {
                kisSync.sync(target.accountId());
            }
            statuses.recordOk(userId, target.provider(), target.accountId());
            return new SyncOutcome(target.provider(), target.accountId(), true, null);
        } catch (RuntimeException e) {
            String message = e.getMessage() == null ? e.toString() : e.getMessage();
            statuses.recordError(userId, target.provider(), target.accountId(), message);
            return new SyncOutcome(target.provider(), target.accountId(), false, message);
        }
    }

    private void addIfStale(List<Due> out, Map<String, ProviderSyncStatusLedger.SyncStatus> byKey,
                            String provider, Long accountId, String accountName) {
        ProviderSyncStatusLedger.SyncStatus s = byKey.get(key(provider, accountId));
        if (isStale(s)) {
            out.add(new Due(provider, accountId, accountName,
                    s == null ? "unknown" : s.lastStatus(),
                    s == null ? null : s.lastSyncedAt(), true));
        }
    }

    boolean isStale(ProviderSyncStatusLedger.SyncStatus s) {
        Instant now = clock.instant();
        if (s == null) {
            return true; // 상태 행이 없으면 한 번도 시도하지 않았다.
        }
        // 직전 시도가 실패였다면 성공 시각과 무관하게 재시도 간격을 지킨다.
        // (성공이 오래됐어도 방금 실패했으면 10분 규칙으로 즉시 재시도하면 안 된다 —
        //  유량 제한·장애 중에 새로고침마다 호출하게 된다.)
        if ("error".equals(s.lastStatus()) && s.updatedAt() != null) {
            return Duration.between(s.updatedAt(), now).compareTo(ERROR_RETRY) >= 0;
        }
        if (s.lastSyncedAt() == null) {
            return true; // 성공 이력 없음.
        }
        return Duration.between(s.lastSyncedAt(), now).compareTo(STALE) >= 0;
    }

    private String nameOf(Long accountId) {
        if (accountId == null) {
            return null;
        }
        AssetLedger.AssetRow row = assets.byId(accountId);
        return row == null ? null : row.name();
    }

    private static String key(String provider, Long accountId) {
        return provider + "|" + (accountId == null ? "-" : accountId);
    }
}
