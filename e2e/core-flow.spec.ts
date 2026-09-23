import { expect, test } from "@playwright/test";

test("guest onboarding, study log, chronicle, and local settings", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("모험가 이름").fill("별빛 기록자");
  await page.getByRole("button", { name: "모험 시작하기" }).click();
  await expect(page.getByRole("heading", { name: /안녕하세요, 별빛 기록자님/ })).toBeVisible();

  await page.getByRole("button", { name: "활동 기록 추가" }).click();
  await page.getByRole("button", { name: /공부/ }).click();
  await page.getByLabel("어떤 활동이었나요?").selectOption({ label: "수학" });
  await page.getByLabel("걸린 시간 (분)").fill("60");
  await page.getByLabel("과목").fill("수학");
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(page.getByRole("heading", { name: "오늘의 발자국" })).toBeVisible();
  await expect(page.getByText(/1시간/).first()).toBeVisible();

  await page.getByRole("button", { name: "연대기", exact: true }).click();
  await expect(page.getByRole("heading", { name: "연대기" })).toBeVisible();
  await expect(page.getByText("수학", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "홈", exact: true }).click();
  await page.getByRole("button", { name: /잠자기 시작/ }).click();
  await expect(page.getByRole("button", { name: "기상" })).toBeVisible();
  await page.getByRole("button", { name: "기상" }).click();
  await expect(page.getByRole("dialog", { name: "기록 다듬기" })).toBeVisible();
  await page.getByRole("button", { name: "기록 저장" }).click();
  await expect(page.getByRole("button", { name: /잠자기 시작/ })).toBeVisible();

  await page.getByRole("button", { name: "설정 열기" }).click();
  await page.getByRole("switch", { name: "다음부터 타이틀 건너뛰기" }).click();
  await page.getByRole("button", { name: "완료" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: /안녕하세요, 별빛 기록자님/ })).toBeVisible();
});
