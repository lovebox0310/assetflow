package com.assetflow.assets.card.email;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.CardStatementLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.expenses.categories.InMemoryCategoryClassifier;
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

/**
 * 삼성카드 VestMail 수집기 통합 흐름 테스트 (§68).
 *
 * <p>실제 IMAP/Playwright는 mock/substitution으로 대체하고, 설정 복호화 → 첨부 다운로드
 * → 거래 행 추출 → 원장 저장 → 상태 갱신 흐름을 검증한다.</p>
 */
@ExtendWith(MockitoExtension.class)
class VestMailSamsungImporterTest {

    @Mock
    private CardImportLedger ledger;

    @Mock
    private CardStatementLedger statementLedger;

    @Mock
    private CardEmailImportSettingsLedger settingsLedger;

    private final CardImportCipher cipher = new CardImportCipher("test-key", null);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private CardEmailImportSettings settings(boolean enabled) {
        return new CardEmailImportSettings(
                1L, 1L, enabled, "samsungcard", "gmail", "a@b.com",
                cipher.encrypt("app-pass"), cipher.encrypt("vest-pass"), null, null);
    }

    @Test
    void disabledSettingDoesNothing() {
        CardEmailAttachmentDownloader downloader = (email, password, workDir, criteria) -> {
            throw new AssertionError("should not be called");
        };
        VestMailSamsungImporter importer = new VestMailSamsungImporter(
                cipher, ledger, statementLedger, settingsLedger, objectMapper, downloader,
                new InMemoryCategoryClassifier(), "");

        assertThat(importer.importForUser(settings(false))).isZero();
        verify(ledger, never()).addAll(any());
        verify(settingsLedger, never()).save(any());
    }

    @Test
    void importsRowsAndSavesSuccessStatus() throws Exception {
        Path fakeHtml = Files.createTempFile("samsung", ".html");
        fakeHtml.toFile().deleteOnExit();
        CardEmailAttachmentDownloader downloader = (email, password, workDir, criteria) -> {
            // §68: 삼성카드 메일만 골라야 한다 — 이용대금 명세서가 섞이면 안 된다.
            assertThat(criteria.subjectKeyword()).isEqualTo("삼성카드");
            assertThat(criteria.attachmentContains()).isEqualTo("samsungcard_detail");
            return fakeHtml;
        };

        CardImportLedger.ImportedRow row = new CardImportLedger.ImportedRow(
                "2026-10-06|마망 젤라또|25500|2316|92808086|9420-83**-****-6026",
                "2026-10-06", "마망 젤라또", 23184, 2316, 25500,
                "9420-83**-****-6026", "식비", "카페/간식",
                "2760202986", "제과점,아이스크림점", "본인", "삼성카드");

        VestMailSamsungImporter importer = new VestMailSamsungImporter(
                cipher, ledger, statementLedger, settingsLedger, objectMapper, downloader,
                new InMemoryCategoryClassifier(), "") {
            @Override
            protected Extraction extractRows(Path htmlFile,
                                             String vestmailPassword,
                                             Long userId) {
                assertThat(htmlFile).isEqualTo(fakeHtml);
                return new Extraction(List.of(row), "detail", "2026-10-06", "2026-10-06", 25500);
            }
        };

        assertThat(importer.importForUser(settings(true))).isEqualTo(1);

        ArgumentCaptor<List<CardImportLedger.ImportedRow>> rowsCaptor = ArgumentCaptor.captor();
        verify(ledger, times(1)).addAll(rowsCaptor.capture());
        assertThat(rowsCaptor.getValue()).containsExactly(row);

        // §72 명세서 기간·총액도 저장한다.
        ArgumentCaptor<CardStatementLedger.StatementRow> statementCaptor =
                ArgumentCaptor.forClass(CardStatementLedger.StatementRow.class);
        verify(statementLedger, times(1)).upsert(statementCaptor.capture());
        assertThat(statementCaptor.getValue().usageMonth()).isEqualTo("2026-10");
        assertThat(statementCaptor.getValue().totalAmount()).isEqualTo(25500);
        assertThat(statementCaptor.getValue().kind()).isEqualTo("detail");

        ArgumentCaptor<CardEmailImportSettings> settingsCaptor =
                ArgumentCaptor.forClass(CardEmailImportSettings.class);
        verify(settingsLedger, times(1)).save(settingsCaptor.capture());
        assertThat(settingsCaptor.getValue().lastImportStatus()).isEqualTo("SUCCESS");
        assertThat(settingsCaptor.getValue().lastImportAt()).isNotNull();
    }

    @Test
    void noAttachmentSavesNoMailStatus() {
        CardEmailAttachmentDownloader downloader = (email, password, workDir, criteria) -> null;
        VestMailSamsungImporter importer = new VestMailSamsungImporter(
                cipher, ledger, statementLedger, settingsLedger, objectMapper, downloader,
                new InMemoryCategoryClassifier(), "");

        assertThat(importer.importForUser(settings(true))).isZero();
        verify(ledger, never()).addAll(any());

        ArgumentCaptor<CardEmailImportSettings> settingsCaptor =
                ArgumentCaptor.forClass(CardEmailImportSettings.class);
        verify(settingsLedger, times(1)).save(settingsCaptor.capture());
        assertThat(settingsCaptor.getValue().lastImportStatus()).isEqualTo("NO_MAIL");
    }

    @Test
    void decryptionFailureIsRecordedAsFailedStatus() {
        Path fakeHtml = Path.of("/tmp/does-not-matter.html");
        CardEmailAttachmentDownloader downloader = (email, password, workDir, criteria) -> fakeHtml;
        VestMailSamsungImporter importer = new VestMailSamsungImporter(
                cipher, ledger, statementLedger, settingsLedger, objectMapper, downloader,
                new InMemoryCategoryClassifier(), "") {
            @Override
            protected Extraction extractRows(Path htmlFile,
                                             String vestmailPassword,
                                             Long userId) throws Exception {
                throw new IllegalStateException("VestMail 복호화 실패: 비밀번호 입력이 잘못되었습니다.");
            }
        };

        org.junit.jupiter.api.Assertions.assertThrows(RuntimeException.class,
                () -> importer.importForUser(settings(true)));

        ArgumentCaptor<CardEmailImportSettings> settingsCaptor =
                ArgumentCaptor.forClass(CardEmailImportSettings.class);
        verify(settingsLedger, times(1)).save(settingsCaptor.capture());
        assertThat(settingsCaptor.getValue().lastImportStatus()).isEqualTo("FAILED");
        verify(ledger, never()).addAll(any());
    }

    @Test
    void nodeOutputIsMappedWithBusinessNumberAndClassification() throws Exception {
        // 실제 추출기 출력 형태를 그대로 넣어 §67 분류·사업자번호 매핑과
        // CSV 업로드와 동일한 rowKey 생성까지 확인한다.
        String json = """
                {"source":"samsungcard-email","count":1,"rows":[{
                  "approvedAt":"2026-10-06","merchantName":"다솜이비인후과",
                  "grossAmount":25500,"vat":2316,"supplyExVat":23184,
                  "cardMasked":"9420-83**-****-6026","approvalNo":"92808086",
                  "businessNo":"1359128490","businessCategory":"병원","memberRelation":"본인"}]}
                """;
        VestMailSamsungImporter importer = new VestMailSamsungImporter(
                cipher, ledger, statementLedger, settingsLedger, objectMapper,
                (email, password, workDir, criteria) -> null, new InMemoryCategoryClassifier(), "");

        List<CardImportLedger.ImportedRow> rows =
                importer.parseRows(objectMapper.readTree(json));

        assertThat(rows).hasSize(1);
        CardImportLedger.ImportedRow row = rows.get(0);
        assertThat(row.rowKey()).isEqualTo(
                "2026-10-06|다솜이비인후과|25500|2316|92808086|9420-83**-****-6026");
        assertThat(row.businessNo()).isEqualTo("1359128490");
        assertThat(row.businessCategory()).isEqualTo("병원");
        assertThat(row.cardCompany()).isEqualTo("삼성카드");
        assertThat(row.memberRelation()).isEqualTo("본인");
        // §67: 시드에 있는 사업자번호라 키워드("병원")보다 먼저 매칭돼 병원비가 된다.
        assertThat(row.expenseKind()).isEqualTo("건강/의료");
        assertThat(row.subCategory()).isEqualTo("병원비");
    }

    @Test
    void billingStatementSummaryWithoutRowsIsParsed() throws Exception {
        // §72 정기 청구서는 거래 표가 없고 요약만 있다. 기간·총액을 읽어야 한다.
        String json = """
                {"source":"samsungcard-email","kind":"billing","count":0,
                 "summary":{"periodStart":"2026-09-03","periodEnd":"2026-10-02","totalAmount":890156},
                 "rows":[]}
                """;
        VestMailSamsungImporter importer = new VestMailSamsungImporter(
                cipher, ledger, statementLedger, settingsLedger, objectMapper,
                (email, password, workDir, criteria) -> null, new InMemoryCategoryClassifier(), "");

        VestMailSamsungImporter.Extraction extraction =
                importer.parseExtraction(objectMapper.readTree(json));

        assertThat(extraction.rows()).isEmpty();
        assertThat(extraction.kind()).isEqualTo("billing");
        assertThat(extraction.periodStart()).isEqualTo("2026-09-03");
        assertThat(extraction.periodEnd()).isEqualTo("2026-10-02");
        assertThat(extraction.totalAmount()).isEqualTo(890156);
    }
}
