/**
 * TOOL_SCHEMAS 结构校验 — 确保 5 个 Tool 定义完整、枚举值正确
 */

import { describe, it } from "node:test";
import { strictEqual, ok as assertOk } from "node:assert/strict";
import { TOOL_SCHEMAS } from "../tools/schemas.js";
import { deepStrictEqual } from "node:assert/strict";

describe("TOOL_SCHEMAS", () => {
  it("应包含恰好 5 个 Tool", () => {
    strictEqual(TOOL_SCHEMAS.length, 5);
  });

  it("工具名称正确", () => {
    const names = TOOL_SCHEMAS.map((t) => t.name);
    deepStrictEqual(names, [
      "impact_analysis",
      "repo_monitor",
      "repo_clone",
      "test_recommendation",
      "risk_assessment",
    ]);
  });

  it("每个 Tool 都有 description 和 inputSchema", () => {
    for (const tool of TOOL_SCHEMAS) {
      assertOk(typeof tool.description === "string" && tool.description.length > 0,
        `${tool.name}: description 缺失`);
      assertOk(tool.inputSchema?.type === "object",
        `${tool.name}: inputSchema 必须是 object 类型`);
    }
  });

  describe("repo_monitor action 枚举", () => {
    it("action 参数包含 status/check/reset", () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_monitor")!;
      const actionProp = schema.inputSchema.properties!["action"] as any;
      deepStrictEqual(actionProp.enum, ["status", "check", "reset"]);
    });

    it("required 包含 action", () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_monitor")!;
      deepStrictEqual(schema.inputSchema.required, ["action"]);
    });
  });

  describe("repo_clone mode 枚举", () => {
    it("mode 参数包含 full/incremental", () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_clone")!;
      const modeProp = schema.inputSchema.properties!["mode"] as any;
      deepStrictEqual(modeProp.enum, ["full", "incremental"]);
    });

    it("required 包含 mode", () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_clone")!;
      deepStrictEqual(schema.inputSchema.required, ["mode"]);
    });
  });
});
