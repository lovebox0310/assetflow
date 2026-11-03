package com.assetflow.assets.bank;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** §61: 계좌번호는 AES/GCM 으로만 저장하고, 화면에는 마지막 4자리만 보여 준다. */
class BankAccountCipherTest {

    private static final String KEY = "test-bank-link-key-0123456789";

    @Test
    void encryptThenDecryptRoundTrips() {
        BankAccountCipher cipher = new BankAccountCipher(KEY, "");
        String accountNumber = "1002345678901";

        String encrypted = cipher.encrypt(accountNumber);

        assertNotEquals(accountNumber, encrypted);
        assertFalse(encrypted.contains(accountNumber));
        assertEquals(accountNumber, cipher.decrypt(encrypted));
    }

    @Test
    void sameInputProducesDifferentCiphertexts() {
        BankAccountCipher cipher = new BankAccountCipher(KEY, "");

        String first = cipher.encrypt("123456789012");
        String second = cipher.encrypt("123456789012");

        // 매번 새 IV 를 쓰므로 같은 계좌번호라도 암호문이 달라야 한다.
        assertNotEquals(first, second);
        assertEquals("123456789012", cipher.decrypt(first));
        assertEquals("123456789012", cipher.decrypt(second));
    }

    @Test
    void differentKeyCannotDecrypt() {
        BankAccountCipher writer = new BankAccountCipher(KEY, "");
        BankAccountCipher reader = new BankAccountCipher("another-key-987654321", "");

        String encrypted = writer.encrypt("123456789012");

        assertThrows(IllegalStateException.class, () -> reader.decrypt(encrypted));
    }

    @Test
    void fallsBackToJwtSecretWhenLinkKeyIsBlank() {
        BankAccountCipher cipher = new BankAccountCipher("", "jwt-secret-0123456789-0123456789");
        assertEquals("123456789012", cipher.decrypt(cipher.encrypt("123456789012")));
    }

    @Test
    void maskKeepsOnlyLastFourDigits() {
        assertEquals("****8901", BankAccountCipher.mask("1002345678901"));
        assertEquals("****", BankAccountCipher.mask("1234"));
        assertEquals("****", BankAccountCipher.mask(null));
    }
}
