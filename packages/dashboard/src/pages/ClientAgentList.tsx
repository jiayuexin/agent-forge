import { useEffect } from 'react';
import { Table, Button, Tag, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTemplateStore } from '../store/templateStore.js';
import { PageHeader } from '../components/common/PageHeader.js';

export function ClientAgentList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { templates, loading, fetchList } = useTemplateStore();

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
        dataSource={templates}
        columns={[
          { title: '名称', dataIndex: 'displayName' },
          { title: '岗位', dataIndex: 'category' },
          {
            title: '标签',
            dataIndex: 'tags',
            render: (tags: string[]) =>
              tags.map((tag) => (
                <Tag key={tag}>
                  {tag}
                </Tag>
              )),
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/client-agents/${record.id}`)}>
                  详情
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
