package com.assetflow.common.db;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * §CARD-FIX 회귀 방지: {@code db/schema.sql} 이 {@code spring.sql.init} 의 스크립트 분할에
 * 안전한지 검사한다.
 *
 * <p>기동 시 {@code spring.sql.init} 은 스크립트를 <b>세미콜론 기준으로 쪼개서</b> 한 문장씩
 * 실행한다. 문장 안에 있는 세미콜론을 문자열 리터럴 밖에서 인식하므로,
 * {@code DO $$ ... END $$;} 같은 달러 인용 블록은 {@code DO $$} / {@code END $$} 두 조각으로
 * 쪼개져 문법 오류가 난다. 그리고 {@code application-postgres.yml} 의
 * {@code continue-on-error: true} 때문에 그 실패는 조용히 넘어간다.</p>
 *
 * <p>실제로 그렇게 {@code card_imports.source} 컬럼이 운영 DB 에 만들어지지 않아
 * 카드내역 조회가 {@code column "source" does not exist} 로 전부 실패했다.
 * 이 테스트는 같은 형태가 다시 들어오면 실패한다.</p>
 */
class SchemaSqlSplitSafetyTest {

    /** spring.sql.init 이 실행하는 DDL 단일 출처(build.gradle 이 db/ 를 리소스로 서빙). */
    private static final String SCHEMA_SQL = "schema.sql";

    private static final List<String> SOURCE_COLUMN_STATEMENTS = List.of(
            "ALTER TABLE card_imports ADD COLUMN IF NOT EXISTS source VARCHAR(16)",
            "UPDATE card_imports SET source = 'unknown' WHERE source IS NULL",
            "ALTER TABLE card_imports ALTER COLUMN source SET DEFAULT 'csv'",
            "ALTER TABLE card_imports ALTER COLUMN source SET NOT NULL");

    @Test
    void 스키마에_달러_인용이_없다() throws IOException {
        String sql = readSchemaSql();

        // 비어 있는 리소스를 읽어 통과하는 헛 테스트를 막는다.
        assertThat(sql).as("schema.sql 을 classpath 에서 읽었다").contains("CREATE TABLE card_imports");

        assertThat(sql)
                .as("spring.sql.init 은 세미콜론으로 스크립트를 쪼개므로 달러 인용 블록을 지원하지 않는다")
                .doesNotContain("$$");
    }

    @Test
    void source_컬럼은_네개의_개별_문장으로_적용된다() throws IOException {
        List<String> statements = statements(readSchemaSql());

        for (String expected : SOURCE_COLUMN_STATEMENTS) {
            assertThat(statements)
                    .as("세미콜론으로 끝나는 별도 문장이어야 한다: %s", expected)
                    .contains(expected);
        }

        // 순서도 의미가 있다: 기존 행 백필(unknown)이 기본값(csv) 설정보다 먼저 와야 하고,
        // DEFAULT·NOT NULL 은 백필 뒤에 와야 NULL 이 남지 않는다.
        assertThat(indexOf(statements, SOURCE_COLUMN_STATEMENTS.get(0)))
                .isLessThan(indexOf(statements, SOURCE_COLUMN_STATEMENTS.get(1)));
        assertThat(indexOf(statements, SOURCE_COLUMN_STATEMENTS.get(1)))
                .isLessThan(indexOf(statements, SOURCE_COLUMN_STATEMENTS.get(2)));
        assertThat(indexOf(statements, SOURCE_COLUMN_STATEMENTS.get(2)))
                .isLessThan(indexOf(statements, SOURCE_COLUMN_STATEMENTS.get(3)));
    }

    @Test
    void 중복_정리_DELETE_문은_남아있다() throws IOException {
        List<String> statements = statements(readSchemaSql());

        // 1회성 중복 정리(schema.sql 의 CARD-MERGE-1 블록)는 이번 수정에서 없애지 않았다.
        // WITH legacy AS (...) DELETE ... 형태라 문장은 WITH 로 시작한다.
        assertThat(statements)
                .as("card_imports 중복 정리 DELETE 는 남아 있어야 한다")
                .anySatisfy(statement -> assertThat(statement)
                        .contains("DELETE FROM card_imports target")
                        .contains("candidate.source = 'unknown'"));
    }

    private static String readSchemaSql() throws IOException {
        ClassPathResource resource = new ClassPathResource(SCHEMA_SQL);
        assertThat(resource.exists()).as("%s 가 classpath 에 있다", SCHEMA_SQL).isTrue();
        try (var in = resource.getInputStream()) {
            return StreamUtils.copyToString(in, StandardCharsets.UTF_8);
        }
    }

    /**
     * spring.sql.init 과 같은 규칙으로 문장을 나눈다: {@code --} 줄 주석을 지우고
     * 세미콜론으로 쪼갠 뒤, 공백을 한 칸으로 접는다.
     */
    private static List<String> statements(String sql) {
        List<String> withoutComments = new ArrayList<>();
        for (String line : sql.split("\n")) {
            int comment = line.indexOf("--");
            withoutComments.add(comment >= 0 ? line.substring(0, comment) : line);
        }
        List<String> result = new ArrayList<>();
        for (String chunk : String.join("\n", withoutComments).split(";")) {
            String normalized = chunk.replaceAll("\\s+", " ").trim();
            if (!normalized.isEmpty()) {
                result.add(normalized);
            }
        }
        return result;
    }

    private static int indexOf(List<String> statements, String statement) {
        int index = statements.indexOf(statement);
        // 문장이 없으면 -1 이 되어 순서 단언이 조용히 통과한다 — 실패로 만든다.
        assertThat(index).as("문장이 있어야 순서를 검사할 수 있다: %s", statement).isNotNegative();
        return index;
    }
}
