package com.assetflow.investments.kis;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * KIS 자격증명 원장의 인메모리 구현. 테스트·CI 환경용.
 */
@Component
@Profile("!postgres")
public class InMemoryKisCredentialsLedger implements KisCredentialsLedger {

    private final Map<Long, KisCredentials> store = new ConcurrentHashMap<>();

    @Override
    public Optional<KisCredentials> findByAccountId(long accountId) {
        return Optional.ofNullable(store.get(accountId));
    }

    @Override
    public List<KisCredentials> findByUserId(long userId) {
        // 인메모리 구현에서는 user_id 구분 없이 전체를 반환한다.
        return new ArrayList<>(store.values());
    }

    @Override
    public KisCredentials save(long userId, KisCredentials credentials) {
        store.put(credentials.accountId(), credentials);
        return credentials;
    }

    @Override
    public void delete(long userId, long accountId) {
        store.remove(accountId);
    }
}
