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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 현대카드 VestMail 이메일 명세서 수집기 (§63).
 *
 * <p>{@link CardEmailAttachmentDownloader}로 첨부 HTML을 받아, Playwright 기반
 * Node 스크립트로 복호화 및 거래 내역을 추출한 뒤 {@link CardImportLedger}에
 * 저장한다.</p>
 */
@Component
public class VestMailHyundaiImporter {

    private static final Logger log = LoggerFactory.getLogger(VestMailHyundaiImporter.class);

    private final CardImportCipher cipher;
    private final CardImportLedger ledger;
    private final CardStatementLedger statementLedger;
    private final CardEmailImportSettingsLedger settingsLedger;
    private final ObjectMapper objectMapper;
    private final CardEmailAttachmentDownloader downloader;
    private final CategoryClassifier categoryClassifier;
    private final String scriptDir;
    private final String cardCompanyLabel;

    public VestMailHyundaiImporter(CardImportCipher cipher,
                                   CardImportLedger ledger,
                                   CardStatementLedger statementLedger,
                                   CardEmailImportSettingsLedger settingsLedger,
                                   ObjectMapper objectMapper,
                                   CardEmailAttachmentDownloader downloader,
                                   CategoryClassifier categoryClassifier,
                                   @Value("${app.card.vestmail.hyundai.script-dir:}") String scriptDir) {
        this.cipher = cipher;
        this.ledger = ledger;
        this.statementLedger = statementLedger;
        this.settingsLedger = settingsLedger;
        this.objectMapper = objectMapper;
        this.downloader = downloader;
        this.categoryClassifier = categoryClassifier;
        this.scriptDir = scriptDir;
        // CSV 업로드와 같은 라벨을 써야 화면에서 카드사가 갈라지지 않는다(§29.3 단일 출처).
        this.cardCompanyLabel = CardContract.loadDefault().companyProfile("hyundaicard").cardCompanyLabel();
    }

    /**
     * 한 사용자의 현대카드 이메일 명세서를 수집한다.
     *
     * @param settings 사용자 설정
     * @return 수집된 행 수
     */
    public int importForUser(CardEmailImportSettings settings) {
        if (!settings.enabled()) {
            return 0;
        }

        Path workDir = null;
        try {
            String emailPassword = cipher.decrypt(settings.emailPasswordEnc());
            String vestmailPassword = cipher.decrypt(settings.vestmailPasswordEnc());

            workDir = Files.createTempDirectory("af-vestmail-");
            Path htmlFile = downloader.download(settings.emailAddress(), emailPassword, workDir);
            if (htmlFile == null) {
                log.info("No HyundaiCard statement email found for user {}", settings.userId());
                settingsLedger.save(settings.withLastImport("NO_MAIL", Instant.now()));
                return 0;
            }

            String year = String.valueOf(LocalDate.now().getYear());
            List<CardImportLedger.ImportedRow> rows = extractRows(htmlFile, vestmailPassword, year, settings.userId());
            if (!rows.isEmpty()) {
                ledger.addAll(rows);
                // §72 월별 카드 금액은 명세서 이용기간 총액을 쓴다.
                saveStatement(rows);
            }
            settingsLedger.save(settings.withLastImport("SUCCESS", Instant.now()));
            log.info("Imported {} HyundaiCard rows for user {}", rows.size(), settings.userId());
            return rows.size();
        } catch (Exception e) {
            log.error("HyundaiCard VestMail import failed for user {}", settings.userId(), e);
            settingsLedger.save(settings.withLastImport("FAILED", Instant.now()));
            throw new RuntimeException("HyundaiCard VestMail import failed", e);
        } finally {
            if (workDir != null) {
                VestMailScriptSupport.deleteRecursively(workDir, log);
            }
        }
    }

    /**
     * Node 스크립트를 실행해 VestMail HTML에서 거래 내역을 추출한다.
     *
     * <p>테스트에서 override 할 수 있도록 protected 로 열어둔다.</p>
     */
    protected List<CardImportLedger.ImportedRow> extractRows(Path htmlFile,
                                                             String vestmailPassword,
                                                             String year,
                                                             Long userId) throws Exception {
        String output;
        try (VestMailScriptSupport.Prepared prepared = VestMailScriptSupport.prepare(
                scriptDir, "extract-hyundai-vestmail.mjs", "scripts/card/vestmail-hyundai",
                new String[]{"extract-hyundai-vestmail.mjs", "package.json", "package-lock.json"}, log)) {
            Path script = prepared.dir().resolve("extract-hyundai-vestmail.mjs");
            // 비밀번호를 커맨드라인 인자로 넘기면 ps 에 평문이 남는다 — 환경변수로만 전달한다.
            ProcessBuilder pb = new ProcessBuilder(
                    "node", script.toString(), htmlFile.toString(),
                    "--year=" + year);
            pb.environment().put("HYUNDAI_VESTMAIL_PASSWORD", vestmailPassword);
            pb.directory(prepared.dir().toFile());
            pb.redirectErrorStream(true);

            Process process = pb.start();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                output = reader.lines().collect(Collectors.joining("\n"));
            }
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IllegalStateException("Node extract script failed with exit code " + exitCode
                        + ": " + output);
            }
        }

        JsonNode root = objectMapper.readTree(output);
        JsonNode rowsNode = root.path("rows");
        List<CardImportLedger.ImportedRow> rows = new ArrayList<>();
        // 같은 날 같은 가맹점·금액이 실제로 여러 번 있을 수 있다 — 순번을 붙여
        // row_key 충돌로 조용히 사라지지 않게 한다(§71).
        Map<String, Integer> occurrence = new HashMap<>();
        for (JsonNode rowNode : rowsNode) {
            String approvedAt = rowNode.path("approvedAt").asText();
            String merchant = rowNode.path("merchantName").asText();
            long grossAmount = rowNode.path("grossAmount").asLong();
            long vat = rowNode.path("vat").asLong();
            long supplyExVat = rowNode.path("supplyExVat").asLong();
            int installmentCount = rowNode.path("installmentCount").asInt();
            String cardMasked = rowNode.path("cardMasked").asText(null);

            String baseKey = buildRowKey(userId, approvedAt, merchant, grossAmount, cardMasked);
            int n = occurrence.merge(baseKey, 1, Integer::sum);
            String rowKey = baseKey + "#" + n;
            // §55.8: 수집 시점에 규칙 → 키워드 순으로 분류한다. 현대 명세서에는
            // 사업자번호·업종이 없어 키워드/사용자 규칙이 유일한 자동 신호다.
            CategoryClassifier.Classification classified = categoryClassifier.classify(merchant, "", "");
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
                    null, // businessNo
                    null, // businessCategory
                    cardMemberRelation(cardMasked),
                    cardCompanyLabel
            ));
        }
        return rows;
    }

    private String buildRowKey(Long userId, String approvedAt, String merchant, long grossAmount, String cardMasked) {
        String base = userId + "|" + approvedAt + "|" + merchant + "|" + grossAmount;
        if (cardMasked != null) {
            base += "|" + cardMasked;
        }
        return base;
    }

    /** §72 현대카드 이메일 명세서는 정기 청구서이므로 kind='billing' 으로 저장한다. */
    private void saveStatement(List<CardImportLedger.ImportedRow> rows) {
        String periodStart = rows.stream().map(CardImportLedger.ImportedRow::approvedAt)
                .min(String::compareTo).orElse(null);
        String periodEnd = rows.stream().map(CardImportLedger.ImportedRow::approvedAt)
                .max(String::compareTo).orElse(null);
        if (periodStart == null || periodEnd == null) {
            return;
        }
        long total = rows.stream().mapToLong(CardImportLedger.ImportedRow::grossAmount).sum();
        statementLedger.upsert(new CardStatementLedger.StatementRow(
                0, cardCompanyLabel, "billing", periodStart.substring(0, 7),
                periodStart, periodEnd, total));
    }

    private String cardMemberRelation(String cardMasked) {
        if (cardMasked != null && cardMasked.contains("가족")) {
            return "가족";
        }
        return "본인";
    }
}
