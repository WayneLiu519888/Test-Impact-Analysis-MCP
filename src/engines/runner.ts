/**
 * 引擎运行器 — 通过子进程调用外部分析工具
 *
 * 支持 exec / mcp / http 三种 runner 类型。
 * 占位符 {repoPath}/{branch}/{outputPath} 在运行时替换。
 *
 * 通用引擎走 exec/mcp/http runner；
 * 无内置引擎适配器（java-callgraph 已于 2026-06-14 废弃）。
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { RunnerConfig, PanoramaIndex, EngineConfig } from "./types.js";

const execFileAsync = promisify(execFile);

/** 默认超时 10 分钟 */
const DEFAULT_TIMEOUT_MS = 600_000;
/** 最大输出 buffer 10MB */
const MAX_BUFFER = 10 * 1024 * 1024;

/** 可用性检测超时 */
const AVAILABILITY_TIMEOUT_MS = 10_000;

// ═══════════════════════════════════════════════════════
// 占位符替换
// ═══════════════════════════════════════════════════════

/** 支持的占位符 */
const PLACEHOLDERS: Record<string, (ctx: RunContext) => string> = {
  "{repoPath}":   ctx => ctx.repoPath,
  "{branch}":     ctx => ctx.branch,
  "{outputPath}": ctx => ctx.outputPath,
  "{fromSha}":    ctx => ctx.fromSha ?? "",
  "{toSha}":      ctx => ctx.toSha ?? "",
};

interface RunContext {
  repoPath: string;
  branch: string;
  outputPath: string;
  fromSha?: string;
  toSha?: string;
}

/** 替换参数列表中的占位符 */
function resolveArgs(args: string[], ctx: RunContext): string[] {
  return args.map(arg => {
    let resolved = arg;
    for (const [placeholder, resolver] of Object.entries(PLACEHOLDERS)) {
      resolved = resolved.replaceAll(placeholder, resolver(ctx));
    }
    return resolved;
  });
}

// ═══════════════════════════════════════════════════════
// 运行全量分析（统一入口）
// ═══════════════════════════════════════════════════════

/**
 * 运行引擎全量分析 — 通过通用 exec/mcp/http runner。
 *
 * @param engineConfig 引擎配置（含 id + runner）
 * @param repoPath     仓库代码绝对路径
 * @param branch       分支名
 * @param outputPath   全景索引输出路径
 */
export async function runEngineAnalysis(
  engineConfig: EngineConfig,
  repoPath: string,
  branch: string,
  outputPath: string
): Promise<PanoramaIndex | null> {
  return runFullAnalysis(engineConfig.runner, repoPath, branch, outputPath);
}

/**
 * 通过子进程运行全量分析引擎（通用路径）。
 *
 * 引擎 stdout 必须输出 PanoramaIndex JSON。
 *
 * @param config      引擎运行器配置
 * @param repoPath    仓库代码绝对路径
 * @param branch      分支名
 * @param outputPath  全景索引输出路径 (.tia/{branch}/panorama-{id}.json)
 * @returns PanoramaIndex 或 null
 */
export async function runFullAnalysis(
  config: RunnerConfig,
  repoPath: string,
  branch: string,
  outputPath: string
): Promise<PanoramaIndex | null> {
  const ctx: RunContext = { repoPath, branch, outputPath };

  switch (config.type) {
    case "exec": return runExec(config, ctx);
    case "mcp":
    case "http":
      console.error(`[TIA] ⚠️ Runner type "${config.type}" 暂未实现，已跳过`);
      return null;
    default:
      console.error(`[TIA] ⚠️ 未知 Runner type: ${(config as any).type}`);
      return null;
  }
}

async function runExec(config: RunnerConfig & { type: "exec" }, ctx: RunContext): Promise<PanoramaIndex | null> {
  const args = resolveArgs(config.args, ctx);
  const timeout = config.timeoutMs || DEFAULT_TIMEOUT_MS;

  try {
    const { stdout } = await execFileAsync(config.command, args, {
      timeout,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
    });

    if (!stdout || stdout.trim().length === 0) {
      console.error(`[TIA] ⚠️ 引擎未产生输出: ${config.command} ${args.join(" ")}`);
      return null;
    }

    // 引擎 stdout 应为 PanoramaIndex JSON
    try {
      return JSON.parse(stdout) as PanoramaIndex;
    } catch {
      console.error(`[TIA] ⚠️ 引擎输出非 JSON，跳过解析: ${stdout.slice(0, 200)}`);
      return null;
    }
  } catch (err: any) {
    // 子进程超时或崩溃
    const reason = err.killed ? "超时" : err.message;
    console.error(`[TIA] ⚠️ 引擎执行失败 (${reason}): ${config.command} ${args.join(" ")}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// 可用性检测
// ═══════════════════════════════════════════════════════

/**
 * 检测引擎可用性。
 *
 * 通用引擎 → exec --version / HTTP GET 探测
 */
export async function checkAvailability(config: EngineConfig): Promise<string | null> {
  const runner = config.runner;
  switch (runner.type) {
    case "exec": {
      try {
        await execFileAsync(runner.command, ["--version"], {
          timeout: AVAILABILITY_TIMEOUT_MS,
          windowsHide: true,
        });
        return null; // 可用
      } catch (err: any) {
        return `${runner.command}: ${err.message}`;
      }
    }
    case "mcp":
    case "http":
      return `Runner type "${runner.type}" 暂不支持可用性检测`;
    default:
      return "未知 Runner type";
  }
}
