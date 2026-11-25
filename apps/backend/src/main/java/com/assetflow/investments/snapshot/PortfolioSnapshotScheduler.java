package com.assetflow.investments.snapshot;

import com.assetflow.common.api.NotFoundException;
import com.assetflow.investments.sync.AutoSyncService;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.UserSettingsLedger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 장 시작·마감에 투자 스냅샷을 남긴다 (이슈 #52).
 *
 * <p>순서가 중요하다 — <b>먼저</b> 연동 계좌를 최신화하고({@link AutoSyncService#syncDue}),
 * <b>그다음</b> 스냅샷을 찍는다. 순서를 뒤집으면 전날 값이 오늘 이름으로 저장된다.</p>
 *
 * <p>기본 시각: 평일 09:05(개장 후), 15:35(마감 후) KST. 사용자가 결정했다.</p>
 *
 * <h2>한계</h2>
 * <ul>
 *   <li><b>공휴일을 모른다</b> — 공휴일 API 가 없어 평일이면 실행된다. 휴장일에는
 *       전일 종가가 그대로 한 점 더 찍힌다(차트에서 평평한 구간).</li>
 *   <li><b>단일 사용자 전제</b> — {@code UserSettingsLedger} 에 전체 목록 API 가 없어
 *       원장 소유자(owner-email) 1명만 처리한다. 다중 사용자가 되면 목록 조회를 추가해야 한다.</li>
 * </ul>
 */
@Component
public class PortfolioSnapshotScheduler {

    private static final Logger log = LoggerFactory.getLogger(PortfolioSnapshotScheduler.class);

    private final PortfolioSnapshotService snapshots;
    private final AutoSyncService autoSync;
    private final UserSettingsLedger settingsLedger;
    private final AuthEmailResolver emailResolver;
    /** 스케줄을 끄고 싶을 때(테스트·장애) false 로 둔다. */
    private final boolean enabled;

    public PortfolioSnapshotScheduler(PortfolioSnapshotService snapshots, AutoSyncService autoSync,
                                      UserSettingsLedger settingsLedger, AuthEmailResolver emailResolver,
                                      @Value("${app.invest.snapshot.enabled:true}") boolean enabled) {
        this.snapshots = snapshots;
        this.autoSync = autoSync;
        this.settingsLedger = settingsLedger;
        this.emailResolver = emailResolver;
        this.enabled = enabled;
    }

    /** 개장 후 — 동기화로 최신화한 뒤 1점. */
    @Scheduled(cron = "${app.invest.snapshot.cron-morning:0 5 9 * * MON-FRI}", zone = "Asia/Seoul")
    public void morning() {
        run("morning");
    }

    /** 마감 후 — 같은 순서. */
    @Scheduled(cron = "${app.invest.snapshot.cron-close:0 35 15 * * MON-FRI}", zone = "Asia/Seoul")
    public void close() {
        run("close");
    }

    /**
     * 테스트·수동 실행용 본체. 스케줄 예외가 다음 주기를 막지 않도록 여기서 삼킨다.
     *
     * @return 저장한 점. 비활성·사용자 없음이면 null.
     */
    public PortfolioSnapshotLedger.Snapshot run(String slot) {
        if (!enabled) {
            log.debug("portfolio snapshot skipped — disabled ({})", slot);
            return null;
        }
        Long userId = ownerId();
        if (userId == null) {
            log.warn("portfolio snapshot skipped — owner settings not found ({})", slot);
            return null;
        }
        try {
            // 1) 먼저 최신화 — 스냅샷이 옛 값을 담지 않게.
            autoSync.syncDue(userId);
        } catch (RuntimeException e) {
            // 동기화가 실패해도 스냅샷은 남긴다 — 전날 값이라도 "그 시점의 기록"이다.
            log.warn("portfolio snapshot: sync before capture failed ({}) — {}", slot, e.toString());
        }
        try {
            PortfolioSnapshotLedger.Snapshot saved = snapshots.capture(userId, "schedule");
            log.info("portfolio snapshot captured ({}) — cost={}, value={}, cash={}",
                    slot, saved.totalCost(), saved.totalValue(), saved.cash());
            return saved;
        } catch (RuntimeException e) {
            log.warn("portfolio snapshot failed ({}) — {}", slot, e.toString());
            return null;
        }
    }

    private Long ownerId() {
        try {
            String email = emailResolver.currentEmail();
            UserSettingsLedger.UserSettings settings = settingsLedger.get(email);
            return settings == null ? null : settings.id();
        } catch (NotFoundException | IllegalStateException e) {
            return null;
        }
    }
}
