package com.assetflow.investments.upbit;

import java.util.Optional;

/**
 * 업비트 자격증명 원장 계약 (UPBIT-2). 사용자당 1행.
 * 저장 값은 암호문이며, 복호화는 {@link UpbitCredentialsService} 책임이다.
 */
public interface UpbitCredentialsLedger {

    Optional<UpbitCredentials> findByUserId(long userId);

    UpbitCredentials save(long userId, UpbitCredentials credentials);

    void delete(long userId);
}
