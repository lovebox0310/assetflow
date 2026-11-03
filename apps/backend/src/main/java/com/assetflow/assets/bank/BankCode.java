package com.assetflow.assets.bank;

import java.util.Locale;
import java.util.Optional;

/**
 * §61 빠른조회(간편조회) 기반 무료 계좌조회 API 가 지원하는 무로그인 은행.
 *
 * 신한(SH)은 인터넷뱅킹 ID/PW 로그인이 필요해 1단계 범위에서 제외한다.
 * 씨티 등 나머지 은행도 이 API 가 지원하지 않는다 — 화면에서도 이 4개만 노출한다.
 */
public enum BankCode {
    NH("농협은행"),
    KB("국민은행"),
    WR("우리은행"),
    IBK("기업은행");

    private final String label;

    BankCode(String label) {
        this.label = label;
    }

    /** 화면 표기용 이름. */
    public String label() {
        return label;
    }

    public static Optional<BankCode> of(String code) {
        if (code == null || code.isBlank()) return Optional.empty();
        try {
            return Optional.of(valueOf(code.trim().toUpperCase(Locale.ROOT)));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
