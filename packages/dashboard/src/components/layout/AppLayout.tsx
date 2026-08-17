import { Layout } from 'antd';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthGuard } from './AuthGuard';
import { Outlet } from 'react-router-dom';
import { useDashboardWebSocket } from '../../hooks/useWebSocket.js';
import { ParticleBackground } from '../../components/Tech/ParticleBackground.js';

const { Content } = Layout;

export function AppLayout() {
  useDashboardWebSocket();

  return (
    <AuthGuard>
      <div className="tech-gradient-bg" />
      <ParticleBackground />
      <Layout style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <Sidebar />
        <Layout>
          <Header />
          <Content style={{ padding: 24, position: 'relative', zIndex: 1 }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </AuthGuard>
  );
}
