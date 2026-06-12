import { useEffect, useRef, useState } from 'react';
import { Card, Table, Tag, Typography, Row, Col } from 'antd';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

const { Title } = Typography;

interface AgentNode {
  key: string;
  name: string;
  url: string;
  status: 'alive' | 'dead' | 'paused';
  lastHeartbeat: string;
  agents: number;
  executions: number;
}

const placeholderNodes: AgentNode[] = [
  { key: '1', name: '节点 1', url: '192.168.1.10:3001', status: 'alive', lastHeartbeat: '5 秒前', agents: 3, executions: 128 },
  { key: '2', name: '节点 2', url: '192.168.1.11:3001', status: 'alive', lastHeartbeat: '12 秒前', agents: 2, executions: 89 },
  { key: '3', name: '节点 3', url: '192.168.1.12:3001', status: 'dead', lastHeartbeat: '45 秒前', agents: 0, executions: 0 },
];

const nodeColumns = [
  { title: '名称', dataIndex: 'name', key: 'name', render: (t: string) => <strong>{t}</strong> },
  { title: '地址', dataIndex: 'url', key: 'url' },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    render: (status: string) => {
      const map: Record<string, { color: string; label: string }> = {
        alive: { color: 'green', label: '在线' },
        dead: { color: 'red', label: '离线' },
        paused: { color: 'orange', label: '暂停' },
      };
      const info = map[status] || { color: 'default', label: status };
      return <Tag color={info.color}>{info.label}</Tag>;
    },
  },
  { title: '最近心跳', dataIndex: 'lastHeartbeat', key: 'lastHeartbeat' },
  { title: 'Agent 数', dataIndex: 'agents', key: 'agents' },
  { title: '今日执行', dataIndex: 'executions', key: 'executions' },
];

function generateTimeLabels(count: number): string[] {
  const now = new Date();
  const labels: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 5 * 60 * 1000);
    labels.push(`${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}`);
  }
  return labels;
}

function generateData(count: number, min: number, max: number): number[] {
  return Array.from({ length: count }, () => Math.floor(Math.random() * (max - min) + min));
}

const timeLabels = generateTimeLabels(24);

const qpsOption: EChartsOption = {
  title: { text: 'QPS 趋势', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  xAxis: { type: 'category', data: timeLabels, boundaryGap: false },
  yAxis: { type: 'value', name: 'req/s' },
  series: [
    {
      name: 'QPS',
      type: 'line',
      smooth: true,
      data: generateData(24, 10, 80),
      areaStyle: { opacity: 0.15 },
      lineStyle: { width: 2, color: '#1677ff' },
      itemStyle: { color: '#1677ff' },
    },
  ],
  grid: { left: 50, right: 20, bottom: 30, top: 40 },
};

const latencyOption: EChartsOption = {
  title: { text: '延迟百分位', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  legend: { data: ['P50', 'P95', 'P99'], top: 25 },
  xAxis: { type: 'category', data: timeLabels, boundaryGap: false },
  yAxis: { type: 'value', name: 'ms' },
  series: [
    {
      name: 'P50',
      type: 'line',
      smooth: true,
      data: generateData(24, 500, 1200),
      lineStyle: { width: 2, color: '#52c41a' },
      itemStyle: { color: '#52c41a' },
    },
    {
      name: 'P95',
      type: 'line',
      smooth: true,
      data: generateData(24, 1500, 3000),
      lineStyle: { width: 2, color: '#faad14' },
      itemStyle: { color: '#faad14' },
    },
    {
      name: 'P99',
      type: 'line',
      smooth: true,
      data: generateData(24, 3000, 5500),
      lineStyle: { width: 2, color: '#ff4d4f' },
      itemStyle: { color: '#ff4d4f' },
    },
  ],
  grid: { left: 50, right: 20, bottom: 30, top: 55 },
};

const tokenOption: EChartsOption = {
  title: { text: 'Token 消耗趋势', left: 'center', textStyle: { fontSize: 14 } },
  tooltip: { trigger: 'axis' },
  legend: { data: ['客服Agent', '销售Agent', '数据Agent'], top: 25 },
  xAxis: { type: 'category', data: timeLabels, boundaryGap: false },
  yAxis: { type: 'value', name: 'tokens' },
  series: [
    {
      name: '客服Agent',
      type: 'line',
      smooth: true,
      stack: 'total',
      data: generateData(24, 5000, 15000),
      areaStyle: { opacity: 0.3 },
      lineStyle: { width: 1.5, color: '#1677ff' },
      itemStyle: { color: '#1677ff' },
    },
    {
      name: '销售Agent',
      type: 'line',
      smooth: true,
      stack: 'total',
      data: generateData(24, 3000, 10000),
      areaStyle: { opacity: 0.3 },
      lineStyle: { width: 1.5, color: '#52c41a' },
      itemStyle: { color: '#52c41a' },
    },
    {
      name: '数据Agent',
      type: 'line',
      smooth: true,
      stack: 'total',
      data: generateData(24, 2000, 8000),
      areaStyle: { opacity: 0.3 },
      lineStyle: { width: 1.5, color: '#722ed1' },
      itemStyle: { color: '#722ed1' },
    },
  ],
  grid: { left: 50, right: 20, bottom: 30, top: 55 },
};

export default function MonitorPage() {
  const [nodes] = useState<AgentNode[]>(placeholderNodes);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Attempt WebSocket connection (gracefully fail if backend not running)
    try {
      const ws = new WebSocket(
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/events`,
      );
      ws.onerror = () => { /* ignore connection errors */ };
      wsRef.current = ws;
      return () => {
        ws.close();
      };
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div>
      <Title level={4} className="mb-6">监控面板</Title>

      <Card title="Agent 节点状态" className="mb-6">
        <Table
          dataSource={nodes}
          columns={nodeColumns}
          pagination={false}
          size="middle"
        />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card>
            <ReactECharts option={qpsOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <ReactECharts option={latencyOption} style={{ height: 280 }} />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card>
            <ReactECharts option={tokenOption} style={{ height: 280 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
