import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Form,
  Input,
  Switch,
  Button,
  Tag,
  Typography,
  Spin,
  InputNumber,
  message,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { useNodeStore } from '../store/nodeStore.js';
import { StatusBadge } from '../components/common/StatusBadge.js';
import { executeNode } from '../api/nodes.js';
import type { NodeExecuteRequest, NodeConfigUpdateRequest } from '@agentforge/types';

const { TextArea } = Input;

export function NodeDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { nodes, fetchNodes, updateConfig } = useNodeStore();
  const [form] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [result, setResult] = useState<string>('');
  const [executing, setExecuting] = useState(false);

  const node = nodes.find((n) => n.id === id);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  useEffect(() => {
    if (node) {
      form.setFieldsValue({
        allowRemoteExecution: true,
        heartbeatInterval: 30000,
        requireLocalConfirmation: '',
        tags: node.tags?.join(', ') ?? '',
      });
    }
  }, [node, form]);

  if (!node) {
    return <Spin tip={t('loading')} />;
  }

  const handleExecute = async () => {
    const values = await taskForm.validateFields();
    setExecuting(true);
    try {
      const request: NodeExecuteRequest = {
        type: values.type,
        input: { message: values.message },
      };
      const response = await executeNode(id!, request);
      setResult(JSON.stringify(response, null, 2));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setExecuting(false);
    }
  };

  const handleConfigUpdate = async () => {
    const values = await form.validateFields();
    const request: NodeConfigUpdateRequest = {
      allowRemoteExecution: values.allowRemoteExecution,
      heartbeatInterval: values.heartbeatInterval,
      requireLocalConfirmation: values.requireLocalConfirmation,
      tags: values.tags ? values.tags.split(',').map((s: string) => s.trim()) : [],
    };
    await updateConfig(id!, request);
    message.success('配置已更新');
  };

  return (
    <div>
      <Typography.Title level={2}>{node.name}</Typography.Title>
      <Descriptions bordered>
        <Descriptions.Item label="ID">{node.id}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <StatusBadge status={node.status} />
        </Descriptions.Item>
        <Descriptions.Item label="Agent ID">{node.agentId}</Descriptions.Item>
        <Descriptions.Item label="注册时间">
          {new Date(node.registeredAt).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="最后心跳">
          {new Date(node.lastHeartbeat).toLocaleString()}
        </Descriptions.Item>
        <Descriptions.Item label="连接时间">
          {node.connection ? new Date(node.connection.connectedAt).toLocaleString() : '-'}
        </Descriptions.Item>
      </Descriptions>

      <Card title="已安装能力" className="mt-6">
        {node.capabilities?.length ? (
          node.capabilities.map((cap) => <Tag key={typeof cap === 'string' ? cap : cap.id}>{typeof cap === 'string' ? cap : cap.name}</Tag>)
        ) : (
          <Typography.Text type="secondary">未安装能力</Typography.Text>
        )}
      </Card>

      <Card title="远程执行" className="mt-6">
        <Form form={taskForm} layout="vertical">
          <Form.Item name="type" label="任务类型" initialValue="chat" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="message" label="输入" rules={[{ required: true }]}>
            <TextArea rows={3} />
          </Form.Item>
          <Button type="primary" loading={executing} onClick={handleExecute}>
            执行
          </Button>
        </Form>
        {result && (
          <pre className="mt-4 whitespace-pre-wrap bg-gray-50 p-4 rounded">{result}</pre>
        )}
      </Card>

      <Card title="配置更新" className="mt-6">
        <Form form={form} layout="vertical">
          <Form.Item name="allowRemoteExecution" label="允许远程执行" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="heartbeatInterval" label="心跳间隔（毫秒）">
            <InputNumber min={5000} />
          </Form.Item>
          <Form.Item name="requireLocalConfirmation" label="需本地确认的操作">
            <Input placeholder="用逗号分隔" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Input placeholder="用逗号分隔" />
          </Form.Item>
          <Button type="primary" onClick={handleConfigUpdate}>
            {t('save')}
          </Button>
        </Form>
      </Card>
    </div>
  );
}
