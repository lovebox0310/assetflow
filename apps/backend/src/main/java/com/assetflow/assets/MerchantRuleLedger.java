package com.assetflow.assets;

import java.util.Map;
import java.util.Set;

/**
 * 가맹점 카테고리 자동 승계 규칙 원장 (§49, §55.8).
 * 사용자가 한 번 분류한 가맹점(merchant_name)은 다음 카드 반영 때
 * 같은 카테고리(대분류 + 세부)를 자동으로 제안한다.
 */
public interface MerchantRuleLedger {

    /** 저장된 규칙의 대분류만 — 기존 화면/임포트 미리보기 계약. */
    Map<String, String> allRules();

    Map<String, String> rulesFor(Set<String> merchantNames);

    /** 대분류 + 세부까지 필요한 경로(분류기)용. */
    Map<String, MerchantRule> allRuleDetails();

    Map<String, MerchantRule> ruleDetailsFor(Set<String> merchantNames);

    /** 기존 계약: 대분류만 저장한다(세부는 비운다). */
    void saveAll(Map<String, String> rules);

    void saveAllDetails(Map<String, MerchantRule> rules);

    /** 사용자가 되돌린 가맹점 규칙을 지운다 (§55.8 미분류 작업함 되돌리기). */
    void delete(String merchantName);

    record MerchantRule(String category, String subCategory) {}
}
