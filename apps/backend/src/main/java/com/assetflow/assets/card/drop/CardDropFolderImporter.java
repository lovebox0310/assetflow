package com.assetflow.assets.card.drop;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.CardImportLedger.ImportedRow;
import com.assetflow.assets.card.CardContract;
import com.assetflow.assets.card.CardReconcilePolicy;
import com.assetflow.assets.card.CardStatementReader;
import com.assetflow.expenses.categories.CategoryClassifier;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * 카드 명세서 드롭 폴더 자동 반영.
 *
 * <p>사용자가 정한 폴더에 카드사 명세서(평문 CSV/XLSX)를 넣어두면 주기적으로 읽어
 * 카드내역({@link CardImportLedger})에 반영한다. UI 는 없다 — 파일을 넣는 것이 곧 입력이다.</p>
 *
 * <p>동작 규칙:</p>
 * <ul>
 *   <li>폴더의 <b>직접 자식</b> {@code *.csv}·{@code *.xlsx} 만 본다(하위 폴더는 보지 않는다).</li>
 *   <li>최근 60초 안에 바뀐 파일은 복사 중일 수 있으므로 다음 주기로 미룬다.</li>
 *   <li>같은 파일을 두 번 반영하지 않도록 <b>내용</b>의 SHA-256 을 이력에 남긴다
 *       ({@code ~/.local/state/assetflow/card-drop.json}, 최근 200개).</li>
 *   <li>파싱·저장에 실패한 파일은 이력에 남기지 않는다 — 파일을 고치면 다음 주기에 다시 시도한다.</li>
 *   <li>저장 뒤에는 CSV 정본 정책(§CARD-MERGE-2)에 따라 같은 카드사·같은 기간의
 *       이메일/미상 잔재를 정리한다. 단 <b>명세서 수준</b>(행 수·기간이 임계값 이상)일 때만
 *       정리한다 — 부분 파일 하나로 다른 기간의 행이 지워지지 않게 한다.
 *       재계산 가능한 합계는 저장하지 않는다(§29.7).</li>
 * </ul>
 *
 * <p>기본값은 <b>비활성</b>이다. 운영에서 켜려면 {@code CARD_DROP_FOLDER_ENABLED=true} 와
 * {@code CARD_DROP_FOLDER_PATH} 만 지정한다 — 배포 스크립트 변경이 필요 없다.</p>
 */
@Service
public class CardDropFolderImporter {

    private static final Logger log = LoggerFactory.getLogger(CardDropFolderImporter.class);

    /** 복사 중인 파일을 읽지 않도록 최근 60초 안에 바뀐 파일은 건너뛴다. */
    private static final long QUIET_MILLIS = 60_000L;
    /** 처리 이력에 남기는 최근 파일 수(SHA-256). */
    private static final int MAX_HISTORY = 200;
    private static final Pattern ISO_DATE = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");

    private final CardImportLedger ledger;
    private final CategoryClassifier categoryClassifier;
    private final ObjectMapper objectMapper;
    private final CardStatementReader reader;
    private final Path stateFile;
    private final boolean enabled;
    private final String folderPath;
    private final long maxFileBytes;

    /** 스케줄 주기와 수동 실행이 겹치지 않게 한다. */
    private final AtomicBoolean running = new AtomicBoolean(false);

    @Autowired
    public CardDropFolderImporter(CardImportLedger ledger,
                                  CategoryClassifier categoryClassifier,
                                  ObjectMapper objectMapper,
                                  @Value("${app.card.drop-folder.enabled:false}") boolean enabled,
                                  @Value("${app.card.drop-folder.path:}") String folderPath,
                                  @Value("${app.card.drop-folder.max-file-bytes:20971520}") long maxFileBytes) {
        this(ledger, categoryClassifier, objectMapper, defaultStateFile(),
                enabled, folderPath, maxFileBytes);
    }

    /** 테스트에서 이력 파일 위치를 임시 디렉터리로 바꿀 수 있게 열어둔다. */
    CardDropFolderImporter(CardImportLedger ledger,
                           CategoryClassifier categoryClassifier,
                           ObjectMapper objectMapper,
                           Path stateFile,
                           boolean enabled,
                           String folderPath,
                           long maxFileBytes) {
        this.ledger = ledger;
        this.categoryClassifier = categoryClassifier;
        this.objectMapper = objectMapper;
        this.stateFile = stateFile;
        this.enabled = enabled;
        this.folderPath = folderPath;
        this.maxFileBytes = maxFileBytes;
        this.reader = new CardStatementReader(CardContract.loadDefault());
    }

    private static Path defaultStateFile() {
        return Path.of(System.getProperty("user.home", "."),
                ".local", "state", "assetflow", "card-drop.json");
    }

    @Scheduled(cron = "${app.card.drop-folder.cron:0 */5 * * * *}")
    public void scheduledRun() {
        try {
            runOnce();
        } catch (RuntimeException e) {
            // 스케줄 예외가 다음 주기까지 막지 않게 여기서 끊는다.
            log.warn("drop folder: scheduled run failed — {}", e.toString());
        }
    }

    /**
     * 폴더를 한 번 훑어 새 명세서를 반영한다.
     *
     * @return 이번에 처리(이력에 기록)한 파일 수
     */
    public int runOnce() {
        if (!enabled) {
            // 기본값이 비활성이므로 매 주기 info 를 남기면 로그만 쌓인다.
            log.debug("drop folder: disabled (path='{}')", folderPath);
            return 0;
        }
        if (folderPath == null || folderPath.isBlank()) {
            log.warn("drop folder: enabled but path is empty — set CARD_DROP_FOLDER_PATH");
            return 0;
        }
        if (!running.compareAndSet(false, true)) {
            log.info("drop folder: previous run is still in progress — skipping this cycle");
            return 0;
        }
        try {
            return processFolder(Path.of(folderPath.trim()));
        } finally {
            running.set(false);
        }
    }

    private int processFolder(Path dir) {
        if (!Files.isDirectory(dir)) {
            log.warn("drop folder: {} is not a directory", dir);
            return 0;
        }

        List<Path> files;
        try (Stream<Path> children = Files.list(dir)) {
            // list() 는 직접 자식만 돌려준다 — 하위 폴더는 보지 않는다.
            files = children
                    .filter(Files::isRegularFile)
                    .filter(CardDropFolderImporter::isStatementFile)
                    .sorted()
                    .toList();
        } catch (IOException e) {
            log.warn("drop folder: cannot list {} — {}", dir, e.toString());
            return 0;
        }

        List<String> history = loadHistory();
        boolean historyChanged = false;
        int processed = 0;
        for (Path file : files) {
            try {
                if (!isQuiet(file)) {
                    log.debug("drop folder: {} is still being written — deferred", file.getFileName());
                    continue;
                }
                long size = Files.size(file);
                if (size > maxFileBytes) {
                    log.warn("drop folder: {} is {} bytes (limit {}) — skipped",
                            file.getFileName(), size, maxFileBytes);
                    continue;
                }
                byte[] bytes = Files.readAllBytes(file);
                String sha = sha256(bytes);
                if (history.contains(sha)) {
                    continue; // 이미 반영한 내용이다.
                }
                if (importFile(file.getFileName().toString(), bytes)) {
                    history = remember(history, sha);
                    historyChanged = true;
                    processed++;
                }
            } catch (IOException e) {
                log.warn("drop folder: cannot read {} — {}", file.getFileName(), e.toString());
            } catch (RuntimeException e) {
                log.warn("drop folder: unexpected failure for {} — {}", file.getFileName(), e.toString());
            }
        }

        if (historyChanged) {
            saveHistory(history);
        }
        return processed;
    }

    /**
     * 한 파일을 읽어 저장하고 CSV 정본 구간을 정리한다.
     *
     * @return 이력에 남겨도 되는 성공이면 true. 파싱·저장 실패면 false(다음 주기 재시도).
     */
    private boolean importFile(String fileName, byte[] bytes) {
        CardStatementReader.Result result;
        try {
            result = reader.read(bytes);
        } catch (Exception e) {
            // 이력에 남기지 않는다 — 파일이 고쳐지면 다음 주기에 다시 시도한다.
            log.warn("drop folder: {} skipped — {}", fileName, e.toString());
            return false;
        }

        List<ImportedRow> rows = toLedgerRows(result);
        int added;
        try {
            added = rows.isEmpty() ? 0 : ledger.addAll(rows);
        } catch (RuntimeException e) {
            // 저장 실패(DB 장애 등)도 이력에 남기지 않는다.
            log.warn("drop folder: {} could not be stored — {}", fileName, e.toString());
            return false;
        }

        int reconciled = reconcile(result.cardCompanyLabel(), rows);
        log.info("drop folder: {} → {} {}행 (added={}, reconciled={})",
                fileName, result.cardCompanyLabel(), rows.size(), added, reconciled);
        return true;
    }

    /**
     * 파서 행 → 원장 행. 업로드(CSV 정본)와 같은 출처·같은 rowKey 를 쓴다(§29.6 중복 반영 금지).
     */
    private List<ImportedRow> toLedgerRows(CardStatementReader.Result result) {
        List<ImportedRow> rows = new ArrayList<>(result.rows().size());
        int skipped = 0;
        for (CardStatementReader.ParsedRow parsed : result.rows()) {
            String approvedAt = parsed.approvedAt();
            // card_imports.approved_at 은 DATE NOT NULL — 날짜를 못 읽은 행은 저장할 수 없다.
            if (approvedAt == null || !ISO_DATE.matcher(approvedAt).matches()) {
                skipped++;
                continue;
            }
            CategoryClassifier.Classification classified = categoryClassifier.classify(
                    parsed.merchantName(), parsed.businessCategory(), parsed.businessNo());
            String expenseKind = classified == null || classified.unclassified()
                    ? null : classified.category();
            String subCategory = classified == null ? null : classified.subCategory();

            rows.add(new ImportedRow(
                    parsed.rowKey(),
                    approvedAt,
                    parsed.merchantName(),
                    parsed.supplyExVat(),
                    parsed.vat(),
                    parsed.grossAmount(),
                    parsed.cardMasked() == null ? "" : parsed.cardMasked(),
                    expenseKind,
                    subCategory,
                    parsed.businessNo() == null ? "" : parsed.businessNo(),
                    parsed.businessCategory() == null ? "" : parsed.businessCategory(),
                    parsed.memberRelation() == null || parsed.memberRelation().isBlank()
                            ? "본인" : parsed.memberRelation(),
                    result.cardCompanyLabel(),
                    CardImportLedger.SOURCE_CSV));
        }
        if (skipped > 0) {
            log.warn("drop folder: {} rows without a readable date were skipped", skipped);
        }
        return rows;
    }

    /**
     * CARD-MERGE-2: 이 파일이 덮는 기간(같은 카드사)의 이메일/미상 잔재를 정리한다.
     * CSV 정본 행은 이 메서드로 지워지지 않는다.
     *
     * <p>업로드 API 와 같은 정책({@link CardReconcilePolicy})을 쓴다 — 명세서 수준
     * (행 수·기간)이 아니면 지우지 않는다. 부분 파일 하나로 다른 기간의 이메일
     * 행이 사라지지 않게 하기 위해서다.</p>
     *
     * @return 지운 행 수
     */
    private int reconcile(String cardCompany, List<ImportedRow> rows) {
        CardReconcilePolicy.CoveredRange covered = CardReconcilePolicy.range(rows).orElse(null);
        if (covered == null) {
            return 0; // 덮는 기간이 없으면 아무것도 지우지 않는다.
        }
        if (!covered.isStatementSized()) {
            log.info("drop folder: reconcile skipped for {} — {}행 / {}일 (최소 {}행·{}일 필요)",
                    cardCompany, covered.rowCount(), covered.spanDaysInclusive(),
                    CardReconcilePolicy.MIN_ROWS, CardReconcilePolicy.MIN_SPAN_DAYS_INCLUSIVE);
            return 0;
        }
        return ledger.deleteUnconfirmedInRange(cardCompany, covered.fromDate(), covered.toDate());
    }

    private static boolean isStatementFile(Path file) {
        String name = file.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".csv") || name.endsWith(".xlsx");
    }

    /**
     * 최근 60초 안에 바뀐 파일은 아직 복사 중일 수 있다.
     *
     * <p>mtime 이 미래인 파일(복사한 원본 쪽 시계가 앞선 경우)은 "쓰는 중"이 아니라
     * 이미 고정된 것으로 본다 — 그대로 두면 그 파일은 영원히 다음 주기로 밀린다.</p>
     */
    private static boolean isQuiet(Path file) throws IOException {
        long age = System.currentTimeMillis() - Files.getLastModifiedTime(file).toMillis();
        if (age <= -QUIET_MILLIS) {
            return true;
        }
        return age >= QUIET_MILLIS;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    /** 최근 것을 뒤에 두고 200개까지만 남긴다. */
    private static List<String> remember(List<String> history, String sha) {
        List<String> next = new ArrayList<>(history);
        next.remove(sha);
        next.add(sha);
        while (next.size() > MAX_HISTORY) {
            next.remove(0);
        }
        return next;
    }

    private List<String> loadHistory() {
        if (!Files.isRegularFile(stateFile)) {
            return new ArrayList<>();
        }
        try {
            DropHistory stored = objectMapper.readValue(stateFile.toFile(), DropHistory.class);
            if (stored == null || stored.sha256() == null) {
                return new ArrayList<>();
            }
            return new ArrayList<>(stored.sha256());
        } catch (Exception e) {
            // 이력이 깨졌다고 파일을 다시 지우거나 하지는 않는다 — 비어 있는 것으로 본다.
            log.warn("drop folder: cannot read {} — {}", stateFile, e.toString());
            return new ArrayList<>();
        }
    }

    private void saveHistory(List<String> history) {
        try {
            Path parent = stateFile.toAbsolutePath().getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            // 부분 기록으로 이력이 깨지지 않게 임시 파일에 쓴 뒤 교체한다.
            Path tmp = stateFile.resolveSibling(stateFile.getFileName() + ".tmp");
            objectMapper.writeValue(tmp.toFile(), new DropHistory(List.copyOf(history)));
            Files.move(tmp, stateFile, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.warn("drop folder: cannot write {} — {}", stateFile, e.toString());
        }
    }

    /** 처리 이력 파일 형식: {@code {"sha256":["...","..."]}} */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record DropHistory(List<String> sha256) {
    }
}
