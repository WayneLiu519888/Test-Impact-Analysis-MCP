/**
 * Analyzer Registry 配置读写
 *
 * 文件:
 *   analyzers.conf.json  ← 用户手写的分析器注册配置
 *
 * 模式: 沿用 impact-analysis/state.ts 的 safeJsonLoad + 种子文件
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { PROJECT_ROOT } from "../paths.js";
import type { AnalyzerConfigFile, AnalyzerConfig } from "./types.js";
import { DEFAULT_ANALYZER_CONFIG } from "./types.js";

const CONFIG_FILE = join(PROJECT_ROOT, "analyzers.conf.json");

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

/** 读取分析器配置 */
export function loadAnalyzerConfig(): AnalyzerConfigFile {
  const raw = safeJsonLoad<any>(CONFIG_FILE, () => ({ ...DEFAULT_ANALYZER_CONFIG }), "analyzers.conf.json");
  return {
    analyzers: Array.isArray(raw.analyzers) ? raw.analyzers : [],
  };
}

/** 写入分析器配置 */
export function saveAnalyzerConfig(config: AnalyzerConfigFile): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/** 确保配置文件存在（不存在则创建种子文件） */
export function ensureAnalyzerConfig(): AnalyzerConfigFile {
  if (!existsSync(CONFIG_FILE)) {
    saveAnalyzerConfig({ ...DEFAULT_ANALYZER_CONFIG });
    console.error(`[TIA] 已创建种子配置文件: ${CONFIG_FILE}`);
    console.error("[TIA] 提示：编辑此文件启用下游分析器（如 JACG）");
    return { ...DEFAULT_ANALYZER_CONFIG };
  }
  return loadAnalyzerConfig();
}

/** 校验单条分析器配置 */
export function validateAnalyzer(analyzer: AnalyzerConfig, index: number): string[] {
  const errors: string[] = [];
  const prefix = `analyzers[${index}]`;

  if (!analyzer.id || typeof analyzer.id !== "string") {
    errors.push(`${prefix}.id 缺失或类型错误`);
  }
  if (!analyzer.name || typeof analyzer.name !== "string") {
    errors.push(`${prefix}.name 缺失或类型错误`);
  }
  if (!Array.isArray(analyzer.fileExtensions) || analyzer.fileExtensions.length === 0) {
    errors.push(`${prefix}.fileExtensions 缺失或为空`);
  }
  if (!analyzer.connection) {
    errors.push(`${prefix}.connection 缺失`);
  }

  return errors;
}
