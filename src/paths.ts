/**
 * 共享路径工具 — 统一项目根目录定位，消除跨文件 __dirname 重复计算
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "fs";

// ESM __dirname 等价物 — 全项目唯一一处
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** 项目根目录（src/ 的父目录） */
export const PROJECT_ROOT = join(__dirname, "..");

/**
 * 获取项目根目录。
 * 与 PROJECT_ROOT 等价，供需要函数调用的场景使用。
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

/**
 * 确保 enterprise/ 目录存在。
 * 在启动时调用，自动创建企业配置目录结构。
 */
export function ensureEnterpriseDir(): void {
  const dir = join(PROJECT_ROOT, "enterprise");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".gitkeep"), "# 企业配置层 — 此目录被 .gitignore 排除\n");
  }
}

/**
 * 解析配置文件路径，支持多级 fallback。
 *
 * 优先级:
 *   1. enterprise/{filename}       ← 企业配置（优先）
 *   2. {filename}                   ← 根目录（fallback，兼容旧版）
 *   3. examples/{filename}.example  ← 模板（首次初始化，自动复制到 enterprise/）
 *
 * @param filename  配置文件文件名（如 "monitors.conf.json"）
 * @returns  解析后的绝对路径
 * @throws   三个位置都不存在时抛出错误
 */
export function resolveConfigPath(filename: string): string {
  const root = PROJECT_ROOT;
  const enterprisePath = join(root, "enterprise", filename);
  const rootPath = join(root, filename);

  // 1. 企业配置目录优先
  if (existsSync(enterprisePath)) return enterprisePath;

  // 2. 根目录 fallback（向后兼容，打印迁移提示）
  if (existsSync(rootPath)) {
    console.warn(`[TIA] ⚠️  ${filename} 在根目录已弃用，请移动到 enterprise/ 目录`);
    return rootPath;
  }

  // 3. 从模板创建
  const examplePath = join(root, "examples", filename + ".example");
  if (existsSync(examplePath)) {
    ensureEnterpriseDir();
    copyFileSync(examplePath, enterprisePath);
    console.warn(`[TIA] 📋 已从模板创建 enterprise/${filename}，请编辑后重新运行`);
    return enterprisePath;
  }

  throw new Error(
    `找不到配置文件: ${filename}（请在 enterprise/ 或根目录提供，或检查 examples/ 模板）`
  );
}
