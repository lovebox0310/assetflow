package com.assetflow.investments.bond;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.Charset;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * 채권 마스터(종목정보파일) 검색 (BOND-SEARCH-1).
 *
 * <p>KIS Developers 에는 이름 검색 API 가 없지만, 공식 종목정보파일
 * {@code bond_code.mst.zip} 이 배포된다. 서버가 zip 을 받아 CP949 고정길이 레코드로
 * 파싱해 캐시하고 이름/코드 부분일치 검색을 제공한다.</p>
 *
 * <p><b>파서 주의:</b> 공식 샘플은 끝에서 자르는 방식이라 파일 끝 패딩에서 날짜가
 * 어긋난다. 여기서는 <b>바이트 오프셋</b>으로 자른다.</p>
 *
 * <p>캐시: 24시간 TTL. 만료 후 갱신 실패 시 직전 스냅샷을 유지하고 warning 을 돌려준다.
 * 스냅샷이 없고 실패하면 빈 목록 + warning — 예외로 500 을 내지 않는다.</p>
 */
@Component
public class BondMasterService {

    private static final Logger log = LoggerFactory.getLogger(BondMasterService.class);

    /** 테스트에서 zip 바이트를 주입하기 위한 다운로드 함수. */
    @FunctionalInterface
    public interface Fetcher {
        byte[] fetch() throws Exception;
    }

    public record BondItem(String code, String name,
                           @com.fasterxml.jackson.annotation.JsonFormat(
                                   shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING,
                                   pattern = "yyyy-MM-dd") LocalDate issueDate,
                           @com.fasterxml.jackson.annotation.JsonFormat(
                                   shape = com.fasterxml.jackson.annotation.JsonFormat.Shape.STRING,
                                   pattern = "yyyy-MM-dd") LocalDate maturityDate,
                           String bondType, String bondClass) {}

    public record BondSearchResult(List<BondItem> items, String warning) {}

    private record Snapshot(List<BondItem> items, Instant loadedAt) {}

    private static final Charset CP949 = Charset.forName("MS949");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("uuuuMMdd")
            .withResolverStyle(ResolverStyle.STRICT);
    private static final Duration DEFAULT_TTL = Duration.ofHours(24);
    private static final int RECORD_MIN_BYTES = 82;
    private static final int DEFAULT_LIMIT = 20;
    private static final int MAX_LIMIT = 50;

    private final Fetcher fetcher;
    private final Duration ttl;
    private volatile Snapshot snapshot;

    @Autowired
    public BondMasterService(
            @Value("${BOND_MASTER_URL:https://new.real.download.dws.co.kr/common/master/bond_code.mst.zip}")
            String url) {
        this(httpFetcher(url), DEFAULT_TTL);
    }

    BondMasterService(Fetcher fetcher) {
        this(fetcher, DEFAULT_TTL);
    }

    BondMasterService(Fetcher fetcher, Duration ttl) {
        this.fetcher = fetcher;
        this.ttl = ttl;
    }

    /**
     * 이름/코드 부분일치 검색.
     *
     * <p>정규화: 공백 제거 + 소문자. 이름 contains 또는 코드 contains.
     * 정렬: 코드 완전일치 → 이름 prefix → 그 외, 동률은 이름 오름차순.</p>
     */
    public BondSearchResult search(String query, int limit) {
        if (query == null || query.isBlank()) {
            return new BondSearchResult(List.of(), null);
        }
        Refresh refresh = ensureFresh();
        List<BondItem> items = refresh.snapshot() == null ? List.of() : refresh.snapshot().items();
        String warning = refresh.warning();

        String normalized = normalize(query);
        String codeQuery = normalized.toUpperCase(Locale.ROOT);
        int max = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);

        List<BondItem> matched = new ArrayList<>();
        for (BondItem item : items) {
            String name = normalize(item.name());
            String code = item.code() == null ? "" : item.code().toUpperCase(Locale.ROOT);
            if (name.contains(normalized) || code.contains(codeQuery)) {
                matched.add(item);
            }
        }
        matched.sort((a, b) -> {
            int rankA = rank(a, normalized, codeQuery);
            int rankB = rank(b, normalized, codeQuery);
            if (rankA != rankB) return Integer.compare(rankA, rankB);
            return a.name().compareTo(b.name());
        });
        if (matched.size() > max) {
            matched = matched.subList(0, max);
        }
        return new BondSearchResult(List.copyOf(matched), warning);
    }

    private static int rank(BondItem item, String normalizedName, String codeQuery) {
        String code = item.code() == null ? "" : item.code().toUpperCase(Locale.ROOT);
        if (code.equals(codeQuery)) return 0;
        if (normalize(item.name()).startsWith(normalizedName)) return 1;
        return 2;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    private record Refresh(Snapshot snapshot, String warning) {}

    /** 24시간 이내면 캐시, 만료면 갱신 시도. 실패해도 직전 스냅샷은 유지한다. */
    private synchronized Refresh ensureFresh() {
        Snapshot current = snapshot;
        if (current != null && current.loadedAt().plus(ttl).isAfter(Instant.now())) {
            return new Refresh(current, null);
        }
        try {
            List<BondItem> items = parseFetched(fetcher.fetch());
            snapshot = new Snapshot(items, Instant.now());
            return new Refresh(snapshot, null);
        } catch (Exception e) {
            String reason = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            String warning = current == null
                    ? "채권 마스터를 불러오지 못했습니다: " + reason
                    : "채권 마스터 갱신에 실패해 이전 데이터를 사용합니다: " + reason;
            log.warn("Bond master refresh failed: {}", reason);
            return new Refresh(current, warning);
        }
    }

    /** zip 에서 bond_code.mst 를 꺼내 파싱한다. */
    List<BondItem> parseFetched(byte[] zipBytes) throws Exception {
        byte[] master = unzipMaster(zipBytes);
        return parseMaster(master);
    }

    private static byte[] unzipMaster(byte[] zipBytes) throws Exception {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory() && entry.getName().endsWith("bond_code.mst")) {
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    zip.transferTo(out);
                    return out.toByteArray();
                }
            }
        }
        throw new IllegalStateException("bond_code.mst not found in zip");
    }

    /** CP949 107바이트 고정 레코드(개행 구분)를 바이트 오프셋으로 파싱한다. */
    List<BondItem> parseMaster(byte[] master) {
        Map<String, BondItem> byCode = new LinkedHashMap<>();
        int start = 0;
        for (int i = 0; i <= master.length; i++) {
            if (i < master.length && master[i] != '\n') continue;
            int end = i;
            if (end > start && master[end - 1] == '\r') end--;
            int length = end - start;
            if (length >= RECORD_MIN_BYTES) {
                BondItem item = parseLine(master, start, length);
                if (item != null && !byCode.containsKey(item.code())) {
                    byCode.put(item.code(), item);
                }
            }
            start = i + 1;
        }
        return new ArrayList<>(byCode.values());
    }

    private static BondItem parseLine(byte[] bytes, int offset, int length) {
        String type = field(bytes, offset, length, 0, 2);
        String bondClass = field(bytes, offset, length, 2, 4);
        String code = field(bytes, offset, length, 4, 16);
        String name = field(bytes, offset, length, 16, 56);
        if (code.isBlank() || name.isBlank()) return null;
        LocalDate issue = date(field(bytes, offset, length, 66, 74));
        LocalDate maturity = date(field(bytes, offset, length, 74, 82));
        return new BondItem(code, name, issue, maturity, type, bondClass);
    }

    private static String field(byte[] bytes, int offset, int length, int from, int to) {
        if (length < to) return "";
        return new String(bytes, offset + from, to - from, CP949).trim();
    }

    private static LocalDate date(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return LocalDate.parse(raw.trim(), DATE);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static Fetcher httpFetcher(String url) {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        return () -> {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(60))
                    .header("User-Agent", "Mozilla/5.0 (AssetFlow)")
                    .GET()
                    .build();
            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200 || response.body() == null) {
                throw new IllegalStateException("HTTP " + response.statusCode());
            }
            return response.body();
        };
    }
}
