import { create } from 'zustand';
import type { Capability, CapabilityAckPayload, DistributeCapabilityRequest } from '@agentforge/types';
import {
  listCapabilities,
  getCapability,
  createCapability,
  updateCapability,
  deleteCapability,
  listCapabilityVersions,
  distributeCapability,
} from '../api/capabilities.js';

interface CapabilityState {
  capabilities: Capability[];
  versions: Record<string, Capability[]>;
  loading: boolean;
  error: string | null;
  fetchList: () => Promise<void>;
  fetchDetail: (id: string) => Promise<Capability>;
  create: (capability: Capability) => Promise<void>;
  update: (id: string, capability: Capability) => Promise<void>;
  remove: (id: string) => Promise<void>;
  fetchVersions: (id: string) => Promise<void>;
  distribute: (id: string, request: DistributeCapabilityRequest) => Promise<Record<string, CapabilityAckPayload>>;
}

export const useCapabilityStore = create<CapabilityState>((set, get) => ({
  capabilities: [],
  versions: {},
  loading: false,
  error: null,

  fetchList: async () => {
    set({ loading: true, error: null });
    try {
      const capabilities = await listCapabilities();
      set({ capabilities, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },

  fetchDetail: async (id) => {
    return getCapability(id);
  },

  create: async (capability) => {
    await createCapability(capability);
    await get().fetchList();
  },

  update: async (id, capability) => {
    await updateCapability(id, capability);
    await get().fetchList();
  },

  remove: async (id) => {
    await deleteCapability(id);
    await get().fetchList();
  },

  fetchVersions: async (id) => {
    const versions = await listCapabilityVersions(id);
    set((state) => ({ versions: { ...state.versions, [id]: versions } }));
  },

  distribute: async (id, request) => {
    const result = await distributeCapability(id, request);
    await get().fetchList();
    return result;
  },
}));
