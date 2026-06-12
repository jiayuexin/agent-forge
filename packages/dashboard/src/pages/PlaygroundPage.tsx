import { useState, useRef } from 'react';
import {
  Card,
  Select,
  Input,
  Button,
  Space,
  Tag,
  Timeline,
  Switch,
  List,
  Typography,
  Tooltip,
} from 'antd';
import {
  SendOutlined,
  ClearOutlined,
  ReloadOutlined,
  ToolOutlined,
  PlusOutlined,
  UserOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useStore, type AgentInfo } from '../store/useStore';

const { Text } = Typography;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface TraceEvent {
  id: string;
  type: 'system_prompt' | 'llm_call' | 'tool_call' | 'output';
  label: string;
  status: 'success' | 'running' | 'error';
  detail?: string;
  duration?: string;
}

const placeholderAgents: AgentInfo[] = [
  { id: '1', name: '客服助手', role: '客服', version: '1.0.0', status: 'ready', capabilities: ['query-order', 'process-refund'], model: 'gpt-4', templateId: 'customer-service' },
  { id: '2', name: '代码审查员', role: '代码审查', version: '1.2.0', status: 'running', capabilities: ['code-review', 'git-diff'], model: 'claude-3', templateId: 'code-review' },
];

const sampleMessages: ChatMessage[] = [
  { id: '1', role: 'user', content: '帮我查询订单 #12345 的状态', timestamp: '14:30:12' },
  { id: '2', role: 'assistant', content: '我来帮您查询订单状态。\n\n订单 #12345 信息如下：\n- 状态：已发货\n- 物流公司：顺丰快递\n- 运单号：SF1234567890\n- 预计到达：明天下午', timestamp: '14:30:15' },
];

const sampleTraces: TraceEvent[] = [
  { id: '1', type: 'system_prompt', label: 'System Prompt 构建', status: 'success', duration: '12ms' },
  { id: '2', type: 'llm_call', label: 'LLM 调用 (gpt-4)', status: 'success', duration: '1.2s', detail: 'Prompt: 256 tokens\nCompletion: 128 tokens' },
  { id: '3', type: 'tool_call', label: '工具调用: query-order', status: 'success', duration: '320ms', detail: '输入: { orderId: "12345" }\n输出: { status: "shipped", ... }' },
  { id: '4', type: 'llm_call', label: '二次 LLM 调用', status: 'success', duration: '0.8s', detail: 'Prompt: 384 tokens\nCompletion: 96 tokens' },
  { id: '5', type: 'output', label: '结构化输出解析', status: 'success', duration: '5ms' },
];

const availableTools = [
  { id: 'query-order', name: 'query-order', description: '订单查询', mocked: false },
  { id: 'process-refund', name: 'process-refund', description: '退款处理', mocked: true },
  { id: 'send-notification', name: 'send-notification', description: '通知发送', mocked: false },
  { id: 'crm-query', name: 'crm-query', description: 'CRM 查询', mocked: false },
  { id: 'web-search', name: 'web-search', description: '网络搜索', mocked: false },
];

const traceColors: Record<string, string> = {
  system_prompt: '#1677ff',
  llm_call: '#722ed1',
  tool_call: '#fa8c16',
  output: '#52c41a',
};

export default function PlaygroundPage() {
  const { agents } = useStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>(sampleMessages);
  const [inputValue, setInputValue] = useState('');
  const [traces] = useState<TraceEvent[]>(sampleTraces);
  const [tools, setTools] = useState(availableTools);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const displayAgents = agents.length > 0 ? agents : placeholderAgents;

  const handleSend = () => {
    if (!inputValue.trim()) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');

    // Simulate assistant response
    setTimeout(() => {
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '这是一个模拟回复。在实际环境中，这里会显示 Agent 的实时响应。',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }, 1000);
  };

  const toggleMock = (toolId: string) => {
    setTools((prev) =>
      prev.map((t) => (t.id === toolId ? { ...t, mocked: !t.mocked } : t)),
    );
  };

  return (
    <div className="h-[calc(100vh-112px)] flex flex-col">
      {/* Agent selector */}
      <div className="mb-4 flex items-center gap-4">
        <Select
          placeholder="选择 Agent"
          style={{ width: 240 }}
          value={selectedAgentId}
          onChange={setSelectedAgentId}
          options={displayAgents.map((a) => ({ label: a.name, value: a.id }))}
        />
        <Select
          defaultValue="gpt-4"
          style={{ width: 160 }}
          options={[
            { label: 'GPT-4', value: 'gpt-4' },
            { label: 'Claude 3', value: 'claude-3' },
            { label: 'Llama 3', value: 'llama3' },
          ]}
        />
      </div>

      {/* Three-panel layout */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Chat panel */}
        <div className="flex-[3] flex flex-col min-w-0">
          <Card
            title="对话区域"
            className="flex-1 flex flex-col"
            styles={{ body: { flex: 1, overflow: 'auto', padding: '16px' } }}
          >
            <div className="flex-1 overflow-auto mb-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {msg.role === 'user' ? (
                        <UserOutlined className="text-xs" />
                      ) : (
                        <RobotOutlined className="text-xs" />
                      )}
                      <Text
                        className={`text-xs ${
                          msg.role === 'user' ? 'text-blue-100' : 'text-gray-400'
                        }`}
                      >
                        {msg.timestamp}
                      </Text>
                    </div>
                    <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          </Card>
          <div className="mt-3 flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onPressEnter={handleSend}
              placeholder="输入消息..."
              size="large"
            />
            <Button type="primary" icon={<SendOutlined />} size="large" onClick={handleSend}>
              发送
            </Button>
            <Tooltip title="清空对话">
              <Button icon={<ClearOutlined />} size="large" onClick={() => setMessages([])} />
            </Tooltip>
            <Tooltip title="重试">
              <Button icon={<ReloadOutlined />} size="large" />
            </Tooltip>
          </div>
        </div>

        {/* Trace panel */}
        <div className="flex-[1.5] min-w-0">
          <Card
            title="调用链路"
            className="h-full"
            styles={{ body: { overflow: 'auto', maxHeight: 'calc(100vh - 240px)' } }}
          >
            <Timeline
              items={traces.map((trace) => ({
                color: traceColors[trace.type] || '#1677ff',
                children: (
                  <div key={trace.id}>
                    <div className="flex items-center gap-2">
                      <Text strong className="text-sm">{trace.label}</Text>
                      <Tag
                        color={trace.status === 'success' ? 'green' : trace.status === 'running' ? 'blue' : 'red'}
                        className="text-xs"
                      >
                        {trace.status === 'success' ? '完成' : trace.status === 'running' ? '运行中' : '错误'}
                      </Tag>
                      {trace.duration && (
                        <Text type="secondary" className="text-xs">{trace.duration}</Text>
                      )}
                    </div>
                    {trace.detail && (
                      <pre className="mt-1 text-xs bg-gray-50 p-2 rounded text-gray-600 whitespace-pre-wrap max-h-24 overflow-auto">
                        {trace.detail}
                      </pre>
                    )}
                  </div>
                ),
              }))}
            />
          </Card>
        </div>

        {/* Tool panel */}
        <div className="flex-[1] min-w-0">
          <Card
            title="工具面板"
            className="h-full"
            styles={{ body: { overflow: 'auto', maxHeight: 'calc(100vh - 240px)' } }}
          >
            <List
              size="small"
              dataSource={tools}
              renderItem={(tool) => (
                <List.Item
                  actions={[
                    <Tooltip title="Mock 开关" key="mock">
                      <Switch
                        size="small"
                        checked={tool.mocked}
                        onChange={() => toggleMock(tool.id)}
                      />
                    </Tooltip>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<ToolOutlined style={{ color: tool.mocked ? '#fa8c16' : '#1677ff' }} />}
                    title={
                      <Space>
                        <Text className="text-sm">{tool.name}</Text>
                        {tool.mocked && <Tag color="orange" className="text-xs">Mock</Tag>}
                      </Space>
                    }
                    description={<Text type="secondary" className="text-xs">{tool.description}</Text>}
                  />
                </List.Item>
              )}
            />
            <Button icon={<PlusOutlined />} block className="mt-3" type="dashed">
              注入工具
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
