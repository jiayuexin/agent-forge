import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Descriptions, Tag, Spin, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useTemplateStore } from '../store/templateStore.js';

export function ClientAgentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { currentTemplate, loading, fetchDetail } = useTemplateStore();

  useEffect(() => {
    if (id) {
      fetchDetail(id);
    }
  }, [id, fetchDetail]);

  if (loading || !currentTemplate) {
    return <Spin tip={t('loading')} />;
  }

  return (
    <div>
      <Typography.Title level={2}>{currentTemplate.displayName}</Typography.Title>
      <Descriptions bordered>
        <Descriptions.Item label="ID">{currentTemplate.id}</Descriptions.Item>
        <Descriptions.Item label="名称">{currentTemplate.name}</Descriptions.Item>
        <Descriptions.Item label="分类">{currentTemplate.category}</Descriptions.Item>
        <Descriptions.Item label="描述" span={3}>
          {currentTemplate.description}
        </Descriptions.Item>
        <Descriptions.Item label="标签" span={3}>
          {currentTemplate.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Descriptions.Item>
      </Descriptions>

      <Card title="System Prompt 预览" className="mt-6">
        <pre className="whitespace-pre-wrap bg-gray-50 p-4 rounded">
          {currentTemplate.systemPromptTemplate || '无预览内容'}
        </pre>
      </Card>

      <Card title="默认工具" className="mt-6">
        {(currentTemplate.defaultTools?.length ?? 0) > 0 ? (
          currentTemplate.defaultTools?.map((tool) => <Tag key={tool}>{tool}</Tag>)
        ) : (
          <Typography.Text type="secondary">未配置默认工具</Typography.Text>
        )}
      </Card>
    </div>
  );
}
