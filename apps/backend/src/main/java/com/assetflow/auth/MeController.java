package com.assetflow.auth;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.dashboard.DashboardService;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.UserSettingsLedger;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /api/v1/me — 현재 토큰(subject)의 실제 사용자. 하드코딩 mock 대신
 * users 테이블(§46)에서 id·표시명을 읽는다.
 */
@RestController
@RequestMapping("/api/v1")
public class MeController {

    private final UserSettingsLedger settings;
    private final AuthEmailResolver emailResolver;

    public MeController(UserSettingsLedger settings, AuthEmailResolver emailResolver) {
        this.settings = settings;
        this.emailResolver = emailResolver;
    }

    @GetMapping("/me")
    public ApiResponse<DashboardService.Me> me() {
        UserSettingsLedger.UserSettings s = settings.get(emailResolver.currentEmail());
        if (s == null) {
            throw new com.assetflow.common.api.NotFoundException("user");
        }
        return new ApiResponse<>("OK", "Me loaded", new DashboardService.Me(s.id(), s.email(), s.displayName()));
    }
}
