/**
 * 引擎注册表 — 配置驱动，惰性初始化
 *
 * 读取 engines.conf.json → 按文件扩展名匹配 → 惰性实例化引擎
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { PROJECT_ROOT } from "../paths.js";
import type { EngineConfigFile, EngineConfig } from "./types.js";

// ═══════════════════════════════════════════════════════
// 配置文件路径
// ═══════════════════════════════════════════════════════

const CONFIG_FILE = join(PROJECT_ROOT, "engines.conf.json");

// ═══════════════════════════════════════════════════════
// 默认配置
// ═══════════════════════════════════════════════════════

const DEFAULT_CONFIG: EngineConfigFile = {
  engines: [],
};

// ═══════════════════════════════════════════════════════
// 配置读写
// ═══════════════════════════════════════════════════════

function safeLoad<T>(path: string, fallback: T, label: string): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch (err: any) {
    console.error(`[TIA] ⚠️ ${label} 格式错误，已重置为默认值: ${err.message}`);
    return fallback;
  }
}

/** 加载引擎配置 */
export function loadEngineConfig(): EngineConfigFile {
  const raw = safeLoad<any>(CONFIG_FILE, { ...DEFAULT_CONFIG }, "engines.conf.json");
  return {
    engines: Array.isArray(raw.engines) ? raw.engines : [],
  };
}

/** 写入引擎配置 */
export function saveEngineConfig(config: EngineConfigFile): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/** 确保配置文件存在（不存在则创建种子文件） */
export function ensureEngineConfig(): void {
  if (!existsSync(CONFIG_FILE)) {
    saveEngineConfig({ ...DEFAULT_CONFIG });
    console.error(`[TIA] 已创建引擎配置种子: ${CONFIG_FILE}`);
    console.error("[TIA] 提示：编辑此文件添加分析引擎");
  }
}

// ═══════════════════════════════════════════════════════
// 引擎匹配
// ═══════════════════════════════════════════════════════

/** 惰性缓存：id → EngineConfig */
let _configCache: EngineConfig[] | null = null;

/** 获取所有已启用引擎的配置 */
export function getEnabledEngineConfigs(): EngineConfig[] {
  if (_configCache !== null) return _configCache;

  const config = loadEngineConfig();
  _configCache = config.engines.filter(e => e.enabled);
  return _configCache;
}

/** 刷新缓存（配置变更后调用） */
export function invalidateEngineCache(): void {
  _configCache = null;
}

/**
 * 按变更文件扩展名匹配引擎。
 *
 * @returns 每个匹配引擎及其需要处理的文件子集
 */
export function matchEngineFiles(
  changedFiles: string[]
): Array<{ config: EngineConfig; files: string[] }> {
  const engines = getEnabledEngineConfigs();
  const results: Array<{ config: EngineConfig; files: string[] }> = [];

  for (const config of engines) {
    const matched = changedFiles.filter(f =>
      config.fileExtensions.some(ext => f.endsWith(ext))
    );
    if (matched.length > 0) {
      results.push({ config, files: matched });
    }
  }

  return results;
}

/**
 * 获取未被任何引擎匹配的文件（这些文件将走 glob 文件级降级）。
 */
export function getUnmatchedFiles(
  changedFiles: string[],
  matched: Array<{ files: string[] }>
): string[] {
  const matchedSet = new Set(matched.flatMap(m => m.files));
  return changedFiles.filter(f => !matchedSet.has(f));
}
