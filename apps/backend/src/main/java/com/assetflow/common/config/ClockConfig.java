package com.assetflow.common.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

/**
 * 이슈 #57: "이번 달"의 출처는 시계 하나다.
 *
 * <p>종전에는 대시보드가 {@code MockDashboardSource.BASELINE_MONTH = "2026-10"} 상수로 계산해,
 * 11월 스냅샷을 확정해도 화면이 10월 기준에 머물렀다. 이제 현재 월은 주입된
 * {@link Clock} 에서 계산한다({@code DashboardService#currentMonth}).
 * 테스트는 생성자 주입으로 고정 시계({@code Clock.fixed})를 넣어 결과를 결정적으로 만든다 —
 * 그래서 이 빈은 {@code application.yml} 설정값이 아니라 코드로 등록한다(설정으로 바꾸면
 * 테스트가 환경에 끌려간다).</p>
 *
 * <p><b>Asia/Seoul 고정</b>: 서버 TZ 가 UTC 면 월초 00:00~09:00 KST 구간에 지난 달로 계산된다
 * (예: 11/1 00:30 KST = 10/31 15:30 UTC — UTC 기준으로는 아직 10월). 금융 데이터의 "이번 달"은
 * KST 기준이어야 한다. 같은 선례가 {@code BankSyncService} 에 있다(조회 기간 계산에 KST 사용).</p>
 */
@Configuration
public class ClockConfig {

    /**
     * 금융 데이터의 달 경계 기준 시간대. {@code BankSyncService} 도 같은 값을 지역 상수로 둔다 —
     * 값 하나 때문에 공용 상수 파일을 만들면 common 이 도메인 패키지에 얹히는 역방향 의존이
     * 생기므로, 두 곳에 각자 지역 상수로 둔다(동작은 ISO 지역 ID 로 같다).
     */
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    /** 운영 시계: KST 고정 — 서버 기본 TZ(UTC 등)에 기대지 않는다. */
    @Bean
    public Clock clock() {
        return Clock.system(SEOUL);
    }
}
