/**
 * 通用 Git REST API 适配器
 *
 * 用户自行配置 API 端点、路径模板和认证方式。
 * 适用于 CodeHub、GitLab、Gitee 等遵循 Git REST API 通用模式的内网平台。
 *
 * 认证方式：
 *   - token: 标准 Bearer Token
 *   - rsa:   使用本地 RSA 私钥签名请求（CodeHub 共通模式）
 *   - none:  无认证
 *
 * 响应格式预设：
 *   - github: [{sha, commit: {message, author: {name, date}}}]
 *   - gitlab: [{id, title, author_name, created_at}]
 */

import { createSign } from "crypto";
import { readFileSync } from "fs";
import type { CommitInfo, MonitorEntry, MrInfo } from "../types.js";
import type { PlatformAdapter, ListMrsOptions } from "./types.js";

/** 通用适配器支持的响应格式预设 */
type ResponseFormat = "github" | "gitlab";

export class GenericGitAdapter implements PlatformAdapter {
  readonly name = "generic";

  /**
   * 替换 URL 模板中的占位符
   */
  private buildUrl(
    template: string,
    repo: MonitorEntry,
    branch: string
  ): string {
    const cfg = repo.genericConfig;
    const projectId = cfg?.projectId ?? "";

    return template
      .replace(/\{owner\}/g, repo.owner)
      .replace(/\{repo\}/g, repo.repo)
      .replace(/\{branch\}/g, branch)
      .replace(/\{projectId\}/g, projectId);
  }

  /**
   * 构造请求头（含授权）
   */
  private async buildHeaders(
    repo: MonitorEntry,
    method: string,
    path: string
  ): Promise<Record<string, string>> {
    const h: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "git-monitor-mcp/1.0",
    };

    const auth = repo.auth;
    if (auth) {
      switch (auth.type) {
        case "token":
          h.Authorization = `Bearer ${auth.token}`;
          break;

        case "rsa": {
          // RSA 签名模式：签名 (method + path + timestamp) 放 Authorization 头
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const toSign = `${method.toUpperCase()}\n${path}\n${timestamp}`;
          const keyPath = auth.privateKeyPath;
          const privateKey = readFileSync(keyPath, "utf-8");
          const sign = createSign("RSA-SHA256");
          sign.update(toSign);
          sign.end();
          const signature = sign.sign(privateKey, "base64");
          h.Authorization = `RSA-SHA256 timestamp=${timestamp},signature=${signature}`;
          break;
        }

        case "none":
          break;
      }
    }

    return h;
  }

  /**
   * 调通用 API
   */
  private async api(
    repo: MonitorEntry,
    apiPath: string
  ): Promise<any> {
    const cfg = repo.genericConfig;
    if (!cfg) {
      throw new Error(`仓库 ${repo.name} 缺少 genericConfig 配置`);
    }

    const url = `${cfg.apiBase}${apiPath}`;
    const headers = await this.buildHeaders(repo, "GET", apiPath);

    const res = await fetch(url, { headers });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `[${cfg.apiBase}] API ${res.status}: ${apiPath}\n${body.slice(0, 300)}`
      );
    }

    return res.json();
  }

  /**
   * 解析响应中的 commit 数组
   * 支持两种常见格式：
   *   github: 响应本身就是 commit[] 数组
   *   gitlab: 响应本身就是 commit[] 数组（结构不同）
   *
   * 如果响应是 { data: [...] } 包装的，也兼容。
   */
  private extractArray(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    // 兼容 { data: [...] } / { items: [...] } 包装
    return raw?.data ?? raw?.items ?? [];
  }

  /**
   * 解析单条 commit 响应为 CommitInfo
   * 尝试 github 和 gitlab 两种格式
   */
  private parseCommit(raw: any): CommitInfo {
    // GitHub 格式
    if (raw.commit) {
      return {
        sha: raw.sha ?? raw.id ?? "",
        shortSha: (raw.sha ?? raw.id ?? "").slice(0, 7),
        message: raw.commit.message?.split("\n")[0] ?? "",
        author: raw.commit.author?.name ?? raw.author?.login ?? "unknown",
        date: raw.commit.author?.date ?? raw.commit.committer?.date ?? "",
      };
    }

    // GitLab 格式
    return {
      sha: raw.id ?? raw.sha ?? "",
      shortSha: (raw.id ?? raw.sha ?? "").slice(0, 7),
      message: raw.title ?? raw.message?.split("\n")[0] ?? "",
      author: raw.author_name ?? raw.author?.name ?? "unknown",
      date: raw.created_at ?? raw.committed_date ?? "",
    };
  }

  /**
   * 获取 HEAD SHA：拉最新 1 条提交取 sha
   */
  async getHeadSha(repo: MonitorEntry): Promise<string> {
    if (!repo.genericConfig) {
      throw new Error(`仓库 ${repo.name} 缺少 genericConfig 配置`);
    }

    const apiPath = this.buildUrl(
      repo.genericConfig.apiTemplate,
      repo,
      repo.branch
    );

    const raw = await this.api(repo, apiPath);
    const arr = this.extractArray(raw);

    if (arr.length === 0) {
      throw new Error(
        `仓库 ${repo.name} API 返回空提交列表 — 检查分支名或认证`
      );
    }

    return this.parseCommit(arr[0]).sha;
  }

  /**
   * 获取两个 SHA 之间的提交
   * 先拉全量再本地过滤（通用 API 不一定支持 /compare）
   */
  async getCommitsBetween(
    repo: MonitorEntry,
    base: string,
    head: string
  ): Promise<CommitInfo[]> {
    if (!repo.genericConfig) {
      throw new Error(`仓库 ${repo.name} 缺少 genericConfig 配置`);
    }

    const apiPath = this.buildUrl(
      repo.genericConfig.apiTemplate,
      repo,
      repo.branch
    );

    const params = new URLSearchParams({ per_page: "100" });
    const url = `${apiPath}${apiPath.includes("?") ? "&" : "?"}${params.toString()}`;
    const raw = await this.api(repo, url);
    const all = this.extractArray(raw).map((c: any) => this.parseCommit(c));

    // 本地过滤：找到 base 的位置，取它之后的所有提交
    const baseIdx = all.findIndex((c) => c.sha === base);
    if (baseIdx === -1) {
      // base 不在返回的 100 条内，返回全部（避免遗漏）
      return all.reverse(); // 从旧到新
    }
    return all.slice(0, baseIdx).reverse();
  }

  /**
   * 获取最近 N 条提交
   */
  async getRecentCommits(
    repo: MonitorEntry,
    count: number
  ): Promise<CommitInfo[]> {
    if (!repo.genericConfig) {
      throw new Error(`仓库 ${repo.name} 缺少 genericConfig 配置`);
    }

    const apiPath = this.buildUrl(
      repo.genericConfig.apiTemplate,
      repo,
      repo.branch
    );

    const params = new URLSearchParams({ per_page: String(Math.min(count, 100)) });
    const url = `${apiPath}${apiPath.includes("?") ? "&" : "?"}${params.toString()}`;
    const raw = await this.api(repo, url);
    return this.extractArray(raw).map((c: any) => this.parseCommit(c));
  }

  /**
   * 查找迭代开始日期后第一个合入目标分支的 MR 的 base commit SHA。
   *
   * 通过 mrApiTemplate 配置项查询 MR 列表。
   * 未配置 mrApiTemplate 时返回 null（→ fallback 到当前 HEAD）。
   *
   * 响应中尝试多种可能的 base SHA 字段名：
   *   base.sha / base_sha / diff_refs.base_sha / target_sha
   *
   * 合入时间字段尝试：merged_at / mergedAt / updated_at
   *
   * @returns base commit SHA，找不到返回 null
   */
  async findFirstMrBaseAfter(
    repo: MonitorEntry,
    sinceDate: string
  ): Promise<string | null> {
    const cfg = repo.genericConfig;
    if (!cfg?.mrApiTemplate) return null; // 未配置 MR API

    const apiPath = this.buildUrl(cfg.mrApiTemplate, repo, repo.branch);
    const raw = await this.api(repo, apiPath);
    const mrs = this.extractArray(raw);

    if (mrs.length === 0) return null;

    // 找到 first merged_at >= sinceDate 的 MR
    const firstMr = mrs.find((mr: any) => {
      const mergedAt =
        mr.merged_at || mr.mergedAt || mr.updated_at || "";
      return mergedAt && mergedAt >= sinceDate;
    });

    if (!firstMr) return null;

    return (
      firstMr.base?.sha ||
      firstMr.base_sha ||
      firstMr.diff_refs?.base_sha ||
      firstMr.target_sha ||
      firstMr.target?.sha ||
      null
    );
  }

  /**
   * 查询已合入的 MR 列表（用于增量克隆）。
   *
   * 通过 mrApiTemplate 分页查询，兼容 GitHub / GitLab 响应格式。
   * 最多拉取 5 页（每页 100 条），覆盖绝大多数场景。
   */
  async listMrs(
    repo: MonitorEntry,
    options: ListMrsOptions
  ): Promise<MrInfo[]> {
    const cfg = repo.genericConfig;
    if (!cfg?.mrApiTemplate) {
      throw new Error(
        `仓库 ${repo.name} 未配置 mrApiTemplate，无法查询 MR 列表。` +
        `请在 monitors.conf.json 中为 generic 平台配置 mrApiTemplate`
      );
    }

    const allMrs: MrInfo[] = [];
    const perPage = 100;
    const maxPages = 5;
    let page = 1;

    // 辅助：构建分页 URL，用 URLSearchParams 确保参数正确覆盖
    const buildMrUrl = (p: number): string => {
      const base = this.buildUrl(cfg.mrApiTemplate!, repo, repo.branch);
      const params = new URLSearchParams({ per_page: String(perPage), page: String(p) });
      return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;
    };

    // —— sinceDate 模式 ——
    if (options.sinceDate) {
      while (page <= maxPages) {
        const raw = await this.api(repo, buildMrUrl(page));
        const mrs = this.extractArray(raw);
        if (mrs.length === 0) break;

        for (const mr of mrs) {
          const mia = this.parseMrInfo(mr);
          if (mia.mergedAt && mia.mergedAt >= options.sinceDate) {
            allMrs.push(mia);
          }
        }

        // 最后一页或本页最后一条 merged 时间早于 sinceDate → 结束
        const last = mrs[mrs.length - 1];
        const lastMerged =
          last?.merged_at || last?.mergedAt || last?.updated_at || "";
        if (!lastMerged || lastMerged < options.sinceDate) break;
        if (mrs.length < perPage) break;

        page++;
      }
      return allMrs;
    }

    // —— sinceMrId 模式 ——
    if (options.sinceMrId) {
      let found = false;
      while (page <= maxPages) {
        const raw = await this.api(repo, buildMrUrl(page));
        const mrs = this.extractArray(raw);
        if (mrs.length === 0) break;

        for (const mr of mrs) {
          const mia = this.parseMrInfo(mr);
          if (!mia.mergedAt) continue;

          if (found) {
            allMrs.push(mia);
          } else if (mia.id === options.sinceMrId) {
            found = true;
          }
        }

        if (found && mrs.length < perPage) break;
        page++;
      }

      if (!found) {
        throw new Error(
          `未找到 ID 为 ${options.sinceMrId} 的已合入 MR（已扫描 ${maxPages} 页）`
        );
      }
      return allMrs;
    }

    return allMrs;
  }

  /**
   * 解析 MR 响应为 MrInfo
   * 兼容 GitHub PR 和 GitLab MR 格式
   */
  private parseMrInfo(mr: any): MrInfo {
    // GitHub PR 格式
    if (mr.number !== undefined) {
      return {
        id: String(mr.number),
        title: mr.title ?? "",
        sourceBranch: mr.head?.ref ?? "",
        targetBranch: mr.base?.ref ?? "",
        headSha: mr.merge_commit_sha ?? mr.head?.sha ?? "",
        baseSha: mr.base?.sha ?? "",
        mergedAt: mr.merged_at ?? mr.mergedAt ?? "",
        author: mr.user?.login ?? mr.author?.name ?? "unknown",
      };
    }

    // GitLab / 通用 MR 格式
    return {
      id: String(mr.iid ?? mr.id ?? ""),
      title: mr.title ?? mr.name ?? "",
      sourceBranch: mr.source_branch ?? "",
      targetBranch: mr.target_branch ?? "",
      headSha: mr.merge_commit_sha ?? mr.sha ?? mr.merge_sha ?? "",
      baseSha:
        mr.base?.sha ??
        mr.base_sha ??
        mr.diff_refs?.base_sha ??
        mr.target_sha ??
        mr.target?.sha ??
        "",
      mergedAt: mr.merged_at ?? mr.mergedAt ?? mr.updated_at ?? "",
      author: mr.author?.name ?? mr.author_name ?? mr.user?.login ?? "unknown",
    };
  }

  /**
   * 获取两个 SHA 之间的变更文件列表。
   *
   * 通用平台无 /compare 端点。尝试策略：
   *   1. 拉取 base..head 区间的 commit 列表
   *   2. 从原始响应中尝试提取文件级变更数据
   *   3. 不可用时给出明确提示
   */
  async getDiffFiles(
    repo: MonitorEntry,
    base: string,
    head: string
  ): Promise<string[]> {
    if (!repo.genericConfig) {
      throw new Error(`仓库 ${repo.name} 缺少 genericConfig 配置`);
    }

    const apiPath = this.buildUrl(
      repo.genericConfig.apiTemplate,
      repo,
      repo.branch
    );
    const params = new URLSearchParams({ per_page: "100" });
    const url = `${apiPath}${apiPath.includes("?") ? "&" : "?"}${params.toString()}`;
    const raw = await this.api(repo, url);
    const all = this.extractArray(raw);

    // 找到 base 之后的所有 commit
    const baseIdx = all.findIndex((c: any) =>
      (c.sha ?? c.id) === base
    );
    const range = baseIdx === -1 ? all : all.slice(0, baseIdx);

    // 尝试从 commit 对象提取变更文件
    const fileSet = new Set<string>();
    for (const c of range) {
      // GitLab 格式: c.stats / c.diff
      // 通用格式: c.files / c.changed_files
      const files =
        c.files ??
        c.changed_files ??
        c.diff?.map((d: any) => d.new_path) ??
        [];
      if (Array.isArray(files)) {
        for (const f of files) {
          if (typeof f === "string") fileSet.add(f);
          else if (f.new_path) fileSet.add(f.new_path as string);
          else if (f.filename) fileSet.add(f.filename as string);
        }
      }
    }

    if (fileSet.size === 0) {
      throw new Error(
        `仓库 "${repo.name}" 的 API 响应中未包含文件级变更数据。\n` +
        `建议: 使用 GitHub 或 local 平台以支持完整的 diff 分析，或为 generic 平台配置文件变更字段名。`
      );
    }

    return Array.from(fileSet);
  }
}
