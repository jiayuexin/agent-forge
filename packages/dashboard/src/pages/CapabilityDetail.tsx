import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Descriptions, Tag, Typography, Spin, Table, Button, message } from 'antd';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { useCapabilityStore } from '../store/capabilityStore.js';
import { CapabilityTypeTag } from '../components/common/CapabilityTypeTag.js';
import { RiskTag } from '../components/common/RiskTag.js';
import type { Capability } from '@agentforge/types';

export function CapabilityDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { fetchDetail, fetchVersions, versions, update } = useCapabilityStore();
  const [capability, setCapability] = useState<Capability | null>(null);
  const [loading, setLoading] = useState(false);
  const [editorValue, setEditorValue] = useState('');

  useEffect(() => {
    if (id) {
      setLoading(true);
      fetchDetail(id)
        .then((cap) => {
          setCapability(cap);
          setEditorValue(JSON.stringify(cap, null, 2));
        })
        .finally(() => setLoading(false));
      fetchVersions(id);
    }
  }, [id, fetchDetail, fetchVersions]);

  const handleSave = async () => {
    if (!id || !capability) return;
    try {
      const updated = JSON.parse(editorValue) as Capability;
      await update(id, updated);
      message.success('能力已更新');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'JSON 格式错误');
    }
  };

  if (loading || !capability) {
    return <Spin tip={t('loading')} />;
  }

  const versionList = (id && versions[id]) || [];

  return (
    <div>
      <Typography.Title level={2}>{capability.name}</Typography.Title>
      <Descriptions bordered>
        <Descriptions.Item label="ID">{capability.id}</Descriptions.Item>
        <Descriptions.Item label="类型">
          <CapabilityTypeTag type={capability.type} />
        </Descriptions.Item>
        <Descriptions.Item label="风险等级">
          <RiskTag level={capability.riskLevel} />
        </Descriptions.Item>
        <Descriptions.Item label="版本">{capability.version || '-'}</Descriptions.Item>
        <Descriptions.Item label="描述" span={3}>
          {capability.description}
        </Descriptions.Item>
        <Descriptions.Item label="标签" span={3}>
          {capability.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </Descriptions.Item>
      </Descriptions>

      <Card title="JSON 定义" className="mt-6" extra={<Button type="primary" onClick={handleSave}>{t('save')}</Button>}>
        <Editor
          height={400}
          language="json"
          value={editorValue}
          onChange={(value) => setEditorValue(value || '')}
          options={{ minimap: { enabled: false } }}
        />
      </Card>

      <Card title="版本历史" className="mt-6">
        <Table
          rowKey="version"
          dataSource={versionList}
          columns={[
            { title: '版本', dataIndex: 'version' },
            { title: '名称', dataIndex: 'name' },
            { title: '描述', dataIndex: 'description' },
          ]}
        />
      </Card>
    </div>
  );
}
