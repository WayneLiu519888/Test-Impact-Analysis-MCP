/**
 * Test Recommendation — 基于变更智能推荐测试用例
 *
 * Phase 3: 在 Phase 2 影响分析结果上计算推荐分、排序、生成最小可行测试集。
 */

import { ok, optionalString, resolveRepos, getAdapter } from "../tools/helpers.js";
import type { ToolResult } from "../tools/helpers.js";
import { loadImpactConfig } from "./state.js";
import { analyzeImpact } from "./analyzer.js";
import type {
  RecommendationItem,
  TestRecommendation,
  RecommendationSummary,
  RiskLevel,
  Confidence,
} from "./types.js";

// ═══════════════════════════════════════════════════════
// 权重表
// ═══════════════════════════════════════════════════════

const RISK_WEIGHT: Record<RiskLevel, number> = {
  high: 100,
  medium: 50,
  low: 20,
};

const SCORE_THRESHOLD_STRONG = 7000;
const SCORE_THRESHOLD_RECOMMEND = 2000;

// ═══════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════

export async function handleTestRecommendation(
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
  const recommendations: TestRecommendation[] = [];
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      const adapter = getAdapter(repo.platform);
      const from = fromSha || repo.lastSha;
      if (!from) throw new Error("仓库尚未初始化水位。");
      const to = toSha || (await adapter.getHeadSha(repo));
      if (!adapter.getDiffFiles) throw new Error(`平台 "${repo.platform}" 不支持 diff`);

      const changedFiles = await adapter.getDiffFiles(repo, from, to);
      const impact = analyzeImpact(repo.name, from.slice(0, 7), to.slice(0, 7), changedFiles, config);

      recommendations.push(buildRecommendation(impact));
    } catch (err: any) {
      errors.push(`${repo.name}: ${err.message}`);
    }
  }

  if (recommendations.length === 0 && errors.length > 0) {
    return ok("❌ 测试推荐失败:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }

  return formatRecommendations(recommendations, errors);
}

// ═══════════════════════════════════════════════════════
// 推荐构建
// ═══════════════════════════════════════════════════════

function buildRecommendation(
  impact: ReturnType<typeof analyzeImpact>
): TestRecommendation {
  // 将每个 ImpactModule 的 testPaths 展开为 RecommendationItem
  const items: RecommendationItem[] = [];

  for (const mod of impact.impactedModules) {
    const weight = RISK_WEIGHT[mod.riskLevel];
    for (const tp of mod.testPaths) {
      items.push({
        testPath: tp,
        ruleName: mod.name,
        riskLevel: mod.riskLevel,
        confidence: mod.confidence,
        score: weight * mod.confidence,
      });
    }
  }

  // 按推荐分降序，同分按风险→置信度→名称
  items.sort((a, b) =>
    b.score - a.score ||
    RISK_WEIGHT[b.riskLevel] - RISK_WEIGHT[a.riskLevel] ||
    b.confidence - a.confidence ||
    a.testPath.localeCompare(b.testPath)
  );

  // 去重：同一 testPath 保留最高分
  const deduped = dedupItems(items);

  // 最小可行测试集：覆盖所有 high+medium 风险模块的最少测试
  const minimumViableSuite = buildMinimumSuite(deduped, impact);

  const summary: RecommendationSummary = {
    strongRecommend: deduped.filter((i) => i.score >= SCORE_THRESHOLD_STRONG).length,
    recommend: deduped.filter((i) => i.score >= SCORE_THRESHOLD_RECOMMEND && i.score < SCORE_THRESHOLD_STRONG).length,
    optional: deduped.filter((i) => i.score < SCORE_THRESHOLD_RECOMMEND).length,
  };

  return {
    repoName: impact.repoName,
    fromSha: impact.fromSha,
    toSha: impact.toSha,
    items: deduped,
    minimumViableSuite,
    summary,
  };
}

/** 去重：同一 testPath 取最高推荐分 */
function dedupItems(items: RecommendationItem[]): RecommendationItem[] {
  const best = new Map<string, RecommendationItem>();
  for (const item of items) {
    const existing = best.get(item.testPath);
    if (!existing || item.score > existing.score) {
      best.set(item.testPath, item);
    }
  }
  return Array.from(best.values());
}

/** 最小可行测试集：每个 high/medium 风险模块取置信度最高的 1 个测试 */
function buildMinimumSuite(
  items: RecommendationItem[],
  impact: ReturnType<typeof analyzeImpact>
): string[] {
  const suite = new Set<string>();

  for (const mod of impact.impactedModules) {
    if (mod.riskLevel === "low") continue;

    // 找该模块 confidence 最高的 testPath
    let bestItem: RecommendationItem | null = null;
    for (const item of items) {
      if (mod.testPaths.includes(item.testPath)) {
        if (!bestItem || item.confidence > bestItem.confidence) {
          bestItem = item;
        }
      }
    }

    if (bestItem) suite.add(bestItem.testPath);
  }

  return Array.from(suite);
}

// ═══════════════════════════════════════════════════════
// 格式化输出
// ═══════════════════════════════════════════════════════

const RISK_ICONS: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🟢",
};

function formatRecommendations(
  recs: TestRecommendation[],
  errors: string[]
): ToolResult {
  const lines: string[] = ["🧪 测试推荐", ""];

  for (const r of recs) {
    lines.push(
      `📦 ${r.repoName}  (${r.fromSha} → ${r.toSha})`,
      `   推荐测试数: ${r.items.length}  |  强烈建议: ${r.summary.strongRecommend}  |  建议: ${r.summary.recommend}  |  可选: ${r.summary.optional}`,
      "",
    );

    if (r.items.length === 0) {
      lines.push("   📭 无受影响的测试", "");
      continue;
    }

    // 强烈建议组
    const strong = r.items.filter((i) => i.score >= SCORE_THRESHOLD_STRONG);
    if (strong.length > 0) {
      lines.push("   ✅ 强烈建议:");
      for (let i = 0; i < strong.length; i++) {
        const item = strong[i];
        const icon = RISK_ICONS[item.riskLevel];
        lines.push(`     #${i + 1}  ${item.testPath}`);
        lines.push(`         ${icon} ${item.riskLevel} | 置信度: ${item.confidence}% | 推荐分: ${item.score}`);
      }
      lines.push("");
    }

    // 建议组
    const rec = r.items.filter((i) => i.score >= SCORE_THRESHOLD_RECOMMEND && i.score < SCORE_THRESHOLD_STRONG);
    if (rec.length > 0) {
      lines.push("   🟡 建议:");
      for (const item of rec) {
        lines.push(`     • ${item.testPath}  (${item.riskLevel}, ${item.confidence}%, 分=${item.score})`);
      }
      lines.push("");
    }

    // 可选组（只在无强烈建议时显示）
    const opt = r.items.filter((i) => i.score < SCORE_THRESHOLD_RECOMMEND);
    if (opt.length > 0 && strong.length === 0) {
      lines.push("   💡 可选:");
      for (const item of opt) {
        lines.push(`     • ${item.testPath}  (${item.riskLevel}, ${item.confidence}%, 分=${item.score})`);
      }
      lines.push("");
    }

    // 最小可行测试集
    if (r.minimumViableSuite.length > 0) {
      lines.push(
        `   📋 最小可行测试集 (${r.minimumViableSuite.length} 个，覆盖所有高风险模块):`,
        ...r.minimumViableSuite.map((t) => `     npm test -- ${t}`),
        "",
      );
    }
  }

  if (errors.length > 0) {
    lines.push(`⚠️ ${errors.length} 个仓库分析失败:`, ...errors.map((e) => `   - ${e}`));
  }

  return ok(lines.join("\n"));
}

// 导出计分函数供测试
export { RISK_WEIGHT, SCORE_THRESHOLD_STRONG, SCORE_THRESHOLD_RECOMMEND, buildRecommendation, dedupItems, buildMinimumSuite };
