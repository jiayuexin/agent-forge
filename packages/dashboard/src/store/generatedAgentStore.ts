import { create } from 'zustand';
import type {
  CreateClientAgentRequest,
  GeneratedClientAgentDetail,
  GeneratedClientAgentListItem,
} from '@agentforge/types';
import {
  createGeneratedClientAgent,
  getGeneratedClientAgent,
  listGeneratedClientAgents,
} from '../api/client-agents.js';

interface GeneratedAgentState {
  agents: GeneratedClientAgentListItem[];
  currentAgent: GeneratedClientAgentDetail | null;
  loading: boolean;
  fetchList: () => Promise<void>;
  fetchDetail: (id: string) => Promise<void>;
  create: (request: CreateClientAgentRequest) => Promise<GeneratedClientAgentDetail>;
}

export const useGeneratedAgentStore = create<GeneratedAgentState>((set) => ({
  agents: [],
  currentAgent: null,
  loading: false,

  fetchList: async () => {
    set({ loading: true });
    try {
      const agents = await listGeneratedClientAgents();
      set({ agents });
    } finally {
      set({ loading: false });
    }
  },

  fetchDetail: async (id) => {
    set({ loading: true });
    try {
      const currentAgent = await getGeneratedClientAgent(id);
      set({ currentAgent });
    } finally {
      set({ loading: false });
    }
  },

  create: async (request) => {
    const agent = await createGeneratedClientAgent(request);
    set((state) => ({ agents: [agent, ...state.agents] }));
    return agent;
  },
}));
