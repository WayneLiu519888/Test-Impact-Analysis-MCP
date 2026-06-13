/**
 * MCP Tool 定义与调用路由
 *
 * 只暴露 3 个工具（尽可能克制）：
 *   1. TIA-init     — 客户端初始化引导（API KEY 签发 + 命令文件注册）
 *   2. repo_monitor — 统一仓库监控（status / check / reset 三合一）
 *   3. repo_clone   — 克隆代码到本地（全量 / 增量 MR）
 *
 * 配置管理（添加/删除仓库）直接编辑 monitors.conf.json，无需 MCP 工具。
 * 纯查询提交（不更新水位）场景极少，不再提供独立工具。
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, rmSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { MonitorEntry } from "./types.js";
import { GitHubAdapter } from "./platforms/github.js";
import { LocalGitAdapter } from "./platforms/local.js";
import { GenericGitAdapter } from "./platforms/generic.js";
import type { PlatformAdapter } from "./platforms/types.js";
import {
  getMonitorEntries,
  updateWatermark,
  resetWatermark,
  getBaseDir,
} from "./state.js";
import {
  getRequestAuth,
  loadServerConf,
  saveServerConf,
  issueApiKey,
  touchApiKey,
} from "./security.js";

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

const execFileAsync = promisify(execFile);

// ─── 适配器 ──────────────────────────────────────────

let _github: GitHubAdapter;
let _local: LocalGitAdapter;
let _generic: GenericGitAdapter;

function getAdapter(platform: MonitorEntry["platform"]): PlatformAdapter {
  switch (platform) {
    case "github": return _github ??= new GitHubAdapter();
    case "local":  return _local  ??= new LocalGitAdapter();
    case "generic":return _generic??= new GenericGitAdapter();
  }
}

// ─── Transport 感知 ──────────────────────────────────

type TransportMode = "stdio" | "http";
let _transportMode: TransportMode = "stdio";

/**
 * 设置当前 transport 模式。由 index.ts 在启动时调用。
 *  - stdio: MCP Server 与客户端同机运行 → repo_clone 直接执行 git
 *  - http:  MCP Server 被远程客户端调用 → repo_clone 返回指令（不执行 git）
 */
export function setTransportMode(mode: TransportMode): void {
  _transportMode = mode;
}

function getTransportMode(): TransportMode {
  return _transportMode;
}

// ─── 命令文件缓存（TIA-init 用）───────────────────

/** 单条命令文件内容 */
interface CmdFile {
  relPath: string;       // 相对路径，如 ".claude/commands/repo_monitor.md"
  content: string;       // 文件内容
}

/** 三个平台的命令文件集合 */
interface CmdBundle {
  agentType: string;
  agentLabel: string;
  commandsDir: string;   // 命令目录说明
  files: CmdFile[];
}

/** 命令文件清单 — 跨三平台共享 */
const COMMAND_FILES = [
  "repo_monitor.md",
  "repo_clone.md",
  "repo_status.md",
  "repo_check.md",
  "repo_reset.md",
];

/**
 * 从磁盘读取指定平台/Agent 类型的全部命令文件。
 * 读取失败时跳过（TIA 项目自身可能不含某些平台目录）。
 */
function readCmdBundle(
  agentType: string,
  agentLabel: string,
  dir: string,
  fileMap: (name: string) => string // 文件名 → 相对路径
): CmdBundle {
  const files: CmdFile[] = [];
  for (const fname of COMMAND_FILES) {
    const relPath = fileMap(fname);
    const absPath = join(PROJECT_ROOT, relPath);
    try {
      files.push({ relPath, content: readFileSync(absPath, "utf-8") });
    } catch {
      // 忽略不存在的文件
    }
  }
  return { agentType, agentLabel, commandsDir: dir, files };
}

/** 懒加载缓存 */
let _cmdBundles: CmdBundle[] | null = null;

function getCmdBundles(): CmdBundle[] {
  if (_cmdBundles) return _cmdBundles;

  _cmdBundles = [
    readCmdBundle("claude", "Claude Code", ".claude/commands/",
      (f) => `.claude/commands/${f}`),
    readCmdBundle("opencode", "OpenCode", ".opencode/commands/",
      (f) => `.opencode/commands/${f}`),
    readCmdBundle("codex", "Codex (OpenAI)", ".agents/skills/",
      (f) => `.agents/skills/${f.replace(".md", "")}/SKILL.md`),
  ];

  return _cmdBundles;
}

// ─── 响应辅助 ────────────────────────────────────────

type ToolResult = { content: Array<{ type: "text"; text: string }> };
function ok(text: string): ToolResult {
  return { content: [{ type: "text" as const, text }] };
}

// ─── 参数校验 ────────────────────────────────────────

function requireString(args: Record<string, unknown>, key: string, label: string): string {
  const val = args[key];
  if (typeof val !== "string" || !val.trim()) throw new Error(`参数 ${label} 是必需的`);
  return val.trim();
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const val = args[key];
  return typeof val === "string" ? val.trim() : undefined;
}

/**
 * 从 args 中按 name / module 筛选目标仓库列表。
 * 两者都传则报错（互斥）；都不传返回全部。
 */
function resolveRepos(args: Record<string, unknown>): { repos: MonitorEntry[]; scopeText: string } {
  const nameFilter   = optionalString(args, "name");
  const moduleFilter = optionalString(args, "module");

  if (nameFilter && moduleFilter) {
    throw new Error("name 和 module 不能同时传入，请二选一");
  }

  const allEntries = getMonitorEntries();
  const repos = nameFilter
    ? allEntries.filter((e) => e.name === nameFilter)
    : moduleFilter
      ? allEntries.filter((e) => e.module === moduleFilter)
      : allEntries;

  const scopeText = nameFilter
    ? `仓库 "${nameFilter}"`
    : moduleFilter
      ? `模块 "${moduleFilter}"`
      : "";

  return { repos, scopeText };
}

// ═══════════════════════════════════════════════════════
// Tool Schema 定义（仅 2 个）
// ═══════════════════════════════════════════════════════

export const TOOL_SCHEMAS = [
  {
    name: "TIA-init",
    description:
      "【首次使用必调】TIA (Test Impact Analysis) 初始化引导工具。\n\n" +
      "远程 HTTP 客户端在接入 TIA MCP Server 后，必须先调用此工具完成初始化：\n" +
      "  1. 自动签发 API KEY（写入客户端 MCP 配置）\n" +
      "  2. 自动判断客户端 Agent 类型（X-Agent-Type 请求头 > agentType 参数）\n" +
      "     ClaudeCode → Claude Code 命令文件\n" +
      "     CodeX      → Codex (OpenAI) 技能文件\n" +
      "     OpenCode   → OpenCode 命令文件\n" +
      "  3. 自动返回 TIA 命令文件内容，由客户端 LLM 写入本地\n\n" +
      "调用前提：客户端 IP 已在服务端白名单中。\n" +
      "IP 不在白名单 → 403 + 联系人信息。\n\n" +
      "可重复调用：已持有效 API KEY 时跳过签发步骤，仅返回命令文件。",
    inputSchema: {
      type: "object" as const,
      properties: {
        agentType: {
          type: "string",
          enum: ["ClaudeCode", "CodeX", "OpenCode"],
          description: "客户端 Agent 类型。优先读取 X-Agent-Type 请求头，此参数作为回退。ClaudeCode=Claude Code，CodeX=Codex(OpenAI)，OpenCode=OpenCode",
        },
      },
      required: [],
    },
  },
  {
    name: "repo_monitor",
    description:
      "统一仓库监控工具。仓库列表在 monitors.conf.json 中配置（直接编辑即可，无需 MCP 工具）。\n\n" +
      "三种操作（通过 action 参数选择）:\n" +
      "  - status — 查看仓库水位、快照、上次检查时间\n" +
      "  - check  — 检查新提交（首次自动初始化水位），驱动水位更新 + seenShas 去重\n" +
      "  - reset  — 重置水位到指定 MR/日期。sinceDate 模式自动定位迭代第一个 MR 的 base commit\n\n" +
      "范围定位（二选一，不传则遍历全部）:\n" +
      "  - name   — 仓库别名\n" +
      "  - module — 模块名（批量操作该模块下所有仓库）\n\n" +
      "配合 CronCreate 定时监控:\n" +
      '  /cron "*/15 * * * *" "repo_monitor(action=\'check\')"\n\n' +
      "敏捷迭代重置:\n" +
      '  repo_monitor(action="reset", module="订单系统", label="Sprint 25 kickoff", sinceDate="2026-06-13")',
    inputSchema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          enum: ["status", "check", "reset"],
          description: "操作类型：status（查看状态）/ check（检查新提交）/ reset（重置水位）",
        },
        // ── 范围定位（所有 action 通用）──
        name:   { type: "string", description: "仓库别名（与 module 二选一，不传则遍历全部）" },
        module: { type: "string", description: "模块名（与 name 二选一，不传则遍历全部）" },
        // ── reset 专用 ──
        label:     { type: "string", description: "重置标签（如 'Sprint 25 kickoff'），用于快照回顾" },
        sinceDate: { type: "string", description: "迭代开始日期（ISO 8601），如 '2026-06-13'。传入后自动定位第一个 MR base commit 作为新水位" },
      },
      required: ["action"],
    },
  },
  {
    name: "repo_clone",
    description:
      "克隆监控仓库的代码到本地。可用于初始化（首次拉取分支代码）或更新全量代码，也可增量拉取 MR。\n\n" +
      "定位方式（二选一）:\n" +
      "  - name   = 克隆单个仓库\n" +
      "  - module = 克隆该模块下的所有仓库（按 repoType 各自归位）\n\n" +
      "克隆模式（通过 mode 参数控制）:\n" +
      "  - mode=full          — 全量克隆分支代码（初始化 / 强制覆盖更新）\n" +
      "  - mode=incremental   — 增量克隆 MR：sinceDate 拉取日期后合入的 MR / sinceMrId 拉取指定 MR 后合入的 MR\n\n" +
      "存储路径（由 repoType 决定）:\n" +
      "  - frontend → Repository/Frontend repository/{repo-name}/\n" +
      "  - backend  → Repository/Backend repository/{repo-name}/\n\n" +
      "行为模式（自动判断，无需用户干预）:\n" +
      "  - stdio transport → 本地模式：MCP Server 直接执行 git clone\n" +
      "  - http transport  → 远程模式：返回结构化 git 指令，由客户端在自己本地执行\n" +
      "    远程模式下可通过 clientBaseDir 指定客户端本地存储路径\n\n" +
      "增量模式前提:\n" +
      "  - 仓库必须配置了 repoType\n" +
      "  - 需要平台支持 MR 查询（GitHub / Generic 需 mrApiTemplate）\n" +
      "  - local 平台仅支持 sinceDate 模式",
    inputSchema: {
      type: "object" as const,
      properties: {
        name:      { type: "string", description: "仓库别名（与 module 二选一）" },
        module:    { type: "string", description: "模块名（与 name 二选一）" },
        mode:      { type: "string", enum: ["full", "incremental"], description: "克隆模式：full（全量）/ incremental（增量 MR）" },
        sinceDate: { type: "string", description: "ISO 日期（如 2026-06-13）。incremental 模式下拉取该日期后合入的 MR" },
        sinceMrId: { type: "string", description: "基线 MR/PR ID。incremental 模式下拉取该 MR 后合入的所有 MR（不含自身）" },
        force:     { type: "boolean", description: "强制覆盖已存在的目录（默认 false）" },
        clientBaseDir: { type: "string", description: "客户端代码存储根目录（仅 http transport 有效）。格式如 'D:/MyWorkspace'。不传则使用服务端 baseDir 作为建议路径" },
      },
      required: ["mode"],
    },
  },
];

// ═══════════════════════════════════════════════════════
// Tool 路由
// ═══════════════════════════════════════════════════════

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    // ── HTTP 模式的 API KEY 校验（stdio 免检，TIA-init 免检）──
    if (getTransportMode() === "http" && toolName !== "TIA-init") {
      const auth = getRequestAuth();
      if (!auth || !auth.apiKeyEntry) {
        return ok(
          "❌ 认证失败：请先执行 TIA-init 工具完成初始化引导。\n" +
          "   TIA-init 将自动为你签发 API KEY 并注册命令文件。"
        );
      }
      // 更新最后使用时间
      if (auth.apiKeyEntry) {
        const conf = loadServerConf();
        touchApiKey(conf.apiKeys, auth.apiKeyEntry);
        saveServerConf(conf);
      }
    }

    switch (toolName) {
      case "TIA-init":     return await handleTiaInit(args);
      case "repo_monitor": return await handleRepoMonitor(args);
      case "repo_clone":   return await handleRepoClone(args);
      default: throw new Error(`未知工具: ${toolName}`);
    }
  } catch (err: any) {
    return ok(`❌ 错误: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════
// TIA-init — 客户端初始化引导
// ═══════════════════════════════════════════════════════

async function handleTiaInit(args: Record<string, unknown>): Promise<ToolResult> {
  // ── HTTP 模式才需要 TIA-init ──
  if (getTransportMode() !== "http") {
    return ok(
      "ℹ️ TIA-init 仅在 HTTP 远程模式下需要执行。\n" +
      "   当前为 stdio 本地模式，可直接使用 /repo_monitor 和 /repo_clone。"
    );
  }

  const conf = loadServerConf();
  const auth = getRequestAuth();
  const clientIp = auth?.clientIp || "unknown";

  // ── 0. 确定 Agent 类型（必须指定，否则拒绝）──
  // 优先级: 请求头 X-Agent-Type > tool 参数 agentType
  // 映射表: ClaudeCode→claude, CodeX→codex, OpenCode→opencode
  const agentTypeMap: Record<string, string> = {
    ClaudeCode: "claude",
    CodeX: "codex",
    OpenCode: "opencode",
  };
  const argAgent = optionalString(args, "agentType") as string | undefined;
  const headerAgent = auth?.agentType;
  const resolvedAgent = headerAgent || argAgent || null;

  if (!resolvedAgent) {
    return ok(
      "❌ 未指定客户端 Agent 类型，TIA-init 执行失败。\n\n" +
      "   请通过以下任一种方式指定：\n" +
      "   方式一（推荐）：在 MCP HTTP 配置的 headers 中增加 X-Agent-Type 头：\n" +
      '     "headers": { "X-Agent-Type": "ClaudeCode" }\n' +
      "   方式二：调用 TIA-init 时传入 agentType 参数：\n" +
      `     TIA-init(agentType="ClaudeCode")\n\n` +
      "   支持的枚举值：ClaudeCode | CodeX | OpenCode\n" +
      "   ClaudeCode = Claude Code\n" +
      "   CodeX      = Codex (OpenAI)\n" +
      "   OpenCode   = OpenCode"
    );
  }

  const internalType = agentTypeMap[resolvedAgent];
  if (!internalType) {
    return ok(
      `❌ 无效的 Agent 类型: "${resolvedAgent}"。\n` +
      "   支持的枚举值：ClaudeCode | CodeX | OpenCode\n" +
      "   ClaudeCode = Claude Code\n" +
      "   CodeX      = Codex (OpenAI)\n" +
      "   OpenCode   = OpenCode"
    );
  }

  // ── 1. API KEY 签发 ──
  let apiKey: string | null = null;
  let keyStatus = "";

  if (auth?.apiKeyEntry) {
    keyStatus = `✅ 你已持有有效 API KEY（标签: ${auth.apiKeyEntry.label}，签发于 ${auth.apiKeyEntry.createdAt.slice(0, 10)}）`;
  } else {
    const label = `TIA-${resolvedAgent}-${clientIp}`;
    const issued = issueApiKey(label, clientIp);
    conf.apiKeys.push(issued.entry);
    saveServerConf(conf);
    apiKey = issued.apiKey;
    keyStatus = `🆕 已为你签发新的 API KEY（标签: ${label}）`;
  }

  // ── 2. 命令文件 ──
  const bundles = getCmdBundles();
  const targetBundles = bundles.filter((b) => b.agentType === internalType);

  // ── 3. 组装响应 ──
  const lines: string[] = [
    "╔══════════════════════════════════════════════════════╗",
    "║        TIA (Test Impact Analysis) 初始化引导        ║",
    "╚══════════════════════════════════════════════════════╝",
    "",
    `客户端 IP: ${clientIp}`,
    `客户端类型: ${resolvedAgent}（来源: ${headerAgent ? "请求头 X-Agent-Type" : "tool 参数"}）`,
    "",
    "━━━ 第 1 步：API KEY ━━━",
    keyStatus,
  ];

  if (apiKey) {
    // MCP 配置模板 — 含 X-Agent-Type 头，后续请求无需再传 agentType 参数
    const serverUrl = `http://${conf.host}:${conf.port}/mcp`;
    const headers: Record<string, string> = {
      "X-API-Key": apiKey,
      "X-Agent-Type": resolvedAgent,
    };

    lines.push("", "⚠️ 请立即保存以下 API KEY，关闭后无法恢复。");
    lines.push("",
      "将此配置写入客户端 MCP 配置文件：",
      "",
      "```json",
      JSON.stringify({
        mcpServers: {
          "test-impact-analysis": {
            type: "http",
            url: serverUrl,
            headers,
          },
        },
      }, null, 2),
      "```",
      "",
      `Claude Code: 写入 .claude/mcp.json 或 .claude/settings.local.json`,
      `OpenCode:     写入 .opencode.json`,
      `Codex:        写入 .codex/config.toml`,
      "",
      `💡 headers 中已包含 X-Agent-Type: ${resolvedAgent}，`,
      "   后续请求自动识别客户端类型，无需再传 agentType 参数。");
  }

  // ── 4. 命令文件内容 ──
  lines.push("", "━━━ 第 2 步：命令文件注册 ━━━");

  if (targetBundles.length === 0) {
    lines.push("", "⚠️ 未找到命令文件。请联系" + (conf.contactInfo || "管理员") + "。");
  }

  for (const bundle of targetBundles) {
    lines.push("",
      `📂 ${bundle.agentLabel}  —  目标目录: ${bundle.commandsDir}`,
      `   共 ${bundle.files.length} 个文件:`,
    );

    for (const f of bundle.files) {
      lines.push(`     ├─ ${f.relPath}`);
    }

    for (const f of bundle.files) {
      lines.push("",
        `── ${f.relPath} ──`,
        "```markdown",
        f.content.trimEnd(),
        "```",
      );
    }
  }

  // ── 5. 后续操作说明 ──
  lines.push("",
    "━━━ 客户端操作说明 ━━━",
    "",
    "请 Claude Code 执行以下操作：",
    apiKey ? "   1. 将上述 MCP 配置写入 .claude/mcp.json" : "   1. ✅ API KEY 已配置，跳过",
    "   2. 使用 Write 工具将上述命令文件写入对应目录",
    "   3. 完成后即可使用 /repo_monitor /repo_clone /repo_status /repo_check /repo_reset",
    "",
    `   Agent 已识别: ${resolvedAgent} → ${internalType} 平台命令文件`,
  );

  return ok(lines.join("\n"));
}

// ═══════════════════════════════════════════════════════
// repo_monitor — status / check / reset 三合一
// ═══════════════════════════════════════════════════════

async function handleRepoMonitor(args: Record<string, unknown>): Promise<ToolResult> {
  const action = requireString(args, "action", "action");
  if (!["status", "check", "reset"].includes(action)) {
    throw new Error(`action 必须为 status / check / reset，收到: "${action}"`);
  }

  switch (action) {
    case "status": return statusAction(args);
    case "check":  return checkAction(args);
    case "reset":  return resetAction(args);
    default: throw new Error(`未知 action: ${action}`);
  }
}

// ── action=status ─────────────────────────────────────

function statusAction(args: Record<string, unknown>): ToolResult {
  const { repos, scopeText } = resolveRepos(args);

  if (repos.length === 0) {
    if (scopeText) return ok(`未找到${scopeText}。请检查 monitors.conf.json 配置文件。`);
    return ok("配置文件 monitors.conf.json 中没有仓库。\n请直接编辑该文件添加仓库（无需 MCP 工具）。");
  }

  const lines = repos.map((m) => {
    const time = m.lastCheck ? new Date(m.lastCheck).toLocaleString("zh-CN") : "未检查";
    const sha  = m.lastSha ? m.lastSha.slice(0, 7) : "待初始化";
    const auth = m.auth?.type === "token" ? `token:${(m.auth as any).token?.slice(0, 8)}...` :
                 m.auth?.type === "rsa"   ? "rsa" : "none";
    const snaps = m.snapshots ?? [];
    const lastSnap = snaps.length > 0
      ? `\n   最近重置: "${snaps[0].label}" (${snaps[0].prevSha === "(首次)" ? "首次" : snaps[0].prevSha.slice(0, 7)} → ${snaps[0].newSha.slice(0, 7)})`
      : "";
    return [
      `📦 ${m.name}  [模块: ${m.module || "(未配置)"}]`,
      `   类型: ${(m.repoType || "?").padEnd(10)} 平台: ${m.platform.padEnd(10)} 分支: ${m.branch.padEnd(15)} 认证: ${auth}`,
      `   水位: ${sha.padEnd(14)} 上次检查: ${time}${lastSnap}`,
      `   源头: ${m.url}`,
    ].join("\n");
  });

  return ok(`📊 共监控 ${repos.length} 个仓库:\n\n` + lines.join("\n\n"));
}

// ── action=check ──────────────────────────────────────

async function checkAction(args: Record<string, unknown>): Promise<ToolResult> {
  const { repos, scopeText } = resolveRepos(args);

  if (repos.length === 0) {
    if (scopeText) return ok(`未找到${scopeText}。请检查 monitors.conf.json 配置文件。`);
    return ok("monitors.conf.json 中没有配置任何仓库。请直接编辑配置文件添加仓库。");
  }

  const results: string[] = [];
  let totalNew = 0;
  let reposWithNew = 0;

  for (const repo of repos) {
    try {
      const adapter = getAdapter(repo.platform);

      // ── 新仓库：初始化水位 ──
      if (!repo.lastSha) {
        const headSha = await adapter.getHeadSha(repo);
        updateWatermark(repo.name, headSha, []);
        results.push(`🆕 ${repo.name}: 首次初始化 (${headSha.slice(0, 7)})`);
        continue;
      }

      // ── 已有水位：对比 ──
      const headSha = await adapter.getHeadSha(repo);
      if (headSha === repo.lastSha) {
        results.push(`📭 ${repo.name}: 无新提交 (${headSha.slice(0, 7)})`);
        continue;
      }

      const commits = await adapter.getCommitsBetween(repo, repo.lastSha, headSha);
      if (commits.length === 0) {
        results.push(`📭 ${repo.name}: 无新提交 (${headSha.slice(0, 7)})`);
        continue;
      }

      const newCommits = commits.filter((c) => !repo.seenShas.includes(c.sha));
      if (newCommits.length > 0) {
        totalNew += newCommits.length;
        reposWithNew++;
        const commitLines = newCommits.map(
          (c) => `   ${c.shortSha}  ${c.author.padEnd(18)}  ${c.date.slice(0, 10)}  ${c.message}`
        );
        results.push(`🔴 ${repo.name}: +${newCommits.length} 条新提交`, ...commitLines);
      } else {
        results.push(`📭 ${repo.name}: 无真正新提交（水位已更新但都见过）`);
      }

      updateWatermark(repo.name, headSha, newCommits.map((c) => c.sha));
    } catch (err: any) {
      results.push(`⚠️ ${repo.name}: 检查失败 — ${err.message}`);
    }
  }

  const scopeLabel = scopeText ? ` [${scopeText}]` : "";
  const summary = totalNew === 0
    ? `\n✅ 共 ${repos.length} 个仓库${scopeLabel}，无新提交`
    : `\n🎯 ${repos.length} 个仓库${scopeLabel}中 ${reposWithNew} 个有更新，共 ${totalNew} 条新提交`;

  return ok(results.join("\n") + summary);
}

// ── action=reset ──────────────────────────────────────

async function resetAction(args: Record<string, unknown>): Promise<ToolResult> {
  const label     = optionalString(args, "label") || "手动重置";
  const sinceDate = optionalString(args, "sinceDate");
  const { repos, scopeText } = resolveRepos(args);

  if (repos.length === 0) {
    if (scopeText) return ok(`未找到${scopeText}。请检查 monitors.conf.json 配置文件。`);
    return ok("monitors.conf.json 中没有配置任何仓库。");
  }

  const modeText = sinceDate
    ? `基于日期 "${sinceDate}" 查找 MR → 水位置入 base commit`
    : "重置到当前 HEAD";

  const results: string[] = [`🔁 重置水位 — "${label}"  (${modeText})\n`];
  let success = 0;
  let failed = 0;
  let mrFound = 0;
  let fellBack = 0;

  for (const repo of repos) {
    try {
      const adapter = getAdapter(repo.platform);
      let targetSha: string | null = null;
      let source = "";

      if (sinceDate && adapter.findFirstMrBaseAfter) {
        // 尝试通过 MR/PR 日期定位水位
        const mrBase = await adapter.findFirstMrBaseAfter(repo, sinceDate);
        if (mrBase) {
          targetSha = mrBase;
          source = " (MR base)";
          mrFound++;
        }
      }

      // 没找到 MR 或不需要 → fallback 到当前 HEAD
      if (!targetSha) {
        targetSha = await adapter.getHeadSha(repo);
        if (sinceDate) {
          source = " (fallback: 当前 HEAD — 该日期后无 MR)";
          fellBack++;
        }
      }

      const snapshot = resetWatermark(repo.name, targetSha, label);
      const prev = snapshot.prevSha !== "(首次)" ? snapshot.prevSha.slice(0, 7) : "首次";

      results.push(
        `✅ ${repo.name}: ${prev} → ${targetSha.slice(0, 7)}${source}  (分支: ${repo.branch})`
      );
      success++;
    } catch (err: any) {
      failed++;
      results.push(`⚠️ ${repo.name}: 重置失败 — ${err.message}`);
    }
  }

  const scopeLabel = scopeText ? ` [${scopeText}]` : "";
  const summary = failed === 0
    ? `\n✅ 成功重置 ${success} 个仓库${scopeLabel}的水位`
    : `\n⚠️ ${success} 个成功 / ${failed} 个失败`;

  const extra = sinceDate
    ? `\n   ${mrFound} 个通过 MR 定位 / ${fellBack} 个 fallback 到当前 HEAD`
    : "";

  results.push(
    summary + extra,
    "",
    "📌 下次 check 将从目标 SHA 开始追踪新提交",
    "   快照已归档。action=status 可查看水位重置历史。"
  );

  return ok(results.join("\n"));
}

// ═══════════════════════════════════════════════════════
// repo_clone — 克隆代码到本地
// ═══════════════════════════════════════════════════════

async function handleRepoClone(args: Record<string, unknown>): Promise<ToolResult> {
  const name          = optionalString(args, "name");
  const moduleName    = optionalString(args, "module");
  const mode          = requireString(args, "mode", "mode");
  const sinceDate     = optionalString(args, "sinceDate");
  const sinceMrId     = optionalString(args, "sinceMrId");
  const force         = args.force === true;
  const clientBaseDir  = optionalString(args, "clientBaseDir");

  // — 定位方式校验：name / module 二选一 —
  if (!name && !moduleName) {
    throw new Error("必须提供 name 或 module（二选一）");
  }
  if (name && moduleName) {
    throw new Error("name 和 module 不能同时传入，请二选一");
  }

  // — 校验 mode —
  if (!["full", "incremental"].includes(mode)) {
    throw new Error(`mode 必须为 full 或 incremental，收到: "${mode}"`);
  }

  // — incremental 模式参数校验 —
  if (mode === "incremental") {
    if (!sinceDate && !sinceMrId) {
      throw new Error("incremental 模式必须提供 sinceDate 或 sinceMrId（二选一）");
    }
    if (sinceDate && sinceMrId) {
      throw new Error("sinceDate 和 sinceMrId 不能同时提供，请二选一");
    }
  }

  // — 获取目标仓库列表 —
  const allEntries = getMonitorEntries();
  let repos: MonitorEntry[];

  if (name) {
    const repo = allEntries.find((e) => e.name === name);
    if (!repo) {
      throw new Error(`未找到仓库 "${name}"。请检查 monitors.conf.json 配置文件。`);
    }
    if (!repo.repoType) {
      throw new Error(
        `仓库 "${name}" 未配置 repoType。请编辑 monitors.conf.json 指定 repoType 为 frontend 或 backend。`
      );
    }
    repos = [repo];
  } else {
    // module 模式
    repos = allEntries.filter((e) => e.module === moduleName);
    if (repos.length === 0) {
      return ok(`未找到属于模块 "${moduleName}" 的仓库。请检查 monitors.conf.json 配置文件。`);
    }
  }

  // — 生成 baseDir —
  // Transport 感知：stdio=本地执行, http=远程返回指令
  const isRemote = getTransportMode() === "http";
  const resolvedBaseDir = isRemote && clientBaseDir
    ? clientBaseDir.replace(/\\/g, "/")
    : getBaseDir();

  const modeLabel = mode === "full" ? "全量" : "增量";
  const execLabel = isRemote ? "远程模式（不执行 git，返回指令）" : "本地模式";
  const targetLabel = name ? `仓库 "${name}"` : `模块 "${moduleName}"`;

  const results: string[] = [
    `🚀 开始克隆 — ${targetLabel}  (${modeLabel} / ${execLabel})`,
    `   baseDir: ${resolvedBaseDir}`,
    `   共 ${repos.length} 个仓库\n`,
  ];

  let totalReposOk = 0;
  let totalReposFail = 0;

  for (const repo of repos) {
    try {
      const basePath = getRepoBasePathForDir(resolvedBaseDir, repo.repoType ?? "backend");
      const repoBasePath = join(basePath, repo.name);

      let result: ToolResult;
      if (mode === "full") {
        result = await fullClone(repo, repoBasePath, force, isRemote ? resolvedBaseDir : undefined);
      } else {
        result = await incrementalClone(repo, repoBasePath, { sinceDate, sinceMrId, force }, isRemote ? resolvedBaseDir : undefined);
      }

      // 提取克隆结果的文字，追加到汇总
      const text = result.content[0]?.text ?? "";
      results.push(`\n${"=".repeat(50)}`);
      results.push(text);
      totalReposOk++;
    } catch (err: any) {
      totalReposFail++;
      results.push(`\n❌ ${repo.name}: 克隆失败 — ${err.message}`);
    }
  }

  const summary = totalReposFail === 0
    ? `\n\n✅ 全部 ${totalReposOk} 个仓库处理完成`
    : `\n\n⚠️ ${totalReposOk} 个成功 / ${totalReposFail} 个失败`;
  results.push(summary);

  if (isRemote) {
    results.push(
      "",
      "💡 远程模式提示: 以上 git 命令需要在客户端本地执行。",
      "   Claude Code 的 Bash 工具可自动解析并执行上述指令块。",
      "   前提: 客户端本地已安装 git 且已配置好 SSH/RSA 公钥认证。"
    );
  }

  return ok(results.join("\n"));
}

// ═══════════════════════════════════════════════════════
// 克隆辅助函数
// ═══════════════════════════════════════════════════════

/** 执行 git 命令 */
async function runGit(cwd: string | undefined, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: 300_000, // 克隆可能耗时较长，给 5 分钟
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return stdout.trim();
  } catch (err: any) {
    const stderr = err.stderr || err.message;
    throw new Error(`git ${args[0]} 失败: ${stderr}`);
  }
}

/** 根据 repoType 获取存储根目录（使用服务端 baseDir） */
function getRepoBasePath(repoType: "frontend" | "backend"): string {
  const typeDir = repoType === "frontend" ? "Frontend repository" : "Backend repository";
  return join(getBaseDir(), "Repository", typeDir);
}

/** 根据指定的 baseDir 获取存储根目录（远程模式使用客户端 baseDir） */
function getRepoBasePathForDir(baseDir: string, repoType: "frontend" | "backend"): string {
  const typeDir = repoType === "frontend" ? "Frontend repository" : "Backend repository";
  return join(baseDir, "Repository", typeDir);
}

/** 确保目录存在（递归创建） */
function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o755 });
  }
}

// ═══════════════════════════════════════════════════════
// 远程模式指令构建
// ═══════════════════════════════════════════════════════

/**
 * 构建全量克隆指令块（远程模式）。
 * 客户端 Claude Code 的 Bash 工具执行这些命令。
 */
function buildRemoteFullCloneCmds(
  repo: MonitorEntry,
  targetPath: string,
  force: boolean
): ToolResult {
  const lines: string[] = [
    `📋 全量克隆 — ${repo.name}  [模块: ${repo.module || "?"}]`,
    `   仓库: ${repo.name}`,
    `   分支: ${repo.branch}`,
    `   目标: ${targetPath}`,
    `   来源: ${repo.url}`,
    ``,
  ];

  // 确保父目录存在
  const parentDir = targetPath.replace(/[/\\][^/\\]+$/, "");
  lines.push(`# 确保父目录存在`);

  if (force) {
    lines.push(`rm -rf "${targetPath}"  # 强制覆盖旧目录`);
  }

  lines.push(`mkdir -p "${parentDir}"`);

  // 核心 clone 命令
  const cloneArgs = [
    `clone`,
    `--branch`, `"${repo.branch}"`,
    `--single-branch`,
    `"${repo.url}"`,
    `"${targetPath}"`,
  ];

  lines.push(``);
  lines.push(`# 全量克隆（客户端通过 Bash 工具执行）`);
  lines.push(`git ${cloneArgs.join(" ")}`);
  lines.push(``);
  lines.push(`---cwd:${parentDir}---`);

  return ok(lines.join("\n"));
}

/**
 * 构建增量克隆指令块（远程模式）。
 * MR 列表已由服务端查询，客户端只需执行 git 命令。
 *
 * 远程模式下无法使用 --no-hardlinks（需要本地基础克隆），
 * 改为直接从远程 fetch + checkout 每个 MR 的 headSha。
 */
function buildRemoteIncrementalCloneCmds(
  repo: MonitorEntry,
  repoBasePath: string,
  branchClonePath: string,
  mrs: Awaited<ReturnType<NonNullable<import("./platforms/types.js").PlatformAdapter["listMrs"]>>>,
  filterDesc: string,
  force: boolean
): ToolResult {
  const lines: string[] = [
    `📋 增量克隆 — ${repo.name}  [模块: ${repo.module || "?"}]`,
    `   来源: ${repo.url}`,
    `   分支: ${repo.branch}`,
    `   范围: ${filterDesc}`,
    `   共 ${mrs.length} 个 MR`,
    ``,
  ];

  const parentDir = branchClonePath.replace(/[/\\][^/\\]+$/, "");

  // 步骤 0：确保目录树
  lines.push(`# 0. 确保目录结构`);
  lines.push(`mkdir -p "${branchClonePath}"`);
  lines.push(``);

  // 步骤 1：全量克隆基础分支（如尚未存在）
  lines.push(`# 1. 全量克隆基础分支（作为对象存储，如尚未存在）`);
  lines.push(`if [ ! -d "${branchClonePath}/.git" ]; then`);
  lines.push(`  git clone --branch "${repo.branch}" --single-branch "${repo.url}" "${branchClonePath}"`);
  lines.push(`fi`);
  lines.push(``);

  // 步骤 2：fetch 最新
  lines.push(`# 2. 更新基础克隆`);
  lines.push(`git -C "${branchClonePath}" fetch origin ${repo.branch}`);
  lines.push(``);

  // 步骤 3：每个 MR
  lines.push(`# 3. 逐个检出 MR (共 ${mrs.length} 个)`);
  lines.push(`mkdir -p "${repoBasePath}"`);
  lines.push(``);

  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i];
    const mrPath = join(repoBasePath, mr.id);

    lines.push(`echo "[${i + 1}/${mrs.length}] MR !${mr.id}: ${mr.title.slice(0, 60)}"`);

    if (force) {
      lines.push(`rm -rf "${mrPath}"  # 强制覆盖`);
    } else {
      lines.push(`if [ -d "${mrPath}" ]; then echo "  ⏭️  已存在，跳过"; continue; fi`);
    }

    // 从基础克隆做本地 clone（快速，不重复下载）
    lines.push(`git clone --no-hardlinks --no-checkout "${branchClonePath}" "${mrPath}"`);
    // 检出 MR 的 headSha
    lines.push(`git -C "${mrPath}" fetch origin "${mr.headSha}" 2>/dev/null || true`);
    lines.push(`git -C "${mrPath}" checkout "${mr.headSha}"`);
    lines.push(`echo "  ✅ MR !${mr.id} | ${mr.sourceBranch} | ${mr.mergedAt.slice(0, 10)} | ${mr.author}"`);
    lines.push(``);
  }

  lines.push(`echo ""`);
  lines.push(`echo "✅ 增量克隆完成 — ${repo.name} (${filterDesc})"`);
  lines.push(`echo "   共 ${mrs.length} 个 MR"`);

  return ok(lines.join("\n"));
}

/**
 * 全量克隆：将指定分支代码克隆到 {repoBasePath}/{branch}/ 目录
 *
 * @param clientBaseDir — 远程模式：不执行 git clone，返回结构化指令让客户端执行
 */
async function fullClone(
  repo: MonitorEntry,
  repoBasePath: string,
  force: boolean,
  clientBaseDir?: string
): Promise<ToolResult> {
  const targetPath = join(repoBasePath, repo.branch);

  // ── 远程模式：返回指令 ──
  if (clientBaseDir) {
    return buildRemoteFullCloneCmds(repo, targetPath, force);
  }

  // ── 本地模式：直接执行 git ──
  if (existsSync(targetPath)) {
    if (!force) {
      return ok(
        `⚠️ 目录已存在: ${targetPath}\n` +
        "如需覆盖，请传入 force=true"
      );
    }
    // 强制覆盖：删除旧目录
    rmSync(targetPath, { recursive: true, force: true });
  }

  ensureDir(repoBasePath);

  try {
    await runGit(undefined, [
      "clone",
      "--branch", repo.branch,
      "--single-branch",
      repo.url,
      targetPath,
    ]);

    return ok(
      `✅ 全量克隆完成\n` +
      `   仓库: ${repo.name}  [模块: ${repo.module || "?"}]\n` +
      `   分支: ${repo.branch}\n` +
      `   路径: ${targetPath}\n` +
      `   类型: ${repo.repoType}`
    );
  } catch (err: any) {
    // 克隆失败时清理半成品目录
    try { rmSync(targetPath, { recursive: true, force: true }); } catch {}
    throw err;
  }
}

/**
 * 增量克隆：拉取满足条件的 MR，每个 MR 一个子目录
 *
 * @param clientBaseDir — 远程模式：MR 列表仍由服务端查询，但 git 操作以指令形式返回
 */
async function incrementalClone(
  repo: MonitorEntry,
  repoBasePath: string,
  options: { sinceDate?: string; sinceMrId?: string; force: boolean },
  clientBaseDir?: string
): Promise<ToolResult> {
  const { sinceDate, sinceMrId, force } = options;
  const branchClonePath = join(repoBasePath, repo.branch);

  // ── 获取 MR 列表（本地/远程都需要）──
  const adapter = getAdapter(repo.platform);
  if (!adapter.listMrs) {
    throw new Error(
      `平台 "${repo.platform}" 不支持 MR 查询。` +
      "请使用 GitHub 或已配置 mrApiTemplate 的 Generic 平台"
    );
  }

  let mrs: Awaited<ReturnType<NonNullable<typeof adapter.listMrs>>>;
  try {
    mrs = await adapter.listMrs(repo, { sinceDate, sinceMrId });
  } catch (err: any) {
    throw new Error(`获取 MR 列表失败: ${err.message}`);
  }

  const filterDesc = sinceDate
    ? `日期 "${sinceDate}" 之后`
    : `MR "${sinceMrId}" 之后`;

  if (mrs.length === 0) {
    return ok(
      `📭 仓库 "${repo.name}" ${filterDesc} 没有已合入的 MR\n` +
      `   如需拉取全量分支代码，请使用 mode=full`
    );
  }

  // ── 远程模式：返回指令 ──
  if (clientBaseDir) {
    return buildRemoteIncrementalCloneCmds(repo, repoBasePath, branchClonePath, mrs, filterDesc, force);
  }

  // ── 本地模式：直接执行 git ──
  // 1. 确保基础克隆存在
  if (!existsSync(branchClonePath)) {
    const baseCloneResult = await fullClone(repo, repoBasePath, false);
    if (!existsSync(branchClonePath)) {
      return baseCloneResult;
    }
  }

  // 更新基础克隆（fetch 最新）
  try {
    await runGit(branchClonePath, ["fetch", "origin", repo.branch]);
  } catch (err: any) {
    throw new Error(`基础克隆 fetch 失败: ${err.message}`);
  }

  // 2. 逐个克隆 MR
  let cloned = 0;
  let skipped = 0;
  let failed = 0;
  const details: string[] = [];

  for (const mr of mrs) {
    const mrDirName = mr.id;
    const mrPath = join(repoBasePath, mrDirName);

    if (existsSync(mrPath)) {
      if (force) {
        rmSync(mrPath, { recursive: true, force: true });
      } else {
        skipped++;
        details.push(`  ⏭️  MR !${mr.id}: 已存在，跳过 (${mr.title.slice(0, 40)})`);
        continue;
      }
    }

    try {
      // 从基础克隆做本地 clone（--no-hardlinks 避免跨目录操作异常）
      await runGit(undefined, [
        "clone",
        "--no-hardlinks",
        "--no-checkout",
        branchClonePath,
        mrPath,
      ]);

      // Fetch MR 的 merge commit SHA
      try {
        await runGit(mrPath, ["checkout", mr.headSha]);
      } catch {
        // 基础克隆中可能没有该 commit，从远程 fetch
        await runGit(mrPath, ["fetch", "origin", mr.headSha]);
        await runGit(mrPath, ["checkout", mr.headSha]);
      }

      cloned++;
      details.push(
        `  ✅ MR !${mr.id}: ${mr.title.slice(0, 50)}\n` +
        `     源分支: ${mr.sourceBranch.padEnd(20)} 合入: ${mr.mergedAt.slice(0, 10)}\n` +
        `     作者: ${mr.author.padEnd(18)} SHA: ${mr.headSha.slice(0, 7)}`
      );
    } catch (err: any) {
      failed++;
      details.push(`  ❌ MR !${mr.id}: 克隆失败 — ${err.message}`);
      try { rmSync(mrPath, { recursive: true, force: true }); } catch {}
    }
  }

  const summary = [
    `📦 ${repo.name} 增量克隆完成 (${filterDesc})`,
    `   基础路径: ${branchClonePath}`,
    `   共找到 ${mrs.length} 个 MR`,
    `   成功: ${cloned}  |  跳过: ${skipped}  |  失败: ${failed}`,
    "",
    ...details,
  ];

  if (failed === 0) {
    summary.push("", "✅ 全部 MR 克隆完成");
  } else {
    summary.push("", `⚠️ ${failed} 个 MR 克隆失败，请检查上述错误信息`);
  }

  return ok(summary.join("\n"));
}
