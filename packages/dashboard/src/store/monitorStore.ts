import { create } from 'zustand';
import type { AgentMessage } from '@agentforge/types';
import { getMetrics } from '../api/metrics.js';

interface MonitorEvent {
  id: string;
  type: string;
  nodeId: string;
  summary: string;
  timestamp: number;
}

interface MonitorState {
  metricsText: string;
  events: MonitorEvent[];
  loading: boolean;
  error: string | null;
  fetchMetrics: () => Promise<void>;
  appendEvent: (nodeId: string, message: AgentMessage) => void;
  clearEvents: () => void;
}

export const useMonitorStore = create<MonitorState>((set) => ({
  metricsText: '',
  events: [],
  loading: false,
  error: null,

  fetchMetrics: async () => {
    set({ loading: true, error: null });
    try {
      const metricsText = await getMetrics();
      set({ metricsText, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },

  appendEvent: (nodeId, message) => {
    const event: MonitorEvent = {
      id: `${nodeId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: message.type,
      nodeId,
      summary: JSON.stringify(message.payload).slice(0, 200),
      timestamp: message.timestamp ?? Date.now(),
    };
    set((state) => ({ events: [event, ...state.events].slice(0, 200) }));
  },

  clearEvents: () => set({ events: [] }),
}));
