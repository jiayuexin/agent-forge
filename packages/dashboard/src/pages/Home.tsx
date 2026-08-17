import { useEffect } from 'react';
import { Row, Col, Button, List } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useNodeStore } from '../store/nodeStore.js';
import { useCapabilityStore } from '../store/capabilityStore.js';
import { useGeneratedAgentStore } from '../store/generatedAgentStore.js';
import { useMonitorStore } from '../store/monitorStore.js';
import { AnimatedNumber } from '../components/Tech/AnimatedNumber.js';

export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { nodes, fetchNodes } = useNodeStore();
  const { capabilities, fetchList: fetchCapabilities } = useCapabilityStore();
  const { agents, fetchList: fetchAgents } = useGeneratedAgentStore();
  const { events, fetchMetrics } = useMonitorStore();

  useEffect(() => {
    fetchNodes();
    fetchCapabilities();
    fetchAgents();
    fetchMetrics();
  }, [fetchNodes, fetchCapabilities, fetchAgents, fetchMetrics]);

  const onlineCount = nodes.filter((node) => node.status === 'online').length;

  const stats = [
    {
      label: t('nodes'),
      value: nodes.length,
      subValue: `${onlineCount} online`,
      color: '#6366f1',
      gradient: 'from-indigo-500 to-purple-600',
    },
    {
      label: t('capabilities'),
      value: capabilities.length,
      subValue: 'active capabilities',
      color: '#06b6d4',
      gradient: 'from-cyan-500 to-blue-600',
    },
    {
      label: t('clientAgents'),
      value: agents.length,
      subValue: 'generated agents',
      color: '#f59e0b',
      gradient: 'from-amber-500 to-orange-600',
    },
  ];

  return (
    <div className="relative z-10">
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-['Orbitron'] glow-text mb-2">AgentForge</h1>
        <p className="text-[var(--tech-text-muted)] text-lg">
          Next-Gen AI Agent Orchestration Platform
        </p>
      </div>

      <Row gutter={[24, 24]} className="mb-8">
        {stats.map((stat, index) => (
          <Col span={8} key={index}>
            <div className="glass-card p-6 tech-border">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[var(--tech-text-muted)] uppercase tracking-wider">
                  {stat.label}
                </span>
                <div
                  className="w-3 h-3 rounded-full animate-pulse"
                  style={{ backgroundColor: stat.color, boxShadow: `0 0 10px ${stat.color}` }}
                />
              </div>
              <div className="text-5xl font-bold mb-2">
                <AnimatedNumber value={stat.value} />
              </div>
              <div
                className={`text-sm bg-gradient-to-r ${stat.gradient} bg-clip-text text-transparent font-semibold`}
              >
                {stat.subValue}
              </div>
            </div>
          </Col>
        ))}
      </Row>

      <Row gutter={[24, 24]} className="mb-8">
        <Col span={24}>
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-['Orbitron'] font-semibold glow-text">
                // QUICK_ACTIONS
              </h2>
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-[var(--tech-primary)] animate-pulse" />
                <div
                  className="w-2 h-2 rounded-full bg-[var(--tech-secondary)] animate-pulse"
                  style={{ animationDelay: '100ms' }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-[var(--tech-accent)] animate-pulse"
                  style={{ animationDelay: '200ms' }}
                />
              </div>
            </div>
            <div className="flex gap-4 flex-wrap">
              <Button type="primary" size="large" onClick={() => navigate('/client-agents/create')}>
                Create Agent
              </Button>
              <Button size="large" onClick={() => navigate('/nodes')}>
                View Nodes
              </Button>
              <Button size="large" onClick={() => navigate('/playground')}>
                Open Playground
              </Button>
            </div>
          </div>
        </Col>
      </Row>

      <Row gutter={[24, 24]}>
        <Col span={24}>
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-['Orbitron'] font-semibold glow-cyan">
                // RECENT_EVENTS
              </h2>
              <span className="text-xs text-[var(--tech-text-muted)] font-mono">LIVE_FEED</span>
            </div>
            <List
              dataSource={events.slice(0, 10)}
              renderItem={(item, index) => (
                <List.Item className="!py-3 !border-b-[var(--tech-border)]">
                  <div className="flex items-center gap-4 w-full">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full bg-[var(--tech-primary)] animate-pulse" />
                      {index < events.slice(0, 10).length - 1 && (
                        <div className="w-px h-8 bg-[var(--tech-border)]" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <code className="text-xs font-mono">{item.type}</code>
                        <span className="text-xs text-[var(--tech-text-muted)]">{item.nodeId}</span>
                      </div>
                      <p className="text-sm text-[var(--tech-text)]">{item.summary}</p>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </div>
        </Col>
      </Row>
    </div>
  );
}
