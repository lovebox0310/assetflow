package com.assetflow.assets.card;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CardImportCipherTest {

    @Test
    void encryptAndDecryptRoundTrip() {
        CardImportCipher cipher = new CardImportCipher("test-import-key", null);
        String plain = "my-app-password-1234";
        String encrypted = cipher.encrypt(plain);

        assertThat(encrypted).isNotEqualTo(plain);
        assertThat(cipher.decrypt(encrypted)).isEqualTo(plain);
    }

    @Test
    void fallsBackToJwtSecret() {
        CardImportCipher cipher = new CardImportCipher("", "jwt-secret-for-test");
        String plain = "vestmail-password";
        String encrypted = cipher.encrypt(plain);

        assertThat(cipher.decrypt(encrypted)).isEqualTo(plain);
    }

    @Test
    void differentPlainTextsProduceDifferentCiphertexts() {
        CardImportCipher cipher = new CardImportCipher("key", null);
        String a = cipher.encrypt("password-a");
        String b = cipher.encrypt("password-b");

        assertThat(a).isNotEqualTo(b);
    }

    @Test
    void rejectsNullPlaintext() {
        CardImportCipher cipher = new CardImportCipher("key", null);
        assertThatThrownBy(() -> cipher.encrypt(null))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
