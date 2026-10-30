package com.assetflow.settings;

import java.util.List;

/** 사용자 설정 원장 계약 (§46 — 프로필·비상금 기준의 저장처, users 테이블). */
public interface UserSettingsLedger {

    /**
     * §59 비상금 유지 개월 기준.
     *
     * emergencyAccountIds 는 사용자가 비상금 통장으로 지정한 **현금성(cash) 계좌 id** 목록이다.
     * 자산 계좌 id 의 문자열 표현(대시보드 자산 id 와 같은 형식)이며, 분자는 이 계좌들의
     * 잔액 **합계**다. 용도가 정해진 계좌(자동이체·부가세 등)는 지정하지 않는 방식으로 제외한다.
     */
    record UserSettings(long id, String email, String displayName, int targetMonths,
                        List<String> emergencyAccountIds, int emergencyAvgMonths,
                        List<String> emergencyCategories) {}

    UserSettings get(String email);

    /** 설정 전체 갱신 — 갱신 후 값을 돌려준다. 없는 사용자면 null. */
    UserSettings update(String email, int targetMonths, List<String> emergencyAccountIds,
                        int emergencyAvgMonths, List<String> emergencyCategories);
}
