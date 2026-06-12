import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

/** Payload structure broadcast over WebSocket */
export interface AgentEventPayload {
  type: string;
  data: unknown;
  timestamp: number;
}

/**
 * Set up a WebSocket server on the given HTTP server at path /ws/events.
 * Sends a welcome message on connection and returns the WSS instance
 * so callers can use broadcastEvent() to push events to all clients.
 */
export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws/events' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));

    ws.on('error', (err) => {
      // Silently handle connection errors to avoid crashing the process
      console.error('WebSocket error:', err.message);
    });
  });

  return wss;
}

/** Broadcast an event to all connected WebSocket clients. */
export function broadcastEvent(wss: WebSocketServer, event: string, data: unknown): void {
  const message = JSON.stringify({ type: event, data, timestamp: Date.now() } satisfies AgentEventPayload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
