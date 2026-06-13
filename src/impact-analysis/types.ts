/**
 * Impact Analysis 类型定义
 *
 * Phase 2: 代码变更 → 受影响测试用例分析
 */

// ═══════════════════════════════════════════════════════
// 配置文件层（用户手写）
// ═══════════════════════════════════════════════════════

/** 风险等级 */
export type RiskLevel = "high" | "medium" | "low";

/** 单条影响分析规则 */
export interface ImpactRule {
  /** 规则唯一 ID */
  id: string;
  /** 规则名称（人类可读） */
  name: string;
  /** 规则描述 */
  description?: string;
  /** 文件匹配模式（glob 风格：src/auth/**, src/login/*.ts） */
  filePatterns: string[];
  /** 受影响的测试路径列表 */
  testPaths: string[];
  /** 风险等级 */
  riskLevel: RiskLevel;
}

/** 自动推断配置 */
export interface AutoInferConfig {
  /** 是否启用自动推断 */
  enabled: boolean;
  /** 源码到测试路径映射: { "src/": "tests/" } */
  sourceToTestMapping: Record<string, string>;
}

/** impact-rules.conf.json 文件格式 */
export interface ImpactConfigFile {
  /** 规则列表 */
  rules: ImpactRule[];
  /** 自动推断配置（未命中规则时使用） */
  autoInfer: AutoInferConfig;
}

// ═══════════════════════════════════════════════════════
// 分析结果层
// ═══════════════════════════════════════════════════════

/** 置信度百分比 */
export type Confidence = number; // 0-100

/** 单条匹配结果 */
export interface ImpactMatch {
  /** 匹配的规则 ID */
  ruleId: string;
  /** 规则名称 */
  ruleName: string;
  /** 变更文件 */
  changedFile: string;
  /** 匹配到的测试路径 */
  testPath: string;
  /** 置信度 (0-100) */
  confidence: Confidence;
  /** 匹配方式描述 */
  matchType: "exact" | "directory" | "wildcard" | "inferred";
}

/** 按受影响测试模块聚合的结果 */
export interface ImpactModule {
  /** 规则 ID（或 "auto-inferred"） */
  ruleId: string;
  /** 模块名称 */
  name: string;
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 测试路径（去重） */
  testPaths: string[];
  /** 触发变更的文件列表 */
  changedFiles: string[];
  /** 聚合后的最高置信度 */
  confidence: Confidence;
}

/** 单个仓库的影响分析结果 */
export interface RepoImpactResult {
  /** 仓库名 */
  repoName: string;
  /** 起始 SHA */
  fromSha: string;
  /** 目标 SHA */
  toSha: string;
  /** 变更文件列表 */
  changedFiles: string[];
  /** 受影响的测试模块 */
  impactedModules: ImpactModule[];
  /** 匹配详情 */
  matches: ImpactMatch[];
}

// ═══════════════════════════════════════════════════════
// 默认配置
// ═══════════════════════════════════════════════════════

/** 默认的自动推断配置 */
export const DEFAULT_AUTO_INFER: AutoInferConfig = {
  enabled: true,
  sourceToTestMapping: { "src/": "tests/" },
};

/** 默认配置文件内容 */
export const DEFAULT_IMPACT_CONFIG: ImpactConfigFile = {
  rules: [],
  autoInfer: DEFAULT_AUTO_INFER,
};
