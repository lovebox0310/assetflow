package com.assetflow.investments.sync;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.UserSettingsLedger;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 접속 시 자동 동기화 API (이슈 #58).
 *
 * <p>화면은 투자 화면 진입 시 {@code /sync-status} 로 대상이 있는지 보고, 있으면
 * {@code /sync-due} 를 호출한다. 판정(10분 stale·오류 2분)은 서버가 한다 —
 * 클라이언트 시계를 신뢰하지 않는다.</p>
 *
 * <p>{@code InvestmentController} 에 붙이지 않고 분리했다 — 그 컨트롤러는 테스트에서
 * 직접 생성하는 곳이 많아 생성자 인자를 늘리면 무관한 테스트가 깨진다.</p>
 */
@RestController
@RequestMapping("/api/v1/investments")
public class AutoSyncController {

    private final AutoSyncService autoSyncService;
    private final UserSettingsLedger settingsLedger;
    private final AuthEmailResolver emailResolver;

    public AutoSyncController(AutoSyncService autoSyncService, UserSettingsLedger settingsLedger,
                              AuthEmailResolver emailResolver) {
        this.autoSyncService = autoSyncService;
        this.settingsLedger = settingsLedger;
        this.emailResolver = emailResolver;
    }

    /** 자동 동기화 상태 — {@code due} 가 0 이면 화면은 아무것도 하지 않는다. */
    @GetMapping("/sync-status")
    public ApiResponse<SyncStatusResponse> syncStatus() {
        List<AutoSyncService.Due> due = autoSyncService.due(currentUserId());
        return new ApiResponse<>("OK", "Sync status loaded", new SyncStatusResponse(due.size(), due));
    }

    /** 오래된 연동 계좌만 동기화한다. 부분 실패를 허용하며, 실행 중이면 빈 결과다. */
    @PostMapping("/sync-due")
    public ApiResponse<AutoSyncService.DueResult> syncDue() {
        return new ApiResponse<>("OK", "Due sync finished", autoSyncService.syncDue(currentUserId()));
    }

    /** 무엇이 오래됐는지 화면이 표시할 수 있게 그대로 넘긴다. */
    public record SyncStatusResponse(int due, List<AutoSyncService.Due> providers) {}

    private long currentUserId() {
        String email = emailResolver.currentEmail();
        UserSettingsLedger.UserSettings settings = settingsLedger.get(email);
        if (settings == null) {
            throw new NotFoundException("settings");
        }
        return settings.id();
    }
}
