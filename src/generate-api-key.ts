/**
 * generate-api-key — API KEY 生成工具（服务端手动签发）
 *
 * 在 MCP Server 服务端本地执行，手动生成 API KEY 并将 SHA-256 哈希写入 server.conf.json。
 * 原始 key 仅在终端显示一次，关闭后无法恢复。
 *
 * 用法:
 *   npx tsx src/generate-api-key.ts --label "BBB-测试机器"
 *
 * 与 TIA-init 的区别:
 *   - generate-api-key: 服务端管理员手动签发（预先分配）
 *   - TIA-init:         客户端自动签发（首次连接时通过 IP 白名单后自助获取）
 *
 * 安全性:
 *   - 原始 key 绝不落盘，只存哈希
 *   - 多个 key 共存（apiKeys 数组），不会互相覆盖
 */

import { loadServerConf, saveServerConf, issueApiKey, ensureServerConf } from "./security.js";

// ── 解析命令行参数 ──
const args = process.argv.slice(2);
const labelIdx = args.indexOf("--label");
const label = labelIdx >= 0 && labelIdx + 1 < args.length ? args[labelIdx + 1] : undefined;

if (!label) {
  console.error("[TIA] 用法: npx tsx src/generate-api-key.ts --label \"备注标签\"");
  console.error("[TIA] ");
  console.error("[TIA]   示例:");
  console.error("[TIA]     npx tsx src/generate-api-key.ts --label \"BBB-测试机器\"");
  console.error("[TIA]     npx tsx src/generate-api-key.ts --label \"CCC-新同事\"");
  process.exit(1);
}

// ── 确保配置文件存在 ──
const conf = ensureServerConf();

// ── 签发 API KEY ──
const { apiKey, entry } = issueApiKey(label, "手动签发");
conf.apiKeys.push(entry);
saveServerConf(conf);

// ── 终端输出 ──
const border = "═".repeat(55);
const innerWidth = 51;

console.log("");
console.log(`  ╔${border}╗`);
console.log(`  ║  ${"🔑 API KEY 已生成 — 请立即复制保存！".padEnd(innerWidth)}║`);
console.log(`  ║  ${"此密钥仅显示一次，关闭终端后无法恢复。".padEnd(innerWidth)}║`);
console.log(`  ║${" ".repeat(innerWidth)}║`);
console.log(`  ║  ${"X-API-Key:".padEnd(innerWidth)}║`);
console.log(`  ║  ${apiKey.padEnd(innerWidth)}║`);
console.log(`  ║${" ".repeat(innerWidth)}║`);
console.log(`  ║  ${`标签: ${label}`.padEnd(innerWidth)}║`);
console.log(`  ║  ${`签发时间: ${entry.createdAt}`.padEnd(innerWidth)}║`);
console.log(`  ║  ${`已写入 server.conf.json（当前共 ${conf.apiKeys.length} 个 key）`.padEnd(innerWidth)}║`);
console.log(`  ╚${border}╝`);
console.log("");
console.log("  将此 key 分发给客户端管理员，配置到 MCP Client 的 headers 中：");
console.log("");
console.log('  Claude Code (.claude/mcp.json):');
console.log(`    "headers": { "X-API-Key": "${apiKey}" }`);
console.log("");
console.log('  OpenCode (.opencode.json):');
console.log(`    "headers": { "X-API-Key": "${apiKey}" }`);
console.log("");
console.log("  或指导客户端执行 TIA-init 工具自助获取 API KEY（需先加入 IP 白名单）。");
console.log("");
