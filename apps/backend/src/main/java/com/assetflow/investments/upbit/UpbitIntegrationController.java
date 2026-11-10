package com.assetflow.investments.upbit;

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

import java.util.List;
import java.util.Optional;

/**
 * 업비트 연동 API (UPBIT-2).
 *
 * - GET    /api/v1/integrations/upbit       → 설정 여부 + 마스킹된 access key
 * - PUT    /api/v1/integrations/upbit       → 키 저장(AES/GCM) 후 마스킹 값 반환
 * - DELETE /api/v1/integrations/upbit       → 삭제
 * - POST   /api/v1/integrations/upbit/test  → 실제 /v1/accounts 호출 (성공 시 계좌 수)
 * - POST   /api/v1/investments/upbit/sync   → 보유 코인 동기화
 *
 * 응답·오류 메시지에 secret 평문/JWT 를 절대 넣지 않는다.
 */
@RestController
@RequestMapping("/api/v1")
public class UpbitIntegrationController {

    private final UpbitCredentialsService credentials;
    private final UpbitAccountClient client;
    private final UpbitSyncService syncService;
    private final UserSettingsLedger settingsLedger;
    private final AuthEmailResolver emailResolver;

    public UpbitIntegrationController(UpbitCredentialsService credentials, UpbitAccountClient client,
                                      UpbitSyncService syncService,
                                      UserSettingsLedger settingsLedger,
                                      AuthEmailResolver emailResolver) {
        this.credentials = credentials;
        this.client = client;
        this.syncService = syncService;
        this.settingsLedger = settingsLedger;
        this.emailResolver = emailResolver;
    }

    public record UpbitStatus(boolean configured, String accessKeyMasked) {}

    public record UpbitKeysBody(String accessKey, String secretKey) {}

    public record UpbitTestResult(boolean ok, int accounts) {}

    @GetMapping("/integrations/upbit")
    public ApiResponse<UpbitStatus> status() {
        return new ApiResponse<>("OK", "Upbit integration loaded", statusOf(currentUserId()));
    }

    @PutMapping("/integrations/upbit")
    public ApiResponse<UpbitStatus> save(@RequestBody UpbitKeysBody body) {
        String accessKey = body == null ? null : body.accessKey();
        String secretKey = body == null ? null : body.secretKey();
        if (accessKey == null || accessKey.isBlank() || secretKey == null || secretKey.isBlank()) {
            throw new IllegalArgumentException("accessKey and secretKey are required");
        }
        long userId = currentUserId();
        credentials.save(userId, new UpbitCredentials(accessKey.trim(), secretKey.trim()));
        return new ApiResponse<>("OK", "Upbit integration saved", statusOf(userId));
    }

    @DeleteMapping("/integrations/upbit")
    public ApiResponse<UpbitStatus> delete() {
        credentials.delete(currentUserId());
        return new ApiResponse<>("OK", "Upbit integration deleted", new UpbitStatus(false, null));
    }

    @PostMapping("/integrations/upbit/test")
    public ApiResponse<UpbitTestResult> test() {
        UpbitCredentials creds = credentials.findDecrypted(currentUserId())
                .orElseThrow(() -> new UpbitNotConfiguredException("upbit credentials are not configured"));
        List<UpbitAccount> accounts = client.accounts(creds);
        return new ApiResponse<>("OK", "Upbit connection ok", new UpbitTestResult(true, accounts.size()));
    }

    @PostMapping("/investments/upbit/sync")
    public ApiResponse<UpbitSyncService.SyncResult> sync() {
        return new ApiResponse<>("OK", "Upbit holdings synced", syncService.sync(currentUserId()));
    }

    private UpbitStatus statusOf(long userId) {
        Optional<UpbitCredentials> creds = credentials.findDecrypted(userId);
        return creds
                .map(value -> new UpbitStatus(true, UpbitCredentialsService.mask(value.accessKey())))
                .orElseGet(() -> new UpbitStatus(false, null));
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
