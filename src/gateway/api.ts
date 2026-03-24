/**
 * Gateway HTTP API
 * Exposes REST endpoints for tool invocation, server management, and monitoring
 */

import express from 'express';
import type { GatewayConfig } from '../utils/types.js';
import type { ServerRegistry } from '../registry/index.js';
import type { McpProxy } from '../proxy/index.js';
import type { MetricsCollector } from '../monitor/index.js';
import { createAuthMiddleware } from '../auth/middleware.js';
import { createRateLimiter } from '../auth/ratelimit.js';
import { logger } from '../utils/logger.js';

export function createApiRouter(
  config: GatewayConfig,
  registry: ServerRegistry,
  proxy: McpProxy,
  metrics: MetricsCollector
) {
  const router = express.Router();
  const auth = createAuthMiddleware(config.auth);
  const rateLimit = createRateLimiter(config.rateLimit);

  // ─── Health & Status ────────────────────────────────────────────────────────

  router.get('/health', (_req, res) => {
    const summary = registry.getSummary();
    const status = summary.offline > 0 ? 'degraded' : 'ok';
    res.status(status === 'ok' ? 200 : 207).json({
      status,
      version: '0.1.0',
      uptime: process.uptime(),
      servers: summary,
    });
  });

  router.get('/metrics', (req, res) => {
    if (config.monitor?.prometheus) {
      const accept = req.headers.accept ?? '';
      if (accept.includes('text/plain') || accept.includes('*/*')) {
        res.set('Content-Type', 'text/plain; version=0.0.4').send(metrics.toPrometheusText());
        return;
      }
    }
    const windowMs = parseInt(String(req.query.window ?? '3600000'), 10);
    res.json(metrics.aggregate(windowMs));
  });

  // ─── Server Registry ────────────────────────────────────────────────────────

  router.get('/servers', auth, (_req, res) => {
    const servers = registry.getAllServers().map((s) => ({
      ...s,
      health: registry.getHealth(s.id),
      toolCount: registry.getTools(s.id).length,
    }));
    res.json({ servers, total: servers.length });
  });

  router.get('/servers/:id', auth, (req, res) => {
    const server = registry.getServer(req.params.id);
    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }
    res.json({
      ...server,
      health: registry.getHealth(server.id),
      tools: registry.getTools(server.id),
    });
  });

  // ─── Tool Discovery ─────────────────────────────────────────────────────────

  router.get('/tools', auth, (req, res) => {
    const { server: serverId, tag } = req.query as { server?: string; tag?: string };

    let tools = registry.getAllTools();

    if (serverId) {
      tools = tools.filter((t) => t.serverId === serverId);
    }
    if (tag) {
      const taggedServerIds = new Set(
        registry.getServersByTag(tag).map((s) => s.id)
      );
      tools = tools.filter((t) => taggedServerIds.has(t.serverId));
    }

    res.json({ tools, total: tools.length });
  });

  // ─── Tool Invocation ────────────────────────────────────────────────────────

  router.post('/tools/call', auth, rateLimit, async (req, res) => {
    const { tool, server: serverId, arguments: args = {} } = req.body as {
      tool?: string;
      server?: string;
      arguments?: Record<string, unknown>;
    };

    if (!tool) {
      res.status(400).json({ error: 'Bad Request', message: '"tool" field is required' });
      return;
    }

    // Resolve server: use explicit serverId or auto-discover from tool name
    let targetServerId = serverId;
    if (!targetServerId) {
      const toolInfo = registry.findTool(tool);
      if (!toolInfo) {
        res.status(404).json({ error: 'Not Found', message: `Tool "${tool}" not found in any server` });
        return;
      }
      targetServerId = toolInfo.serverId;
    }

    const server = registry.getServer(targetServerId);
    if (!server) {
      res.status(404).json({ error: 'Not Found', message: `Server "${targetServerId}" not found` });
      return;
    }

    if (!proxy.isConnected(targetServerId)) {
      res.status(503).json({ error: 'Service Unavailable', message: `Server "${targetServerId}" is not connected` });
      return;
    }

    logger.debug(`Tool call: ${tool} → ${targetServerId}`, { args });

    const result = await proxy.callTool(targetServerId, tool, args, server.timeout);

    // Record metric
    metrics.record({
      serverId: targetServerId,
      toolName: tool,
      durationMs: result.durationMs,
      success: result.success,
      errorMessage: result.error?.message,
      clientId: (req as express.Request & { clientId?: string }).clientId,
    });

    if (!result.success) {
      res.status(500).json({
        error: 'Tool Execution Failed',
        message: result.error?.message,
        code: result.error?.code,
        durationMs: result.durationMs,
      });
      return;
    }

    res.json({
      result: result.result,
      server: targetServerId,
      tool,
      durationMs: result.durationMs,
    });
  });

  // ─── Recent Requests ────────────────────────────────────────────────────────

  router.get('/requests', auth, (req, res) => {
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10), 500);
    res.json({ requests: metrics.getRecent(limit) });
  });

  return router;
}
