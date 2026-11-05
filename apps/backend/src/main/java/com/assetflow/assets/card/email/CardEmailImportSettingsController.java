package com.assetflow.assets.card.email;

import com.assetflow.assets.card.CardImportCipher;
import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.UserSettingsLedger;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 이메일 명세서 자동 수집 설정 API (§63).
 *
 * <p>비밀번호는 PUT 시에만 평문으로 받아서 즉시 AES/GCM 암호화한다.
 * GET 응답에는 비밀번호 필드를 제외한다.</p>
 */
@RestController
@RequestMapping("/api/v1/card-email-import-settings")
public class CardEmailImportSettingsController {

    private static final String PROVIDER_GMAIL = "gmail";
    private static final String COMPANY_HYUNDAI = "hyundaicard";

    private final CardEmailImportSettingsLedger ledger;
    private final CardImportCipher cipher;
    private final AuthEmailResolver emailResolver;
    private final UserSettingsLedger userSettingsLedger;
    private final VestMailHyundaiImporter hyundaiImporter;

    public CardEmailImportSettingsController(CardEmailImportSettingsLedger ledger,
                                             CardImportCipher cipher,
                                             AuthEmailResolver emailResolver,
                                             UserSettingsLedger userSettingsLedger,
                                             VestMailHyundaiImporter hyundaiImporter) {
        this.ledger = ledger;
        this.cipher = cipher;
        this.emailResolver = emailResolver;
        this.userSettingsLedger = userSettingsLedger;
        this.hyundaiImporter = hyundaiImporter;
    }

    public record SettingsDto(boolean enabled,
                              String emailProvider,
                              String emailAddress,
                              String emailPassword,
                              String vestmailPassword) {}

    public record SettingsResponse(Long id,
                                   boolean enabled,
                                   String cardCompany,
                                   String emailProvider,
                                   String emailAddress,
                                   String lastImportStatus) {}

    @GetMapping("/{cardCompany}")
    public ApiResponse<SettingsResponse> get(@PathVariable String cardCompany) {
        Long userId = currentUserId();
        return ledger.findByUserIdAndCardCompany(userId, validateCompany(cardCompany))
                .map(this::toResponse)
                .map(r -> new ApiResponse<>("OK", "Card email import settings loaded", r))
                .orElseThrow(() -> new NotFoundException("card email import settings"));
    }

    @PutMapping("/{cardCompany}")
    public ApiResponse<SettingsResponse> upsert(@PathVariable String cardCompany,
                                                @RequestBody SettingsDto dto) {
        Long userId = currentUserId();
        String company = validateCompany(cardCompany);
        String provider = dto.emailProvider() == null ? PROVIDER_GMAIL : dto.emailProvider();
        if (!PROVIDER_GMAIL.equals(provider)) {
            throw new IllegalArgumentException("Only gmail provider is supported");
        }
        if (dto.emailAddress() == null || dto.emailAddress().isBlank()) {
            throw new IllegalArgumentException("emailAddress is required");
        }
        if (dto.emailPassword() == null || dto.emailPassword().isBlank()) {
            throw new IllegalArgumentException("emailPassword is required");
        }
        if (dto.vestmailPassword() == null || dto.vestmailPassword().isBlank()) {
            throw new IllegalArgumentException("vestmailPassword is required");
        }

        CardEmailImportSettings settings = new CardEmailImportSettings(
                null,
                userId,
                dto.enabled(),
                company,
                provider,
                dto.emailAddress().trim(),
                cipher.encrypt(dto.emailPassword()),
                cipher.encrypt(dto.vestmailPassword()),
                null,
                null);

        CardEmailImportSettings saved = ledger.save(settings);
        return new ApiResponse<>("OK", "Card email import settings saved", toResponse(saved));
    }

    @DeleteMapping("/{cardCompany}")
    public ApiResponse<Void> delete(@PathVariable String cardCompany) {
        Long userId = currentUserId();
        ledger.delete(userId, validateCompany(cardCompany));
        return new ApiResponse<>("OK", "Card email import settings deleted", null);
    }

    @PostMapping("/{cardCompany}/run")
    public ApiResponse<Integer> runNow(@PathVariable String cardCompany) {
        Long userId = currentUserId();
        String company = validateCompany(cardCompany);
        CardEmailImportSettings settings = ledger.findByUserIdAndCardCompany(userId, company)
                .orElseThrow(() -> new NotFoundException("card email import settings"));
        if (!settings.enabled()) {
            throw new IllegalStateException("card email import is not enabled");
        }
        int imported = hyundaiImporter.importForUser(settings);
        return new ApiResponse<>("OK", "Import finished", imported);
    }

    private SettingsResponse toResponse(CardEmailImportSettings s) {
        return new SettingsResponse(
                s.id(),
                s.enabled(),
                s.cardCompany(),
                s.emailProvider(),
                s.emailAddress(),
                s.lastImportStatus());
    }

    private Long currentUserId() {
        UserSettingsLedger.UserSettings user = userSettingsLedger.get(emailResolver.currentEmail());
        if (user == null) {
            throw new NotFoundException("user");
        }
        return user.id();
    }

    private String validateCompany(String cardCompany) {
        if (!COMPANY_HYUNDAI.equals(cardCompany)) {
            throw new IllegalArgumentException("Only hyundaicard is supported");
        }
        return cardCompany;
    }
}
