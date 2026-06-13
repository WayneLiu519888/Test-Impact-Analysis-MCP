/**
 * TIA-init 工具 — 客户端初始化引导 + 命令文件缓存
 */

import { readFileSync } from "fs";
import { join } from "path";
import { PROJECT_ROOT } from "../paths.js";
import { ok, optionalString, getTransportMode } from "./helpers.js";
import { getRequestAuth, loadServerConf, saveServerConf, issueApiKey } from "../security.js";
import type { ToolResult } from "./helpers.js";

// ═══════════════════════════════════════════════════════
// 命令文件缓存
// ═══════════════════════════════════════════════════════

interface CmdFile { relPath: string; content: string; }
interface CmdBundle { agentType: string; agentLabel: string; commandsDir: string; files: CmdFile[]; }

const COMMAND_FILES = ["repo_monitor.md", "repo_clone.md", "repo_status.md", "repo_check.md", "repo_reset.md"];

function readCmdBundle(agentType: string, agentLabel: string, dir: string, fileMap: (n: string) => string): CmdBundle {
  const files: CmdFile[] = [];
  for (const fname of COMMAND_FILES) {
    try { files.push({ relPath: fileMap(fname), content: readFileSync(join(PROJECT_ROOT, fileMap(fname)), "utf-8") }); } catch {}
  }
  return { agentType, agentLabel, commandsDir: dir, files };
}

let _cmdBundles: CmdBundle[] | null = null;
function getCmdBundles(): CmdBundle[] {
  if (_cmdBundles) return _cmdBundles;
  _cmdBundles = [
    readCmdBundle("claude", "Claude Code", ".claude/commands/", (f) => `.claude/commands/${f}`),
    readCmdBundle("opencode", "OpenCode", ".opencode/commands/", (f) => `.opencode/commands/${f}`),
    readCmdBundle("codex", "Codex (OpenAI)", ".agents/skills/", (f) => `.agents/skills/${f.replace(".md", "")}/SKILL.md`),
  ];
  return _cmdBundles;
}

// ═══════════════════════════════════════════════════════
// TIA-init 主处理
// ═══════════════════════════════════════════════════════

export async function handleTiaInit(args: Record<string, unknown>): Promise<ToolResult> {
  if (getTransportMode() !== "http") {
    return ok("ℹ️ TIA-init 仅在 HTTP 远程模式下需要执行。\n   当前为 stdio 本地模式，可直接使用 /repo_monitor 和 /repo_clone。");
  }

  const conf = loadServerConf();
  const auth = getRequestAuth();
  const clientIp = auth?.clientIp || "unknown";

  // Agent 类型（必须指定，否则拒绝）
  const agentTypeMap: Record<string, string> = { ClaudeCode: "claude", CodeX: "codex", OpenCode: "opencode" };
  const argAgent = optionalString(args, "agentType") as string | undefined;
  const resolvedAgent = auth?.agentType || argAgent || null;

  if (!resolvedAgent) {
    return ok("❌ 未指定客户端 Agent 类型，TIA-init 执行失败。\n\n" +
      "   请通过以下任一种方式指定：\n" +
      "   方式一（推荐）：在 MCP HTTP 配置的 headers 中增加 X-Agent-Type 头：\n" +
      '     "headers": { "X-Agent-Type": "ClaudeCode" }\n' +
      "   方式二：调用 TIA-init 时传入 agentType 参数：\n" +
      '     TIA-init(agentType="ClaudeCode")\n\n' +
      "   支持的枚举值：ClaudeCode | CodeX | OpenCode");
  }

  const internalType = agentTypeMap[resolvedAgent];
  if (!internalType) {
    return ok(`❌ 无效的 Agent 类型: "${resolvedAgent}"。\n   支持的枚举值：ClaudeCode | CodeX | OpenCode`);
  }

  // API KEY 签发
  let apiKey: string | null = null;
  let keyStatus = "";
  if (auth?.apiKeyEntry) {
    keyStatus = `✅ 你已持有有效 API KEY（标签: ${auth.apiKeyEntry.label}，签发于 ${auth.apiKeyEntry.createdAt.slice(0, 10)}）`;
  } else {
    const issued = issueApiKey(`TIA-${resolvedAgent}-${clientIp}`, clientIp);
    conf.apiKeys.push(issued.entry);
    saveServerConf(conf);
    apiKey = issued.apiKey;
    keyStatus = `🆕 已为你签发新的 API KEY（标签: TIA-${resolvedAgent}-${clientIp}）`;
  }

  const bundles = getCmdBundles().filter((b) => b.agentType === internalType);

  const lines: string[] = [
    "╔══════════════════════════════════════════════════════╗",
    "║        TIA (Test Impact Analysis) 初始化引导        ║",
    "╚══════════════════════════════════════════════════════╝",
    "",
    `客户端 IP: ${clientIp}`,
    `客户端类型: ${resolvedAgent}（来源: ${auth?.agentType ? "请求头 X-Agent-Type" : "tool 参数"}）`,
    "",
    "━━━ 第 1 步：API KEY ━━━",
    keyStatus,
  ];

  if (apiKey) {
    const serverUrl = `http://${conf.host}:${conf.port}/mcp`;
    lines.push("", "⚠️ 请立即保存以下 API KEY，关闭后无法恢复。",
      "", "将此配置写入客户端 MCP 配置文件：", "", "```json",
      JSON.stringify({ mcpServers: { "test-impact-analysis": { type: "http", url: serverUrl, headers: { "X-API-Key": apiKey, "X-Agent-Type": resolvedAgent } } } }, null, 2),
      "```", "",
      `Claude Code: .claude/mcp.json 或 .claude/settings.local.json`,
      `OpenCode:     .opencode.json`,
      `Codex:        .codex/config.toml`,
      "", `💡 headers 中已包含 X-Agent-Type: ${resolvedAgent}，后续请求自动识别。`);
  }

  lines.push("", "━━━ 第 2 步：命令文件注册 ━━━");
  for (const bundle of bundles) {
    lines.push("", `📂 ${bundle.agentLabel}  —  目标目录: ${bundle.commandsDir}`, `   共 ${bundle.files.length} 个文件:`);
    for (const f of bundle.files) lines.push(`     ├─ ${f.relPath}`);
    for (const f of bundle.files) {
      lines.push("", `── ${f.relPath} ──`, "```markdown", f.content.trimEnd(), "```");
    }
  }

  lines.push("", "━━━ 客户端操作说明 ━━━", "",
    "请 Claude Code 执行以下操作：",
    apiKey ? "   1. 将上述 MCP 配置写入 .claude/mcp.json" : "   1. ✅ API KEY 已配置，跳过",
    "   2. 使用 Write 工具将上述命令文件写入对应目录",
    "   3. 完成后即可使用 /repo_monitor /repo_clone /repo_status /repo_check /repo_reset",
    "", `   Agent 已识别: ${resolvedAgent} → ${internalType} 平台命令文件`);

  return ok(lines.join("\n"));
}
