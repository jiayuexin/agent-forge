import { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Tag, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCapabilityStore } from '../store/capabilityStore.js';
import { CapabilityTypeTag } from '../components/common/CapabilityTypeTag.js';
import { RiskTag } from '../components/common/RiskTag.js';
import { PageHeader } from '../components/common/PageHeader.js';
import type { Capability, CapabilityType } from '@agentforge/types';

const { Option } = Select;
const { TextArea } = Input;

export function CapabilityList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { capabilities, loading, fetchList, create, remove } = useCapabilityStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleCreate = async () => {
    const values = await form.validateFields();
    await create(values as Capability);
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
            render: (tags: string[]) =>
              tags?.map((tag) => <Tag key={tag}>{tag}</Tag>),
          },
          {
            title: '操作',
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => navigate(`/capabilities/${record.id}`)}>
                  详情
                </Button>
                <Button size="small" onClick={() => navigate(`/capabilities/${record.id}/distribute`)}>
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
          <Form.Item name="type" label="类型" rules={[{ required: true }]} initialValue="tool">
            <Select>
              <Option value="agent">Agent</Option>
              <Option value="tool">Tool</Option>
              <Option value="skill">Skill</Option>
              <Option value="plugin">Plugin</Option>
              <Option value="remote-agent">Remote Agent</Option>
            </Select>
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
