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
 * 애플리케이션 부팅 시 기본 카테고리와 키워드 매핑을 시드한다 (§55.8).
 * 멱등하게 작성돼 여러 번 실행필도 중복을 만들지 않는다.
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
        Map<String, Boolean> categories = new LinkedHashMap<>();
        categories.put("식비", false);
        categories.put("교통비", false);
        categories.put("보험료", true);
        categories.put("경조사비", false);
        categories.put("주거비", true);
        categories.put("통신비", true);
        categories.put("쇼핑", false);
        categories.put("미용", false);
        categories.put("의류", false);
        categories.put("의료비", false);
        categories.put("여가/취미", false);
        categories.put("교육비", false);
        categories.put("기타", false);

        for (Map.Entry<String, Boolean> e : categories.entrySet()) {
            jdbc.update("""
                    INSERT INTO expense_categories (user_id, name, is_essential)
                    VALUES (NULL, ?, ?)
                    ON CONFLICT DO NOTHING
                    """, e.getKey(), e.getValue());
        }

        Map<String, String> keywordCategory = new LinkedHashMap<>();
        keywordCategory.put("GS25", "식비");
        keywordCategory.put("CU편의점", "식비");
        keywordCategory.put("이마트", "식비");
        keywordCategory.put("홈플러스", "식비");
        keywordCategory.put("마트", "식비");
        keywordCategory.put("식당", "식비");
        keywordCategory.put("베이커리", "식비");
        keywordCategory.put("카페", "식비");
        keywordCategory.put("스타벅스", "식비");
        keywordCategory.put("주유소", "교통비");
        keywordCategory.put("주유", "교통비");
        keywordCategory.put("톨게이트", "교통비");
        keywordCategory.put("지하철", "교통비");
        keywordCategory.put("택시", "교통비");
        keywordCategory.put("버스", "교통비");
        keywordCategory.put("KTX", "교통비");
        keywordCategory.put("보험", "보험료");
        keywordCategory.put("병원", "의료비");
        keywordCategory.put("약국", "의료비");
        keywordCategory.put("의원", "의료비");
        keywordCategory.put("치과", "의료비");
        keywordCategory.put("관리비", "주거비");
        keywordCategory.put("임대료", "주거비");
        keywordCategory.put("전기", "주거비");
        keywordCategory.put("가스", "주거비");
        keywordCategory.put("수도", "주거비");
        keywordCategory.put("학원", "교육비");
        keywordCategory.put("교육", "교육비");
        keywordCategory.put("서점", "교육비");
        keywordCategory.put("백화점", "쇼핑");
        keywordCategory.put("쇼핑", "쇼핑");
        keywordCategory.put("온라인몰", "쇼핑");
        keywordCategory.put("무신사", "쇼핑");
        keywordCategory.put("여행", "여가/취미");
        keywordCategory.put("숙소", "여가/취미");
        keywordCategory.put("영화", "여가/취미");
        keywordCategory.put("넷플릭스", "여가/취미");
        keywordCategory.put("유튜브프리미엄", "여가/취미");

        // 2026-10-25: 실제 카드 내역에서 자주 나온 가맹점 브랜드 보강.
        // 짧은 키워드는 다른 상호를 잘못 잡을 수 있으므로 브랜드/업종 단어만 넣는다.
        addKeywords(keywordCategory, "식비",
                "세븐일레븐", "씨유", "지에스", "노브랜드", "롯데프리미엄푸드마켓", "컬리",
                "프레시웨이", "우아한형제들", "배달의민족", "이디야", "뚜레쥬르",
                "파리바게뜨", "파리바게트", "롯데리아", "맘스터치", "배스킨라빈스", "김가네",
                "감자탕", "해장국", "순대국", "돈까스", "돈카츠", "마라탕", "우동", "곰탕",
                "치킨", "통닭", "한정식", "쭈꾸미", "포케", "버거", "샤브샤브", "국밥",
                "분식", "김밥", "떡볶이", "피자", "초밥", "스시", "파스타", "애슐리",
                "황태", "휴게소", "식품", "청과", "과일", "축산", "빵");
        addKeywords(keywordCategory, "교통비",
                "티머니", "도로공사", "고속도로", "하이패스", "주차", "파킹",
                "코레일네트웍스", "코레일", "컴인워시", "세차", "워시");
        addKeywords(keywordCategory, "주거비",
                "한국전력", "전력", "도시가스", "상수도", "자산관리");
        addKeywords(keywordCategory, "통신비",
                "유플러스", "lg유플러스", "#kt", "kt인터넷", "skt", "sk텔레콤", "휴대폰");
        addKeywords(keywordCategory, "의료비",
                "정형외과", "이비인후과", "내과", "피부과", "안과", "한의원", "한의", "요양");
        addKeywords(keywordCategory, "교육비",
                "대교", "아카데미", "종로서적", "학교", "유치원");
        addKeywords(keywordCategory, "여가/취미",
                "롯데시네마", "박물관", "리조트", "놀이동산", "당구", "노래방", "골프",
                "클럽하우스", "여기어때", "곤지암");
        addKeywords(keywordCategory, "쇼핑",
                "다이소", "쿠팡", "아트박스", "폴햄", "휠라", "이랜드", "데카트론",
                "안경", "홈쇼핑", "gs shop", "비치마켓", "에이블리", "오피스웨이", "레노마");
        addKeywords(keywordCategory, "기타", "주민세", "jetbrains");
        addKeywords(keywordCategory, "경조사비", "장례", "상조회");

        // 2차 보강 — 남은 미분류 상위 가맹점 기준 (2026-10-25)
        addKeywords(keywordCategory, "식비", "커피", "푸드", "양꼬치", "아이스꽁꽁");
        addKeywords(keywordCategory, "교통비", "현대자동차");
        addKeywords(keywordCategory, "보험료", "삼성화재", "현대해상", "db손해", "kb손해", "메리츠화재");
        addKeywords(keywordCategory, "의료비", "의료재단");
        addKeywords(keywordCategory, "교육비", "codecademy");
        addKeywords(keywordCategory, "여가/취미", "모나용평");
        addKeywords(keywordCategory, "쇼핑",
                "옥션", "g마켓", "ssg", "컴퓨존", "삼성전자", "스쿨룩스", "topten",
                "신성통상", "포레스트아웃팅스", "수선");
        addKeywords(keywordCategory, "경조사비", "플라워");
        addKeywords(keywordCategory, "기타", "github", "자동차세", "재산세");

        // 3차 — 미용·의류를 쇼핑에서 분리 (2026-10-25).
        // "피부"는 "피부과"(의료비)와 겹치므로 넣지 않는다 — 키워드가 길수록 우선이라 피부과가 이긴다.
        addKeywords(keywordCategory, "미용",
                "살롱", "미용", "헤어", "네일", "에스테틱", "왁싱", "속눈썹", "바버샵", "뷰티");
        // 위 쇼핑 목록에 있던 의류 브랜드는 여기서 의류로 덮어쓴다(뒤에 put 하는 쪽이 이긴다).
        addKeywords(keywordCategory, "의류",
                "의류", "패션", "무신사", "유니클로", "자라", "신발", "아울렛",
                "에이블리", "스쿨룩스", "폴햄", "휠라");

        // 4차 — 2026-10-26 미분류 작업함 상위 가맹점 기준.
        // PG/VAN 사업자명(나이스·토스페이먼츠·갤럭시아머니트리 등)은 실제 구매처가 아니므로 넣지 않는다.
        addKeywords(keywordCategory, "식비",
                "농협하나로", "본죽", "더벤티", "코이라멘", "솔솥", "카츠랩");
        addKeywords(keywordCategory, "여가/취미",
                "벌툰", "볼링", "방방", "피나클랜드", "사진관");
        addKeywords(keywordCategory, "쇼핑", "미니골드", "aliexpress");

        for (Map.Entry<String, String> e : keywordCategory.entrySet()) {
            // 업종을 직접 가리키는 키워드는 주소·건물명 키워드("병원", "버스")보다 먼저 매칭돼야 한다.
            // 예: "메가커피 ... 서울병원점" 은 병원이 아니라 커피집이다.
            int priority = HIGH_PRIORITY_KEYWORDS.contains(e.getKey()) ? 10 : 0;
            jdbc.update("""
                    INSERT INTO merchant_category_keywords (keyword, category_id, priority)
                    SELECT ?, c.id, ?
                    FROM expense_categories c
                    WHERE c.name = ? AND c.user_id IS NULL
                    ON CONFLICT (keyword) DO UPDATE SET category_id = EXCLUDED.category_id,
                                                        priority = EXCLUDED.priority,
                                                        updated_at = now()
                    """, e.getKey(), priority, e.getValue());
        }
    }

    /** 업종 자체를 가리키는 키워드 — 같은 이름에 섞인 위치/건물 단어보다 우선한다. */
    private static final Set<String> HIGH_PRIORITY_KEYWORDS = Set.of(
            "커피", "카페", "식당", "베이커리", "치킨", "피자", "버거", "마라탕", "분식",
            "김밥", "떡볶이", "초밥", "스시", "파스타", "우동", "국밥", "돈까스", "돈카츠",
            "감자탕", "해장국", "순대국", "곰탕", "한정식", "통닭", "샤브샤브", "쭈꾸미",
            "포케", "양꼬치");

    private static void addKeywords(Map<String, String> target, String category, String... keywords) {
        for (String keyword : keywords) {
            target.put(keyword, category);
        }
    }
}
