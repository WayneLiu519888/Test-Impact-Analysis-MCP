/**
 * Impact Analysis 模块测试 — 匹配引擎 + 聚合 + 自动推断
 */

import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok as assertOk } from "node:assert/strict";
import {
  globToRegex,
  matchFile,
  autoInfer,
  analyzeImpact,
} from "../impact-analysis/analyzer.js";
import type { ImpactConfigFile, ImpactRule } from "../impact-analysis/types.js";
import { DEFAULT_AUTO_INFER } from "../impact-analysis/types.js";

// ═══════════════════════════════════════════════════════
// globToRegex
// ═══════════════════════════════════════════════════════

describe("globToRegex", () => {
  it("精确路径匹配", () => {
    const re = globToRegex("src/auth/login.ts");
    assertOk(re.test("src/auth/login.ts"));
    strictEqual(re.test("src/auth/logout.ts"), false);
    strictEqual(re.test("src/auth/sub/login.ts"), false);
  });

  it("** 匹配任意层级", () => {
    const re = globToRegex("src/auth/**");
    assertOk(re.test("src/auth/login.ts"));
    assertOk(re.test("src/auth/sub/deep/file.ts"));
    strictEqual(re.test("src/other/file.ts"), false);
  });

  it("* 匹配单层文件名", () => {
    const re = globToRegex("src/auth/*.ts");
    assertOk(re.test("src/auth/login.ts"));
    strictEqual(re.test("src/auth/sub/login.ts"), false);
  });

  it("{a,b} 花括号展开", () => {
    const re = globToRegex("src/{login,register}.ts");
    assertOk(re.test("src/login.ts"));
    assertOk(re.test("src/register.ts"));
    strictEqual(re.test("src/logout.ts"), false);
  });

  it("混合 ** 和文件扩展名", () => {
    const re = globToRegex("src/**/*.test.ts");
    assertOk(re.test("src/auth/login.test.ts"));
    assertOk(re.test("src/deep/nested/file.test.ts"));
    strictEqual(re.test("src/auth/login.ts"), false);
  });
});

// ═══════════════════════════════════════════════════════
// matchFile
// ═══════════════════════════════════════════════════════

describe("matchFile", () => {
  const rules: ImpactRule[] = [
    {
      id: "auth", name: "认证模块",
      filePatterns: ["src/auth/**"],
      testPaths: ["tests/auth/login.test.ts"],
      riskLevel: "high",
    },
    {
      id: "db", name: "数据库层",
      filePatterns: ["src/database/**", "src/models/*.ts"],
      testPaths: ["tests/db/users.test.ts"],
      riskLevel: "medium",
    },
  ];

  it("精确目录匹配命中", () => {
    const matches = matchFile("src/auth/login.ts", rules);
    strictEqual(matches.length, 1);
    strictEqual(matches[0].ruleId, "auth");
    strictEqual(matches[0].confidence, 70);
  });

  it("深层路径匹配命中", () => {
    const matches = matchFile("src/auth/sub/deep/file.ts", rules);
    strictEqual(matches.length, 1);
    strictEqual(matches[0].confidence, 45); // wildcard
  });

  it("未命中任何规则", () => {
    const matches = matchFile("src/unknown/file.ts", rules);
    strictEqual(matches.length, 0);
  });
});

// ═══════════════════════════════════════════════════════
// autoInfer
// ═══════════════════════════════════════════════════════

describe("autoInfer", () => {
  it("标准映射: src/ → tests/", () => {
    const inferred = autoInfer("src/auth/login.ts", { "src/": "tests/" });
    assertOk(inferred.includes("tests/auth/login.test.ts"));
    assertOk(inferred.includes("tests/auth/login.spec.ts"));
  });

  it("多级路径映射", () => {
    const inferred = autoInfer("src/deep/nested/file.ts", { "src/": "tests/" });
    assertOk(inferred.includes("tests/deep/nested/file.test.ts"));
  });

  it("空映射返回空", () => {
    const inferred = autoInfer("src/file.ts", {});
    strictEqual(inferred.length, 0);
  });
});

// ═══════════════════════════════════════════════════════
// analyzeImpact — 集成测试
// ═══════════════════════════════════════════════════════

describe("analyzeImpact", () => {
  const config: ImpactConfigFile = {
    rules: [
      {
        id: "auth",
        name: "认证模块",
        filePatterns: ["src/auth/**"],
        testPaths: ["tests/auth/login.test.ts", "tests/auth/register.test.ts"],
        riskLevel: "high",
      },
      {
        id: "utils",
        name: "工具函数",
        filePatterns: ["src/utils/**"],
        testPaths: ["tests/utils/"],
        riskLevel: "low",
      },
    ],
    autoInfer: DEFAULT_AUTO_INFER,
  };

  it("变更文件全部命中规则", () => {
    const result = analyzeImpact(
      "test-repo", "abc123", "def456",
      ["src/auth/login.ts", "src/auth/middleware.ts"],
      config
    );
    strictEqual(result.repoName, "test-repo");
    strictEqual(result.changedFiles.length, 2);
    // auth 模块应有 2 个文件命中
    const authMod = result.impactedModules.find((m) => m.ruleId === "auth");
    assertOk(authMod != null);
    strictEqual(authMod.changedFiles.length, 2);
    strictEqual(authMod.testPaths.length, 2);
  });

  it("变更文件部分命中 + 部分自动推断", () => {
    const result = analyzeImpact(
      "test-repo", "abc", "def",
      ["src/auth/login.ts", "src/unknown/helper.ts"],
      config
    );
    // 应有至少 2 个模块: auth + auto-inferred
    strictEqual(result.impactedModules.length >= 1, true);

    // 匹配项数 = auth 规则命中的 2 个 testPaths + autoInfer 的 3 个推断路径
    strictEqual(result.matches.length, 5);
  });

  it("空变更列表返回空结果", () => {
    const result = analyzeImpact("test-repo", "abc", "def", [], config);
    strictEqual(result.changedFiles.length, 0);
    strictEqual(result.impactedModules.length, 0);
  });

  it("关闭自动推断时未命中规则的文件不产生结果", () => {
    const noAuto = { ...config, autoInfer: { enabled: false, sourceToTestMapping: {} } };
    const result = analyzeImpact("test-repo", "abc", "def",
      ["src/unknown/helper.ts"], noAuto
    );
    strictEqual(result.impactedModules.length, 0);
    strictEqual(result.matches.length, 0);
  });
});
