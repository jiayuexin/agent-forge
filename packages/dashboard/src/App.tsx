import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { Home } from './pages/Home';
import { ClientAgentList } from './pages/ClientAgentList';
import { ClientAgentCreate } from './pages/ClientAgentCreate';
import { ClientAgentDetail } from './pages/ClientAgentDetail';
import { NodeList } from './pages/NodeList';
import { NodeDetail } from './pages/NodeDetail';
import { NodeChat } from './pages/NodeChat';
import { CapabilityList } from './pages/CapabilityList';
import { CapabilityMarket } from './pages/CapabilityMarket';
import { CapabilityDetail } from './pages/CapabilityDetail';
import { CapabilityDistribute } from './pages/CapabilityDistribute';
import { Playground } from './pages/Playground';
import { Monitor } from './pages/Monitor';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="client-agents" element={<ClientAgentList />} />
        <Route path="client-agents/create" element={<ClientAgentCreate />} />
        <Route path="client-agents/:id" element={<ClientAgentDetail />} />
        <Route path="nodes" element={<NodeList />} />
        <Route path="nodes/:id" element={<NodeDetail />} />
        <Route path="nodes/:id/chat" element={<NodeChat />} />
        <Route path="capabilities" element={<CapabilityList />} />
        <Route path="capabilities/market" element={<CapabilityMarket />} />
        <Route path="capabilities/:id" element={<CapabilityDetail />} />
        <Route path="capabilities/:id/distribute" element={<CapabilityDistribute />} />
        <Route path="playground" element={<Playground />} />
        <Route path="monitor" element={<Monitor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
