import { test, expect } from '@playwright/test';
import { ADMIN_TOKEN, createCapability, login, waitForOnlineNode } from './helpers.js';

test.describe.serial('Dashboard business flow', () => {
  test('shows login modal without token', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('请输入管理员 Token')).toBeVisible();
  });

  test('logs in and shows home dashboard', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: '首页' })).toBeVisible();
    await expect(page.getByText('快捷操作')).toBeVisible();
  });

  test('creates a ClientAgent through the web form', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    await page.goto('/client-agents/create');

    const agentName = `E2E Agent ${Date.now()}`;
    await page.getByLabel('名称').fill(agentName);
    await page.getByLabel('描述').fill('这是一个用于端到端测试的本地编程助手，需要至少十字');
    await page.getByLabel('模型').click();
    await page.getByTitle('GPT-4o', { exact: true }).click();
    await page.getByLabel('模板').click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'Developer Assistant' }).click();

    await expect(page.getByText('Prompt 预览')).toBeVisible();
    await expect(page.locator('pre').filter({ hasText: agentName })).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/client-agents') && response.request().method() === 'POST'
      ),
      page.locator('form button.ant-btn-primary').click(),
    ]);
    await expect(page.getByText('ClientAgent 已生成')).toBeVisible();
    await expect(page.getByText('System Prompt')).toBeVisible();

    await page.goto('/client-agents');
    await expect(page.getByText(agentName)).toBeVisible();
  });

  test('manages capabilities', async ({ page }) => {
    await login(page);
    const capabilityId = `e2e-tool-${Date.now()}`;
    await createCapability(page, capabilityId, 'E2E Test Tool');
    await page.goto(`/capabilities/${capabilityId}`);
    await expect(page.getByRole('heading', { name: 'E2E Test Tool' })).toBeVisible();
    await expect(page.getByText('JSON 定义')).toBeVisible();
    await expect(page.getByText(capabilityId)).toBeVisible();
  });

  test('lists connected mock node (US6)', async ({ page, request }) => {
    test.setTimeout(90_000);
    await login(page);

    let nodeId: string | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request.get('/api/nodes', {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      const nodes = (await response.json()) as Array<{ id: string; name: string }>;
      const node = nodes.find((item) => item.name === 'E2E Mock Node');
      if (node) {
        nodeId = node.id;
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(nodeId).toBeTruthy();

    await page.goto(`/nodes/${nodeId}`);
    await expect(page.getByText('最后心跳')).toBeVisible();
  });

  test('distributes capability to online node (US7)', async ({ page }) => {
    await login(page);
    const capabilityId = `e2e-dist-${Date.now()}`;
    await createCapability(page, capabilityId, 'E2E Distribute Tool');

    await page.getByRole('button', { name: '下发' }).first().click();
    await page.locator('.ant-select').first().click();
    await page.getByText('E2E Mock Node').click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '下发' }).click();
    await expect(page.getByText('下发完成')).toBeVisible();
    await expect(page.getByText('installed')).toBeVisible();
  });

  test('returns failed distribute result for missing node', async ({ request }) => {
    const capabilityId = `e2e-fail-${Date.now()}`;
    await request.post('/api/capabilities', {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: {
        id: capabilityId,
        type: 'tool',
        name: 'Fail Tool',
        description: 'E2E failure path capability',
        riskLevel: 'low',
      },
    });

    const response = await request.post(`/api/capabilities/${capabilityId}/distribute`, {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: {
        nodeIds: ['missing-node-id'],
        action: 'add',
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as Record<string, { status: string }>;
    expect(body['missing-node-id']?.status).toBe('failed');
  });

  test('streams markdown and call trace in playground (US14)', async ({ page }) => {
    await login(page);
    await page.goto('/playground');
    await waitForOnlineNode(page, 'E2E Mock Node');
    await page.goto('/playground');

    await page.locator('.ant-select').first().click();
    await page.getByText('E2E Mock Node').click();

    await page.getByPlaceholder('输入消息...').fill('请用 markdown 回复');
    await page.getByRole('button', { name: '发送' }).click();

    await expect(page.getByRole('heading', { name: 'E2E Reply' })).toBeVisible();
    await expect(page.getByText('console.log("hello")')).toBeVisible();
    await expect(page.getByText('LLM 调用')).toBeVisible();
    await expect(page.getByText('工具调用: git-status')).toBeVisible();
  });

  test('manages playground sessions', async ({ page }) => {
    await login(page);
    await page.goto('/playground');

    await page.getByRole('button', { name: '新会话' }).click();
    await expect(page.getByText('会话 2')).toBeVisible();
    await page.getByRole('button', { name: '清空' }).click();
  });

  test('browses capability market', async ({ page }) => {
    await login(page);
    await page.goto('/capabilities/market');
    await expect(page.getByRole('heading', { name: '能力 / 市场' })).toBeVisible();
    await page.getByRole('button', { name: '下发' }).first().click();
    await expect(page.getByText('下发')).toBeVisible();
  });

  test('shows monitor metrics and events', async ({ page }) => {
    await login(page);
    await page.goto('/monitor');
    await expect(page.getByText('指标概览')).toBeVisible();
    await expect(page.getByText('实时事件')).toBeVisible();
  });

  test('logs out and shows login modal again', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page.getByText('请输入管理员 Token')).toBeVisible();
  });
});
