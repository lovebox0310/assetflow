package com.assetflow.assets.card.email;

import java.time.Instant;

/**
 * 이메일 명세서 자동 수집 설정 (§63).
 *
 * <p>비밀번호 필드는 평문이 아닌 AES/GCM 암호문이다.
 * {@link com.assetflow.assets.card.CardImportCipher}로 암호화/복호화한다.</p>
 *
 * @param id 설정 ID
 * @param userId 사용자 ID
 * @param enabled 자동 수집 사용 여부
 * @param cardCompany 카드사 — 현재는 {@code hyundaicard}만 지원
 * @param emailProvider 이메일 서비스 — 현재는 {@code gmail}만 지원
 * @param emailAddress 이메일 주소
 * @param emailPasswordEnc IMAP 앱 비밀번호 암호문
 * @param vestmailPasswordEnc VestMail 복호화 비밀번호 암호문
 * @param lastImportAt 마지막 수집 시각
 * @param lastImportStatus 마지막 수집 상태
 */
public record CardEmailImportSettings(
        Long id,
        Long userId,
        boolean enabled,
        String cardCompany,
        String emailProvider,
        String emailAddress,
        String emailPasswordEnc,
        String vestmailPasswordEnc,
        Instant lastImportAt,
        String lastImportStatus) {

    public CardEmailImportSettings withId(Long id) {
        return new CardEmailImportSettings(id, userId, enabled, cardCompany, emailProvider,
                emailAddress, emailPasswordEnc, vestmailPasswordEnc, lastImportAt, lastImportStatus);
    }

    public CardEmailImportSettings withLastImport(String status, Instant at) {
        return new CardEmailImportSettings(id, userId, enabled, cardCompany, emailProvider,
                emailAddress, emailPasswordEnc, vestmailPasswordEnc, at, status);
    }
}
