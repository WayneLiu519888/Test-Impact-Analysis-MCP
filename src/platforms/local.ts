/**
 * 本地 Git 适配器 — 使用本机 git 命令，无需 API 调用
 *
 * 前置条件：仓库必须已 git clone 到本地，且 git 可执行。
 * 不需要任何 token，通过 SSH/RSA 公钥完成 fetch 鉴权。
 */

import { execFile } from "child_process";
import { promisify } from "util";
import type { CommitInfo, MonitorEntry, MrInfo } from "../types.js";
import type { PlatformAdapter, ListMrsOptions } from "./types.js";

const execFileAsync = promisify(execFile);

/** 提交列表一行格式：sha|shortSha|message|author|date */
const LOG_FORMAT = "%H|%h|%s|%an|%aI";

export class LocalGitAdapter implements PlatformAdapter {
  readonly name = "local";

  /**
   * 在仓库目录下执行 git 命令
   */
  private async git(localPath: string, args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: localPath,
        timeout: 30000,
        maxBuffer: 1024 * 1024, // 1MB
      });
      return stdout.trim();
    } catch (err: any) {
      const stderr = err.stderr || err.message;
      throw new Error(`[local:${localPath}] git ${args[0]} 失败: ${stderr}`);
    }
  }

  /**
   * 解析 git log 单行输出为 CommitInfo
   */
  private parseCommit(line: string): CommitInfo {
    const [sha, shortSha, message, author, date] = line.split("|");
    return { sha, shortSha, message, author, date };
  }

  /**
   * 获取远程分支的 HEAD SHA
   * 使用 git ls-remote 直接查远程（不需要 fetch）
   */
  async getHeadSha(repo: MonitorEntry): Promise<string> {
    if (!repo.localPath) {
      throw new Error(`仓库 ${repo.name} 缺少 localPath 配置`);
    }
    // 先 fetch，确保有最新的远程引用
    await this.git(repo.localPath, ["fetch", "origin", repo.branch]);
    // 获取远程分支的最新 SHA
    const sha = await this.git(repo.localPath, [
      "rev-parse",
      `origin/${repo.branch}`,
    ]);
    return sha;
  }

  /**
   * 获取两个 SHA 之间的提交列表
   */
  async getCommitsBetween(
    repo: MonitorEntry,
    base: string,
    head: string
  ): Promise<CommitInfo[]> {
    if (!repo.localPath) {
      throw new Error(`仓库 ${repo.name} 缺少 localPath 配置`);
    }
    // 确保本地有最新的远程引用
    await this.git(repo.localPath, ["fetch", "origin", repo.branch]);

    const output = await this.git(repo.localPath, [
      "log",
      `${base}..${head}`,
      `--format=${LOG_FORMAT}`,
      "--reverse", // 从旧到新
    ]);

    if (!output) return [];
    return output.split("\n").map((line) => this.parseCommit(line));
  }

  /**
   * 获取最近 N 条提交（基于 origin/branch）
   */
  async getRecentCommits(
    repo: MonitorEntry,
    count: number
  ): Promise<CommitInfo[]> {
    if (!repo.localPath) {
      throw new Error(`仓库 ${repo.name} 缺少 localPath 配置`);
    }
    await this.git(repo.localPath, ["fetch", "origin", repo.branch]);

    const output = await this.git(repo.localPath, [
      "log",
      `origin/${repo.branch}`,
      `-${count}`,
      `--format=${LOG_FORMAT}`,
    ]);

    if (!output) return [];
    return output.split("\n").map((line) => this.parseCommit(line));
  }

  /**
   * 查找 sinceDate 后第一个 merge commit 的第一个 parent SHA
   * （即合入前目标分支的 HEAD）。
   */
  async findFirstMrBaseAfter(
    repo: MonitorEntry,
    sinceDate: string
  ): Promise<string | null> {
    if (!repo.localPath) return null;

    try {
      await this.git(repo.localPath, ["fetch", "origin", repo.branch]);

      // 找该日期后第一个 merge commit
      const mergeSha = await this.git(repo.localPath, [
        "log",
        `origin/${repo.branch}`,
        "--merges",
        `--since=${sinceDate}`,
        "--reverse",
        "--format=%H",
        "-1",
      ]);

      if (!mergeSha) return null;

      // 返回第一个 parent（merge 前的分支状态）
      return await this.git(repo.localPath, [
        "rev-parse",
        `${mergeSha}^1`,
      ]);
    } catch {
      return null; // 任何错误都 fallback
    }
  }

  /**
   * 查询合入的 MR 列表（本地 git 通过 merge commits 模拟）。
   *
   * 仅支持 sinceDate 模式 — 通过 git log --merges --since 查找。
   * 不支持 sinceMrId（本地 git 没有 MR ID 概念）。
   */
  async listMrs(
    repo: MonitorEntry,
    options: ListMrsOptions
  ): Promise<MrInfo[]> {
    if (!repo.localPath) {
      throw new Error(`仓库 ${repo.name} 缺少 localPath 配置`);
    }

    if (options.sinceMrId) {
      throw new Error(
        `local 平台不支持 sinceMrId 模式（本地 git 没有 MR ID 概念），请使用 sinceDate 模式`
      );
    }

    if (!options.sinceDate) {
      return [];
    }

    try {
      await this.git(repo.localPath, ["fetch", "origin", repo.branch]);

      // 找该日期后所有 merge commit
      const output = await this.git(repo.localPath, [
        "log",
        `origin/${repo.branch}`,
        "--merges",
        `--since=${options.sinceDate}`,
        "--reverse",
        "--format=%H|%s|%an|%aI",
      ]);

      if (!output) return [];

      const results: MrInfo[] = [];
      for (const line of output.split("\n")) {
        const [sha, message, author, date] = line.split("|");
        if (!sha) continue;

        let baseSha = "";
        try {
          baseSha = await this.git(repo.localPath!, ["rev-parse", `${sha}^1`]);
        } catch {
          // 获取 base 失败不阻塞
        }

        results.push({
          id: sha.slice(0, 7), // 用短 SHA 作为 ID
          title: message,
          sourceBranch: "",
          targetBranch: repo.branch,
          headSha: sha,
          baseSha,
          mergedAt: date,
          author,
        });
      }
      return results;
    } catch {
      return [];
    }
  }
}
