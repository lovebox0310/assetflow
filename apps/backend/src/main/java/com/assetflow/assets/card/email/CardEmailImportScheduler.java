package com.assetflow.assets.card.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 이메일 명세서 자동 수집 스케줄러 (§63, §68).
 *
 * <p>활성화된 설정을 조회하여 각 카드사별 수집기를 실행한다.
 * 기본 cron: 매일 09:00, 21:00 (1일 2회).</p>
 */
@Component
public class CardEmailImportScheduler {

    private static final Logger log = LoggerFactory.getLogger(CardEmailImportScheduler.class);

    private final CardEmailImportSettingsLedger settingsLedger;
    private final VestMailHyundaiImporter hyundaiImporter;
    private final VestMailSamsungImporter samsungImporter;

    public CardEmailImportScheduler(CardEmailImportSettingsLedger settingsLedger,
                                    VestMailHyundaiImporter hyundaiImporter,
                                    VestMailSamsungImporter samsungImporter) {
        this.settingsLedger = settingsLedger;
        this.hyundaiImporter = hyundaiImporter;
        this.samsungImporter = samsungImporter;
    }

    @Scheduled(cron = "${app.card.email-import.cron:0 0 9,21 * * *}")
    public void runAll() {
        log.info("Starting scheduled card email import");
        List<CardEmailImportSettings> enabled = settingsLedger.findEnabled();
        for (CardEmailImportSettings settings : enabled) {
            try {
                switch (settings.cardCompany()) {
                    case "hyundaicard" -> hyundaiImporter.importForUser(settings);
                    case "samsungcard" -> samsungImporter.importForUser(settings);
                    default -> log.warn("Unsupported card company for email import: {}",
                            settings.cardCompany());
                }
            } catch (Exception e) {
                log.error("Scheduled import failed for user {} / {}",
                        settings.userId(), settings.cardCompany(), e);
            }
        }
        log.info("Scheduled card email import finished for {} settings", enabled.size());
    }
}
