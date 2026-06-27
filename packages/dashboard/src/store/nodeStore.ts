import { create } from 'zustand';
import type { AgentNode, AgentNodeStatus } from '@agentforge/types';
import { listNodes, unregisterNode, updateNodeConfig } from '../api/nodes.js';
import type { NodeConfigUpdateRequest } from '@agentforge/types';

interface NodeState {
  nodes: AgentNode[];
  loading: boolean;
  error: string | null;
  fetchNodes: () => Promise<void>;
  updateNodeStatus: (nodeId: string, status: AgentNodeStatus) => void;
  updateNode: (node: AgentNode) => void;
  removeNode: (nodeId: string) => void;
  unregister: (nodeId: string) => Promise<void>;
  updateConfig: (nodeId: string, request: NodeConfigUpdateRequest) => Promise<void>;
}

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: [],
  loading: false,
  error: null,

  fetchNodes: async () => {
    set({ loading: true, error: null });
    try {
      const nodes = await listNodes();
      set({ nodes, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  },

  updateNodeStatus: (nodeId, status) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, status, lastHeartbeat: Date.now() } : node
      ),
    }));
  },

  updateNode: (node) => {
    set((state) => {
      const exists = state.nodes.some((n) => n.id === node.id);
      if (exists) {
        return { nodes: state.nodes.map((n) => (n.id === node.id ? node : n)) };
      }
      return { nodes: [...state.nodes, node] };
    });
  },

  removeNode: (nodeId) => {
    set((state) => ({ nodes: state.nodes.filter((node) => node.id !== nodeId) }));
  },

  unregister: async (nodeId) => {
    await unregisterNode(nodeId);
    get().removeNode(nodeId);
  },

  updateConfig: async (nodeId, request) => {
    await updateNodeConfig(nodeId, request);
    await get().fetchNodes();
  },
}));
