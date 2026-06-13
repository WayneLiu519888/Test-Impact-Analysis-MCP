/**
 * repo_clone 工具处理 — 全量/增量克隆 + 双模（本地执行 / 远程指令）
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import type { MonitorEntry } from "../types.js";
import type { PlatformAdapter } from "../platforms/types.js";
import {
  getMonitorEntries,
  getBaseDir,
} from "../state.js";
import { ok, requireString, optionalString } from "./helpers.js";
import { getAdapter, getTransportMode, TRANSPORT } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** git clone 操作超时时间（毫秒） */
const GIT_CLONE_TIMEOUT_MS = 300_000;
/** git clone 操作输出缓冲区上限（字节） */
const GIT_CLONE_MAX_BUFFER = 10 * 1024 * 1024;

// ═══════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════

export async function handleRepoClone(args: Record<string, unknown>): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const name          = optionalString(args, "name");
  const moduleName    = optionalString(args, "module");
  const mode          = requireString(args, "mode", "mode");
  const sinceDate     = optionalString(args, "sinceDate");
  const sinceMrId     = optionalString(args, "sinceMrId");
  const force         = args.force === true;
  const clientBaseDir  = optionalString(args, "clientBaseDir");

  if (!name && !moduleName) throw new Error("必须提供 name 或 module（二选一）");
  if (name && moduleName) throw new Error("name 和 module 不能同时传入，请二选一");
  if (!["full", "incremental"].includes(mode)) throw new Error(`mode 必须为 full 或 incremental，收到: "${mode}"`);

  if (mode === "incremental") {
    if (!sinceDate && !sinceMrId) throw new Error("incremental 模式必须提供 sinceDate 或 sinceMrId（二选一）");
    if (sinceDate && sinceMrId) throw new Error("sinceDate 和 sinceMrId 不能同时提供，请二选一");
  }

  const allEntries = getMonitorEntries();
  let repos: MonitorEntry[];

  if (name) {
    const repo = allEntries.find((e) => e.name === name);
    if (!repo) throw new Error(`未找到仓库 "${name}"。请检查 monitors.conf.json 配置文件。`);
    if (!repo.repoType) throw new Error(`仓库 "${name}" 未配置 repoType。请编辑 monitors.conf.json 指定 repoType 为 frontend 或 backend。`);
    repos = [repo];
  } else {
    repos = allEntries.filter((e) => e.module === moduleName);
    if (repos.length === 0) return ok(`未找到属于模块 "${moduleName}" 的仓库。请检查 monitors.conf.json 配置文件。`);
  }

  const isRemote = getTransportMode() === TRANSPORT.HTTP;
  const resolvedBaseDir = isRemote && clientBaseDir
    ? clientBaseDir.replace(/\\/g, "/")
    : getBaseDir();

  const modeLabel = mode === "full" ? "全量" : "增量";
  const execLabel = isRemote ? "远程模式（不执行 git，返回指令）" : "本地模式";
  const targetLabel = name ? `仓库 "${name}"` : `模块 "${moduleName}"`;

  const results: string[] = [
    `🚀 开始克隆 — ${targetLabel}  (${modeLabel} / ${execLabel})`,
    `   baseDir: ${resolvedBaseDir}`,
    `   共 ${repos.length} 个仓库\n`,
  ];

  let totalReposOk = 0;
  let totalReposFail = 0;

  for (const repo of repos) {
    try {
      const basePath = getRepoBasePath(repo.repoType ?? "backend", resolvedBaseDir);
      const repoBasePath = join(basePath, repo.name);

      let result: { content: Array<{ type: "text"; text: string }> };
      if (mode === "full") {
        result = await fullClone(repo, repoBasePath, force, isRemote ? resolvedBaseDir : undefined);
      } else {
        result = await incrementalClone(repo, repoBasePath, { sinceDate, sinceMrId, force }, isRemote ? resolvedBaseDir : undefined);
      }

      const text = result.content[0]?.text ?? "";
      results.push(`\n${"=".repeat(50)}`);
      results.push(text);
      totalReposOk++;
    } catch (err: any) {
      totalReposFail++;
      results.push(`\n❌ ${repo.name}: 克隆失败 — ${err.message}`);
    }
  }

  const summary = totalReposFail === 0
    ? `\n\n✅ 全部 ${totalReposOk} 个仓库处理完成`
    : `\n\n⚠️ ${totalReposOk} 个成功 / ${totalReposFail} 个失败`;
  results.push(summary);

  if (isRemote) {
    results.push("", "💡 远程模式提示: 以上 git 命令需要在客户端本地执行。", "   Claude Code 的 Bash 工具可自动解析并执行上述指令块。", "   前提: 客户端本地已安装 git 且已配置好 SSH/RSA 公钥认证。");
  }

  return ok(results.join("\n"));
}

// ═══════════════════════════════════════════════════════
// 基础设施
// ═══════════════════════════════════════════════════════

async function runGit(cwd: string | undefined, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: GIT_CLONE_TIMEOUT_MS, maxBuffer: GIT_CLONE_MAX_BUFFER });
    return stdout.trim();
  } catch (err: any) {
    throw new Error(`git ${args[0]} 失败: ${err.stderr || err.message}`);
  }
}

function getRepoBasePath(repoType: "frontend" | "backend", baseDir?: string): string {
  const typeDir = repoType === "frontend" ? "Frontend repository" : "Backend repository";
  return join(baseDir ?? getBaseDir(), "Repository", typeDir);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o755 });
}

// ═══════════════════════════════════════════════════════
// 远程模式指令构建
// ═══════════════════════════════════════════════════════

function buildRemoteFullCloneCmds(repo: MonitorEntry, targetPath: string, force: boolean): { content: Array<{ type: "text"; text: string }> } {
  const lines: string[] = [
    `📋 全量克隆 — ${repo.name}  [模块: ${repo.module || "?"}]`,
    `   仓库: ${repo.name}`, `   分支: ${repo.branch}`, `   目标: ${targetPath}`, `   来源: ${repo.url}`, ``,
  ];
  const parentDir = targetPath.replace(/[/\\][^/\\]+$/, "");
  lines.push(`# 确保父目录存在`);
  if (force) lines.push(`rm -rf "${targetPath}"  # 强制覆盖旧目录`);
  lines.push(`mkdir -p "${parentDir}"`);
  lines.push(``, `# 全量克隆（客户端通过 Bash 工具执行）`);
  lines.push(`git clone --branch "${repo.branch}" --single-branch "${repo.url}" "${targetPath}"`);
  lines.push(``, `---cwd:${parentDir}---`);
  return ok(lines.join("\n"));
}

function buildRemoteIncrementalCloneCmds(
  repo: MonitorEntry, repoBasePath: string, branchClonePath: string,
  mrs: Awaited<ReturnType<NonNullable<PlatformAdapter["listMrs"]>>>,
  filterDesc: string, force: boolean
): { content: Array<{ type: "text"; text: string }> } {
  const lines: string[] = [
    `📋 增量克隆 — ${repo.name}  [模块: ${repo.module || "?"}]`,
    `   来源: ${repo.url}`, `   分支: ${repo.branch}`, `   范围: ${filterDesc}`, `   共 ${mrs.length} 个 MR`, ``,
  ];
  lines.push(`# 0. 确保目录结构`, `mkdir -p "${branchClonePath}"`, ``);
  lines.push(`# 1. 全量克隆基础分支（作为对象存储，如尚未存在）`);
  lines.push(`if [ ! -d "${branchClonePath}/.git" ]; then`);
  lines.push(`  git clone --branch "${repo.branch}" --single-branch "${repo.url}" "${branchClonePath}"`);
  lines.push(`fi`, ``);
  lines.push(`# 2. 更新基础克隆`, `git -C "${branchClonePath}" fetch origin ${repo.branch}`, ``);
  lines.push(`# 3. 逐个检出 MR (共 ${mrs.length} 个)`, `mkdir -p "${repoBasePath}"`, ``);

  for (let i = 0; i < mrs.length; i++) {
    const mr = mrs[i], mrPath = join(repoBasePath, mr.id);
    lines.push(`echo "[${i + 1}/${mrs.length}] MR !${mr.id}: ${mr.title.slice(0, 60)}"`);
    if (force) { lines.push(`rm -rf "${mrPath}"  # 强制覆盖`); }
    else { lines.push(`if [ -d "${mrPath}" ]; then echo "  ⏭️  已存在，跳过"; continue; fi`); }
    lines.push(`git clone --no-hardlinks --no-checkout "${branchClonePath}" "${mrPath}"`);
    lines.push(`git -C "${mrPath}" fetch origin "${mr.headSha}" 2>/dev/null || true`);
    lines.push(`git -C "${mrPath}" checkout "${mr.headSha}"`);
    lines.push(`echo "  ✅ MR !${mr.id} | ${mr.sourceBranch} | ${mr.mergedAt.slice(0, 10)} | ${mr.author}"`, ``);
  }
  lines.push(`echo ""`, `echo "✅ 增量克隆完成 — ${repo.name} (${filterDesc})"`, `echo "   共 ${mrs.length} 个 MR"`);
  return ok(lines.join("\n"));
}

// ═══════════════════════════════════════════════════════
// 本地模式执行函数
// ═══════════════════════════════════════════════════════

async function fullClone(repo: MonitorEntry, repoBasePath: string, force: boolean, clientBaseDir?: string): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const targetPath = join(repoBasePath, repo.branch);
  if (clientBaseDir) return buildRemoteFullCloneCmds(repo, targetPath, force);

  if (existsSync(targetPath)) {
    if (!force) return ok(`⚠️ 目录已存在: ${targetPath}\n如需覆盖，请传入 force=true`);
    rmSync(targetPath, { recursive: true, force: true });
  }
  ensureDir(repoBasePath);
  try {
    await runGit(undefined, ["clone", "--branch", repo.branch, "--single-branch", repo.url, targetPath]);
    return ok(`✅ 全量克隆完成\n   仓库: ${repo.name}  [模块: ${repo.module || "?"}]\n   分支: ${repo.branch}\n   路径: ${targetPath}\n   类型: ${repo.repoType}`);
  } catch (err: any) {
    try { rmSync(targetPath, { recursive: true, force: true }); } catch {}
    throw err;
  }
}

async function incrementalClone(
  repo: MonitorEntry, repoBasePath: string,
  options: { sinceDate?: string; sinceMrId?: string; force: boolean },
  clientBaseDir?: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { sinceDate, sinceMrId, force } = options;
  const branchClonePath = join(repoBasePath, repo.branch);
  const adapter = getAdapter(repo.platform);
  if (!adapter.listMrs) throw new Error(`平台 "${repo.platform}" 不支持 MR 查询。请使用 GitHub 或已配置 mrApiTemplate 的 Generic 平台`);

  let mrs: Awaited<ReturnType<NonNullable<PlatformAdapter["listMrs"]>>>;
  try { mrs = await adapter.listMrs(repo, { sinceDate, sinceMrId }); }
  catch (err: any) { throw new Error(`获取 MR 列表失败: ${err.message}`); }

  const filterDesc = sinceDate ? `日期 "${sinceDate}" 之后` : `MR "${sinceMrId}" 之后`;
  if (mrs.length === 0) return ok(`📭 仓库 "${repo.name}" ${filterDesc} 没有已合入的 MR\n   如需拉取全量分支代码，请使用 mode=full`);
  if (clientBaseDir) return buildRemoteIncrementalCloneCmds(repo, repoBasePath, branchClonePath, mrs, filterDesc, force);

  if (!existsSync(branchClonePath)) {
    const r = await fullClone(repo, repoBasePath, false);
    if (!existsSync(branchClonePath)) return r;
  }
  try { await runGit(branchClonePath, ["fetch", "origin", repo.branch]); }
  catch (err: any) { throw new Error(`基础克隆 fetch 失败: ${err.message}`); }

  let cloned = 0, skipped = 0, failed = 0;
  const details: string[] = [];
  for (const mr of mrs) {
    const mrPath = join(repoBasePath, mr.id);
    if (existsSync(mrPath)) {
      if (force) { rmSync(mrPath, { recursive: true, force: true }); }
      else { skipped++; details.push(`  ⏭️  MR !${mr.id}: 已存在，跳过 (${mr.title.slice(0, 40)})`); continue; }
    }
    try {
      await runGit(undefined, ["clone", "--no-hardlinks", "--no-checkout", branchClonePath, mrPath]);
      try { await runGit(mrPath, ["checkout", mr.headSha]); }
      catch { await runGit(mrPath, ["fetch", "origin", mr.headSha]); await runGit(mrPath, ["checkout", mr.headSha]); }
      cloned++;
      details.push(`  ✅ MR !${mr.id}: ${mr.title.slice(0, 50)}\n     源分支: ${mr.sourceBranch.padEnd(20)} 合入: ${mr.mergedAt.slice(0, 10)}\n     作者: ${mr.author.padEnd(18)} SHA: ${mr.headSha.slice(0, 7)}`);
    } catch (err: any) {
      failed++;
      details.push(`  ❌ MR !${mr.id}: 克隆失败 — ${err.message}`);
      try { rmSync(mrPath, { recursive: true, force: true }); } catch {}
    }
  }
  const summary = [`📦 ${repo.name} 增量克隆完成 (${filterDesc})`, `   基础路径: ${branchClonePath}`, `   共找到 ${mrs.length} 个 MR`, `   成功: ${cloned}  |  跳过: ${skipped}  |  失败: ${failed}`, "", ...details];
  failed === 0 ? summary.push("", "✅ 全部 MR 克隆完成") : summary.push("", `⚠️ ${failed} 个 MR 克隆失败`);
  return ok(summary.join("\n"));
}
