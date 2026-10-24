package com.assetflow.assets;

import java.util.List;

/**
 * 자산 원장(리포지토리 자리). §39 DB 전략: postgres 프로필에서 PostgresAssetLedger 가
 * 이 계약을 구현하고, 그 밖의 환경(테스트·CI)은 InMemoryAssetLedger 가 구현한다.
 * API 계약(§40)은 구현과 무관하게 동일하다.
 * §31.1: 합계·구성비는 여기서 만들지 않는다 — 행만 보관한다.
 */
public interface AssetLedger {

    record AssetRow(long id, String accountType, String name, String institutionName,
                    long balance, boolean isDebt, String openedAt) {}

    List<AssetRow> all();

    /** 없으면 null. */
    AssetRow byId(long id);

    AssetRow create(String accountType, String name, String institutionName,
                    long balance, boolean isDebt, String openedAt);

    AssetRow update(long id, String accountType, String name, String institutionName,
                    long balance, boolean isDebt, String openedAt);

    void delete(long id);
}
