import { useEffect } from 'react';
import { Card, Row, Col, Statistic, Button, List, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNodeStore } from '../store/nodeStore.js';
import { useCapabilityStore } from '../store/capabilityStore.js';
import { useTemplateStore } from '../store/templateStore.js';
import { useMonitorStore } from '../store/monitorStore.js';

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { nodes, fetchNodes } = useNodeStore();
  const { capabilities, fetchList: fetchCapabilities } = useCapabilityStore();
  const { templates, fetchList: fetchTemplates } = useTemplateStore();
  const { events, fetchMetrics } = useMonitorStore();

  useEffect(() => {
    fetchNodes();
    fetchCapabilities();
    fetchTemplates();
    fetchMetrics();
  }, [fetchNodes, fetchCapabilities, fetchTemplates, fetchMetrics]);

  const onlineCount = nodes.filter((node) => node.status === 'online').length;

  return (
    <div>
      <Typography.Title level={2}>{t('home')}</Typography.Title>
      <Row gutter={16} className="mb-6">
        <Col span={8}>
          <Card>
            <Statistic title={t('nodes')} value={nodes.length} suffix={`/ ${onlineCount} 在线`} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title={t('capabilities')} value={capabilities.length} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title={t('clientAgents')} value={templates.length} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} className="mb-6">
        <Col span={24}>
          <Card
            title="快捷操作"
            actions={[
              <Button key="create" type="primary" onClick={() => navigate('/client-agents/create')}>
                创建 ClientAgent
              </Button>,
              <Button key="nodes" onClick={() => navigate('/nodes')}>查看节点</Button>,
              <Button key="playground" onClick={() => navigate('/playground')}>打开调试台</Button>,
            ]}
          >
            <Typography.Text type="secondary">选择上方操作开始管理 Agent 与能力。</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card title="近期事件">
            <List
              dataSource={events.slice(0, 10)}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text code>{item.type}</Typography.Text>{' '}
                  <Typography.Text type="secondary">{item.nodeId}</Typography.Text>{' '}
                  {item.summary}
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
