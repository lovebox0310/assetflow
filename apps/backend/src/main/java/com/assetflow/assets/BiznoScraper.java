package com.assetflow.assets;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * bizno.net 의 사업자 정보 페이지를 읽어 필드로 바꾼다.
 *
 * <p>페이지는 라벨/값 쌍(표 또는 dl)으로 구성된다. 라벨을 정규화(공백 제거)해 찾고
 * 같은 행/다음 요소의 값을 취한다. 마크업이 조금 달라져도 동작하도록
 * 1) tr 셀 쌍 → 2) 라벨과 같은 텍스트를 가진 leaf 요소의 다음 leaf 요소 → 3) 본문 텍스트 스캔
 * 순서로 시도한다.</p>
 *
 * <p>bizno.net 은 트래픽이 많으면 "접속대기" 안내 페이지만 돌려준다. 이 경우
 * {@link BiznoUnavailableException} 을 던져 화면이 재시도 안내를 보여주게 한다.</p>
 */
@Component
public class BiznoScraper {

    private static final Logger log = LoggerFactory.getLogger(BiznoScraper.class);

    static final String SOURCE = "bizno.net";
    private static final String ARTICLE_URL = "https://bizno.net/article/";
    private static final String USER_AGENT =
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    private static final int TIMEOUT_MS = 10_000;
    private static final int READER_TIMEOUT_MS = 30_000;

    /** 페이지에서 쓰는 라벨(공백 제거 정규화). */
    private static final Set<String> LABELS = Set.of(
            "업태", "종목", "주요제품", "전화번호", "팩스번호", "기업규모", "법인구분",
            "과세유형", "본사/지사", "법인형태", "등록일", "홈페이지", "IR홈페이지",
            "회사이메일", "대표자명", "사업자현재상태", "사업자등록번호", "법인등록번호",
            "종업원수", "우편번호", "회사주소", "관할세무서", "결산월", "상호", "회사명");

    /** 본문 텍스트 스캔용 — 라벨 사이에 공백이 들어가도 찾는다. */
    private static final Map<String, Pattern> TEXT_LABELS = new LinkedHashMap<>();

    static {
        TEXT_LABELS.put("업태", Pattern.compile("업\\s*태"));
        TEXT_LABELS.put("종목", Pattern.compile("종\\s*목"));
        TEXT_LABELS.put("주요제품", Pattern.compile("주\\s*요\\s*제\\s*품"));
        TEXT_LABELS.put("전화번호", Pattern.compile("전\\s*화\\s*번\\s*호"));
        TEXT_LABELS.put("팩스번호", Pattern.compile("팩\\s*스\\s*번\\s*호"));
        TEXT_LABELS.put("기업규모", Pattern.compile("기\\s*업\\s*규\\s*모"));
        TEXT_LABELS.put("법인구분", Pattern.compile("법\\s*인\\s*구\\s*분"));
        TEXT_LABELS.put("과세유형", Pattern.compile("과\\s*세\\s*유\\s*형"));
        TEXT_LABELS.put("본사/지사", Pattern.compile("본\\s*사\\s*/\\s*지\\s*사"));
        TEXT_LABELS.put("법인형태", Pattern.compile("법\\s*인\\s*형\\s*태"));
        TEXT_LABELS.put("등록일", Pattern.compile("등\\s*록\\s*일"));
        TEXT_LABELS.put("홈페이지", Pattern.compile("홈\\s*페\\s*이\\s*지"));
        TEXT_LABELS.put("IR홈페이지", Pattern.compile("IR\\s*홈\\s*페\\s*이\\s*지"));
        TEXT_LABELS.put("회사이메일", Pattern.compile("회\\s*사\\s*이\\s*메\\s*일"));
        TEXT_LABELS.put("대표자명", Pattern.compile("대\\s*표\\s*자\\s*명"));
        TEXT_LABELS.put("사업자현재상태", Pattern.compile("사\\s*업\\s*자\\s*현\\s*재\\s*상\\s*태"));
        TEXT_LABELS.put("사업자등록번호", Pattern.compile("사\\s*업\\s*자\\s*등\\s*록\\s*번\\s*호"));
        TEXT_LABELS.put("법인등록번호", Pattern.compile("법\\s*인\\s*등\\s*록\\s*번\\s*호"));
        TEXT_LABELS.put("종업원수", Pattern.compile("종\\s*업\\s*원\\s*수"));
        TEXT_LABELS.put("우편번호", Pattern.compile("우\\s*편\\s*번\\s*호"));
        TEXT_LABELS.put("회사주소", Pattern.compile("회\\s*사\\s*주\\s*소"));
        TEXT_LABELS.put("관할세무서", Pattern.compile("관\\s*할\\s*세\\s*무\\s*서"));
        TEXT_LABELS.put("결산월", Pattern.compile("결\\s*산\\s*월"));
    }

    private static final Pattern DIGITS = Pattern.compile("\\d+");
    private static final Pattern ISO_DATE = Pattern.compile("(\\d{4})[.-](\\d{1,2})[.-](\\d{1,2})");

    /**
     * bizno.net 이 접속대기로 막을 때 대신 읽어 주는 리더 서비스.
     * 비워 두면(<code>""</code>) 폴백을 쓰지 않는다. 읽기 전용 텍스트 중계라
     * 개인정보가 아닌 공개 사업자 정보만 오간다.
     */
    private final String fallbackReaderBase;

    public BiznoScraper(@Value("${app.business-info.fallback-reader:https://r.jina.ai/}") String fallbackReaderBase) {
        this.fallbackReaderBase = fallbackReaderBase == null ? "" : fallbackReaderBase.trim();
    }

    public BiznoScraper() {
        this("https://r.jina.ai/");
    }

    /** 실제 페이지를 가져와 파싱한다. */
    public MerchantBusinessInfo scrape(String businessNo) {
        String html = fetch(businessNo);
        MerchantBusinessInfo info = parse(businessNo, html);
        if (info.bizType() == null && info.bizItem() == null && info.companyName() == null) {
            throw new BiznoUnavailableException("bizno.net returned an unexpected page");
        }
        return info;
    }

    String fetch(String businessNo) {
        try {
            return fetchDirect(businessNo);
        } catch (BiznoUnavailableException direct) {
            if (fallbackReaderBase.isBlank()) {
                throw direct;
            }
            log.warn("bizno.net direct fetch failed for {} — trying reader fallback", businessNo, direct);
            return fetchViaReader(businessNo);
        }
    }

    private String fetchDirect(String businessNo) {
        try {
            Document doc = Jsoup.connect(ARTICLE_URL + businessNo)
                    .userAgent(USER_AGENT)
                    .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                    .header("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")
                    .header("Cache-Control", "no-cache")
                    .timeout(TIMEOUT_MS)
                    .followRedirects(true)
                    .get();
            if (isBusyPage(doc)) {
                throw new BiznoUnavailableException("bizno.net is busy (접속대기)");
            }
            return doc.outerHtml();
        } catch (BiznoUnavailableException e) {
            throw e;
        } catch (IOException e) {
            throw new BiznoUnavailableException("failed to fetch bizno.net", e);
        }
    }

    private String fetchViaReader(String businessNo) {
        String url = fallbackReaderBase + ARTICLE_URL + businessNo;
        try {
            Document doc = Jsoup.connect(url)
                    .userAgent(USER_AGENT)
                    .header("X-Respond-With", "html")
                    .header("Accept", "text/html,application/xhtml+xml")
                    .timeout(READER_TIMEOUT_MS)
                    .followRedirects(true)
                    .get();
            if (isBusyPage(doc)) {
                throw new BiznoUnavailableException("bizno.net is busy (접속대기)");
            }
            return doc.outerHtml();
        } catch (BiznoUnavailableException e) {
            throw e;
        } catch (IOException e) {
            throw new BiznoUnavailableException("failed to fetch bizno.net via reader", e);
        }
    }

    static boolean isBusyPage(Document doc) {
        String title = doc.title() == null ? "" : doc.title();
        if (title.contains("접속대기")) {
            return true;
        }
        if (doc.selectFirst(".connect_wait") != null) {
            return true;
        }
        String text = doc.text();
        return text.contains("현재 접속인원이 많아");
    }

    /** HTML → 사업자 정보. 테스트에서 직접 호출한다. */
    MerchantBusinessInfo parse(String businessNo, String html) {
        Document doc = Jsoup.parse(html == null ? "" : html);
        if (isBusyPage(doc)) {
            throw new BiznoUnavailableException("bizno.net is busy (접속대기)");
        }
        // 광고/스크립트는 값 추출에 방해된다.
        doc.select("script, style, noscript, iframe, ins, nav, header, footer").remove();

        Map<String, String> pairs = collectPairs(doc);
        fillFromWholeText(doc, pairs);

        String companyName = cleanCompanyName(first(pairs, "상호", "회사명"));
        if (companyName == null) {
            companyName = cleanCompanyName(doc.selectFirst("h1") == null ? null : doc.selectFirst("h1").text());
        }

        return new MerchantBusinessInfo(
                null,
                0L,
                businessNo,
                companyName,
                cleanText(first(pairs, "대표자명")),
                cleanText(first(pairs, "업태")),
                cleanText(first(pairs, "종목")),
                cleanText(first(pairs, "주요제품")),
                cleanText(first(pairs, "전화번호")),
                cleanText(first(pairs, "팩스번호")),
                cleanText(first(pairs, "기업규모")),
                cleanText(first(pairs, "법인구분")),
                cleanText(first(pairs, "과세유형")),
                cleanText(first(pairs, "본사/지사")),
                cleanText(first(pairs, "법인형태")),
                parseDate(first(pairs, "등록일")),
                cleanText(first(pairs, "홈페이지")),
                cleanText(first(pairs, "IR홈페이지")),
                cleanText(first(pairs, "회사이메일")),
                cleanBusinessStatus(first(pairs, "사업자현재상태")),
                cleanText(first(pairs, "법인등록번호")),
                parseInteger(first(pairs, "종업원수")),
                cleanText(first(pairs, "우편번호")),
                cleanAddress(first(pairs, "회사주소")),
                cleanTaxOffice(first(pairs, "관할세무서")),
                parseInteger(first(pairs, "결산월")),
                SOURCE,
                Instant.now());
    }

    // ------------------------------------------------------------------ 추출

    private Map<String, String> collectPairs(Document doc) {
        Map<String, String> pairs = new LinkedHashMap<>();
        // 1) 표의 라벨/값 셀
        for (Element tr : doc.select("tr")) {
            Elements cells = tr.children();
            if (cells.size() >= 2) {
                put(pairs, cells.get(0).text(), cells.get(1).text());
            }
        }
        // 2) 라벨 텍스트를 가진 leaf 요소의 다음 값 요소 (div/span/dl 구조 대응)
        //    표(tr) 안의 라벨은 위 1)에서 이미 처리했다 — 빈 셀이면 값도 없는 것으로 본다.
        for (Element el : doc.getAllElements()) {
            if (el.childrenSize() > 0) {
                continue;
            }
            if (isInsideTableRow(el)) {
                continue;
            }
            String label = normalize(el.text());
            if (!LABELS.contains(label) || pairs.containsKey(label)) {
                continue;
            }
            Element next = nextLeaf(el);
            if (next != null) {
                pairs.putIfAbsent(label, next.text());
            }
        }
        return pairs;
    }

    private void fillFromWholeText(Document doc, Map<String, String> pairs) {
        String text;
        try {
            text = doc.body() == null ? doc.text() : doc.body().wholeText();
        } catch (RuntimeException e) {
            text = doc.text();
        }
        for (Map.Entry<String, Pattern> entry : TEXT_LABELS.entrySet()) {
            if (pairs.containsKey(entry.getKey())) {
                continue;
            }
            Matcher m = entry.getValue().matcher(text);
            if (!m.find()) {
                continue;
            }
            int start = m.end();
            int limit = Math.min(text.length(), start + 300);
            int end = nextLabelIndex(text, start, limit);
            String value = text.substring(start, end).trim();
            if (!value.isBlank()) {
                pairs.putIfAbsent(entry.getKey(), value);
            }
        }
    }

    private static int nextLabelIndex(String text, int from, int limit) {
        int best = limit;
        for (Pattern p : TEXT_LABELS.values()) {
            Matcher m = p.matcher(text);
            m.region(from, limit);
            if (m.find() && m.start() < best) {
                best = m.start();
            }
        }
        return best;
    }

    private static void put(Map<String, String> pairs, String labelText, String valueText) {
        String label = normalize(labelText);
        String value = valueText == null ? "" : valueText.trim();
        if (label.isEmpty() || value.isEmpty() || !LABELS.contains(label)) {
            return;
        }
        pairs.putIfAbsent(label, value);
    }

    private static String first(Map<String, String> pairs, String... labels) {
        for (String label : labels) {
            String value = pairs.get(label);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static boolean isInsideTableRow(Element el) {
        Element cursor = el.parent();
        while (cursor != null) {
            if ("tr".equals(cursor.tagName())) {
                return true;
            }
            cursor = cursor.parent();
        }
        return false;
    }

    private static Element nextLeaf(Element el) {        Element cursor = el;
        while (cursor != null) {
            Element sibling = cursor.nextElementSibling();
            while (sibling != null) {
                Element leaf = firstLeaf(sibling);
                if (leaf != null) {
                    return leaf;
                }
                sibling = sibling.nextElementSibling();
            }
            cursor = cursor.parent();
        }
        return null;
    }

    private static Element firstLeaf(Element el) {
        if (el.childrenSize() == 0) {
            return el.text().isBlank() ? null : el;
        }
        for (Element child : el.children()) {
            Element leaf = firstLeaf(child);
            if (leaf != null) {
                return leaf;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------ 정리

    private static String normalize(String label) {
        if (label == null) {
            return "";
        }
        return label.replaceAll("[\\s\\u00A0\\u2007\\u202F]+", "").trim();
    }

    /** 값에서 안내문/각주를 제거하고 공백을 하나로 접는다. */
    private static String cleanText(String value) {
        if (value == null) {
            return null;
        }
        String cleaned = value
                .replace("가이드북 읽기", " ")
                .replace("가이드북", " ")
                .replaceAll("※[^\\n]*", " ")
                .replaceAll("[\\s\\u00A0]+", " ")
                .trim();
        return cleaned.isEmpty() ? null : cleaned;
    }

    private static String cleanCompanyName(String value) {
        String cleaned = cleanText(value);
        if (cleaned == null) {
            return null;
        }
        // h1 에 "홈 > ... > 회사명" 같은 경로가 섞이는 경우 마지막 조각을 쓴다.
        int idx = cleaned.lastIndexOf('>');
        if (idx >= 0 && idx + 1 < cleaned.length()) {
            cleaned = cleaned.substring(idx + 1).trim();
        }
        return cleaned.isEmpty() ? null : cleaned;
    }

    private static String cleanBusinessStatus(String value) {
        String cleaned = cleanText(value);
        if (cleaned == null) {
            return null;
        }
        int cut = cleaned.indexOf('(');
        if (cut > 0 && cleaned.startsWith("계속사업자")) {
            cleaned = cleaned.substring(0, cut).trim();
        }
        // "계속사업자" 뒤에 붙는 부가 문구 제거
        for (String tail : List.of("계속사업자", "휴업자", "폐업자")) {
            int idx = cleaned.indexOf(tail);
            if (idx >= 0) {
                return tail;
            }
        }
        return cleaned;
    }

    private static String cleanAddress(String value) {
        String cleaned = cleanText(value);
        if (cleaned == null) {
            return null;
        }
        // 영문 주소가 앞에 붙는 경우가 있다 — 한글 주소부터 쓴다.
        int hangul = firstHangulIndex(cleaned);
        if (hangul > 0) {
            cleaned = cleaned.substring(hangul).trim();
        }
        // "도로명주소 (동) 지번주소" 처럼 두 주소가 붙는 경우 도로명 주소만 남긴다.
        int close = cleaned.indexOf(')');
        if (close > 0 && close < cleaned.length() - 1) {
            return cleaned.substring(0, close + 1).trim();
        }
        // 괄호가 없으면 같은 시작 토큰이 반복되는 지점에서 자른다.
        String head = cleaned.substring(0, Math.min(cleaned.length(), 12)).trim();
        if (!head.isEmpty()) {
            int again = cleaned.indexOf(head, head.length());
            if (again > 0) {
                cleaned = cleaned.substring(0, again).trim();
            }
        }
        return cleaned.isEmpty() ? null : cleaned;
    }

    private static int firstHangulIndex(String value) {
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c >= '가' && c <= '힣') {
                return i;
            }
        }
        return -1;
    }

    private static String cleanTaxOffice(String value) {
        String cleaned = cleanText(value);
        if (cleaned == null) {
            return null;
        }
        int cut = cleaned.indexOf('(');
        if (cut > 0) {
            cleaned = cleaned.substring(0, cut).trim();
        }
        return cleaned.isEmpty() ? null : cleaned;
    }

    private static Integer parseInteger(String value) {
        String cleaned = cleanText(value);
        if (cleaned == null) {
            return null;
        }
        Matcher m = DIGITS.matcher(cleaned.replace(",", ""));
        if (!m.find()) {
            return null;
        }
        try {
            return Integer.valueOf(m.group());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDate parseDate(String value) {
        String cleaned = cleanText(value);
        if (cleaned == null) {
            return null;
        }
        Matcher m = ISO_DATE.matcher(cleaned);
        if (!m.find()) {
            return null;
        }
        try {
            return LocalDate.of(
                    Integer.parseInt(m.group(1)),
                    Integer.parseInt(m.group(2)),
                    Integer.parseInt(m.group(3)));
        } catch (RuntimeException e) {
            return null;
        }
    }
}
