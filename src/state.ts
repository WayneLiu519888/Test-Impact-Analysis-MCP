/**
 * 监控状态管理 — 配置与状态分离
 *
 * 文件分工：
 *   monitors.conf.json  →  用户手写的静态配置（仓库 URL / 分支 / 认证）
 *   monitors.json       →  程序自动维护的运行时状态（水位 SHA / 检查时间）
 *
 * 合并逻辑：
 *   - 配置中有 & 状态中有  →  正常合并
 *   - 配置中有 & 状态中无  →  新仓库，lastSha 为空，首次 repo_monitor(action='check') 时初始化
 *   - 配置中无 & 状态中有  →  用户已从配置中移除，忽略
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type {
  RepoConfig,
  MonitorConfigFile,
  RepoState,
  MonitorStateFile,
  MonitorEntry,
  WatermarkSnapshot,
  AuthConfig,
  GitUrlInfo,
} from "./types.js";

// ESM __dirname 等价物
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** MCP Server 项目自身的根目录 — 仅用于定位配置文件（monitors.conf.json / monitors.json） */
const CFG_ROOT = join(__dirname, "..");
const CONFIG_FILE = join(CFG_ROOT, "monitors.conf.json");
const STATE_FILE = join(CFG_ROOT, "monitors.json");

/**
 * 获取代码克隆的根目录（用户可在 monitors.conf.json 中配置 baseDir）。
 *
 * 优先级: 配置文件中的 baseDir > MCP Server 项目根目录（向后兼容）
 *
 * 路径规则: {baseDir}/Repository/{Frontend|Backend} repository/{repo-name}/{branch|mr-id}
 */
export function getBaseDir(): string {
  const config = loadConfig();
  if (config.baseDir && config.baseDir.trim()) {
    return config.baseDir.trim().replace(/\\/g, "/");
  }
  return CFG_ROOT;
}

/** 默认认证：无认证。绝大多数场景下本地 git 已通过 SSH 完成鉴权。 */
const DEFAULT_AUTH: AuthConfig = { type: "none" };

// ═══════════════════════════════════════════════════════════
// Git URL 解析
// ═══════════════════════════════════════════════════════════

export function parseGitUrl(url: string): GitUrlInfo {
  const httpsMatch = url.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    const parts = httpsMatch[2].split("/");
    const repo = parts.pop()!;
    const owner = parts.join("/") || repo;
    return { host: httpsMatch[1], owner, repo };
  }

  const sshMatch = url.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const parts = sshMatch[2].split("/");
    const repo = parts.pop()!;
    const owner = parts.join("/") || repo;
    return { host: sshMatch[1], owner, repo };
  }

  const scpMatch = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (scpMatch) {
    const parts = scpMatch[2].split("/");
    const repo = parts.pop()!;
    const owner = parts.join("/") || repo;
    return { host: scpMatch[1], owner, repo };
  }

  throw new Error(
    `无法解析 Git URL: "${url}". ` +
    `支持: git@host:owner/repo.git, ssh://git@host/owner/repo.git, https://host/owner/repo.git`
  );
}

// ═══════════════════════════════════════════════════════════
// 配置文件读写（monitors.conf.json）
// ═══════════════════════════════════════════════════════════

/** 读取用户手写的配置文件 */
export function loadConfig(): MonitorConfigFile {
  if (!existsSync(CONFIG_FILE)) {
    return { repositories: [] };
  }
  const raw = readFileSync(CONFIG_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  return {
    baseDir: typeof parsed.baseDir === "string" ? parsed.baseDir : undefined,
    repositories: Array.isArray(parsed.repositories) ? parsed.repositories : [],
  };
}

/** 写入配置文件 */
export function saveConfig(config: MonitorConfigFile): void {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/** 按 name 查找配置中的某个仓库 */
export function findRepoConfig(name: string): RepoConfig | undefined {
  return loadConfig().repositories.find((r) => r.name === name);
}

/** 添加/更新一个仓库配置 */
export function upsertRepoConfig(repo: RepoConfig): void {
  const config = loadConfig();
  const idx = config.repositories.findIndex((r) => r.name === repo.name);
  if (idx >= 0) {
    config.repositories[idx] = repo;
  } else {
    config.repositories.push(repo);
  }
  saveConfig(config);
}

/** 从配置中移除一个仓库（同时清理状态） */
export function removeRepoConfig(name: string): boolean {
  const config = loadConfig();
  const idx = config.repositories.findIndex((r) => r.name === name);
  if (idx < 0) return false;
  config.repositories.splice(idx, 1);
  saveConfig(config);

  // 同时清理状态文件
  const state = loadState();
  if (state[name]) {
    delete state[name];
    saveState(state);
  }
  return true;
}

/** 列出所有配置中的仓库 */
export function listRepoConfigs(): RepoConfig[] {
  return loadConfig().repositories;
}

// ═══════════════════════════════════════════════════════════
// 状态文件读写（monitors.json）
// ═══════════════════════════════════════════════════════════

/** 读取运行时状态 */
export function loadState(): MonitorStateFile {
  if (!existsSync(STATE_FILE)) {
    return {};
  }
  const raw = readFileSync(STATE_FILE, "utf-8");
  return JSON.parse(raw);
}

/** 写入运行时状态 */
export function saveState(state: MonitorStateFile): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/** 读取单个仓库的运行时状态（不存在返回 undefined） */
export function getRepoState(name: string): RepoState | undefined {
  return loadState()[name];
}

// ═══════════════════════════════════════════════════════════
// 合并视图（配置 + 状态 → MonitorEntry[]）
// ═══════════════════════════════════════════════════════════

/**
 * 合并配置与状态，返回完整的监控条目列表。
 *
 * 规则：
 *   - 配置中的每个仓库都会出现在结果中
 *   - 如果状态中无此仓库 → lastSha/lastCheck 为空，由首次 repo_monitor(action='check') 初始化
 *   - 状态中有但配置中无 → 忽略（用户已移除）
 */
export function getMonitorEntries(): MonitorEntry[] {
  const config = loadConfig();
  const state = loadState();

  return config.repositories.map((repo) => {
    const urlInfo = parseGitUrl(repo.url);
    const st = state[repo.name] ?? { lastSha: "", lastCheck: "", seenShas: [] };

    return {
      ...repo,
      module: repo.module ?? "",
      auth: repo.auth ?? DEFAULT_AUTH,
      owner: urlInfo.owner,
      repo: urlInfo.repo,
      lastSha: st.lastSha,
      lastCheck: st.lastCheck,
      seenShas: st.seenShas,
      snapshots: st.snapshots ?? [],
    };
  });
}

/** 获取单个合并条目 */
export function getMonitorEntry(name: string): MonitorEntry | undefined {
  return getMonitorEntries().find((e) => e.name === name);
}

// ═══════════════════════════════════════════════════════════
// 水位更新
// ═══════════════════════════════════════════════════════════

/**
 * 更新水位标记。
 * 不修改配置文件，只修改状态文件。
 */
export function updateWatermark(
  name: string,
  newSha: string,
  newCommitShas: string[]
): void {
  const state = loadState();

  const st: RepoState = state[name] ?? { lastSha: "", lastCheck: "", seenShas: [] };
  st.lastSha = newSha;
  st.lastCheck = new Date().toISOString();

  const seen = new Set(st.seenShas);
  for (const sha of newCommitShas) seen.add(sha);
  st.seenShas = Array.from(seen).slice(-500); // 最多保留 500 条

  state[name] = st;
  saveState(state);
}

/**
 * 重置水位到指定的 SHA。
 * 旧水位归档为快照（最多保留 20 条，防无限增长）。
 *
 * @param name    仓库别名
 * @param newSha  新的水位 SHA
 * @param label   标签（如 "Sprint 25 kickoff"），用于回顾
 */
export function resetWatermark(name: string, newSha: string, label: string): WatermarkSnapshot {
  const state = loadState();
  const st = state[name] ?? { lastSha: "", lastCheck: "", seenShas: [] };

  const snapshot: WatermarkSnapshot = {
    label,
    prevSha: st.lastSha || "(首次)",
    newSha,
    time: new Date().toISOString(),
  };

  // 归档旧水位
  const snaps = st.snapshots ?? [];
  snaps.unshift(snapshot);
  st.snapshots = snaps.slice(0, 20);

  // 重置水位
  st.lastSha = newSha;
  st.lastCheck = snapshot.time;
  st.seenShas = [];

  state[name] = st;
  saveState(state);

  return snapshot;
}

// ═══════════════════════════════════════════════════════════
// 配置文件校验（启动时调用）
// ═══════════════════════════════════════════════════════════

/** 校验配置文件的合法性，返回错误信息数组（空 = 通过） */
export function validateConfig(): string[] {
  const errors: string[] = [];

  if (!existsSync(CONFIG_FILE)) {
    return []; // 首次启动，无配置文件不算错误
  }

  let config: MonitorConfigFile;
  try {
    config = loadConfig();
  } catch {
    errors.push(`monitors.conf.json 格式错误：无法解析 JSON`);
    return errors;
  }

  if (!Array.isArray(config.repositories)) {
    errors.push(`monitors.conf.json 缺少 "repositories" 数组`);
    return errors;
  }

  const names = new Set<string>();

  for (let i = 0; i < config.repositories.length; i++) {
    const r = config.repositories[i];
    const prefix = `repositories[${i}]`;

    if (!r.name || typeof r.name !== "string") {
      errors.push(`${prefix}.name 缺失或类型错误`);
    } else if (names.has(r.name)) {
      errors.push(`${prefix}.name "${r.name}" 重复`);
    } else {
      names.add(r.name);
    }

    if (!r.url || typeof r.url !== "string") {
      errors.push(`${prefix}.url 缺失`);
    } else {
      try { parseGitUrl(r.url); } catch {
        errors.push(`${prefix}.url "${r.url}" 无法解析`);
      }
    }

    if (!["github", "local", "generic"].includes(r.platform)) {
      errors.push(`${prefix}.platform 必须为 github / local / generic`);
    }

    if (!r.repoType || !["frontend", "backend"].includes(r.repoType)) {
      errors.push(`${prefix}.repoType 必须为 frontend 或 backend`);
    }

    if (!r.module || typeof r.module !== "string" || !r.module.trim()) {
      errors.push(`${prefix}.module 缺失或为空`);
    }

    if (!r.branch || typeof r.branch !== "string") {
      errors.push(`${prefix}.branch 缺失`);
    }

    if (r.platform === "local" && !r.localPath) {
      errors.push(`${prefix}: platform=local 需要 localPath`);
    }

    if (r.platform === "generic") {
      if (!r.genericConfig?.apiBase) {
        errors.push(`${prefix}: platform=generic 需要 genericConfig.apiBase`);
      }
      if (!r.genericConfig?.apiTemplate) {
        errors.push(`${prefix}: platform=generic 需要 genericConfig.apiTemplate`);
      }
    }

    // auth 为可选项，默认 none。有 auth 时校验 type 合法性
    if (r.auth && !["token", "rsa", "none"].includes(r.auth.type)) {
      errors.push(`${prefix}.auth.type 必须为 token / rsa / none`);
    }
  }

  return errors;
}

/** 确保配置文件存在（不存在则创建种子文件） */
export function ensureConfigFile(): void {
  if (!existsSync(CONFIG_FILE)) {
    saveConfig({ repositories: [] });
    console.error(`[TIA] 已创建种子配置文件: ${CONFIG_FILE}`);
    console.error(`[TIA] 请编辑此文件添加要监控的仓库，然后重启 CC`);
  }
}
