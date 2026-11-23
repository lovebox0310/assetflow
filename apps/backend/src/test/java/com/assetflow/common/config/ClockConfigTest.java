package com.assetflow.common.config;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이슈 #57: 운영 시계는 KST 고정이다. 서버 기본 TZ(UTC 등)에 맡기면 월초 00:00~09:00 KST
 * 구간에 대시보드가 지난 달을 "이번 달"로 계산한다.
 */
class ClockConfigTest {

    @Test
    void clockIsPinnedToKoreanTime() {
        Clock clock = new ClockConfig().clock();

        assertThat(clock.getZone()).isEqualTo(ZoneId.of("Asia/Seoul"));
        // 한국은 DST 가 없으므로 고정 오프셋 +09:00 과 같다.
        assertThat(clock.getZone().getRules().getOffset(java.time.Instant.now()))
                .isEqualTo(java.time.ZoneOffset.ofHours(9));
    }
}
