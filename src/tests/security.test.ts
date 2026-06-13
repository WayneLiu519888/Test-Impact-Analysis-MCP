/**
 * security.ts 纯函数测试 — IP 白名单 / SHA-256 / Agent 类型校验
 */

import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok as assertOk } from "node:assert/strict";
import { isIpInWhitelist, sha256, validateAgentType } from "../security.js";

// ═══════════════════════════════════════════════════════
// sha256
// ═══════════════════════════════════════════════════════

describe("sha256", () => {
  it("确定性输出（相同输入 = 相同哈希）", () => {
    strictEqual(sha256("hello"), sha256("hello"));
  });

  it("不同输入产生不同哈希", () => {
    const a = sha256("hello");
    const b = sha256("world");
    strictEqual(typeof a, "string");
    strictEqual(typeof b, "string");
    // 不同输入几乎不可能碰撞
    strictEqual(a === b, false);
  });

  it("输出为 64 字符 hex", () => {
    const hash = sha256("test");
    strictEqual(hash.length, 64);
    // hex 字符校验
    assertOk(/^[0-9a-f]{64}$/.test(hash));
  });

  it("空字符串也能正常哈希", () => {
    const hash = sha256("");
    strictEqual(hash.length, 64);
    // 已知 SHA-256 空串
    strictEqual(hash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

// ═══════════════════════════════════════════════════════
// isIpInWhitelist
// ═══════════════════════════════════════════════════════

describe("isIpInWhitelist", () => {
  describe("精确 IP 匹配", () => {
    it("匹配", () => {
      assertOk(isIpInWhitelist("192.168.1.100", ["192.168.1.100"]));
      assertOk(isIpInWhitelist("10.0.0.1", ["10.0.0.1", "10.0.0.2"]));
    });

    it("不匹配", () => {
      strictEqual(isIpInWhitelist("192.168.1.200", ["192.168.1.100"]), false);
    });
  });

  describe("CIDR 子网匹配", () => {
    it("/24 子网", () => {
      assertOk(isIpInWhitelist("192.168.1.50", ["192.168.1.0/24"]));
    });

    it("/16 子网", () => {
      assertOk(isIpInWhitelist("10.0.99.99", ["10.0.0.0/16"]));
    });

    it("/8 子网", () => {
      assertOk(isIpInWhitelist("10.255.255.1", ["10.0.0.0/8"]));
    });

    it("/32 精确匹配", () => {
      assertOk(isIpInWhitelist("172.16.0.1", ["172.16.0.1/32"]));
    });

    it("子网外 IP 不匹配", () => {
      strictEqual(isIpInWhitelist("192.168.2.1", ["192.168.1.0/24"]), false);
    });

    it("混合精确 + CIDR", () => {
      const whitelist = ["127.0.0.1", "192.168.0.0/16"];
      assertOk(isIpInWhitelist("127.0.0.1", whitelist));
      assertOk(isIpInWhitelist("192.168.99.99", whitelist));
      strictEqual(isIpInWhitelist("10.0.0.1", whitelist), false);
    });
  });

  describe("边界情况", () => {
    it("空白名单返回 false", () => {
      strictEqual(isIpInWhitelist("127.0.0.1", []), false);
    });

    it("IPv6-mapped IPv4 自动降级", () => {
      assertOk(isIpInWhitelist("::ffff:192.168.1.1", ["192.168.1.0/24"]));
    });
  });
});

// ═══════════════════════════════════════════════════════
// validateAgentType
// ═══════════════════════════════════════════════════════

describe("validateAgentType", () => {
  it("合法枚举值", () => {
    strictEqual(validateAgentType("ClaudeCode"), "ClaudeCode");
    strictEqual(validateAgentType("CodeX"), "CodeX");
    strictEqual(validateAgentType("OpenCode"), "OpenCode");
  });

  it("大小写容错", () => {
    strictEqual(validateAgentType("claudecode"), "ClaudeCode");
    strictEqual(validateAgentType("codex"), "CodeX");
    strictEqual(validateAgentType("opencode"), "OpenCode");
  });

  it("前后空格容错", () => {
    strictEqual(validateAgentType("  ClaudeCode  "), "ClaudeCode");
  });

  it("非法值返回 null", () => {
    strictEqual(validateAgentType("invalid"), null);
    strictEqual(validateAgentType(""), null);
  });

  it("undefined 返回 null", () => {
    strictEqual(validateAgentType(undefined), null);
  });
});
