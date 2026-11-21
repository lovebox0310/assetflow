package com.assetflow.investments.toss;

import java.util.Optional;

/**
 * 토스증권 자격증명 원장 계약 (이슈 #55 Stage 1).
 *
 * <p>DB 에는 계좌별 1행으로 저장하지만, 이번 단계의 화면·API 는 사용자 단위 상태만
 * 보여 주므로 조회는 사용자 기준 대표 1행을 돌려준다. 저장 값은 암호문이며 복호화는
 * {@link TossCredentialsService} 책임이다.</p>
 */
public interface TossCredentialsLedger {

    Optional<TossCredentials> findByUserId(long userId);

    TossCredentials save(long userId, TossCredentials credentials);

    void delete(long userId);
}
