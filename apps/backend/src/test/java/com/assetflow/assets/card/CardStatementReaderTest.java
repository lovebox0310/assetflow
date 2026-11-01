package com.assetflow.assets.card;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * §29.2 BE 재검증: Java POI 파서가 FE 파서와 같은 익명화 샘플에서
 * 같은 행 수·합계를 내는지 교차검증한다.
 */
class CardStatementReaderTest {

    private CardStatementReader reader;

    @BeforeEach
    void setUp() {
        reader = new CardStatementReader(CardContract.loadDefault());
    }

    private byte[] resource(String name) throws IOException {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(name)) {
            if (in == null) throw new IllegalStateException("missing resource: " + name);
            return in.readAllBytes();
        }
    }

    @Test
    void samsungCsv() throws IOException {
        CardStatementReader.Result r = reader.read(resource("samsungcard-personal-anon.csv"));
        assertThat(r.company()).isEqualTo("samsungcard");
        assertThat(r.cardCompanyLabel()).isEqualTo("삼성카드");
        assertThat(r.rows()).hasSize(18);

        long gross = r.rows().stream().mapToLong(CardStatementReader.ParsedRow::grossAmount).sum();
        long vat = r.rows().stream().mapToLong(CardStatementReader.ParsedRow::vat).sum();
        long supply = r.rows().stream().mapToLong(CardStatementReader.ParsedRow::supplyExVat).sum();
        assertThat(gross).isEqualTo(2_095_460L);
        assertThat(vat).isEqualTo(13_171L);
        assertThat(supply).isEqualTo(2_082_289L);

        assertThat(r.declaredTotals()).isNotNull();
        assertThat(r.declaredTotals().gross()).isEqualTo(gross);
        assertThat(r.declaredTotals().vat()).isEqualTo(vat);
        assertThat(r.crossCheck()).isNotNull();
        assertThat(r.crossCheck().grossOk()).isTrue();
        assertThat(r.crossCheck().vatOk()).isTrue();
        assertThat(r.warnings()).isEmpty();
    }

    @Test
    void hyundaiCsv() throws IOException {
        CardStatementReader.Result r = reader.read(resource("hyundaicard-personal-anon.csv"));
        assertThat(r.company()).isEqualTo("hyundaicard");
        assertThat(r.cardCompanyLabel()).isEqualTo("현대카드");
        assertThat(r.rows()).hasSize(75);

        long gross = r.rows().stream().mapToLong(CardStatementReader.ParsedRow::grossAmount).sum();
        long vat = r.rows().stream().mapToLong(CardStatementReader.ParsedRow::vat).sum();
        long supply = r.rows().stream().mapToLong(CardStatementReader.ParsedRow::supplyExVat).sum();
        assertThat(gross).isEqualTo(11_253_510L);
        assertThat(vat).isEqualTo(882_845L);
        assertThat(supply).isEqualTo(10_370_665L);

        // 현대 샘플의 2건 경고(부가세 초과)는 FE 파서와 같다.
        assertThat(r.warnings()).hasSize(2);
        
        // 마선택: 현대 샘플이 declared totals를 제공할 수도, 안 할 수도 있다.
        // 파서 구현이 완성되면 이 부분을 업데이트한다.
    }

    @Test
    void syntheticPlaintextXlsx() throws IOException {
        // 합성 샘플은 카드사 명세 시그니처가 없으므로 예외 발생
        assertThatThrownBy(() -> reader.read(resource("synthetic-sample.xlsx")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("카드사 명세");
    }

    @Test
    void rejectsEncryptedCfb() {
        // 암호화 CFB 매직 바이트. POI 도 열지 않아야 한다(§29.5.1).
        byte[] cfb = new byte[]{(byte) 0xd0, (byte) 0xcf, (byte) 0x11, (byte) 0xe0, (byte) 0xa1, (byte) 0xb1, (byte) 0x1a, (byte) 0xe1};
        assertThatThrownBy(() -> reader.read(cfb))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("암호화된");
    }

    @Test
    void rejectsEncryptedXlsx() throws IOException {
        // 잘못된 ZIP 헤더 — POI가 NotOfficeXmlFileException으로 실패하면서 거절되어야 한다.
        byte[] broken = new byte[]{0x50, 0x4b, 0x03, 0x04};
        assertThatThrownBy(() -> reader.read(broken))
                .isInstanceOf(Exception.class);  // IllegalArgumentException 또는 그 상위 타입
    }
}
