package com.assetflow.common.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 배포 헬스체크 (§12 배포 순서 6단계). 인증 없이 접근 허용 —
 * 플랫폼 헬스체크와 알람의 대상. 실서비스 모니터링 확장 시 actuator 로 대체한다.
 */
@RestController
public class HealthController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "UP");
    }
}
