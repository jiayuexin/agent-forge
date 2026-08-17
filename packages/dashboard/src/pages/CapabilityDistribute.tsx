import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Form, Select, Button, Table, Tag, message, Typography } from 'antd';
import { useCapabilityStore } from '../store/capabilityStore.js';
import { useNodeStore } from '../store/nodeStore.js';
import type { Capability, DistributeCapabilityRequest } from '@agentforge/types';

const { Option } = Select;

export function CapabilityDistribute() {
  const { id } = useParams<{ id: string }>();
  const { capabilities, versions, fetchList: fetchCapabilities, distribute } = useCapabilityStore();
  const { nodes, fetchNodes } = useNodeStore();
  const [form] = Form.useForm();
  const [result, setResult] = useState<Record<string, { status: string; error?: string }> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCapabilities();
    fetchNodes();
  }, [fetchCapabilities, fetchNodes]);

  const currentCapability = capabilities.find((c: Capability) => c.id === id);

  const handleSubmit = async () => {
    if (!id) return;
    const values = await form.validateFields();
    const request: DistributeCapabilityRequest = {
      nodeIds: values.nodeIds,
      action: values.action,
      targetVersion: values.targetVersion,
    };
    setLoading(true);
    try {
      const response = await distribute(id, request);
      setResult(response);
      message.success('下发完成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Typography.Title level={2}>
        {currentCapability?.name || id} / 下发
      </Typography.Title>

      <Card>
        <Form form={form} layout="vertical">
          <Form.Item name="nodeIds" label="目标节点" rules={[{ required: true }]}>
            <Select mode="multiple" placeholder="选择节点">
              {nodes.map((node) => (
                <Option key={node.id} value={node.id}>
                  {node.name} ({node.status})
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="action" label="动作" rules={[{ required: true }]} initialValue="add">
            <Select>
              <Option value="add">安装</Option>
              <Option value="update">更新</Option>
              <Option value="remove">移除</Option>
            </Select>
          </Form.Item>
          <Form.Item name="targetVersion" label="目标版本">
            <Select placeholder="可选">
              {(versions[id || ''] || []).map((version: Capability) => (
                <Option key={version.version} value={version.version}>
                  {version.version}
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Button type="primary" loading={loading} onClick={handleSubmit}>
            下发
          </Button>
        </Form>
      </Card>

      {result && (
        <Card title="下发结果" className="mt-6">
          <Table
            rowKey="nodeId"
            dataSource={Object.entries(result).map(([nodeId, data]) => ({ nodeId, ...data }))}
            columns={[
              { title: '节点', dataIndex: 'nodeId' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (status: string) => (
                  <Tag color={status === 'installed' || status === 'downloaded' ? 'green' : status === 'failed' ? 'red' : 'default'}>
                    {status}
                  </Tag>
                ),
              },
              { title: '错误', dataIndex: 'error' },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
