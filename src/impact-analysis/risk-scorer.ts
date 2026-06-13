/**
 * Risk Assessment — 变更风险量化引擎
 *
 * Phase 4: 基于 Phase 2 影响分析结果，计算风险评分和缓解建议。
 */

import type {
  RiskAssessment,
  RiskBreakdown,
  AssessmentLevel,
} from "./types.js";

// ═══════════════════════════════════════════════════════
// 评分常量
// ═══════════════════════════════════════════════════════

/** 单个变更文件基础分 */
const BASE_FILE_SCORE = 10;
/** 每增加一个文件的加分 */
const PER_FILE_SCORE = 5;
/** 文件风险分上限 */
const MAX_FILE_SCORE = 60;

/** 每个 high-risk 模块加分 */
const HIGH_MODULE_SCORE = 20;
/** 每个 medium-risk 模块加分 */
const MEDIUM_MODULE_SCORE = 8;
/** 模块风险分上限 */
const MAX_MODULE_SCORE = 60;

/** 平均置信度 < 50% 惩罚 */
const CONFIDENCE_PENALTY_50 = 10;
/** 平均置信度 < 30% 额外惩罚 */
const CONFIDENCE_PENALTY_30 = 20;

/** 风险等级阈值 */
const LEVEL_LOW = 30;
const LEVEL_MEDIUM = 60;
const LEVEL_HIGH = 85;

// ═══════════════════════════════════════════════════════
// 公共接口
// ═══════════════════════════════════════════════════════

/**
 * 计算单个仓库的风险评估结果。
 */
export function computeRiskAssessment(params: {
  repoName: string;
  fromSha: string;
  toSha: string;
  changedFiles: string[];
  highModules: number;
  mediumModules: number;
  lowModules: number;
  avgConfidence: number;
  topRisks: string[];
}): RiskAssessment {
  // 文件风险
  const fileCount = params.changedFiles.length;
  const fileRaw = fileCount === 0 ? 0
    : Math.min(BASE_FILE_SCORE + (fileCount - 1) * PER_FILE_SCORE, MAX_FILE_SCORE);

  // 模块风险
  const moduleRaw = Math.min(
    params.highModules * HIGH_MODULE_SCORE + params.mediumModules * MEDIUM_MODULE_SCORE,
    MAX_MODULE_SCORE
  );

  // 置信度惩罚
  let confidencePenalty = 0;
  if (params.avgConfidence < 30) {
    confidencePenalty = CONFIDENCE_PENALTY_30;
  } else if (params.avgConfidence < 50) {
    confidencePenalty = CONFIDENCE_PENALTY_50;
  }

  // 总分
  const score = Math.min(fileRaw + moduleRaw + confidencePenalty, 100);

  // 风险等级
  const level = computeLevel(score);

  // 建议
  const suggestions = buildSuggestions(fileCount, params.highModules, params.avgConfidence, level);

  return {
    repoName: params.repoName,
    fromSha: params.fromSha,
    toSha: params.toSha,
    score,
    level,
    breakdown: {
      fileRisk: { raw: fileRaw, max: MAX_FILE_SCORE, files: fileCount },
      moduleRisk: { raw: moduleRaw, max: MAX_MODULE_SCORE, highCount: params.highModules, mediumCount: params.mediumModules },
      confidencePenalty,
    },
    changedFileCount: fileCount,
    impactedModuleCount: params.highModules + params.mediumModules + params.lowModules,
    avgConfidence: params.avgConfidence,
    topRisks: params.topRisks,
    suggestions,
  };
}

// ═══════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════

function computeLevel(score: number): AssessmentLevel {
  if (score > LEVEL_HIGH) return "critical";
  if (score > LEVEL_MEDIUM) return "high";
  if (score > LEVEL_LOW) return "medium";
  return "low";
}

function buildSuggestions(
  fileCount: number,
  highModules: number,
  avgConfidence: number,
  level: AssessmentLevel
): string[] {
  const suggestions: string[] = [];

  if (highModules >= 2) {
    suggestions.push("多个高风险模块被触发，建议分批测试并逐个验证");
  }
  if (fileCount >= 10) {
    suggestions.push(`变更文件较多（${fileCount} 个），建议拆分提交或分批审查`);
  }
  if (avgConfidence < 50) {
    suggestions.push("存在大量自动推断的测试（置信度低），建议人工确认测试范围");
  }

  switch (level) {
    case "critical":
      suggestions.push("🔴 严重风险：建议在合并前完成全部测试 + 代码审查 + QA 验收");
      break;
    case "high":
      suggestions.push("🟠 高风险：优先运行强烈建议的测试，完成代码审查后再合并");
      break;
    case "medium":
      suggestions.push("🟡 中等风险：运行建议的测试，标准 CR 流程即可");
      break;
    case "low":
      suggestions.push("🟢 低风险：运行关键测试即可，可考虑 fast-track 合并");
      break;
  }

  if (suggestions.length === 0) {
    suggestions.push("无明显风险因素，按常规流程处理");
  }

  return suggestions;
}

// 导出计分常量供测试
export {
  BASE_FILE_SCORE, PER_FILE_SCORE, MAX_FILE_SCORE,
  HIGH_MODULE_SCORE, MEDIUM_MODULE_SCORE, MAX_MODULE_SCORE,
  CONFIDENCE_PENALTY_50, CONFIDENCE_PENALTY_30,
  LEVEL_LOW, LEVEL_MEDIUM, LEVEL_HIGH,
  computeLevel,
};
