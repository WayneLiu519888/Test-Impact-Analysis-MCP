/**
 * 平台适配器接口
 * 每个 Git 平台（GitHub / 本地 / 通用 REST API）都实现此接口
 */

import type { CommitInfo, MonitorEntry, MrInfo } from "../types.js";

/** listMrs 的查询选项 */
export interface ListMrsOptions {
  /** 起始日期（ISO 8601），拉取该日期后合入的 MR */
  sinceDate?: string;
  /** 基线 MR ID，拉取该 MR 之后合入的 MR（不含自身） */
  sinceMrId?: string;
}

export interface PlatformAdapter {
  /** 适配器名称（用于日志） */
  readonly name: string;

  /**
   * 获取当前分支 HEAD 的 commit SHA
   */
  getHeadSha(repo: MonitorEntry): Promise<string>;

  /**
   * 获取两个 SHA 之间的所有提交（不包含 base）
   */
  getCommitsBetween(
    repo: MonitorEntry,
    base: string,
    head: string
  ): Promise<CommitInfo[]>;

  /**
   * 获取最近 N 条提交（纯查询，不更新水位）
   */
  getRecentCommits(repo: MonitorEntry, count: number): Promise<CommitInfo[]>;

  /**
   * 查找指定日期后第一个合入目标分支的 MR/PR 的 base commit SHA。
   *
   * 敏捷场景：迭代开始日之后第一个 MR 合入前目标分支的 HEAD，
   * 作为水位重置的锚点。
   *
   * @param repo      监控条目
   * @param sinceDate 迭代开始日期（ISO 8601，如 "2026-06-01"）
   * @returns base SHA，找不到则返回 null
   */
  findFirstMrBaseAfter?(
    repo: MonitorEntry,
    sinceDate: string
  ): Promise<string | null>;

  /**
   * 查询 MR/PR 列表（用于增量克隆）。
   *
   * @param repo    监控条目
   * @param options  过滤条件（sinceDate / sinceMrId 二选一）
   * @returns MR 列表，按合入时间升序排列
   */
  listMrs?(
    repo: MonitorEntry,
    options: ListMrsOptions
  ): Promise<MrInfo[]>;
}
