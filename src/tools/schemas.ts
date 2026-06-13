/**
 * TIA 工具 Schema 定义 — 仅包含 TOOL_SCHEMAS 常量
 *
 * 每个工具包含一个 visibility 字段（TIA 私有元数据，不会泄露到 MCP 协议）：
 *   "all"         — stdio + HTTP 双模可用
 *   "stdio-only"  — 仅 stdio 本地模式可用（HTTP 远程调用被拒）
 */

/** 工具可见范围 */
export type ToolVisibility = "all" | "stdio-only";

export const TOOL_SCHEMAS = [
  {
    name: "impact_analysis",
    visibility: "all" as ToolVisibility,
    description:
      "分析代码变更对测试用例的影响。基于 impact-rules.conf.json 中配置的文件→测试映射规则，\n" +
      "自动匹配变更文件对应的测试模块，返回受影响测试用例的优先级排序列表。\n\n" +
      "使用方式:\n" +
      '  impact_analysis(name="gh-backend")  — 分析从水位到 HEAD 的变更\n' +
      '  impact_analysis(name="gh-backend", from="abc", to="def")  — 指定 SHA 范围\n' +
      '  impact_analysis(module="用户中心")  — 按模块分析\n\n' +
      "前提:\n" +
      "  - 仓库已通过 repo_monitor(action='check') 初始化水位\n" +
      "  - 已编辑 impact-rules.conf.json 配置文件→测试映射规则（可选，未配置则自动推断）",
    inputSchema: {
      type: "object" as const,
      properties: {
        name:   { type: "string", description: "仓库别名（与 module 二选一，不传则分析全部仓库）" },
        module: { type: "string", description: "模块名（与 name 二选一，不传则分析全部仓库）" },
        from:   { type: "string", description: "起始 SHA（不传则使用当前水位 lastSha）" },
        to:     { type: "string", description: "目标 SHA（不传则使用远程 HEAD）" },
      },
      required: [],
    },
  },
  {
    name: "TIA-init",
    visibility: "all" as ToolVisibility,
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
          description: "客户端 Agent 类型。优先读取 X-Agent-Type 请求头，此参数作为回退。",
        },
      },
      required: [],
    },
  },
  {
    name: "repo_monitor",
    visibility: "all" as ToolVisibility,
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
        name:   { type: "string", description: "仓库别名（与 module 二选一，不传则遍历全部）" },
        module: { type: "string", description: "模块名（与 name 二选一，不传则遍历全部）" },
        label:     { type: "string", description: "重置标签（如 'Sprint 25 kickoff'），用于快照回顾" },
        sinceDate: { type: "string", description: "迭代开始日期（ISO 8601），如 '2026-06-13'。" },
      },
      required: ["action"],
    },
  },
  {
    name: "repo_clone",
    visibility: "all" as ToolVisibility,
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
        clientBaseDir: { type: "string", description: "客户端代码存储根目录（仅 http transport 有效）。" },
      },
      required: ["mode"],
    },
  },
  {
    name: "test_recommendation",
    visibility: "stdio-only" as ToolVisibility,
    description:
      "基于代码变更智能推荐测试用例执行顺序。在 Phase 2 影响分析结果上计算推荐分，\n" +
      "按优先级排序测试用例，生成最小可行测试集（覆盖所有高风险模块的最少测试）。\n\n" +
      '  test_recommendation(name="gh-backend")  — 分析从水位到 HEAD\n' +
      '  test_recommendation(module="用户中心")   — 按模块分析\n\n' +
      "推荐分 = 风险权重(h=100/m=50/l=20) × 置信度(0-100)\n" +
      "强烈建议(≥7000) | 建议(≥2000) | 可选(<2000)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name:   { type: "string", description: "仓库别名" },
        module: { type: "string", description: "模块名" },
        from:   { type: "string", description: "起始 SHA（不传=当前水位）" },
        to:     { type: "string", description: "目标 SHA（不传=远程 HEAD）" },
      },
      required: [],
    },
  },
  {
    name: "risk_assessment",
    visibility: "stdio-only" as ToolVisibility,
    description:
      "量化代码变更风险，生成风险评分（0-100）与缓解建议。\n" +
      "综合文件变更数量、受影响模块的风险等级分布、置信度三个维度计算。\n\n" +
      '  risk_assessment(name="gh-backend")  — 评估从水位到 HEAD 的风险\n' +
      '  risk_assessment(module="用户中心")   — 按模块评估\n\n' +
      "评分: files(0-60) + modules(0-40) + confidencePenalty(0-20) = 0-100\n" +
      "等级: 0-30=低风险 | 31-60=中等 | 61-85=高风险 | 86-100=严重",
    inputSchema: {
      type: "object" as const,
      properties: {
        name:   { type: "string", description: "仓库别名" },
        module: { type: "string", description: "模块名" },
        from:   { type: "string", description: "起始 SHA（不传=当前水位）" },
        to:     { type: "string", description: "目标 SHA（不传=远程 HEAD）" },
      },
      required: [],
    },
  },
];
