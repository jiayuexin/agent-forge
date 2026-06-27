import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { useNodeStore } from '../store/nodeStore.js';
import { useMonitorStore } from '../store/monitorStore.js';
import type { AgentMessage, AgentNodeStatus } from '@agentforge/types';

export function useDashboardWebSocket() {
  const token = useAuthStore((state) => state.token);
  const updateNode = useNodeStore((state) => state.updateNode);
  const removeNode = useNodeStore((state) => state.removeNode);
  const updateNodeStatus = useNodeStore((state) => state.updateNodeStatus);
  const appendEvent = useMonitorStore((state) => state.appendEvent);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    const host = window.location.host;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${host}/ws/events?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Dashboard WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          type: 'node-registered' | 'node-disconnected' | 'agent-message';
          nodeId: string;
          node?: { status?: AgentNodeStatus };
          message?: AgentMessage;
        };

        if (data.type === 'node-registered' && data.node) {
          updateNode(data.node as unknown as Parameters<typeof updateNode>[0]);
        } else if (data.type === 'node-disconnected') {
          removeNode(data.nodeId);
        } else if (data.type === 'agent-message' && data.message) {
          if (data.message.type === 'status' && data.message.payload) {
            updateNodeStatus(data.nodeId, data.message.payload as AgentNodeStatus);
          }
          appendEvent(data.nodeId, data.message);
        }
      } catch (error) {
        console.error('Failed to parse dashboard event', error);
      }
    };

    ws.onclose = () => {
      console.log('Dashboard WebSocket disconnected');
    };

    ws.onerror = (error) => {
      console.error('Dashboard WebSocket error', error);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, updateNode, removeNode, updateNodeStatus, appendEvent]);

  return wsRef;
}
