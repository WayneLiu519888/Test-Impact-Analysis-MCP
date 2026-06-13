/**
 * 共享工具函数 — 适配器工厂 / Transport 模式 / 参数校验 / 响应辅助
 */

import type { MonitorEntry } from "../types.js";
import { GitHubAdapter } from "../platforms/github.js";
import { LocalGitAdapter } from "../platforms/local.js";
import { GenericGitAdapter } from "../platforms/generic.js";
import type { PlatformAdapter } from "../platforms/types.js";
import { getMonitorEntries } from "../state.js";
import {
  getRequestAuth,
  loadServerConf,
  saveServerConf,
  touchApiKey,
} from "../security.js";

// ═══════════════════════════════════════════════════════
// 适配器工厂
// ═══════════════════════════════════════════════════════

let _github: GitHubAdapter;
let _local: LocalGitAdapter;
let _generic: GenericGitAdapter;

export function getAdapter(platform: MonitorEntry["platform"]): PlatformAdapter {
  switch (platform) {
    case "github": return _github ??= new GitHubAdapter();
    case "local":  return _local  ??= new LocalGitAdapter();
    case "generic":return _generic??= new GenericGitAdapter();
  }
}

// ═══════════════════════════════════════════════════════
// Transport 感知
// ═══════════════════════════════════════════════════════

export type TransportMode = "stdio" | "http";

/** Transport 模式常量，避免散落字符串字面量 */
export const TRANSPORT = {
  STDIO: "stdio" as const,
  HTTP: "http" as const,
} as const;

let _transportMode: TransportMode = TRANSPORT.STDIO;

export function setTransportMode(mode: TransportMode): void { _transportMode = mode; }
export function getTransportMode(): TransportMode { return _transportMode; }

// ═══════════════════════════════════════════════════════
// 响应辅助
// ═══════════════════════════════════════════════════════

export type ToolResult = { content: Array<{ type: "text"; text: string }> };
export function ok(text: string): ToolResult {
  return { content: [{ type: "text" as const, text }] };
}

// ═══════════════════════════════════════════════════════
// 参数校验
// ═══════════════════════════════════════════════════════

export function requireString(args: Record<string, unknown>, key: string, label: string): string {
  const val = args[key];
  if (typeof val !== "string" || !val.trim()) throw new Error(`参数 ${label} 是必需的`);
  return val.trim();
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const val = args[key];
  return typeof val === "string" ? val.trim() : undefined;
}

// ═══════════════════════════════════════════════════════
// 仓库筛选
// ═══════════════════════════════════════════════════════

export function resolveRepos(args: Record<string, unknown>): { repos: MonitorEntry[]; scopeText: string } {
  const nameFilter   = optionalString(args, "name");
  const moduleFilter = optionalString(args, "module");
  if (nameFilter && moduleFilter) throw new Error("name 和 module 不能同时传入，请二选一");
  const allEntries = getMonitorEntries();
  const repos = nameFilter ? allEntries.filter((e) => e.name === nameFilter)
    : moduleFilter ? allEntries.filter((e) => e.module === moduleFilter) : allEntries;
  const scopeText = nameFilter ? `仓库 "${nameFilter}"` : moduleFilter ? `模块 "${moduleFilter}"` : "";
  return { repos, scopeText };
}

// ═══════════════════════════════════════════════════════
// lastUsed 节流写入（按 key 独立节流，避免 A 请求阻塞 B 的更新）
// ═══════════════════════════════════════════════════════

const API_KEY_TOUCH_INTERVAL_MS = 60_000;
const _keyTouchTimers = new Map<string, number>();

export function throttleTouchApiKey(entry: import("../types.js").ApiKeyEntry): void {
  const now = Date.now();
  const last = _keyTouchTimers.get(entry.hash) ?? 0;
  if (now - last < API_KEY_TOUCH_INTERVAL_MS) return;
  _keyTouchTimers.set(entry.hash, now);

  try {
    const conf = loadServerConf();
    touchApiKey(conf.apiKeys, entry);
    saveServerConf(conf);
  } catch { /* 非关键操作，失败静默 */ }

  // 定期清理过期的计时器条目，防止 Map 无限增长
  if (_keyTouchTimers.size > 100) {
    for (const [hash, ts] of _keyTouchTimers) {
      if (now - ts > API_KEY_TOUCH_INTERVAL_MS * 2) _keyTouchTimers.delete(hash);
    }
  }
}
