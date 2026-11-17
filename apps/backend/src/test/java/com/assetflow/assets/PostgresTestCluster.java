package com.assetflow.assets;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

import javax.sql.DataSource;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

/**
 * 이 머신에 설치된 PostgreSQL 바이너리로 <b>임시 클러스터</b>를 띄우는 테스트 하네스.
 *
 * <p>Docker 데몬이 없어 Testcontainers 를 쓸 수 없으므로, {@code initdb} + {@code pg_ctl}
 * 만으로 일회용 클러스터를 만든다. 테스트가 끝나면 서버를 멈추고 데이터 디렉터리를 지운다
 * (§AC3 — 남은 프로세스·디렉터리 없음).</p>
 *
 * <p>바이너리 탐색 순서: {@code PG_BIN} 환경변수 → {@code /usr/lib/postgresql/<버전>/bin}
 * 글롭(높은 버전 우선). 못 찾으면 {@link #findBinDir()} 이 비어 있고, 호출한 테스트가
 * {@code Assumptions.assumeTrue} 로 <b>skip</b> 한다 — CI/로컬 어디서든 실패시키지 않는다.</p>
 *
 * <p>포트는 {@link ServerSocket#ServerSocket(int) ServerSocket(0)} 으로 빈 포트를 고른 뒤
 * 닫고 쓴다. 클러스터는 localhost 에만 열리고 {@code --auth=trust} 라 비밀번호가 없다.
 * 테스트 전용·단명 클러스터라는 전제이며, 실제 데이터는 담지 않는다.</p>
 */
public final class PostgresTestCluster implements AutoCloseable {

    /** PostgreSQL bin 디렉터리를 직접 지정하는 환경변수. */
    private static final String PG_BIN_ENV = "PG_BIN";
    private static final Path DEFAULT_BIN_ROOT = Path.of("/usr/lib/postgresql");
    private static final long PROCESS_TIMEOUT_SECONDS = 120;

    private final Path binDir;
    private final Path baseDir;
    private final Path dataDir;
    private final int port;
    private final HikariDataSource dataSource;

    private PostgresTestCluster(Path binDir, Path baseDir, Path dataDir, int port,
                                HikariDataSource dataSource) {
        this.binDir = binDir;
        this.baseDir = baseDir;
        this.dataDir = dataDir;
        this.port = port;
        this.dataSource = dataSource;
    }

    /**
     * 사용 가능한 PostgreSQL bin 디렉터리. 없으면 {@link Optional#empty()}.
     * {@code PG_BIN} 이 지정됐는데 쓸 수 없으면 다른 버전으로 몰래 넘어가지 않고 비운다.
     */
    public static Optional<Path> findBinDir() {
        String configured = System.getenv(PG_BIN_ENV);
        if (configured != null && !configured.isBlank()) {
            Path candidate = Path.of(configured.trim());
            if (isUsable(candidate)) {
                return Optional.of(candidate);
            }
            System.err.println("[PostgresTestCluster] " + PG_BIN_ENV + " 이 유효하지 않습니다: " + candidate);
            return Optional.empty();
        }
        if (!Files.isDirectory(DEFAULT_BIN_ROOT)) {
            return Optional.empty();
        }
        try (Stream<Path> versions = Files.list(DEFAULT_BIN_ROOT)) {
            return versions
                    .filter(path -> Files.isDirectory(path.resolve("bin")))
                    .sorted(Comparator.comparingInt(
                            (Path path) -> versionKey(path.getFileName().toString())).reversed())
                    .map(path -> path.resolve("bin"))
                    .filter(PostgresTestCluster::isUsable)
                    .findFirst();
        } catch (IOException e) {
            return Optional.empty();
        }
    }

    private static boolean isUsable(Path binDir) {
        return binDir != null
                && Files.isExecutable(binDir.resolve("initdb"))
                && Files.isExecutable(binDir.resolve("pg_ctl"));
    }

    /** {@code 18} → 18, {@code 9.6} → 96 처럼 숫자만 모아 버전 정렬에 쓴다. */
    private static int versionKey(String name) {
        String digits = name.replaceAll("\\D", "");
        if (digits.isEmpty()) {
            return -1;
        }
        try {
            return Integer.parseInt(digits);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /**
     * 임시 클러스터를 기동한다. 실패하면 만든 것(프로세스·디렉터리)을 정리하고 예외를 던진다
     * — 조용히 skip 하지 않는다. 바이너리가 있는데 기동이 안 되는 것은 실제 결함이다.
     */
    public static PostgresTestCluster start(Path binDir) {
        if (!isUsable(binDir)) {
            throw new IllegalArgumentException("사용할 수 없는 PostgreSQL bin 디렉터리: " + binDir);
        }
        Path baseDir;
        try {
            baseDir = Files.createTempDirectory("assetflow-pg-");
        } catch (IOException e) {
            throw new UncheckedIOException("임시 디렉터리를 만들지 못했습니다", e);
        }

        Path dataDir = baseDir.resolve("data");
        HikariDataSource dataSource = null;
        boolean serverStarted = false;
        try {
            int port = freePort();
            run(binDir.resolve("initdb"), baseDir, "initdb.log", List.of(
                    "-D", dataDir.toString(),
                    "-U", "postgres",
                    "--auth=trust",
                    // 로케일이 C/POSIX 인 CI 에서도 한글 값이 깨지지 않게 인코딩을 고정한다.
                    "--encoding=UTF8"));
            run(binDir.resolve("pg_ctl"), baseDir, "pgctl.log", List.of(
                    "-D", dataDir.toString(),
                    "-l", baseDir.resolve("server.log").toString(),
                    "-o", "-p " + port + " -k " + baseDir,
                    "-w", "start"));
            serverStarted = true;

            dataSource = new HikariDataSource(hikariConfig(port));
            PostgresTestCluster cluster = new PostgresTestCluster(binDir, baseDir, dataDir, port, dataSource);
            cluster.awaitReady();
            return cluster;
        } catch (RuntimeException e) {
            String logs = baseDir + " 로그: " + readIfPresent(baseDir.resolve("initdb.log"))
                    + readIfPresent(baseDir.resolve("server.log"));
            if (dataSource != null) {
                dataSource.close();
            }
            if (serverStarted) {
                stopQuietly(binDir, baseDir, dataDir);
            }
            deleteRecursively(baseDir);
            throw new IllegalStateException("임시 PostgreSQL 클러스터 기동 실패 — " + logs, e);
        }
    }

    private static HikariConfig hikariConfig(int port) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:postgresql://127.0.0.1:" + port + "/postgres");
        config.setUsername("postgres");
        config.setPassword("");
        config.setDriverClassName("org.postgresql.Driver");
        config.setPoolName("assetflow-pg-test");
        config.setMaximumPoolSize(4);
        config.setMinimumIdle(0);
        config.setConnectionTimeout(10_000);
        config.setInitializationFailTimeout(10_000);
        return config;
    }

    private static int freePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            socket.setReuseAddress(true);
            return socket.getLocalPort();
        } catch (IOException e) {
            throw new UncheckedIOException("빈 포트를 찾지 못했습니다", e);
        }
    }

    private void awaitReady() {
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            statement.execute("SELECT 1");
        } catch (SQLException e) {
            throw new IllegalStateException("임시 클러스터 JDBC 연결 실패: " + jdbcUrl(), e);
        }
    }

    public DataSource dataSource() {
        return dataSource;
    }

    public int port() {
        return port;
    }

    public Path dataDir() {
        return dataDir;
    }

    public String jdbcUrl() {
        return "jdbc:postgresql://127.0.0.1:" + port + "/postgres";
    }

    /**
     * {@code db/schema.sql} 을 실제 DB 에 적용한다. spring.sql.init 과 같은 규칙으로
     * {@code --} 줄 주석을 지우고 세미콜론으로 나눠 한 문장씩 실행한다
     * ({@code SchemaSqlSplitSafetyTest} 가 지키는 계약과 동일).
     */
    public void applySchema(Path schemaFile) {
        if (!Files.isRegularFile(schemaFile)) {
            throw new IllegalArgumentException("schema.sql 을 찾지 못했습니다: " + schemaFile.toAbsolutePath());
        }
        List<String> statements = readStatements(schemaFile);
        try (Connection connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {
            connection.setAutoCommit(true);
            for (String sql : statements) {
                try {
                    statement.execute(sql);
                } catch (SQLException e) {
                    throw new IllegalStateException("schema.sql 문장 실행 실패: ["
                            + (sql.length() > 120 ? sql.substring(0, 120) + "…" : sql) + "]", e);
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("schema.sql 적용 실패: " + schemaFile, e);
        }
    }

    private static List<String> readStatements(Path schemaFile) {
        String sql;
        try {
            sql = Files.readString(schemaFile, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(schemaFile.toString(), e);
        }
        List<String> withoutComments = new ArrayList<>();
        for (String line : sql.split("\n")) {
            int comment = line.indexOf("--");
            withoutComments.add(comment >= 0 ? line.substring(0, comment) : line);
        }
        List<String> statements = new ArrayList<>();
        for (String chunk : String.join("\n", withoutComments).split(";")) {
            String normalized = chunk.replaceAll("\\s+", " ").trim();
            if (!normalized.isEmpty()) {
                statements.add(normalized);
            }
        }
        return statements;
    }

    /** 서버를 멈추고 데이터 디렉터리를 지운다. 남기면 예외로 알린다(AC3). */
    @Override
    public void close() {
        dataSource.close();
        boolean stopped = stopQuietly(binDir, baseDir, dataDir);
        deleteRecursively(baseDir);
        boolean deleted = !Files.exists(baseDir);
        System.out.println("[PostgresTestCluster] stopped=" + stopped
                + " port=" + port
                + " deleted=" + deleted
                + " dir=" + baseDir);
        if (!stopped || !deleted) {
            throw new IllegalStateException("임시 PostgreSQL 정리가 끝나지 않았습니다 — stopped="
                    + stopped + ", deleted=" + deleted + ", dir=" + baseDir);
        }
    }

    private static boolean stopQuietly(Path binDir, Path baseDir, Path dataDir) {
        try {
            run(binDir.resolve("pg_ctl"), baseDir, "pgctl.log", List.of(
                    "-D", dataDir.toString(), "-m", "fast", "-w", "stop"));
            return true;
        } catch (RuntimeException e) {
            System.err.println("[PostgresTestCluster] pg_ctl stop 실패: " + e.getMessage());
            return false;
        }
    }

    private static void deleteRecursively(Path root) {
        if (root == null || !Files.exists(root)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(root)) {
            List<Path> ordered = new ArrayList<>(paths.toList());
            ordered.sort(Comparator.reverseOrder());
            for (Path path : ordered) {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            System.err.println("[PostgresTestCluster] 디렉터리 삭제 실패: " + root + " — " + e.getMessage());
        }
    }

    /** 외부 프로세스를 실행하고, 출력은 로그 파일로 남긴다(파이프 교착 없음). */
    private static String run(Path executable, Path workDir, String logName, List<String> args) {
        List<String> command = new ArrayList<>();
        command.add(executable.toString());
        command.addAll(args);
        Path log = workDir.resolve(logName);
        Process process;
        try {
            process = new ProcessBuilder(command)
                    .directory(workDir.toFile())
                    .redirectErrorStream(true)
                    .redirectOutput(ProcessBuilder.Redirect.appendTo(log.toFile()))
                    .start();
        } catch (IOException e) {
            throw new UncheckedIOException("실행 실패: " + command, e);
        }
        try {
            if (!process.waitFor(PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new IllegalStateException("시간 초과(" + PROCESS_TIMEOUT_SECONDS + "s): " + command
                        + " 로그: " + readIfPresent(log));
            }
        } catch (InterruptedException e) {
            process.destroyForcibly();
            Thread.currentThread().interrupt();
            throw new IllegalStateException("중단됨: " + command, e);
        }
        if (process.exitValue() != 0) {
            throw new IllegalStateException("종료 코드 " + process.exitValue() + ": " + command
                    + " 로그: " + readIfPresent(log));
        }
        return readIfPresent(log);
    }

    private static String readIfPresent(Path file) {
        try {
            return Files.exists(file) ? Files.readString(file, StandardCharsets.UTF_8) : "";
        } catch (IOException e) {
            return "(로그를 읽지 못했습니다: " + e.getMessage() + ")";
        }
    }
}
