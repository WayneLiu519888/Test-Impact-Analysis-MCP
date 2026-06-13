/**
 * TIA 工具模块 barrel — 聚合所有子模块的导出
 *
 * 模块拆分:
 *   schemas.ts     — TOOL_SCHEMAS 定义（~100 行）
 *   helpers.ts     — 适配器 / transport / 参数校验 / lastUsed 节流（~110 行）
 *   tia-init.ts    — TIA-init 客户端初始化引导（~120 行）
 *   repo-monitor.ts— status / check / reset 三合一（~145 行）
 *   repo-clone.ts  — 全量/增量克隆 + 远程指令（~225 行）
 */

import { ok, getTransportMode, throttleTouchApiKey, TRANSPORT } from "./helpers.js";
import { TOOL_SCHEMAS, type ToolVisibility } from "./schemas.js";
import { getRequestAuth } from "../security.js";
import { handleTiaInit } from "./tia-init.js";
import { handleRepoMonitor } from "./repo-monitor.js";
import { handleRepoClone } from "./repo-clone.js";
import { handleImpactAnalysis } from "../impact-analysis/handler.js";
import { handleTestRecommendation } from "../impact-analysis/recommendation.js";
import { handleRiskAssessment } from "../impact-analysis/risk-handler.js";

// Re-export schemas
export { TOOL_SCHEMAS };

// Re-export transport control
export { setTransportMode, TRANSPORT, getTransportMode } from "./helpers.js";

// ═══════════════════════════════════════════════════════
// Transport 分级过滤
// ═══════════════════════════════════════════════════════

/**
 * 根据当前 transport 模式过滤 Schema 列表，并剥离 TIA 私有元数据。
 *
 * - stdio 模式：返回全部工具
 * - HTTP 模式：仅返回 visibility="all" 的工具
 *
 * 过滤后返回的是纯 MCP 兼容格式（无 visibility 字段）。
 */
export function getFilteredSchemas(mode: string): Array<Record<string, unknown>> {
  return TOOL_SCHEMAS
    .filter((s) => {
      const v: ToolVisibility = (s as any).visibility ?? "all";
      return mode === TRANSPORT.STDIO || v === "all";
    })
    .map(({ visibility, ...rest }) => rest);
}

// ── 路由 ───────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    // HTTP 模式的 API KEY 校验（stdio 免检，TIA-init 免检）
    if (getTransportMode() === TRANSPORT.HTTP && toolName !== "TIA-init") {
      const auth = getRequestAuth();
      if (!auth || !auth.apiKeyEntry) {
        return ok("❌ 认证失败：请先执行 TIA-init 工具完成初始化引导。\n   TIA-init 将自动为你签发 API KEY 并注册命令文件。");
      }
      throttleTouchApiKey(auth.apiKeyEntry);
    }

    // Transport 分级拦截：HTTP 模式下拒绝 stdio-only 工具
    if (getTransportMode() === TRANSPORT.HTTP) {
      const schema = TOOL_SCHEMAS.find((s) => s.name === toolName);
      if (schema && (schema as any).visibility === "stdio-only") {
        return ok(`❌ 工具 "${toolName}" 仅限本地模式（stdio）使用。\n   HTTP 远程客户端不支持此工具，请切换到 stdio 模式。`);
      }
    }

    switch (toolName) {
      case "TIA-init":     return await handleTiaInit(args);
      case "repo_monitor": return await handleRepoMonitor(args);
      case "repo_clone":       return await handleRepoClone(args);
      case "impact_analysis":      return await handleImpactAnalysis(args);
      case "test_recommendation":  return await handleTestRecommendation(args);
      case "risk_assessment":      return await handleRiskAssessment(args);
      default: throw new Error(`未知工具: ${toolName}`);
    }
  } catch (err: any) {
    return ok(`❌ 错误: ${err.message}`);
  }
}
