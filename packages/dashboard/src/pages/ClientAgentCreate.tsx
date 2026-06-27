import { useState } from 'react';
import { Form, Input, Select, Button, Card, Typography, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const { TextArea } = Input;
const { Option } = Select;

export function ClientAgentCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [preview, setPreview] = useState('');

  const handleValuesChange = (changedValues: Record<string, unknown>) => {
    const values = form.getFieldsValue();
    setPreview(buildPromptPreview({ ...values, ...changedValues }));
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    console.log('Create ClientAgent', values);
    // TODO: 调用生成接口（Phase 8 CLI 或后续补充）
    navigate('/client-agents');
  };

  return (
    <div>
      <Typography.Title level={2}>{t('clientAgents')} / {t('create')}</Typography.Title>
      <Alert
        message="提示"
        description="当前仅支持填写配置并预览 Prompt，实际生成将在后续阶段通过 CLI 或生成接口完成。"
        type="info"
        showIcon
        className="mb-6"
      />
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        onFinish={handleSubmit}
      >
        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="描述">
          <TextArea rows={3} />
        </Form.Item>
        <Form.Item name="model" label="模型" rules={[{ required: true }]}>
          <Select placeholder="选择模型">
            <Option value="gpt-4o">GPT-4o</Option>
            <Option value="gpt-4o-mini">GPT-4o Mini</Option>
            <Option value="claude-sonnet-4-6">Claude Sonnet 4.6</Option>
          </Select>
        </Form.Item>
        <Form.Item name="template" label="模板" rules={[{ required: true }]}>
          <Select placeholder="选择模板">
            <Option value="base">基础助手</Option>
            <Option value="developer">开发助手</Option>
            <Option value="reviewer">代码审查员</Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit">{t('create')}</Button>
          <Button className="ml-2" onClick={() => navigate('/client-agents')}>{t('cancel')}</Button>
        </Form.Item>
      </Form>

      <Card title="Prompt 预览" className="mt-6">
        <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded">{preview || '填写表单后实时预览'}</pre>
      </Card>
    </div>
  );
}

function buildPromptPreview(values: Record<string, unknown>): string {
  return `# ${values.name || '未命名 Agent'}

## 角色
${values.description || '暂无描述'}

## 模型
${values.model || '未选择'}

## 模板
${values.template || '未选择'}

## System Prompt
你是一位 ${values.description || '智能助手'}。请基于用户需求提供专业、准确的回答。
`;
}
