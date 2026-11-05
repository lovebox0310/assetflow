package com.assetflow.assets.card.email;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Component
@Profile("!postgres")
public class InMemoryCardEmailImportSettingsLedger implements CardEmailImportSettingsLedger {

    private final Map<Long, CardEmailImportSettings> store = new ConcurrentHashMap<>();
    private final AtomicLong idGenerator = new AtomicLong(1);

    @Override
    public Optional<CardEmailImportSettings> findByUserIdAndCardCompany(Long userId, String cardCompany) {
        return store.values().stream()
                .filter(s -> s.userId().equals(userId) && s.cardCompany().equals(cardCompany))
                .findFirst();
    }

    @Override
    public List<CardEmailImportSettings> findByUserId(Long userId) {
        return store.values().stream()
                .filter(s -> s.userId().equals(userId))
                .toList();
    }

    @Override
    public List<CardEmailImportSettings> findEnabled() {
        return store.values().stream()
                .filter(CardEmailImportSettings::enabled)
                .toList();
    }

    @Override
    public CardEmailImportSettings save(CardEmailImportSettings settings) {
        Optional<CardEmailImportSettings> existing =
                findByUserIdAndCardCompany(settings.userId(), settings.cardCompany());
        if (existing.isPresent()) {
            CardEmailImportSettings updated = new CardEmailImportSettings(
                    existing.get().id(),
                    settings.userId(), settings.enabled(), settings.cardCompany(),
                    settings.emailProvider(), settings.emailAddress(),
                    settings.emailPasswordEnc(), settings.vestmailPasswordEnc(),
                    settings.lastImportAt(), settings.lastImportStatus());
            store.put(existing.get().id(), updated);
            return updated;
        }
        Long id = idGenerator.getAndIncrement();
        CardEmailImportSettings saved = settings.withId(id);
        store.put(id, saved);
        return saved;
    }

    @Override
    public void delete(Long userId, String cardCompany) {
        store.values().removeIf(s -> s.userId().equals(userId) && s.cardCompany().equals(cardCompany));
    }
}
