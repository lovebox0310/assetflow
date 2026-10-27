package com.assetflow.dashboard;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.dashboard.DashboardService.DashboardSummary;
import com.assetflow.dashboard.MockDashboardSource.CashflowMonth;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 스프린트 1 대시보드 API (§25).
 * - GET /api/v1/dashboard/summary                     → 대시보드 카드 원장
 * - GET /api/v1/dashboard/cashflow?months=3          → 최근 N개월 수지
 * - GET /api/v1/dashboard/monthly-income?from&to     → 범위 내 확정 월 수입 (§57.8)
 * 성공 응답은 ApiResponse(code, message, data) 로 고정한다.
 */
@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {

    private final DashboardService service;

    public DashboardController(DashboardService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public ApiResponse<DashboardSummary> summary() {
        return new ApiResponse<>("OK", "Summary loaded", service.summary());
    }

    @GetMapping("/cashflow")
    public ApiResponse<List<CashflowMonth>> cashflow(
            @RequestParam(name = "months", defaultValue = "3") int months) {
        return new ApiResponse<>("OK", "Cashflow loaded", service.cashflow(months));
    }

    /** §57.8: 지출 추이 차트의 수입 막대 — 확정된 달만 내려준다. */
    @GetMapping("/monthly-income")
    public ApiResponse<List<DashboardService.MonthlyIncome>> monthlyIncome(
            @RequestParam("from") String from,
            @RequestParam("to") String to) {
        return new ApiResponse<>("OK", "Monthly income loaded", service.monthlyIncome(from, to));
    }
}
