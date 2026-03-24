/**
 * MCP Proxy
 * Routes tool-call requests to the appropriate MCP server
 */

import { spawn } from 'child_process';
import type { McpServerConfig, ProxyRequest, ProxyResponse, ToolInfo } from '../utils/types.js';
import { logger } from '../utils/logger.js';

// ─── Stdio Transport ──────────────────────────────────────────────────────────

interface StdioSession {
  process: ReturnType<typeof spawn>;
  pendingRequests: Map<string | number, {
    resolve: (value: ProxyResponse) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
  }>;
  buffer: string;
}

export class McpProxy {
  private sessions = new Map<string, StdioSession>();

  // ─── Connection Management ──────────────────────────────────────────────────

  async connect(config: McpServerConfig): Promise<ToolInfo[]> {
    if (config.transport !== 'stdio') {
      logger.warn(`Transport "${config.transport}" not yet fully implemented. Using stdio fallback.`);
    }

    if (!config.command) {
      throw new Error(`Server "${config.id}" has no command configured`);
    }

    const session = this.spawnSession(config);
    this.sessions.set(config.id, session);

    // Initialize the MCP session
    const initResult = await this.sendRequest(config.id, {
      serverId: config.id,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'mcp-gateway', version: '0.1.0' },
      },
      requestId: 1,
    }, config.timeout);

    if (!initResult.success) {
      throw new Error(`Failed to initialize server "${config.id}": ${initResult.error?.message}`);
    }

    // Send initialized notification
    this.sendNotification(config.id, 'notifications/initialized');

    // Discover tools
    const toolsResult = await this.sendRequest(config.id, {
      serverId: config.id,
      method: 'tools/list',
      params: {},
      requestId: 2,
    }, config.timeout);

    if (!toolsResult.success) {
      logger.warn(`Could not list tools for "${config.id}": ${toolsResult.error?.message}`);
      return [];
    }

    const rawTools = (toolsResult.result as { tools?: unknown[] })?.tools ?? [];
    return rawTools.map((t: unknown) => {
      const tool = t as { name: string; description?: string; inputSchema?: Record<string, unknown> };
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverId: config.id,
        serverName: config.name,
      } satisfies ToolInfo;
    });
  }

  async disconnect(serverId: string): Promise<void> {
    const session = this.sessions.get(serverId);
    if (!session) return;

    // Reject all pending requests
    for (const [, pending] of session.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Server disconnected'));
    }

    session.process.kill('SIGTERM');
    this.sessions.delete(serverId);
    logger.info(`Disconnected from server: ${serverId}`);
  }

  async disconnectAll(): Promise<void> {
    for (const serverId of this.sessions.keys()) {
      await this.disconnect(serverId);
    }
  }

  // ─── Tool Execution ─────────────────────────────────────────────────────────

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeout?: number
  ): Promise<ProxyResponse> {
    if (!this.sessions.has(serverId)) {
      return {
        success: false,
        error: { code: -32000, message: `Server "${serverId}" is not connected` },
        durationMs: 0,
      };
    }

    const requestId = Date.now();
    return this.sendRequest(serverId, {
      serverId,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
      requestId,
    }, timeout ?? 30_000);
  }

  // ─── Internal ───────────────────────────────────────────────────────────────

  private spawnSession(config: McpServerConfig): StdioSession {
    const proc = spawn(config.command!, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const session: StdioSession = {
      process: proc,
      pendingRequests: new Map(),
      buffer: '',
    };

    proc.stdout?.on('data', (chunk: Buffer) => {
      session.buffer += chunk.toString();
      this.processBuffer(config.id, session);
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      logger.debug(`[${config.id}] stderr: ${chunk.toString().trim()}`);
    });

    proc.on('exit', (code) => {
      logger.warn(`Server "${config.id}" exited with code ${code}`);
      this.sessions.delete(config.id);
    });

    return session;
  }

  private processBuffer(serverId: string, session: StdioSession): void {
    const lines = session.buffer.split('\n');
    session.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const msg = JSON.parse(trimmed) as {
          id?: string | number;
          result?: unknown;
          error?: { code: number; message: string; data?: unknown };
        };

        if (msg.id !== undefined) {
          const pending = session.pendingRequests.get(msg.id);
          if (pending) {
            clearTimeout(pending.timer);
            session.pendingRequests.delete(msg.id);

            if (msg.error) {
              pending.resolve({
                success: false,
                error: msg.error,
                durationMs: 0,
              });
            } else {
              pending.resolve({
                success: true,
                result: msg.result,
                durationMs: 0,
              });
            }
          }
        }
      } catch {
        // Not JSON, ignore
      }
    }
  }

  private sendRequest(
    serverId: string,
    req: ProxyRequest,
    timeout = 30_000
  ): Promise<ProxyResponse> {
    const session = this.sessions.get(serverId);
    if (!session) {
      return Promise.resolve({
        success: false,
        error: { code: -32000, message: `No session for server "${serverId}"` },
        durationMs: 0,
      });
    }

    const startTime = Date.now();

    return new Promise((resolve) => {
      const id = req.requestId ?? Date.now();
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: req.method,
        params: req.params,
      });

      const timer = setTimeout(() => {
        session.pendingRequests.delete(id);
        resolve({
          success: false,
          error: { code: -32001, message: `Request timed out after ${timeout}ms` },
          durationMs: timeout,
        });
      }, timeout);

      session.pendingRequests.set(id, {
        resolve: (response) => {
          resolve({ ...response, durationMs: Date.now() - startTime });
        },
        reject: (err) => {
          resolve({
            success: false,
            error: { code: -32000, message: err.message },
            durationMs: Date.now() - startTime,
          });
        },
        timer,
      });

      session.process.stdin?.write(message + '\n');
    });
  }

  private sendNotification(serverId: string, method: string, params?: unknown): void {
    const session = this.sessions.get(serverId);
    if (!session) return;
    const message = JSON.stringify({ jsonrpc: '2.0', method, params });
    session.process.stdin?.write(message + '\n');
  }

  isConnected(serverId: string): boolean {
    return this.sessions.has(serverId);
  }
}
