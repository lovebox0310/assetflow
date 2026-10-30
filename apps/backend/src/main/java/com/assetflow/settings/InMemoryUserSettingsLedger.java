package com.assetflow.settings;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 사용자 설정 원장의 인메모리 구현 (테스트·CI). 시드 계정 user@example.com 만 안다.
 * §59: 시드 비상금 통장은 InMemoryAssetLedger 의 첫 cash 계좌(id "1")다.
 */
@Component
@Profile("!postgres")
public class InMemoryUserSettingsLedger implements UserSettingsLedger {

    public static final List<String> DEFAULT_EMERGENCY_CATEGORIES = List.of(
            "식비", "주거/통신", "건강/의료", "금융/세금", "교육");

    private volatile UserSettings seed = new UserSettings(
            1, "user@example.com", "사용자", 6, List.of("1"), 3, DEFAULT_EMERGENCY_CATEGORIES);

    public UserSettings get(String email) {
        return seed.email().equals(email) ? seed : null;
    }

    public UserSettings update(String email, int targetMonths, List<String> emergencyAccountIds,
                               int emergencyAvgMonths, List<String> emergencyCategories) {
        if (!seed.email().equals(email)) {
            return null;
        }
        seed = new UserSettings(seed.id(), seed.email(), seed.displayName(), targetMonths,
                List.copyOf(emergencyAccountIds), emergencyAvgMonths,
                List.copyOf(emergencyCategories));
        return seed;
    }
}
