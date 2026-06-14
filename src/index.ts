/**
 * Test Impact Analysis MCP Server — 入口
 *
 * 面向软件测试人员的 MCP 工具集，通过 stdio/http transport 暴露各类测试分析能力。
 *
 * 当前模块: Git Monitor — Git 仓库提交监控、水位管理、代码克隆
 *
 * Transport 双模:
 *   - stdio (默认): 本地进程间通信，零配置
 *   - http:         远程 HTTP 服务，通过环境变量 MCP_TRANSPORT=http 启动
 *
 * 启动方式:
 *   Stdio: npx tsx src/index.ts
 *   HTTP:   MCP_TRANSPORT=http MCP_PORT=3100 npx tsx src/index.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { IncomingMessage, ServerResponse } from "http";
import { handleToolCall, setTransportMode, TRANSPORT, getTransportMode, TOOL_SCHEMAS } from "./tools/index.js";
import { ensureEnterpriseDir } from "./paths.js";
import { ensureConfigFile, validateConfig, listRepoConfigs } from "./state.js";
import { ensureServerConf, checkIpAccess, getClientIp, stringHeader } from "./security.js";
import { ensureImpactConfig } from "./impact-analysis/state.js";
import { ensureEngineConfig } from "./engines/registry.js";

/**
 * Express 请求/响应的最小类型声明。
 * 刻意不使用 @types/express：Express.js 仅 HTTP 模式启动，仅需两个接口。
 * 如需更完整类型 → `npm i -D @types/express` 后替换为 `import type { Request, Response } from "express"`。
 */
interface ExpressReq {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  body?: unknown;
}
interface ExpressRes {
  status(code: number): { json(data: unknown): void };
  json(data: unknown): void;
}

// ─── 启动前校验 ──────────────────────────────────────

// 首先确保企业配置目录存在，后续配置文件读取依赖此目录
ensureEnterpriseDir();
ensureConfigFile();
ensureImpactConfig();
ensureEngineConfig();

const errors = validateConfig();
if (errors.length > 0) {
  console.error("[TIA] ⚠️ 配置文件校验失败:");
  for (const e of errors) console.error(`  - ${e}`);
  console.error("[TIA] 出错的仓库将被跳过，其他仓库正常工作。");
}

const configCount = listRepoConfigs().length;
console.error(`[TIA] 已加载 ${configCount} 个仓库配置`);
if (configCount === 0) {
  console.error("[TIA] 提示：编辑 monitors.conf.json 添加仓库");
}

// ─── Server ───────────────────────────────────────────

const server = new Server(
  { name: "test-impact-analysis-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_SCHEMAS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  return handleToolCall(req.params.name, args);
});

// ═══════════════════════════════════════════════════════════
// Transport 双模启动
// ═══════════════════════════════════════════════════════════

async function main() {
  const mode = (process.env.MCP_TRANSPORT || TRANSPORT.STDIO).toLowerCase();

  if (mode === TRANSPORT.HTTP) {
    await startHttpMode();
  } else {
    await startStdioMode();
  }
}

// ── Stdio 模式 ────────────────────────────────────────

async function startStdioMode() {
  setTransportMode(TRANSPORT.STDIO);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[TIA] v1.0.0 [stdio] 已就绪");
}

// ── HTTP 模式 ─────────────────────────────────────────

async function startHttpMode() {
  setTransportMode(TRANSPORT.HTTP);
  const serverConf = ensureServerConf();

  // 环境变量 MCP_PORT 优先级最高，可覆盖 server.conf.json 的 port
  if (process.env.MCP_PORT) {
    const envPort = parseInt(process.env.MCP_PORT, 10);
    if (!isNaN(envPort) && envPort > 0 && envPort <= 65535) {
      serverConf.port = envPort;
    }
  }

  const app = createMcpExpressApp({
    host: serverConf.host,
  });

  // ── IP 白名单校验（所有 /mcp 请求必经）──
  app.use("/mcp", (req: ExpressReq, res: ExpressRes, next: () => void) => {
    const ipResult = checkIpAccess(req, serverConf);
    if (!ipResult.ok) {
      res.status(ipResult.status ?? 403).json({
        error: "Forbidden",
        message: ipResult.reason ?? "IP 不在白名单中",
      });
      return;
    }
    next();
  });

  // ── Streamable HTTP Transport ──
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await server.connect(transport);

  // 所有 /mcp 请求交由 transport 处理（GET=SSE 流, POST=JSON-RPC）
  app.all("/mcp", async (req: ExpressReq, res: ExpressRes) => {
    await transport.handleRequest(req as IncomingMessage, res as unknown as ServerResponse, req.body);
  });

  // ── 健康检查 ──
  app.get("/health", (_req: ExpressReq, res: ExpressRes) => {
    res.json({ status: "ok", version: "1.0.0", mode: "http" });
  });

  app.listen(serverConf.port, () => {
    const ipStatus =
      serverConf.allowedIps && serverConf.allowedIps.length > 0
        ? `${serverConf.allowedIps.length} 个 IP`
        : "⚠️ 未配置 IP 白名单";

    console.error(`[TIA] v1.0.0 [http] 已就绪`);
    console.error(`[TIA] 地址:    http://${serverConf.host}:${serverConf.port}`);
    console.error(`[TIA] MCP:     http://${serverConf.host}:${serverConf.port}/mcp`);
    console.error(`[TIA] Health:  http://${serverConf.host}:${serverConf.port}/health`);
    console.error(`[TIA] IP:      ${ipStatus}`);
  });
}

main().catch((err) => {
  console.error("[TIA] 启动失败:", err);
  process.exit(1);
});
