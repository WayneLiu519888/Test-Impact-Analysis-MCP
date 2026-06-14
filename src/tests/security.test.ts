/**
 * security.ts 纯函数测试 — IP 白名单
 */

import { describe, it } from "node:test";
import { strictEqual, ok as assertOk } from "node:assert/strict";
import { isIpInWhitelist } from "../security.js";

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
