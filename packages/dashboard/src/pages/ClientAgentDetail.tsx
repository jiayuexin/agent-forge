import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Descriptions, Tag, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useGeneratedAgentStore } from '../store/generatedAgentStore.js';

export function ClientAgentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { currentAgent, loading, fetchDetail } = useGeneratedAgentStore();

  useEffect(() => {
    if (id) {
      fetchDetail(id);
    }
  }, [id, fetchDetail]);

  if (loading || !currentAgent) {
    return <Spin tip={t('loading')} />;
  }

  return (
    <div>
      <Typography.Title level={2}>{currentAgent.displayName}</Typography.Title>
      <Descriptions bordered>
        <Descriptions.Item label="ID">{currentAgent.id}</Descriptions.Item>
        <Descriptions.Item label="目录名">{currentAgent.name}</Descriptions.Item>
        <Descriptions.Item label="模板">{currentAgent.templateId}</Descriptions.Item>
        <Descriptions.Item label="模型">{currentAgent.model ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="风险等级">
          <Tag color={currentAgent.riskLevel === 'high' ? 'red' : 'blue'}>
            {currentAgent.riskLevel}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="输出目录" span={3}>
          {currentAgent.outputDir}
        </Descriptions.Item>
        <Descriptions.Item label="描述" span={3}>
          {currentAgent.description}
        </Descriptions.Item>
        <Descriptions.Item label="创建时间" span={3}>
          {new Date(currentAgent.createdAt).toLocaleString()}
        </Descriptions.Item>
      </Descriptions>

      <Card title="System Prompt" className="mt-6">
        <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded">
          {currentAgent.systemPrompt}
        </pre>
      </Card>
    </div>
  );
}
