# Plan: MCP 工具 Transport 分级暴露

**复杂度**: Small | **文件变更**: 3 个 | **预估**: 30min

---

## 需求重述

TIA 的 6 个 MCP 工具按 Transport 模式分级暴露：

| 工具 | 可见范围 | HTTP 模式行为 |
|------|---------|--------------|
| `TIA-init` | **all** | 不变 — HTTP 首调引导 |
| `repo_monitor` | **all** | 不变 — 纯 API 查询（无本地 git 执行） |
| `repo_clone` | **all** | ✅ 已完成降级 — HTTP 模式返回指令 |
| `impact_analysis` | **all** | HTTP 降级返回分析指令（详细设计后续补充） |
| `test_recommendation` | **stdio-only** | 拒绝 + 提示仅本地可用 |
| `risk_assessment` | **stdio-only** | 拒绝 + 提示仅本地可用 |

> `ListToolsRequestSchema` 按 transport 过滤 → LLM 看不到不可用的工具  
> `CallToolRequestSchema` 二次拦截 — stdio-only 工具在 HTTP 下调返回明确拒绝

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 命名 | `src/tools/helpers.ts:38` | `export type TransportMode = "stdio" \| "http"` |
| Transport 感知 | `src/tools/helpers.ts:40-42` | `getTransportMode()` + `TRANSPORT` 常量 |
| Schema 结构 | `src/tools/schemas.ts:5` | `export const TOOL_SCHEMAS = [{name, description, inputSchema}]` |
| 路由拦截 | `src/tools/index.ts:33-41` | `if (getTransportMode() === TRANSPORT.HTTP && ...)` |
| 错误返回 | `src/tools/helpers.ts:49` | `ok("❌ ...")` 格式 |
| 测试 | `src/tests/schemas.test.ts` | `node:test` + `node:assert/strict` |

---

## Files to Change

| File | Action | Why |
|------|--------|------|
| `src/tools/schemas.ts` | UPDATE | 每个 Schema 新增 `visibility` 元数据 |
| `src/tools/index.ts` | UPDATE | 新增 `getFilteredSchemas()` + 路由层拦截 |
| `src/index.ts` | UPDATE | `ListToolsRequestSchema` 使用过滤后的 Schema 列表 |
| `src/tests/schemas.test.ts` | UPDATE | 新增 visibility 分布测试 |

---

## Tasks

### Task 1: schemas.ts — 添加 visibility 字段

- **Action**: 为 `TOOL_SCHEMAS` 中每个工具新增顶层字段 `visibility: "all" | "stdio-only"`
  - `TIA-init` / `repo_monitor` / `repo_clone` / `impact_analysis` → `"all"`
  - `test_recommendation` / `risk_assessment` → `"stdio-only"`
- **Mirror**: 现有 Schema 结构，同级 `inputSchema` 外的元数据字段
- **Validate**: `npx tsc --noEmit`

### Task 2: index.ts — 过滤 + 拦截

- **Action**:
  1. 新增 `getFilteredSchemas(mode)` — 根据 transport 过滤，剥离 `visibility` 字段后返回纯 MCP 兼容 Schema
  2. 修改 `handleToolCall()` — 在 switch 之前增加 visibility 校验
- **Mirror**: `src/tools/index.ts:35` 现有 API KEY 校验模式
- **Validate**: `npx tsc --noEmit`

### Task 3: src/index.ts — 使用过滤 Schema

- **Action**: `ListToolsRequestSchema` 处理器调用 `getFilteredSchemas(getTransportMode())`
- **Mirror**: `src/index.ts:70-72` 单行调用
- **Validate**: `npx tsc --noEmit`

### Task 4: 更新测试

- **Action**:
  1. `schemas.test.ts` — 校验 4 个 `all` + 2 个 `stdio-only`
  2. 新增 `tools/index.ts` 路由拦截测试
- **Mirror**: 现有 `node:test` + `deepStrictEqual` 模式
- **Validate**: `npm test`

---

## Validation

```bash
npx tsc --noEmit        # TypeScript 编译
npm test                # 78 → ~82 tests
```

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `visibility` 字段泄露到 MCP 协议 | 低 | `getFilteredSchemas()` 中 `delete` 掉 |
| impact_analysis HTTP 暂不可用 | 中 | 降级返回明确提示 + 后续补充完整设计 |

## Acceptance

- [ ] stdio: `ListTools` 返回 6 个工具
- [ ] HTTP: `ListTools` 返回 4 个工具（无 test_recommendation / risk_assessment）
- [ ] HTTP 调用 stdio-only 工具被拒 + 明确提示
- [ ] `visibility` 字段不泄露到 MCP 响应
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 全部通过
