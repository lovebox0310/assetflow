package com.assetflow.investments.toss;

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

import java.util.List;
import java.util.Optional;

/**
 * 토스증권 연동 API (이슈 #55 Stage 1 → Stage 2).
 *
 * - GET    /api/v1/integrations/toss         → 설정 여부 + 연결 계좌/토스 계좌 식별자 보유 여부
 * - PUT    /api/v1/integrations/toss         → 자격증명 저장(AES/GCM)
 * - DELETE /api/v1/integrations/toss         → 삭제
 * - POST   /api/v1/integrations/toss/test    → 연결 테스트 (주입된 {@link TossApiClient})
 * - GET    /api/v1/integrations/toss/accounts → 토스 계좌 목록(accountNo 마스킹)
 * - POST   /api/v1/investments/toss/sync     → 보유자산 동기화
 * - POST   /api/v1/accounts/{accountId}/toss-preview → 보유자산 원본 진단(읽기 전용)
 *
 * 응답·오류 메시지에 clientSecret 평문을 절대 넣지 않는다. 진단 응답의 accountNo 는
 * 앞 2자리 + {@code ****} 로 마스킹한다. 토스 호출 실패도 200 + error 로 돌려
 * 화면이 사유를 보여 줄 수 있게 한다(kis-pension-preview 패턴).
 */
@RestController
@RequestMapping("/api/v1")
public class TossIntegrationController {

    private final TossCredentialsService credentials;
    private final TossApiClient client;
    private final TossSyncService syncService;
    private final TossProperties properties;
    private final UserSettingsLedger settingsLedger;
    private final AuthEmailResolver emailResolver;

    public TossIntegrationController(TossCredentialsService credentials, TossApiClient client,
                                     TossSyncService syncService, TossProperties properties,
                                     UserSettingsLedger settingsLedger,
                                     AuthEmailResolver emailResolver) {
        this.credentials = credentials;
        this.client = client;
        this.syncService = syncService;
        this.properties = properties;
        this.settingsLedger = settingsLedger;
        this.emailResolver = emailResolver;
    }

    /** 연결 상태. secret 은 어떤 형태로도 내려보내지 않는다. */
    public record TossStatus(boolean configured, Long accountId, boolean hasAccountSeq) {}

    public record TossKeysBody(Long accountId, String clientId, String clientSecret,
                               String tossAccountSeq) {}

    public record TossTestResult(boolean ok) {}

    /** 진단용 계좌 목록 1건 — accountNo 는 마스킹된 값만 담는다. */
    public record TossAccountView(Integer accountSeq, String accountNo, String accountType) {}

    /** 실패도 200 이므로 사유를 {@code error} 에 담는다(성공이면 null). */
    public record TossAccountsResult(List<TossAccountView> accounts, String error) {}

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

    /**
     * 토스 계좌 목록 진단. 실패(자격증명 없음·토스 오류)도 200 + error 로 돌려준다.
     * accountNo 는 마스킹해서만 내려보낸다.
     */
    /**
     * 토큰 발급 진단 — 403 의 사유를 화면에서 볼 수 있게 상태·오류 코드·응답 본문을 돌려준다.
     *
     * <p>{@code /test} 는 예외로만 알려 줘서 "허용 IP 미등록"과 "자격증명 오류"를 구분할 수
     * 없었다. 진단은 **읽기 전용**이며 실패도 200 + error 로 돌려준다(DB 변경 없음).
     * 응답 본문의 자격증명 문자열은 클라이언트가 지운다.</p>
     */
    @GetMapping("/integrations/toss/token-preview")
    public ApiResponse<TossApiClient.TokenDiagnosis> tokenPreview() {
        if (!properties.isEnabled()) {
            throw new TossNotConfiguredException("토스 연동이 비활성화되어 있습니다(app.toss.enabled)");
        }
        TossCredentials creds = credentials.findDecrypted(currentUserId())
                .orElseThrow(() -> new NotFoundException("토스 자격증명이 없습니다"));
        return new ApiResponse<>("OK", "Toss token diagnosis", client.diagnoseToken(creds));
    }

    @GetMapping("/integrations/toss/accounts")
    public ApiResponse<TossAccountsResult> accounts() {
        Optional<TossCredentials> found = credentials.findDecrypted(currentUserId())
                .filter(TossCredentials::hasCredentials);
        if (found.isEmpty()) {
            return new ApiResponse<>("OK", "Toss accounts",
                    new TossAccountsResult(List.of(), "토스 자격증명이 없습니다"));
        }
        try {
            List<TossAccountView> views = client.accounts(found.get()).stream()
                    .map(account -> new TossAccountView(account.accountSeq(),
                            account.maskedAccountNo(), account.accountType()))
                    .toList();
            return new ApiResponse<>("OK", "Toss accounts", new TossAccountsResult(views, null));
        } catch (TossApiException e) {
            return new ApiResponse<>("OK", "Toss accounts",
                    new TossAccountsResult(List.of(), e.getMessage()));
        }
    }

    /** 보유자산 동기화. 계좌 검증 실패는 400, 토스 오류는 502 로 매핑된다. */
    @PostMapping("/investments/toss/sync")
    public ApiResponse<TossSyncService.SyncResult> sync() {
        return new ApiResponse<>("OK", "Toss holdings synced", syncService.sync(currentUserId()));
    }

    /** 보유자산 원본 진단(읽기 전용, DB 변경 없음). 실패도 200 + error. */
    @PostMapping("/accounts/{accountId}/toss-preview")
    public ApiResponse<TossSyncService.TossPreview> preview(@PathVariable long accountId) {
        return new ApiResponse<>("OK", "Toss holdings preview",
                syncService.preview(currentUserId(), accountId));
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
