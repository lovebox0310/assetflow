package com.assetflow.investments.toss;

import com.assetflow.assets.card.CardImportCipher;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * 토스증권 자격증명의 암호화/복호화 (이슈 #55 Stage 1).
 *
 * <p>업비트·KIS 자격증명과 같은 {@link CardImportCipher}(AES/GCM)를 쓴다.
 * 평문은 서비스 경계 밖으로 내보내지 않으며, API 응답에는 계좌 ID·보유 여부만 쓴다.</p>
 */
@Service
public class TossCredentialsService {

    private final TossCredentialsLedger ledger;
    private final CardImportCipher cipher;

    public TossCredentialsService(TossCredentialsLedger ledger, CardImportCipher cipher) {
        this.ledger = ledger;
        this.cipher = cipher;
    }

    /** 저장된 암호문을 복호화해 평문 자격증명을 돌려준다. 없으면 empty. */
    public Optional<TossCredentials> findDecrypted(long userId) {
        return ledger.findByUserId(userId).map(this::decrypt);
    }

    /** 평문 자격증명을 암호화해 저장한다(account_id 기준 upsert). */
    public TossCredentials save(long userId, TossCredentials plain) {
        TossCredentials encrypted = new TossCredentials(
                plain.accountId(),
                cipher.encrypt(plain.clientId()),
                cipher.encrypt(plain.clientSecret()),
                plain.tossAccountSeq());
        return decrypt(ledger.save(userId, encrypted));
    }

    public void delete(long userId) {
        ledger.delete(userId);
    }

    private TossCredentials decrypt(TossCredentials encrypted) {
        return new TossCredentials(
                encrypted.accountId(),
                cipher.decrypt(encrypted.clientId()),
                cipher.decrypt(encrypted.clientSecret()),
                encrypted.tossAccountSeq());
    }
}
