package com.assetflow.investments.toss;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 이슈 #55 Stage 2 빈 배선 — {@code app.toss.enabled} 값에 따라 <b>정확히 하나</b>의
 * {@link TossApiClient} 가 등록되는지 확인한다.
 *
 * <p>두 구현이 모두 등록되면 주입이 모호해지고, 아무것도 등록되지 않으면 부팅이 깨진다.
 * 생성자가 둘 이상인 구현은 Spring 이 기본 생성자를 찾다가 실패하므로(실제로 한 번 깨졌다)
 * 이 테스트를 남긴다.</p>
 */
class TossApiClientWiringTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withBean(ObjectMapper.class, ObjectMapper::new)
            .withBean(TossProperties.class, TossProperties::new);

    @Test
    void enabledUsesHttpClient() {
        runner.withPropertyValues("app.toss.enabled=true")
                .withUserConfiguration(HttpTossApiClient.class, TossApiClientFallback.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(TossApiClient.class))
                            .isInstanceOf(HttpTossApiClient.class);
                });
    }

    @Test
    void disabledFallsBackToNotConfiguredClient() {
        runner.withUserConfiguration(HttpTossApiClient.class, TossApiClientFallback.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    TossApiClient client = context.getBean(TossApiClient.class);
                    assertThat(client).isInstanceOf(TossApiClientFallback.class);
                    // 꺼져 있으면 거짓 성공 대신 503 계열 오류를 던진다.
                    assertThatThrownBy(() -> client.holdings(
                            new TossCredentials(1L, "id", "secret", "42")))
                            .isInstanceOf(TossNotConfiguredException.class);
                });
    }
}
