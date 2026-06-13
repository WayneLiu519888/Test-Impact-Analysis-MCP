/**
 * Test Recommendation 模块测试
 */

import { describe, it } from "node:test";
import { strictEqual, ok as assertOk } from "node:assert/strict";
import {
  RISK_WEIGHT,
  SCORE_THRESHOLD_STRONG,
  SCORE_THRESHOLD_RECOMMEND,
  buildRecommendation,
  dedupItems,
  buildMinimumSuite,
} from "../impact-analysis/recommendation.js";
import { analyzeImpact } from "../impact-analysis/analyzer.js";
import type { ImpactConfigFile } from "../impact-analysis/types.js";
import { DEFAULT_AUTO_INFER } from "../impact-analysis/types.js";

const CONFIG: ImpactConfigFile = {
  rules: [
    {
      id: "auth", name: "认证模块",
      filePatterns: ["src/auth/**"],
      testPaths: ["tests/auth/login.test.ts", "tests/auth/register.test.ts"],
      riskLevel: "high",
    },
    {
      id: "db", name: "数据库层",
      filePatterns: ["src/database/**"],
      testPaths: ["tests/db/users.test.ts"],
      riskLevel: "medium",
    },
  ],
  autoInfer: DEFAULT_AUTO_INFER,
};

describe("buildRecommendation", () => {
  it("推荐分 = 风险权重 × 置信度", () => {
    const impact = analyzeImpact("t", "a", "b",
      ["src/auth/login.ts"], CONFIG
    );
    const rec = buildRecommendation(impact);
    strictEqual(rec.items.length >= 1, true);
    // auth 模块 confidence=70 (目录匹配) → score = 100 × 70 = 7000
    const authItem = rec.items.find((i) => i.ruleName === "认证模块");
    assertOk(authItem != null);
    strictEqual(authItem.score, RISK_WEIGHT.high * authItem.confidence);
  });

  it("按推荐分降序排列", () => {
    const impact = analyzeImpact("t", "a", "b",
      ["src/auth/login.ts", "src/database/query.ts"], CONFIG
    );
    const rec = buildRecommendation(impact);
    for (let i = 1; i < rec.items.length; i++) {
      assertOk(rec.items[i - 1].score >= rec.items[i].score, "排序错误");
    }
  });

  it("强烈建议阈值 = 7000", () => {
    // high(=100) × 70% = 7000 → strong
    // medium(=50) × 70% = 3500 → recommend
    const impact = analyzeImpact("t", "a", "b",
      ["src/auth/login.ts", "src/database/query.ts"], CONFIG
    );
    const rec = buildRecommendation(impact);
    const authItem = rec.items.find((i) => i.ruleName === "认证模块");
    const dbItem = rec.items.find((i) => i.ruleName === "数据库层");
    if (authItem) assertOk(authItem.score >= SCORE_THRESHOLD_STRONG);
    if (dbItem) assertOk(dbItem.score < SCORE_THRESHOLD_STRONG);
  });
});

describe("dedupItems", () => {
  it("同一 testPath 取最高推荐分", () => {
    const items = [
      { testPath: "t.test.ts", ruleName: "A", riskLevel: "medium" as const, confidence: 60, score: 3000 },
      { testPath: "t.test.ts", ruleName: "B", riskLevel: "high" as const, confidence: 90, score: 9000 },
    ];
    const result = dedupItems(items);
    strictEqual(result.length, 1);
    strictEqual(result[0].score, 9000);
    strictEqual(result[0].ruleName, "B");
  });
});

describe("buildMinimumSuite", () => {
  it("覆盖所有 high+medium 模块（不含 low）", () => {
    const impact = analyzeImpact("t", "a", "b",
      ["src/auth/login.ts", "src/database/query.ts"], CONFIG
    );
    const rec = buildRecommendation(impact);
    // 应有 auth + db 各 1 个测试
    strictEqual(rec.minimumViableSuite.length, 2);
  });

  it("空模块返回空", () => {
    const impact = analyzeImpact("t", "a", "b", [], CONFIG);
    const rec = buildRecommendation(impact);
    strictEqual(rec.minimumViableSuite.length, 0);
    strictEqual(rec.items.length, 0);
  });
});

describe("summary 分组", () => {
  it("正确统计 strong/recommend/optional", () => {
    const impact = analyzeImpact("t", "a", "b",
      ["src/auth/login.ts", "src/database/query.ts", "src/other/unknown.ts"],
      CONFIG
    );
    const rec = buildRecommendation(impact);
    strictEqual(rec.summary.strongRecommend + rec.summary.recommend + rec.summary.optional, rec.items.length);
  });
});
