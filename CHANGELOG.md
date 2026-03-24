# Changelog

All notable changes to mcp-gateway will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- SSE and WebSocket transport support
- Web dashboard UI (React + Vite)
- Redis-backed rate limiting for distributed deployments
- OAuth2 / OIDC authentication
- Tool-level RBAC (role-based access control)
- OpenTelemetry distributed tracing
- Multi-tenant mode with namespace isolation
- Request replay and debugging tools

## [0.1.0] - 2026-03-24

### Added
- Core gateway with Express HTTP server
- MCP stdio transport proxy with full JSON-RPC 2.0 support
- Server registry with lifecycle management and health checks
- Tool discovery and auto-routing (`tools/call` auto-selects server by tool name)
- API key authentication middleware
- JWT authentication middleware
- In-memory sliding window rate limiter with `X-RateLimit-*` headers
- Metrics collection with Prometheus export and JSON aggregation
- YAML and JSON configuration with Zod schema validation
- Environment variable overrides (`MCP_GATEWAY_PORT`, `MCP_GATEWAY_API_KEYS`, etc.)
- `mcp-gateway start` — start the gateway
- `mcp-gateway init` — generate default config
- `mcp-gateway validate` — validate config file
- Docker image and Docker Compose examples
- TypeScript SDK for embedding the gateway as a library
- MIT license
