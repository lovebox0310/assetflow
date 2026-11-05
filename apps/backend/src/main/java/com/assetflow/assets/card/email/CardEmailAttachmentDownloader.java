package com.assetflow.assets.card.email;

import java.nio.file.Path;

/**
 * 이메일 명세서 첨부 파일 다운로더 계약 (§63, §68).
 *
 * <p>구현체는 IMAP 등으로 메일을 수신하고, 지정된 카드사 명세서 첨부 파일을
 * {@code workDir}에 저장한 뒤 그 경로를 반환한다. 첨부가 없으면 {@code null}을
 * 반환한다.</p>
 *
 * <p>카드사마다 발신자·제목·첨부명이 다르므로 {@link MailCriteria} 를 **반드시**
 * 받는다. 조건을 무시하고 다른 카드사 첨부를 돌려주면 안 된다. 3-arg 메서드는
 * 현대카드용 하위 호환 편의 메서드다.</p>
 */
public interface CardEmailAttachmentDownloader {

    /** 카드사별 메일 검색 조건. */
    record MailCriteria(String sender, String subjectKeyword, String attachmentContains,
                        String attachmentExtension, String outputFileName) {

        public static MailCriteria hyundai() {
            return new MailCriteria("webmaster@hcs.com", "개인카드명세서",
                    "hyundaicard", ".html", "hyundaicard.html");
        }

        public static MailCriteria samsung() {
            // §68: "이용상세내역서" 메일에만 거래 표가 들어있다. "이용대금 명세서" 는
            // 페이로드가 1청크짜리 요약이라 제외한다. 발신자는 sscyber@samsungcard.com
            // 이지만 도메인 부분 문자열로 검색해 발신 계정 변경에도 견디게 한다.
            return new MailCriteria("samsungcard.com", "이용상세내역서",
                    "samsungcard_detail", ".html", "samsungcard_detail.html");
        }
    }

    /**
     * @param email 이메일 주소
     * @param password 이메일 계정 비밀번호(IMAP 앱 비밀번호 등)
     * @param workDir 첨부 파일을 저장할 임시 디렉토리
     * @param criteria 카드사별 검색 조건
     * @return 저장된 첨부 파일 경로, 없으면 null
     */
    Path download(String email, String password, Path workDir, MailCriteria criteria) throws Exception;

    /** 현대카드 기본 조건으로 다운로드한다. */
    default Path download(String email, String password, Path workDir) throws Exception {
        return download(email, password, workDir, MailCriteria.hyundai());
    }
}
