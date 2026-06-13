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

import { ok, getTransportMode, throttleTouchApiKey } from "./helpers.js";
import { getRequestAuth } from "../security.js";
import { handleTiaInit } from "./tia-init.js";
import { handleRepoMonitor } from "./repo-monitor.js";
import { handleRepoClone } from "./repo-clone.js";

// Re-export schemas
export { TOOL_SCHEMAS } from "./schemas.js";

// Re-export transport control
export { setTransportMode } from "./helpers.js";

// ── 路由 ───────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  try {
    // HTTP 模式的 API KEY 校验（stdio 免检，TIA-init 免检）
    if (getTransportMode() === "http" && toolName !== "TIA-init") {
      const auth = getRequestAuth();
      if (!auth || !auth.apiKeyEntry) {
        return ok("❌ 认证失败：请先执行 TIA-init 工具完成初始化引导。\n   TIA-init 将自动为你签发 API KEY 并注册命令文件。");
      }
      throttleTouchApiKey(auth.apiKeyEntry);
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
