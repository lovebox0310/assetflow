package com.assetflow.assets.card.email;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** §68: 스케줄러가 카드사별 수집기로 분배하는지 확인한다. */
class CardEmailImportSchedulerTest {

    private final CardEmailImportSettingsLedger settingsLedger = mock(CardEmailImportSettingsLedger.class);
    private final VestMailHyundaiImporter hyundaiImporter = mock(VestMailHyundaiImporter.class);
    private final VestMailSamsungImporter samsungImporter = mock(VestMailSamsungImporter.class);

    private CardEmailImportSettings settings(String company) {
        return new CardEmailImportSettings(
                1L, 1L, true, company, "gmail", "a@b.com", "enc", "enc", null, null);
    }

    @Test
    void dispatchesEachEnabledSettingToItsOwnImporter() {
        CardEmailImportSettings hyundai = settings("hyundaicard");
        CardEmailImportSettings samsung = settings("samsungcard");
        when(settingsLedger.findEnabled()).thenReturn(List.of(hyundai, samsung));

        new CardEmailImportScheduler(settingsLedger, hyundaiImporter, samsungImporter).runAll();

        verify(hyundaiImporter).importForUser(hyundai);
        verify(samsungImporter).importForUser(samsung);
    }

    @Test
    void oneImporterFailureDoesNotStopTheOther() {
        CardEmailImportSettings hyundai = settings("hyundaicard");
        CardEmailImportSettings samsung = settings("samsungcard");
        when(settingsLedger.findEnabled()).thenReturn(List.of(hyundai, samsung));
        when(hyundaiImporter.importForUser(any())).thenThrow(new RuntimeException("boom"));

        new CardEmailImportScheduler(settingsLedger, hyundaiImporter, samsungImporter).runAll();

        verify(samsungImporter).importForUser(samsung);
    }

    @Test
    void unsupportedCompanyIsSkipped() {
        when(settingsLedger.findEnabled()).thenReturn(List.of(settings("shinhancard")));

        new CardEmailImportScheduler(settingsLedger, hyundaiImporter, samsungImporter).runAll();

        verify(hyundaiImporter, never()).importForUser(any());
        verify(samsungImporter, never()).importForUser(any());
    }
}
