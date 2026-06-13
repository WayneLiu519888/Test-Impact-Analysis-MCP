/**
 * Analyzer Registry 类型定义
 *
 * Phase 5a: MCP 编织层 — 分析器适配器接口
 */

import type { MonitorEntry } from "../types.js";

// ═══════════════════════════════════════════════════════
// 配置文件层
// ═══════════════════════════════════════════════════════

/** MCP 连接配置（互斥：stdio 或 HTTP） */
export type AnalyzerConnection =
  | { transport: "stdio"; command: string; args?: string[] }
  | { transport: "http"; url: string; headers?: Record<string, string> };

/** 单条分析器配置 */
export interface AnalyzerConfig {
  /** 分析器唯一 ID（如 "jacg"、"sql-analyzer"） */
  id: string;
  /** 分析器名称（人类可读） */
  name: string;
  /** 支持的文件扩展名列表（含 . 前缀，如 [".java", ".kt"]） */
  fileExtensions: string[];
  /** 是否启用 */
  enabled: boolean;
  /** MCP 连接信息 */
  connection: AnalyzerConnection;
  /** 描述（可选） */
  description?: string;
}

/** analyzers.conf.json 文件格式 */
export interface AnalyzerConfigFile {
  analyzers: AnalyzerConfig[];
}

// ═══════════════════════════════════════════════════════
// 分析结果层
// ═══════════════════════════════════════════════════════

/** 单条影响项 */
export interface AnalyzerImpactItem {
  /** 类型：方法 / SQL / 类 / 函数 */
  type: "method" | "sql" | "class" | "function";
  /** 名称（如 com.example.Service:getUser） */
  name: string;
  /** 受影响的测试路径 */
  testPaths: string[];
  /** 置信度 (0-100) */
  confidence: number;
  /** 调用链文本（可选，如 JACG 返回的树形图中所示） */
  callChain?: string;
}

/** 分析器返回结果 */
export interface AnalyzerResult {
  /** 分析器 ID */
  analyzerId: string;
  /** 分析器名称 */
  analyzerName: string;
  /** 受影响项列表 */
  impactedItems: AnalyzerImpactItem[];
  /** 是否为降级结果（true = 分析器不可用，使用文件匹配代替） */
  degraded: boolean;
}

// ═══════════════════════════════════════════════════════
// 适配器接口
// ═══════════════════════════════════════════════════════

/**
 * 分析器适配器接口。
 * 每个下游分析器（JACG、SQL Analyzer 等）实现此接口。
 */
export interface AnalyzerAdapter {
  /** 分析器唯一 ID */
  readonly id: string;
  /** 分析器名称 */
  readonly name: string;
  /** 支持的文件扩展名 */
  readonly fileExtensions: string[];

  /**
   * 检测分析器是否可用（MCP 连接正常 + 工具可调用）。
   * 不可用时返回 false，TIA 自动降级为文件匹配。
   */
  isAvailable(): Promise<boolean>;

  /**
   * 分析变更文件对测试的影响。
   *
   * @param repo         监控仓库信息
   * @param changedFiles 变更文件路径列表
   * @param fromSha      起始 SHA
   * @param toSha        目标 SHA
   * @returns 分析结果。分析器不可用或无结果时返回 null（触发降级）
   */
  analyze(
    repo: MonitorEntry,
    changedFiles: string[],
    fromSha: string,
    toSha: string
  ): Promise<AnalyzerResult | null>;
}

// ═══════════════════════════════════════════════════════
// 默认配置
// ═══════════════════════════════════════════════════════

/** 默认配置文件内容 */
export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfigFile = {
  analyzers: [
    {
      id: "jacg",
      name: "Java 调用链分析",
      fileExtensions: [".java"],
      enabled: false,
      description: "基于 java-all-call-graph-server 的 Java 方法调用链分析。需先安装 JACG MCP Server。",
      connection: {
        transport: "http",
        url: "http://127.0.0.1:34567/mcp/sse",
      },
    },
  ],
};
