package com.assetflow.assets.bank;

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
 * 계좌번호 암호화(§61). AES/GCM — 기밀성과 무결성을 함께 얻는다.
 *
 * 키는 {@code BANK_LINK_KEY}, 없으면 {@code JWT_SECRET} 을 SHA-256 으로 32바이트로 줄여 쓴다.
 * 둘 다 없으면(로컬 개발) 기동마다 무작위 키를 만든다 — 재시작하면 기존 연결을 복호화할 수
 * 없으므로 운영에서는 반드시 BANK_LINK_KEY 또는 JWT_SECRET 을 고정한다.
 *
 * 계좌 비밀번호·생년월일은 여기저기 저장하지 않는다. 이 클래스는 계좌번호만 다룬다.
 */
@Component
public class BankAccountCipher {

    private static final Logger log = LoggerFactory.getLogger(BankAccountCipher.class);

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public BankAccountCipher(@Value("${app.bank.link-key:}") String linkKey,
                             @Value("${app.jwt-secret:}") String jwtSecret) {
        String source = linkKey != null && !linkKey.isBlank() ? linkKey : jwtSecret;
        byte[] raw;
        if (source == null || source.isBlank()) {
            raw = new byte[32];
            random.nextBytes(raw);
            log.warn("BANK_LINK_KEY/JWT_SECRET 이 없어 계좌번호 암호화 키를 기동마다 새로 만듭니다. "
                    + "재시작하면 기존 은행 연결을 복호화할 수 없습니다. 운영에서는 키를 고정하세요.");
        } else {
            raw = sha256(source);
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    public String encrypt(String plain) {
        if (plain == null) {
            throw new IllegalArgumentException("account number is required");
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
            throw new IllegalStateException("failed to encrypt account number", e);
        }
    }

    public String decrypt(String encoded) {
        if (encoded == null) {
            throw new IllegalArgumentException("encrypted account number is required");
        }
        try {
            byte[] all = Base64.getDecoder().decode(encoded);
            if (all.length <= IV_BYTES) {
                throw new IllegalArgumentException("encrypted account number is too short");
            }
            byte[] iv = Arrays.copyOfRange(all, 0, IV_BYTES);
            byte[] cipherText = Arrays.copyOfRange(all, IV_BYTES, all.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("failed to decrypt account number", e);
        }
    }

    /** 화면 표시용 마스킹 — 마지막 4자리만 남긴다. */
    public static String mask(String accountNumber) {
        if (accountNumber == null || accountNumber.length() <= 4) return "****";
        return "****" + accountNumber.substring(accountNumber.length() - 4);
    }

    private static byte[] sha256(String source) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }
}
