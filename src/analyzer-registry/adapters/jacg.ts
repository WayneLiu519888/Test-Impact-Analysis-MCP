/**
 * JACG MCP 适配器 — Java 调用链分析
 *
 * 封装对 java-all-call-graph-server (MCP 版) 的调用。
 *
 * 当前阶段（Phase 5a）：
 *   - 可用性检测（HTTP 健康检查 / TCP 端口探测）
 *   - 不可用时返回 null → TIA 自动降级为文件匹配
 *   - 实际 MCP 调用链分析留到 Phase 5b 实现
 */

import type { AnalyzerAdapter, AnalyzerConfig, AnalyzerResult } from "../types.js";
import type { MonitorEntry } from "../../types.js";

// ═══════════════════════════════════════════════════════
// 工厂
// ═══════════════════════════════════════════════════════

export function createJacgAdapter(config: AnalyzerConfig): AnalyzerAdapter {
  return new JacgAdapter(config);
}

// ═══════════════════════════════════════════════════════
// 实现
// ═══════════════════════════════════════════════════════

class JacgAdapter implements AnalyzerAdapter {
  readonly id: string;
  readonly name: string;
  readonly fileExtensions: string[];

  private readonly connection: AnalyzerConfig["connection"];

  constructor(config: AnalyzerConfig) {
    this.id = config.id;
    this.name = config.name;
    this.fileExtensions = config.fileExtensions;
    this.connection = config.connection;
  }

  /**
   * 检测 JACG MCP 是否可用。
   *
   * HTTP 模式：发起 HEAD/GET 到 SSE 端点，检查 2xx 响应。
   * stdio 模式：检查启动命令是否可执行。
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (this.connection.transport === "http") {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 3000);
        try {
          const res = await fetch(this.connection.url.replace("/mcp/sse", "/health"), {
            signal: ctrl.signal,
          });
          return res.ok;
        } finally {
          clearTimeout(timeout);
        }
      }
      // stdio 模式：暂不探测，假设可用
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 分析 Java 代码变更对测试的影响。
   *
   * 当前阶段（5a）：返回 null 触发降级。
   * Phase 5b 将实现实际的 MCP CallTool 调用。
   */
  async analyze(
    _repo: MonitorEntry,
    changedFiles: string[],
    _fromSha: string,
    _toSha: string
  ): Promise<AnalyzerResult | null> {
    // 先做可用性检测
    const available = await this.isAvailable();

    if (!available) {
      // JACG 不可用，返回 null → 触发降级到文件匹配
      return null;
    }

    // Phase 5a：可用但没有实际调用逻辑，返回降级标记的结果
    // Phase 5b 将在此处实施 MCP CallTool 调用
    return {
      analyzerId: this.id,
      analyzerName: this.name,
      impactedItems: [
        {
          type: "method",
          name: `[暂未实现 — ${changedFiles.length} 个 Java 文件变更]`,
          testPaths: [],
          confidence: 0,
          callChain: "Phase 5a: 可用性检测通过，实际调用链分析在 Phase 5b 实现",
        },
      ],
      degraded: true,
    };
  }
}
