import { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Tag, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCapabilityStore } from '../store/capabilityStore.js';
import { CapabilityTypeTag } from '../components/common/CapabilityTypeTag.js';
import { RiskTag } from '../components/common/RiskTag.js';
import { PageHeader } from '../components/common/PageHeader.js';
import type { CapabilityType, JSONSchema, ToolCapability } from '@agentforge/types';

const { Option } = Select;
const { TextArea } = Input;

interface CreateToolFormValues {
  id: string;
  name: string;
  description: string;
  riskLevel?: 'low' | 'medium' | 'high';
  endpointType: ToolCapability['endpointType'];
  endpointTarget: string;
  inputSchema: string;
}

function parseInputSchema(value: string): JSONSchema {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('输入 Schema 必须是 JSON 对象');
  }
  return parsed as JSONSchema;
}

export function CapabilityList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { capabilities, loading, fetchList, create, remove } = useCapabilityStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm<CreateToolFormValues>();

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const { endpointTarget, inputSchema, ...metadata } = values;
    const capability: ToolCapability = {
      ...metadata,
      type: 'tool',
      endpoint: { target: endpointTarget },
      inputSchema: parseInputSchema(inputSchema),
    };
    await create(capability);
    setIsModalOpen(false);
    form.resetFields();
    message.success('能力已创建');
  };

  return (
    <div>
      <PageHeader
        title={t('capabilities')}
        extra={
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            {t('create')}
          </Button>
        }
      />
      <Table
        rowKey="id"
        loading={loading}
        dataSource={capabilities}
        columns={[
          { title: 'ID', dataIndex: 'id' },
          { title: '名称', dataIndex: 'name' },
          {
            title: '类型',
            dataIndex: 'type',
            render: (type: CapabilityType) => <CapabilityTypeTag type={type} />,
          },
          {
            title: '风险',
            dataIndex: 'riskLevel',
            render: (level) => <RiskTag level={level} />,
          },
          {
            title: '标签',
            dataIndex: 'tags',
            render: (tags: string[]) => tags?.map((tag) => <Tag key={tag}>{tag}</Tag>),
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/capabilities/${record.id}`)}>
                  详情
                </Button>
                <Button
                  size="small"
                  onClick={() => navigate(`/capabilities/${record.id}/distribute`)}
                >
                  下发
                </Button>
                <Button size="small" danger onClick={() => remove(record.id)}>
                  {t('delete')}
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="新建能力"
        open={isModalOpen}
        onOk={handleCreate}
        onCancel={() => setIsModalOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="id" label="ID" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="类型">
            <Input value="Tool" disabled />
          </Form.Item>
          <Form.Item
            name="endpointType"
            label="端点类型"
            rules={[{ required: true, message: '请选择端点类型' }]}
          >
            <Select placeholder="请选择端点类型">
              <Option value="local-command">本地命令</Option>
              <Option value="local-function">本地函数</Option>
              <Option value="http">HTTP</Option>
              <Option value="remote-agent">远程 Agent</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="endpointTarget"
            label="端点目标"
            rules={[{ required: true, message: '请输入端点目标' }]}
          >
            <Input placeholder="函数引用、命令模板或 HTTP 路径" />
          </Form.Item>
          <Form.Item
            name="inputSchema"
            label="输入 Schema"
            rules={[
              { required: true, message: '请输入输入 Schema' },
              {
                validator: async (_, value: string | undefined) => {
                  if (value) {
                    parseInputSchema(value);
                  }
                },
              },
            ]}
          >
            <TextArea rows={5} placeholder='{"type":"object"}' />
          </Form.Item>
          <Form.Item name="description" label="描述" rules={[{ required: true }]}>
            <TextArea rows={3} />
          </Form.Item>
          <Form.Item name="riskLevel" label="风险等级" initialValue="low">
            <Select>
              <Option value="low">低</Option>
              <Option value="medium">中</Option>
              <Option value="high">高</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
