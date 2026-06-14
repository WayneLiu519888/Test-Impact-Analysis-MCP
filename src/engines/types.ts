/**
 * 分析引擎类型定义 — 仅保留被实际消费的类型
 *
 * 全景索引 (PanoramaIndex) 是引擎产出物和 TIA 消费物的"文件契约"。
 * 落地路径: .tia/{branch}/panorama-{engineId}.json
 */

// ═══════════════════════════════════════════════════════
// 全景索引（引擎产出物）
// ═══════════════════════════════════════════════════════

/** API 端点 */
export interface ApiEndpoint {
  url: string;
  httpMethod: string;
  handlerFqn: string;
  filePath: string;
  line: number;
}

/** 全景索引摘要 */
export interface PanoramaSummary {
  totalFiles: number;
  totalMethods: number;
  totalCallEdges: number;
  totalApis: number;
  parseTimeMs: number;
}

/** 全景索引 */
export interface PanoramaIndex {
  repoName: string;
  branch: string;
  headSha: string;
  indexedAt: string;
  engineId: string;
  engineVersion: string;
  summary: PanoramaSummary;
  callGraph: Record<string, string[]>;
  reverseCallGraph: Record<string, string[]>;
  fileToMethods: Record<string, string[]>;
  apiEndpoints: ApiEndpoint[];
  terminalMethods: string[];
}

// ═══════════════════════════════════════════════════════
// 调用链分析结果
// ═══════════════════════════════════════════════════════

export interface CallChainPath {
  chain: string[];
  depth: number;
}

export interface ImpactedEndpoint<T> {
  endpoint: T;
  chains: CallChainPath[];
  sources: string[];
}

export interface CallChainImpact {
  engineId: string;
  changedMethods: string[];
  impactedApis: ImpactedEndpoint<ApiEndpoint>[];
  degraded: boolean;
  degradationReason?: string;
}

// ═══════════════════════════════════════════════════════
// 配置文件层（engines.conf.json）
// ═══════════════════════════════════════════════════════

/** 引擎运行器配置（仅 exec 子进程模式） */
export type RunnerConfig = {
  type: "exec";
  command: string;
  args: string[];
  timeoutMs: number;
};

/** 内置适配器配置 */
export interface BuiltinAdapterConfig {
  type: "builtin";
  adapterId: string;
  binaryPath: string;
  timeoutMs: number;
  indexOptions: { forceReindex: boolean };
  callTraceDepth: number;
}

/** 单条引擎配置 */
export interface EngineConfig {
  id: string;
  name: string;
  enabled: boolean;
  fileExtensions: string[];
  confidenceWeight: number;
  runner: RunnerConfig;
  description?: string;
  adapter?: BuiltinAdapterConfig;
}

/** engines.conf.json 文件格式 */
export interface EngineConfigFile {
  engines: EngineConfig[];
}

// ═══════════════════════════════════════════════════════
// 聚合引擎输出
// ═══════════════════════════════════════════════════════

export interface UnifiedImpactResult {
  repoName: string;
  fromSha: string;
  toSha: string;
  changedFiles: string[];
  engineFiles: string[];
  uncoveredFiles: string[];
  impacts: CallChainImpact[];
  participants: {
    engineId: string;
    engineName: string;
    status: "ok" | "degraded";
    contributedMethods: number;
  }[];
}
