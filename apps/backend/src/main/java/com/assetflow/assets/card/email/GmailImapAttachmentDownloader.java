package com.assetflow.assets.card.email;

import jakarta.mail.BodyPart;
import jakarta.mail.Folder;
import jakarta.mail.Message;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.Store;
import jakarta.mail.search.FromStringTerm;
import jakarta.mail.search.SearchTerm;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Properties;

/**
 * Gmail IMAP을 통해 현대카드 VestMail 명세서 첨부를 다운로드한다 (§63).
 */
@Component
public class GmailImapAttachmentDownloader implements CardEmailAttachmentDownloader {

    private static final String SENDER = "webmaster@hcs.com";
    private static final String SUBJECT_KEYWORD = "개인카드명세서";
    private static final String ATTACHMENT_NAME = "hyundaicard.html";

    @Override
    public Path download(String email, String password, Path workDir) throws Exception {
        Properties props = new Properties();
        props.setProperty("mail.store.protocol", "imaps");
        props.setProperty("mail.imaps.host", "imap.gmail.com");
        props.setProperty("mail.imaps.port", "993");
        Session session = Session.getInstance(props, null);

        try (Store store = session.getStore("imaps")) {
            store.connect("imap.gmail.com", email, password);
            Folder inbox = store.getFolder("INBOX");
            inbox.open(Folder.READ_ONLY);

            // 발신자로만 검색한 뒤 제목은 Java 에서 필터링한다.
            // SubjectTerm 은 한국어 인코딩에서 부분 문자열 매칭이 실패할 수 있다.
            SearchTerm term = new FromStringTerm(SENDER);
            Message[] messages = inbox.search(term);

            List<Message> sorted = new ArrayList<>();
            for (Message m : messages) {
                if (m.getSentDate() != null) {
                    String subject = m.getSubject();
                    if (subject != null && subject.contains(SUBJECT_KEYWORD)) {
                        sorted.add(m);
                    }
                }
            }
            sorted.sort(Comparator.comparing((Message m) -> {
                try {
                    return m.getSentDate().toInstant();
                } catch (Exception e) {
                    return Instant.EPOCH;
                }
            }).reversed());

            for (Message message : sorted) {
                Object content = message.getContent();
                if (!(content instanceof Multipart multipart)) {
                    continue;
                }
                for (int i = 0; i < multipart.getCount(); i++) {
                    BodyPart part = multipart.getBodyPart(i);
                    String disposition = part.getDisposition();
                    String fileName = part.getFileName();
                    if (Part.ATTACHMENT.equalsIgnoreCase(disposition)
                            && fileName != null
                            && fileName.toLowerCase().contains("hyundaicard")
                            && fileName.toLowerCase().endsWith(".html")) {
                        Path out = workDir.resolve(ATTACHMENT_NAME);
                        try (InputStream is = part.getInputStream()) {
                            Files.copy(is, out, StandardCopyOption.REPLACE_EXISTING);
                        }
                        inbox.close(false);
                        return out;
                    }
                }
            }
            inbox.close(false);
            return null;
        }
    }
}
