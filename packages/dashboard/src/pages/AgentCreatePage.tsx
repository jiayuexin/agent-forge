import { useState } from 'react';
import {
  Card,
  Form,
  Input,
  Radio,
  Select,
  Checkbox,
  Button,
  Collapse,
  Row,
  Col,
  message,
  Typography,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

const { TextArea } = Input;
const { Title, Text } = Typography;

const templates = [
  { value: 'customer-service', label: '客服', description: '处理客户咨询、订单查询等' },
  { value: 'sales', label: '销售', description: '销售跟进、CRM 操作' },
  { value: 'code-review', label: '代码审查', description: '代码审查、PR 分析' },
  { value: 'content', label: '内容', description: '内容生成、文案撰写' },
  { value: 'data', label: '数据', description: '数据分析、报表生成' },
  { value: 'general', label: '通用', description: '通用 Agent，自定义配置' },
];

const providers = [
  { label: 'OpenAI', value: 'openai', models: ['gpt-4', 'gpt-4o', 'gpt-3.5-turbo'] },
  { label: 'Anthropic', value: 'anthropic', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'] },
  { label: 'Ollama', value: 'ollama', models: ['llama3', 'qwen2', 'mistral'] },
];

const availableTools = [
  { label: 'query-order (订单查询)', value: 'query-order' },
  { label: 'process-refund (退款处理)', value: 'process-refund' },
  { label: 'send-notification (通知发送)', value: 'send-notification' },
  { label: 'crm-query (CRM 查询)', value: 'crm-query' },
  { label: 'email-send (邮件发送)', value: 'email-send' },
  { label: 'code-review (代码审查)', value: 'code-review' },
  { label: 'web-search (网络搜索)', value: 'web-search' },
  { label: 'database-query (数据库查询)', value: 'database-query' },
];

function buildPreviewPrompt(
  description: string,
  templateId: string,
  model: string,
  tools: string[],
): string {
  const template = templates.find((t) => t.value === templateId);
  const lines: string[] = [];
  lines.push('# System Prompt\n');
  if (template) {
    lines.push(`## 角色定义`);
    lines.push(`你是一个${template.label}类型的 AI 助手。`);
  }
  if (description) {
    lines.push(`\n## 职责描述`);
    lines.push(description);
  }
  if (model) {
    lines.push(`\n## 模型配置`);
    lines.push(`- 模型: ${model}`);
  }
  if (tools.length > 0) {
    lines.push(`\n## 可用工具`);
    tools.forEach((t) => lines.push(`- ${t}`));
  }
  return lines.join('\n');
}

export default function AgentCreatePage() {
  const navigate = useNavigate();
  const { createAgent, loading } = useStore();
  const [form] = Form.useForm();
  const [previewPrompt, setPreviewPrompt] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('openai');

  const updatePreview = () => {
    const values = form.getFieldsValue();
    const prompt = buildPreviewPrompt(
      values.description || '',
      values.templateId || 'general',
      values.model || '',
      values.tools || [],
    );
    setPreviewPrompt(prompt);
  };

  const handleSubmit = async (values: {
    description: string;
    templateId: string;
    provider: string;
    model: string;
    tools: string[];
  }) => {
    try {
      await createAgent(values.description, {
        templateId: values.templateId,
        provider: values.provider,
        model: values.model,
        tools: values.tools,
      });
      message.success('Agent 创建成功');
      navigate('/agents');
    } catch {
      message.error('创建失败，请重试');
    }
  };

  const currentModels = providers.find((p) => p.value === selectedProvider)?.models || [];

  return (
    <div>
      <Title level={4} className="mb-6">创建 Agent</Title>

      <Row gutter={24}>
        <Col xs={24} lg={14}>
          <Card>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              onValuesChange={updatePreview}
              initialValues={{ templateId: 'general', provider: 'openai', tools: [] }}
            >
              <Form.Item
                label="描述输入"
                name="description"
                rules={[{ required: true, message: '请输入 Agent 描述' }]}
              >
                <TextArea
                  rows={4}
                  placeholder="描述你想要创建的 Agent，例如：一个处理售后退款的客服助手，能够查询订单状态并处理退款请求"
                />
              </Form.Item>

              <Form.Item label="模板选择" name="templateId">
                <Radio.Group>
                  <Row gutter={[8, 8]}>
                    {templates.map((t) => (
                      <Col key={t.value} xs={12} sm={8}>
                        <Radio.Button value={t.value} className="w-full text-center h-auto py-2">
                          <div className="font-medium">{t.label}</div>
                          <div className="text-xs text-gray-400 mt-1">{t.description}</div>
                        </Radio.Button>
                      </Col>
                    ))}
                  </Row>
                </Radio.Group>
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Provider" name="provider">
                    <Select
                      options={providers.map((p) => ({ label: p.label, value: p.value }))}
                      onChange={(val) => {
                        setSelectedProvider(val);
                        form.setFieldValue('model', undefined);
                        updatePreview();
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="模型" name="model">
                    <Select
                      placeholder="选择模型"
                      options={currentModels.map((m) => ({ label: m, value: m }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="工具配置" name="tools">
                <Checkbox.Group options={availableTools} />
              </Form.Item>

              <Collapse
                items={[
                  {
                    key: 'advanced',
                    label: '高级选项',
                    children: (
                      <Row gutter={16}>
                        <Col span={8}>
                          <Form.Item label="温度" name="temperature" initialValue={0.7}>
                            <Input type="number" min={0} max={2} step={0.1} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item label="Max Tokens" name="maxTokens" initialValue={4096}>
                            <Input type="number" min={1} max={128000} />
                          </Form.Item>
                        </Col>
                        <Col span={8}>
                          <Form.Item label="版本" name="version" initialValue="1.0.0">
                            <Input placeholder="1.0.0" />
                          </Form.Item>
                        </Col>
                      </Row>
                    ),
                  },
                ]}
              />

              <Form.Item className="mb-0 mt-6">
                <Button type="primary" htmlType="submit" size="large" loading={loading} block>
                  创建 Agent
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          <Card title="实时预览 System Prompt">
            <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-auto max-h-[600px] whitespace-pre-wrap font-mono">
              {previewPrompt || '// 填写左侧表单以预览生成的 System Prompt'}
            </pre>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
