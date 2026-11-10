package com.assetflow.investments.upbit;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 업비트 자격증명 원장의 인메모리 구현 (테스트·CI). 사용자당 1행.
 */
@Component
@Profile("!postgres")
public class InMemoryUpbitCredentialsLedger implements UpbitCredentialsLedger {

    private final Map<Long, UpbitCredentials> store = new ConcurrentHashMap<>();

    @Override
    public Optional<UpbitCredentials> findByUserId(long userId) {
        return Optional.ofNullable(store.get(userId));
    }

    @Override
    public UpbitCredentials save(long userId, UpbitCredentials credentials) {
        store.put(userId, credentials);
        return credentials;
    }

    @Override
    public void delete(long userId) {
        store.remove(userId);
    }
}
