import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Tag, Space, Empty, Popconfirm, message } from 'antd';
import {
  PlusCircleOutlined,
  SearchOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  BugOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStore, type AgentInfo } from '../store/useStore';

const statusMap: Record<string, { color: string; label: string }> = {
  ready: { color: 'green', label: '就绪' },
  running: { color: 'blue', label: '运行中' },
  paused: { color: 'orange', label: '暂停' },
  error: { color: 'red', label: '错误' },
};

const placeholderAgents: AgentInfo[] = [
  {
    id: '1',
    name: '客服助手',
    role: '客服',
    version: '1.0.0',
    status: 'ready',
    capabilities: ['query-order', 'process-refund'],
    model: 'gpt-4',
    templateId: 'customer-service',
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: '代码审查员',
    role: '代码审查',
    version: '1.2.0',
    status: 'running',
    capabilities: ['code-review', 'git-diff'],
    model: 'claude-3',
    templateId: 'code-review',
    createdAt: '2024-01-20',
  },
  {
    id: '3',
    name: '销售助手',
    role: '销售',
    version: '0.9.0',
    status: 'paused',
    capabilities: ['crm-query', 'email-send'],
    model: 'gpt-4',
    templateId: 'sales',
    createdAt: '2024-02-01',
  },
];

export default function AgentListPage() {
  const navigate = useNavigate();
  const { agents, fetchAgents, loading } = useStore();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const displayAgents = agents.length > 0 ? agents : placeholderAgents;

  const filteredAgents = displayAgents.filter((agent) => {
    const matchSearch =
      !searchText ||
      agent.name.toLowerCase().includes(searchText.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = !statusFilter || agent.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', render: (text: string) => <strong>{text}</strong> },
    { title: '角色', dataIndex: 'role', key: 'role' },
    { title: '模型', dataIndex: 'model', key: 'model', render: (text: string) => <Tag>{text}</Tag> },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const info = statusMap[status] || { color: 'default', label: status };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: AgentInfo) => (
        <Space>
          <Button type="link" size="small" icon={<EyeOutlined />}>
            详情
          </Button>
          <Button type="link" size="small" icon={<PlayCircleOutlined />}>
            启动
          </Button>
          <Button type="link" size="small" icon={<BugOutlined />} onClick={() => navigate('/playground')}>
            调试
          </Button>
          <Popconfirm title="确定删除该 Agent？" onConfirm={() => message.success('已删除')}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold m-0">Agent 列表</h2>
        <Button type="primary" icon={<PlusCircleOutlined />} onClick={() => navigate('/create')}>
          创建 Agent
        </Button>
      </div>

      <div className="flex gap-4 mb-4">
        <Input
          placeholder="搜索 Agent 名称或角色"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300 }}
          allowClear
        />
        <Select
          placeholder="按状态筛选"
          allowClear
          style={{ width: 160 }}
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { label: '就绪', value: 'ready' },
            { label: '运行中', value: 'running' },
            { label: '暂停', value: 'paused' },
            { label: '错误', value: 'error' },
          ]}
        />
      </div>

      {filteredAgents.length === 0 && !loading ? (
        <Empty
          description="还没有 Agent"
          className="py-16"
        >
          <Button type="primary" icon={<PlusCircleOutlined />} onClick={() => navigate('/create')}>
            创建你的第一个 Agent
          </Button>
        </Empty>
      ) : (
        <Table
          dataSource={filteredAgents}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      )}
    </div>
  );
}
