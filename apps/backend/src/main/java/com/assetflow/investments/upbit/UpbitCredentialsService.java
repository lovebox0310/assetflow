package com.assetflow.investments.upbit;

import com.assetflow.assets.card.CardImportCipher;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * 업비트 자격증명의 암호화/복호화 (UPBIT-2).
 * KIS 자격증명과 같은 {@link CardImportCipher}(AES/GCM)를 쓴다.
 * 평문은 서비스 경계 밖으로 내보내지 않으며, API 응답에는 마스킹 값만 쓴다.
 */
@Service
public class UpbitCredentialsService {

    private final UpbitCredentialsLedger ledger;
    private final CardImportCipher cipher;

    public UpbitCredentialsService(UpbitCredentialsLedger ledger, CardImportCipher cipher) {
        this.ledger = ledger;
        this.cipher = cipher;
    }

    /** 저장된 암호문을 복호화해 평문 자격증명을 돌려준다. 없으면 empty. */
    public Optional<UpbitCredentials> findDecrypted(long userId) {
        return ledger.findByUserId(userId).map(this::decrypt);
    }

    /** 평문 자격증명을 암호화해 저장한다(사용자당 1행 upsert). */
    public UpbitCredentials save(long userId, UpbitCredentials plain) {
        UpbitCredentials encrypted = new UpbitCredentials(
                cipher.encrypt(plain.accessKey()), cipher.encrypt(plain.secretKey()));
        return decrypt(ledger.save(userId, encrypted));
    }

    public void delete(long userId) {
        ledger.delete(userId);
    }

    /** API 응답용 마스킹: 앞 4 + **** + 뒤 4. 짧은 키는 전체를 가린다. */
    public static String mask(String key) {
        if (key == null || key.length() <= 8) {
            return "****";
        }
        return key.substring(0, 4) + "****" + key.substring(key.length() - 4);
    }

    private UpbitCredentials decrypt(UpbitCredentials encrypted) {
        return new UpbitCredentials(
                cipher.decrypt(encrypted.accessKey()), cipher.decrypt(encrypted.secretKey()));
    }
}
