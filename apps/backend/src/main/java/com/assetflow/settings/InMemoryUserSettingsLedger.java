package com.assetflow.settings;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** 사용자 설정 원장의 인메모리 구현 (테스트·CI). 시드 계정 user@example.com 만 안다. */
@Component
@Profile("!postgres")
public class InMemoryUserSettingsLedger implements UserSettingsLedger {

    private final UserSettings seed = new UserSettings(1, "user@example.com", "사용자", 6);

    public UserSettings get(String email) {
        return seed.email().equals(email) ? seed : null;
    }

    public UserSettings updateTargetMonths(String email, int targetMonths) {
        return seed.email().equals(email) ? new UserSettings(1, seed.email(), seed.displayName(), targetMonths) : null;
    }
}
