/**
 * Risk Assessment 模块测试
 */

import { describe, it } from "node:test";
import { strictEqual, ok as assertOk } from "node:assert/strict";
import { computeRiskAssessment, computeLevel } from "../impact-analysis/risk-scorer.js";

describe("computeRiskAssessment", () => {
  it("零文件零模块 → 0 分", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: [], highModules: 0, mediumModules: 0, lowModules: 0,
      avgConfidence: 100, topRisks: [],
    });
    strictEqual(result.score, 0);
    strictEqual(result.level, "low");
  });

  it("1 文件 + 1 high 模块 = 30 分 (low)", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: ["f1.ts"], highModules: 1, mediumModules: 0, lowModules: 0,
      avgConfidence: 70, topRisks: ["test"],
    });
    // 10 + 20 = 30 → low（≤30）
    strictEqual(result.score, 30);
    strictEqual(result.level, "low");
  });

  it("多文件 → 文件风险分递增后封顶 60", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: Array(15).fill("f.ts"), highModules: 0, mediumModules: 0, lowModules: 0,
      avgConfidence: 100, topRisks: [],
    });
    // 10 + (15-1)*5 = 80 → 封顶 60
    strictEqual(result.breakdown.fileRisk.raw, 60);
    strictEqual(result.score, 60);
  });

  it("3 个 high 模块 → 20×3=60，封顶", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: [], highModules: 3, mediumModules: 0, lowModules: 0,
      avgConfidence: 100, topRisks: [],
    });
    // 20*3 = 60，等于 MAX_MODULE_SCORE
    strictEqual(result.breakdown.moduleRisk.raw, 60);
  });

  it("high×1 + medium×2 → 20+8×2=36", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: [], highModules: 1, mediumModules: 2, lowModules: 1,
      avgConfidence: 100, topRisks: [],
    });
    strictEqual(result.breakdown.moduleRisk.raw, 36);
  });

  it("avgConfidence < 50% → +10 惩罚", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: ["f.ts"], highModules: 0, mediumModules: 0, lowModules: 0,
      avgConfidence: 40, topRisks: [],
    });
    // 10 + 0 + 10 = 20
    strictEqual(result.score, 20);
    strictEqual(result.breakdown.confidencePenalty, 10);
  });

  it("avgConfidence < 30% → +20 惩罚", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: ["f.ts"], highModules: 0, mediumModules: 0, lowModules: 0,
      avgConfidence: 20, topRisks: [],
    });
    strictEqual(result.breakdown.confidencePenalty, 20);
  });

  it("总分封顶 100", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: Array(20).fill("f.ts"),
      highModules: 5, mediumModules: 5, lowModules: 5,
      avgConfidence: 20, topRisks: [],
    });
    // 文件=60 + 模块=60 + 惩罚=20 = 140 → 封顶 100
    strictEqual(result.score, 100);
    strictEqual(result.level, "critical");
  });
});

describe("computeLevel", () => {
  it("0-30: low",  () => { strictEqual(computeLevel(0), "low"); strictEqual(computeLevel(30), "low"); });
  it("31-60: medium", () => { strictEqual(computeLevel(31), "medium"); strictEqual(computeLevel(60), "medium"); });
  it("61-85: high",  () => { strictEqual(computeLevel(61), "high"); strictEqual(computeLevel(85), "high"); });
  it("86-100: critical", () => { strictEqual(computeLevel(86), "critical"); strictEqual(computeLevel(100), "critical"); });
});

describe("suggestions", () => {
  it("2+ high 模块 → 分批测试建议", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: ["f.ts"], highModules: 2, mediumModules: 0, lowModules: 0,
      avgConfidence: 80, topRisks: [],
    });
    assertOk(result.suggestions.some((s) => s.includes("分批")));
  });

  it("≥10 文件 → 拆分提交建议", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: Array(10).fill("f.ts"), highModules: 0, mediumModules: 0, lowModules: 0,
      avgConfidence: 100, topRisks: [],
    });
    assertOk(result.suggestions.some((s) => s.includes("拆分")));
  });

  it("low 风险 → fast-track 建议", () => {
    const result = computeRiskAssessment({
      repoName: "t", fromSha: "a", toSha: "b",
      changedFiles: ["f.ts"], highModules: 0, mediumModules: 0, lowModules: 1,
      avgConfidence: 90, topRisks: [],
    });
    // score = 10 + 0 + 0 = 10 → low
    strictEqual(result.level, "low");
    assertOk(result.suggestions.some((s) => s.includes("fast-track") || s.includes("常规")));
  });
});
