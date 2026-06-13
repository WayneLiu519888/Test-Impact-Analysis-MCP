/**
 * Impact Analysis 配置读写
 *
 * 文件:
 *   impact-rules.conf.json  ← 用户手写的规则配置
 *
 * 模式: 沿用 state.ts 的 safeJsonLoad + 种子文件创建
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { PROJECT_ROOT } from "../paths.js";
import type {
  ImpactConfigFile,
  ImpactRule,
} from "./types.js";
import { DEFAULT_IMPACT_CONFIG } from "./types.js";

// ═══════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════

const CONFIG_FILE = join(PROJECT_ROOT, "impact-rules.conf.json");

// ═══════════════════════════════════════════════════════
// 安全 JSON 加载
// ═══════════════════════════════════════════════════════

function safeJsonLoad<T>(filePath: string, fallback: () => T, label: string): T {
  if (!existsSync(filePath)) return fallback();
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (err: any) {
    console.error(`[TIA] ⚠️ ${label} 文件格式错误，已重置为默认值: ${err.message}`);
    return fallback();
  }
}

// ═══════════════════════════════════════════════════════
// 读写
// ═══════════════════════════════════════════════════════

/** 读取影响分析规则配置 */
export function loadImpactConfig(): ImpactConfigFile {
  const raw = safeJsonLoad<any>(CONFIG_FILE, () => ({ ...DEFAULT_IMPACT_CONFIG }), "impact-rules.conf.json");
  return {
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    autoInfer: {
      enabled: raw.autoInfer?.enabled ?? true,
      sourceToTestMapping: raw.autoInfer?.sourceToTestMapping ?? { "src/": "tests/" },
    },
  };
}

/** 写入影响分析规则配置 */
export function saveImpactConfig(config: ImpactConfigFile): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/** 确保配置文件存在（不存在则创建种子文件） */
export function ensureImpactConfig(): ImpactConfigFile {
  if (!existsSync(CONFIG_FILE)) {
    saveImpactConfig({ ...DEFAULT_IMPACT_CONFIG });
    console.error(`[TIA] 已创建种子配置文件: ${CONFIG_FILE}`);
    console.error("[TIA] 请编辑此文件添加影响分析规则");
    return { ...DEFAULT_IMPACT_CONFIG };
  }
  return loadImpactConfig();
}

/** 校验单条规则的合法性 */
export function validateRule(rule: ImpactRule, index: number): string[] {
  const errors: string[] = [];
  const prefix = `rules[${index}]`;

  if (!rule.id || typeof rule.id !== "string") {
    errors.push(`${prefix}.id 缺失或类型错误`);
  }
  if (!rule.name || typeof rule.name !== "string") {
    errors.push(`${prefix}.name 缺失或类型错误`);
  }
  if (!Array.isArray(rule.filePatterns) || rule.filePatterns.length === 0) {
    errors.push(`${prefix}.filePatterns 缺失或为空`);
  }
  if (!Array.isArray(rule.testPaths) || rule.testPaths.length === 0) {
    errors.push(`${prefix}.testPaths 缺失或为空`);
  }
  if (rule.riskLevel && !["high", "medium", "low"].includes(rule.riskLevel)) {
    errors.push(`${prefix}.riskLevel 必须为 high / medium / low`);
  }

  return errors;
}
