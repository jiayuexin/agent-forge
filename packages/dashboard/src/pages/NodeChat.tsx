import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Input, Button, Space, Typography, Spin, Avatar, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { UserOutlined, RobotOutlined } from '@ant-design/icons';
import { useNodeStore } from '../store/nodeStore.js';
import { streamNodeTask } from '../api/nodes.js';
import type { AgentStreamChunk, CallTrace } from '@agentforge/types';
import { MarkdownMessage } from '../components/playground/MarkdownMessage.js';
import { buildCallTraces, buildStreamContent } from '../lib/callTrace.js';

const { TextArea } = Input;

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  chunks: AgentStreamChunk[];
  traces: CallTrace[];
  duration?: number;
  tokens?: { input: number; output: number; total: number };
  model?: string;
  timestamp: number;
}

export function NodeChat() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { nodes, fetchNodes } = useNodeStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const node = nodes.find((n) => n.id === id);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (!node) {
    return <Spin tip={t('loading')} />;
  }

  const handleSend = async () => {
    if (!input.trim()) return;

    const messageText = input;
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageText,
      chunks: [],
      traces: [],
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setStreaming(true);

    const startTime = Date.now();
    let agentMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'agent',
      content: '',
      chunks: [],
      traces: [],
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, agentMessage]);

    try {
      for await (const chunk of streamNodeTask(id!, {
        type: 'chat',
        input: { message: messageText },
      })) {
        const chunks = [...agentMessage.chunks, chunk];
        agentMessage = {
          ...agentMessage,
          chunks,
          content: buildStreamContent(agentMessage.chunks, chunk),
          traces: buildCallTraces(chunks),
        };
        setMessages((prev) => [...prev.slice(0, -1), agentMessage]);
      }
      agentMessage = {
        ...agentMessage,
        duration: Date.now() - startTime,
      };
      setMessages((prev) => [...prev.slice(0, -1), agentMessage]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      <Typography.Title level={2}>与 {node.name} 对话</Typography.Title>
      <Card className="flex-1 overflow-hidden flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-4 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <Space align="start">
                {msg.role === 'agent' && <Avatar icon={<RobotOutlined />} />}
                <div
                  className={`max-w-lg p-3 rounded-lg ${
                    msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <Typography.Text className="!text-white">{msg.content}</Typography.Text>
                  ) : (
                    <MarkdownMessage content={msg.content} />
                  )}
                  {msg.duration && (
                    <div className="text-xs opacity-70 mt-1">{msg.duration}ms</div>
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
        </div>
      </Card>
    </div>
  );
}
