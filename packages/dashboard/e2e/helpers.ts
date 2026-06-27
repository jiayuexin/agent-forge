import type { Page } from '@playwright/test';

export const ADMIN_TOKEN = process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token';

export async function login(page: Page, token = ADMIN_TOKEN): Promise<void> {
  await page.goto('/');
  const modal = page.getByText('请输入管理员 Token');
  if (await modal.isVisible()) {
    await page.getByLabel('请输入管理员 Token').fill(token);
    await page.locator('.ant-modal-footer .ant-btn-primary').click();
  }
  await page.getByRole('heading', { name: '首页' }).waitFor({ state: 'visible' });
  await page.waitForFunction(
    (expectedToken) => localStorage.getItem('agentforge-auth')?.includes(expectedToken),
    token
  );
}

export async function createCapability(page: Page, id: string, name: string): Promise<void> {
  await page.goto('/capabilities');
  await page.getByRole('heading', { name: '能力' }).waitFor({ state: 'visible' });
  await page.locator('div.flex.items-center.justify-between.mb-6 button.ant-btn-primary').click();
  await page.getByLabel('ID').fill(id);
  await page.getByLabel('名称').fill(name);
  await page.getByLabel('描述').fill('E2E test capability description');
  await page.locator('.ant-modal .ant-btn-primary').click();
  await page.getByText(id).waitFor({ state: 'visible' });
}

export async function waitForOnlineNode(page: Page, nodeName: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    await page.goto('/nodes');
    if (await page.getByText(nodeName).isVisible().catch(() => false)) {
      return;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Node ${nodeName} not visible`);
}
