package com.assetflow.investments.toss;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.UserSettingsLedger;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

/**
 * 토스증권 연동 API (이슈 #55 Stage 1 — 자격증명만).
 *
 * - GET    /api/v1/integrations/toss       → 설정 여부 + 연결 계좌/토스 계좌 식별자 보유 여부
 * - PUT    /api/v1/integrations/toss       → 자격증명 저장(AES/GCM)
 * - DELETE /api/v1/integrations/toss       → 삭제
 * - POST   /api/v1/integrations/toss/test  → 연결 테스트 (주입된 {@link TossApiClient})
 *
 * 응답·오류 메시지에 clientSecret 평문을 절대 넣지 않는다. 실제 보유자산 동기화는
 * Stage 2 이며, 이 단계의 test 는 클라이언트 계약만 호출한다.
 */
@RestController
@RequestMapping("/api/v1")
public class TossIntegrationController {

    private final TossCredentialsService credentials;
    private final TossApiClient client;
    private final TossProperties properties;
    private final UserSettingsLedger settingsLedger;
    private final AuthEmailResolver emailResolver;

    public TossIntegrationController(TossCredentialsService credentials, TossApiClient client,
                                     TossProperties properties,
                                     UserSettingsLedger settingsLedger,
                                     AuthEmailResolver emailResolver) {
        this.credentials = credentials;
        this.client = client;
        this.properties = properties;
        this.settingsLedger = settingsLedger;
        this.emailResolver = emailResolver;
    }

    /** 연결 상태. secret 은 어떤 형태로도 내려보내지 않는다. */
    public record TossStatus(boolean configured, Long accountId, boolean hasAccountSeq) {}

    public record TossKeysBody(Long accountId, String clientId, String clientSecret,
                               String tossAccountSeq) {}

    public record TossTestResult(boolean ok) {}

    @GetMapping("/integrations/toss")
    public ApiResponse<TossStatus> status() {
        return new ApiResponse<>("OK", "Toss integration loaded", statusOf(currentUserId()));
    }

    @PutMapping("/integrations/toss")
    public ApiResponse<TossStatus> save(@RequestBody TossKeysBody body) {
        String clientId = trimToNull(body == null ? null : body.clientId());
        String clientSecret = trimToNull(body == null ? null : body.clientSecret());
        if (clientId == null || clientSecret == null) {
            throw new IllegalArgumentException("clientId and clientSecret are required");
        }
        long userId = currentUserId();
        credentials.save(userId, new TossCredentials(
                body.accountId(), clientId, clientSecret, trimToNull(body.tossAccountSeq())));
        return new ApiResponse<>("OK", "Toss integration saved", statusOf(userId));
    }

    @DeleteMapping("/integrations/toss")
    public ApiResponse<TossStatus> delete() {
        credentials.delete(currentUserId());
        return new ApiResponse<>("OK", "Toss integration deleted", new TossStatus(false, null, false));
    }

    @PostMapping("/integrations/toss/test")
    public ApiResponse<TossTestResult> test() {
        if (!properties.isEnabled()) {
            throw new TossNotConfiguredException("토스 연동이 비활성화되어 있습니다(app.toss.enabled)");
        }
        TossCredentials creds = credentials.findDecrypted(currentUserId())
                .orElseThrow(() -> new NotFoundException("토스 자격증명이 없습니다"));
        if (!creds.hasCredentials()) {
            throw new NotFoundException("토스 자격증명이 없습니다");
        }
        client.verify(creds);
        return new ApiResponse<>("OK", "Toss connection ok", new TossTestResult(true));
    }

    private TossStatus statusOf(long userId) {
        Optional<TossCredentials> creds = credentials.findDecrypted(userId);
        return creds
                .map(value -> new TossStatus(true, value.accountId(), value.hasAccountSeq()))
                .orElseGet(() -> new TossStatus(false, null, false));
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private long currentUserId() {
        String email = emailResolver.currentEmail();
        UserSettingsLedger.UserSettings settings = settingsLedger.get(email);
        if (settings == null) {
            throw new NotFoundException("settings");
        }
        return settings.id();
    }
}
