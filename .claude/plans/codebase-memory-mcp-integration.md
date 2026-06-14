
# TIA × codebase-memory-mcp 集成方案

> 设计日期: 2026-06-14 | 设计 Agent: ecc:architect
> 状态: 🔍 待评审

---

## 1. 核心决策

### 1.1 集成模式：内置适配器（Builtin Adapter）

codebase-memory-mcp **不**通过通用 exec runner 调用。而是实现 `AnalysisEngine` 接口的专用 TypeScript 适配器，安全地将 CLI JSON 输出翻译为 `PanoramaIndex`。

**原因**：
- 通用 exec runner 期望 `stdout` 直接是 `PanoramaIndex` JSON — codebase-memory-mcp 输出的是自己格式的 JSON，需要翻译
- 预索引（`index_project`）和查询（`trace_call_path`）是两步操作，不能合并为一个 exec 调用
- 内置适配器模式与之前 java-callgraph 适配器的架构思路一致

### 1.2 为什么不用 MCP 协议嵌套

TIA 本身是 MCP Server，客户端 (Claude Code) 通过 MCP 协议连接 TIA。如果在 TIA 内部再通过 MCP 协议连接 codebase-memory-mcp，会形成 MCP-over-MCP 嵌套：

- 需要管理两个 MCP 连接的生命周期
- 多一层 JSON-RPC 编码/解码开销
- 调试复杂度翻倍

**选择子进程 CLI 模式**：`codebase-memory-mcp cli <tool> '<json_args>'` → stdout JSON，通过 `execFile` 捕获。

---

## 2. 数据流设计

```
impact_analysis 工具
  └─ analyzeRepo()
       ├─ getDiffFiles(from, to)                     ← 变更文件列表
       ├─ analyzeWithEngines(repo, changedFiles)     ← 引擎增强
       │   ├─ matchEngineFiles(changedFiles)         ← 扩展名匹配
       │   ├─ 检查引擎 type:
       │   │   ┌─ adapter.type === "builtin"  →  内置适配器路径
       │   │   │   ├─ getBuiltinAdapter("codebase-memory") → CodebaseMemoryAdapter
       │   │   │   ├─ adapter.checkAvailability()    ← execFile --version
       │   │   │   ├─ adapter.runFullAnalysis()      ← 两步 CLI 调用
       │   │   │   │   ├─ Step 1: index_project → 索引项目到 SQLite
       │   │   │   │   ├─ Step 2: get_architecture → 提取方法/类/文件列表
       │   │   │   │   ├─ Step 3: query_graph → 提取所有调用边 (分批)
       │   │   │   │   └─ Step 4: trace_call_path → 逐文件追踪端点
       │   │   │   └─ translateToPanoramaIndex(raw) → PanoramaIndex
       │   │   │
       │   │   └─ adapter.type === undefined  →  通用 runner 路径 (现有)
       │   │       └─ runEngineAnalysis(engineConfig, ...)
       │   │
       │   ├─ computeImpactsFromIndex(files, index)  ← BFS 逆向遍历
       │   └─ getUnmatchedFiles()
       │
       ├─ analyzeImpact(uncoveredFiles)              ← glob 兜底
       └─ enrichWithEngineImpacts()                   ← 合并引擎结果
```

---

## 3. PanoramaIndex 翻译层

### 3.1 codebase-memory-mcp CLI 输出 → PanoramaIndex

codebase-memory-mcp 的 `query_graph` 工具返回带边和节点的子图，`trace_call_path` 返回调用链路径。翻译函数汇总这些输出构建 PanoramaIndex：

```typescript
// src/engines/adapters/codebase-memory.ts

interface CbmCallEdge {
  caller_fqn: string;
  callee_fqn: string;
  caller_file: string;
  callee_file: string;
  line?: number;
  call_type?: string;   // "direct" | "interface" | "lambda" | "thread"
}

interface CbmArchitectureNode {
  fqn: string;
  kind: "class" | "method" | "function" | "interface";
  file: string;
  line: number;
  annotations?: string[];
}

async function translateToPanoramaIndex(
  repoPath: string, branch: string, headSha: string,
  archNodes: CbmArchitectureNode[],
  callEdges: CbmCallEdge[],
  entryPoints: string[]
): Promise<PanoramaIndex> {
  // 1. 构建 callGraph 和 reverseCallGraph
  const callGraph: Record<string, string[]> = {};
  const reverseCallGraph: Record<string, string[]> = {};
  
  for (const edge of callEdges) {
    (callGraph[edge.caller_fqn] ??= []).push(edge.callee_fqn);
    (reverseCallGraph[edge.callee_fqn] ??= []).push(edge.caller_fqn);
  }

  // 2. 构建 fileToMethods
  const fileToMethods: Record<string, string[]> = {};
  for (const node of archNodes) {
    if (node.kind === "method" || node.kind === "function") {
      const relPath = relative(repoPath, node.file);
      (fileToMethods[relPath] ??= []).push(node.fqn);
    }
  }

  // 3. 推断 API 端点（Spring 注解模式）
  const apiEndpoints = extractApiEndpoints(archNodes, repoPath);
  const mqConsumers = extractMqConsumers(archNodes, repoPath);
  const scheduledJobs = extractJobs(archNodes, repoPath);

  // 4. terminalMethods = API + MQ + Job 的 handler FQN 并集
  const terminalMethods = [
    ...apiEndpoints.map(e => e.handlerFqn),
    ...mqConsumers.map(e => e.handlerFqn),
    ...scheduledJobs.map(e => e.handlerFqn),
  ];

  return {
    repoName: basename(repoPath), branch, headSha,
    indexedAt: new Date().toISOString(),
    engineId: "cbm-mcp", engineVersion: "0.8",
    summary: { /* ... */ },
    callGraph, reverseCallGraph, fileToMethods,
    apiEndpoints, mqConsumers, scheduledJobs,
    terminalMethods,
  };
}
```

### 3.2 API 端点推断（注解扫描）

codebase-memory-mcp 的 `get_architecture` 返回节点时包含 `annotations` 字段，可据此推断：

| 注解 | 端点类型 |
|------|---------|
| `@RestController` / `@Controller` / `@RequestMapping` | API 端点 |
| `@KafkaListener` / `@RabbitListener` / `@JmsListener` | MQ 消费者 |
| `@Scheduled` / `@XxlJob` / `@ElasticJob` | 定时任务 |

---

## 4. 接口设计

### 4.1 EngineConfig 扩展

```typescript
// src/engines/types.ts 新增

export interface BuiltinAdapterConfig {
  type: "builtin";
  /** 适配器 ID: "codebase-memory" */
  adapterId: string;
  /** 二进制名称（从 PATH 查找） */
  binaryName: string;
  /** 默认超时 */
  timeoutMs: number;
  /** 索引选项 */
  indexOptions: {
    forceReindex: boolean;   // true = 每次重新索引
  };
  /** 调用链追踪深度 */
  callTraceDepth: number;    // 默认 5
}

// 修改 EngineConfig
export interface EngineConfig {
  // ... 现有字段 ...
  /** 内置适配器配置（type="builtin" 时必填） */
  adapter?: BuiltinAdapterConfig;
}
```

### 4.2 适配器工厂

```typescript
// src/engines/adapters/factory.ts

import type { AnalysisEngine, EngineConfig } from "../types.js";
import type { CodebaseMemoryAdapter } from "./codebase-memory.js";

let _cbmAdapter: CodebaseMemoryAdapter | null = null;

export async function getBuiltinAdapter(config: EngineConfig): Promise<AnalysisEngine | null> {
  if (config.adapter?.type !== "builtin") return null;

  switch (config.adapter.adapterId) {
    case "codebase-memory": {
      if (!_cbmAdapter) {
        const { CodebaseMemoryAdapter } = await import("./codebase-memory.js");
        _cbmAdapter = new CodebaseMemoryAdapter(config.adapter.binaryName);
      }
      return _cbmAdapter;
    }
    default:
      console.error(`[TIA] 未知内置适配器: ${config.adapter.adapterId}`);
      return null;
  }
}
```

### 4.3 CodebaseMemoryAdapter 类

```typescript
// src/engines/adapters/codebase-memory.ts

export class CodebaseMemoryAdapter implements AnalysisEngine {
  readonly id = "cbm-mcp";
  readonly name = "Codebase Memory MCP";
  readonly capabilities: EngineCapabilities = {
    fileExtensions: [".java", ".kt", ".ts", ".tsx", ".js", ".jsx",
                     ".py", ".go", ".rs", ".cs", ".rb", ".php"],
    modes: ["full"],
    granularity: "method",
    frameworkAwareness: true,
  };
  readonly confidenceWeight = 90;

  constructor(private binaryName: string) {}

  async checkAvailability(): Promise<string | null> {
    try {
      await execFileAsync(this.binaryName, ["--version"], { timeout: 10_000 });
      return null;
    } catch (e: any) {
      return `codebase-memory-mcp 不可用: ${e.message}`;
    }
  }

  async runFullAnalysis(repoPath: string, branch: string): Promise<PanoramaIndex | null> {
    // Step 1: 索引项目
    const indexResult = await this.cli("index_project", { path: repoPath });
    if (!indexResult) return null;

    // Step 2: 获取架构
    const arch = await this.cli("get_architecture", {});

    // Step 3: 查询所有调用边
    const edges = await this.queryAllCallEdges();

    // Step 4: 翻译为 PanoramaIndex
    return translateToPanoramaIndex(repoPath, branch, arch.nodes, edges, arch.entry_points);
  }

  private async cli(tool: string, args: Record<string, unknown>): Promise<any> {
    const { stdout } = await execFileAsync(
      this.binaryName,
      ["cli", tool, JSON.stringify(args)],
      { timeout: 600_000, windowsHide: true, maxBuffer: 50 * 1024 * 1024 }
    );
    return JSON.parse(stdout);
  }
}
```

---

## 5. Handler 改动

### 5.1 handler.ts 改动点

```typescript
// 原代码:
for (const { config: engineConfig, files } of matched) {
  const availErr = await checkAvailability(engineConfig);
  // ...
  const index = await runEngineAnalysis(engineConfig, repoPath, repo.branch, outputPath);
}

// 改为:
for (const { config: engineConfig, files } of matched) {
  const error = await checkEngineAvailability(engineConfig);
  if (error) { /* degraded */ continue; }

  const index = await executeEngineAnalysis(engineConfig, repoPath, repo.branch, outputPath);
}
```

### 5.2 新增辅助函数

```typescript
async function checkEngineAvailability(config: EngineConfig): Promise<string | null> {
  // 优先尝试内置适配器
  const builtin = await getBuiltinAdapter(config);
  if (builtin) return builtin.checkAvailability();

  // 回退到通用 runner
  return checkAvailability(config);
}

async function executeEngineAnalysis(
  config: EngineConfig, repoPath: string, branch: string, outputPath: string
): Promise<PanoramaIndex | null> {
  // 优先尝试内置适配器
  const builtin = await getBuiltinAdapter(config);
  if (builtin) return builtin.runFullAnalysis(repoPath, branch);

  // 回退到通用 runner
  return runEngineAnalysis(config, repoPath, branch, outputPath);
}
```

---

## 6. 缓存机制

codebase-memory-mcp 自身维护 SQLite 知识图谱，但 TIA 仍然缓存 PanoramaIndex 到 `.tia/`：

```typescript
// src/engines/panorama-cache.ts

export function isCacheValid(repoPath: string, branch: string, engineId: string, maxAgeMs: number): boolean {
  const cachePath = join(repoPath, ".tia", branch, `panorama-${engineId}.json`);
  if (!existsSync(cachePath)) return false;
  const stat = statSync(cachePath);
  return Date.now() - stat.mtimeMs < maxAgeMs;
}

export function loadCachedPanoramaIndex(repoPath: string, branch: string, engineId: string): PanoramaIndex | null {
  const cachePath = join(repoPath, ".tia", branch, `panorama-${engineId}.json`);
  return existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf-8")) : null;
}

export function cachePanoramaIndex(index: PanoramaIndex, repoPath: string, branch: string): void {
  const dir = join(repoPath, ".tia", branch);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `panorama-${index.engineId}.json`), JSON.stringify(index, null, 2));
}
```

**缓存策略**：24 小时内复用，超过 24 小时或 `forceReindex: true` 时重新索引。

---

## 7. 降级策略（四层）

| 层 | 条件 | 行为 |
|:--:|------|------|
| **L1** | codebase-memory-mcp 二进制可用 + 项目有本地克隆 | 全功能：索引 → 调用链 → PanoramaIndex → BFS |
| **L2** | 二进制可用但 `index_project` 部分失败 | 降级：跳过失败文件，输出标注 `degraded: true` |
| **L3** | 二进制不可用 | 静默降级到 glob 文件匹配 |
| **L4** | 无本地克隆 | 跳过引擎分析，全程 glob |

降级时零用户感知（仅 stderr 日志），不会阻断分析流程。

---

## 8. 多引擎共存

未来同时有 codebase-memory-mcp + dependency-cruiser 时：

- **重叠文件**（如 `.ts` 被两者匹配）：两者独立运行，结果合并展示，不自动去重
- **置信度加权**：cbm-mcp=90, depcruiser=65 → 冲突时取高置信度引擎结果
- **交叉验证**：两个引擎的调用链可并排展示，供用户比较

---

## 9. 配置格式

```jsonc
// engines.conf.json
{
  "engines": [
    {
      "id": "cbm-mcp",
      "name": "Codebase Memory MCP",
      "enabled": true,
      "description": "基于 tree-sitter 的多语言代码智能引擎（158 种语言），方法级调用链追踪。",
      "fileExtensions": [
        ".java", ".kt", ".kts",
        ".ts", ".tsx", ".js", ".jsx",
        ".py", ".go", ".rs", ".cs", ".rb", ".php"
      ],
      "confidenceWeight": 90,
      "capabilities": {
        "fileExtensions": [".java",".kt",".ts",".tsx",".js",".jsx",".py",".go",".rs",".cs",".rb",".php"],
        "modes": ["full"],
        "granularity": "method",
        "frameworkAwareness": true
      },
      "adapter": {
        "type": "builtin",
        "adapterId": "codebase-memory",
        "binaryName": "codebase-memory-mcp",
        "timeoutMs": 600000,
        "indexOptions": {
          "forceReindex": false
        },
        "callTraceDepth": 5
      }
    }
  ]
}
```

---

## 10. 改动文件清单

### 新建

| 文件 | 说明 | 预估行数 |
|------|------|---------|
| `src/engines/adapters/factory.ts` | 适配器工厂（惰性单例） | ~40 |
| `src/engines/adapters/codebase-memory.ts` | CBM 适配器实现 | ~300 |
| `src/engines/panorama-cache.ts` | PanoramaIndex 缓存读写 | ~60 |
| `src/tests/codebase-memory.test.ts` | 单元测试 | ~150 |

### 修改

| 文件 | 改动 | 增量 |
|------|------|------|
| `src/engines/types.ts` | +BuiltinAdapterConfig, EngineConfig.adapter? | +15 |
| `src/engines/runner.ts` | 防御性 builtin case | +3 |
| `src/impact-analysis/handler.ts` | checkEngineAvailability() + executeEngineAnalysis() | +40 |
| `engines.conf.json` | 添加 cbm-mcp 条目 | +25 |
| `examples/engines.conf.example.json` | 同步更新 | +25 |

### 不动

`registry.ts`、`call-chain-traversal.ts`、`schemas.ts`、`analyzer.ts`、`state.ts`、`recommendation.ts`、`risk-handler.ts`、`tools/`

---

## 11. 实施步骤

| Phase | 步骤 | 内容 | 预估 |
|-------|------|------|------|
| **A** | A1-A2 | types.ts 新增 `BuiltinAdapterConfig` 类型 | 20 min |
| **B** | B1 | 新建 `panorama-cache.ts` | 30 min |
| **C** | C1 | 安装 codebase-memory-mcp 并验证 CLI JSON 格式 | 30 min |
| **C** | C2-C5 | 新建 `adapters/codebase-memory.ts` 完整实现 | 3 h |
| **D** | D1 | 新建 `adapters/factory.ts` | 15 min |
| **D** | D2-D4 | handler.ts 重构 + runner.ts 防御 + 配置更新 | 1.5 h |
| **E** | E1-E4 | 测试：单测 + 集成 + 端到端 + 降级 | 3 h |

**总预估**: ~2 个工作日

---

## 12. 风险与缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| CLI JSON 格式与推测不同 | 中 | Phase C1 先做实机验证 |
| 大型项目索引超时 | 中 | 默认 10min，可配置 `timeoutMs` |
| Windows 路径/编码问题 | 中 | `windowsHide: true` + 路径引号包裹 |
| SQLite 索引损坏 | 低 | `forceReindex: true` + 自动回退 glob |

---

## 13. ADR（架构决策记录）

| # | 决策 | 理由 |
|:--:|------|------|
| 1 | **内置适配器 > 通用 exec runner** | CBM 输出需翻译层，通用 runner 无法处理 |
| 2 | **子进程 CLI > MCP 嵌套** | 避免 MCP-over-MCP 复杂度 |
| 3 | **缓存 PanoramaIndex 到 .tia/** | 24h 内避免重复索引，解耦引擎生命周期 |
| 4 | **多引擎不自动去重** | 各引擎粒度不同，去重会丢失信息 |
| 5 | **四层降级永不阻断** | 引擎失败毫秒级回退 glob，用户体验无感知 |
