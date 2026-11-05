package com.assetflow.assets.card;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * 카드 자동 수집 자격증명 암호화 (§63.6).
 *
 * <p>AES/GCM으로 VestMail 비밀번호와 Gmail IMAP 앱 비밀번호를 암호화한다.
 * 키는 {@code app.card.import-key}, 없으면 {@code app.jwt-secret}을 SHA-256으로
 * 32바이트로 줄여 쓴다. 둘 다 없으면(로컬 개발) 기동마다 무작위 키를 만든다.</p>
 */
@Component
public class CardImportCipher {

    private static final Logger log = LoggerFactory.getLogger(CardImportCipher.class);

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public CardImportCipher(@Value("${app.card.import-key:}") String importKey,
                            @Value("${app.jwt-secret:}") String jwtSecret) {
        String source = importKey != null && !importKey.isBlank() ? importKey : jwtSecret;
        byte[] raw;
        if (source == null || source.isBlank()) {
            raw = new byte[32];
            random.nextBytes(raw);
            log.warn("app.card.import-key/app.jwt-secret 이 없어 카드 수집 암호화 키를 기동마다 새로 만듭니다. "
                    + "재시작하면 저장된 비밀번호를 복호화할 수 없습니다. 운영에서는 키를 고정하세요.");
        } else {
            raw = sha256(source);
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    public String encrypt(String plain) {
        if (plain == null) {
            throw new IllegalArgumentException("plain text is required");
        }
        try {
            byte[] iv = new byte[IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            ByteBuffer buffer = ByteBuffer.allocate(iv.length + encrypted.length);
            buffer.put(iv).put(encrypted);
            return Base64.getEncoder().encodeToString(buffer.array());
        } catch (Exception e) {
            throw new IllegalStateException("failed to encrypt card import credential", e);
        }
    }

    public String decrypt(String encoded) {
        if (encoded == null) {
            throw new IllegalArgumentException("encrypted text is required");
        }
        try {
            byte[] all = Base64.getDecoder().decode(encoded);
            if (all.length <= IV_BYTES) {
                throw new IllegalArgumentException("encrypted text is too short");
            }
            byte[] iv = Arrays.copyOfRange(all, 0, IV_BYTES);
            byte[] cipherText = Arrays.copyOfRange(all, IV_BYTES, all.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("failed to decrypt card import credential", e);
        }
    }

    private static byte[] sha256(String source) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
