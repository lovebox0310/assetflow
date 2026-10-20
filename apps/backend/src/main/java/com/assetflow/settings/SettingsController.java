package com.assetflow.settings;

import com.assetflow.common.api.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 설정 화면 API (§46): 프로필·비상금 목표 개월. Bearer 검증은 WebConfig(/api/v1/settings/**).
 * 이메일은 토큰(subject)에서 — 요청 파라미터로 다른 사용자를 만지지 않는다.
 */
@RestController
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private static final int MIN_MONTHS = 1;
    private static final int MAX_MONTHS = 60;

    private final UserSettingsLedger ledger;
    private final AuthEmailResolver emailResolver;

    public SettingsController(UserSettingsLedger ledger, AuthEmailResolver emailResolver) {
        this.ledger = ledger;
        this.emailResolver = emailResolver;
    }

    public record TargetMonthsBody(Integer targetMonths) {}

    @GetMapping
    public ApiResponse<UserSettingsLedger.UserSettings> get() {
        UserSettingsLedger.UserSettings s = ledger.get(emailResolver.currentEmail());
        if (s == null) {
            throw new com.assetflow.common.api.NotFoundException("settings");
        }
        return new ApiResponse<>("OK", "Settings loaded", s);
    }

    @PutMapping
    public ApiResponse<UserSettingsLedger.UserSettings> update(@RequestBody TargetMonthsBody body) {
        if (body.targetMonths() == null || body.targetMonths() < MIN_MONTHS || body.targetMonths() > MAX_MONTHS) {
            throw new IllegalArgumentException("targetMonths must be " + MIN_MONTHS + ".." + MAX_MONTHS);
        }
        return new ApiResponse<>("OK", "Settings updated",
                ledger.updateTargetMonths(emailResolver.currentEmail(), body.targetMonths()));
    }
}
