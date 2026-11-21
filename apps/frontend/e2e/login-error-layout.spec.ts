import { test, expect } from "@playwright/test";

/**
 * #38-2: 로그인 전역 오류는 카드 **안**, 제출 버튼 **바로 아래**에 있고
 * 오류가 떠도 입력·버튼·카드의 위치가 변하지 않는다.
 *
 * - 원래 문제: 오류가 버튼 **위**에 있어 버튼이 28px 밀렸다 → 오류를 버튼 뒤로 옮겼다.
 * - 카드 높이가 변하지 않도록 슬롯 41px(문구 2줄 × 20.4286px)을 항상 예약한다.
 * - 예약 순증은 폼 grid gap(16px) 중 8px 만 marginTop −8 로 상쇄해 49px 로 묶는다
 *   (남은 8px 은 버튼과 문구 사이 숨 쉴 공간).
 *
 * 뷰포트를 테스트 안에서 320 으로 고정하므로 프로젝트 3배 실행을 막는다.
 */
test("#38 로그인 320 — 오류가 버튼 아래 카드 안에서 떠도 배치가 변하지 않는다", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "뷰포트를 직접 320 으로 고정한다(중복 실행 방지)",
  );

  await page.setViewportSize({ width: 320, height: 800 });

  // 실패 응답을 고정한다 — 백엔드 유무와 상관없이 같은 오류 경로를 태운다.
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "AUTH_FAILED",
        message: "이메일 또는 비밀번호를 확인해 주세요",
        details: "",
        timestamp: new Date().toISOString(),
      }),
    }),
  );

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "로그인" })).toBeVisible();

  const geometry = () =>
    page.evaluate(() => {
      window.scrollTo(0, 0);
      const rect = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) throw new Error(`${selector} 없음`);
        const r = el.getBoundingClientRect();
        return {
          top: r.top + window.scrollY,
          bottom: r.bottom + window.scrollY,
          left: r.left,
          right: r.right,
          height: r.height,
        };
      };
      return {
        card: rect(".auth-card"),
        button: rect('button[type="submit"]'),
        email: rect("#login-email"),
      };
    });

  const before = await geometry();
  // 기본 상태(오류 없음): 버튼 아래 = 숨 쉴 8 + 예약 슬롯 41 + 카드 패딩 24 + 테두리 1 = 74px.
  // 변경 전(HEAD)은 25px 였으므로 순증 49px.
  const reservedGap = before.card.bottom - before.button.bottom;
  expect(reservedGap).toBeGreaterThanOrEqual(73);
  expect(reservedGap).toBeLessThanOrEqual(75);
  expect(reservedGap - 25).toBeLessThanOrEqual(49);

  await page.fill('input[type="email"]', "wrong@example.com");
  await page.fill('input[type="password"]', "wrongpassword");
  await page.click('button[type="submit"]');

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText(
    "이메일 또는 비밀번호를 확인해 주세요. 입력하신 정보가 맞지 않습니다.",
  );

  const after = await geometry();
  const alertBox = (await alert.boundingBox())!;
  expect(alertBox).not.toBeNull();
  const alertTop = alertBox.y + (await page.evaluate(() => window.scrollY));

  // 카드 안 + 버튼 바로 아래(숨 쉴 공간 8px)
  expect(alertTop).toBeGreaterThanOrEqual(after.card.top - 1);
  expect(Math.abs(alertTop - after.button.bottom - 8)).toBeLessThanOrEqual(1);
  expect(alertBox.y + alertBox.height + (await page.evaluate(() => window.scrollY))).toBeLessThanOrEqual(
    after.card.bottom + 1,
  );

  // 입력·버튼·카드 위치/높이 불변
  expect(Math.abs(after.card.top - before.card.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.card.height - before.card.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.button.top - before.button.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(after.email.top - before.email.top)).toBeLessThanOrEqual(1);

  // 320 가로 넘침 없음 (오류 문구가 폭을 밀지 않는다).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
