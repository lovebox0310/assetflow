package com.assetflow.investments.kis;

import com.assetflow.assets.card.CardImportCipher;
import org.springframework.stereotype.Service;

/**
 * KIS 계좌별 자격증명의 암호화/복호화 및 변환을 담당한다 (§62.2).
 *
 * <p>DB에는 AES/GCM 암호문으로 저장하고, 외부(API/FE)와는 평문 DTO로 주고받는다.</p>
 */
@Service
public class KisCredentialsService {

    private final KisCredentialsLedger ledger;
    private final CardImportCipher cipher;

    public KisCredentialsService(KisCredentialsLedger ledger, CardImportCipher cipher) {
        this.ledger = ledger;
        this.cipher = cipher;
    }

    /**
     * DB에서 읽어 복호화한 평문 자격증명을 반환한다.
     */
    public KisCredentials findDecrypted(long accountId) {
        return ledger.findByAccountId(accountId)
                .map(this::decrypt)
                .orElse(null);
    }

    /**
     * 평문 자격증명을 암호화하여 저장한다.
     */
    public KisCredentials save(long userId, KisCredentials plain) {
        KisCredentials encrypted = new KisCredentials(
                plain.accountId(),
                cipher.encrypt(plain.appKey()),
                cipher.encrypt(plain.appSecret()),
                plain.baseUrl(),
                plain.cano(),
                plain.acntPrdtCd());
        return decrypt(ledger.save(userId, encrypted));
    }

    public void delete(long userId, long accountId) {
        ledger.delete(userId, accountId);
    }

    private KisCredentials decrypt(KisCredentials encrypted) {
        return new KisCredentials(
                encrypted.accountId(),
                cipher.decrypt(encrypted.appKey()),
                cipher.decrypt(encrypted.appSecret()),
                encrypted.baseUrl(),
                encrypted.cano(),
                encrypted.acntPrdtCd());
    }

    /**
     * API 응답용: appKey/appSecret 을 마스킹한 자격증명.
     */
    public KisCredentials mask(KisCredentials plain) {
        return new KisCredentials(
                plain.accountId(),
                maskKey(plain.appKey()),
                maskKey(plain.appSecret()),
                plain.baseUrl(),
                plain.cano(),
                plain.acntPrdtCd());
    }

    private static String maskKey(String key) {
        if (key == null || key.length() <= 8) {
            return "****";
        }
        return key.substring(0, 4) + "****" + key.substring(key.length() - 4);
    }
}
