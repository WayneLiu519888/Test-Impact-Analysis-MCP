/**
 * Test Impact Analysis MCP Server — 共享类型定义
 *
 * 设计原则：
 *   - RepoConfig     = 用户手写的静态配置（monitors.conf.json）
 *   - RepoState      = 程序自动维护的运行时状态（monitors.json）
 *   - MonitorEntry   = 合并视图（内存中使用）
 */

/** 一条 Git 提交的核心信息 */
export interface CommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string; // ISO 8601
}

/** 一条 MR/PR 的简要信息（用于增量克隆定位） */
export interface MrInfo {
  /** MR/PR ID（平台原生 ID，如 GitHub PR number） */
  id: string;
  /** MR/PR 标题 */
  title: string;
  /** 源分支名 */
  sourceBranch: string;
  /** 目标分支名 */
  targetBranch: string;
  /** MR HEAD commit SHA（合入后的代码状态） */
  headSha: string;
  /** Base commit SHA（合入前目标分支 HEAD） */
  baseSha: string;
  /** 合入时间（ISO 8601） */
  mergedAt: string;
  /** 作者 */
  author: string;
}

/** 认证配置 */
export type AuthConfig =
  | { type: "token"; token: string }
  | { type: "rsa"; privateKeyPath: string }
  | { type: "none" };

/** 通用 Git 平台的 API 配置 */
export interface GenericPlatformConfig {
  apiBase: string;
  /** 模板支持占位符：{owner} {repo} {branch} {projectId} */
  apiTemplate: string;
  projectId?: string;
  /**
   * MR/PR 查询 API 路径模板（可选）。
   * 配置后，repo_monitor(action='reset') 可通过 sinceDate 自动定位迭代第一个 MR。
   * 支持占位符：{owner} {repo} {branch}
   * 示例："/api/v1/projects/{owner}/repos/{repo}/merge_requests?state=merged&target_branch={branch}&order_by=created_at&sort=asc"
   */
  mrApiTemplate?: string;
}

// ═══════════════════════════════════════════════════════════
// 配置文件层（用户手写）
// ═══════════════════════════════════════════════════════════

/** 单个仓库的静态配置 — 用户手写 */
export interface RepoConfig {
  /** 仓库别名，全局唯一 */
  name: string;
  /** Git 远程 URL（如 git@github.com:user/repo.git） */
  url: string;
  /** 平台类型 */
  platform: "github" | "local" | "generic";
  /** 监控的分支 */
  branch: string;
  /** 代码仓类型：前端 or 后端，决定克隆时的存储路径 */
  repoType: "frontend" | "backend";
  /** 业务模块名（如 "用户中心"、"订单系统"），用于按模块批量操作 */
  module: string;
  /** 认证方式（可选）。
   *  本地 git 已通过 SSH config + RSA 公钥完成鉴权，绝大多数场景无需配置。
   *  仅当 REST API 需要额外认证时配置（如私有仓库需 token）。
   *  默认 none。 */
  auth?: AuthConfig;
  /** 本地仓库路径（platform=local 时必填） */
  localPath?: string;
  /** 通用平台 API 配置（platform=generic 时必填） */
  genericConfig?: GenericPlatformConfig;
}

/** monitors.conf.json 文件格式 */
export interface MonitorConfigFile {
  /**
   * MCP 根目录（可选）。
   * 所有代码克隆操作的存储根路径。不配置则默认使用 MCP Server 项目自身的目录。
   *
   * 路径规则：{baseDir}/Repository/{Frontend|Backend} repository/{repo-name}/{branch|mr-id}
   *
   * 本地模式：MCP Server 直接在 baseDir 下执行 git clone
   * 远程模式：客户端在自己的机器上配置 baseDir，同样按此路径规则存储
   */
  baseDir?: string;
  /** 仓库配置列表 */
  repositories: RepoConfig[];
}

// ═══════════════════════════════════════════════════════════
// 运行时状态层（程序自动维护）
// ═══════════════════════════════════════════════════════════

/** 水位重置快照 — 迭代切换时归档旧水位 */
export interface WatermarkSnapshot {
  /** 标签（如 "Sprint 24 kickoff"） */
  label: string;
  /** 重置前的老水位 SHA */
  prevSha: string;
  /** 重置后的新水位 SHA */
  newSha: string;
  /** 重置时间（ISO 8601） */
  time: string;
}

/** 单个仓库的运行时状态 */
export interface RepoState {
  /** 上次检查时的 HEAD SHA */
  lastSha: string;
  /** 上次检查时间（ISO 8601） */
  lastCheck: string;
  /** 已见过的新提交 SHA 集合（去重） */
  seenShas: string[];
  /** 水位重置历史（最新在前），用于迭代回顾 */
  snapshots?: WatermarkSnapshot[];
}

/** monitors.json 文件格式 */
export interface MonitorStateFile {
  [name: string]: RepoState;
}

// ═══════════════════════════════════════════════════════════
// 合并视图（内存中使用）
// ═══════════════════════════════════════════════════════════

/** 配置 + 状态的合并视图 */
export interface MonitorEntry extends RepoConfig {
  /** 从 url 解析出的 owner */
  owner: string;
  /** 从 url 解析出的 repo（不含 .git 后缀） */
  repo: string;
  /** 运行时状态字段 */
  lastSha: string;
  lastCheck: string;
  seenShas: string[];
  /** 水位重置历史（最新在前），用于迭代回顾 */
  snapshots: WatermarkSnapshot[];
}

// ═══════════════════════════════════════════════════════════
// 辅助类型
// ═══════════════════════════════════════════════════════════

/** Git URL 解析结果 */
export interface GitUrlInfo {
  host: string;
  owner: string;
  repo: string;
}

// ═══════════════════════════════════════════════════════════
// HTTP 服务端 + 安全配置（server.conf.json）
// ═══════════════════════════════════════════════════════════

/** API KEY 条目（服务端存储哈希，原始 key 仅在签发时返回一次） */
export interface ApiKeyEntry {
  /** SHA-256 哈希值，带算法前缀 "sha256:" */
  hash: string;
  /** 备注标签（如 "BBB-测试机器"） */
  label: string;
  /** 签发时间（ISO 8601） */
  createdAt: string;
  /** 签发时的客户端 IP（可选绑定，用于审计追踪） */
  clientIp?: string;
  /** 最后使用时间（ISO 8601），自动更新 */
  lastUsed?: string;
}

/** server.conf.json — HTTP 服务端 + 安全配置（仅在 MCP_TRANSPORT=http 时生效） */
export interface ServerConf {
  /** HTTP 监听端口，默认 3100 */
  port: number;
  /** 绑定地址。MCP 规范建议绑定 127.0.0.1，通过反向代理对外暴露。
   *  如需局域网共享则改为 0.0.0.0，同时必须配置 Origin 白名单。 */
  host: string;
  /** IP 白名单。支持精确 IP（192.168.1.100）和 CIDR 子网（192.168.0.0/16）。
   *  不配置 = 不限制 IP（仅校验 API KEY）。 */
  allowedIps?: string[];
  /** Origin 白名单，用于 DNS rebinding 防护（MCP 规范 MUST 要求）。
   *  不配置 = 不限制 Origin。仅当 host 非 127.0.0.1 时生效。
   *  示例: ["https://claude.ai", "http://192.168.1.100:3100"] */
  allowedOrigins?: string[];
  /** 是否信任 X-Forwarded-For 头（反向代理场景）。默认 false。 */
  xForwardedFor?: boolean;
  /** 联系人信息。IP 拦截时提示给客户端，如 "l30026134"。 */
  contactInfo?: string;
  /** API KEY 列表。TIA-init 签发的 key 存储于此，服务端仅存哈希。 */
  apiKeys: ApiKeyEntry[];
}
