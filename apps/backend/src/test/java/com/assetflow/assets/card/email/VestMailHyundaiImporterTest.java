package com.assetflow.assets.card.email;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 현대카드 VestMail 수집기 통합 흐름 테스트 (§63).
 *
 * <p>실제 IMAP/Playwright는 mock/substitution으로 대체하고, 설정 복호화 → 첨부 다운로드
 * → 거래 행 추출 → 원장 저장 → 상태 갱신 흐름을 검증한다.</p>
 */
@ExtendWith(MockitoExtension.class)
class VestMailHyundaiImporterTest {

    @Mock
    private CardImportLedger ledger;

    @Mock
    private CardEmailImportSettingsLedger settingsLedger;

    private final CardImportCipher cipher = new CardImportCipher("test-key", null);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void disabledSettingDoesNothing() {
        CardEmailAttachmentDownloader downloader = (email, password, workDir) -> {
            throw new AssertionError("should not be called");
        };
        VestMailHyundaiImporter importer = new VestMailHyundaiImporter(
                cipher, ledger, settingsLedger, objectMapper, downloader, "");

        CardEmailImportSettings settings = new CardEmailImportSettings(
                1L, 1L, false, "hyundaicard", "gmail", "a@b.com",
                cipher.encrypt("app-pass"), cipher.encrypt("vest-pass"), null, null);

        int result = importer.importForUser(settings);

        assertThat(result).isZero();
        verify(ledger, never()).addAll(any());
        verify(settingsLedger, never()).save(any());
    }

    @Test
    void importsRowsAndSavesSuccessStatus() throws Exception {
        Path fakeHtml = Files.createTempFile("hyundai", ".html");
        fakeHtml.toFile().deleteOnExit();

        CardEmailAttachmentDownloader downloader = (email, password, workDir) -> fakeHtml;

        CardImportLedger.ImportedRow row = new CardImportLedger.ImportedRow(
                "key", "2026-10-02", "가맹점A", 10000, 0, 10000,
                "본인 카드", null, null, null, null, "본인", "hyundaicard");

        VestMailHyundaiImporter importer = new VestMailHyundaiImporter(
                cipher, ledger, settingsLedger, objectMapper, downloader, "") {
            @Override
            protected List<CardImportLedger.ImportedRow> extractRows(Path htmlFile,
                                                                     String vestmailPassword,
                                                                     String year,
                                                                     Long userId) {
                assertThat(htmlFile).isEqualTo(fakeHtml);
                return List.of(row);
            }
        };

        CardEmailImportSettings settings = new CardEmailImportSettings(
                1L, 1L, true, "hyundaicard", "gmail", "a@b.com",
                cipher.encrypt("app-pass"), cipher.encrypt("vest-pass"), null, null);

        int result = importer.importForUser(settings);

        assertThat(result).isEqualTo(1);

        ArgumentCaptor<List<CardImportLedger.ImportedRow>> rowsCaptor = ArgumentCaptor.captor();
        verify(ledger, times(1)).addAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).containsExactly(row);

        ArgumentCaptor<CardEmailImportSettings> settingsCaptor = ArgumentCaptor.forClass(CardEmailImportSettings.class);
        verify(settingsLedger, times(1)).save(settingsCaptor.capture());
        assertThat(settingsCaptor.getValue().lastImportStatus()).isEqualTo("SUCCESS");
        assertThat(settingsCaptor.getValue().lastImportAt()).isNotNull();
    }

    @Test
    void noAttachmentSavesNoMailStatus() throws Exception {
        CardEmailAttachmentDownloader downloader = (email, password, workDir) -> null;
        VestMailHyundaiImporter importer = new VestMailHyundaiImporter(
                cipher, ledger, settingsLedger, objectMapper, downloader, "");

        CardEmailImportSettings settings = new CardEmailImportSettings(
                1L, 1L, true, "hyundaicard", "gmail", "a@b.com",
                cipher.encrypt("app-pass"), cipher.encrypt("vest-pass"), null, null);

        int result = importer.importForUser(settings);

        assertThat(result).isZero();
        verify(ledger, never()).addAll(any());

        ArgumentCaptor<CardEmailImportSettings> settingsCaptor = ArgumentCaptor.forClass(CardEmailImportSettings.class);
        verify(settingsLedger, times(1)).save(settingsCaptor.capture());
        assertThat(settingsCaptor.getValue().lastImportStatus()).isEqualTo("NO_MAIL");
    }
}
