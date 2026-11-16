package com.assetflow.assets.card.drop;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.InMemoryCardImportLedger;
import com.assetflow.expenses.categories.InMemoryCategoryClassifier;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 드롭 폴더 자동 반영: 파일 반영·중복 방지·비활성 무동작·깨진 파일 재시도·CSV 정본 정리.
 *
 * <p>샘플은 테스트 classpath 의 익명화 파일을 쓴다(build.gradle {@code processTestResources} 가
 * {@code samples/card/anonymized} 에서 복사한다). 운영 홈 디렉터리를 건드리지 않도록
 * 이력 파일 경로는 임시 디렉터리로 넘긴다.</p>
 */
class CardDropFolderImporterTest {

    private static final String SAMPLE = "samsungcard-personal-anon.csv";
    /** 삼성 샘플의 세부 이용내역은 18행이다. */
    private static final int SAMPLE_ROWS = 18;

    @TempDir
    Path tmp;

    private Path dropDir;
    private Path stateFile;
    private InMemoryCardImportLedger ledger;
    private InMemoryCategoryClassifier classifier;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() throws IOException {
        dropDir = Files.createDirectories(tmp.resolve("drop"));
        stateFile = tmp.resolve("state").resolve("card-drop.json");
        ledger = new InMemoryCardImportLedger();
        classifier = new InMemoryCategoryClassifier();
    }

    private CardDropFolderImporter importer(boolean enabled) {
        return new CardDropFolderImporter(ledger, classifier, objectMapper, stateFile,
                enabled, dropDir.toString(), 20L * 1024 * 1024);
    }

    private byte[] sampleBytes() throws IOException {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(SAMPLE)) {
            if (in == null) {
                throw new IllegalStateException("missing test resource: " + SAMPLE);
            }
            return in.readAllBytes();
        }
    }

    /** 복사가 끝난 파일처럼 보이게 mtime 을 2분 과거로 돌린다(60초 대기 회피). */
    private Path settled(Path file) throws IOException {
        Files.setLastModifiedTime(file, FileTime.fromMillis(System.currentTimeMillis() - 120_000L));
        return file;
    }

    private Path putSample(String fileName) throws IOException {
        Path target = dropDir.resolve(fileName);
        Files.write(target, sampleBytes());
        return settled(target);
    }

    private static CardImportLedger.ImportedRow emailRow(String approvedAt, long grossAmount) {
        return new CardImportLedger.ImportedRow(
                "email|" + approvedAt + "|합성한식당|" + grossAmount,
                approvedAt, "합성한식당",
                grossAmount, 0, grossAmount,
                "", null, null, "", "",
                "본인", "삼성카드", CardImportLedger.SOURCE_EMAIL);
    }

    @Test
    void importsSampleCsvAndWritesHistory() throws IOException {
        putSample("samsung-2026-01.csv");

        int processed = importer(true).runOnce();

        assertThat(processed).isEqualTo(1);
        List<CardImportLedger.ImportedRow> rows = ledger.all();
        assertThat(rows).hasSize(SAMPLE_ROWS);
        assertThat(rows).allSatisfy(row -> {
            assertThat(row.source()).isEqualTo(CardImportLedger.SOURCE_CSV);
            assertThat(row.cardCompany()).isEqualTo("삼성카드");
        });
        assertThat(rows).extracting(CardImportLedger.ImportedRow::rowKey).doesNotHaveDuplicates();
        assertThat(Files.isRegularFile(stateFile)).isTrue();
    }

    @Test
    void fileWrittenJustNowIsDeferredToTheNextRun() throws IOException {
        // 복사가 끝난 직후(mtime = 지금)에는 반쯤 쓰인 파일일 수 있으니 읽지 않는다.
        Path fresh = dropDir.resolve("samsung-just-copied.csv");
        Files.write(fresh, sampleBytes());
        CardDropFolderImporter importer = importer(true);

        assertThat(importer.runOnce()).isZero();
        assertThat(ledger.all()).isEmpty();
        assertThat(Files.exists(stateFile)).isFalse();

        settled(fresh);
        assertThat(importer.runOnce()).isEqualTo(1);
        assertThat(ledger.all()).hasSize(SAMPLE_ROWS);
    }

    @Test
    void onlyDirectCsvAndXlsxChildrenAreRead() throws IOException {
        Files.writeString(dropDir.resolve("notes.txt"), "카드 명세서 아님", StandardCharsets.UTF_8);
        Path sub = Files.createDirectories(dropDir.resolve("old"));
        settled(Files.write(sub.resolve("samsung-2025-12.csv"), sampleBytes()));

        assertThat(importer(true).runOnce()).isZero();
        assertThat(ledger.all()).isEmpty();
    }

    @Test
    void secondRunDoesNotStoreTheSameFileAgain() throws IOException {
        putSample("samsung-2026-01.csv");
        CardDropFolderImporter importer = importer(true);
        importer.runOnce();
        List<String> keysAfterFirstRun = ledger.all().stream()
                .map(CardImportLedger.ImportedRow::rowKey).toList();

        int processed = importer.runOnce();

        assertThat(processed).isZero();
        assertThat(ledger.all()).hasSize(SAMPLE_ROWS);
        assertThat(ledger.all().stream().map(CardImportLedger.ImportedRow::rowKey).toList())
                .isEqualTo(keysAfterFirstRun);
    }

    @Test
    void disabledImporterDoesNothing() throws IOException {
        putSample("samsung-2026-01.csv");

        int processed = importer(false).runOnce();

        assertThat(processed).isZero();
        assertThat(ledger.all()).isEmpty();
        assertThat(Files.exists(stateFile)).isFalse();
    }

    @Test
    void blankPathDoesNothing() throws IOException {
        putSample("samsung-2026-01.csv");
        CardDropFolderImporter importer = new CardDropFolderImporter(ledger, classifier, objectMapper,
                stateFile, true, "  ", 20L * 1024 * 1024);

        int processed = importer.runOnce();

        assertThat(processed).isZero();
        assertThat(ledger.all()).isEmpty();
        assertThat(Files.exists(stateFile)).isFalse();
    }

    @Test
    void brokenFileIsSkippedAndRetriedOnTheNextRun() throws IOException {
        Path broken = dropDir.resolve("broken.csv");
        Files.writeString(broken, "not,a,card,statement\n1,2,3\n", StandardCharsets.UTF_8);
        settled(broken);
        CardDropFolderImporter importer = importer(true);

        assertThat(importer.runOnce()).isZero();
        assertThat(ledger.all()).isEmpty();
        // 이력에 남기지 않는다 — 다음 주기에 다시 시도해야 하므로.
        assertThat(Files.exists(stateFile)).isFalse();

        // 같은 이름으로 고쳐 넣으면 다음 실행에서 반영된다.
        Files.write(broken, sampleBytes());
        settled(broken);

        assertThat(importer.runOnce()).isEqualTo(1);
        assertThat(ledger.all()).hasSize(SAMPLE_ROWS);
    }

    @Test
    void reconcileRemovesEmailResidueInTheCoveredPeriod() throws IOException {
        // CSV 행이 덮는 기간(샘플: 2025-11-05~2026-01-21) 안의 이메일 잔재 1건과,
        // 기간 밖(2025-10-01) 이메일 행 1건을 미리 넣는다.
        ledger.addAll(List.of(emailRow("2025-12-15", 9_900), emailRow("2025-10-01", 5_000)));

        putSample("samsung-2026-01.csv");
        importer(true).runOnce();

        List<CardImportLedger.ImportedRow> rows = ledger.all();
        // 기간 안 잔재는 지워지고(18), 기간 밖 이메일 행은 남는다(19).
        assertThat(rows).hasSize(SAMPLE_ROWS + 1);
        assertThat(rows).noneMatch(row ->
                CardImportLedger.SOURCE_EMAIL.equals(CardImportLedger.normalizeSource(row.source()))
                        && "2025-12-15".equals(row.approvedAt()));
        assertThat(rows).anyMatch(row -> "2025-10-01".equals(row.approvedAt()));
    }
}
