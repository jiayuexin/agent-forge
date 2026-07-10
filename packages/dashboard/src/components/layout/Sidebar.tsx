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

  const selectedKey =
    menuItems.find((item) =>
      item.key === '/' ? location.pathname === '/' : location.pathname.startsWith(item.key)
    )?.key ?? '/';

  return (
    <Sider theme="dark" collapsible defaultCollapsed={false} width={240}>
      <div className="h-16 flex items-center justify-center border-b border-[var(--tech-border)]">
        <span className="font-['Orbitron'] font-bold text-[var(--tech-primary)] text-xl glow-text tracking-wider">
          AGENT<span className="text-[var(--tech-secondary)]">FORGE</span>
        </span>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: <span className="font-medium">{t(item.label)}</span>,
          onClick: () => navigate(item.key),
        }))}
      />
    </Sider>
  );
}
