/**
 * 分析引擎抽象层 — 核心类型定义
 *
 * 每个分析引擎（dependency-cruiser / 未来引擎）实现 AnalysisEngine 接口，
 * 产出 PanoramaIndex 全景索引，由 TIA 统一消费。
 */

import type { MonitorEntry } from "../types.js";

// ═══════════════════════════════════════════════════════
// 全景索引（引擎产出物）
// ═══════════════════════════════════════════════════════

/** API 端点 */
export interface ApiEndpoint {
  url: string;
  httpMethod: string;
  handlerFqn: string;
  controllerClass?: string;
  filePath: string;
  line: number;
  module?: string;
}

/** MQ 消费者 */
export interface MqConsumer {
  queueOrTopic: string;
  mqType: "rabbitmq" | "kafka" | "rocketmq" | "other";
  handlerFqn: string;
  filePath: string;
  line: number;
}

/** 定时任务 */
export interface ScheduledJob {
  name: string;
  triggerType: "@Scheduled" | "@XxlJob" | "@ElasticJob" | "other";
  cronOrTrigger: string;
  handlerFqn: string;
  filePath: string;
  line: number;
}

/** 全景索引摘要 */
export interface PanoramaSummary {
  totalFiles: number;
  totalClasses: number;
  totalMethods: number;
  totalCallEdges: number;
  totalApis: number;
  totalMqConsumers: number;
  totalJobs: number;
  parseTimeMs: number;
}

/**
 * 全景索引 — 落地为 .tia/{branch}/panorama-{engineId}.json
 *
 * 这是引擎产出物和 TIA 消费物的"文件契约"。
 * 每个引擎独立产出自己的 PanoramaIndex，由聚合模块统一消费。
 */
export interface PanoramaIndex {
  /** 元信息 */
  repoName: string;
  branch: string;
  headSha: string;
  indexedAt: string;       // ISO 8601
  engineId: string;        // "depcruiser" | ...
  engineVersion: string;   // 引擎版本号（用于兼容性检测）

  /** 摘要统计 */
  summary: PanoramaSummary;

  /** 调用图: callerFqn → [calleeFqn, ...] */
  callGraph: Record<string, string[]>;

  /** 逆向调用图: calleeFqn → [callerFqn, ...]（预构建，BFS 毫秒级） */
  reverseCallGraph: Record<string, string[]>;

  /** 符号表: 文件路径 → 包含的方法 FQN 列表 */
  fileToMethods: Record<string, string[]>;

  /** API 端点字典 */
  apiEndpoints: ApiEndpoint[];

  /** MQ 消费者字典 */
  mqConsumers: MqConsumer[];

  /** 定时任务字典 */
  scheduledJobs: ScheduledJob[];

  /** 终端方法集合: API + MQ + Job handler 的 FQN 并集 */
  terminalMethods: string[];
}

// ═══════════════════════════════════════════════════════
// 调用链分析结果
// ═══════════════════════════════════════════════════════

/** 一条调用链路径 */
export interface CallChainPath {
  chain: string[];   // [被改方法, 调用者1, ..., 端点方法]
  depth: number;     // 路径步数
}

/** 受影响的端点 */
export interface ImpactedEndpoint<T> {
  endpoint: T;
  chains: CallChainPath[];
  sources: string[];   // 命中的引擎 ID 列表
}

/** 调用链影响分析结果（单引擎） */
export interface CallChainImpact {
  engineId: string;
  changedMethods: string[];
  impactedApis: ImpactedEndpoint<ApiEndpoint>[];
  impactedMqs: ImpactedEndpoint<MqConsumer>[];
  impactedJobs: ImpactedEndpoint<ScheduledJob>[];
  degraded: boolean;
  degradationReason?: string;
}

// ═══════════════════════════════════════════════════════
// 引擎抽象层
// ═══════════════════════════════════════════════════════

/** 引擎能力声明 */
export interface EngineCapabilities {
  /** 支持的文件扩展名（含 . 前缀） */
  fileExtensions: string[];
  /** 支持的分析模式 */
  modes: ("full" | "incremental")[];
  /** 分析粒度 */
  granularity: "method" | "class" | "file" | "module";
  /** 是否具备框架感知（Spring 注解等） */
  frameworkAwareness: boolean;
}

/** 引擎运行器配置 */
export type RunnerConfig =
  | { type: "exec"; command: string; args: string[]; timeoutMs: number }
  | { type: "mcp"; url: string; timeoutMs: number }
  | { type: "http"; url: string; timeoutMs: number };

/** 引擎运行结果 */
export interface EngineAnalysisResult {
  engineId: string;
  engineName: string;
  confidenceWeight: number;
  /** 全景索引（null = 引擎失败或不可用） */
  panoramaIndex: PanoramaIndex | null;
  /** 调用链影响列表 */
  impacts: CallChainImpact[];
  /** 错误信息（null = 正常） */
  error: string | null;
}

/**
 * 分析引擎接口。
 * 任何新的分析工具只需实现此接口即可接入 TIA。
 */
export interface AnalysisEngine {
  readonly id: string;
  readonly name: string;
  readonly capabilities: EngineCapabilities;
  /** 可信度权重 0-100 */
  readonly confidenceWeight: number;

  /** 全量分析：对指定代码路径生成完整 PanoramaIndex */
  runFullAnalysis(repoPath: string, branch: string): Promise<PanoramaIndex | null>;

  /** 增量分析：基于已有索引+变更文件更新（可选） */
  runIncrementalAnalysis?(
    repoPath: string, branch: string,
    baseIndex: PanoramaIndex, changedFiles: string[]
  ): Promise<PanoramaIndex | null>;

  /** 可用性检测（惰性调用）。返回 null = 可用，返回 string = 不可用原因 */
  checkAvailability(): Promise<string | null>;
}

// ═══════════════════════════════════════════════════════
// 配置文件层（engines.conf.json）
// ═══════════════════════════════════════════════════════

/** 单条引擎配置 */
export interface EngineConfig {
  id: string;
  name: string;
  enabled: boolean;
  fileExtensions: string[];
  confidenceWeight: number;
  capabilities: EngineCapabilities;
  runner: RunnerConfig;
  description?: string;
}

/** engines.conf.json 文件格式 */
export interface EngineConfigFile {
  engines: EngineConfig[];
}

// ═══════════════════════════════════════════════════════
// 聚合引擎输出
// ═══════════════════════════════════════════════════════

/** 统一影响结果（聚合后） */
export interface UnifiedImpactResult {
  repoName: string;
  fromSha: string;
  toSha: string;
  changedFiles: string[];
  /** 被所有引擎覆盖的文件 */
  engineFiles: string[];
  /** 无引擎覆盖的文件（走 glob 兜底） */
  uncoveredFiles: string[];
  /** 引擎级调用链影响 */
  impacts: CallChainImpact[];
  /** 引擎参与统计 */
  participants: { engineId: string; engineName: string; status: "ok" | "degraded"; contributedMethods: number }[];
}
