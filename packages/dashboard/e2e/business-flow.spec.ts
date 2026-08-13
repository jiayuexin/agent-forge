import { test, expect } from '@playwright/test';
import {
  ADMIN_TOKEN,
  buttonByLabel,
  createCapability,
  login,
  waitForOnlineNode,
} from './helpers.js';

test.describe.serial('Dashboard business flow', () => {
  test('shows login modal without token', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('请输入管理员 Token')).toBeVisible();
  });

  test('logs in and shows home dashboard', async ({ page }) => {
    await login(page);
    await expect(page.getByRole('heading', { name: 'AgentForge' })).toBeVisible();
    await expect(page.getByText('QUICK_ACTIONS')).toBeVisible();
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
    await page
      .locator('.ant-select-item-option')
      .filter({ hasText: 'Developer Assistant' })
      .click();

    await expect(page.getByText('Prompt 预览')).toBeVisible();
    await expect(page.locator('pre').filter({ hasText: agentName })).toBeVisible();

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/v1/client-agents') && response.request().method() === 'POST'
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

  test('lists connected ClientAgent node (US6)', async ({ page, request }) => {
    test.setTimeout(90_000);
    await login(page);

    let nodeId: string | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request.get('/api/v1/nodes', {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      });
      const nodes = (await response.json()) as Array<{ id: string; name: string }>;
      const node = nodes.find((item) => item.name === 'E2E ClientAgent');
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
    test.setTimeout(60_000);
    await login(page);
    const capabilityId = `e2e-dist-${Date.now()}`;
    await createCapability(page, capabilityId, 'E2E Distribute Tool');

    await page.goto(`/capabilities/${capabilityId}/distribute`);
    await page
      .getByRole('heading', { name: /E2E Distribute Tool \/ 下发/ })
      .waitFor({ state: 'visible' });

    await page.getByLabel('目标节点').click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'E2E ClientAgent' }).click();
    // Close multi-select dropdown so it does not intercept the submit button.
    await page.keyboard.press('Escape');
    await page.locator('.ant-select-dropdown').waitFor({ state: 'hidden' });
    await buttonByLabel(page, '下发').click();
    await expect(page.getByText('下发完成')).toBeVisible();
    await expect(page.getByText('installed')).toBeVisible();
  });

  test('returns failed distribute result for missing node', async ({ request }) => {
    const capabilityId = `e2e-fail-${Date.now()}`;
    await request.post('/api/v1/capabilities', {
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
        endpointType: 'local-function',
        endpoint: { target: 'tools.fail' },
        inputSchema: { type: 'object' },
      },
    });

    const response = await request.post(`/api/v1/capabilities/${capabilityId}/distribute`, {
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
    test.setTimeout(90_000);
    await login(page);
    await page.goto('/playground');
    await waitForOnlineNode(page, 'E2E ClientAgent');
    await page.goto('/playground');

    await page.locator('.ant-select').first().click();
    await page.locator('.ant-select-item-option').filter({ hasText: 'E2E ClientAgent' }).click();

    await page.getByPlaceholder('输入消息...').fill('请用 markdown 回复');
    await buttonByLabel(page, '发送').click();

    await expect(page.getByText(/mock:/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('请用 markdown 回复', { exact: true })).toBeVisible();
    await expect(page.getByText('LLM 调用')).toBeVisible();
  });

  test('manages playground sessions', async ({ page }) => {
    await login(page);
    await page.goto('/playground');

    await buttonByLabel(page, '新会话').click();
    await expect(page.getByText('会话 2')).toBeVisible();
    await buttonByLabel(page, '清空').click();
  });

  test('browses capability market', async ({ page }) => {
    await login(page);
    await page.goto('/capabilities/market');
    await expect(page.getByRole('heading', { name: '能力 / 市场' })).toBeVisible();
    await buttonByLabel(page, '下发').first().click();
    await expect(page.getByRole('heading', { name: /\/ 下发$/ })).toBeVisible();
  });

  test('shows monitor metrics and events', async ({ page }) => {
    await login(page);
    await page.goto('/monitor');
    await expect(page.getByText('指标概览')).toBeVisible();
    await expect(page.getByText('实时事件')).toBeVisible();
  });

  test('logs out and shows login modal again', async ({ page }) => {
    await login(page);
    await buttonByLabel(page, '登录').click();
    await expect(page.getByText('请输入管理员 Token')).toBeVisible();
  });

  test('covers token lifecycle, audit, capability delete and real remote execute', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000);
    const created = await request.post('/api/v1/admin/tokens', {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: { role: 'readonly', note: 'e2e-readonly' },
    });
    expect(created.ok()).toBeTruthy();
    const tokenBody = (await created.json()) as { tokenId: string; role: string };
    expect(tokenBody.role).toBe('readonly');

    const listed = await request.get('/api/v1/admin/tokens', {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const tokens = (await listed.json()) as Array<{ id: string }>;
    expect(tokens.some((item) => item.id === tokenBody.tokenId)).toBe(true);

    await login(page);
    const capabilityId = `e2e-delete-${Date.now()}`;
    await createCapability(page, capabilityId, 'E2E Delete Tool');
    const deleted = await request.delete(`/api/v1/capabilities/${capabilityId}`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(deleted.ok()).toBeTruthy();

    const nodes = (await (
      await request.get('/api/v1/nodes', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })
    ).json()) as Array<{ id: string; name: string }>;
    const node = nodes.find((item) => item.name === 'E2E ClientAgent');
    expect(node).toBeTruthy();
    const executed = await request.post(`/api/v1/nodes/${node!.id}/execute`, {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: { type: 'chat', input: { message: 'e2e-execute' } },
    });
    expect(executed.ok()).toBeTruthy();
    await expect(executed.json()).resolves.toMatchObject({
      success: true,
      output: { content: expect.stringContaining('e2e-execute') },
    });

    const pluginId = `e2e-plugin-${Date.now()}`;
    const pluginCreated = await request.post('/api/v1/capabilities', {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: {
        id: pluginId,
        type: 'plugin',
        name: 'E2E Plugin',
        description: 'Plugin capability used by e2e install path',
        downloadUrl: 'https://example.com/e2e-plugin.wasm',
        signature: 'e2e-signature',
        keyId: 'e2e-publisher',
        entry: 'run',
        allowedCapabilities: [],
        sandbox: { timeoutMs: 1000, maxMemoryPages: 8 },
        inputSchema: { type: 'object' },
      },
    });
    expect(pluginCreated.ok()).toBeTruthy();
    const pluginListed = await request.get('/api/v1/capabilities', {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const capabilities = (await pluginListed.json()) as Array<{ id: string }>;
    expect(capabilities.some((item) => item.id === pluginId)).toBe(true);

    const updated = await request.put(`/api/v1/capabilities/${pluginId}`, {
      headers: {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      data: {
        id: pluginId,
        type: 'plugin',
        name: 'E2E Plugin Updated',
        description: 'Plugin capability used by e2e install path',
        downloadUrl: 'https://example.com/e2e-plugin.wasm',
        signature: 'e2e-signature',
        keyId: 'e2e-publisher',
        entry: 'run',
        allowedCapabilities: [],
        sandbox: { timeoutMs: 1000, maxMemoryPages: 8 },
        inputSchema: { type: 'object' },
      },
    });
    expect(updated.ok()).toBeTruthy();
    const pluginDetail = await request.get(`/api/v1/capabilities/${pluginId}`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await expect(pluginDetail.json()).resolves.toMatchObject({ name: 'E2E Plugin Updated' });

    const disconnected = await request.delete(`/api/v1/nodes/${node!.id}`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(disconnected.ok()).toBeTruthy();
    let recovered = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const listed = (await (
        await request.get('/api/v1/nodes', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })
      ).json()) as Array<{ id: string; name: string }>;
      if (listed.some((item) => item.name === 'E2E ClientAgent')) {
        recovered = true;
        break;
      }
      await page.waitForTimeout(250);
    }
    expect(recovered).toBe(true);

    const audit = await request.get('/api/v1/audit?action=node-execute', {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const auditBody = (await audit.json()) as { total: number };
    expect(auditBody.total).toBeGreaterThan(0);

    const revoked = await request.delete(`/api/v1/admin/tokens/${tokenBody.tokenId}`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(revoked.ok()).toBeTruthy();
  });
});
