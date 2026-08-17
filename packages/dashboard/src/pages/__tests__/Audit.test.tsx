import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuditStore } from '../../store/auditStore.js';
import { Audit } from '../Audit.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    Table: ({
      dataSource,
      loading,
    }: {
      dataSource?: Array<{ action: string }>;
      loading?: boolean;
    }) => (
      <div data-testid="audit-table" data-loading={loading ? 'true' : 'false'}>
        {(dataSource ?? []).map((row) => (
          <div key={row.action}>{row.action}</div>
        ))}
      </div>
    ),
  };
});

describe('Audit page', () => {
  beforeEach(() => {
    useAuditStore.setState({
      items: [],
      total: 0,
      loading: false,
      error: null,
      filters: { limit: 50, offset: 0 },
      fetchList: vi.fn(async () => {
        useAuditStore.setState({
          items: [
            {
              timestamp: Date.now(),
              action: 'capability-distribute',
              resource: 'cap-1',
              outcome: 'success',
            },
          ],
          total: 1,
          loading: false,
        });
      }),
      setFilters: vi.fn(),
    });
  });

  it('renders audit title and loads events', async () => {
    render(
      <MemoryRouter>
        <Audit />
      </MemoryRouter>
    );

    expect(screen.getByText('audit')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('capability-distribute')).toBeInTheDocument();
    });
  });
});
