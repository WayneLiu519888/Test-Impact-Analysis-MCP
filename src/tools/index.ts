/**
 * TIA 工具模块 barrel — 路由分发
 */

import { ok } from "./helpers.js";
import { TOOL_SCHEMAS } from "./schemas.js";
import { handleRepoMonitor } from "./repo-monitor.js";
import { handleRepoClone } from "./repo-clone.js";
import { handleImpactAnalysis } from "../impact-analysis/handler.js";
import { handleTestRecommendation } from "../impact-analysis/recommendation.js";
import { handleRiskAssessment } from "../impact-analysis/risk-handler.js";

export { TOOL_SCHEMAS };
export { setTransportMode, TRANSPORT, getTransportMode } from "./helpers.js";

// ── 路由 ───────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    switch (toolName) {
      case "repo_monitor":      return await handleRepoMonitor(args);
      case "repo_clone":        return await handleRepoClone(args);
      case "impact_analysis":   return await handleImpactAnalysis(args);
      case "test_recommendation": return await handleTestRecommendation(args);
      case "risk_assessment":   return await handleRiskAssessment(args);
      default: throw new Error(`未知工具: ${toolName}`);
    }
  } catch (err: any) {
    return ok(`❌ 错误: ${err.message}`);
  }
}
