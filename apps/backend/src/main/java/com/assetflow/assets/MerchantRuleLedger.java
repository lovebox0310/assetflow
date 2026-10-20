package com.assetflow.assets;

import java.util.Map;
import java.util.Set;

/**
 * 가맹점 용도구분 자동 승계 규칙 원장 (§49).
 * 사용자가 한 번 분류한 가맹점(merchant_name)은 다음 카드 반영 때
 * 같은 expense_kind 를 자동으로 제안한다.
 */
public interface MerchantRuleLedger {

    Map<String, String> allRules();

    Map<String, String> rulesFor(Set<String> merchantNames);

    void saveAll(Map<String, String> rules);
}
