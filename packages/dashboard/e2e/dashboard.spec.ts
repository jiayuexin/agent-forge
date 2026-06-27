import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('shows login modal without token', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('请输入管理员 Token')).toBeVisible();
  });

  test('navigates after entering token', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('').fill('admin-token');
    await page.getByRole('button', { name: '提交' }).click();
    await expect(page.getByText('首页')).toBeVisible();
  });
});
