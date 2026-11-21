package com.assetflow.investments.toss;

import com.assetflow.assets.card.CardImportCipher;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #55: 저장은 암호문, 조회 복원은 서비스 안에서만 — AES/GCM 왕복을 확인한다.
 */
class TossCredentialsServiceTest {

    @Test
    void saveEncryptsAndFindDecryptedRestoresPlaintext() {
        InMemoryTossCredentialsLedger ledger = new InMemoryTossCredentialsLedger();
        TossCredentialsService service = new TossCredentialsService(
                ledger, new CardImportCipher("test-key", null));

        service.save(1L, new TossCredentials(7L, "client-id", "client-secret", "seq-1"));

        TossCredentials stored = ledger.findByUserId(1L).orElseThrow();
        assertThat(stored.clientId()).isNotEqualTo("client-id");
        assertThat(stored.clientSecret()).isNotEqualTo("client-secret");
        // 계좌 ID·토스 계좌 식별자는 암호화 대상이 아니다(화면 표시용).
        assertThat(stored.accountId()).isEqualTo(7L);
        assertThat(stored.tossAccountSeq()).isEqualTo("seq-1");

        TossCredentials decrypted = service.findDecrypted(1L).orElseThrow();
        assertThat(decrypted.clientId()).isEqualTo("client-id");
        assertThat(decrypted.clientSecret()).isEqualTo("client-secret");
        assertThat(decrypted.hasCredentials()).isTrue();

        service.delete(1L);
        assertThat(service.findDecrypted(1L)).isEmpty();
    }
}
