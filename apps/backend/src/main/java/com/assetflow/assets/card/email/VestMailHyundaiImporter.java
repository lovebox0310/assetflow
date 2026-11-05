package com.assetflow.assets.card.email;

import com.assetflow.assets.CardImportLedger;
import com.assetflow.assets.card.CardImportCipher;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
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
    private final CardEmailImportSettingsLedger settingsLedger;
    private final ObjectMapper objectMapper;
    private final CardEmailAttachmentDownloader downloader;
    private final String scriptDir;

    public VestMailHyundaiImporter(CardImportCipher cipher,
                                   CardImportLedger ledger,
                                   CardEmailImportSettingsLedger settingsLedger,
                                   ObjectMapper objectMapper,
                                   CardEmailAttachmentDownloader downloader,
                                   @Value("${app.vestmail.hyundai.script-dir:}") String scriptDir) {
        this.cipher = cipher;
        this.ledger = ledger;
        this.settingsLedger = settingsLedger;
        this.objectMapper = objectMapper;
        this.downloader = downloader;
        this.scriptDir = scriptDir;
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
                deleteRecursively(workDir);
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
        Path scriptWorkDir = prepareScriptWorkDir();
        Path script = scriptWorkDir.resolve("extract-hyundai-vestmail.mjs");

        ProcessBuilder pb = new ProcessBuilder(
                "node", script.toString(), htmlFile.toString(),
                "--password=" + vestmailPassword,
                "--year=" + year);
        pb.directory(scriptWorkDir.toFile());
        pb.redirectErrorStream(true);

        Process process = pb.start();
        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new IllegalStateException("Node extract script failed with exit code " + exitCode
                    + ": " + output);
        }

        JsonNode root = objectMapper.readTree(output);
        JsonNode rowsNode = root.path("rows");
        List<CardImportLedger.ImportedRow> rows = new ArrayList<>();
        for (JsonNode rowNode : rowsNode) {
            String approvedAt = rowNode.path("approvedAt").asText();
            String merchant = rowNode.path("merchantName").asText();
            long grossAmount = rowNode.path("grossAmount").asLong();
            long vat = rowNode.path("vat").asLong();
            long supplyExVat = rowNode.path("supplyExVat").asLong();
            int installmentCount = rowNode.path("installmentCount").asInt();
            String cardMasked = rowNode.path("cardMasked").asText(null);

            String rowKey = buildRowKey(userId, approvedAt, merchant, grossAmount, cardMasked);
            rows.add(new CardImportLedger.ImportedRow(
                    rowKey,
                    approvedAt,
                    merchant,
                    supplyExVat,
                    vat,
                    grossAmount,
                    cardMasked,
                    null, // expenseKind
                    null, // subCategory
                    null, // businessNo
                    null, // businessCategory
                    cardMemberRelation(cardMasked),
                    "hyundaicard"
            ));
        }
        return rows;
    }

    private Path prepareScriptWorkDir() throws Exception {
        if (scriptDir != null && !scriptDir.isBlank()) {
            Path external = Path.of(scriptDir);
            if (Files.exists(external.resolve("extract-hyundai-vestmail.mjs"))) {
                return external;
            }
            log.warn("Configured script-dir does not contain extract script: {}", scriptDir);
        }

        Path temp = Files.createTempDirectory("af-vestmail-script-");
        String[] files = {
                "extract-hyundai-vestmail.mjs",
                "package.json",
                "package-lock.json"
        };
        for (String name : files) {
            ClassPathResource resource = new ClassPathResource("scripts/card/vestmail-hyundai/" + name);
            if (!resource.exists()) {
                throw new IllegalStateException("Missing classpath resource: " + name);
            }
            try (InputStream is = resource.getInputStream()) {
                Files.copy(is, temp.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            }
        }
        return temp;
    }

    private String buildRowKey(Long userId, String approvedAt, String merchant, long grossAmount, String cardMasked) {
        String base = userId + "|" + approvedAt + "|" + merchant + "|" + grossAmount;
        if (cardMasked != null) {
            base += "|" + cardMasked;
        }
        return base;
    }

    private String cardMemberRelation(String cardMasked) {
        if (cardMasked != null && cardMasked.contains("가족")) {
            return "가족";
        }
        return "본인";
    }

    private void deleteRecursively(Path path) {
        try {
            Files.walk(path)
                    .sorted(Comparator.reverseOrder())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (Exception ignored) {
                            // ignore
                        }
                    });
        } catch (Exception e) {
            log.warn("Failed to delete temp dir {}", path, e);
        }
    }
}
