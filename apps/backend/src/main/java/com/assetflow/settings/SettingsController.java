package com.assetflow.settings;

import com.assetflow.assets.AssetLedger;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.expenses.categories.CategoryTaxonomy;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 설정 화면 API (§46): 프로필·비상금 목표 개월, §59 비상금 유지 개월 기준.
 * Bearer 검증은 WebConfig(/api/v1/settings/**). 이메일은 토큰(subject)에서 —
 * 요청 파라미터로 다른 사용자를 만지지 않는다.
 */
@RestController
@RequestMapping("/api/v1/settings")
public class SettingsController {

    private static final int MIN_MONTHS = 1;
    private static final int MAX_MONTHS = 60;
    private static final int MIN_AVG_MONTHS = 1;
    private static final int MAX_AVG_MONTHS = 12;

    private final UserSettingsLedger ledger;
    private final AssetLedger assets;
    private final AuthEmailResolver emailResolver;

    public SettingsController(UserSettingsLedger ledger, AssetLedger assets,
                              AuthEmailResolver emailResolver) {
        this.ledger = ledger;
        this.assets = assets;
        this.emailResolver = emailResolver;
    }

    /**
     * 모든 필드는 선택이다 — 빠진 필드는 기존 값을 유지한다.
     * emergencyAccountIds 는 비상금 통장(현금성 계좌) id 목록이다. 빈 배열이면 지정 해제.
     */
    public record SettingsBody(Integer targetMonths, List<String> emergencyAccountIds,
                               Integer emergencyAvgMonths, List<String> emergencyCategories) {}

    @GetMapping
    public ApiResponse<UserSettingsLedger.UserSettings> get() {
        UserSettingsLedger.UserSettings s = ledger.get(emailResolver.currentEmail());
        if (s == null) {
            throw new NotFoundException("settings");
        }
        return new ApiResponse<>("OK", "Settings loaded", s);
    }

    @PutMapping
    public ApiResponse<UserSettingsLedger.UserSettings> update(@RequestBody SettingsBody body) {
        UserSettingsLedger.UserSettings current = ledger.get(emailResolver.currentEmail());
        if (current == null) {
            throw new NotFoundException("settings");
        }

        int targetMonths = body.targetMonths() == null ? current.targetMonths() : body.targetMonths();
        if (targetMonths < MIN_MONTHS || targetMonths > MAX_MONTHS) {
            throw new IllegalArgumentException("targetMonths must be " + MIN_MONTHS + ".." + MAX_MONTHS);
        }

        int avgMonths = body.emergencyAvgMonths() == null
                ? current.emergencyAvgMonths() : body.emergencyAvgMonths();
        if (avgMonths < MIN_AVG_MONTHS || avgMonths > MAX_AVG_MONTHS) {
            throw new IllegalArgumentException(
                    "emergencyAvgMonths must be " + MIN_AVG_MONTHS + ".." + MAX_AVG_MONTHS);
        }

        List<String> accountIds = body.emergencyAccountIds() == null
                ? current.emergencyAccountIds() : validateAccountIds(body.emergencyAccountIds());

        List<String> categories = body.emergencyCategories() == null
                ? current.emergencyCategories() : validateCategories(body.emergencyCategories());

        return new ApiResponse<>("OK", "Settings updated",
                ledger.update(current.email(), targetMonths, accountIds, avgMonths, categories));
    }

    /**
     * 비상금 통장은 **현금성(cash)·비부채** 계좌만 허용한다. 예적금은 잔액이 고정
     * 목적일 수 있어 제외하고, 자동이체·부가세처럼 용도가 정해진 계좌는 사용자가
     * 선택하지 않는 방식으로 뺀다. 중복 id 는 순서를 유지한 채 하나로 합친다.
     */
    private List<String> validateAccountIds(List<String> raw) {
        Set<String> unique = new LinkedHashSet<>();
        for (String value : raw) {
            Long id = parseAccountId(value);
            AssetLedger.AssetRow row = assets.byId(id);
            if (row == null) {
                throw new IllegalArgumentException("emergencyAccountIds does not exist: " + value);
            }
            if (row.isDebt()) {
                throw new IllegalArgumentException("emergencyAccountIds must not include a debt account");
            }
            if (!"cash".equals(row.accountType())) {
                throw new IllegalArgumentException("emergencyAccountIds must be cash accounts");
            }
            unique.add(String.valueOf(row.id()));
        }
        return new ArrayList<>(unique);
    }

    private static Long parseAccountId(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("emergencyAccountIds must not contain blank ids");
        }
        try {
            return Long.valueOf(raw.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("emergencyAccountIds must contain numeric account ids");
        }
    }

    /** 9개 대분류 중복 없이. 모르는 이름(미분류 포함)은 400. */
    private static List<String> validateCategories(List<String> raw) {
        Set<String> allowed = new LinkedHashSet<>(CategoryTaxonomy.groupNames());
        Set<String> unique = new LinkedHashSet<>();
        for (String category : raw) {
            if (category == null || !allowed.contains(category)) {
                throw new IllegalArgumentException("unknown emergency category: " + category);
            }
            unique.add(category);
        }
        return new ArrayList<>(unique);
    }
}
