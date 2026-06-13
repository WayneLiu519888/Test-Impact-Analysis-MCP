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
import { TOOL_SCHEMAS, handleToolCall, setTransportMode, TRANSPORT } from "./tools/index.js";
import { ensureConfigFile, validateConfig, listRepoConfigs } from "./state.js";
import { ensureServerConf, checkIpAccess, checkOriginAccess, getClientIp, verifyApiKey, runWithRequestAuth, stringHeader, validateAgentType } from "./security.js";
import { ensureImpactConfig } from "./impact-analysis/state.js";

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

ensureConfigFile();
ensureImpactConfig();

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
    // 当 host 非 localhost 时显式传入 allowedHosts，启用 SDK 内建 DNS rebinding 防护
    ...(serverConf.host !== "127.0.0.1" && serverConf.host !== "::1" && serverConf.host !== "localhost"
      ? { allowedHosts: serverConf.allowedOrigins && serverConf.allowedOrigins.length > 0 ? serverConf.allowedOrigins : undefined }
      : {}),
  });

  // ── 第 0 层安全：所有 /mcp 请求 → Origin → IP 白名单 → API KEY 预校验 ──
  // Origin 不通过（DNS rebinding）→ 403
  // IP 不通过 → 403 立即拦截
  // API KEY 校验结果存入 RequestAuth，由 MCP 工具层决定是否放行
  //   - TIA-init → 免 API KEY（客户端首次引导）
  //   - 其他工具 → 必须持有效 API KEY
  app.use("/mcp", (req: ExpressReq, res: ExpressRes, next: () => void) => {
    // Origin — DNS rebinding 防护（MCP 规范 MUST）
    const originResult = checkOriginAccess(req, serverConf);
    if (!originResult.ok) {
      res.status(originResult.status ?? 403).json({
        error: "Forbidden",
        message: originResult.reason ?? "Origin 不允许",
      });
      return;
    }

    // IP 白名单
    const ipResult = checkIpAccess(req, serverConf);
    if (!ipResult.ok) {
      res.status(ipResult.status ?? 403).json({
        error: "Forbidden",
        message: ipResult.reason ?? "认证失败",
      });
      return;
    }

    // API KEY 预校验（工具层根据工具名决定是否放行）
    const clientIp = getClientIp(
      { headers: req.headers, socket: req.socket } as any,
      serverConf.xForwardedFor ?? false
    );
    const providedKey = stringHeader(req.headers, "x-api-key");
    const apiKeyEntry = providedKey
      ? verifyApiKey(providedKey, serverConf.apiKeys)
      : null;
    const agentType = stringHeader(req.headers, "x-agent-type");
    const auth = { clientIp, apiKeyEntry, agentType: validateAgentType(agentType) };
    runWithRequestAuth(auth, () => next());
  });

  // ── Streamable HTTP Transport ──
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  await server.connect(transport);

  // 所有 /mcp 请求交由 transport 处理（GET=SSE 流, POST=JSON-RPC）
  app.all("/mcp", async (req: ExpressReq, res: ExpressRes) => {
    await transport.handleRequest(req as any, res as any, req.body);
  });

  // ── 健康检查 ──
  app.get("/health", (_req: ExpressReq, res: ExpressRes) => {
    res.json({ status: "ok", version: "1.0.0", mode: "http" });
  });

  app.listen(serverConf.port, () => {
    const keyCount = serverConf.apiKeys?.length ?? 0;
    const authStatus = keyCount > 0
      ? `${keyCount} 个 API KEY`
      : "⚠️ 无 API KEY（客户端需执行 TIA-init）";
    const ipStatus =
      serverConf.allowedIps && serverConf.allowedIps.length > 0
        ? `${serverConf.allowedIps.length} 个 IP`
        : "⚠️ 未配置 IP 白名单";
    const originStatus =
      serverConf.host === "127.0.0.1" || serverConf.host === "::1" || serverConf.host === "localhost"
        ? "跳过（localhost）"
        : serverConf.allowedOrigins && serverConf.allowedOrigins.length > 0
          ? `${serverConf.allowedOrigins.length} 个 Origin`
          : "⚠️ 未配置 Origin 白名单";

    console.error(`[TIA] v1.0.0 [http] 已就绪`);
    console.error(`[TIA] 地址:    http://${serverConf.host}:${serverConf.port}`);
    console.error(`[TIA] MCP:     http://${serverConf.host}:${serverConf.port}/mcp`);
    console.error(`[TIA] Health:  http://${serverConf.host}:${serverConf.port}/health`);
    console.error(`[TIA] Origin:  ${originStatus}  |  IP: ${ipStatus}  |  KEY: ${authStatus}`);
  });
}

main().catch((err) => {
  console.error("[TIA] 启动失败:", err);
  process.exit(1);
});
