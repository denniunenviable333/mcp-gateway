<div align="center">

# mcp-gateway

**轻量级、开源的 MCP 服务器统一网关。**

路由 · 鉴权 · 限流 · 监控 — 用一个端点管理所有 [MCP](https://modelcontextprotocol.io) 服务器。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)

[English](../README.md) · **中文** · [文档](.) · [示例](../examples/)

</div>

---

## 为什么需要 mcp-gateway？

随着 [MCP（模型上下文协议）](https://modelcontextprotocol.io) 成为 AI Agent 与工具交互的事实标准，团队往往需要同时运行十几个 MCP 服务器——文件系统、GitHub、数据库、Slack、搜索等等。管理这些服务器非常混乱：

- 每个 AI 客户端需要独立连接每个服务器
- 没有统一的鉴权和访问控制
- 无法看到哪些工具被调用了、被谁调用、调用了多少次
- 没有限流保护，失控的 Agent 可能打垮你的 API

**mcp-gateway 解决了这些问题。** 它作为一个单一的、可观测的、安全的入口，位于你的 AI 客户端和 MCP 服务器之间。

## 快速开始

### 安装

```bash
npm install -g mcp-gateway
```

### 初始化配置

```bash
mcp-gateway init
# 生成 mcp-gateway.yml 配置文件
```

### 启动

```bash
mcp-gateway start
# → mcp-gateway 监听在 http://0.0.0.0:4000
# → ✓ Filesystem — 8 个工具可用
# → ✓ GitHub — 26 个工具可用
```

### 调用工具

```bash
# 列出所有可用工具
curl http://localhost:4000/api/v1/tools

# 调用工具（自动路由到正确的服务器）
curl -X POST http://localhost:4000/api/v1/tools/call \
  -H "Content-Type: application/json" \
  -d '{"tool": "read_file", "arguments": {"path": "/tmp/hello.txt"}}'
```

## 核心功能

| 功能 | 说明 |
|------|------|
| **统一 API 端点** | 一个 URL 访问所有 MCP 工具，按工具名自动路由 |
| **鉴权** | 支持 API Key、JWT 或无鉴权模式 |
| **限流** | 按 Key 的滑动窗口限流，标准 `X-RateLimit-*` 响应头 |
| **健康监控** | 自动健康检查，可配置检查间隔 |
| **指标收集** | 兼容 Prometheus 的 `/metrics` 端点 + JSON 聚合 |
| **工具发现** | `GET /api/v1/tools` 列出所有服务器的所有工具 |
| **YAML 配置** | 简洁的声明式配置，支持环境变量覆盖 |
| **Docker 支持** | 官方 Docker 镜像，附带 Compose 示例 |

## 路线图

- ✅ stdio 传输
- 🔄 SSE 传输（进行中）
- 📋 Web 可视化面板
- 📋 Redis 限流后端
- 📋 OAuth2 / OIDC 鉴权
- 📋 工具级 RBAC 权限控制
- 📋 OpenTelemetry 追踪

## 许可证

MIT © 2026 [HarrisonCN](https://github.com/HarrisonCN)
