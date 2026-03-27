/**
 * WebSocket Transport for MCP servers
 *
 * Connects to MCP servers that expose a WebSocket endpoint,
 * enabling full-duplex communication with lower latency than SSE.
 *
 * @module transport/websocket
 */

import { EventEmitter } from 'events';
import { Logger } from '../utils/logger.js';
import { MCPRequest, MCPResponse } from '../utils/types.js';

// Use the built-in WebSocket available in Node.js 22+
// Falls back to a lightweight polyfill pattern for older runtimes.
declare const WebSocket: typeof import('ws').WebSocket;

export interface WebSocketTransportOptions {
  url: string;
  headers?: Record<string, string>;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  timeoutMs?: number;
  pingIntervalMs?: number;
}

type PendingRequest = {
  resolve: (value: MCPResponse) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

export class WebSocketTransport extends EventEmitter {
  private options: Required<WebSocketTransportOptions>;
  private logger: Logger;
  private ws: WebSocket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private pendingRequests = new Map<string | number, PendingRequest>();
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(options: WebSocketTransportOptions, logger: Logger) {
    super();
    this.options = {
      reconnectIntervalMs: 3000,
      maxReconnectAttempts: 10,
      timeoutMs: 30000,
      headers: {},
      pingIntervalMs: 30000,
      ...options,
    };
    this.logger = logger;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._openSocket(resolve, reject);
    });
  }

  private _openSocket(
    onConnect?: () => void,
    onError?: (e: Error) => void,
  ): void {
    try {
      // Node.js 22 ships with a native WebSocket implementation
      this.ws = new (globalThis as any).WebSocket(this.options.url, {
        headers: this.options.headers,
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      onError?.(e);
      return;
    }

    this.ws!.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.logger.info(`WebSocket transport connected to ${this.options.url}`);
      onConnect?.();
      this.emit('connect');
      this._startPing();
    };

    this.ws!.onmessage = (event: MessageEvent) => {
      try {
        const data: MCPResponse = JSON.parse(
          typeof event.data === 'string' ? event.data : event.data.toString(),
        );
        const id = data.id;
        if (id !== undefined && this.pendingRequests.has(id)) {
          const pending = this.pendingRequests.get(id)!;
          clearTimeout(pending.timer);
          this.pendingRequests.delete(id);
          pending.resolve(data);
        } else {
          this.emit('message', data);
        }
      } catch {
        this.logger.debug(`Non-JSON WebSocket message: ${event.data}`);
      }
    };

    this.ws!.onerror = (event: Event) => {
      const msg = (event as ErrorEvent).message ?? 'WebSocket error';
      this.logger.error(`WebSocket error: ${msg}`);
      onError?.(new Error(msg));
    };

    this.ws!.onclose = (event: CloseEvent) => {
      this.connected = false;
      this._stopPing();
      this.logger.warn(
        `WebSocket closed (code=${event.code}, reason=${event.reason || 'none'})`,
      );
      this._scheduleReconnect();
    };
  }

  private _startPing(): void {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (this.connected && this.ws?.readyState === 1 /* OPEN */) {
        try {
          this.ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'ping' }));
        } catch {
          // ignore ping errors
        }
      }
    }, this.options.pingIntervalMs);
  }

  private _stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.logger.error(
        `WebSocket max reconnect attempts (${this.options.maxReconnectAttempts}) reached`,
      );
      this.emit('disconnect');
      return;
    }
    this.reconnectAttempts++;
    const delay =
      this.options.reconnectIntervalMs * Math.min(this.reconnectAttempts, 5);
    this.logger.info(
      `WebSocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})…`,
    );
    setTimeout(() => this._openSocket(), delay);
  }

  async send(request: MCPRequest): Promise<MCPResponse> {
    if (!this.connected || !this.ws) {
      throw new Error('WebSocket transport is not connected');
    }

    return new Promise((resolve, reject) => {
      const id = request.id ?? Date.now();
      const payload = JSON.stringify({ ...request, id });

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `WebSocket request timed out after ${this.options.timeoutMs}ms`,
          ),
        );
      }, this.options.timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.ws!.send(payload);
      } catch (err) {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  disconnect(): void {
    this.connected = false;
    this._stopPing();
    this.ws?.close(1000, 'Client disconnect');
    this.ws = null;
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('WebSocket transport disconnected'));
      this.pendingRequests.delete(id);
    }
    this.emit('disconnect');
  }

  isConnected(): boolean {
    return this.connected;
  }
}
