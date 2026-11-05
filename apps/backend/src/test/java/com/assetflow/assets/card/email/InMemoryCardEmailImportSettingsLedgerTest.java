package com.assetflow.assets.card.email;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InMemoryCardEmailImportSettingsLedgerTest {

    private final InMemoryCardEmailImportSettingsLedger ledger =
            new InMemoryCardEmailImportSettingsLedger();

    @Test
    void saveAndFind() {
        CardEmailImportSettings settings = new CardEmailImportSettings(
                null, 1L, true, "hyundaicard", "gmail",
                "user@example.com", "enc-email", "enc-vestmail", null, null);

        CardEmailImportSettings saved = ledger.save(settings);

        assertThat(saved.id()).isNotNull();
        assertThat(ledger.findByUserIdAndCardCompany(1L, "hyundaicard"))
                .isPresent()
                .hasValueSatisfying(s -> {
                    assertThat(s.emailAddress()).isEqualTo("user@example.com");
                    assertThat(s.enabled()).isTrue();
                });
    }

    @Test
    void updateExisting() {
        ledger.save(new CardEmailImportSettings(
                null, 1L, true, "hyundaicard", "gmail",
                "a@example.com", "enc1", "enc2", null, null));
        ledger.save(new CardEmailImportSettings(
                null, 1L, false, "hyundaicard", "gmail",
                "b@example.com", "enc3", "enc4", null, null));

        CardEmailImportSettings updated = ledger.findByUserIdAndCardCompany(1L, "hyundaicard").orElseThrow();
        assertThat(updated.enabled()).isFalse();
        assertThat(updated.emailAddress()).isEqualTo("b@example.com");
    }

    @Test
    void findEnabled() {
        ledger.save(new CardEmailImportSettings(
                null, 1L, true, "hyundaicard", "gmail",
                "a@example.com", "enc1", "enc2", null, null));
        ledger.save(new CardEmailImportSettings(
                null, 2L, false, "hyundaicard", "gmail",
                "b@example.com", "enc3", "enc4", null, null));

        assertThat(ledger.findEnabled()).hasSize(1);
        assertThat(ledger.findEnabled().get(0).userId()).isEqualTo(1L);
    }

    @Test
    void delete() {
        ledger.save(new CardEmailImportSettings(
                null, 1L, true, "hyundaicard", "gmail",
                "a@example.com", "enc1", "enc2", null, null));
        ledger.delete(1L, "hyundaicard");

        assertThat(ledger.findByUserIdAndCardCompany(1L, "hyundaicard")).isEmpty();
    }
}
