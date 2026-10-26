package com.assetflow.assets;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * bizno.net 사업자 정보 페이지 파싱.
 * 마크업이 표(tr/td) 구조라고 가정한 픽스처와, 실제 값 정리 규칙을 함께 검증한다.
 */
class BiznoScraperTest {

    private final BiznoScraper scraper = new BiznoScraper();

    private static String page(String body) {
        return """
                <!DOCTYPE html>
                <html lang="ko"><head><title>(주)케이지이니시스 - 비즈노</title></head>
                <body>
                  <h1>(주)케이지이니시스</h1>
                  <table>
                %s
                  </table>
                </body></html>
                """.formatted(body);
    }

    @Test
    void parse_extractsEveryField() {
        String html = page("""
                    <tr><th>업 태</th><td>정보통신업</td></tr>
                    <tr><th>종 목</th><td>기타 정보 기술 및 컴퓨터 운영 관련 서비스업</td></tr>
                    <tr><th>주요제품</th><td></td></tr>
                    <tr><th>전화번호</th><td>02-1588-4954</td></tr>
                    <tr><th>팩스번호</th><td>02-3430-5998</td></tr>
                    <tr><th>기업규모</th><td>중견기업</td></tr>
                    <tr><th>법인구분</th><td>법인기업</td></tr>
                    <tr><th>과세유형</th><td>부가가치세 일반과세자</td></tr>
                    <tr><th>본사/지사</th><td>본사</td></tr>
                    <tr><th>법인형태</th><td>영리법인의 본점</td></tr>
                    <tr><th>등록일</th><td>1998-10-01</td></tr>
                    <tr><th>홈페이지</th><td>www.inicis.com</td></tr>
                    <tr><th>IR홈페이지</th><td></td></tr>
                    <tr><th>회사이메일</th><td>daehan@kggroup.co.kr</td></tr>
                    <tr><th>대표자명</th><td>이선재</td></tr>
                    <tr><th>사업자 현재 상태</th><td>계속사업자    ※국세청 홈택스 실시간 정보제공</td></tr>
                    <tr><th>사업자등록번호</th><td>220-81-55597</td></tr>
                    <tr><th>법인등록번호</th><td>110111-1602667</td></tr>
                    <tr><th>종업원수</th><td>242명</td></tr>
                    <tr><th>우편번호</th><td>04517</td></tr>
                    <tr><th>회사주소</th><td>서울특별시 중구 통일로 92, 14-15층(순화동, 케이지타워)<br>가이드북 읽기<br><br>서울 중구 순화동 1-170</td></tr>
                    <tr><th>관할세무서</th><td>남대문세무서 (전화번호 : 02-2260-0200)</td></tr>
                    <tr><th>결산월</th><td>12월</td></tr>
                """);

        MerchantBusinessInfo info = scraper.parse("2208155597", html);

        assertThat(info.businessNo()).isEqualTo("2208155597");
        assertThat(info.companyName()).isEqualTo("(주)케이지이니시스");
        assertThat(info.ceoName()).isEqualTo("이선재");
        assertThat(info.bizType()).isEqualTo("정보통신업");
        assertThat(info.bizItem()).isEqualTo("기타 정보 기술 및 컴퓨터 운영 관련 서비스업");
        assertThat(info.mainProduct()).isNull();
        assertThat(info.phone()).isEqualTo("02-1588-4954");
        assertThat(info.fax()).isEqualTo("02-3430-5998");
        assertThat(info.companySize()).isEqualTo("중견기업");
        assertThat(info.corporateType()).isEqualTo("법인기업");
        assertThat(info.taxType()).isEqualTo("부가가치세 일반과세자");
        assertThat(info.headquarters()).isEqualTo("본사");
        assertThat(info.corporateForm()).isEqualTo("영리법인의 본점");
        assertThat(info.registeredAt()).isEqualTo(LocalDate.of(1998, 10, 1));
        assertThat(info.homepage()).isEqualTo("www.inicis.com");
        assertThat(info.irHomepage()).isNull();
        assertThat(info.email()).isEqualTo("daehan@kggroup.co.kr");
        assertThat(info.businessStatus()).isEqualTo("계속사업자");
        assertThat(info.corporateRegNo()).isEqualTo("110111-1602667");
        assertThat(info.employees()).isEqualTo(242);
        assertThat(info.zipCode()).isEqualTo("04517");
        assertThat(info.address()).isEqualTo("서울특별시 중구 통일로 92, 14-15층(순화동, 케이지타워)");
        assertThat(info.taxOffice()).isEqualTo("남대문세무서");
        assertThat(info.fiscalMonth()).isEqualTo(12);
        assertThat(info.source()).isEqualTo(BiznoScraper.SOURCE);
        assertThat(info.fetchedAt()).isNotNull();
    }

    @Test
    void parse_handlesDefinitionListMarkup() {
        String html = """
                <!DOCTYPE html><html><head><title>사업자 정보</title></head><body>
                  <dl>
                    <dt>업 태</dt><dd>도매 및 소매업</dd>
                    <dt>종 목</dt><dd>통신판매업</dd>
                    <dt>대표자명</dt><dd>홍길동</dd>
                    <dt>사업자 현재 상태</dt><dd>계속사업자</dd>
                  </dl>
                </body></html>
                """;

        MerchantBusinessInfo info = scraper.parse("1234567890", html);

        assertThat(info.bizType()).isEqualTo("도매 및 소매업");
        assertThat(info.bizItem()).isEqualTo("통신판매업");
        assertThat(info.ceoName()).isEqualTo("홍길동");
        assertThat(info.businessStatus()).isEqualTo("계속사업자");
    }

    @Test
    void parse_fallsBackToBodyTextWhenMarkupIsFlat() {
        String html = """
                <!DOCTYPE html><html><head><title>사업자 정보</title></head><body>
                  <div>업 태 정보통신업</div>
                  <div>종 목 기타 정보 기술 및 컴퓨터 운영 관련 서비스업</div>
                  <div>대표자명 이선재</div>
                  <div>사업자등록번호 220-81-55597</div>
                </body></html>
                """;

        MerchantBusinessInfo info = scraper.parse("2208155597", html);

        assertThat(info.bizType()).isEqualTo("정보통신업");
        assertThat(info.ceoName()).isEqualTo("이선재");
    }

    @Test
    void parse_handlesInlineSpanMarkup() {
        // 실제 페이지에 가까운 형태: 라벨 span + 값 span 이 형제로 붙는다.
        String html = """
                <!DOCTYPE html><html><head><title>사업자 정보</title></head><body>
                  <ul class="biz-info">
                    <li><span class="tit">업 태</span><span class="txt">정보통신업</span></li>
                    <li><span class="tit">종 목</span><span class="txt">기타 정보 기술 및 컴퓨터 운영 관련 서비스업</span></li>
                    <li><span class="tit">대표자명</span><span class="txt">이선재</span></li>
                    <li><span class="tit">회사주소</span><span class="txt">서울특별시 중구 통일로 92, 14-15층(순화동, 케이지타워)</span></li>
                  </ul>
                </body></html>
                """;

        MerchantBusinessInfo info = scraper.parse("2208155597", html);

        assertThat(info.bizType()).isEqualTo("정보통신업");
        assertThat(info.bizItem()).isEqualTo("기타 정보 기술 및 컴퓨터 운영 관련 서비스업");
        assertThat(info.ceoName()).isEqualTo("이선재");
        assertThat(info.address()).isEqualTo("서울특별시 중구 통일로 92, 14-15층(순화동, 케이지타워)");
    }

    @Test
    void parse_keepsOnlyTheKoreanRoadAddress() {
        String html = """
                <!DOCTYPE html><html><head><title>사업자 정보</title></head><body>
                  <table>
                    <tr><th>회사주소</th><td>67, Sejong-daero, Jung-gu, Seoul, Republic of Korea 서울특별시 중구 세종대로 67(태평로2가)</td></tr>
                  </table>
                </body></html>
                """;
        assertThat(scraper.parse("1234567890", html).address())
                .isEqualTo("서울특별시 중구 세종대로 67(태평로2가)");

        String noParen = """
                <!DOCTYPE html><html><head><title>사업자 정보</title></head><body>
                  <table>
                    <tr><th>회사주소</th><td>39-15, Gyeongchung-daero 2092beon-gil, Bubal-eup, Icheon-si, Gyeonggi-do, Republic of Korea 경기도 이천시 부발읍 경충대로2092번길 39-15 1층 경기도 이천시 부발읍 아미리 665-7</td></tr>
                  </table>
                </body></html>
                """;
        assertThat(scraper.parse("1234567890", noParen).address())
                .isEqualTo("경기도 이천시 부발읍 경충대로2092번길 39-15 1층");
    }

    @Test
    void parse_rejectsBusyPage() {        String html = """
                <!DOCTYPE html><html><head><title>접속대기_no1</title></head><body>
                  <div class="connect_wait"><h2>현재 접속인원이 많아 접속이 지연되고 있습니다.</h2></div>
                </body></html>
                """;

        assertThatThrownBy(() -> scraper.parse("2208155597", html))
                .isInstanceOf(BiznoUnavailableException.class);
    }
}
