import { expect, type Page } from "@playwright/test";

/**
 * マイルストーン達成の確認ダイアログ (MilestoneAchievementPrompter) に「達成！」で答える。
 * web も確認モードなので、判定で条件を満たしたマイルストーンは自動では達成にならず、
 * このダイアログで確定して初めて achieved になる。候補が複数あれば1件ずつ続けて出るので、
 * ダイアログが出なくなるまで答える。
 */
export async function confirmAchievementPrompts(page: Page, maxPrompts = 10): Promise<void> {
  const prompt = page.locator('[data-testid="milestone-achievement-prompt"]');
  await expect(prompt).toBeVisible({ timeout: 15000 });
  for (let i = 0; i < maxPrompts; i += 1) {
    if (!(await prompt.isVisible())) return;
    const title = await prompt.locator("#milestone-achievement-description").textContent();
    await prompt.locator('[data-testid="milestone-achievement-confirm"]').click();
    // 次の候補 (別のマイルストーン) に切り替わるか、ダイアログが閉じるまで待つ
    await expect
      .poll(
        async () =>
          !(await prompt.isVisible()) ||
          (await prompt.locator("#milestone-achievement-description").textContent()) !== title,
        { timeout: 10000 },
      )
      .toBe(true);
  }
}
