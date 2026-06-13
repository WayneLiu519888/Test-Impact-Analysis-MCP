/**
 * 共享 JSON 工具 — 消除 state.ts / impact-analysis/state.ts 的代码重复
 */

import { readFileSync, existsSync } from "fs";

/**
 * 安全加载 JSON 文件。文件不存在或格式错误时返回 fallback，并将错误输出到 stderr。
 * 避免 JSON 解析异常直接暴露给用户。
 *
 * @param filePath  JSON 文件绝对路径
 * @param fallback  文件不存在或解析失败时返回的默认值
 * @param label     配置文件标签（用于错误提示）
 */
export function safeJsonLoad<T>(filePath: string, fallback: () => T, label: string): T {
  if (!existsSync(filePath)) {
    return fallback();
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (err: any) {
    console.error(`[TIA] ⚠️ ${label} 文件格式错误，已重置为默认值: ${err.message}`);
    return fallback();
  }
}
