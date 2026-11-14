package com.assetflow.investments.bond;

import com.assetflow.auth.TokenService;
import com.assetflow.common.api.ApiExceptionHandler;
import com.assetflow.common.web.BearerTokenInterceptor;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** BOND-SEARCH-1 컨트롤러: 검색 결과가 JSON 으로 내려온다. */
class BondMasterControllerTest {

    private static final String SECRET = "test-secret-0123456789-0123456789-0123456789";
    private static final String TOKEN = "Bearer " + new TokenService(SECRET).issue("user@example.com");
    private static final Charset CP949 = Charset.forName("MS949");

    private static byte[] zipFixture() throws Exception {
        byte[] row = new byte[107];
        java.util.Arrays.fill(row, (byte) ' ');
        put(row, 0, 2, "C0");
        put(row, 2, 4, "GA");
        put(row, 4, 16, "KR103502GEC4");
        put(row, 16, 56, "국고03000-3412(24-13)");
        put(row, 66, 74, "20241210");
        put(row, 74, 82, "20341210");
        row[106] = (byte) 'Y';

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(out)) {
            zip.putNextEntry(new ZipEntry("bond_code.mst"));
            zip.write(row);
            zip.write('\n');
            zip.closeEntry();
        }
        return out.toByteArray();
    }

    private static void put(byte[] row, int from, int to, String value) {
        byte[] bytes = value.getBytes(CP949);
        System.arraycopy(bytes, 0, row, from, Math.min(bytes.length, to - from));
    }

    @Test
    void searchesBondMasterByName() throws Exception {
        BondMasterService service = new BondMasterService(BondMasterControllerTest::zipFixture);
        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new BondMasterController(service))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new BearerTokenInterceptor(new TokenService(SECRET)))
                .build();

        mvc.perform(get("/api/v1/investments/bonds?q=국고03000&limit=20")
                        .header("Authorization", TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].code").value("KR103502GEC4"))
                .andExpect(jsonPath("$.data.items[0].name").value("국고03000-3412(24-13)"))
                .andExpect(jsonPath("$.data.items[0].issueDate").value("2024-12-10"))
                .andExpect(jsonPath("$.data.items[0].maturityDate").value("2034-12-10"))
                .andExpect(jsonPath("$.data.warning").value(org.hamcrest.Matchers.nullValue()));
    }
}
