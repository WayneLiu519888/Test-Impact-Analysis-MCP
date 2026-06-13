/**
 * impact_analysis 工具处理 — 代码变更 → 受影响测试用例分析
 */

import { ok, optionalString, resolveRepos, getAdapter } from "../tools/helpers.js";
import type { ToolResult } from "../tools/helpers.js";
import type { MonitorEntry } from "../types.js";
import { loadImpactConfig } from "./state.js";
import { analyzeImpact } from "./analyzer.js";
import type { RepoImpactResult } from "./types.js";
import { matchAnalyzers, getUnmatchedFiles } from "../analyzer-registry/registry.js";
import type { AnalyzerResult } from "../analyzer-registry/types.js";

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

  const config = loadImpactConfig();

  // 每个仓库分别分析（含分析器编织）
  const results: RepoImpactResult[] = [];
  const analyzerResults: Map<string, AnalyzerResult[]> = new Map();
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const { impact, analyzers } = await analyzeRepo(repo, fromSha, toSha, config);
      results.push(impact);
      if (analyzers.length > 0) {
        analyzerResults.set(repo.name, analyzers);
      }
    } catch (err: any) {
      errors.push(`${repo.name}: ${err.message}`);
    }
  }

  if (results.length === 0 && errors.length > 0) {
    return ok("❌ 影响分析失败:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }

  return formatResults(results, analyzerResults, errors);
}

// ═══════════════════════════════════════════════════════
// 单仓库分析
// ═══════════════════════════════════════════════════════

async function analyzeRepo(
  repo: MonitorEntry,
  fromShaOverride: string | undefined,
  toShaOverride: string | undefined,
  config: ReturnType<typeof loadImpactConfig>
): Promise<{ impact: RepoImpactResult; analyzers: AnalyzerResult[] }> {
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
      impact: {
        repoName: repo.name,
        fromSha: from.slice(0, 7),
        toSha: to.slice(0, 7),
        changedFiles: [],
        impactedModules: [],
        matches: [],
      },
      analyzers: [],
    };
  }

  // 2. 获取变更文件列表
  if (!adapter.getDiffFiles) {
    throw new Error(
      `平台 "${repo.platform}" 不支持获取变更文件列表。`
    );
  }

  const changedFiles = await adapter.getDiffFiles(repo, from, to);

  // 3. 分析器编织：匹配并调用下游分析器
  const analyzerOutputs: AnalyzerResult[] = [];
  const matched = matchAnalyzers(changedFiles);

  for (const { adapter: anaAdapter, matchedFiles } of matched) {
    try {
      const result = await anaAdapter.analyze(repo, matchedFiles, from, to);
      if (result) {
        analyzerOutputs.push(result);
      } else {
        // 分析器返回 null = 不可用，记录降级状态
        analyzerOutputs.push({
          analyzerId: anaAdapter.id,
          analyzerName: anaAdapter.name,
          impactedItems: [],
          degraded: true,
        });
      }
    } catch {
      // 分析器异常 = 降级
      analyzerOutputs.push({
        analyzerId: anaAdapter.id,
        analyzerName: anaAdapter.name,
        impactedItems: [],
        degraded: true,
      });
    }
  }

  // 4. 文件级 glob 匹配：仅对未被任何分析器处理的文件
  const unmatchedFiles = getUnmatchedFiles(
    changedFiles,
    matched.map((m) => ({ matchedFiles: m.matchedFiles }))
  );

  const impact = analyzeImpact(
    repo.name,
    from.slice(0, 7),
    to.slice(0, 7),
    unmatchedFiles,
    config
  );

  return { impact, analyzers: analyzerOutputs };
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
  analyzerResults: Map<string, AnalyzerResult[]>,
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

    // ── 分析器状态 ──
    const repoAnalyzers = analyzerResults.get(r.repoName) ?? [];
    for (const ar of repoAnalyzers) {
      if (ar.degraded) {
        lines.push(`   ⚠️ ${ar.analyzerName} [${ar.analyzerId}]: 不可用，已降级为文件匹配`);
      } else if (ar.impactedItems.length > 0) {
        lines.push(`   🧠 ${ar.analyzerName} [${ar.analyzerId}]: ${ar.impactedItems.length} 个语义分析项`);
      }
    }

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
