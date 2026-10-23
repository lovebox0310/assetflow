// 프로토타입 검증 전체 실행기.
//
// 왜 자식 프로세스로 돌리는가:
//   각 테스트 파일이 스스로 process.exitCode 를 정한다. 한 프로세스에 몰아서
//   돌리면 앞 파일의 실패가 뒤 파일 결과에 섞여 어느 쪽이 깨졌는지 안 보인다.
//
// 사용법:
//   node design/prototype/tools/run-all.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// 순서는 의존이 아니라 비용 순서다. 실패해도 나머지를 모두 돌려 한 번에 본다.
const SUITES = [
  "test-mock-data.mjs",
  "test-assets-page.mjs",
  "test-settings-page.mjs",
  "test-all-pages.mjs",
];

console.log("프로토타입 검증 (" + SUITES.length + "개 스위트)\n");

let failed = 0;
SUITES.forEach((suite) => {
  const r = spawnSync(process.execPath, [resolve(HERE, suite)], { encoding: "utf8" });
  const out = ((r.stdout || "") + (r.stderr || "")).trimEnd();
  // 결과 요약 줄만 들고간다. 실패면 전체를 다 찍는다.
  const summary = out.split(/\r?\n/).filter((l) => /총|RESULT|FAIL/.test(l));
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log((ok ? "PASS " : "FAIL ") + suite);
  summary.forEach((l) => console.log("     " + l.trim()));
  if (!ok) console.log(out.split(/\r?\n/).map((l) => "     | " + l).join("\n"));
  console.log("");
});

if (failed > 0) {
  console.log("RESULT: FAIL (" + failed + "/" + SUITES.length + " 스위트 실패)");
  process.exitCode = 1;
} else {
  console.log("RESULT: PASS (" + SUITES.length + "/" + SUITES.length + " 스위트)");
}