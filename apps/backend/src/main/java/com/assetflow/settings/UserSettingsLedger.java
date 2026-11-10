package com.assetflow.settings;

import java.util.List;

/** 사용자 설정 원장 계약 (§46 — 프로필·비상금 기준의 저장처, users 테이블). */
public interface UserSettingsLedger {

    /**
     * §59·§62 비상금 유지 개월 기준.
     *
     * emergencyAccountIds 는 사용자가 비상금 계좌로 지정한 **현금성(cash) + 증권(invest)**
     * 계좌 id 목록이다. 자산 계좌 id 의 문자열 표현(대시보드 자산 id 와 같은 형식)이며,
     * 분자는 이 계좌들의 **예수금(balance) 합계**다(§62 — invest 평가액은 제외).
     * 용도가 정해진 계좌(자동이체·부가세 등)는 지정하지 않는 방식으로 제외한다.
     */
    /**
     * §89 compositionCashAccountIds: 자산 구성비에서 **전액 현금성**으로 볼 계좌 id 목록.
     * 비상금(emergencyAccountIds)과 독립이다. 유형 제한은 없고 부채만 제외하며,
     * 빈 목록이면 §88 기본 규칙(증권 예수금만 현금성, 투자는 보유종목 평가액)을 따른다.
     */
    record UserSettings(long id, String email, String displayName, int targetMonths,
                        List<String> emergencyAccountIds, int emergencyAvgMonths,
                        List<String> emergencyCategories, List<String> compositionCashAccountIds) {}

    UserSettings get(String email);

    /** 설정 전체 갱신 — 갱신 후 값을 돌려준다. 없는 사용자면 null. */
    UserSettings update(String email, int targetMonths, List<String> emergencyAccountIds,
                        int emergencyAvgMonths, List<String> emergencyCategories,
                        List<String> compositionCashAccountIds);
}
