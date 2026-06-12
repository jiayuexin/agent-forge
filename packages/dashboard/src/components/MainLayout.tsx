import { useState } from 'react';
import { Layout, Menu } from 'antd';
import {
  HomeOutlined,
  RobotOutlined,
  PlusCircleOutlined,
  BugOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';

const { Sider, Header, Content } = Layout;

const menuItems = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/agents', icon: <RobotOutlined />, label: 'Agent 列表' },
  { key: '/create', icon: <PlusCircleOutlined />, label: '创建 Agent' },
  { key: '/playground', icon: <BugOutlined />, label: '调试台' },
  { key: '/monitor', icon: <DashboardOutlined />, label: '监控' },
];

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout className="min-h-screen">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="light"
        className="border-r border-gray-200"
      >
        <div className="h-16 flex items-center justify-center border-b border-gray-100">
          <RobotOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          {!collapsed && (
            <span className="ml-2 text-lg font-bold text-gray-800">AgentForge</span>
          )}
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="border-none"
        />
      </Sider>
      <Layout>
        <Header className="bg-white border-b border-gray-200 px-6 flex items-center">
          <h1 className="text-lg font-semibold text-gray-800 m-0">AgentForge Dashboard</h1>
        </Header>
        <Content className="p-6 bg-gray-50 min-h-[calc(100vh-64px)]">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
