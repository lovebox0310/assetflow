package com.assetflow.expenses.categories;

import com.assetflow.expenses.categories.CategoryClassifier.Classification;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * 카드 명세서의 업종(businessCategory)을 대분류로 옮기는 3순위 fallback (§55.8.9).
 *
 * <p>사용자 규칙(merchant_rules)과 가맹점명 키워드가 모두 실패했을 때만 쓴다. 업종은
 * 카드사가 붙인 업태라 실제 구매와 다를 수 있으므로, 의미가 분명한 값만 매핑하고
 * PG·온라인거래·통신판매처럼 구매처를 알 수 없는 값은 비워 둔다.
 *
 * <p>업종 값은 카드사마다 다르다. 여기 없는 업종은 미분류로 남는 것이 맞다 —
 * 억지로 분류하면 월별 지출 구성이 조용히 틀어진다.
 */
public final class BusinessCategoryHints {

    private record Hint(String keyword, String category, String subCategory) {}

    /**
     * 구매처를 알 수 없어 분류에 쓸 수 없는 업종. 키워드 매칭보다 먼저 걸러낸다.
     * 예: 삼성의 "PG_일반인증"·"온라인거래일반인증외"·"인터넷쇼핑몰일반인증외".
     */
    private static final List<String> AMBIGUOUS = List.of(
            "pg", "결제대행", "전자결제", "간편결제", "휴대폰결제",
            "온라인거래", "인터넷쇼핑몰", "통신판매", "일반인증", "에스크로",
            "상품권", "선불", "면세",
            // 반려동물 진료는 사람 의료비와 섞지 않는다.
            "동물병원", "동물약국");

    /** 긴 키워드가 먼저 매칭되도록 길이 내림차순으로 정렬한다(자동차보험 > 보험). */
    private static final List<Hint> HINTS = buildHints();

    private BusinessCategoryHints() {
    }

    /**
     * 업종 문자열 하나를 카테고리로 옮긴다. 애매하거나 비어 있으면 null.
     * 호출 측은 null 을 "미분류"로 처리한다.
     */
    public static Classification classify(String businessCategory) {
        if (businessCategory == null || businessCategory.isBlank()) {
            return null;
        }
        String normalized = normalize(businessCategory);
        for (String ambiguous : AMBIGUOUS) {
            if (normalized.contains(ambiguous)) {
                return null;
            }
        }
        for (Hint hint : HINTS) {
            if (normalized.contains(hint.keyword())) {
                return new Classification(hint.category(), hint.subCategory());
            }
        }
        return null;
    }

    private static String normalize(String value) {
        return value.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static List<Hint> buildHints() {
        List<Hint> hints = new ArrayList<>();

        // ── 식비 ──────────────────────────────────────────────────────────
        add(hints, "식비", "장보기",
                "슈퍼마켓", "마트", "식료품", "농수산물", "청과", "정육", "축산물", "반찬");
        add(hints, "식비", "외식",
                "일반음식점", "음식점", "한식", "중식", "일식", "양식", "분식", "패스트푸드",
                "식당", "뷔페", "주점", "호프", "치킨", "피자", "국밥", "횟집", "고깃집",
                "김밥", "떡볶이", "휴게소");
        add(hints, "식비", "카페/간식",
                "카페", "커피", "제과", "베이커리", "아이스크림", "디저트", "편의점");
        add(hints, "식비", "배달", "배달");

        // ── 주거/통신 ────────────────────────────────────────────────────
        add(hints, "주거/통신", "주거비",
                "아파트관리", "관리비", "전기요금", "도시가스", "가스요금", "수도요금",
                "상수도", "난방", "전기", "가스", "수도");
        add(hints, "주거/통신", "통신비",
                "이동통신", "초고속인터넷", "인터넷", "통신", "휴대폰", "알뜰폰", "IPTV", "유선방송");

        // ── 교통/차량 ────────────────────────────────────────────────────
        add(hints, "교통/차량", "대중교통",
                "지하철", "철도", "고속버스", "공항철도", "버스", "택시", "KTX");
        add(hints, "교통/차량", "차량유지비",
                "자동차정비", "자동차보험", "자동차", "주유소", "주유", "주차장", "주차",
                "세차", "정비", "톨게이트", "하이패스", "렌터카");

        // ── 쇼핑/생활 ────────────────────────────────────────────────────
        add(hints, "쇼핑/생활", "생활용품",
                "생활용품", "잡화", "문구", "철물", "세탁", "욕실", "다이소");
        add(hints, "쇼핑/생활", "의류/잡화",
                "의류", "신발", "가방", "패션", "섬유", "한복");
        add(hints, "쇼핑/생활", "가전/가구",
                "전자제품", "가전", "가구", "컴퓨터");
        add(hints, "쇼핑/생활", "미용/뷰티",
                "피부관리", "미용실", "미용", "헤어", "네일", "왁싱", "화장품", "뷰티", "바버");

        // ── 건강/의료 ────────────────────────────────────────────────────
        add(hints, "건강/의료", "병원비",
                "정형외과", "이비인후과", "한의원", "피부과", "내과", "안과", "치과",
                "의료", "병원", "의원", "요양");
        add(hints, "건강/의료", "약국", "약국");
        add(hints, "건강/의료", "건강기능식품",
                "건강기능식품", "건강식품", "영양제", "홍삼", "비타민");

        // ── 문화/여가 ────────────────────────────────────────────────────
        add(hints, "문화/여가", "취미/여가",
                "영화관", "노래연습장", "노래방", "pc방", "골프", "헬스", "수영", "서점", "도서",
                "볼링", "당구", "사진", "공연", "예술", "스포츠", "박물관", "미술관", "영화");
        add(hints, "문화/여가", "여행/숙박",
                "호텔", "숙박", "여행", "리조트", "항공", "펜션", "캠핑", "콘도");

        // ── 금융/세금 ────────────────────────────────────────────────────
        add(hints, "금융/세금", "보험료", "보험");
        add(hints, "금융/세금", "세금/공과금",
                "지방세", "등록세", "취득세", "재산세", "과태료", "공과금", "국세", "세금");
        add(hints, "금융/세금", "저축/투자",
                "가상자산", "증권", "은행", "저축", "적금", "예금", "펀드", "투자", "코인");

        // ── 기타/경조사 ──────────────────────────────────────────────────
        add(hints, "기타/경조사", "경조사비",
                "예식장", "축의금", "장례", "상조", "결혼", "꽃집", "화훼");

        // ── 교육 ────────────────────────────────────────────────────────
        add(hints, "교육", "학원/교육",
                "아카데미", "학습지", "학원", "교육", "교습");
        add(hints, "교육", "학교/등록금",
                "대학교", "등록금", "유치원", "학교", "학비");

        hints.sort(Comparator.comparingInt((Hint h) -> h.keyword().length()).reversed());
        return List.copyOf(hints);
    }

    private static void add(List<Hint> hints, String category, String subCategory, String... keywords) {
        for (String keyword : keywords) {
            hints.add(new Hint(keyword.toLowerCase(Locale.ROOT), category, subCategory));
        }
    }
}
