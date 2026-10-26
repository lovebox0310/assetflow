package com.assetflow.expenses.categories;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * 애플리케이션 부팅 시 기본 카테고리와 키워드 매핑을 시드한다 (§55.8, §55.10).
 * 멱등하게 작성돼 여러 번 실행해도 중복을 만들지 않는다.
 *
 * <p>분류 기준은 {@link CategoryTaxonomy} 하나만 본다 — 대분류/세부/고정비 판정을 여기서 다시 적지 않는다.
 */
@Component
@Profile("postgres")
public class CategorySeedData implements CommandLineRunner {

    private final JdbcTemplate jdbc;
    private final long userId;

    public CategorySeedData(JdbcTemplate jdbc,
                            @Value("${app.owner-email:user@example.com}") String ownerEmail) {
        this.jdbc = jdbc;
        this.userId = jdbc.queryForObject(
                "SELECT id FROM users WHERE email = ?", Long.class, ownerEmail);
    }

    @Override
    public void run(String... args) {
        seedCategories();
        Map<String, Keyword> keywords = keywordSeed();
        for (Map.Entry<String, Keyword> e : keywords.entrySet()) {
            // 업종을 직접 가리키는 키워드는 주소·건물명 키워드("병원", "버스")보다 먼저 매칭돼야 한다.
            // 예: "메가커피 ... 서울병원점" 은 병원이 아니라 커피집이다.
            int priority = HIGH_PRIORITY_KEYWORDS.contains(e.getKey()) ? 10 : 0;
            jdbc.update("""
                    INSERT INTO merchant_category_keywords (keyword, category_id, sub_category, priority)
                    SELECT ?, c.id, ?, ?
                    FROM expense_categories c
                    WHERE c.name = ? AND c.user_id IS NULL
                    ON CONFLICT (keyword) DO UPDATE SET category_id = EXCLUDED.category_id,
                                                        sub_category = EXCLUDED.sub_category,
                                                        priority = EXCLUDED.priority,
                                                        updated_at = now()
                    """, e.getKey(), e.getValue().subCategory(), priority, e.getValue().category());
        }
    }

    private void seedCategories() {
        for (CategoryTaxonomy.Group group : CategoryTaxonomy.GROUPS) {
            jdbc.update("""
                    INSERT INTO expense_categories (user_id, name, is_essential)
                    VALUES (NULL, ?, ?)
                    ON CONFLICT (name) WHERE user_id IS NULL
                    DO UPDATE SET is_essential = EXCLUDED.is_essential, updated_at = now()
                    """, group.name(), group.essential());
        }
    }

    private static Map<String, Keyword> keywordSeed() {
        Map<String, Keyword> map = new LinkedHashMap<>();

        // ── 식비 ──────────────────────────────────────────────────────────
        add(map, "식비", "장보기",
                "이마트", "홈플러스", "마트", "노브랜드", "롯데프리미엄푸드마켓", "컬리",
                "프레시웨이", "식품", "청과", "과일", "축산", "농협하나로");
        add(map, "식비", "외식",
                "식당", "김가네", "감자탕", "해장국", "순대국", "돈까스", "돈카츠", "마라탕",
                "우동", "곰탕", "치킨", "통닭", "한정식", "쭈꾸미", "포케", "버거", "샤브샤브",
                "국밥", "분식", "김밥", "떡볶이", "피자", "초밥", "스시", "파스타", "애슐리",
                "황태", "휴게소", "양꼬치", "본죽", "코이라멘", "솔솥", "카츠랩");
        add(map, "식비", "카페/간식",
                "베이커리", "카페", "스타벅스", "이디야", "뚜레쥬르", "파리바게뜨", "파리바게트",
                "배스킨라빈스", "빵", "커피", "아이스꽁꽁", "더벤티",
                // 편의점 간식·음료 (문서의 카페/간식)
                "GS25", "CU편의점", "세븐일레븐", "씨유", "지에스");
        add(map, "식비", "배달",
                "우아한형제들", "배달의민족", "쿠팡이츠", "요기요");

        // ── 주거/통신 ────────────────────────────────────────────────────
        add(map, "주거/통신", "주거비",
                "관리비", "임대료", "전기", "가스", "수도", "한국전력", "전력", "도시가스",
                "상수도", "자산관리");
        add(map, "주거/통신", "통신비",
                "유플러스", "lg유플러스", "#kt", "kt인터넷", "skt", "sk텔레콤", "휴대폰",
                "통신", "인터넷");

        // ── 교통/차량 ────────────────────────────────────────────────────
        add(map, "교통/차량", "대중교통",
                "지하철", "택시", "버스", "KTX", "SRT", "코레일네트웍스", "코레일",
                "티머니", "고속버스");
        // 자동차 보험은 '교통/차량'으로 둔다 (사용자 결정, §55.10).
        add(map, "교통/차량", "차량유지비",
                "주유소", "주유", "톨게이트", "도로공사", "고속도로", "하이패스", "주차",
                "파킹", "컴인워시", "세차", "워시", "현대자동차", "자동차보험",
                "삼성화재", "현대해상", "db손해", "kb손해", "메리츠화재");

        // ── 쇼핑/생활 ────────────────────────────────────────────────────
        add(map, "쇼핑/생활", "생활용품",
                "다이소", "아트박스", "홈쇼핑", "gs shop", "비치마켓", "수선",
                "쿠팡", "옥션", "g마켓", "ssg", "온라인몰", "쇼핑", "백화점", "aliexpress");
        add(map, "쇼핑/생활", "의류/잡화",
                "무신사", "유니클로", "자라", "신발", "아울렛", "에이블리", "스쿨룩스",
                "폴햄", "휠라", "의류", "패션", "레노마", "신성통상", "포레스트아웃팅스",
                "데카트론", "이랜드", "안경", "미니골드", "오피스웨이", "topten");
        add(map, "쇼핑/생활", "가전/가구", "컴퓨존", "삼성전자");
        add(map, "쇼핑/생활", "미용/뷰티",
                "살롱", "미용", "헤어", "네일", "에스테틱", "왁싱", "속눈썹", "바버샵", "뷰티");

        // ── 건강/의료 ────────────────────────────────────────────────────
        add(map, "건강/의료", "병원비",
                "병원", "의원", "치과", "정형외과", "이비인후과", "내과", "피부과", "안과",
                "한의원", "한의", "요양", "의료재단");
        add(map, "건강/의료", "약국", "약국");
        add(map, "건강/의료", "건강기능식품", "영양제", "홍삼", "비타민", "건강기능식품");

        // ── 문화/여가 ────────────────────────────────────────────────────
        add(map, "문화/여가", "취미/여가",
                "영화", "넷플릭스", "유튜브프리미엄", "롯데시네마", "박물관", "놀이동산",
                "당구", "노래방", "골프", "클럽하우스", "벌툰", "볼링", "방방", "사진관",
                "피나클랜드", "헬스", "필라테스", "수영", "게임",
                // 문서의 "도서 구매"는 문화/여가로 둔다.
                "서점", "종로서적", "도서", "교보문고");
        add(map, "문화/여가", "여행/숙박",
                "여행", "숙소", "숙박", "리조트", "여기어때", "곤지암", "모나용평", "캠핑");

        // ── 금융/세금 ────────────────────────────────────────────────────
        add(map, "금융/세금", "보험료", "보험");
        add(map, "금융/세금", "세금/공과금",
                "주민세", "자동차세", "재산세", "세금", "과태료", "공과금");
        // 지출이 아니라 자산 이동 — 화면 합계에서 제외한다.
        add(map, "금융/세금", "저축/투자",
                "적금", "예금", "펀드", "주식", "코인", "투자");

        // ── 기타/경조사 ──────────────────────────────────────────────────
        add(map, "기타/경조사", "경조사비",
                "장례", "상조회", "플라워", "축의금", "부의금", "결혼", "생일선물", "용돈");
        add(map, "기타/경조사", "기타", "jetbrains", "github", "기타");

        // ── 교육 ────────────────────────────────────────────────────────
        add(map, "교육", "학원/교육",
                "학원", "교육", "대교", "아카데미", "학교", "유치원", "codecademy");
        add(map, "교육", "학교/등록금", "등록금", "학비", "대학교");

        return map;
    }

    /** 업종 자체를 가리키는 키워드 — 같은 이름에 섞인 위치/건물 단어보다 우선한다. */
    private static final Set<String> HIGH_PRIORITY_KEYWORDS = Set.of(
            "커피", "카페", "식당", "베이커리", "치킨", "피자", "버거", "마라탕", "분식",
            "김밥", "떡볶이", "초밥", "스시", "파스타", "우동", "국밥", "돈까스", "돈카츠",
            "감자탕", "해장국", "순대국", "곰탕", "한정식", "통닭", "샤브샤브", "쭈꾸미",
            "포케", "양꼬치");

    private static void add(Map<String, Keyword> target, String category, String subCategory, String... keywords) {
        for (String keyword : keywords) {
            target.put(keyword, new Keyword(category, subCategory));
        }
    }

    private record Keyword(String category, String subCategory) {
    }
}
