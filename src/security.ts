/**
 * 安全模块 — IP 白名单 + API KEY 多 key 校验
 *
 * 职责：
 *   1. 管理 server.conf.json（HTTP 服务端 + 安全配置）
 *   2. 获取客户端真实 IP（直连 / 反向代理）
 *   3. IP 白名单校验（支持精确 IP 和 CIDR 子网）
 *   4. API KEY 签发、SHA-256 哈希校验（多 key 列表）
 *
 * 认证流程（三层）：
 *   第 0 层 (Express 中间件): 所有 /mcp 请求 → Origin 校验（DNS rebinding 防护）→ IP 白名单校验
 *   第 1 层 (MCP 工具层):    TIA-init → 免 API KEY
 *                            其他工具 → API KEY 校验 → 通过/拒绝
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { AsyncLocalStorage } from "async_hooks";
import { join } from "path";
import type { IncomingMessage } from "http";
import type { ServerConf, ApiKeyEntry } from "./types.js";
import { PROJECT_ROOT, resolveConfigPath } from "./paths.js";

/**
 * 配置文件路径（延迟求值 — 首次调用时解析）。
 * 避免 import 阶段因配置文件缺失导致进程崩溃。
 */
function getServerConfPath(): string {
  return resolveConfigPath("server.conf.json");
}

// ═══════════════════════════════════════════════════════════
// 配置文件读写
// ═══════════════════════════════════════════════════════════

/** 默认配置 — MCP 规范建议绑定 localhost，通过反向代理对外暴露 */
const DEFAULT_SERVER_CONF: ServerConf = {
  port: 3100,
  host: "127.0.0.1",
  allowedIps: ["127.0.0.1"],
  allowedOrigins: [],
  xForwardedFor: false,
  apiKeys: [],
};

/** 读取服务端配置文件 */
export function loadServerConf(): ServerConf {
  if (!existsSync(getServerConfPath())) {
    return structuredClone(DEFAULT_SERVER_CONF);
  }
  const raw = readFileSync(getServerConfPath(), "utf-8");
  try {
    const parsed = JSON.parse(raw);
    return {
      port: parsed.port ?? DEFAULT_SERVER_CONF.port,
      host: parsed.host ?? DEFAULT_SERVER_CONF.host,
      allowedIps: parsed.allowedIps ?? DEFAULT_SERVER_CONF.allowedIps,
      allowedOrigins: Array.isArray(parsed.allowedOrigins) ? parsed.allowedOrigins : DEFAULT_SERVER_CONF.allowedOrigins,
      xForwardedFor: parsed.xForwardedFor ?? DEFAULT_SERVER_CONF.xForwardedFor,
      contactInfo: parsed.contactInfo,
      apiKeys: Array.isArray(parsed.apiKeys)
        ? parsed.apiKeys
        : (console.error("[TIA] ⚠️ server.conf.json 的 apiKeys 字段不是数组，已重置为空。请检查配置文件。"), []),
    };
  } catch {
    return structuredClone(DEFAULT_SERVER_CONF);
  }
}

/** 写入服务端配置文件 */
export function saveServerConf(conf: ServerConf): void {
  writeFileSync(getServerConfPath(), JSON.stringify(conf, null, 2), { encoding: "utf-8", mode: 0o600 });
}

/**
 * 确保 server.conf.json 存在，不存在则创建种子模板。
 * 在 HTTP 模式启动时调用。
 */
export function ensureServerConf(): ServerConf {
  if (!existsSync(getServerConfPath())) {
    saveServerConf(structuredClone(DEFAULT_SERVER_CONF));
    console.error(`[TIA] 已创建 server.conf.json 种子文件`);
    console.error(`[TIA] 请编辑此文件配置 IP 白名单和 Origin 白名单。API KEY 由 TIA-init 工具自动签发。`);
    console.error(`[TIA] 如果 host 非 127.0.0.1，MCP 规范要求配置 allowedOrigins 以防止 DNS rebinding 攻击。`);
    return structuredClone(DEFAULT_SERVER_CONF);
  }
  return loadServerConf();
}

// ═══════════════════════════════════════════════════════════
// IP 工具
// ═══════════════════════════════════════════════════════════

/**
 * 获取客户端真实 IP。
 *
 * 直连场景：socket.remoteAddress
 * 反向代理场景（xForwardedFor=true）：解析 X-Forwarded-For 头最左侧 IP
 */
export function getClientIp(req: IncomingMessage, useProxy: boolean): string {
  let ip = "";

  if (useProxy) {
    const forwarded = (req.headers["x-forwarded-for"] as string) || "";
    ip = forwarded.split(",")[0]?.trim() || "";
  }

  if (!ip) {
    ip = req.socket?.remoteAddress || "unknown";
  }

  return ip.replace(/^::ffff:/i, "");
}

/**
 * 将 IPv4 地址转换为 32 位无符号整数，用于 CIDR 匹配。
 */
function ip4ToUint(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/**
 * 判断客户端 IP 是否在白名单中。
 *
 * 支持格式：
 *   - 精确 IP："192.168.1.100"、"::1"
 *   - CIDR 子网："192.168.2.0/24"、"10.0.0.0/8"
 */
export function isIpInWhitelist(clientIp: string, whitelist: string[]): boolean {
  const normalized = clientIp.replace(/^::ffff:/i, "");

  for (const entry of whitelist) {
    if (!entry.includes("/")) {
      const entryNormalized = entry.replace(/^::ffff:/i, "");
      if (normalized === entryNormalized) return true;
      continue;
    }

    const [cidrIp, bitsStr] = entry.split("/");
    const bits = parseInt(bitsStr, 10);
    if (isNaN(bits) || bits < 0 || bits > 128) continue;

    const cidrNormalized = cidrIp.replace(/^::ffff:/i, "");

    const clientUint = ip4ToUint(normalized);
    const cidrUint = ip4ToUint(cidrNormalized);

    if (clientUint !== null && cidrUint !== null && bits <= 32) {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      if ((clientUint & mask) === (cidrUint & mask)) return true;
      continue;
    }

    if (bits > 32) {
      const clientV6 = normalized.toLowerCase();
      const cidrV6 = cidrNormalized.toLowerCase();
      if (clientV6 === cidrV6) return true;
      if (bits === 128 && clientV6 === cidrV6) return true;
    }
  }

  return false;
}

// ═══════════════════════════════════════════════════════════
// 认证结果
// ═══════════════════════════════════════════════════════════

/** 认证校验结果 */
export interface AuthResult {
  ok: boolean;
  status?: number;
  reason?: string;
}

// ═══════════════════════════════════════════════════════════
// 第 0 层：IP 白名单（Express 中间件 — 所有 /mcp 必经）
// ═══════════════════════════════════════════════════════════

/**
 * 仅校验 IP 白名单。不做 API KEY 校验。
 *
 * 行为：
 *   - allowedIps 配置了 → IP 必须在白名单中，否则 403
 *   - allowedIps 未配置 → 通过（不限制 IP）
 *
 * @param req  包含请求头信息的对象
 * @param conf 服务端安全配置
 */
export function checkIpAccess(
  req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  conf: ServerConf
): AuthResult {
  const clientIp = getClientIp(
    { headers: req.headers, socket: req.socket } as IncomingMessage,
    conf.xForwardedFor ?? false
  );

  const hasIps = conf.allowedIps && conf.allowedIps.length > 0;
  if (hasIps) {
    if (!isIpInWhitelist(clientIp, conf.allowedIps!)) {
      const contact = conf.contactInfo
        ? `如需开放权限请联系 ${conf.contactInfo}，谢谢。`
        : "如需开放权限请联系管理员。";
      return {
        ok: false,
        status: 403,
        reason: `你的客户端当前未通过认证（IP: ${clientIp}）。${contact}`,
      };
    }
  }

  return { ok: true };
}

/**
 * 校验 Origin 头，用于 DNS rebinding 防护（MCP 规范 MUST 要求）。
 *
 * 行为：
 *   - host 为 127.0.0.1/::1/localhost → 跳过（本地无 DNS rebinding 风险）
 *   - allowedOrigins 配置了 → Origin 必须在白名单中，否则 403
 *   - allowedOrigins 未配置但 host 非 localhost → 跳过 + 打印警告
 *
 * @param req  包含请求头信息的对象
 * @param conf 服务端安全配置
 */
export function checkOriginAccess(
  req: { headers: Record<string, string | string[] | undefined> },
  conf: ServerConf
): AuthResult {
  // localhost 绑定自动跳过 — 外部不可达则无 DNS rebinding 风险
  const host = conf.host?.toLowerCase();
  if (host === "127.0.0.1" || host === "::1" || host === "localhost") {
    return { ok: true };
  }

  const origin = stringHeader(req.headers, "origin");
  // 无 Origin 头的请求（非浏览器场景，如 Claude Code CLI）直接放行
  if (!origin) return { ok: true };

  const allowed = conf.allowedOrigins;
  if (allowed && allowed.length > 0) {
    if (!allowed.includes(origin)) {
      return { ok: false, status: 403, reason: `Origin "${origin}" 不在白名单中` };
    }
    return { ok: true };
  }

  // 非 localhost 但未配置 Origin 白名单 — 警告但放行（兼容已有部署）
  console.error("[TIA] ⚠️ WARN: host 非 localhost 且未配置 allowedOrigins。建议配置 Origin 白名单以防止 DNS rebinding 攻击。");
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════
// 第 1 层：API KEY 校验（MCP 工具层 — TIA-init 免检，其他工具必检）
// ═══════════════════════════════════════════════════════════

/**
 * 计算字符串的 SHA-256 哈希（hex 格式）。
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * 校验客户端提供的 API KEY 是否与服务端 apiKeys 列表中的某个匹配。
 *
 * @param providedKey  客户端传入的原始 API KEY
 * @param apiKeys      服务端存储的 KEY 列表（仅哈希）
 * @returns matched entry 或 null
 */
export function verifyApiKey(
  providedKey: string,
  apiKeys: ApiKeyEntry[]
): ApiKeyEntry | null {
  if (!providedKey || apiKeys.length === 0) return null;

  // SHA-256 哈希比对。SHA-256 的第二原像抗性（preimage resistance）
  // 使得字符串全等比较不会泄露关于正确 key 的任何信息，无需 timingSafeEqual。
  const keyHash = `sha256:${sha256(providedKey)}`;

  for (const entry of apiKeys) {
    if (entry.hash === keyHash) return entry;
  }

  return null;
}

/**
 * 更新 API KEY 的最后使用时间。
 */
export function touchApiKey(apiKeys: ApiKeyEntry[], matched: ApiKeyEntry): void {
  const idx = apiKeys.indexOf(matched);
  if (idx >= 0) {
    apiKeys[idx] = { ...apiKeys[idx], lastUsed: new Date().toISOString() };
  }
}

/**
 * 签发一个新的 API KEY。
 *
 * 格式: tim-{32 位 base64url 随机串}
 * 原始 key 只在此时返回，服务端仅存储 SHA-256 哈希。
 *
 * @param label    备注标签
 * @param clientIp 客户端 IP（用于审计）
 * @returns { apiKey: 原始 key（仅显示一次）, entry: 服务端存储的 ApiKeyEntry }
 */
export function issueApiKey(
  label: string,
  clientIp?: string
): { apiKey: string; entry: ApiKeyEntry } {
  const rawBytes = randomBytes(24);
  const randomPart = rawBytes.toString("base64url").slice(0, 32);
  const apiKey = `tim-${randomPart}`;

  const entry: ApiKeyEntry = {
    hash: `sha256:${sha256(apiKey)}`,
    label,
    createdAt: new Date().toISOString(),
    clientIp,
  };

  return { apiKey, entry };
}

// ═══════════════════════════════════════════════════════════
// 请求级认证上下文（Express 中间件 → MCP 工具层传递）
// ═══════════════════════════════════════════════════════════

/** 客户端 Agent 类型（枚举，对应三平台） */
export type AgentType = "ClaudeCode" | "CodeX" | "OpenCode";

const VALID_AGENT_TYPES: Set<string> = new Set(["ClaudeCode", "CodeX", "OpenCode"]);

/** 校验并归一化 Agent 类型字符串。非法值返回 null。 */
export function validateAgentType(raw: string | undefined): AgentType | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // 大小写容错
  for (const valid of VALID_AGENT_TYPES) {
    if (valid.toLowerCase() === trimmed.toLowerCase()) return valid as AgentType;
  }
  return null;
}

/** 当前请求的认证信息（Express 中间件写入，工具层读取） */
export interface RequestAuth {
  clientIp: string;
  apiKeyEntry: ApiKeyEntry | null;  // null = 未携带 key 或 key 无效
  agentType: AgentType | null;      // null = 未声明客户端类型
}

/** AsyncLocalStorage — 请求级认证上下文，消除并发竞态 */
const _authStorage = new AsyncLocalStorage<RequestAuth>();

/**
 * Express 中间件调用：在当前异步上下文中运行回调，所有经由此回调发起的
 * MCP 工具调用都能通过 getRequestAuth() 获取到正确的认证信息。
 */
export function runWithRequestAuth(auth: RequestAuth, fn: () => void): void {
  _authStorage.run(auth, fn);
}

/** MCP 工具层调用：读取当前异步上下文的认证结果（线程安全） */
export function getRequestAuth(): RequestAuth | null {
  return _authStorage.getStore() ?? null;
}

/** 安全地从请求头中提取字符串值 */
export function stringHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const val = headers[name];
  if (Array.isArray(val)) return val[0];
  return val;
}
