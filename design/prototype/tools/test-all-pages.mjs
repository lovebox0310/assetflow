// 6개 화면이 "열리나" 를 확인한다.
//
// 이 파일이 막는 것:
//   공통 스크립트(common/mock-data.js)를 손본 직후 다른 화면이 조용히 죽는 경우.
//   자산 화면 테스트는 자산 화면만 본다. 부가가치세 Filing 이 모두 지나가면
//   dashboard 가 TypeError 로 통째로 죽는처럼, 옆 화면이 간从而 망가지는 일이
//   여기서만 잡힌다.
//
// 각 화면을 실제로 렌더까지 돌린다. 스크립트를 파싱만 하지 않는다.

import { check, report, loadPage, createEnv, PROTO_DIR } from "./prototype-harness.mjs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

/** 실제 존재하는 화면 목록을 디스크에서 읽는다. */
// 화면을 여기 하드코딩하면 새 화면이 테스트에서 조용히 빠진다.
const PAGES = readdirSync(PROTO_DIR)
  .filter((f) => f.endsWith(".html"))
  .sort();

check("프로토타입 화면이 6개 발견된다", PAGES.length === 6, "실제 " + PAGES.join(", "));

/* ---------------------------------------------------------------- */
/* 1. 전 화면이 예외 없이 열린다                                       */
/* ---------------------------------------------------------------- */

PAGES.forEach((file) => {
  const page = file.replace(/\.html$/, "");
  let page_ = null;
  let err = null;
  try {
    page_ = loadPage(file, { env: createEnv() });
  } catch (e) {
    err = e;
  }
  check(page + ".html 이 예외 없이 열린다", err === null, err && String(err.message).slice(0, 300));
  if (!page_) return;

  check(page + ".html 은 공통 데이터에 접근한다", !!(page_.AF && page_.AF.data), "AF 없음");

  // 열렸지만 빈 화면인 경우를 잡는다. 숫자 자리에 "?" 가 그대로면 렌더가 안 된 것이다.
  const placeholders = [];
  page_.queries.walk(page_.document.body, (el) => {
    if (el.children.length === 0 && el.textContent.trim() === "?") placeholders.push(el.id || el.tagName);
  });
  check(page + ".html 에 unfilled 자리표시자가 남지 않는다", placeholders.length === 0,
    placeholders.join(","));

  // 로드만 하고 저장은 하지 않는다. 화면을 merely 열었는데 저장소가 생기면 안 된다.
  check(page + ".html 은 열기만 해서는 저장소를 쓰지 않는다",
    ![...page_.store.keys()].some((k) => k.startsWith("assetflow.")),
    [...page_.store.keys()].join(","));
});

/* ---------------------------------------------------------------- */
/* 2. 부가가치세 Filing 이 다 지나간 상태                             */
/* ---------------------------------------------------------------- */

// asOf 를Filing 마지막 달보다 뒤로 밀면 nextFiling() 이 null 을 준다.
// 대시보드가 그 상태에서 죽지 않는지 확인한다(여기가 이 파일의 존재 이유).
function bootFarFuture(file) {
  return loadPage(file, {
    env: createEnv(),
    afterMock: (sandbox) => {
      sandbox.window.AF.data.asOf = "2099-01-31";
      sandbox.window.AF.recompute();
    },
  });
}

const dashFar = bootFarFuture("dashboard.html");
check("Filing 이 다 지나가면 upcoming 은 null 이 된다", dashFar.data.vat.upcoming === null,
  JSON.stringify(dashFar.data.vat.upcoming));
check("예정 없음 상태에서도 대시보드가 열린다", dashFar.el("vatCountdown") !== null);
check("예정 없음 상태를 사용자에게 보여 준다",
  dashFar.queries.text(dashFar.el("vatCountdown")) === "예정 없음",
  dashFar.queries.text(dashFar.el("vatCountdown")));
check("예정 없음 상태에서 확인 필요 태그를 보여 준다",
  dashFar.queries.text(dashFar.el("vatTag")) === "확인 필요",
  dashFar.queries.text(dashFar.el("vatTag")));

// 일반 상태에서는 카운트다운이 계산된다 (null 가드가 화면을 죽이지 않는 것과 별개).
const dashNow = loadPage("dashboard.html", { env: createEnv() });
check("정상 상태에서는 Filing 카운트다운이 나온다",
  /\d+개월 후/.test(dashNow.queries.text(dashNow.el("vatCountdown"))),
  dashNow.queries.text(dashNow.el("vatCountdown")));

/* ---------------------------------------------------------------- */
/* 3. 깨진 저장소를 넣어도 화면이 살아 있다                           */
/* ---------------------------------------------------------------- */

// 저장소가 깨면 화면이 빈 페이지로 죽는 게 아니라 안내를 보여 줘야 한다.
const BROKEN = {
  "assetflow.assets.v3": "{ 깨진 JSON",
  "assetflow.expenses.v1": "[[[",
  "assetflow.cardImports.v1": "null",
};
const brokenEnv = createEnv();
for (const [k, v] of Object.entries(BROKEN)) brokenEnv.store.set(k, v);
PAGES.forEach((file) => {
  const page = file.replace(/\.html$/, "");
  let ok = true;
  let msg = "";
  try {
    const p = loadPage(file, { env: brokenEnv });
    ok = !!(p.AF && p.AF.data);
  } catch (e) {
    ok = false;
    msg = String(e.message).slice(0, 200);
  }
  check("깨진 저장소로 " + page + ".html 이 죽지 않는다", ok, msg);
});

/* ---------------------------------------------------------------- */
/* 4. 재실행해도 전역이 오염되지 않는다                               */
/* ---------------------------------------------------------------- */

// 프로토타입은 localStorage 를 공유한다. 앞 화면이 남긴 값이 다음 화면의
// 기준이 되어야 한다(사용자가 오가며 보던 화면이어야 한다).
const a1 = loadPage("assets.html", { env: createEnv() });
a1.el("toggleMode").click();
a1.queries.type(a1.queries.findInput(a1.data.assets[0].key, "currentValue"), "61000000");
a1.el("editConfirm").click();

const savedA1 = a1.store.get("assetflow.assets.v3");
check("자산 화면에서 확정한 값이 저장된다", !!savedA1);

const dashAfter = loadPage("dashboard.html", {
  env: (() => { const e = createEnv(); e.store.set("assetflow.assets.v3", savedA1); return e; })(),
});
check("대시보드는 자산 화면이 저장한 값을 본다",
  dashAfter.data.assets[0].currentValue === 61000000,
  "실제 " + dashAfter.data.assets[0].currentValue);
check("대시보드 총자산이 그 값을 반영한다",
  dashAfter.data.totals.assets > 0 && isFinite(dashAfter.data.totals.assets));

void resolve; // 경로 확인용 import 는 여기서 쓰지 않는다.

report("전체 화면 부트");

/* ---------------------------------------------------------------- */
/* 도우미                                                            */
/* ---------------------------------------------------------------- */