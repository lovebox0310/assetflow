package com.assetflow.assets.card.email;

import org.slf4j.Logger;
import org.springframework.core.io.ClassPathResource;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.stream.Collectors;

/**
 * VestMail Node 추출기 실행에 공통으로 쓰는 작업 디렉터리 준비 (§63, §68).
 *
 * <p>운영에서는 {@code scriptDir} 로 설치된 스크립트를 그대로 쓰고, 없으면 classpath
 * 리소스를 임시 디렉터리에 풀어 {@code npm install} 한다. 두 추출기(현대/삼성)가
 * 같은 절차를 쓰므로 여기 한 벌로 둔다.</p>
 */
final class VestMailScriptSupport {

    /**
     * 준비된 스크립트 작업 디렉터리와 컬럼 계약 파일 경로.
     *
     * <p>계약 파일과 classpath 폴 백으로 만든 임시 디렉터리는 매 수집마다 생기므로
     * {@link #close()} 로 정리한다. 스케줄러가 하루 두 번 도는 만큼 누르면 안 된다.</p>
     */
    static final class Prepared implements AutoCloseable {
        private final Path dir;
        private final Path contract;
        private final Path tempScriptDir;
        private final Logger log;

        private Prepared(Path dir, Path contract, Path tempScriptDir, Logger log) {
            this.dir = dir;
            this.contract = contract;
            this.tempScriptDir = tempScriptDir;
            this.log = log;
        }

        Path dir() {
            return dir;
        }

        Path contract() {
            return contract;
        }

        @Override
        public void close() {
            try {
                Files.deleteIfExists(contract);
            } catch (Exception e) {
                log.warn("Failed to delete temp contract {}", contract, e);
            }
            if (tempScriptDir != null) {
                deleteRecursively(tempScriptDir, log);
            }
        }
    }

    private static final String CONTRACT_RESOURCE = "card/card-columns.json";

    private VestMailScriptSupport() {
    }

    static Prepared prepare(String scriptDir, String scriptName, String classpathDir,
                            String[] resourceNames, Logger log) throws Exception {
        Path dir = null;
        if (scriptDir != null && !scriptDir.isBlank()) {
            Path external = Path.of(scriptDir);
            if (Files.exists(external.resolve(scriptName))) {
                dir = external;
            } else {
                log.warn("Configured script-dir does not contain {}: {}", scriptName, scriptDir);
            }
        }

        Path tempScriptDir = null;
        if (dir == null) {
            tempScriptDir = Files.createTempDirectory("af-vestmail-script-");
            for (String name : resourceNames) {
                ClassPathResource resource = new ClassPathResource(classpathDir + "/" + name);
                if (!resource.exists()) {
                    throw new IllegalStateException("Missing classpath resource: " + classpathDir + "/" + name);
                }
                try (InputStream is = resource.getInputStream()) {
                    Files.copy(is, tempScriptDir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
                }
            }
            // classpath 폴 백에서도 동작하도록 의존성을 설치한다.
            runNpmInstall(tempScriptDir);
            dir = tempScriptDir;
            log.info("VestMail script-dir not configured — using classpath fallback {}", tempScriptDir);
        } else {
            log.info("VestMail extractor {} uses script-dir {}", scriptName, dir);
        }
        return new Prepared(dir, extractContract(), tempScriptDir, log);
    }

    /**
     * 컬럼 계약을 classpath 에서 임시 파일로 뽑아 Node 추출기에 경로로 넘긴다.
     * 저장소에 복사본을 두지 않기 위해 매번 추출한다(§29.3 단일 출처).
     */
    private static Path extractContract() throws Exception {
        Path file = Files.createTempFile("af-card-contract-", ".json");
        ClassPathResource resource = new ClassPathResource(CONTRACT_RESOURCE);
        if (!resource.exists()) {
            throw new IllegalStateException("Missing classpath resource: /" + CONTRACT_RESOURCE);
        }
        try (InputStream is = resource.getInputStream()) {
            Files.copy(is, file, StandardCopyOption.REPLACE_EXISTING);
        }
        return file;
    }

    static void runNpmInstall(Path dir) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("npm", "install", "--production");
        pb.directory(dir.toFile());
        pb.redirectErrorStream(true);
        Process process = pb.start();
        String output;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            output = reader.lines().collect(Collectors.joining("\n"));
        }
        int exitCode = process.waitFor();
        if (exitCode != 0) {
            throw new IllegalStateException("npm install failed with exit code " + exitCode + ": " + output);
        }
    }

    static void deleteRecursively(Path path, Logger log) {
        try {
            Files.walk(path)
                    .sorted(Comparator.reverseOrder())
                    .forEach(p -> {
                        try {
                            Files.deleteIfExists(p);
                        } catch (Exception ignored) {
                            // ignore
                        }
                    });
        } catch (Exception e) {
            log.warn("Failed to delete temp dir {}", path, e);
        }
    }
}
