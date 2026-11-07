package com.assetflow.assets.card.email;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.CardStatementLedger;
import com.assetflow.assets.card.CardContract;
import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.expenses.categories.CategoryClassifier;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 삼성카드 VestMail 이메일 명세서 수집기 (§68).
 *
 * <p>{@code "이용상세내역서"} 메일의 HTML 첨부를 받아 Playwright 기반 Node 스크립트로
 * 복호화하고, 12컬럼 거래 표를 정규화해 {@link CardImportLedger}에 저장한다.</p>
 *
 * <p>현대카드와 다른 점:</p>
 * <ul>
 *   <li>복호화 폼이 {@code #decForm / #password / #confirm} 이고, 복호화가 끝나면
 *       {@code document.write()} 로 문서 전체가 교체된다.</li>
 *   <li>사업자번호·업종이 표에 같이 들어있어 §67 자동 분류를 즉시 적용할 수 있다.</li>
 *   <li>이용일이 {@code YYYY-MM-DD} 로 완전하므로 연도 추정이 필요 없다.</li>
 * </ul>
 */
@Component
public class VestMailSamsungImporter {

    private static final Logger log = LoggerFactory.getLogger(VestMailSamsungImporter.class);

    private final CardImportCipher cipher;
    private final CardImportLedger ledger;
    private final CardStatementLedger statementLedger;
    private final CardEmailImportSettingsLedger settingsLedger;
    private final ObjectMapper objectMapper;
    private final CardEmailAttachmentDownloader downloader;
    private final CategoryClassifier categoryClassifier;
    private final String scriptDir;
    private final String cardCompanyLabel;

    public VestMailSamsungImporter(CardImportCipher cipher,
                                   CardImportLedger ledger,
                                   CardStatementLedger statementLedger,
                                   CardEmailImportSettingsLedger settingsLedger,
                                   ObjectMapper objectMapper,
                                   CardEmailAttachmentDownloader downloader,
                                   CategoryClassifier categoryClassifier,
                                   @Value("${app.card.vestmail.samsung.script-dir:}") String scriptDir) {
        this.cipher = cipher;
        this.ledger = ledger;
        this.statementLedger = statementLedger;
        this.settingsLedger = settingsLedger;
        this.objectMapper = objectMapper;
        this.downloader = downloader;
        this.categoryClassifier = categoryClassifier;
        this.scriptDir = scriptDir;
        this.cardCompanyLabel = CardContract.loadDefault().companyProfile("samsungcard").cardCompanyLabel();
    }

    /** 한 사용자의 삼성카드 이메일 명세서를 수집한다. @return 저장된 행 수 */
    public int importForUser(CardEmailImportSettings settings) {
        if (!settings.enabled()) {
            return 0;
        }

        Path workDir = null;
        try {
            String emailPassword = cipher.decrypt(settings.emailPasswordEnc());
            String vestmailPassword = cipher.decrypt(settings.vestmailPasswordEnc());

            workDir = Files.createTempDirectory("af-vestmail-samsung-");
            Path htmlFile = downloader.download(
                    settings.emailAddress(), emailPassword, workDir,
                    CardEmailAttachmentDownloader.MailCriteria.samsung());
            if (htmlFile == null) {
                log.info("No SamsungCard statement email found for user {}", settings.userId());
                settingsLedger.save(settings.withLastImport("NO_MAIL", Instant.now()));
                return 0;
            }

            Extraction extraction = extractRows(htmlFile, vestmailPassword, settings.userId());
            if (!extraction.rows().isEmpty()) {
                ledger.addAll(extraction.rows());
            }
            // §72 정기 청구서는 거래 행이 없어도 기간·총액을 남긴다.
            if (extraction.totalAmount() > 0
                    && !extraction.periodStart().isBlank() && !extraction.periodEnd().isBlank()) {
                statementLedger.upsert(new CardStatementLedger.StatementRow(
                        0, cardCompanyLabel, extraction.kind(),
                        extraction.periodStart().substring(0, 7),
                        extraction.periodStart(), extraction.periodEnd(), extraction.totalAmount()));
            }
            settingsLedger.save(settings.withLastImport("SUCCESS", Instant.now()));
            log.info("Imported {} SamsungCard rows for user {}", extraction.rows().size(), settings.userId());
            return extraction.rows().size();
        } catch (Exception e) {
            log.error("SamsungCard VestMail import failed for user {}", settings.userId(), e);
            settingsLedger.save(settings.withLastImport("FAILED", Instant.now()));
            throw new RuntimeException("SamsungCard VestMail import failed", e);
        } finally {
            if (workDir != null) {
                VestMailScriptSupport.deleteRecursively(workDir, log);
            }
        }
    }

    /** §72 거래 행과 명세서 요약. 정기 청구서는 rows 가 비고 summary 만 있다. */
    record Extraction(List<CardImportLedger.ImportedRow> rows, String kind,
                      String periodStart, String periodEnd, long totalAmount) {}

    /**
     * Node 스크립트를 실행해 VestMail HTML에서 거래 내역·명세서 요약을 추출한다.
     * 테스트에서 override 할 수 있도록 protected 로 열어둔다.
     */
    protected Extraction extractRows(Path htmlFile,
                                     String vestmailPassword,
                                     Long userId) throws Exception {
        String output;
        try (VestMailScriptSupport.Prepared prepared = VestMailScriptSupport.prepare(
                scriptDir, "extract-samsung-vestmail.mjs", "scripts/card/vestmail-samsung",
                new String[]{"extract-samsung-vestmail.mjs", "samsung-table.mjs",
                        "package.json", "package-lock.json"}, log)) {
            Path script = prepared.dir().resolve("extract-samsung-vestmail.mjs");
            // 비밀번호를 커맨드라인 인자로 넘기면 ps 에 평문이 남는다 — 환경변수로만 전달한다.
            ProcessBuilder pb = new ProcessBuilder(
                    "node", script.toString(), htmlFile.toString(),
                    "--contract=" + prepared.contract());
            pb.environment().put("SAMSUNG_VESTMAIL_PASSWORD", vestmailPassword);
            pb.directory(prepared.dir().toFile());
            pb.redirectErrorStream(true);

            Process process = pb.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                output = reader.lines().collect(Collectors.joining("\n"));
            }
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IllegalStateException("Samsung VestMail extract script failed with exit code "
                        + exitCode + ": " + output);
            }
        }

        JsonNode root = objectMapper.readTree(output);
        return parseExtraction(root);
    }

    /** Node 출력 JSON → 거래 행 + 명세서 요약. 테스트에서 직접 호출할 수 있도록 package-private. */
    Extraction parseExtraction(JsonNode root) {
        List<CardImportLedger.ImportedRow> rows = parseRows(root);
        JsonNode summary = root.path("summary");
        String periodStart = summary.path("periodStart").asText("");
        String periodEnd = summary.path("periodEnd").asText("");
        long totalAmount = summary.path("totalAmount").asLong(0);

        if (!rows.isEmpty()) {
            if (periodStart.isBlank()) {
                periodStart = rows.stream().map(CardImportLedger.ImportedRow::approvedAt)
                        .min(String::compareTo).orElse("");
            }
            if (periodEnd.isBlank()) {
                periodEnd = rows.stream().map(CardImportLedger.ImportedRow::approvedAt)
                        .max(String::compareTo).orElse("");
            }
            if (totalAmount <= 0) {
                totalAmount = rows.stream().mapToLong(CardImportLedger.ImportedRow::grossAmount).sum();
            }
        }
        if (rows.isEmpty() && (periodStart.isBlank() || periodEnd.isBlank() || totalAmount <= 0)) {
            throw new IllegalStateException("삼성카드 명세서의 이용기간·총액을 읽지 못했습니다.");
        }
        String kind = root.path("kind").asText(rows.isEmpty() ? "billing" : "detail");
        return new Extraction(rows, kind, periodStart, periodEnd, totalAmount);
    }

    /** Node 출력 JSON → 원장 행. 테스트에서 직접 호출할 수 있도록 package-private. */
    List<CardImportLedger.ImportedRow> parseRows(JsonNode root) {
        List<CardImportLedger.ImportedRow> rows = new ArrayList<>();
        for (JsonNode node : root.path("rows")) {
            String approvedAt = node.path("approvedAt").asText();
            String merchant = node.path("merchantName").asText();
            long grossAmount = node.path("grossAmount").asLong();
            long vat = node.path("vat").asLong();
            long supplyExVat = node.path("supplyExVat").asLong();
            String cardMasked = node.path("cardMasked").asText("");
            String approvalNo = node.path("approvalNo").asText("");
            String businessNo = node.path("businessNo").asText("");
            String businessCategory = node.path("businessCategory").asText("");
            String memberRelation = node.path("memberRelation").asText("본인");

            // CSV 수동 업로드(parse-samsung.mjs)와 같은 키를 써야 같은 거래가
            // 이메일 수집과 업로드 사이에서 중복 저장되지 않는다(§29.6).
            String rowKey = String.join("|", approvedAt, merchant,
                    String.valueOf(grossAmount), String.valueOf(vat), approvalNo, cardMasked);

            // §67: 이 명세서에는 사업자번호·업종이 들어있으므로 저장 시점에 분류한다.
            CategoryClassifier.Classification classified = categoryClassifier.classify(
                    merchant, businessCategory, businessNo);
            String expenseKind = classified == null || classified.unclassified()
                    ? null : classified.category();
            String subCategory = classified == null ? null : classified.subCategory();

            rows.add(new CardImportLedger.ImportedRow(
                    rowKey,
                    approvedAt,
                    merchant,
                    supplyExVat,
                    vat,
                    grossAmount,
                    cardMasked,
                    expenseKind,
                    subCategory,
                    businessNo,
                    businessCategory,
                    memberRelation.isBlank() ? "본인" : memberRelation,
                    cardCompanyLabel));
        }
        return rows;
    }
}
