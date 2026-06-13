# Phase 5a: JACG 分析器集成 — 实现计划

**复杂度**: Medium | **新增文件**: 6 个 | **修改文件**: 2 个 | **预估**: 2-3h

---

## Summary

实现 ADR-0003 定义的 MCP 编织层架构。TIA 作为 Orchestrator，通过标准化的 `AnalyzerAdapter` 接口委托下游 MCP 分析器（先集成 JACG），做到 impact_analysis 透明聚合。

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 命名 | `impact-analysis/handler.ts:16` | `handleXxx(args)` 异步函数 |
| 配置读写 | `impact-analysis/state.ts:43-68` | `loadXxx()` / `saveXxx()` / `ensureXxx()` |
| 种子文件 | `impact-analysis/state.ts:60-68` | `ensureImpactConfig()` 自动创建 |
| 参数校验 | `tools/helpers.ts:57-60` | `requireString()` / `optionalString()` |
| 错误返回 | `tools/helpers.ts:49` | `ok("❌ ...")` 格式 |
| 测试 | `tests/impact-analysis.test.ts` | `node:test` + `node:assert/strict` |

---

## Files to Change

| File | Action | Why |
|------|--------|------|
| `src/analyzer-registry/types.ts` | CREATE | AnalyzerAdapter 接口 + AnalyzerConfig 类型 |
| `src/analyzer-registry/state.ts` | CREATE | analyzers.conf.json 读写 + 校验 + 种子 |
| `src/analyzer-registry/registry.ts` | CREATE | 分析器注册表：加载→初始化→按文件匹配 |
| `src/analyzer-registry/adapters/jacg.ts` | CREATE | JACG MCP 适配器：检测可用性 + 调用分析 |
| `src/impact-analysis/handler.ts` | UPDATE | analyzeRepo 中注入分析器编织逻辑 |
| `src/index.ts` | UPDATE | ensureAnalyzerConfig() 启动时调用 |
| `src/tests/analyzer-registry.test.ts` | CREATE | 类型定义 + 注册表 + 文件匹配测试 |
| `analyzers.conf.json` | CREATE | 种子配置文件 |

---

## Tasks

### Task 1: src/analyzer-registry/types.ts

- **Action**: 
  - 定义 `AnalyzerAdapter` 接口（id, name, fileExtensions, analyze()）
  - 定义 `AnalyzerConnection` 互斥类型（stdio 命令 / HTTP URL）
  - 定义 `AnalyzerConfigFile`（analyzers.conf.json 格式）
  - 定义 `AnalyzerImpactItem` / `AnalyzerResult`（返回给 handler）
- **Mirror**: `impact-analysis/types.ts` 风格
- **Validate**: `npx tsc --noEmit`

### Task 2: src/analyzer-registry/state.ts

- **Action**: 
  - `loadAnalyzerConfig()` — safeJsonLoad 读取
  - `saveAnalyzerConfig()` — 写入
  - `ensureAnalyzerConfig()` — 种子文件创建
  - `validateAnalyzer()` — 校验单条配置
- **Mirror**: `impact-analysis/state.ts` 完整模式
- **Validate**: `npx tsc --noEmit`

### Task 3: src/analyzer-registry/registry.ts

- **Action**: 
  - `getEnabledAnalyzers()` — 加载配置，实例化适配器
  - `matchAnalyzers(files)` — 按文件扩展名匹配分析器
  - 返回 `AnalyzerAdapter[]` 供 handler 使用
- **Mirror**: `tools/helpers.ts` 的 `getAdapter()` 懒加载单例
- **Validate**: `npx tsc --noEmit`

### Task 4: src/analyzer-registry/adapters/jacg.ts

- **Action**: 
  - 实现 `AnalyzerAdapter` 接口
  - `name = "jacg"`, `id = "jacg"`
  - `fileExtensions = [".java"]`
  - `analyze()` — 检测 JACG MCP 可用性，不可用返回 `null`（降级）
  - 首版做 **可用性检测**（MCP ping）+ **降级标记**，暂不做实际调用
- **Mirror**: `impact-analysis/handler.ts:56-101` 异步处理模式
- **Validate**: `npx tsc --noEmit`

### Task 5: src/impact-analysis/handler.ts — 编织逻辑

- **Action**: 
  - 在 `analyzeRepo()` 中，文件级匹配前先调用分析器编织逻辑
  - 新增 `runAnalyzers(repo, changedFiles, from, to)` 函数
  - 对每个匹配的分析器调用 `analyze()`，捕获异常 + null 返回
  - 聚合所有分析器结果到最终输出
  - 降级状态标注（🧠 JACG 分析 / ⚠️ 降级为文件匹配）
- **Mirror**: `impact-analysis/handler.ts:33-49` 批量循环 + 错误收集
- **Validate**: `npx tsc --noEmit`

### Task 6: src/index.ts — 启动注册

- **Action**: 
  - 导入 `ensureAnalyzerConfig()`
  - 在 `ensureImpactConfig()` 之后调用
- **Mirror**: `src/index.ts:28` `ensureImpactConfig()` 调用
- **Validate**: `npx tsc --noEmit`

### Task 7: src/tests/analyzer-registry.test.ts

- **Action**: 
  - 测试 AnalyzerConfigFile 种子文件内容
  - 测试 `matchAnalyzers()` — .java 文件匹配 jacg
  - 测试 `matchAnalyzers()` — .py 文件不匹配任何分析器
  - 测试 JACG 适配器 analyze() 返回 null（不可用时的降级）
- **Mirror**: `tests/impact-analysis.test.ts` 风格
- **Validate**: `npm test`

### Task 8: analyzers.conf.json 种子文件

- **Action**: 创建带 JACG 预配置的种子文件
- **Mirror**: `impact-rules.conf.json` 的示例规则
- **Validate**: 文件存在

---

## MCP 客户端调用方案（Task 4 细节）

java-all-call-graph-server 通过 SSE（Server-Sent Events）暴露 MCP 工具。TIA 需要：

1. **可用性检测**：发起 HTTP GET 到 `{endpoint}/sse`，检查健康状态
2. **工具发现**：发送 `ListTools` 请求，确认 JACG 工具可用
3. **调用分析**：发送 `CallTool` 请求，传入参数（待分析的文件列表）
4. **结果解析**：将 JACG 返回的调用链文本聚合到 TIA 的输出

首版（当前 Phase 5a）先实现步骤 1+2（可用性检测），步骤 3+4 留到 Phase 5b（实际调用）。

---

## Validation

```bash
npx tsc --noEmit        # TypeScript 编译
npm test                # 单元测试（78 → ~86 tests）
```

## Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| JACG MCP 未安装导致适配器失效 | 高（开发阶段） | analyze() 返回 null → 自动降级到文件匹配 |
| MCP 客户端 SDK 版本不兼容 | 低 | 固定 `@modelcontextprotocol/sdk` 版本 |

## Acceptance

- [ ] `analyzers.conf.json` 种子文件自动创建
- [ ] 分析器注册表正确加载配置
- [ ] `matchAnalyzers()` 按文件扩展名匹配
- [ ] JACG 适配器返回 null 时 handler 优雅降级
- [ ] 降级状态在输出中明确标注
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm test` 全部通过
