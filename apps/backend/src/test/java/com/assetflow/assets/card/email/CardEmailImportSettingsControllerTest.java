package com.assetflow.assets.card.email;

import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.UserSettingsLedger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * §68: 카드사별 설정 분리와 수집기 분배.
 */
class CardEmailImportSettingsControllerTest {

    private final InMemoryCardEmailImportSettingsLedger ledger = new InMemoryCardEmailImportSettingsLedger();
    private final CardImportCipher cipher = new CardImportCipher("test-key", null);
    private final AuthEmailResolver emailResolver = mock(AuthEmailResolver.class);
    private final UserSettingsLedger userSettingsLedger = mock(UserSettingsLedger.class);
    private final VestMailHyundaiImporter hyundaiImporter = mock(VestMailHyundaiImporter.class);
    private final VestMailSamsungImporter samsungImporter = mock(VestMailSamsungImporter.class);

    private CardEmailImportSettingsController controller;

    @BeforeEach
    void setUp() {
        when(emailResolver.currentEmail()).thenReturn("user@example.com");
        when(userSettingsLedger.get("user@example.com")).thenReturn(new UserSettingsLedger.UserSettings(
                1L, "user@example.com", "user", 6, List.of(), 3, List.of()));
        controller = new CardEmailImportSettingsController(
                ledger, cipher, emailResolver, userSettingsLedger, hyundaiImporter, samsungImporter);
    }

    private CardEmailImportSettingsController.SettingsDto dto(String emailPassword, String vestmailPassword) {
        return new CardEmailImportSettingsController.SettingsDto(
                true, "gmail", "user@example.com", emailPassword, vestmailPassword);
    }

    @Test
    void samsungcardSettingsAreAcceptedAndSeparateFromHyundai() {
        controller.upsert("hyundaicard", dto("app-1", "vest-1"));
        var saved = controller.upsert("samsungcard", dto("app-2", "vest-2")).getData();

        assertThat(saved.cardCompany()).isEqualTo("samsungcard");
        assertThat(ledger.findByUserId(1L)).hasSize(2);
        assertThat(cipher.decrypt(ledger.findByUserIdAndCardCompany(1L, "samsungcard")
                .orElseThrow().emailPasswordEnc())).isEqualTo("app-2");
        // GET 응답에는 비밀번호 필드가 없다.
        assertThat(controller.get("samsungcard").getData().emailAddress()).isEqualTo("user@example.com");
    }

    @Test
    void blankPasswordsKeepExistingEncryptedValues() {
        controller.upsert("samsungcard", dto("app-1", "vest-1"));
        controller.upsert("samsungcard", dto("", ""));

        var stored = ledger.findByUserIdAndCardCompany(1L, "samsungcard").orElseThrow();
        assertThat(cipher.decrypt(stored.emailPasswordEnc())).isEqualTo("app-1");
        assertThat(cipher.decrypt(stored.vestmailPasswordEnc())).isEqualTo("vest-1");
    }

    @Test
    void firstSaveStillRequiresBothPasswords() {
        assertThatThrownBy(() -> controller.upsert("samsungcard", dto("app-1", "")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("vestmailPassword");
    }

    @Test
    void runNowDispatchesByCardCompany() {
        controller.upsert("samsungcard", dto("app-1", "vest-1"));
        when(samsungImporter.importForUser(any())).thenReturn(14);

        var response = controller.runNow("samsungcard");

        assertThat(response.getData()).isEqualTo(14);
        verify(samsungImporter).importForUser(any());
        verify(hyundaiImporter, never()).importForUser(any());
    }

    @Test
    void unsupportedCompanyIsRejected() {
        assertThatThrownBy(() -> controller.get("shinhancard"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unsupported card company");
    }
}
