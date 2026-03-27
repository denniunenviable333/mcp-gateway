# Changelog

All notable changes to mcp-gateway will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.0] - 2026-03-27

### New Features

**SSE Transport (`src/transport/sse.ts`)**
Full Server-Sent Events transport implementation for MCP servers that expose an SSE endpoint. Supports automatic reconnection with exponential back-off (up to `maxReconnectAttempts`), pending-request correlation by JSON-RPC id, and a companion POST `/message` endpoint for sending requests.

**WebSocket Transport (`src/transport/websocket.ts`)**
Full-duplex WebSocket transport for lower-latency MCP server communication. Includes automatic reconnection, keep-alive pings at a configurable interval, and the same pending-request correlation model as the SSE transport.

**Config Hot Reload (`src/config/watcher.ts`)**
The gateway now watches its config file for changes and applies new server registrations without requiring a restart. A 500 ms debounce prevents thrashing on rapid saves. Invalid configs are rejected with a clear error log while the previous config remains active.

**Request Tracing (`src/middleware/request-id.ts`)**
Every request now carries a unique `X-Request-Id` header. The middleware honours existing `X-Request-Id` or `X-Correlation-Id` headers sent by clients, falling back to a generated UUID v4. The id is reflected in the response and included in all log lines for that request.

**CORS Middleware (`src/middleware/cors.ts`)**
Configurable CORS support with wildcard, exact-origin, and regex-pattern matching. Exposes `X-Request-Id` and `X-RateLimit-*` headers to browsers by default.

**Web Dashboard (`dashboard/index.html`)**
A zero-dependency, single-file HTML dashboard served at `/dashboard`. Displays server health, tool inventory, recent requests, and aggregate metrics. Auto-refreshes every 10 seconds.

### Bug Fixes

**[BUG-001] Concurrent restart race condition**
When multiple requests arrived simultaneously while a server process was restarting, the proxy could spawn duplicate processes. Fixed by introducing a per-server `Mutex` that serialises all `connect()` calls for the same server id.

**[BUG-002] JSON-RPC id collision under high concurrency**
`Date.now()` was used as the JSON-RPC request id, which could produce collisions when multiple requests were dispatched within the same millisecond. Replaced with a monotonic integer counter (`_idSeq`).

**[BUG-003] Leaked stdio handles on process crash**
When an MCP server process crashed, its `stdin` and `stdout` streams were not explicitly destroyed, leaving file-descriptor leaks. The `exit` and `error` handlers now call `.destroy()` on both streams before removing the session.

**[BUG-004] Silent spawn failures**
A `spawn error` event (e.g., command not found) was logged but did not reject pending requests, leaving callers hanging until their timeout fired. The `error` handler now immediately rejects all pending requests for that session.

**[BUG-005] Unhandled errors leaked raw stack traces**
Express errors were passed through without a centralised handler, causing raw `Error` objects (including stack traces) to be serialised into responses in production. A new `errorHandler` middleware normalises all errors into a consistent `{ error: { code, message, requestId } }` envelope and suppresses stack traces outside of development mode.

**[BUG-006] Requests hung indefinitely on slow servers**
Tool-call requests to unresponsive MCP servers could block the event loop indefinitely. A new `timeoutMiddleware` enforces a per-request deadline (default: 30 s) and returns a `504 Gateway Timeout` with a `Retry-After` header.

### Internal Changes

- Added `src/utils/mutex.ts` — lightweight async mutex with no external dependencies
- Added `src/middleware/error-handler.ts` — centralised error normalisation and `GatewayError` class
- Added `src/middleware/timeout.ts` — per-request timeout enforcement
- Updated `src/proxy/index.ts` — incorporates all bug fixes above; private methods renamed with `_` prefix for clarity
- Updated client info version string from `0.1.0` to `0.2.0` in MCP `initialize` handshake

---

## [0.1.0] - 2026-03-24

### Added

Initial public release. See the [v0.1.0 release notes](https://github.com/HarrisonCN/mcp-gateway/releases/tag/v0.1.0) for the full feature list.
