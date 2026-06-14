/**
 * impact_analysis 工具处理 — 代码变更 → 受影响测试用例分析
 *
 * v3: 双模引擎 — 优先使用分析引擎（方法级精确），未覆盖文件走 glob 文件级兜底。
 */

import { ok, optionalString, resolveRepos, getAdapter } from "../tools/helpers.js";
import type { ToolResult } from "../tools/helpers.js";
import type { MonitorEntry } from "../types.js";
import { loadImpactConfig } from "./state.js";
import { analyzeImpact } from "./analyzer.js";
import type { RepoImpactResult } from "./types.js";
import { getBaseDir } from "../state.js";
import { join } from "path";
import { existsSync } from "fs";
import { matchEngineFiles, getUnmatchedFiles } from "../engines/registry.js";
import { runEngineAnalysis, checkAvailability } from "../engines/runner.js";
import { computeImpactsFromIndex } from "../engines/call-chain-traversal.js";
import type { CallChainImpact, UnifiedImpactResult } from "../engines/types.js";

// ═══════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════

export async function handleImpactAnalysis(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const fromSha = optionalString(args, "from");
  const toSha   = optionalString(args, "to");

  const { repos, scopeText } = resolveRepos(args);
  if (repos.length === 0) {
    return ok(scopeText
      ? `未找到${scopeText}。请检查 monitors.conf.json 配置文件。`
      : "monitors.conf.json 中没有配置任何仓库。"
    );
  }

  // 每个仓库分别分析（按 repo 上下文加载规则以支持 appliesTo 筛选）
  const results: RepoImpactResult[] = [];
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const config = loadImpactConfig({
        name: repo.name,
        module: repo.module,
        repoType: repo.repoType,
        platform: repo.platform,
      });
      const impact = await analyzeRepo(repo, fromSha, toSha, config);
      results.push(impact);
    } catch (err: any) {
      errors.push(`${repo.name}: ${err.message}`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    return ok("❌ 影响分析失败:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }

  return formatResults(results, errors);
}

// ═══════════════════════════════════════════════════════
// 单仓库分析
// ═══════════════════════════════════════════════════════

async function analyzeRepo(
  repo: MonitorEntry,
  fromShaOverride: string | undefined,
  toShaOverride: string | undefined,
  config: ReturnType<typeof loadImpactConfig>
): Promise<RepoImpactResult> {
  const adapter = getAdapter(repo.platform);

  // 1. 确定 SHA 范围
  const from = fromShaOverride || repo.lastSha;
  if (!from) {
    throw new Error(
      `仓库尚未初始化水位。请先执行 repo_monitor(action='check')。`
    );
  }

  const to = toShaOverride || (await adapter.getHeadSha(repo));

  if (from === to) {
    return {
      repoName: repo.name,
      fromSha: from.slice(0, 7),
      toSha: to.slice(0, 7),
      changedFiles: [],
      impactedModules: [],
      matches: [],
    };
  }

  // 2. 获取变更文件列表
  if (!adapter.getDiffFiles) {
    throw new Error(
      `平台 "${repo.platform}" 不支持获取变更文件列表。`
    );
  }

  const changedFiles = await adapter.getDiffFiles(repo, from, to);

  // 3. 尝试分析引擎增强（有本地克隆时）
  const engineImpacts = await analyzeWithEngines(repo, changedFiles);

  // 4. 未覆盖文件走 glob 文件级兜底
  const uncoveredFiles = engineImpacts?.uncoveredFiles ?? changedFiles;
  const baseResult = analyzeImpact(
    repo.name,
    from.slice(0, 7),
    to.slice(0, 7),
    uncoveredFiles,
    config
  );

  // 5. 合并引擎结果到 legacy 格式
  if (engineImpacts && engineImpacts.impacts.length > 0) {
    return enrichWithEngineImpacts(baseResult, engineImpacts, changedFiles);
  }

  return baseResult;
}

// ═══════════════════════════════════════════════════════
// 引擎分析路径（Phase 2a: 框架抽象层）
// ═══════════════════════════════════════════════════════

/**
 * 尝试通过分析引擎增强影响分析。
 *
 * 前提条件：仓库已通过 repo_clone 在本地克隆。
 * 无本地克隆 → 返回 null，完全走 glob 降级。
 *
 * @returns UnifiedImpactResult | null（null = 引擎不可用，走降级）
 */
async function analyzeWithEngines(
  repo: MonitorEntry,
  changedFiles: string[]
): Promise<UnifiedImpactResult | null> {
  // 1. 按文件扩展名匹配引擎
  const matched = matchEngineFiles(changedFiles);
  if (matched.length === 0) return null; // 无引擎可处理任何文件

  // 2. 定位本地克隆目录
  const repoPath = locateRepoClone(repo);
  if (!repoPath) {
    console.error(`[TIA] ℹ️ ${repo.name}: 无本地克隆，跳过引擎分析，使用 glob 降级`);
    return null;
  }

  // 3. 依次运行每个匹配引擎（顺序执行，避免 I/O 竞争）
  const impacts: CallChainImpact[] = [];
  const coveredFiles = new Set<string>();
  const participants: UnifiedImpactResult["participants"] = [];

  for (const { config: engineConfig, files } of matched) {
    const outputPath = join(
      repoPath, ".tia", repo.branch,
      `panorama-${engineConfig.id}.json`
    );

    try {
      // 检测引擎可用性
      const availErr = await checkAvailability(engineConfig);
      if (availErr) {
        console.error(`[TIA] ⚠️ 引擎 ${engineConfig.id} 不可用: ${availErr}`);
        participants.push({ engineId: engineConfig.id, engineName: engineConfig.name, status: "degraded", contributedMethods: 0 });
        continue;
      }

      // 运行全量分析
      const index = await runEngineAnalysis(engineConfig, repoPath, repo.branch, outputPath);
      if (!index) {
        participants.push({ engineId: engineConfig.id, engineName: engineConfig.name, status: "degraded", contributedMethods: 0 });
        continue;
      }

      // BFS 调用链分析
      const impact = computeImpactsFromIndex(files, index);
      impacts.push(impact);
      for (const f of files) coveredFiles.add(f);
      participants.push({ engineId: engineConfig.id, engineName: engineConfig.name, status: "ok", contributedMethods: impact.changedMethods.length });
    } catch (err: any) {
      console.error(`[TIA] ⚠️ 引擎 ${engineConfig.id} 执行异常: ${err.message}`);
      participants.push({ engineId: engineConfig.id, engineName: engineConfig.name, status: "degraded", contributedMethods: 0 });
    }
  }

  // 4. 计算未被引擎覆盖的文件
  const uncoveredFiles = getUnmatchedFiles(changedFiles, matched);

  return {
    repoName: repo.name,
    fromSha: repo.lastSha?.slice(0, 7) ?? "?",
    toSha: "HEAD",
    changedFiles,
    engineFiles: Array.from(coveredFiles),
    uncoveredFiles,
    impacts,
    participants,
  };
}

/**
 * 定位仓库的本地克隆目录。
 *
 * 路径规则: {baseDir}/Repository/{Frontend|Backend} repository/{repo-name}/{branch}/
 */
function locateRepoClone(repo: MonitorEntry): string | null {
  const baseDir = getBaseDir();
  const repoTypeDir = repo.repoType === "frontend" ? "Frontend repository" : "Backend repository";
  const clonePath = join(baseDir, "Repository", repoTypeDir, repo.name, repo.branch);
  return existsSync(clonePath) ? clonePath : null;
}

/**
 * 将引擎调用链影响合并到 legacy RepoImpactResult 中。
 *
 * 策略：引擎覆盖的文件在 glob 匹配基础上追加引擎级详情。
 */
function enrichWithEngineImpacts(
  base: RepoImpactResult,
  unified: UnifiedImpactResult,
  allChangedFiles: string[]
): RepoImpactResult {
  // 将引擎影响按 API/端点映射到测试模块
  const engineModules: typeof base.impactedModules = [];

  for (const impact of unified.impacts) {
    const totalEndpoints =
      impact.impactedApis.length + impact.impactedMqs.length + impact.impactedJobs.length;

    if (totalEndpoints === 0) continue;

    // 为每个引擎创建一条聚合模块摘要
    const allEndpoints = [
      ...impact.impactedApis.map(e => `${e.endpoint.httpMethod} ${e.endpoint.url} (depth=${Math.min(...e.chains.map(c => c.depth))})`),
      ...impact.impactedMqs.map(e => `${e.endpoint.queueOrTopic} (depth=${Math.min(...e.chains.map(c => c.depth))})`),
      ...impact.impactedJobs.map(e => `${e.endpoint.name} (depth=${Math.min(...e.chains.map(c => c.depth))})`),
    ];

    engineModules.push({
      ruleId: `engine:${impact.engineId}`,
      name: `${impact.changedMethods.length} 个方法 → ${totalEndpoints} 个端点`,
      riskLevel: totalEndpoints > 10 ? "high" : totalEndpoints > 3 ? "medium" : "low",
      testPaths: allEndpoints.slice(0, 5),
      changedFiles: allChangedFiles.slice(0, 5),
      confidence: 85, // 引擎分析的默认置信度
    });
  }

  // 合并：引擎模块在前（精确分析），glob 模块在后
  return {
    ...base,
    impactedModules: [...engineModules, ...base.impactedModules],
    // 保留所有 matches（glob 匹配不会被引擎结果覆盖）
  };
}

// ═══════════════════════════════════════════════════════
// 格式化输出
// ═══════════════════════════════════════════════════════

const RISK_ICONS: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

function formatResults(
  results: RepoImpactResult[],
  errors: string[]
): ToolResult {
  const lines: string[] = [
    "🔬 影响分析结果",
    "",
  ];

  let totalChanged = 0;
  let totalImpacted = 0;

  for (const r of results) {
    totalChanged += r.changedFiles.length;
    totalImpacted += r.impactedModules.length;

    lines.push(`📦 ${r.repoName}  (${r.fromSha} → ${r.toSha})`);

    if (r.changedFiles.length === 0) {
      lines.push("   📭 无变更文件", "");
      continue;
    }

    lines.push(`   ${r.changedFiles.length} 个变更文件:`);
    for (const f of r.changedFiles.slice(0, 20)) {
      lines.push(`     • ${f}`);
    }
    if (r.changedFiles.length > 20) {
      lines.push(`     ... 还有 ${r.changedFiles.length - 20} 个文件`);
    }
    lines.push("");

    if (r.impactedModules.length === 0) {
      lines.push("   ℹ️ 未匹配到受影响的测试模块", "");
      continue;
    }

    lines.push(`   🎯 受影响的测试模块 (${r.impactedModules.length}):`);
    for (const mod of r.impactedModules) {
      const riskIcon = RISK_ICONS[mod.riskLevel] || "⚪";
      const confBar = "█".repeat(Math.round(mod.confidence / 10));
      lines.push(
        `     ${riskIcon} ${mod.riskLevel.padEnd(6)} | ${mod.name}`,
        `         置信度: ${mod.confidence}% ${confBar}`,
        `         测试: ${mod.testPaths.slice(0, 3).join(", ")}${mod.testPaths.length > 3 ? ` +${mod.testPaths.length - 3} 个` : ""}`,
        `         原因: ${mod.changedFiles.slice(0, 2).join(", ")}${mod.changedFiles.length > 2 ? ` +${mod.changedFiles.length - 2} 个文件` : ""}`,
      );
    }
    lines.push("");
  }

  // 汇总
  lines.push(
    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `📊 汇总: ${results.length} 个仓库 | ${totalChanged} 个变更文件 | ${totalImpacted} 个受影响测试模块`,
  );

  if (errors.length > 0) {
    lines.push(
      "",
      `⚠️ ${errors.length} 个仓库分析失败:`,
      ...errors.map((e) => `   - ${e}`),
    );
  }

  // 快速运行建议
  if (totalImpacted > 0) {
    lines.push("", "💡 建议运行以下测试:");
    const allTests = new Set<string>();
    for (const r of results) {
      for (const mod of r.impactedModules) {
        for (const tp of mod.testPaths) {
          allTests.add(tp);
        }
      }
    }
    for (const t of Array.from(allTests).slice(0, 15)) {
      lines.push(`   npm test -- ${t}`);
    }
    if (allTests.size > 15) {
      lines.push(`   ... 还有 ${allTests.size - 15} 个测试路径`);
    }
  }

  return ok(lines.join("\n"));
}
