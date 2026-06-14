/**
 * 安全模块 — IP 白名单
 *
 * 职责：
 *   1. 管理 server.conf.json（HTTP 服务端配置）
 *   2. 获取客户端真实 IP（直连 / 反向代理）
 *   3. IP 白名单校验（支持精确 IP 和 CIDR 子网）
 *
 * 认证流程：
 *   Express 中间件 → IP 白名单校验 → 通过/403
 *   白名单内 IP 可直接通过 HTTP 连接 TIA MCP Server。
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { IncomingMessage } from "http";
import type { ServerConf } from "./types.js";
import { resolveConfigPath } from "./paths.js";

/**
 * 配置文件路径（延迟求值 — 首次调用时解析）。
 */
function getServerConfPath(): string {
  return resolveConfigPath("server.conf.json");
}

// ═══════════════════════════════════════════════════════
// 配置文件读写
// ═══════════════════════════════════════════════════════

/** 默认配置 */
const DEFAULT_SERVER_CONF: ServerConf = {
  port: 3100,
  host: "127.0.0.1",
  allowedIps: ["127.0.0.1"],
  xForwardedFor: false,
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
      xForwardedFor: parsed.xForwardedFor ?? DEFAULT_SERVER_CONF.xForwardedFor,
      contactInfo: parsed.contactInfo,
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
 */
export function ensureServerConf(): ServerConf {
  if (!existsSync(getServerConfPath())) {
    saveServerConf(structuredClone(DEFAULT_SERVER_CONF));
    console.error("[TIA] 已创建 server.conf.json 种子文件");
    console.error("[TIA] 请编辑此文件配置 IP 白名单。");
    return structuredClone(DEFAULT_SERVER_CONF);
  }
  return loadServerConf();
}

// ═══════════════════════════════════════════════════════
// IP 工具
// ═══════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════
// 认证结果
// ═══════════════════════════════════════════════════════

/** 认证校验结果 */
export interface AuthResult {
  ok: boolean;
  status?: number;
  reason?: string;
}

// ═══════════════════════════════════════════════════════
// IP 白名单（Express 中间件 — 所有 /mcp 必经）
// ═══════════════════════════════════════════════════════

/**
 * 仅校验 IP 白名单。
 *
 * 行为：
 *   - allowedIps 配置了 → IP 必须在白名单中，否则 403
 *   - allowedIps 未配置 → 通过（不限制 IP）
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
        ? `如需开放权限请联系 ${conf.contactInfo}。`
        : "请联系管理员将你的 IP 加入白名单。";
      return {
        ok: false,
        status: 403,
        reason: `IP 不在白名单中 (${clientIp})。${contact}`,
      };
    }
  }

  return { ok: true };
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
