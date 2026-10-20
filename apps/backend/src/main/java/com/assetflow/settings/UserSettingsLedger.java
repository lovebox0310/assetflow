package com.assetflow.settings;

/** 사용자 설정 원장 계약 (§46 — 프로필·비상금 기준의 저장처, users 테이블). */
public interface UserSettingsLedger {

    record UserSettings(long id, String email, String displayName, int targetMonths) {}

    UserSettings get(String email);

    /** 목표 개월 갱신 — 갱신 후 값을 돌려준다. */
    UserSettings updateTargetMonths(String email, int targetMonths);
}
