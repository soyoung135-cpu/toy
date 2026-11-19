import { expect, test } from "@playwright/test";

test("홈 화면이 열리고 새 대화를 시작할 수 있다", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("영어 회화 연습");
  await expect(page.getByRole("button", { name: "대화 시작" })).toBeVisible();
  await expect(page.getByRole("button", { name: "새 대화" })).toBeVisible();
});
