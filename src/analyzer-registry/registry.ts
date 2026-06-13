/**
 * Analyzer Registry — 分析器注册表
 *
 * 配置驱动：读取 analyzers.conf.json，实例化适配器，按文件类型匹配。
 */

import { loadAnalyzerConfig } from "./state.js";
import { createJacgAdapter } from "./adapters/jacg.js";
import type { AnalyzerConfig, AnalyzerAdapter } from "./types.js";

// ═══════════════════════════════════════════════════════
// 适配器工厂
// ═══════════════════════════════════════════════════════

/** 已知分析器工厂映射：id → 创建函数 */
const ADAPTER_FACTORIES: Record<string, (config: AnalyzerConfig) => AnalyzerAdapter> = {
  jacg: (c) => createJacgAdapter(c),
};

// ═══════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════

/** 懒加载缓存 */
let _adapters: AnalyzerAdapter[] | null = null;

/**
 * 获取所有已启用且实例化的分析器适配器。
 * 结果缓存在模块级，除非显式刷新。
 */
export function getEnabledAnalyzers(): AnalyzerAdapter[] {
  if (_adapters) return _adapters;

  const config = loadAnalyzerConfig();
  const adapters: AnalyzerAdapter[] = [];

  for (const entry of config.analyzers) {
    if (!entry.enabled) continue;

    const factory = ADAPTER_FACTORIES[entry.id];
    if (factory) {
      adapters.push(factory(entry));
    } else {
      console.error(`[TIA] ⚠️ 未识别的分析器 ID "${entry.id}"，已跳过。支持的 ID: ${Object.keys(ADAPTER_FACTORIES).join(", ")}`);
    }
  }

  _adapters = adapters;
  return adapters;
}

/** 清除适配器缓存（配置变更后调用） */
export function invalidateAnalyzerCache(): void {
  _adapters = null;
}

/**
 * 根据变更文件列表匹配分析器。
 * 返回每个分析器需要处理的文件子集。
 */
export function matchAnalyzers(
  changedFiles: string[]
): Array<{ adapter: AnalyzerAdapter; matchedFiles: string[] }> {
  const analyzers = getEnabledAnalyzers();
  const results: Array<{ adapter: AnalyzerAdapter; matchedFiles: string[] }> = [];

  for (const analyzer of analyzers) {
    const matched = changedFiles.filter((f) =>
      analyzer.fileExtensions.some((ext) => f.endsWith(ext))
    );
    if (matched.length > 0) {
      results.push({ adapter: analyzer, matchedFiles: matched });
    }
  }

  return results;
}

/**
 * 获取所有未被任何分析器匹配的变更文件。
 * 这些文件将回退到文件级 glob 匹配。
 */
export function getUnmatchedFiles(
  changedFiles: string[],
  matched: Array<{ matchedFiles: string[] }>
): string[] {
  const matchedSet = new Set(matched.flatMap((m) => m.matchedFiles));
  return changedFiles.filter((f) => !matchedSet.has(f));
}
