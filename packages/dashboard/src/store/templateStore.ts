import { create } from 'zustand';
import type { ClientAgentTemplateListItem } from '@agentforge/types';
import { listTemplates, getTemplate, type ClientAgentTemplateDetail } from '../api/templates.js';

interface TemplateState {
  templates: ClientAgentTemplateListItem[];
  currentTemplate: ClientAgentTemplateDetail | null;
  loading: boolean;
  error: string | null;
  fetchList: () => Promise<void>;
  fetchDetail: (id: string) => Promise<void>;
}

export const useTemplateStore = create<TemplateState>((set) => ({
  templates: [],
  currentTemplate: null,
  loading: false,
  error: null,

  fetchList: async () => {
    set({ loading: true, error: null });
    try {
      const templates = await listTemplates();
      set({ templates, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },

  fetchDetail: async (id) => {
    set({ loading: true, error: null });
    try {
      const template = await getTemplate(id);
      set({ currentTemplate: template, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },
}));
