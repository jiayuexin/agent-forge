import { useEffect } from 'react';
import { Table, Button, Tag, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGeneratedAgentStore } from '../store/generatedAgentStore.js';
import { PageHeader } from '../components/common/PageHeader.js';

export function ClientAgentList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { agents, loading, fetchList } = useGeneratedAgentStore();

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div>
      <PageHeader
        title={t('clientAgents')}
        extra={
          <Button type="primary" onClick={() => navigate('/client-agents/create')}>
            {t('create')}
          </Button>
        }
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={agents}
        columns={[
          { title: '名称', dataIndex: 'displayName' },
          { title: '模板', dataIndex: 'templateId' },
          { title: '模型', dataIndex: 'model' },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            render: (value: number) => new Date(value).toLocaleString(),
          },
          {
            title: '描述',
            dataIndex: 'description',
            ellipsis: true,
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/client-agents/${record.id}`)}>
                  详情
                </Button>
                <Tag>{record.name}</Tag>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
