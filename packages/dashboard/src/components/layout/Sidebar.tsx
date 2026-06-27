import { Layout, Menu } from 'antd';
import {
  HomeOutlined,
  RobotOutlined,
  ClusterOutlined,
  AppstoreOutlined,
  CodeOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Sider } = Layout;

const menuItems = [
  { key: '/', icon: <HomeOutlined />, label: 'home' },
  { key: '/client-agents', icon: <RobotOutlined />, label: 'clientAgents' },
  { key: '/nodes', icon: <ClusterOutlined />, label: 'nodes' },
  { key: '/capabilities', icon: <AppstoreOutlined />, label: 'capabilities' },
  { key: '/playground', icon: <CodeOutlined />, label: 'playground' },
  { key: '/monitor', icon: <DashboardOutlined />, label: 'monitor' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const selectedKey = menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/';

  return (
    <Sider theme="dark" collapsible defaultCollapsed={false}>
      <div className="h-12 flex items-center justify-center text-white font-bold">
        AgentForge
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: t(item.label),
          onClick: () => navigate(item.key),
        }))}
      />
    </Sider>
  );
}
