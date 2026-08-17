import { create } from 'zustand';
import type { AuditEvent } from '@agentforge/core';
import { listAuditEvents, type AuditListParams } from '../api/audit.js';

interface AuditState {
  items: AuditEvent[];
  total: number;
  loading: boolean;
  error: string | null;
  filters: AuditListParams;
  fetchList: (overrides?: AuditListParams) => Promise<void>;
  setFilters: (filters: AuditListParams) => void;
}

export const useAuditStore = create<AuditState>((set, get) => ({
  items: [],
  total: 0,
  loading: false,
  error: null,
  filters: { limit: 50, offset: 0 },

  setFilters: (filters) => {
    set({ filters: { ...get().filters, ...filters } });
  },

  fetchList: async (overrides = {}) => {
    const filters = { ...get().filters, ...overrides };
    set({ loading: true, error: null, filters });
    try {
      const params: AuditListParams = {
        limit: filters.limit,
        offset: filters.offset,
      };
      if (filters.action) params.action = filters.action;
      if (filters.from !== undefined) params.from = filters.from;
      if (filters.to !== undefined) params.to = filters.to;
      const result = await listAuditEvents(params);
      set({ items: result.items, total: result.total, loading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      });
    }
  },
}));
