/**
 * mcp-gateway public API
 * Use this when embedding the gateway as a library
 */

export { Gateway } from './gateway/index.js';
export { ServerRegistry } from './registry/index.js';
export { McpProxy } from './proxy/index.js';
export { MetricsCollector } from './monitor/index.js';
export { loadConfig, generateDefaultConfig } from './config/loader.js';
export { logger } from './utils/logger.js';
export type {
  GatewayConfig,
  McpServerConfig,
  ServerHealth,
  ServerStatus,
  ServerTransport,
  ToolInfo,
  RequestMetric,
  AggregatedMetrics,
  AuthConfig,
  RateLimitConfig,
  MonitorConfig,
} from './utils/types.js';
