import { create } from 'zustand';
import api from '../api/client';

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  version: string;
  status: string;
  capabilities: string[];
  model: string;
  templateId: string;
  createdAt?: string;
}

interface AppState {
  agents: AgentInfo[];
  loading: boolean;
  selectedAgent: AgentInfo | null;
  fetchAgents: () => Promise<void>;
  createAgent: (description: string, options?: Record<string, unknown>) => Promise<void>;
  setSelectedAgent: (agent: AgentInfo | null) => void;
}

export const useStore = create<AppState>((set) => ({
  agents: [],
  loading: false,
  selectedAgent: null,

  fetchAgents: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/agents');
      set({ agents: res.data, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createAgent: async (description, options) => {
    set({ loading: true });
    try {
      await api.post('/agents', { description, ...options });
      set({ loading: false });
    } catch {
      set({ loading: false });
    }
  },

  setSelectedAgent: (agent) => set({ selectedAgent: agent }),
}));
