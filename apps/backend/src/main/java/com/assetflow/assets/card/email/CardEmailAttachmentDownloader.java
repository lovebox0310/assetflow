package com.assetflow.assets.card.email;

import java.nio.file.Path;

/**
 * 이메일 명세서 첨부 파일 다운로더 계약 (§63).
 *
 * <p>구현체는 IMAP 등으로 메일을 수신하고, 지정된 카드사 명세서 첨부 파일을
 * {@code workDir}에 저장한 뒤 그 경로를 반환한다. 첨부가 없으면 {@code null}을
 * 반환한다.</p>
 */
public interface CardEmailAttachmentDownloader {

    /**
     * @param email 이메일 주소
     * @param password 이메일 계정 비밀번호(IMAP 앱 비밀번호 등)
     * @param workDir 첨부 파일을 저장할 임시 디렉토리
     * @return 저장된 첨부 파일 경로, 없으면 null
     */
    Path download(String email, String password, Path workDir) throws Exception;
}
