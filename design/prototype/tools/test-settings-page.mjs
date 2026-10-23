// settings.html 프로필 저장 · 비상금 목표 개월 저장 회귀 검증.
//
// 이 파일이 막는 것:
//   1. "목표 개월을 고쳐도 아무 일도 일어나지 않는다" — 무동작했다. 입력칸이
//      폼 밖에 있어 저장 핸들러가 아예 없었고, 대시보드·지출 화면이 읽는
//      d.emergency.targetMonths 가 절대 바뀌지 않았다.
//   2. "숫자가 아닌 값을 넣어도 오류가 뜨지 않는다" — 검증이 없으면 조용히
//      NaN 이 목표 금액 계산으로 흘러간다.
//   3. "취소를 누르면 값이 복원되지 않는다" — 기본 리셋은 value 속성이 없는
//      JS 주입 필드(월 필수지출·계산 근거)까지 비운다.
//
// 하네스는 HTML 을 파싱하지 않는다. 문서 구조(폼 감싸기)는 원문 문자열로,
// 동작(저장·검증·복원)은 하네스로 각각 검사한다. 한쪽만 보면 반쪽만 지킨다.

import { check, report, loadPage, createEnv } from "./prototype-harness.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../settings.html", import.meta.url)), "utf8");

function boot() {
  const env = createEnv();
  return loadPage("settings.html", { env });
}
const submit = (p, id) => p.el(id).dispatchEvent({ type: "submit" });
const reset = (p, id) => p.el(id).dispatchEvent({ type: "reset" });
const type = (p, id, v) => {
  p.el(id).value = v;
  p.el(id).dispatchEvent({ type: "input" });
};

/* ================================================================ */
/* 1. 문서 구조: 목표 개월 입력이 폼 안에 있다                       */
/* ================================================================ */

const idxForm = html.indexOf('<form novalidate id="emergencyForm">');
const idxTarget = html.indexOf('id="target"');
const idxFormEnd = idxTarget >= 0 ? html.indexOf("</form>", idxTarget) : -1;

check("비상금 폼이 원문에 존재한다", idxForm >= 0, "id=emergencyForm 미발견");
check("목표 개월 입력이 비상금 폼 뒤에 있다",
  idxForm >= 0 && idxTarget > idxForm,
  "form@" + idxForm + " target@" + idxTarget);
check("목표 개월 입력이 폼 닫힘 앞에 있다", idxFormEnd > idxTarget, "closer@" + idxFormEnd);
check("비상금 폼에 저장 버튼이 있다",
  idxForm >= 0 && idxFormEnd > idxForm &&
    html.slice(idxForm, idxFormEnd).includes('type="submit"'));
check("비상금 폼에 취소(리셋) 버튼이 있다",
  idxForm >= 0 && idxFormEnd > idxForm &&
    html.slice(idxForm, idxFormEnd).includes('type="reset"'));
check("프로필 폼에도 id 가 있다",
  html.includes('<form novalidate id="profileForm">'));
check("목표 개월 오류 설명이 입력에 연결되어 있다",
  html.includes('aria-describedby="target-help target-error"'));
check("두 폼의 submit 을 각각 id 로 찾는다",
  html.includes('getElementById("profileForm")') &&
    html.includes('getElementById("emergencyForm")'));

/* ================================================================ */
/* 2. 부트: 값이 데이터에서 채워진다                                 */
/* ================================================================ */

const p1 = boot();
const d1 = p1.data;

check("목표 개월이 시드값으로 채워진다",
  p1.el("target").value === String(d1.emergency.targetMonths),
  p1.el("target").value + " vs " + d1.emergency.targetMonths);
check("월 필수지출이 포맷되어 채워진다",
  p1.el("essentialReadonly").value ===
    p1.AF.fmt.formatKRW(d1.cash.autoTransfer.monthlyEssential),
  p1.el("essentialReadonly").value);
check("계산 근거가 채워진다",
  p1.el("essentialBreakdown").value.indexOf("필수") >= 0,
  p1.el("essentialBreakdown").value);
check("부트 시 오류 경고는 숨어 있다", p1.el("emergencyAlert").hidden === true);
check("부트 시 필드 오류는 숨어 있다", p1.el("target-error").hidden === true);
check("부트 시 저장 상태는 비어 있다", p1.el("targetStatus").textContent === "",
  p1.el("targetStatus").textContent);

/* ================================================================ */
/* 3. 정상 저장: 데이터·목표 금액·상태가 갱신된다                    */
/* ================================================================ */

type(p1, "target", "12");
submit(p1, "emergencyForm");

check("저장하면 targetMonths 가 바뀐다", d1.emergency.targetMonths === 12,
  String(d1.emergency.targetMonths));
check("저장하면 목표 금액이 다시 계산된다",
  d1.emergency.targetAmount === 12 * d1.cash.autoTransfer.monthlyEssential,
  d1.emergency.targetAmount + " vs " + 12 * d1.cash.autoTransfer.monthlyEssential);
check("저장 완료 상태가 뜬다",
  p1.el("targetStatus").textContent.indexOf("저장됨") >= 0,
  p1.el("targetStatus").textContent);
check("상태에 목표 금액이 들어간다",
  p1.el("targetStatus").textContent.indexOf(p1.AF.fmt.formatKRW(d1.emergency.targetAmount)) >= 0,
  p1.el("targetStatus").textContent);
check("달성 여부가 상태에 들어간다",
  /달성/.test(p1.el("targetStatus").textContent),
  p1.el("targetStatus").textContent);
check("성공 후 오류 경고는 숨는다", p1.el("emergencyAlert").hidden === true);
check("성공 후 필드 오류는 숨는다", p1.el("target-error").hidden === true);
check("저장 후 입력값이 유지된다", p1.el("target").value === "12", p1.el("target").value);

/* ================================================================ */
/* 4. 잘못된 값은 저장되지 않고 오류가 뜬다                          */
/* ================================================================ */

const p2 = boot();
const d2 = p2.data;
const t2 = p2.el("target");
const before2 = d2.emergency.targetMonths;

for (const bad of ["", "abc", "3.5", "30", "-1", "0"]) {
  const label = JSON.stringify(bad);
  t2.value = bad;
  submit(p2, "emergencyForm");
  check(label + " 값이 거부된다", d2.emergency.targetMonths === before2,
    "targetMonths=" + d2.emergency.targetMonths);
  check(label + " 오류 경고가 뜬다", p2.el("emergencyAlert").hidden === false);
  check(label + " 필드 오류가 뜬다", p2.el("target-error").hidden === false);
  check(label + " aria-invalid=true", t2.getAttribute("aria-invalid") === "true",
    String(t2.getAttribute("aria-invalid")));
  check(label + " 저장 상태는 비어 있다", p2.el("targetStatus").textContent === "");
}

// 입력을 시작하면 피드백이 지워진다.
type(p2, "target", "12");
check("입력하면 오류 경고가 사라진다", p2.el("emergencyAlert").hidden === true);
check("입력하면 필드 오류가 사라진다", p2.el("target-error").hidden === true);
check("입력하면 aria-invalid 가 사라진다",
  t2.getAttribute("aria-invalid") === null, String(t2.getAttribute("aria-invalid")));

/* ================================================================ */
/* 5. 취소(리셋)는 저장값으로 복귀하고 읽기 필드를 지키지 않는다       */
/* ================================================================ */

submit(p2, "emergencyForm");
check("12가 저장된다", d2.emergency.targetMonths === 12, String(d2.emergency.targetMonths));

type(p2, "target", "24"); // 입력만 하고 저장하지 않는다
reset(p2, "emergencyForm");
check("취소하면 저장값(12)으로 복귀한다",
  p2.el("target").value === "12", p2.el("target").value);
check("취소 후 저장 상태가 지워진다", p2.el("targetStatus").textContent === "",
  p2.el("targetStatus").textContent);
check("취소 후에도 월 필수지출 필드가 남아 있다",
  p2.el("essentialReadonly").value.length > 0,
  JSON.stringify(p2.el("essentialReadonly").value));
check("취소 후에도 계산 근거 필드가 남아 있다",
  p2.el("essentialBreakdown").value.indexOf("필수") >= 0,
  JSON.stringify(p2.el("essentialBreakdown").value));
check("취소가 목표 개월 데이터를 되돌리지 않는다",
  d2.emergency.targetMonths === 12, String(d2.emergency.targetMonths));

/* ================================================================ */
/* 6. 두 폼이 서로 섞이지 않는다                                     */
/* ================================================================ */

const p3 = boot();
const d3 = p3.data;

type(p3, "name", "김테스트");
type(p3, "email", "test@example.com");
submit(p3, "profileForm");

check("프로필 저장이 계정 요약을 바꾼다",
  p3.el("sumName").textContent === "김테스트", p3.el("sumName").textContent);
check("프로필 저장이 비상금 목표를 건드리지 않는다",
  d3.emergency.targetMonths === 6,
  String(d3.emergency.targetMonths));
check("프로필 저장이 비상금 저장 상태를 건드리지 않는다",
  p3.el("targetStatus").textContent === "", p3.el("targetStatus").textContent);

type(p3, "target", "9");
submit(p3, "emergencyForm");
check("비상금 저장이 프로필 요약을 건드리지 않는다",
  p3.el("sumName").textContent === "김테스트", p3.el("sumName").textContent);
check("비상금 저장이 프로필 오류 알림을 켜지 않는다",
  p3.el("saveAlert").hidden === true);
check("비상금 저장이 프로필 입력값을 건드리지 않는다",
  p3.el("name").value === "김테스트", p3.el("name").value);

// 프로필 취소: 저장한 값으로 복원되고 비상금 값은 그대로다.
type(p3, "name", "바뀜");
reset(p3, "profileForm");
check("프로필 취소가 저장한 이름으로 복귀한다",
  p3.el("name").value === "김테스트", p3.el("name").value);
check("프로필 취소가 이메일도 복귀시킨다",
  p3.el("email").value === "test@example.com", p3.el("email").value);
check("프로필 취소가 비상금 목표를 건드리지 않는다",
  d3.emergency.targetMonths === 9, String(d3.emergency.targetMonths));

report("settings.html 프로필·비상금 저장 회귀");
