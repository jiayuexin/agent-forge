import { useEffect } from 'react';
import { Table, Button, Space, Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNodeStore } from '../store/nodeStore.js';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { PageHeader } from '../components/common/PageHeader.js';

export function NodeList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { nodes, loading, fetchNodes, unregister } = useNodeStore();

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  return (
    <div>
      <PageHeader title={t('nodes')} />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={nodes}
        columns={[
          { title: '节点名称', dataIndex: 'name' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status) => <StatusBadge status={status} />,
          },
          {
            title: '标签',
            dataIndex: 'tags',
            render: (tags: string[]) =>
              tags.map((tag) => <Tag key={tag}>{tag}</Tag>),
          },
          {
            title: '能力数',
            dataIndex: 'capabilities',
            render: (capabilities) => capabilities?.length ?? 0,
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/nodes/${record.id}`)}>
                  详情
                </Button>
                <Button size="small" onClick={() => navigate(`/nodes/${record.id}/chat`)}>
                  对话
                </Button>
                <Button size="small" danger onClick={() => unregister(record.id)}>
                  断开
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
