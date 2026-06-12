import { Card, Col, Row, Statistic, Button, Typography, List, Tag } from 'antd';
import {
  RobotOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  PlusCircleOutlined,
  BugOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

const { Title } = Typography;

const recentActivities = [
  { key: '1', agent: '客服助手', action: '执行完成', time: '2 分钟前', status: 'success' },
  { key: '2', agent: '代码审查', action: '工具调用', time: '5 分钟前', status: 'processing' },
  { key: '3', agent: '数据分析', action: '创建成功', time: '15 分钟前', status: 'success' },
  { key: '4', agent: '销售助手', action: '执行超时', time: '30 分钟前', status: 'error' },
  { key: '5', agent: '内容生成', action: '执行完成', time: '1 小时前', status: 'success' },
];

const statusColors: Record<string, string> = {
  success: 'green',
  processing: 'blue',
  error: 'red',
};

export default function HomePage() {
  const navigate = useNavigate();
  const { agents } = useStore();

  return (
    <div>
      <Title level={4} className="mb-6">仪表盘概览</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已生成 Agent 数"
              value={agents.length || 12}
              prefix={<RobotOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日执行数"
              value={1284}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均延迟"
              value={1.85}
              suffix="s"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Token 消耗"
              value={456000}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} className="mt-6">
        <Col xs={24} md={16}>
          <Card title="快速操作">
            <div className="flex gap-4">
              <Button
                type="primary"
                size="large"
                icon={<PlusCircleOutlined />}
                onClick={() => navigate('/create')}
              >
                创建 Agent
              </Button>
              <Button
                size="large"
                icon={<BugOutlined />}
                onClick={() => navigate('/playground')}
              >
                打开调试台
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="系统状态">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span>API 服务</span>
                <Tag color="green">正常</Tag>
              </div>
              <div className="flex justify-between">
                <span>WebSocket</span>
                <Tag color="green">已连接</Tag>
              </div>
              <div className="flex justify-between">
                <span>Agent 节点</span>
                <Tag color="blue">3 在线</Tag>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="近期活动" className="mt-6">
        <List
          dataSource={recentActivities}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <span>
                    {item.agent} <Tag color={statusColors[item.status]}>{item.action}</Tag>
                  </span>
                }
                description={item.time}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
