/**
 * codebase-memory-mcp 分析引擎
 *
 * 通过 execFile 子进程 CLI 模式调用 codebase-memory-mcp 二进制，
 * 将 CLI JSON 输出翻译为 PanoramaIndex，内置 PanoramaIndex 缓存（24h）。
 *
 * 实机验证 (v0.8.1):
 *   - index_repository → {"project":"...","status":"indexed","nodes":900,"edges":1644}
 *   - get_architecture  → {"node_labels":[...],"entry_points":[...],"packages":[...]}
 *   - query_graph       → {"columns":["caller","callee","file"],"rows":[[...]]}
 */

import { basename, relative, join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";
import type {
  PanoramaIndex, PanoramaSummary, BuiltinAdapterConfig, ApiEndpoint,
} from "../types.js";

const execFileAsync = promisify(execFile);

// ═══════════════════════════════════════════════════════
// 工厂
// ═══════════════════════════════════════════════════════

export interface CbmEngine {
  checkAvailability(): Promise<string | null>;
  runFullAnalysis(repoPath: string, branch: string): Promise<PanoramaIndex | null>;
}

export function createCodebaseMemoryEngine(config: BuiltinAdapterConfig): CbmEngine {
  return {
    async checkAvailability(): Promise<string | null> {
      try {
        await execFileAsync(config.binaryPath, ["--version"], { timeout: 10_000, windowsHide: true });
        return null;
      } catch (e: any) {
        return `codebase-memory-mcp 不可用: ${e.message}`;
      }
    },

    async runFullAnalysis(repoPath: string, branch: string): Promise<PanoramaIndex | null> {
      // 缓存检查
      if (!config.indexOptions.forceReindex && isCacheValid(repoPath, branch, "cbm-mcp")) {
        const cached = loadCachedPanoramaIndex(repoPath, branch, "cbm-mcp");
        if (cached) { console.error("[TIA] ℹ️ cbm-mcp: 使用缓存"); return cached; }
      }

      const projectName = repoPath
        .replace(/^([A-Za-z]):/, "$1")
        .replace(/[\\/:]/g, "-").replace(/\s/g, "-")
        .replace(/-+/g, "-").replace(/^-|-$/g, "");

      // Step 1: 索引
      const ir = await cbmCli(config, "index_repository", { repo_path: repoPath });
      if (!ir || ir.status !== "indexed") {
        console.error(`[TIA] cbm-mcp: 索引失败 — ${ir?.error ?? "未知"}`);
        return null;
      }
      console.error(`[TIA] cbm-mcp: 索引完成 — ${ir.nodes} 节点 / ${ir.edges} 边`);

      // Step 2: 架构
      const arch = await cbmCli(config, "get_architecture", { project: projectName, aspects: ["all"] });
      if (!arch) return null;

      // Step 3: 全部 CALLS 边
      const allCalls = await queryAllCallEdges(config, projectName);
      if (!allCalls) return null;

      // Step 4: 翻译
      const index = translateToPanoramaIndex(repoPath, branch, arch.entry_points || [], allCalls);
      cachePanoramaIndex(index, repoPath, branch);
      return index;
    },
  };
}

// ═══════════════════════════════════════════════════════
// CLI 调用
// ═══════════════════════════════════════════════════════

async function cbmCli(config: BuiltinAdapterConfig, tool: string, args: Record<string, unknown>): Promise<any> {
  try {
    const { stdout } = await execFileAsync(config.binaryPath, ["cli", tool, JSON.stringify(args)], {
      timeout: config.timeoutMs, windowsHide: true, maxBuffer: 50 * 1024 * 1024,
    });
    if (!stdout?.trim()) return null;
    try { return JSON.parse(stdout); }
    catch { console.error(`[TIA] cbm-mcp: ${tool} 非 JSON: ${stdout.slice(0, 200)}`); return null; }
  } catch (err: any) {
    console.error(`[TIA] cbm-mcp: ${tool} 失败 (${err.killed ? "超时" : err.message})`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════
// 分页查询 CALLS 边
// ═══════════════════════════════════════════════════════

const CALLS_BATCH = 500;

async function queryAllCallEdges(config: BuiltinAdapterConfig, projectName: string) {
  const edges: Array<{ caller: string; callee: string; file: string }> = [];
  let offset = 0;
  while (true) {
    const result = await cbmCli(config, "query_graph", {
      project: projectName,
      query: `MATCH (a)-[e:CALLS]->(b) RETURN a.qualified_name as caller, b.qualified_name as callee, b.file_path as file SKIP ${offset} LIMIT ${CALLS_BATCH}`,
    });
    if (!result?.rows?.length) break;
    for (const row of result.rows) edges.push({ caller: row[0], callee: row[1], file: row[2] });
    if (result.rows.length < CALLS_BATCH) break;
    offset += CALLS_BATCH;
  }
  console.error(`[TIA] cbm-mcp: ${edges.length} 条 CALLS`);
  return edges;
}

// ═══════════════════════════════════════════════════════
// 翻译 → PanoramaIndex
// ═══════════════════════════════════════════════════════

function translateToPanoramaIndex(
  repoPath: string, branch: string,
  entryPoints: Array<{ name: string; qualified_name: string; file: string }>,
  callEdges: Array<{ caller: string; callee: string; file: string }>,
): PanoramaIndex {
  const callGraph: Record<string, string[]> = {};
  const reverseCallGraph: Record<string, string[]> = {};
  const methodToFile = new Map<string, string>();

  for (const e of callEdges) {
    (callGraph[e.caller] ??= []).push(e.callee);
    (reverseCallGraph[e.callee] ??= []).push(e.caller);
    if (e.file && !methodToFile.has(e.callee))
      methodToFile.set(e.callee, relative(repoPath, e.file).replace(/\\/g, "/"));
  }

  for (const ep of entryPoints) {
    if (ep.file && !methodToFile.has(ep.qualified_name))
      methodToFile.set(ep.qualified_name, relative(repoPath, ep.file).replace(/\\/g, "/"));
  }

  const fileToMethods: Record<string, string[]> = {};
  for (const [m, f] of methodToFile) (fileToMethods[f] ??= []).push(m);

  const apiEndpoints: ApiEndpoint[] = entryPoints
    .filter(ep => /Controller|Router|Handler/.test(ep.name))
    .map(ep => ({
      url: `/${ep.name}`, httpMethod: "GET", handlerFqn: ep.qualified_name,
      filePath: ep.file ? relative(repoPath, ep.file).replace(/\\/g, "/") : "", line: 0,
    }));

  const allMethods = new Set<string>();
  for (const e of callEdges) { allMethods.add(e.caller); allMethods.add(e.callee); }

  return {
    repoName: basename(repoPath), branch, headSha: "",
    indexedAt: new Date().toISOString(),
    engineId: "cbm-mcp", engineVersion: "0.8",
    summary: { totalFiles: Object.keys(fileToMethods).length, totalMethods: allMethods.size, totalCallEdges: callEdges.length, totalApis: apiEndpoints.length, parseTimeMs: 0 },
    callGraph, reverseCallGraph, fileToMethods,
    apiEndpoints,
    terminalMethods: entryPoints.map(ep => ep.qualified_name),
  };
}

// ═══════════════════════════════════════════════════════
// 缓存 (.tia/{branch}/panorama-cbm-mcp.json, 24h)
// ═══════════════════════════════════════════════════════

function cachePath(repoPath: string, branch: string) { return join(repoPath, ".tia", branch, "panorama-cbm-mcp.json"); }

function isCacheValid(repoPath: string, branch: string, engineId: string): boolean {
  const p = cachePath(repoPath, branch);
  if (!existsSync(p)) return false;
  try { return Date.now() - statSync(p).mtimeMs < 24 * 60 * 60 * 1000; }
  catch { return false; }
}

function loadCachedPanoramaIndex(repoPath: string, branch: string, engineId: string): PanoramaIndex | null {
  try {
    const p = cachePath(repoPath, branch);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null;
  } catch { return null; }
}

function cachePanoramaIndex(index: PanoramaIndex, repoPath: string, branch: string): void {
  const dir = join(repoPath, ".tia", branch);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(cachePath(repoPath, branch), JSON.stringify(index, null, 2), { encoding: "utf-8" });
}
