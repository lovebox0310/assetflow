package com.assetflow.investments.toss;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 토스증권 자격증명 원장의 인메모리 구현 (테스트·CI). 사용자당 1행.
 */
@Component
@Profile("!postgres")
public class InMemoryTossCredentialsLedger implements TossCredentialsLedger {

    private final Map<Long, TossCredentials> store = new ConcurrentHashMap<>();

    @Override
    public Optional<TossCredentials> findByUserId(long userId) {
        return Optional.ofNullable(store.get(userId));
    }

    @Override
    public TossCredentials save(long userId, TossCredentials credentials) {
        store.put(userId, credentials);
        return credentials;
    }

    @Override
    public void delete(long userId) {
        store.remove(userId);
    }
}
