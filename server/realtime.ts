import type { Response } from 'express';
import { EventEmitter } from 'node:events';

export interface RealtimeEvent {
  id: string;
  type: string;
  timestamp: string;
  orgId?: string;
  projectId?: string;
  title: string;
  message: string;
  severity?: 'critical' | 'warning' | 'info' | 'success';
  data?: Record<string, unknown>;
}

interface SseClient {
  id: string;
  userId: string;
  orgId?: string;
  res: Response;
  connectedAt: Date;
}

class RealtimeManager extends EventEmitter {
  private clients = new Map<string, SseClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private recentEvents: RealtimeEvent[] = [];

  constructor() {
    super();
    this.startHeartbeat();
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      const ping = `: ping ${Date.now()}\n\n`;
      for (const [id, client] of this.clients.entries()) {
        try {
          client.res.write(ping);
        } catch {
          this.clients.delete(id);
        }
      }
    }, 25000);
  }

  addClient(clientId: string, userId: string, orgId: string | undefined, res: Response) {
    this.clients.set(clientId, { id: clientId, userId, orgId, res, connectedAt: new Date() });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

    // Send any recent events from the last 5 minutes
    for (const ev of this.recentEvents.slice(-5)) {
      if (!ev.orgId || !orgId || ev.orgId === orgId) {
        res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
      }
    }
  }

  removeClient(clientId: string) {
    this.clients.delete(clientId);
  }

  broadcast(event: RealtimeEvent) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > 50) this.recentEvents.shift();

    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;

    for (const [id, client] of this.clients.entries()) {
      try {
        if (!event.orgId || !client.orgId || event.orgId === client.orgId) {
          client.res.write(payload);
        }
      } catch {
        this.clients.delete(id);
      }
    }
    this.emit('broadcast', event);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getRecentEvents(): RealtimeEvent[] {
    return [...this.recentEvents];
  }
}

export const realtime = new RealtimeManager();
