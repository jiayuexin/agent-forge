import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import MainLayout from './components/MainLayout';
import HomePage from './pages/HomePage';
import AgentListPage from './pages/AgentListPage';
import AgentCreatePage from './pages/AgentCreatePage';
import PlaygroundPage from './pages/PlaygroundPage';
import MonitorPage from './pages/MonitorPage';

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ algorithm: theme.defaultAlgorithm }}>
      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/agents" element={<AgentListPage />} />
            <Route path="/create" element={<AgentCreatePage />} />
            <Route path="/playground" element={<PlaygroundPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </ConfigProvider>
  );
}
