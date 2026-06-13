/**
 * TOOL_SCHEMAS 结构校验 — 确保 3 个 Tool 定义完整、枚举值正确
 */

import { describe, it } from "node:test";
import { strictEqual, ok as assertOk } from "node:assert/strict";
import { TOOL_SCHEMAS } from "../tools/schemas.js";
import { getFilteredSchemas } from "../tools/index.js";

describe("TOOL_SCHEMAS", () => {
  it("应包含恰好 6 个 Tool", () => {
    strictEqual(TOOL_SCHEMAS.length, 6);
  });

  it("工具名称正确", () => {
    const names = TOOL_SCHEMAS.map((t) => t.name);
    strictEqual(names[0], "impact_analysis");
    strictEqual(names[1], "TIA-init");
    strictEqual(names[2], "repo_monitor");
    strictEqual(names[3], "repo_clone");
    strictEqual(names[4], "test_recommendation");
    strictEqual(names[5], "risk_assessment");
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

  describe("visibility 分级", () => {
    it("4 个 all + 2 个 stdio-only", () => {
      const allTools = TOOL_SCHEMAS.filter((t) => (t as any).visibility === "all");
      const stdioOnly = TOOL_SCHEMAS.filter((t) => (t as any).visibility === "stdio-only");
      strictEqual(allTools.length, 4, "应有 4 个 all 工具");
      strictEqual(stdioOnly.length, 2, "应有 2 个 stdio-only 工具");

      // 具体工具分配
      const allNames = allTools.map((t) => t.name).sort();
      const stdioNames = stdioOnly.map((t) => t.name).sort();
      deepEquals(allNames, ["TIA-init", "impact_analysis", "repo_clone", "repo_monitor"]);
      deepEquals(stdioNames, ["risk_assessment", "test_recommendation"]);
    });
  });
describe("getFilteredSchemas", () => {
  it("stdio 模式返回全部 6 个工具", () => {
    const filtered = getFilteredSchemas("stdio");
    strictEqual(filtered.length, 6);
  });

  it("HTTP 模式仅返回 4 个 all 工具", () => {
    const filtered = getFilteredSchemas("http");
    strictEqual(filtered.length, 4);
    const names = filtered.map((t: any) => t.name).sort();
    deepEquals(names, ["TIA-init", "impact_analysis", "repo_clone", "repo_monitor"]);
  });

  it("过滤后的 Schema 不含 visibility 私有字段", () => {
    const filtered = getFilteredSchemas("http");
    for (const tool of filtered) {
      strictEqual("visibility" in tool, false, `${(tool as any).name} 泄露了 visibility`);
    }
  });

  it("过滤后仍保留完整 MCP 字段", () => {
    for (const tool of getFilteredSchemas("stdio")) {
      assertOk(typeof (tool as any).name === "string");
      assertOk(typeof (tool as any).description === "string");
      assertOk((tool as any).inputSchema?.type === "object");
    }
  });
});

// ── 辅助：深度比较（Node 内置 deepStrictEqual 太严格）──
import { deepStrictEqual } from "node:assert/strict";
function deepEquals(a: unknown, b: unknown): void {
  deepStrictEqual(a, b);
}
