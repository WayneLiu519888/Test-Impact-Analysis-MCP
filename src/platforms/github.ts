/**
 * GitHub REST API 适配器
 *
 * 使用 GitHub REST API v3 获取提交信息。
 * 支持 Personal Access Token 认证（可选，未认证 60次/小时，认证 5000次/小时）。
 *
 * API 文档：https://docs.github.com/en/rest/commits/commits
 */

import type { CommitInfo, MonitorEntry, MrInfo } from "../types.js";
import type { PlatformAdapter, ListMrsOptions } from "./types.js";

/** GitHub API 基础 URL */
const GITHUB_API = "https://api.github.com";

export class GitHubAdapter implements PlatformAdapter {
  readonly name = "github";

  /**
   * 构造 GitHub API 请求头
   */
  private headers(repo: MonitorEntry): Record<string, string> {
    const h: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "git-monitor-mcp/1.0",
    };
    if (repo.auth?.type === "token" && repo.auth.token) {
      h.Authorization = `Bearer ${repo.auth.token}`;
    }
    return h;
  }

  /**
   * 调 GitHub REST API
   */
  private async api(repo: MonitorEntry, path: string): Promise<any> {
    const url = `${GITHUB_API}${path}`;
    const res = await fetch(url, { headers: this.headers(repo) });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `GitHub API ${res.status}: ${path}\n${body.slice(0, 300)}`
      );
    }

    return res.json();
  }

  /**
   * 解析 GitHub commit 响应为 CommitInfo
   */
  private parseCommit(raw: any): CommitInfo {
    return {
      sha: raw.sha,
      shortSha: raw.sha.slice(0, 7),
      message: raw.commit?.message?.split("\n")[0] ?? "",
      author: raw.commit?.author?.name ?? raw.author?.login ?? "unknown",
      date: raw.commit?.author?.date ?? "",
    };
  }

  /**
   * 获取分支最新 HEAD SHA
   */
  async getHeadSha(repo: MonitorEntry): Promise<string> {
    const data = await this.api(
      repo,
      `/repos/${repo.owner}/${repo.repo}/git/ref/heads/${repo.branch}`
    );
    return data.object.sha;
  }

  /**
   * 获取两个 SHA 之间的提交列表
   * GitHub API 没有直接 "between" 端点，用 /compare
   */
  async getCommitsBetween(
    repo: MonitorEntry,
    base: string,
    head: string
  ): Promise<CommitInfo[]> {
    const data = await this.api(
      repo,
      `/repos/${repo.owner}/${repo.repo}/compare/${base}...${head}`
    );
    return (data.commits ?? []).map((c: any) => this.parseCommit(c));
  }

  /**
   * 获取最近 N 条提交
   */
  async getRecentCommits(
    repo: MonitorEntry,
    count: number
  ): Promise<CommitInfo[]> {
    const data = await this.api(
      repo,
      `/repos/${repo.owner}/${repo.repo}/commits?sha=${repo.branch}&per_page=${Math.min(count, 100)}`
    );
    return (data ?? []).map((c: any) => this.parseCommit(c));
  }

  /**
   * 查找迭代开始日期后第一个合入目标分支的 PR 的 base.sha。
   *
   * GitHub PR API: GET /repos/:owner/:repo/pulls
   *   ?state=closed&sort=updated&direction=asc&base={branch}&per_page=50
   *
   * 响应中 pr.merged_at 为合入时间，pr.base.sha 为合入前目标分支 HEAD。
   * 按 updated 升序排列后，本地过滤 merged_at >= sinceDate，取第一个。
   *
   * @returns base commit SHA，找不到返回 null
   */
  async findFirstMrBaseAfter(
    repo: MonitorEntry,
    sinceDate: string
  ): Promise<string | null> {
    const data = await this.api(
      repo,
      `/repos/${repo.owner}/${repo.repo}/pulls` +
      `?state=closed&sort=updated&direction=asc&base=${repo.branch}&per_page=50`
    );

    if (!Array.isArray(data)) return null;

    const firstPr = data.find((pr: any) => {
      if (!pr.merged_at) return false;
      return pr.merged_at >= sinceDate;
    });

    if (!firstPr?.base?.sha) return null;

    return firstPr.base.sha;
  }

  /**
   * 查询已合入的 PR 列表（用于增量克隆）。
   *
   * 分页拉取 closed PRs，按 updated 升序排列，过滤 merged_at。
   * 最多拉取 5 页（500 条），覆盖绝大多数场景。
   */
  async listMrs(
    repo: MonitorEntry,
    options: ListMrsOptions
  ): Promise<MrInfo[]> {
    const allMrs: MrInfo[] = [];
    let page = 1;
    const perPage = 100;
    const maxPages = 5;

    // — sinceDate 模式：拉取所有 merged_at >= sinceDate 的 —
    if (options.sinceDate) {
      while (page <= maxPages) {
        const data = await this.api(
          repo,
          `/repos/${repo.owner}/${repo.repo}/pulls` +
          `?state=closed&sort=updated&direction=asc` +
          `&base=${repo.branch}&per_page=${perPage}&page=${page}`
        );
        if (!Array.isArray(data) || data.length === 0) break;

        for (const pr of data) {
          if (pr.merged_at && pr.merged_at >= options.sinceDate) {
            allMrs.push(this.parseMr(pr));
          }
        }

        // 如果本页最后一条的 merged_at < sinceDate，说明后续页都不会满足
        const last = data[data.length - 1];
        if (!last.merged_at || last.merged_at < options.sinceDate) break;

        page++;
      }
      return allMrs;
    }

    // — sinceMrId 模式：拉取到找到指定 MR，然后取后续所有 —
    if (options.sinceMrId) {
      let found = false;
      while (page <= maxPages) {
        const data = await this.api(
          repo,
          `/repos/${repo.owner}/${repo.repo}/pulls` +
          `?state=closed&sort=updated&direction=asc` +
          `&base=${repo.branch}&per_page=${perPage}&page=${page}`
        );
        if (!Array.isArray(data) || data.length === 0) break;

        for (const pr of data) {
          if (!pr.merged_at) continue;

          if (found) {
            // 基线 MR 之后的所有 MR
            allMrs.push(this.parseMr(pr));
          } else if (String(pr.number) === options.sinceMrId) {
            found = true; // 找到基线，后续开始收集
          }
        }

        if (found && data.length < perPage) break; // 最后一页
        page++;
      }

      if (!found) {
        throw new Error(
          `未找到 ID 为 ${options.sinceMrId} 的已合入 PR（已扫描 ${maxPages} 页）`
        );
      }
      return allMrs;
    }

    return allMrs;
  }

  /** 将 GitHub PR 响应解析为 MrInfo */
  private parseMr(pr: any): MrInfo {
    return {
      id: String(pr.number),
      title: pr.title ?? "",
      sourceBranch: pr.head?.ref ?? "",
      targetBranch: pr.base?.ref ?? "",
      headSha: pr.merge_commit_sha ?? pr.head?.sha ?? "",
      baseSha: pr.base?.sha ?? "",
      mergedAt: pr.merged_at ?? "",
      author: pr.user?.login ?? "unknown",
    };
  }
}
