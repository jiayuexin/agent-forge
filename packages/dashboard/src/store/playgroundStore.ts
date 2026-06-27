import { create } from 'zustand';
import type { AgentStreamChunk, CallTrace } from '@agentforge/types';
import { buildCallTraces, buildStreamContent } from '../lib/callTrace.js';

export interface PlaygroundSession {
  id: string;
  title: string;
  messages: PlaygroundMessage[];
  createdAt: number;
}

export interface PlaygroundMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  chunks: AgentStreamChunk[];
  traces: CallTrace[];
  duration?: number;
  tokens?: { input: number; output: number; total: number };
  model?: string;
  timestamp: number;
}

export interface PlaygroundConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  enabledToolIds: string[];
}

interface PlaygroundState {
  sessions: PlaygroundSession[];
  currentSessionId: string | null;
  selectedNodeId: string | null;
  config: PlaygroundConfig;
  streaming: boolean;
  createSession: () => void;
  selectSession: (id: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setConfig: (config: Partial<PlaygroundConfig>) => void;
  addUserMessage: (content: string) => void;
  appendChunk: (chunk: AgentStreamChunk) => void;
  finishStream: (meta?: { duration?: number; tokens?: { input: number; output: number; total: number }; model?: string }) => void;
  clearCurrentSession: () => void;
}

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  selectedNodeId: null,
  config: {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 2048,
    enabledToolIds: [],
  },
  streaming: false,

  createSession: () => {
    const session: PlaygroundSession = {
      id: `session-${Date.now()}`,
      title: `会话 ${get().sessions.length + 1}`,
      messages: [],
      createdAt: Date.now(),
    };
    set((state) => ({
      sessions: [session, ...state.sessions],
      currentSessionId: session.id,
    }));
  },

  selectSession: (id) => set({ currentSessionId: id }),

  setSelectedNodeId: (id) => set({ selectedNodeId: id }),

  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),

  addUserMessage: (content) => {
    const sessionId = get().currentSessionId;
    if (!sessionId) {
      get().createSession();
    }
    const message: PlaygroundMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      chunks: [],
      traces: [],
      timestamp: Date.now(),
    };
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === state.currentSessionId
          ? { ...session, messages: [...session.messages, message] }
          : session
      ),
      streaming: true,
    }));
  },

  appendChunk: (chunk) => {
    set((state) => ({
      sessions: state.sessions.map((session) => {
        if (session.id !== state.currentSessionId) return session;
        const messages = [...session.messages];
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== 'agent') {
          const chunks = [chunk];
          messages.push({
            id: `msg-${Date.now()}`,
            role: 'agent',
            content: buildStreamContent([], chunk),
            chunks,
            traces: buildCallTraces(chunks),
            timestamp: Date.now(),
          });
        } else {
          const chunks = [...lastMessage.chunks, chunk];
          messages[messages.length - 1] = {
            ...lastMessage,
            chunks,
            content: buildStreamContent(lastMessage.chunks, chunk),
            traces: buildCallTraces(chunks),
          };
        }
        return { ...session, messages };
      }),
    }));
  },

  finishStream: (meta) => {
    set((state) => ({
      streaming: false,
      sessions: state.sessions.map((session) => {
        if (session.id !== state.currentSessionId) return session;
        const messages = [...session.messages];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && lastMessage.role === 'agent') {
          messages[messages.length - 1] = {
            ...lastMessage,
            duration: meta?.duration,
            tokens: meta?.tokens,
            model: meta?.model,
          };
        }
        return { ...session, messages };
      }),
    }));
  },

  clearCurrentSession: () => {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === state.currentSessionId ? { ...session, messages: [] } : session
      ),
    }));
  },
}));
