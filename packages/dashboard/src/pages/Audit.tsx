import { useEffect, useState } from 'react';
import { Table, Select, Space, Typography, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/common/PageHeader.js';
import { useAuditStore } from '../store/auditStore.js';
import type { AuditEvent } from '@agentforge/core';

const ACTION_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'local-command', label: 'local-command' },
  { value: 'capability-distribute', label: 'capability-distribute' },
  { value: 'config-change', label: 'config-change' },
];

export function Audit() {
  const { t } = useTranslation();
  const { items, total, loading, fetchList, setFilters, filters } = useAuditStore();
  const [action, setAction] = useState<string>(filters.action ?? '');
  const [from, setFrom] = useState<number | undefined>();
  const [to, setTo] = useState<number | undefined>();

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const applyFilters = (nextAction: string, nextFrom?: number, nextTo?: number) => {
    const params = {
      action: nextAction || undefined,
      from: nextFrom,
      to: nextTo,
      offset: 0,
    };
    setFilters(params);
    fetchList(params);
  };

  return (
    <div>
      <PageHeader title={t('audit')} />
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          style={{ width: 220 }}
          value={action}
          options={ACTION_OPTIONS}
          onChange={(value) => {
            setAction(value);
            applyFilters(value, from, to);
          }}
        />
        <DatePicker.RangePicker
          onChange={(values) => {
            const nextFrom = values?.[0] ? values[0].startOf('day').valueOf() : undefined;
            const nextTo = values?.[1] ? values[1].endOf('day').valueOf() : undefined;
            setFrom(nextFrom);
            setTo(nextTo);
            applyFilters(action, nextFrom, nextTo);
          }}
        />
        <Typography.Text type="secondary">{t('auditRetentionHint')}</Typography.Text>
      </Space>
      <Table
        rowKey={(row) => `${row.timestamp}-${row.action}-${row.resource ?? ''}`}
        loading={loading}
        dataSource={items}
        pagination={{
          total,
          current: Math.floor((filters.offset ?? 0) / (filters.limit ?? 50)) + 1,
          pageSize: filters.limit ?? 50,
          onChange: (page, pageSize) => {
            const offset = (page - 1) * pageSize;
            fetchList({ limit: pageSize, offset });
          },
        }}
        columns={[
          {
            title: t('auditTimestamp'),
            dataIndex: 'timestamp',
            render: (value: number) => dayjs(value).format('YYYY-MM-DD HH:mm:ss'),
          },
          { title: t('auditAction'), dataIndex: 'action' },
          { title: t('auditActor'), dataIndex: 'actor', render: (v?: string) => v ?? '-' },
          { title: t('auditResource'), dataIndex: 'resource', render: (v?: string) => v ?? '-' },
          { title: t('auditOutcome'), dataIndex: 'outcome' },
          {
            title: t('auditDetails'),
            dataIndex: 'details',
            render: (details: AuditEvent['details']) =>
              details ? (
                <Typography.Text code style={{ whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(details)}
                </Typography.Text>
              ) : (
                '-'
              ),
          },
        ]}
      />
    </div>
  );
}
