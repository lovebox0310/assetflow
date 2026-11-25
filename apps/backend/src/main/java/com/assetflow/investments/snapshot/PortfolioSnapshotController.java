package com.assetflow.investments.snapshot;

import com.assetflow.common.api.ApiResponse;
import com.assetflow.common.api.NotFoundException;
import com.assetflow.settings.AuthEmailResolver;
import com.assetflow.settings.UserSettingsLedger;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 투자 추이 스냅샷 조회 (이슈 #52).
 *
 * <p>대시보드 차트가 {@code from~to} 를 바꿔 가며 부른다. 계산은 서버가 하고
 * 화면은 점만 그린다 — 원금/평가 정의가 화면마다 갈리지 않게.</p>
 */
@RestController
@RequestMapping("/api/v1/investments/snapshots")
public class PortfolioSnapshotController {

    /** 2년을 넘는 구간은 차트에서 의미가 없고 응답만 커진다. */
    private static final long MAX_DAYS = 731;

    private final PortfolioSnapshotService service;
    private final UserSettingsLedger settingsLedger;
    private final AuthEmailResolver emailResolver;

    public PortfolioSnapshotController(PortfolioSnapshotService service,
                                       UserSettingsLedger settingsLedger,
                                       AuthEmailResolver emailResolver) {
        this.service = service;
        this.settingsLedger = settingsLedger;
        this.emailResolver = emailResolver;
    }

    @GetMapping
    public ApiResponse<List<PortfolioSnapshotLedger.Snapshot>> range(
            @RequestParam("from") String from, @RequestParam("to") String to) {
        LocalDate fromDate = parse(from, "from");
        LocalDate toDate = parse(to, "to");
        if (fromDate.isAfter(toDate)) {
            throw new IllegalArgumentException("from must be earlier than or equal to to");
        }
        if (ChronoUnit.DAYS.between(fromDate, toDate) > MAX_DAYS) {
            throw new IllegalArgumentException("range must be 731 days or fewer");
        }
        return new ApiResponse<>("OK", "Portfolio snapshots loaded",
                service.range(currentUserId(), fromDate, toDate));
    }

    /** 수동 1점(진단·보정용). 차트가 비어 보일 때 지금 값을 넣어 확인할 수 있다. */
    @PostMapping("/capture")
    public ApiResponse<PortfolioSnapshotLedger.Snapshot> capture() {
        return new ApiResponse<>("OK", "Portfolio snapshot captured",
                service.capture(currentUserId(), "manual"));
    }

    private static LocalDate parse(String value, String field) {
        try {
            return LocalDate.parse(value);
        } catch (DateTimeParseException | NullPointerException e) {
            throw new IllegalArgumentException(field + " must be YYYY-MM-DD");
        }
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
