import type { Page, Locator } from '@playwright/test';

export const ADMIN_TOKEN = process.env.AGENTFORGE_ADMIN_TOKEN ?? 'admin-token';

/** Match button labels even when CSS letter-spacing inserts spaces into the a11y name. */
export function buttonByLabel(page: Page, label: string): Locator {
  const pattern = new RegExp(label.split('').map(escapeRegExp).join('\\s*'));
  return page.getByRole('button', { name: pattern });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function login(page: Page, token = ADMIN_TOKEN): Promise<void> {
  await page.goto('/');
  await page.getByText('请输入管理员 Token').waitFor({ state: 'visible' });
  await page.getByLabel('请输入管理员 Token').fill(token);
  await page.locator('.ant-modal-footer .ant-btn-primary').click();
  // Home hero heading after AuthGuard accepts the token (UI is tech-themed, not "首页").
  await page.getByRole('heading', { name: 'AgentForge' }).waitFor({ state: 'visible' });
  await page.waitForFunction(
    (expectedToken) => localStorage.getItem('agentforge-auth')?.includes(expectedToken),
    token
  );
}

export async function createCapability(page: Page, id: string, name: string): Promise<void> {
  await page.goto('/capabilities');
  await page.getByRole('heading', { name: '能力' }).waitFor({ state: 'visible' });
  await page.locator('div.flex.items-center.justify-between.mb-6 button.ant-btn-primary').click();
  await page.getByLabel('ID', { exact: true }).fill(id);
  await page.getByLabel('名称', { exact: true }).fill(name);
  await page.getByLabel('端点类型').click();
  await page.locator('.ant-select-item-option').filter({ hasText: '本地命令' }).click();
  await page.getByLabel('端点目标').fill('echo e2e-ok');
  await page.getByLabel('输入 Schema').fill('{"type":"object"}');
  await page.getByLabel('描述', { exact: true }).fill('E2E test capability description');
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/api/v1/capabilities') &&
        response.request().method() === 'POST' &&
        response.ok()
    ),
    page.locator('.ant-modal-footer .ant-btn-primary').click(),
  ]);
  await page.getByText('能力已创建').waitFor({ state: 'visible' });
}

export async function waitForOnlineNode(page: Page, nodeName: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    await page.goto('/nodes');
    if (
      await page
        .getByText(nodeName)
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Node ${nodeName} not visible`);
}
