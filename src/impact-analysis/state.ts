/**
 * Impact Analysis 两级规则配置读写
 *
 * 文件:
 *   impact-rules.conf.json          ← 第1级，根目录，通用规则，可提交GitHub
 *   enterprise/impact-rules.conf.json ← 第2级，企业规则，.gitignore自动排除
 *
 * 合并策略:
 *   1. 同时加载两级配置
 *   2. 同 id 企业规则覆盖通用规则
 *   3. appliesTo 按仓库筛选（names/modules/repoTypes/platforms 维度 AND 关系）
 */

import { writeFileSync, existsSync, copyFileSync } from "fs";
import { join } from "path";
import { PROJECT_ROOT, ensureEnterpriseDir } from "../paths.js";
import { safeJsonLoad } from "../shared/json-utils.js";
import type { ImpactConfigFile, ImpactRule, RuleFilterContext } from "./types.js";
import { DEFAULT_IMPACT_CONFIG } from "./types.js";

// ═══════════════════════════════════════════════════════
// 常量 — 固定路径，不走 resolveConfigPath
// ═══════════════════════════════════════════════════════

/** 第1级：通用规则路径 */
const GLOBAL_CONFIG_PATH = join(PROJECT_ROOT, "impact-rules.conf.json");

/** 第2级：企业规则路径 */
const ENTERPRISE_CONFIG_PATH = join(PROJECT_ROOT, "enterprise", "impact-rules.conf.json");

/** 模板文件路径 */
const EXAMPLE_CONFIG_PATH = join(PROJECT_ROOT, "examples", "impact-rules.conf.example.json");

// ═══════════════════════════════════════════════════════
// 加载子函数
// ═══════════════════════════════════════════════════════

/** 加载原始 JSON 并规范化 rules 数组和 autoInfer 字段 */
function normalizeRaw(raw: Record<string, unknown>): ImpactConfigFile {
  const autoInfer = (raw.autoInfer ?? {}) as Record<string, unknown>;
  return {
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    autoInfer: {
      enabled: autoInfer.enabled !== false, // 默认 true
      sourceToTestMapping: (typeof autoInfer.sourceToTestMapping === "object" ? autoInfer.sourceToTestMapping : { "src/": "tests/" }) as Record<string, string>,
    },
  };
}

/** 仅从根目录加载通用规则配置 */
function loadGlobalImpactConfig(): ImpactConfigFile {
  const raw = safeJsonLoad<any>(GLOBAL_CONFIG_PATH, () => ({ ...DEFAULT_IMPACT_CONFIG }), "impact-rules.conf.json");
  return normalizeRaw(raw);
}

/** 仅从 enterprise/ 加载企业规则配置（文件不存在返回空规则） */
function loadEnterpriseImpactConfig(): ImpactConfigFile {
  if (!existsSync(ENTERPRISE_CONFIG_PATH)) {
    return { rules: [], autoInfer: { ...DEFAULT_IMPACT_CONFIG.autoInfer } };
  }
  const raw = safeJsonLoad<any>(ENTERPRISE_CONFIG_PATH, () => ({ rules: [], autoInfer: {} }), "enterprise/impact-rules.conf.json");
  return normalizeRaw(raw);
}

// ═══════════════════════════════════════════════════════
// 合并逻辑
// ═══════════════════════════════════════════════════════

/**
 * 合并通用规则和企业规则。
 *   同 id → 企业规则覆盖通用规则
 *   不同 id → 通用规则保留（企业新增的追加到末尾）
 * autoInfer：企业配置若定义了 autoInfer，则覆盖通用的 autoInfer
 */
function mergeRules(globalRules: ImpactRule[], enterpriseRules: ImpactRule[]): ImpactRule[] {
  if (enterpriseRules.length === 0) return globalRules;

  const ruleMap = new Map<string, ImpactRule>();
  for (const rule of globalRules) ruleMap.set(rule.id, rule);
  for (const rule of enterpriseRules) ruleMap.set(rule.id, rule); // 同 id 企业覆盖

  const result: ImpactRule[] = [];
  const addedIds = new Set<string>();

  // 先放通用规则（企业覆盖的用企业版本）
  for (const rule of globalRules) {
    const finalRule = ruleMap.get(rule.id) ?? rule;
    if (!addedIds.has(finalRule.id)) {
      result.push(finalRule);
      addedIds.add(finalRule.id);
    }
  }

  // 再放纯新增的企业规则
  for (const rule of enterpriseRules) {
    if (!addedIds.has(rule.id)) {
      result.push(rule);
      addedIds.add(rule.id);
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════
// appliesTo 筛选
// ═══════════════════════════════════════════════════════

/**
 * 按仓库上下文筛选规则。
 * appliesTo 各维度之间是 AND 关系。
 */
function filterByAppliesTo(rules: ImpactRule[], ctx: RuleFilterContext): ImpactRule[] {
  return rules.filter((rule) => {
    const filter = rule.appliesTo;
    if (!filter) return true;

    if (filter.names && filter.names.length > 0 && !filter.names.includes(ctx.name)) return false;
    if (filter.modules && filter.modules.length > 0 && !filter.modules.includes(ctx.module)) return false;
    if (filter.repoTypes && filter.repoTypes.length > 0 && !filter.repoTypes.includes(ctx.repoType)) return false;
    if (filter.platforms && filter.platforms.length > 0 && !filter.platforms.includes(ctx.platform)) return false;

    return true;
  });
}

// ═══════════════════════════════════════════════════════
// 公共接口
// ═══════════════════════════════════════════════════════

/**
 * 加载影响分析规则配置（两级合并 + 可选仓库筛选）。
 * @param repo  可选的仓库上下文。传入则按 appliesTo 筛选；不传返回全量合并规则。
 */
export function loadImpactConfig(repo?: RuleFilterContext): ImpactConfigFile {
  const globalConfig = loadGlobalImpactConfig();
  const enterpriseConfig = loadEnterpriseImpactConfig();

  const mergedRules = mergeRules(globalConfig.rules, enterpriseConfig.rules);

  const hasEnterpriseAutoInfer =
    Object.keys(enterpriseConfig.autoInfer.sourceToTestMapping).length > 0 ||
    enterpriseConfig.autoInfer.enabled !== DEFAULT_IMPACT_CONFIG.autoInfer.enabled;

  const finalAutoInfer = hasEnterpriseAutoInfer ? enterpriseConfig.autoInfer : globalConfig.autoInfer;
  const finalRules = repo ? filterByAppliesTo(mergedRules, repo) : mergedRules;

  return { rules: finalRules, autoInfer: finalAutoInfer };
}

/**
 * 写入通用规则配置（仅操作第1级根目录文件）。
 * 企业规则不通过代码自动写入，由用户手动编辑。
 */
export function saveImpactConfig(config: ImpactConfigFile): void {
  writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/**
 * 确保配置文件存在。
 * 1. 通用规则不存在 → 创建种子文件（空规则 + 默认 autoInfer）
 * 2. 企业规则目录不存在 → 自动创建 enterprise/ 目录
 * 3. 企业规则不存在 → 从 examples/ 复制模板
 */
export function ensureImpactConfig(): ImpactConfigFile {
  if (!existsSync(GLOBAL_CONFIG_PATH)) {
    saveImpactConfig({ ...DEFAULT_IMPACT_CONFIG });
    console.error(`[TIA] 已创建种子配置文件: ${GLOBAL_CONFIG_PATH}`);
  }

  ensureEnterpriseDir();
  if (!existsSync(ENTERPRISE_CONFIG_PATH)) {
    if (existsSync(EXAMPLE_CONFIG_PATH)) {
      copyFileSync(EXAMPLE_CONFIG_PATH, ENTERPRISE_CONFIG_PATH);
      console.error(`[TIA] 已从模板创建: ${ENTERPRISE_CONFIG_PATH}`);
    } else {
      writeFileSync(ENTERPRISE_CONFIG_PATH, JSON.stringify({ rules: [], autoInfer: {} }, null, 2), { encoding: "utf-8", mode: 0o600 });
      console.error(`[TIA] 已创建空企业配置: ${ENTERPRISE_CONFIG_PATH}`);
    }
  }

  return loadImpactConfig();
}

/** 校验单条规则的合法性 */
export function validateRule(rule: ImpactRule, index: number): string[] {
  const errors: string[] = [];
  const prefix = `rules[${index}]`;

  if (!rule.id || typeof rule.id !== "string") errors.push(`${prefix}.id 缺失或类型错误`);
  if (!rule.name || typeof rule.name !== "string") errors.push(`${prefix}.name 缺失或类型错误`);
  if (!Array.isArray(rule.filePatterns) || rule.filePatterns.length === 0) errors.push(`${prefix}.filePatterns 缺失或为空`);
  if (!Array.isArray(rule.testPaths) || rule.testPaths.length === 0) errors.push(`${prefix}.testPaths 缺失或为空`);
  if (rule.riskLevel && !["high", "medium", "low"].includes(rule.riskLevel)) errors.push(`${prefix}.riskLevel 必须为 high / medium / low`);

  if (rule.appliesTo) {
    const at = rule.appliesTo;
    if (at.names !== undefined && (!Array.isArray(at.names) || at.names.length === 0)) errors.push(`${prefix}.appliesTo.names 必须为非空数组`);
    if (at.modules !== undefined && (!Array.isArray(at.modules) || at.modules.length === 0)) errors.push(`${prefix}.appliesTo.modules 必须为非空数组`);
    if (at.repoTypes !== undefined) {
      if (!Array.isArray(at.repoTypes) || at.repoTypes.length === 0) errors.push(`${prefix}.appliesTo.repoTypes 必须为非空数组`);
      else for (const rt of at.repoTypes) { if (!["frontend", "backend"].includes(rt)) errors.push(`${prefix}.appliesTo.repoTypes 中 "${rt}" 无效`); }
    }
    if (at.platforms !== undefined) {
      if (!Array.isArray(at.platforms) || at.platforms.length === 0) errors.push(`${prefix}.appliesTo.platforms 必须为非空数组`);
      else for (const p of at.platforms) { if (!["github", "local", "generic"].includes(p)) errors.push(`${prefix}.appliesTo.platforms 中 "${p}" 无效`); }
    }
  }

  return errors;
}

// 导出内部函数供单元测试
export { mergeRules, filterByAppliesTo, loadGlobalImpactConfig, loadEnterpriseImpactConfig };
