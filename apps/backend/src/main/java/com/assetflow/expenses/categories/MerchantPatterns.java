package com.assetflow.expenses.categories;

import java.util.regex.Pattern;

/**
 * 가맹점명에서 PG 공유 사업자번호용 패턴을 뽑는다 (§67, §73).
 *
 * <p>KCP·나이스·토스페이먼츠처럼 하나의 사업자번호를 여러 가맹점이 공유하는 경우,
 * 사업자번호만으로 분류하면 오분류된다. 가맹점명에서 PG 접두어와 법인 표기를
 * 제거한 나머지를 패턴으로 저장해 {@code contains} 매칭한다.</p>
 *
 * <p>예: {@code "KCP - (주)우아한형제들"} → {@code "우아한형제들"},
 * {@code "토스페이먼츠 - (주)널리소프트"} → {@code "널리소프트"}.</p>
 */
public final class MerchantPatterns {

    private static final Pattern CORPORATE_MARKERS =
            Pattern.compile("\\(주\\)|㈜|\\(유\\)|주식회사|유한회사");

    private MerchantPatterns() {
    }

    public static String derive(String merchantName) {
        String normalized = BusinessCategorySeed.normalize(merchantName);
        if (normalized.isBlank()) {
            return "";
        }
        // PG 접두어는 보통 "KCP - ", "나이스 - " 처럼 마지막 '-' 뒤에 실제 가맹점명이 온다.
        int dash = normalized.lastIndexOf('-');
        String token = dash >= 0 && dash + 1 < normalized.length()
                ? normalized.substring(dash + 1)
                : normalized;
        token = CORPORATE_MARKERS.matcher(token).replaceAll("").trim();
        if (token.length() < 2) {
            token = normalized;
        }
        return token;
    }
}
