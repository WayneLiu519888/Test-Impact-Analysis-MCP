/**
 * TOOL_SCHEMAS 结构校验 — 确保 3 个 Tool 定义完整、枚举值正确
 */

import { describe, it } from "node:test";
import { strictEqual, ok as assertOk } from "node:assert/strict";
import { TOOL_SCHEMAS } from "../tools/schemas.js";

describe("TOOL_SCHEMAS", () => {
  it("应包含恰好 4 个 Tool", () => {
    strictEqual(TOOL_SCHEMAS.length, 4);
  });

  it("工具名称正确", () => {
    const names = TOOL_SCHEMAS.map((t) => t.name);
    strictEqual(names[0], "impact_analysis");
    strictEqual(names[1], "TIA-init");
    strictEqual(names[2], "repo_monitor");
    strictEqual(names[3], "repo_clone");
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
    it('action 参数包含 status/check/reset', () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_monitor")!;
      const actionProp = schema.inputSchema.properties!["action"] as any;
      deepEquals(actionProp.enum, ["status", "check", "reset"]);
    });

    it("required 包含 action", () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_monitor")!;
      deepEquals(schema.inputSchema.required, ["action"]);
    });
  });

  describe("repo_clone mode 枚举", () => {
    it('mode 参数包含 full/incremental', () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_clone")!;
      const modeProp = schema.inputSchema.properties!["mode"] as any;
      deepEquals(modeProp.enum, ["full", "incremental"]);
    });

    it("required 包含 mode", () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "repo_clone")!;
      deepEquals(schema.inputSchema.required, ["mode"]);
    });
  });

  describe("TIA-init agentType 枚举", () => {
    it('agentType 参数包含 ClaudeCode/CodeX/OpenCode', () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "TIA-init")!;
      const prop = schema.inputSchema.properties!["agentType"] as any;
      deepEquals(prop.enum, ["ClaudeCode", "CodeX", "OpenCode"]);
    });

    it("required 为空数组（agentType 可选）", () => {
      const schema = TOOL_SCHEMAS.find((t) => t.name === "TIA-init")!;
      deepEquals(schema.inputSchema.required, []);
    });
  });
});

// ── 辅助：深度比较（Node 内置 deepStrictEqual 太严格）──
import { deepStrictEqual } from "node:assert/strict";
function deepEquals(a: unknown, b: unknown): void {
  deepStrictEqual(a, b);
}
