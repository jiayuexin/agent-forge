import { useEffect, useState } from 'react';
import { Form, Input, Select, Button, Card, Typography, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTemplateStore } from '../store/templateStore.js';
import { useGeneratedAgentStore } from '../store/generatedAgentStore.js';

const { TextArea } = Input;
const { Option } = Select;

export function ClientAgentCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [preview, setPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { templates, fetchList: fetchTemplates } = useTemplateStore();
  const { create } = useGeneratedAgentStore();

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleValuesChange = (_changedValues: Record<string, unknown>, allValues: Record<string, unknown>) => {
    setPreview(buildPromptPreview(allValues));
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const agent = await create({
        name: values.name,
        description: values.description,
        templateId: values.templateId,
        model: values.model,
      });
      message.success('ClientAgent 已生成');
      navigate(`/client-agents/${agent.id}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Typography.Title level={2}>{t('clientAgents')} / {t('create')}</Typography.Title>
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        onFinish={handleSubmit}
      >
        <Form.Item name="name" label="名称" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="description"
          label="描述"
          rules={[{ required: true, min: 10, message: '描述至少 10 个字符' }]}
        >
          <TextArea rows={3} />
        </Form.Item>
        <Form.Item name="model" label="模型" rules={[{ required: true }]}>
          <Select placeholder="选择模型">
            <Option value="gpt-4o">GPT-4o</Option>
            <Option value="gpt-4o-mini">GPT-4o Mini</Option>
            <Option value="claude-sonnet-4-6">Claude Sonnet 4.6</Option>
          </Select>
        </Form.Item>
        <Form.Item name="templateId" label="模板" rules={[{ required: true }]}>
          <Select placeholder="选择模板">
            {templates.map((template) => (
              <Option key={template.id} value={template.id}>
                {template.displayName}
              </Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>{t('create')}</Button>
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
  const template = values.templateId
    ? String(values.templateId)
    : '未选择';
  return `# ${values.name || '未命名 Agent'}

## 角色
${values.description || '暂无描述'}

## 模型
${values.model || '未选择'}

## 模板
${template}

## System Prompt
你是一位 ${values.description || '智能助手'}。请基于用户需求提供专业、准确的回答。
`;
}
