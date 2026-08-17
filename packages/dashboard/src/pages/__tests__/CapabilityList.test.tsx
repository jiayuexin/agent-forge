import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { useCapabilityStore } from '../../store/capabilityStore.js';
import { CapabilityList } from '../CapabilityList.js';

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  const Select = Object.assign(
    ({
      value,
      onChange,
      children,
      ...props
    }: {
      value?: string;
      onChange?: (value: string) => void;
      children?: ReactNode;
    }) => (
      <select {...props} value={value ?? ''} onChange={(event) => onChange?.(event.target.value)}>
        {children}
      </select>
    ),
    {
      Option: ({ value, children }: { value: string; children?: ReactNode }) => (
        <option value={value}>{children}</option>
      ),
    }
  );

  return {
    ...actual,
    Table: () => null,
    Select,
    Modal: ({
      open,
      children,
      onOk,
    }: {
      open?: boolean;
      children?: ReactNode;
      onOk?: () => void;
    }) =>
      open ? (
        <div>
          {children}
          <button className="ant-btn-primary" onClick={onOk}>
            OK
          </button>
        </div>
      ) : null,
    message: { success: vi.fn() },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('CapabilityList', () => {
  const createCapability = vi.fn();

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    );
  });

  beforeEach(() => {
    createCapability.mockReset();
    createCapability.mockResolvedValue(undefined);
    useCapabilityStore.setState({
      capabilities: [],
      loading: false,
      fetchList: vi.fn().mockResolvedValue(undefined),
      create: createCapability,
      remove: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('requires and submits the Tool execution contract entered by the user', async () => {
    render(
      <MemoryRouter>
        <CapabilityList />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'create' }));

    const endpointType = await screen.findByLabelText('端点类型');
    const endpointTarget = screen.getByLabelText('端点目标');
    const inputSchema = screen.getByLabelText('输入 Schema');

    expect(endpointType).toBeRequired();
    expect(endpointTarget).toBeRequired();
    expect(inputSchema).toBeRequired();

    fireEvent.change(screen.getByLabelText('ID'), { target: { value: 'tool-http' } });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'http-tool' } });
    fireEvent.change(screen.getByLabelText('描述'), {
      target: { value: 'Calls an HTTP endpoint' },
    });
    fireEvent.change(endpointType, { target: { value: 'http' } });
    fireEvent.change(endpointTarget, { target: { value: '/tools/http' } });
    fireEvent.change(inputSchema, { target: { value: '{"type":"object"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(createCapability).toHaveBeenCalledWith({
        id: 'tool-http',
        type: 'tool',
        name: 'http-tool',
        description: 'Calls an HTTP endpoint',
        riskLevel: 'low',
        endpointType: 'http',
        endpoint: { target: '/tools/http' },
        inputSchema: { type: 'object' },
      });
    });
  });
});
