import { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Select,
  Slider,
  Space,
  Typography,
  List,
  Avatar,
  message,
} from 'antd';
import { RobotOutlined, UserOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePlaygroundStore } from '../store/playgroundStore.js';
import { useNodeStore } from '../store/nodeStore.js';
import { streamNodeTask } from '../api/nodes.js';
import { MarkdownMessage } from '../components/playground/MarkdownMessage.js';
import { CallTracePanel } from '../components/playground/CallTracePanel.js';

const { TextArea } = Input;
const { Option } = Select;

export function Playground() {
  const { t } = useTranslation();
  const { nodes, fetchNodes } = useNodeStore();
  const {
    sessions,
    currentSessionId,
    selectedNodeId,
    config,
    streaming,
    createSession,
    selectSession,
    setSelectedNodeId,
    setConfig,
    addUserMessage,
    appendChunk,
    finishStream,
    clearCurrentSession,
  } = usePlaygroundStore();

  const [input, setInput] = useState('');

  useEffect(() => {
    fetchNodes();
    if (!currentSessionId) {
      createSession();
    }
  }, [fetchNodes, createSession, currentSessionId]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const lastAgentMessage = [...(currentSession?.messages ?? [])]
    .reverse()
    .find((message) => message.role === 'agent');

  const handleSend = async () => {
    if (!input.trim() || !selectedNodeId) {
      message.warning('请选择节点并输入消息');
      return;
    }

    const messageText = input;
    addUserMessage(messageText);
    setInput('');

    const startTime = Date.now();
    try {
      for await (const chunk of streamNodeTask(
        selectedNodeId,
        {
          type: 'chat',
          input: { message: messageText },
        },
        {
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
          enabledTools: config.enabledToolIds,
        }
      )) {
        appendChunk(chunk);
      }
      finishStream({ duration: Date.now() - startTime, model: config.model });
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      finishStream();
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex gap-4">
      <Card className="w-64 flex flex-col" title="会话与配置">
        <Button type="primary" block className="mb-4" onClick={createSession}>
          新会话
        </Button>
        <List
          size="small"
          dataSource={sessions}
          renderItem={(session) => (
            <List.Item
              className={`cursor-pointer ${session.id === currentSessionId ? 'bg-blue-50' : ''}`}
              onClick={() => selectSession(session.id)}
            >
              {session.title}
            </List.Item>
          )}
        />
        <div className="mt-4 space-y-4">
          <div>
            <Typography.Text type="secondary">选择节点</Typography.Text>
            <Select
              className="w-full"
              placeholder="选择节点"
              value={selectedNodeId}
              onChange={(value) => setSelectedNodeId(value)}
            >
              {nodes.map((node) => (
                <Option key={node.id} value={node.id}>
                  {node.name}
                </Option>
              ))}
            </Select>
          </div>
          <div>
            <Typography.Text type="secondary">模型</Typography.Text>
            <Input value={config.model} onChange={(e) => setConfig({ model: e.target.value })} />
          </div>
          <div>
            <Typography.Text type="secondary">Temperature</Typography.Text>
            <Slider
              min={0}
              max={2}
              step={0.1}
              value={config.temperature}
              onChange={(value) => setConfig({ temperature: value })}
            />
          </div>
          <div>
            <Typography.Text type="secondary">Max Tokens</Typography.Text>
            <Input
              type="number"
              value={config.maxTokens}
              onChange={(e) => setConfig({ maxTokens: Number(e.target.value) })}
            />
          </div>
        </div>
      </Card>

      <Card className="flex-1 flex flex-col" title={t('playground')}>
        <div className="flex-1 overflow-y-auto space-y-4 p-2">
          {currentSession?.messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <Space align="start">
                {msg.role === 'agent' && <Avatar icon={<RobotOutlined />} />}
                <div className={`max-w-lg p-3 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}>
                  {msg.role === 'user' ? (
                    <Typography.Text className="!text-white">{msg.content}</Typography.Text>
                  ) : (
                    <MarkdownMessage content={msg.content} />
                  )}
                </div>
                {msg.role === 'user' && <Avatar icon={<UserOutlined />} />}
              </Space>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入消息..."
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
          <Button type="primary" loading={streaming} onClick={handleSend}>
            发送
          </Button>
          <Button icon={<DeleteOutlined />} onClick={clearCurrentSession}>
            清空
          </Button>
        </div>
      </Card>

      <Card className="w-72" title="统计与调用链">
        <CallTracePanel
          traces={lastAgentMessage?.traces ?? []}
          duration={lastAgentMessage?.duration}
          model={lastAgentMessage?.model ?? config.model}
        />
        <div className="mt-4">
          <Typography.Text strong>Mock 工具</Typography.Text>
          <div className="text-sm text-gray-500 mt-2">暂不支持动态 Mock 工具</div>
        </div>
      </Card>
    </div>
  );
}
