package com.assetflow.auth;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.dashboard.DashboardService;
import com.assetflow.dashboard.DashboardService.Me;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/v1/me — 현재 토큰의 사용자 (§25). 인터셉터가 Bearer 를 강제한다. */
@RestController
@RequestMapping("/api/v1")
public class MeController {

    private final DashboardService dashboardService;

    public MeController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/me")
    public ApiResponse<Me> me() {
        return new ApiResponse<>("OK", "Me loaded", dashboardService.me());
    }
}
