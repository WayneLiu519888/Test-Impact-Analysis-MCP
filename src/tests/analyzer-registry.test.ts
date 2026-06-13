/**
 * Analyzer Registry 测试 — 类型定义 + 注册表 + 文件匹配
 */

import { describe, it } from "node:test";
import { strictEqual, ok as assertOk, deepStrictEqual } from "node:assert/strict";
import type { AnalyzerConfigFile, AnalyzerAdapter } from "../analyzer-registry/types.js";
import { DEFAULT_ANALYZER_CONFIG } from "../analyzer-registry/types.js";
import { matchAnalyzers, getUnmatchedFiles } from "../analyzer-registry/registry.js";

// ═══════════════════════════════════════════════════════
// DEFAULT_ANALYZER_CONFIG
// ═══════════════════════════════════════════════════════

describe("DEFAULT_ANALYZER_CONFIG", () => {
  it("包含 jacg 分析器预配置（默认禁用）", () => {
    const jacg = DEFAULT_ANALYZER_CONFIG.analyzers.find((a) => a.id === "jacg");
    assertOk(jacg != null, "jacg 分析器应存在");
    strictEqual(jacg!.enabled, false, "默认禁用");
    strictEqual(jacg!.name, "Java 调用链分析");
    assertOk(jacg!.fileExtensions.includes(".java"), "应支持 .java 文件");
  });

  it("配置结构符合 AnalyzerConfigFile 类型", () => {
    assertOk(Array.isArray(DEFAULT_ANALYZER_CONFIG.analyzers));
    for (const a of DEFAULT_ANALYZER_CONFIG.analyzers) {
      assertOk(typeof a.id === "string");
      assertOk(typeof a.name === "string");
      assertOk(Array.isArray(a.fileExtensions));
      assertOk(typeof a.enabled === "boolean");
    }
  });
});

// ═══════════════════════════════════════════════════════
// matchAnalyzers — 注意: jacg 默认 disabled，测试需另写
// ═══════════════════════════════════════════════════════

describe("matchAnalyzers", () => {
  it("JACG 已启用 → .java 文件被匹配", () => {
    // JACG 在 analyzers.conf.json 中已启用
    const result = matchAnalyzers(["src/main/Service.java", "src/main/Utils.kt"]);
    strictEqual(result.length, 1, "应有 1 个分析器匹配");
    strictEqual(result[0].adapter.id, "jacg", "匹配的分析器应为 jacg");
    strictEqual(result[0].matchedFiles.length, 1, "仅 .java 文件被匹配");
    strictEqual(result[0].matchedFiles[0], "src/main/Service.java");
  });

  it("非 Java 文件不被 JACG 匹配", () => {
    const result = matchAnalyzers(["src/app.ts", "src/lib.py"]);
    strictEqual(result.length, 0, ".ts/.py 文件不应被 JACG 匹配");
  });

  it("空变更文件返回空", () => {
    const result = matchAnalyzers([]);
    strictEqual(result.length, 0);
  });
});

// ═══════════════════════════════════════════════════════
// getUnmatchedFiles
// ═══════════════════════════════════════════════════════

describe("getUnmatchedFiles", () => {
  it("所有文件未被匹配时全部返回", () => {
    const allFiles = ["a.ts", "b.ts", "c.ts"];
    const result = getUnmatchedFiles(allFiles, []);
    deepStrictEqual(result, allFiles);
  });

  it("部分被匹配时返回剩余", () => {
    const allFiles = ["a.ts", "b.java", "c.ts"];
    // 模拟 b.java 被 JACG 匹配
    const matched = [{ matchedFiles: ["b.java"] }, { matchedFiles: [] }];
    const result = getUnmatchedFiles(allFiles, matched);
    deepStrictEqual(result, ["a.ts", "c.ts"]);
  });

  it("全部被匹配时返回空", () => {
    const allFiles = ["a.java", "b.java"];
    const matched = [{ matchedFiles: ["a.java", "b.java"] }];
    const result = getUnmatchedFiles(allFiles, matched);
    deepStrictEqual(result, []);
  });

  it("多分析器匹配不重复", () => {
    // 两个分析器都匹配了同一个文件 → 去重后不应出现在 unmatched 中
    const allFiles = ["a.java", "b.java", "c.ts"];
    const matched = [
      { matchedFiles: ["a.java"] },
      { matchedFiles: ["a.java", "b.java"] },  // 重叠
    ];
    const result = getUnmatchedFiles(allFiles, matched);
    deepStrictEqual(result, ["c.ts"]);
  });
});
