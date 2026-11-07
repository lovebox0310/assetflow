package com.assetflow.assets;

import java.util.List;

/**
 * 사용자 사업자번호 규칙 원장 (§67, §73).
 *
 * <p>사용자가 카드를 분류하면 가맹점명 규칙(`merchant_rules`)과 함께 사업자번호
 * 규칙을 저장한다. 사업자번호가 여러 가맹점에 공유되는 PG 번호는 가맹점 패턴으로
 * 나눠 저장해 오분류를 막는다.</p>
 */
public interface MerchantBusinessCategoryLedger {

    record Mapping(long id, String businessNo, String merchantPattern,
                   String category, String subCategory, String source) {}

    List<Mapping> mappingsFor(String businessNo);

    /** 해당 사업자번호에 패턴 매핑(시드 포함)이 있는지 — 공유 PG 번호 판단용. */
    boolean hasPatternMapping(String businessNo);

    /** (사업자번호, 패턴)이 같으면 갱신한다. source='user' 로 저장한다. */
    void upsertUser(String businessNo, String merchantPattern, String category, String subCategory);

    /**
     * 사용자가 분류를 되돌릴 때 해당 (사업자번호, 패턴) user 매핑을 지운다.
     * 패턴이 비어 있으면 일반 매핑을 지운다.
     */
    void deleteUserMapping(String businessNo, String merchantPattern);
}
