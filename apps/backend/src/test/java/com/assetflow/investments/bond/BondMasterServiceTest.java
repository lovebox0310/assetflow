package com.assetflow.investments.bond;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * BOND-SEARCH-1 채권 마스터 파서·검색·캐시 실패 처리.
 * 107바이트 고정 레코드(CP949)를 바이트 오프셋으로 파싱하는 계약을 검증한다.
 */
class BondMasterServiceTest {

    private static final Charset CP949 = Charset.forName("MS949");
    private static final int RECORD_BYTES = 107;

    private static byte[] line(String type, String bondClass, String code, String name,
                               String issue, String maturity) {
        byte[] row = new byte[RECORD_BYTES];
        java.util.Arrays.fill(row, (byte) ' ');
        put(row, 0, 2, type);
        put(row, 2, 4, bondClass);
        put(row, 4, 16, code);
        put(row, 16, 56, name);
        put(row, 66, 74, issue);
        put(row, 74, 82, maturity);
        row[106] = (byte) 'Y';
        return row;
    }

    private static void put(byte[] row, int from, int to, String value) {
        byte[] bytes = value.getBytes(CP949);
        System.arraycopy(bytes, 0, row, from, Math.min(bytes.length, to - from));
    }

    private static byte[] zip(byte[]... rows) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("bond_code.mst"));
            for (byte[] row : rows) {
                zip.write(row);
                zip.write('\n');
            }
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    private static byte[] fixture() throws Exception {
        return zip(
                line("C0", "GA", "KR103502GEC4", "국고03000-3412(24-13)", "20241210", "20341210"),
                // 같은 표준코드가 F9/C0 두 줄로 온다 — 코드 기준 중복 제거.
                line("F9", "GA", "KR103502GEC4", "국고03000-3412(24-13)", "20241210", "20341210"),
                line("F9", "02", "KR101501DD62", "국민주택1종23-06", "20230630", "20280630"),
                // 잘못된 날짜 — 행은 유지하고 날짜만 null
                line("F9", "03", "KR0000000001", "잘못된날짜채권", "2024AB10", "20280630"),
                // 너무 짧은 레코드는 skip
                "short".getBytes(CP949)
        );
    }

    @Test
    void parsesFixedWidthRecordsWithByteOffsetsAndDeduplicatesByCode() throws Exception {
        BondMasterService service = new BondMasterService(() -> fixture());

        List<BondMasterService.BondItem> items = service.parseFetched(fixture());

        assertThat(items).hasSize(3);
        BondMasterService.BondItem treasury = items.stream()
                .filter(item -> "KR103502GEC4".equals(item.code())).findFirst().orElseThrow();
        assertThat(treasury.name()).isEqualTo("국고03000-3412(24-13)");
        assertThat(treasury.issueDate()).isEqualTo(LocalDate.parse("2024-12-10"));
        assertThat(treasury.maturityDate()).isEqualTo(LocalDate.parse("2034-12-10"));
        assertThat(treasury.bondType()).isEqualTo("C0");
        assertThat(treasury.bondClass()).isEqualTo("GA");

        BondMasterService.BondItem invalid = items.stream()
                .filter(item -> "KR0000000001".equals(item.code())).findFirst().orElseThrow();
        assertThat(invalid.issueDate()).isNull();
        assertThat(invalid.maturityDate()).isEqualTo(LocalDate.parse("2028-06-30"));

        assertThat(service.search("국민주택", 20).items().get(0).code()).isEqualTo("KR101501DD62");
    }

    @Test
    void searchMatchesNameWithSpacesAndCodePartials() throws Exception {
        BondMasterService service = new BondMasterService(() -> fixture());

        assertThat(service.search("국고03000", 20).items().get(0).code()).isEqualTo("KR103502GEC4");
        // 공백이 있어도 정규화 후 같은 결과
        assertThat(service.search("국고 03000", 20).items().get(0).code()).isEqualTo("KR103502GEC4");
        // 코드 부분일치
        assertThat(service.search("KR1035", 20).items().get(0).code()).isEqualTo("KR103502GEC4");
        // 빈 질의는 빈 목록
        assertThat(service.search("  ", 20).items()).isEmpty();
        // limit 준수 (국고/국민 등 3건 중 1건)
        assertThat(service.search("KR", 1).items()).hasSize(1);
    }

    @Test
    void fetchFailureWithoutSnapshotReturnsEmptyWithWarning() {
        BondMasterService service = new BondMasterService(() -> {
            throw new IllegalStateException("network down");
        });

        BondMasterService.BondSearchResult result = service.search("국고", 20);

        assertThat(result.items()).isEmpty();
        assertThat(result.warning()).contains("채권 마스터를 불러오지 못했습니다").contains("network down");
    }

    @Test
    void refreshFailureKeepsPreviousSnapshot() throws Exception {
        byte[] payload = fixture();
        AtomicReference<byte[]> source = new AtomicReference<>(payload);
        AtomicBoolean fail = new AtomicBoolean(false);
        BondMasterService service = new BondMasterService(() -> {
            if (fail.get()) throw new IllegalStateException("refresh failed");
            return source.get();
        }, Duration.ZERO);

        assertThat(service.search("국고", 20).items()).isNotEmpty();
        fail.set(true);
        BondMasterService.BondSearchResult stale = service.search("국고", 20);

        assertThat(stale.items()).isNotEmpty();
        assertThat(stale.items().get(0).code()).isEqualTo("KR103502GEC4");
        assertThat(stale.warning()).contains("이전 데이터를 사용합니다").contains("refresh failed");
    }
}
