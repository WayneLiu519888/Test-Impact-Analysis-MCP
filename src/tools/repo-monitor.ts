/**
 * repo_monitor 工具处理 — status / check / reset 三合一
 */

import { ok, requireString, optionalString, resolveRepos } from "./helpers.js";
import { getMonitorEntries, updateWatermark, resetWatermark } from "../state.js";
import type { MonitorEntry, AuthConfig } from "../types.js";
import { getAdapter } from "./helpers.js";
import type { ToolResult } from "./helpers.js";

/** 安全展示认证信息（仅暴露 token 前 4 位，防止日志泄露） */
function getAuthDisplay(auth?: AuthConfig): string {
  if (!auth) return "none";
  switch (auth.type) {
    case "token": return `token:${auth.token.slice(0, 4)}...`;
    case "rsa": return "rsa";
    case "none": return "none";
  }
}

// ═══════════════════════════════════════════════════════
// 路由
// ═══════════════════════════════════════════════════════

export async function handleRepoMonitor(args: Record<string, unknown>): Promise<ToolResult> {
  const action = requireString(args, "action", "action");
  if (!["status", "check", "reset"].includes(action)) throw new Error(`action 必须为 status / check / reset，收到: "${action}"`);
  switch (action) {
    case "status": return statusAction(args);
    case "check":  return checkAction(args);
    case "reset":  return resetAction(args);
    default: throw new Error(`未知 action: ${action}`);
  }
}

// ═══════════════════════════════════════════════════════
// action=status
// ═══════════════════════════════════════════════════════

function statusAction(args: Record<string, unknown>): ToolResult {
  const { repos, scopeText } = resolveRepos(args);
  if (repos.length === 0) {
    return ok(scopeText ? `未找到${scopeText}。请检查 monitors.conf.json 配置文件。` : "配置文件 monitors.conf.json 中没有仓库。\n请直接编辑该文件添加仓库（无需 MCP 工具）。");
  }

  const lines = repos.map((m) => {
    const time = m.lastCheck ? new Date(m.lastCheck).toLocaleString("zh-CN") : "未检查";
    const sha  = m.lastSha ? m.lastSha.slice(0, 7) : "待初始化";
    const auth = getAuthDisplay(m.auth);
    const snaps = m.snapshots ?? [];
    const lastSnap = snaps.length > 0
      ? `\n   最近重置: "${snaps[0].label}" (${snaps[0].prevSha === "(首次)" ? "首次" : snaps[0].prevSha.slice(0, 7)} → ${snaps[0].newSha.slice(0, 7)})`
      : "";
    return [
      `📦 ${m.name}  [模块: ${m.module || "(未配置)"}]`,
      `   类型: ${(m.repoType || "?").padEnd(10)} 平台: ${m.platform.padEnd(10)} 分支: ${m.branch.padEnd(15)} 认证: ${auth}`,
      `   水位: ${sha.padEnd(14)} 上次检查: ${time}${lastSnap}`,
      `   源头: ${m.url}`,
    ].join("\n");
  });

  return ok(`📊 共监控 ${repos.length} 个仓库:\n\n` + lines.join("\n\n"));
}

// ═══════════════════════════════════════════════════════
// action=check
// ═══════════════════════════════════════════════════════

async function checkAction(args: Record<string, unknown>): Promise<ToolResult> {
  const { repos, scopeText } = resolveRepos(args);
  if (repos.length === 0) {
    return ok(scopeText ? `未找到${scopeText}。请检查 monitors.conf.json 配置文件。` : "monitors.conf.json 中没有配置任何仓库。");
  }

  const results: string[] = [];
  let totalNew = 0, reposWithNew = 0;

  for (const repo of repos) {
    try {
      const adapter = getAdapter(repo.platform);
      if (!repo.lastSha) {
        const headSha = await adapter.getHeadSha(repo);
        updateWatermark(repo.name, headSha, []);
        results.push(`🆕 ${repo.name}: 首次初始化 (${headSha.slice(0, 7)})`);
        continue;
      }

      const headSha = await adapter.getHeadSha(repo);
      if (headSha === repo.lastSha) {
        results.push(`📭 ${repo.name}: 无新提交 (${headSha.slice(0, 7)})`);
        continue;
      }

      const commits = await adapter.getCommitsBetween(repo, repo.lastSha, headSha);
      if (commits.length === 0) {
        results.push(`📭 ${repo.name}: 无新提交 (${headSha.slice(0, 7)})`);
        updateWatermark(repo.name, headSha, []);
        continue;
      }

      const newCommits = commits.filter((c) => !repo.seenShas.includes(c.sha));
      if (newCommits.length > 0) {
        totalNew += newCommits.length; reposWithNew++;
        results.push(`🔴 ${repo.name}: +${newCommits.length} 条新提交`, ...newCommits.map((c) => `   ${c.shortSha}  ${c.author.padEnd(18)}  ${c.date.slice(0, 10)}  ${c.message}`));
      } else {
        results.push(`📭 ${repo.name}: 无真正新提交（水位已更新但都见过）`);
      }
      updateWatermark(repo.name, headSha, newCommits.map((c) => c.sha));
    } catch (err: any) {
      results.push(`⚠️ ${repo.name}: 检查失败 — ${err.message}`);
    }
  }

  const scopeLabel = scopeText ? ` [${scopeText}]` : "";
  const summary = totalNew === 0 ? `\n✅ 共 ${repos.length} 个仓库${scopeLabel}，无新提交` : `\n🎯 ${repos.length} 个仓库${scopeLabel}中 ${reposWithNew} 个有更新，共 ${totalNew} 条新提交`;
  return ok(results.join("\n") + summary);
}

// ═══════════════════════════════════════════════════════
// action=reset
// ═══════════════════════════════════════════════════════

async function resetAction(args: Record<string, unknown>): Promise<ToolResult> {
  const label     = optionalString(args, "label") || "手动重置";
  const sinceDate = optionalString(args, "sinceDate");
  const { repos, scopeText } = resolveRepos(args);
  if (repos.length === 0) {
    return ok(scopeText ? `未找到${scopeText}。请检查 monitors.conf.json 配置文件。` : "monitors.conf.json 中没有配置任何仓库。");
  }

  const modeText = sinceDate ? `基于日期 "${sinceDate}" 查找 MR → 水位置入 base commit` : "重置到当前 HEAD";
  const results: string[] = [`🔁 重置水位 — "${label}"  (${modeText})\n`];
  let success = 0, failed = 0, mrFound = 0, fellBack = 0;

  for (const repo of repos) {
    try {
      const adapter = getAdapter(repo.platform);
      let targetSha: string | null = null, source = "";
      if (sinceDate && adapter.findFirstMrBaseAfter) {
        const mrBase = await adapter.findFirstMrBaseAfter(repo, sinceDate);
        if (mrBase) { targetSha = mrBase; source = " (MR base)"; mrFound++; }
      }
      if (!targetSha) {
        targetSha = await adapter.getHeadSha(repo);
        if (sinceDate) { source = " (fallback: 当前 HEAD — 该日期后无 MR)"; fellBack++; }
      }
      const snapshot = resetWatermark(repo.name, targetSha, label);
      const prev = snapshot.prevSha !== "(首次)" ? snapshot.prevSha.slice(0, 7) : "首次";
      results.push(`✅ ${repo.name}: ${prev} → ${targetSha.slice(0, 7)}${source}  (分支: ${repo.branch})`);
      success++;
    } catch (err: any) {
      failed++; results.push(`⚠️ ${repo.name}: 重置失败 — ${err.message}`);
    }
  }

  const scopeLabel = scopeText ? ` [${scopeText}]` : "";
  const summary = failed === 0 ? `\n✅ 成功重置 ${success} 个仓库${scopeLabel}的水位` : `\n⚠️ ${success} 个成功 / ${failed} 个失败`;
  const extra = sinceDate ? `\n   ${mrFound} 个通过 MR 定位 / ${fellBack} 个 fallback 到当前 HEAD` : "";
  results.push(summary + extra, "", "📌 下次 check 将从目标 SHA 开始追踪新提交", "   快照已归档。action=status 可查看水位重置历史。");
  return ok(results.join("\n"));
}
