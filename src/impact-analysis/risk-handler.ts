/**
 * risk_assessment 工具处理 — 变更风险量化与报告
 */

import { ok, optionalString, resolveRepos, getAdapter } from "../tools/helpers.js";
import type { ToolResult } from "../tools/helpers.js";
import { loadImpactConfig } from "./state.js";
import { analyzeImpact } from "./analyzer.js";
import { computeRiskAssessment } from "./risk-scorer.js";
import type { RiskAssessment } from "./types.js";

// ═══════════════════════════════════════════════════════
// 入口
// ═══════════════════════════════════════════════════════

export async function handleRiskAssessment(
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
  const assessments: RiskAssessment[] = [];
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

      // 收集统计
      let highCount = 0, mediumCount = 0, lowCount = 0;
      let totalConfidence = 0;
      const topRisks: string[] = [];

      for (const mod of impact.impactedModules) {
        if (mod.riskLevel === "high") highCount++;
        else if (mod.riskLevel === "medium") mediumCount++;
        else lowCount++;
        totalConfidence += mod.confidence;

        if (mod.riskLevel === "high" && mod.changedFiles.length > 0) {
          topRisks.push(
            `🔴 高风险模块 "${mod.name}" 被触发（${mod.confidence}% 置信度，${mod.changedFiles.length} 个文件变更）`
          );
        }
      }

      const avgConfidence = impact.impactedModules.length > 0
        ? Math.round(totalConfidence / impact.impactedModules.length)
        : 100;

      // 中等风险模块
      for (const mod of impact.impactedModules) {
        if (mod.riskLevel === "medium" && mod.changedFiles.length >= 3) {
          topRisks.push(
            `🟡 "${mod.name}" 模块变更涉及 ${mod.changedFiles.length} 个文件`
          );
        }
      }

      assessments.push(computeRiskAssessment({
        repoName: impact.repoName,
        fromSha: impact.fromSha,
        toSha: impact.toSha,
        changedFiles: impact.changedFiles,
        highModules: highCount,
        mediumModules: mediumCount,
        lowModules: lowCount,
        avgConfidence,
        topRisks: topRisks.slice(0, 5),
      }));
    } catch (err: any) {
      errors.push(`${repo.name}: ${err.message}`);
    }
  }

  if (assessments.length === 0 && errors.length > 0) {
    return ok("❌ 风险评估失败:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  }

  return formatAssessments(assessments, errors);
}

// ═══════════════════════════════════════════════════════
// 格式化输出
// ═══════════════════════════════════════════════════════

const LEVEL_STYLES: Record<string, string> = {
  critical: "🔴 严重风险",
  high: "🟠 高风险",
  medium: "🟡 中等风险",
  low: "🟢 低风险",
};

const LEVEL_BARS: Record<string, string> = {
  critical: "████████",
  high: "██████",
  medium: "████",
  low: "██",
};

function formatAssessments(
  assessments: RiskAssessment[],
  errors: string[]
): ToolResult {
  const lines: string[] = ["⚠️ 风险评估报告", ""];

  for (const a of assessments) {
    const bar = LEVEL_BARS[a.level] || "██";
    lines.push(
      `━━━ ${a.repoName} (${a.fromSha} → ${a.toSha}) ━━━`,
      "",
      `   变更文件: ${a.changedFileCount} 个  受影响模块: ${a.impactedModuleCount} 个  平均置信度: ${a.avgConfidence}%`,
      "",
      `   ${bar} 风险评分: ${a.score}/100  —  ${LEVEL_STYLES[a.level]}`,
      "",
      `   风险分解:`,
      `     📁 文件变更: ${a.breakdown.fileRisk.files} 个文件 → ${a.breakdown.fileRisk.raw}/${a.breakdown.fileRisk.max} 分`,
      `     🎯 影响模块: high=${a.breakdown.moduleRisk.highCount}, medium=${a.breakdown.moduleRisk.mediumCount} → ${a.breakdown.moduleRisk.raw}/${a.breakdown.moduleRisk.max} 分`,
      `     🔍 置信度惩罚: ${a.breakdown.confidencePenalty > 0 ? `+${a.breakdown.confidencePenalty} 分` : "—"}`,
    );

    if (a.topRisks.length > 0) {
      lines.push("", "   风险因素:");
      for (const r of a.topRisks) {
        lines.push(`     ${r}`);
      }
    }

    if (a.suggestions.length > 0) {
      lines.push("", "   建议:");
      for (let i = 0; i < a.suggestions.length; i++) {
        lines.push(`     ${i + 1}. ${a.suggestions[i]}`);
      }
    }
    lines.push("");
  }

  if (assessments.length > 1) {
    const maxScore = Math.max(...assessments.map((a) => a.score));
    const worstRepo = assessments.find((a) => a.score === maxScore);
    lines.push(
      `📊 汇总: ${assessments.length} 个仓库`,
      `   最高风险: ${worstRepo?.repoName} (${maxScore}/100)`,
    );
  }

  if (errors.length > 0) {
    lines.push("", `⚠️ ${errors.length} 个仓库评估失败:`, ...errors.map((e) => `   - ${e}`));
  }

  return ok(lines.join("\n"));
}
