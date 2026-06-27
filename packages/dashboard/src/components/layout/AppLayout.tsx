import { Layout } from 'antd';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AuthGuard } from './AuthGuard';
import { Outlet } from 'react-router-dom';
import { useDashboardWebSocket } from '../../hooks/useWebSocket.js';

const { Content } = Layout;

export function AppLayout() {
  useDashboardWebSocket();

  return (
    <AuthGuard>
      <Layout style={{ minHeight: '100vh' }}>
        <Sidebar />
        <Layout>
          <Header />
          <Content style={{ padding: 24 }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </AuthGuard>
  );
}
