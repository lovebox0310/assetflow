package com.assetflow.investments.kis;

import java.util.List;
import java.util.Optional;

/**
 * KIS 계좌별 자격증명 원장 계약 (§62.2).
 */
public interface KisCredentialsLedger {

    Optional<KisCredentials> findByAccountId(long accountId);

    List<KisCredentials> findByUserId(long userId);

    KisCredentials save(long userId, KisCredentials credentials);

    void delete(long userId, long accountId);
}
