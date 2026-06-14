# TIA 终极蓝图 v3 — 全景索引 + 逆向调用链 + 场景级精准测试

> ⚠️ **java-callgraph / JACG 已于 2026-06-14 废弃。文中所有 JACG 相关内容仅作历史参考，不再计划实施。**

**设计日期**: 2026-06-14 | **最后修订**: 2026-06-15  
**核心决策**: 
- **多分析引擎可插拔框架** — `AnalysisEngine` 抽象接口 + 聚合模块，见第十四章
<!-- - **分层组合策略** — 快速路径（dependency-cruiser/jdeps）+ 精确路径（java-callgraph/TypeScript-Call-Graph），见第十三章 -->
- 全量预生成全景索引 → 增量查索引 BFS → 精准影响范围 — 核心链路保留
- 分析引擎选型附录见第十二章（历史方案记录）

---

## 实施状态概述

> **最后更新**: 2026-06-14 | 基于代码实际状态

### ✅ 已实现

| 阶段 | 内容 | 对应蓝图章节 | 关键文件 |
|------|------|-------------|---------|
| Phase 1 | Git Monitor — 仓库变更感知与代码拉取 | — | `src/tools/repo-monitor.ts`, `src/tools/repo-clone.ts`, `src/tools/tia-init.ts`, `src/platforms/*.ts` |
| Phase 2-4 | 基础影响分析（文件级 glob 匹配） | 不受 v3 蓝图影响 | `src/impact-analysis/analyzer.ts`, `handler.ts`, `recommendation.ts`, `risk-scorer.ts`, `risk-handler.ts` |
| Phase 2-4 | 测试推荐引擎（推荐分排序 + 最小测试集） | 不受 v3 蓝图影响 | `src/impact-analysis/recommendation.ts` |
| Phase 2-4 | 风险评估（0-100 评分 + 缓解建议） | 不受 v3 蓝图影响 | `src/impact-analysis/risk-scorer.ts`, `risk-handler.ts` |
| 安全层 | IP 白名单 + API KEY + DNS rebinding + Transport 分级 | — | `src/security.ts`, `src/index.ts` |
| 信息安全 | enterprise/ 企业配置隔离 + .gitignore + pre-commit hook | 蓝图第十一章 | `enterprise/`, `.githooks/pre-commit`, `src/paths.ts`(ensureEnterpriseDir + resolveConfigPath), `src/state.ts`(resolveConfigPath), `src/shared/json-utils.ts` |

### 🔜 规划中（Phase 5b，未开始）

蓝图第二至第七章描述的双模引擎、JACG 实际调用、融合引擎均为 **Phase 5b 规划**，当前代码中**未实现**。

| 蓝图章节 | 描述 | 状态 |
|----------|------|------|
| 第二章 | 双模分析引擎（全量离线 + 增量实时） | 🔜 规划中 |
| 第三章 | 全景索引存储方案（PanoramaIndex） | 🔜 规划中 |
| 第四章 | JACG 适配器升级（analyzeFull / analyze） | 🔜 规划中 |
| 第五章 | 多分析器融合引擎（Merge Engine） | 🔜 规划中 |
| 第六章 | impact_analysis v3 核心引擎（handler 路由升级） | 🔜 规划中 |
| 第七章 | 业务场景桥接（Playwright MCP 集成） | 🔜 规划中 |

### ❌ 已删除/废弃

| 组件 | 说明 |
|------|------|
| `src/analyzer-registry/` | Phase 5a 产物，已删除。JACG 适配器可在 Phase 5b 时恢复 |
| `analyzers.conf.json` | 分析器配置文件，已删除。Phase 5b 时恢复 |
| `src/tests/analyzer-registry.test.ts` | 对应测试，已删除 |
| `src/call-chain/` | v2 蓝图的自建调用图路径，从未创建。v3 蓝图的 BFS 索引分析器（`call-chain/analyzer.ts`）也从未实现 |

### 📊 当前测试覆盖

- **83 个测试用例**（非蓝图中的 91）
- 测试文件: `state.test.ts`, `security.test.ts`, `schemas.test.ts`, `impact-analysis.test.ts`, `recommendation.test.ts`, `risk-assessment.test.ts`

---

**与已有规划的关系**:

| 已有规划 | v3 蓝图关系 |
|----------|-----------|
| `phase2-impact-analysis-plan.md` (文件级匹配) | 保留为降级兜底路径 |
| `phase3-4-plan.md` (测试推荐+风险评分) | 下游消费者 —— 输入从文件级升级为调用链级 |
| `ultimate-blueprint-v2.md` (自建调用图+双源) | **废弃**。砍掉 tree-sitter 自建路径 |
| `java-all-call-graph` (核心库) | 候选分析引擎 — 通过子进程 CLI 调用（调研中） |

---

## 一、终极架构全景图

```
┌──────────────────────────────────────────────────────────────────┐
│                    Claude Code Host (编排层)                       │
│                                                                  │
│  1. repo_clone → 代码落盘                                         │
│  2. repo_monitor → 发现新MR                                      │
│  3. impact_analysis → 双模分析 (全量离线 / 增量实时)              │
│  4. Playwright MCP → 业务场景树                                   │
│  5. test_recommendation → 精准测试推荐                            │
└──────────────────────────┬───────────────────────────────────────┘
                           │ MCP
┌──────────────────────────▼───────────────────────────────────────┐
│                    TIA MCP Server (本项目)                         │
│                                                                   │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────────────┐ │
│  │repo_monitor│  │repo_clone │  │    impact_analysis (v3)      │ │
│  │  (Phase1)  │  │  (Phase1) │  │                              │ │
│  └───────────┘  └───────────┘  │  模式1: full (🔖待定)        │ │
│                                │    全量预生成全景索引          │ │
│  ┌──────────────────────────┐  │    → .tia/main/panorama-*.gz │ │
│  │  test_recommendation     │  │                              │ │
│  │  risk_assessment         │  │  模式2: incremental (✅已实现)│ │
│  │  (Phase 3-4)             │  │    查全景索引 → BFS         │ │
│  └──────────────────────────┘  │    → API/MQ/Job 影响范围     │ │
│                                │                              │ │
│  ┌──────────────────────────┐  │  降级: glob 文件级匹配        │ │
│  │  call-chain/             │  │    (索引不存在时兜底)         │ │
│  │  ├─ 逆向 BFS (✅)        │──┤                              │ │
│  │  └─ PanoramaIndex (✅)   │  │                              │ │
│  └──────────────────────────┘  └──────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  分析引擎 🔖 待定（见第十二章附录）                            ││
│  │  ├─ JACG MCP Server — ❌ 已毙                                ││
│  │  ├─ JACG 核心库子进程 — ❌ 已毙                               ││
│  │  └─ JACG 离线 JSON 生成器 — 🔖 待采用（太重暂搁）             ││
│  └──────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────┘
```

---

## 二、双模分析引擎 🔜 规划中

### 2.1 模式 1：全量离线预生成

**触发**：用户首次对仓库执行 `impact_analysis(action="full", name="xxx")`

**流程**：
```
impact_analysis(action="full", name="order-service")
  │
  ├─ 1. 检查是否有已 clone 的代码
  │     → {baseDir}/Repository/Backend repository/order-service/main/
  │
  ├─ 2. 调用 JACG MCP 对全量代码生成调用图
  │     → JACG 工具: analyze_full_repository（具体工具名待 JACG ListTools 确认）
  │     → 输入: 代码目录路径
  │     → 输出: 完整调用图数据
  │
  ├─ 3. 标准化为 PanoramaIndex 格式
  │     {
  │       callGraph: { 方法 → [被调方法] },
  │       apiEndpoints: [{ url, method, handler }],
  │       mqConsumers: [{ queue, handler }],
  │       scheduledJobs: [{ name, cron, handler }],
  │       reverseCallGraph: { 方法 → [调用者] },  // 逆向索引(预构建)
  │     }
  │
  ├─ 4. 落盘全景索引
  │     → {baseDir}/Repository/Backend repository/order-service/.tia/main/panorama-jacg.json
  │     若还启用了 CodeQL：
  │     → {baseDir}/Repository/Backend repository/order-service/.tia/main/panorama-codeql.json
  │
  └─ 5. 输出摘要
       📐 全量调用图已生成
          类: 1,234  方法: 9,876  调用边: 45,678
          API端点: 89  MQ消费者: 12  定时任务: 5
          索引大小: 3.2MB  耗时: 42s
```

**关键设计**：`.tia/{branch}/panorama-{analyzerId}.json` 的格式对齐 JACG 输出，TIA 只做**格式标准化 + 落盘**，不做自建解析。多分析器各自独立文件物理隔离。

### 2.2 模式 2：增量实时分析

**触发**：用户传入 MR/PR ID 或直接指定 SHA 范围

**流程**：
```
impact_analysis(name="order-service", mrId="1423")
  │
  ├─ 1. 获取 MR 变更文件列表（已有：adapter.getDiffFiles）
  │
  ├─ 2. 检查全景索引是否存在
  │     → {repoBasePath}/.tia/{branch}/panorama-jacg.json
  │     → {repoBasePath}/.tia/{branch}/panorama-codeql.json (如果启用了)
  │
  ├─ 3a. 索引存在 → 走快速路径
  │       ├─ 从索引查变更文件中包含的方法 (fileToMethods)
  │       ├─ 在索引的 reverseCallGraph 中 BFS 逆向遍历
  │       │   变更方法 → 调用者 → 调用者的调用者 → ... → API/MQ/Job
  │       └─ 输出: 受影响API + MQ + Job + 调用链路径
  │           标注: "📐 全景索引 (0.3s)"
  │
  ├─ 3b. 索引不存在 → 走实时路径
  │       ├─ 调 JACG MCP 对变更文件做实时代码分析
  │       │   → 返回: 受影响的方法 + 调用链
  │       ├─ 聚合为与 3a 相同的输出结构
  │       └─ 标注 "⚡ 实时分析（无预生成索引）"
  │
  ├─ 4. JACG 不可用 → 降级到现有文件级 glob 匹配
  │       └─ 标注 "⚠️ JACG 不可用，降级为文件匹配"
  │
  └─ 5. 格式化统一输出
```

### 2.3 impact_analysis 完整 Schema

```typescript
{
  name: "impact_analysis",
  description:
    "代码变更影响分析（JACG 驱动）。双模引擎：全量离线预生成 / 增量实时分析。\n\n" +
    "模式1 — 全量离线 (action=full):\n" +
    "  首次使用时调用 JACG 对全量代码生成调用图 → 落盘到 .tia/{branch}/panorama-jacg.json\n" +
    "  后续增量分析直接查索引，秒级出结果\n" +
    '  impact_analysis(action="full", name="order-service")\n\n' +
    "模式2 — 增量实时 (默认):\n" +
    "  给定 MR ID → 获取变更文件 → 查全景索引(优先) 或 实时调JACG\n" +
    "  → 逆向遍历调用图 → 精确定位受影响API/MQ/Job\n" +
    '  impact_analysis(name="order-service", mrId="1423")\n' +
    '  impact_analysis(name="order-service", from="abc", to="def")\n\n' +
    "降级: JACG 不可用 → 自动降级为文件级 glob 匹配\n" +
    "重建索引 (action=rebuild):\n" +
    "  代码有重大更新后重新生成 .tia/{branch}/panorama-*.json\n" +
    '  impact_analysis(action="rebuild", name="order-service")',
  inputSchema: {
    type: "object",
    properties: {
      // 仓库定位
      name:   { type: "string", description: "仓库别名" },
      module: { type: "string", description: "模块名(批量)" },

      // 模式选择
      action: { type: "string", enum: ["full", "incremental", "rebuild"],
                description: "full=全量预生成索引 / incremental=增量分析(默认) / rebuild=重建索引" },

      // 增量分析：SHA 范围（与 mrId 二选一）
      from:   { type: "string", description: "起始 SHA（不传=当前水位 lastSha）" },
      to:     { type: "string", description: "目标 SHA（不传=远程 HEAD）" },

      // 增量分析：MR/PR ID（与 from/to 二选一）
      mrId:   { type: "string", description: "MR/PR ID。传入后自动获取该MR的变更文件和SHA范围" },

      // 输出控制
      detail: { type: "string", enum: ["summary", "full"],
                description: "summary=仅API/MQ/Job列表 / full=含完整调用链路径，默认 summary" },
      limit:  { type: "number", description: "返回受影响端点上限，默认30" },
    },
    required: [],
  },
}
```

---

## 三、全景索引存储方案 🔜 规划中

### 3.0 目录结构（结合现有代码仓接口）

> **核心约束**：索引文件必须和代码仓放在同一物理区域，A 项目的索引不能存到 B 项目下。  
> 现有 `repo_clone` 的目录结构已经定了——索引文件必须与之对齐。

#### 现有代码仓物理布局

回顾 `repo_clone` 的落盘逻辑（`src/tools/repo-clone.ts`）：

```
repo_clone full  →  getRepoBasePath(repoType, baseDir)  →  join(basePath, repo.name)
  basePath     = {baseDir}/Repository/{Frontend|Backend} repository/
  repoBasePath = {baseDir}/Repository/Backend repository/{repo-name}/
  targetPath   = {repoBasePath}/{branch}/                 ← git clone 代码

repo_clone incremental:
  branchClonePath = {repoBasePath}/{branch}/              ← 全量基础克隆
  mrPath          = {repoBasePath}/{mrId}/                ← 每个 MR 独立检出
```

实际磁盘布局：

```
{baseDir}/Repository/
├── Backend repository/
│   ├── order-service/                    ← repo.name
│   │   ├── main/                         ← repo.branch (git clone 代码)
│   │   │   ├── .git/
│   │   │   ├── src/main/java/...
│   │   │   └── pom.xml
│   │   ├── 1423/                         ← MR ID (增量)
│   │   └── 1425/                         ← MR ID (增量)
│   └── user-service/                     ← 另一个仓库
│       └── main/
├── Frontend repository/
│   └── order-web/
│       └── main/
```

#### 索引存放方案

索引放在 `{repo-name}/.tia/` 下——**与分支目录、MR目录并列，但不属于任何 git 工作树**：

```
{baseDir}/Repository/Backend repository/order-service/
├── .tia/                                 ← TIA 元数据（独立于代码目录）
│   ├── main/                             ← 按分支名
│   │   ├── panorama-jacg.json            ← JACG 全量调用图 (PanoramaIndex)
│   │   ├── panorama-codeql.json          ← CodeQL 分析索引 (PanoramaIndex)
│   │   └── index-meta.json               ← 该分支的索引元信息
│   ├── 1423/                             ← 按 MR ID（增量分析结果缓存）
│   │   └── impact-jacg.json              ← 该MR的增量分析结果 (CallChainImpact)
│   └── state.json                        ← TIA 状态（上次full时间、headSha等）
├── main/                                 ← git clone 代码
├── 1423/                                 ← MR 增量代码
└── 1425/
```

#### 路径解析函数

```typescript
// src/impact-analysis/panorama-state.ts

import { join } from "path";
import { getBaseDir } from "../state.js";

/**
 * 获取指定仓库的 TIA 元数据根目录。
 * 
 * 与 repo_clone 的 getRepoBasePath 对齐：
 *   {baseDir}/Repository/{typeDir}/{repoName}/.tia/
 */
export function getTiaMetaDir(repoName: string, repoType: "frontend" | "backend"): string {
  const typeDir = repoType === "frontend" ? "Frontend repository" : "Backend repository";
  return join(getBaseDir(), "Repository", typeDir, repoName, ".tia");
}

/**
 * 获取全量全景索引文件路径。
 * 
 *   {baseDir}/Repository/{typeDir}/{repoName}/.tia/{branch}/panorama-{analyzerId}.json
 */
export function getPanoramaPath(
  repoName: string,
  repoType: "frontend" | "backend",
  branch: string,
  analyzerId: string  // "jacg" | "codeql" | "sql-analyzer"
): string {
  return join(getTiaMetaDir(repoName, repoType), branch, `panorama-${analyzerId}.json`);
}

/**
 * 获取增量分析结果缓存路径（按 MR ID）。
 * 
 *   {baseDir}/Repository/{typeDir}/{repoName}/.tia/{mrId}/impact-{analyzerId}.json
 */
export function getIncrementalCachePath(
  repoName: string,
  repoType: "frontend" | "backend",
  mrId: string,
  analyzerId: string
): string {
  return join(getTiaMetaDir(repoName, repoType), mrId, `impact-${analyzerId}.json`);
}
```

#### 为什么这样设计

| 约束 | 如何满足 |
|------|---------|
| **索引与代码共存** | `.tia/` 紧邻分支目录，不散落到其他地方 |
| **A 项目索引不混入 B** | `.tia/` 在 `{repo-name}/` 下，仓库间物理隔离 |
| **分支间索引隔离** | `.tia/{branch}/`，不同分支不同索引（代码不同，调用图不同） |
| **force clone 不删索引** | `rmSync(targetPath)` 删的是 `main/`，不影响 `.tia/main/` |
| **多分析器并存** | `panorama-{analyzerId}.json`，不同分析器不同文件 |
| **不被 git 追踪** | `.tia/` 不在 git 工作树内（工作树是 `main/`），不会被误提交 |
| **SHA 关联** | `PanoramaIndex.headSha` 记录索引生成时的代码版本，可判断是否过期 |

### 3.1 格式设计原则

- **格式对齐 JACG**：字段名和层级尽量复用 JACG 输出，减少转换损耗
- **双向索引**：正向 (caller→callee) + 逆向 (callee→caller) 双存，BFS 时无需实时构建逆向图
- **增量友好**：索引文件包含 `headSha`，可对比当前水位判断索引是否过期

### 3.2 核心类型

```typescript
// src/impact-analysis/types.ts 新增

/** 全景索引 — 落地为 .tia/{branch}/panorama-{analyzerId}.json */
export interface PanoramaIndex {
  /** 元信息 */
  repoName: string;
  branch: string;
  headSha: string;
  indexedAt: string;       // ISO 8601
  source: "jacg";          // 来源分析器

  /** 摘要统计 */
  summary: PanoramaSummary;

  /** 调用图: callerFqn → [calleeFqn, ...] */
  callGraph: Record<string, string[]>;

  /** 逆向调用图: calleeFqn → [callerFqn, ...]
   *  预先构建，避免每次 BFS 时 O(N) 扫描 callGraph */
  reverseCallGraph: Record<string, string[]>;

  /** 符号表: 文件路径 → 包含的方法 FQN 列表 */
  fileToMethods: Record<string, string[]>;

  /** API 端点字典 */
  apiEndpoints: ApiEndpoint[];

  /** MQ 消费者字典 */
  mqConsumers: MqConsumer[];

  /** 定时任务字典 */
  scheduledJobs: ScheduledJob[];

  /** 终端方法集合: API handler + MQ handler + Job handler 的 FQN */
  terminalMethods: string[];
}

export interface PanoramaSummary {
  totalClasses: number;
  totalMethods: number;
  totalCallEdges: number;
  totalApis: number;
  totalMqConsumers: number;
  totalJobs: number;
  parseTimeMs: number;
}

export interface CallChainPath {
  /** 路径: [被改方法, 调用者1, ..., 端点方法] */
  chain: string[];
  /** 路径深度 (步骤数) */
  depth: number;
}

/** 调用链影响分析结果 */
export interface CallChainImpact {
  repoName: string;
  fromSha: string;
  toSha: string;
  mrId?: string;

  /** 变更的方法列表 */
  changedMethods: string[];

  /** 受影响的 API */
  impactedApis: {
    endpoint: ApiEndpoint;
    chains: CallChainPath[];
  }[];

  /** 受影响的 MQ 消费者 */
  impactedMqs: {
    consumer: MqConsumer;
    chains: CallChainPath[];
  }[];

  /** 受影响的定时任务 */
  impactedJobs: {
    job: ScheduledJob;
    chains: CallChainPath[];
  }[];

  /** 降级标记 */
  degraded: boolean;
  degradationReason?: string;

  /** JACG 原始输出的补充文本（调用链树形图等） */
  jacgRawOutput?: string;
}
```

---

## 四、JACG 适配器升级 🔜 规划中

Phase 5a 的适配器只做了可用性检测。v3 升级为实际 MCP 调用。

### 4.1 适配器结构

```typescript
// src/analyzer-registry/adapters/jacg.ts 升级

/**
 * JACG 适配器 v2 — 完全对接 java-all-call-graph-server 的 MCP 工具。
 *
 * 预期 JACG 暴露的工具（具体名称通过 ListTools 动态发现）：
 *   - 全量分析工具 → 输入代码目录 → 输出完整调用图
 *   - 增量分析工具 → 输入变更文件列表 → 输出受影响方法+调用链
 *
 * 如果 JACG 工具签名不同，仅需修改此文件的方法调用部分。
 */

export class JacgAdapter implements AnalyzerAdapter {
  // ... 基础结构不变 ...

  /**
   * 全量分析：生成完整调用图。
   * 调用 JACG MCP 的全量分析工具。
   *
   * @returns PanoramaIndex，不可用时返回 null
   */
  async analyzeFull(repo: MonitorEntry): Promise<PanoramaIndex | null> {
    const available = await this.isAvailable();
    if (!available) return null;

    // Phase 5b: 实际调用 JACG MCP 工具
    // const result = await this.callJacgTool("analyze_full", {
    //   project_path: getRepoCodePath(repo),
    //   branch: repo.branch,
    // });
    // return this.normalizeToPanoramaIndex(result, repo);

    return null; // 占位 —— JACG 工具签名确定后填充
  }

  /**
   * 增量分析：分析变更文件的影响范围。
   * 调用 JACG MCP 的增量分析工具。
   *
   * @returns AnalyzerResult，不可用时返回 null
   */
  async analyze(
    repo: MonitorEntry,
    changedFiles: string[],
    fromSha: string,
    toSha: string
  ): Promise<AnalyzerResult | null> {
    const available = await this.isAvailable();
    if (!available) return null;

    // Phase 5b: 实际调用
    // const result = await this.callJacgTool("analyze_incremental", {
    //   changed_files: changedFiles,
    //   base_sha: fromSha,
    //   head_sha: toSha,
    // });
    // return this.normalizeToAnalyzerResult(result);

    return null;
  }
}
```

---

## 五、多分析器融合引擎 (Merge Engine) 🔜 规划中

> **核心命题**：当 `analyzers.conf.json` 中配置了 N 个分析器时，TIA 并行调用它们，  
> 然后对 N 份结果做去重、合并、加权仲裁，产出一份**统一影响分析报告**。  
> 当前 N=1 (仅 JACG)，引擎直接透传；N≥2 时融合逻辑自动激活。

### 5.1 融合流程

```
impact_analysis(name="order-service", mrId="1423")
  │
  ├─ 1. 获取变更文件列表
  │
  ├─ 2. 按文件扩展名匹配分析器
  │     .java → [JACG, CodeQL]          (2个分析器都声明了 .java)
  │     .xml  → [SQL Analyzer]          (只有 SQL Analyzer 声明了 .xml)
  │     .ts   → []                      (无匹配，走 glob 兜底)
  │
  ├─ 3. 并行调用 (Promise.all) 所有匹配的分析器
  │     ┌─ JACG.analyze(files)          → AnalyzerResult_A
  │     ├─ CodeQL.analyze(files)        → AnalyzerResult_B
  │     └─ SQL Analyzer.analyze(files)  → AnalyzerResult_C
  │     (任一失败或返回 null → 标记为不可用，其余继续)
  │
  ├─ 4. 融合引擎处理 N 份结果:
  │     ├─ 步骤A: 标准化 — 所有 AnalyzerResult 转为统一的 CallChainImpact
  │     ├─ 步骤B: 去重 — 同名方法被多个分析器命中时合并
  │     ├─ 步骤C: 合并 — 同一API的不同调用链路径合并
  │     ├─ 步骤D: 加权 — 每个分析器有可信度权重 (配置中声明)
  │     └─ 步骤E: 降级标注 — 哪些分析器参与了、哪些不可用
  │
  └─ 5. 输出统一报告
```

### 5.2 去重策略

```typescript
// src/impact-analysis/merge-engine.ts

/**
 * 多分析器结果去重 + 合并。
 *
 * 去重键规则（按优先级）：
 *   - API 端点: `${httpMethod} ${url}` → 同键合并
 *   - MQ 消费者: `${mqType}:${queueOrTopic}` → 同键合并
 *   - 定时任务: `${triggerType}:${handlerFqn}` → 同键合并
 *   - 变更方法: `${filePath}:${methodFqn}` → 同键合并
 *
 * 合并策略：
 *   - 同名方法 → 保留所有调用链路径（不同分析器可能发现不同路径）
 *   - 同 API → 合并调用链来源，标注 "JACG + CodeQL 双源验证"
 *   - confidence → 取加权最高值
 *   - 独有发现 → 标注来源分析器
 */

interface MergeResult {
  /** 合并后的统一结果 */
  impact: CallChainImpact;
  /** 各分析器参与情况 */
  participants: {
    analyzerId: string;
    analyzerName: string;
    status: "ok" | "degraded" | "unavailable";
    contributedMethods: number;   // 该分析器贡献了多少个受影响方法
    contributedEndpoints: number; // 该分析器贡献了多少个端点
  }[];
  /** 去重统计 */
  dedupStats: {
    totalRaw: number;       // 原始结果数（融合前）
    afterDedup: number;     // 去重后
    multiSourceVerified: number; // 被多个分析器验证的
    uniqueFindings: Record<string, number>; // 每个分析器的独有发现数
  };
}
```

### 5.3 加权仲裁

```typescript
/**
 * 每个分析器在配置中声明可信度权重（0-100）。
 * 当多个分析器对同一方法/端点给出不同结论时，按权重仲裁。
 *
 * analyzers.conf.json 中声明:
 * {
 *   "id": "jacg",
 *   "confidenceWeight": 90,   // 字节码级分析，可信度极高
 * }
 * {
 *   "id": "codeql",
 *   "confidenceWeight": 85,   // 数据流分析也很强
 * }
 * {
 *   "id": "sql-analyzer",
 *   "confidenceWeight": 70,   // SQL 静态分析有不确定性
 * }
 *
 * 加权公式:
 *   合成可信度 = MAX(各分析器对同一项的 confidence × weight/100)
 *   如果多个分析器独立发现同一项 → +10 加成（交叉验证奖励）
 */
```

### 5.4 融合输出示例（3 分析器）

```
🔬 影响分析 — order-service (MR !1423)

📊 分析器参与:
   ✅ JACG (Java调用图)       — 12 个方法, 4 个端点
   ✅ CodeQL (安全+数据流)     — 8 个方法, 3 个端点
   ⚠️ SQL Analyzer — 不可用，已跳过

📐 融合统计:
   原始结果: 23 条 → 去重后: 12 条
   双源验证: 3 个端点 (JACG + CodeQL 交叉验证)
   JACG 独有: 1 个端点 (动态代理调用链)
   CodeQL 独有: 0 个端点

🔗 受影响 API (3 个)
  🔴 POST /api/orders                     [深度: 2] [JACG ✓ CodeQL ✓]
     OrderService.createOrder()
       → OrderController.createOrder()
  🟡 GET  /api/users/{id}                 [深度: 3] [JACG ✓]
     UserMapper.findById()
       → UserService.getUser()
         → UserController.getUser()
  🟡 PUT  /api/pay/confirm                 [深度: 2] [JACG ✓ CodeQL ✓]
     PayService.doPay()
       → PayController.confirm()

📨 受影响 MQ (1 个)
  🔴 payment.success (RabbitMQ)            [深度: 3] [JACG ✓ CodeQL ✓]
     OrderService.createOrder()
       → OrderStatusHandler.handle()
         → PaymentListener.onPaid()

💡 建议测试
   🔴 订单系统/下单/创建订单 — 双源验证, 最高可信度
   🔴 订单系统/支付/在线支付 — 双源验证
   🟡 用户中心/信息查询 — 仅JACG验证
```

### 5.5 多分析器配置示例 (analyzers.conf.json)

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 调用链分析",
      "enabled": true,
      "fileExtensions": [".java"],
      "confidenceWeight": 90,
      "connection": {
        "transport": "http",
        "endpoint": "http://localhost:34567/mcp"
      }
    },
    {
      "id": "codeql",
      "name": "CodeQL 安全+数据流分析",
      "enabled": false,
      "fileExtensions": [".java", ".kt"],
      "confidenceWeight": 85,
      "connection": {
        "transport": "http",
        "endpoint": "http://localhost:34568/mcp"
      }
    },
    {
      "id": "sql-analyzer",
      "name": "SQL 变更影响分析",
      "enabled": false,
      "fileExtensions": [".sql", ".xml"],
      "confidenceWeight": 70,
      "connection": {
        "transport": "stdio",
        "endpoint": "python sql-analyzer-mcp.py"
      }
    }
  ]
}
```

---

## 六、impact_analysis v3 核心引擎 🔜 规划中

### 6.1 handler 路由

```typescript
// src/impact-analysis/handler.ts 升级

export async function handleImpactAnalysis(args: Record<string, unknown>) {
  const action = optionalString(args, "action") || "incremental";

  switch (action) {
    case "full":    return handleFullScan(args);
    case "rebuild": return handleRebuild(args);
    case "incremental":
    default:        return handleIncrementalAnalysis(args);
  }
}
```

**全量扫描**：
```
impact_analysis(action="full", name="xxx")
  → 遍历所有已启用的分析器 (analyzers.conf.json)
  → 对每个启用的分析器调 analyzeFull() (目前仅 JACG)
  → 分别落盘 .tia/{branch}/panorama-{analyzerId}.json
  → 输出各分析器的摘要
```

**增量分析路由** (N 个分析器并行)：
```
impact_analysis(name="xxx", mrId="1423")
  │
  ├─ 1. 获取变更文件列表
  │
  ├─ 2. matchAnalyzers(changedFiles) → 按扩展名匹配分析器
  │     例: [.java, .xml] → 匹配到 [JACG(.java), SQL(.xml)]
  │
  ├─ 3. 并行调用 + 查全景索引:
  │     Promise.all(matchedAnalyzers.map(a => {
  │       const idx = loadPanoramaIndex(repo, a.id);  // 尝试查该分析器的索引
  │       if (idx) return reverseImpactFromIndex(changedFiles, idx);  // 快速路径
  │       return a.analyze(repo, changedFiles, from, to);             // 实时调用
  │     }))
  │
  ├─ 4. 融合引擎: mergeAnalyzerResults(results, analyzers)
  │     → 去重 + 合并 + 加权 + 降级标注
  │
  ├─ 5. 全部分析器不可用:
  │     → 降级到现有 analyzer.ts glob 文件级匹配
  │
  └─ 6. formatUnifiedReport(mergeResult) → 统一输出

### 5.2 索引驱动的逆向 BFS

```typescript
// src/call-chain/analyzer.ts

/**
 * 从全景索引出发，逆向 BFS 找到变更方法影响的所有 API/MQ/Job 端点。
 *
 * 全量调用图已在 .tia/{branch}/panorama-*.json 中，
 * 逆向邻接表也已预构建（reverseCallGraph），
 * BFS 纯内存操作，毫秒级。
 */
export function reverseImpactFromIndex(
  changedFiles: string[],
  index: PanoramaIndex
): CallChainImpact {
  // 1. 从文件→方法映射找到变更方法
  const changedMethods: string[] = [];
  for (const file of changedFiles) {
    const methods = index.fileToMethods[file];
    if (methods) changedMethods.push(...methods);
  }

  if (changedMethods.length === 0) {
    return { changedMethods: [], impactedApis: [], impactedMqs: [], impactedJobs: [], degraded: false };
  }

  // 2. 多源 BFS 逆向遍历
  const terminalSet = new Set(index.terminalMethods);
  const impactMap = new Map<string, CallChainPath[]>();

  for (const startMethod of changedMethods) {
    const visited = new Set<string>();
    const queue: { method: string; chain: string[]; depth: number }[] = [
      { method: startMethod, chain: [], depth: 0 }
    ];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node.method) || node.depth > 10) continue;
      visited.add(node.method);

      if (terminalSet.has(node.method)) {
        const paths = impactMap.get(node.method) ?? [];
        paths.push({ chain: [...node.chain, node.method], depth: node.depth });
        impactMap.set(node.method, paths);
        continue; // 到达终端，不再向上（之上是框架层）
      }

      const callers = index.reverseCallGraph[node.method] ?? [];
      for (const caller of callers) {
        queue.push({ method: caller, chain: [...node.chain, node.method], depth: node.depth + 1 });
      }
    }
  }

  // 3. 分类映射到 API / MQ / Job
  return classifyImpact(index, changedMethods, impactMap);
}
```

### 6.3 单分析器输出示例（N=1，当前仅 JACG）

```
🔬 影响分析 — order-service (MR !1423)

📦 变更概要
   文件: 5 个  变更方法: 12 个  分析方式: 📐 全景索引 (0.3s)
   分析器: JACG ✓

🔗 受影响 API (3 个)
  🔴 POST /api/orders                     [深度: 2]
     OrderService.createOrder()
       → OrderController.createOrder()
  🟡 GET  /api/users/{id}                 [深度: 3]
     UserMapper.findById()
       → UserService.getUser()
         → UserController.getUser()

📨 受影响 MQ (1 个)
  🔴 payment.success (RabbitMQ)            [深度: 3]
     OrderService.createOrder()
       → OrderStatusHandler.handle()
         → PaymentListener.onPaid()
```

> 多分析器融合输出示例见「五、多分析器融合引擎 → 5.4 融合输出示例」。

---

## 七、业务场景桥接（不变） 🔜 规划中

与 v2 蓝图相同。TIA 不直接调用 Playwright MCP，由 Claude Code Host 代理协调：

```
Claude Code Host:
  1. TIA impact_analysis → 得到技术影响 (API/MQ/Job + 调用链)
  2. Playwright MCP → 获取业务场景树
  3. TIA test_recommendation (传入 技术影响 + 场景树) → 精准推荐
```

---

## 八、实施路线图

> **当前状态**: Phase 5b **未开始**。

```
🛑 Week 1-2: Phase 5b — 分析引擎集成 (暂停 — 引擎选型待定)
   已评估: JACG MCP Server (❌)、核心库子进程 (❌)、离线 JSON 生成器 (🔖待采用)
   当前可推进: call-chain/ (✅) + panorama-state/ (✅) 已就绪，等分析引擎填充
  ├─ 安装并运行 java-all-call-graph-server
  ├─ 确认 JACG MCP 工具签名（ListTools → 工具名+参数）
  ├─ 恢复 src/analyzer-registry/ 目录
  │   └─ adapters/jacg.ts 升级: analyzeFull() + analyze()
  ├─ 新增 src/impact-analysis/panorama-state.ts
  │   └─ getPanoramaPath() / getTiaMetaDir() / loadPanoramaIndex() / savePanoramaIndex()
  ├─ 新增 src/call-chain/types.ts + analyzer.ts
  │   └─ reverseImpactFromIndex() — 索引驱动 BFS
  ├─ 新增 src/impact-analysis/merge-engine.ts ★ 核心
🔜 Week X: Phase 3-4 — 下游消费者升级 (等引擎就绪后)
  ├─ test_recommendation: 输入从文件级升级为调用链级
  └─ risk_assessment: 风险评分引入调用链深度因子

🔜 Week X: 业务场景桥接 + 端到端验证 (等引擎就绪后)
  ├─ src/business-scenario/*
  └─ 全链路: clone → full → monitor → incremental → 场景映射 → 测试推荐
```

> ⚠️ 以上路线图依赖分析引擎就绪。当前引擎待定，见第十二章。

---

## 九、文件清单

### 当前实现状态（基于代码实际）

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/index.ts` | ✅ 存在 | MCP Server 入口 + Transport 双模 + 安全中间件 |
| `src/state.ts` | ✅ 存在 | 配置/状态读写、水位管理、resolveConfigPath 延迟求值 |
| `src/types.ts` | ✅ 存在 | 共享类型定义 |
| `src/security.ts` | ✅ 存在 | IP 白名单 + API KEY + getServerConfPath 延迟求值 |
| `src/paths.ts` | ✅ 存在 | resolveConfigPath + ensureEnterpriseDir + getProjectRoot |
| `src/generate-api-key.ts` | ✅ 存在 | API KEY 手动签发工具 |
| `src/shared/json-utils.ts` | ✅ 存在 | safeJsonLoad 统一实现 |
| `src/tools/index.ts` | ✅ 存在 | 路由分发 |
| `src/tools/schemas.ts` | ✅ 存在 | 6 个 Tool Schema + visibility 元数据 |
| `src/tools/helpers.ts` | ✅ 存在 | 适配器工厂 / 参数校验 |
| `src/tools/tia-init.ts` | ✅ 存在 | TIA-init 客户端初始化 |
| `src/tools/repo-monitor.ts` | ✅ 存在 | 仓库监控三合一 |
| `src/tools/repo-clone.ts` | ✅ 存在 | 代码克隆 |
| `src/impact-analysis/types.ts` | ✅ 存在 | ImpactRule / ImpactModule 等类型 |
| `src/impact-analysis/state.ts` | ✅ 存在 | impact-rules.conf.json 读写（走 resolveConfigPath） |
| `src/impact-analysis/analyzer.ts` | ✅ 存在 | glob 匹配引擎 + 置信度计算 |
| `src/impact-analysis/handler.ts` | ✅ 存在 | impact_analysis 工具（仅文件级 glob 匹配，无双模引擎） |
| `src/impact-analysis/recommendation.ts` | ✅ 存在 | 推荐引擎 |
| `src/impact-analysis/risk-scorer.ts` | ✅ 存在 | 风险评分引擎 |
| `src/impact-analysis/risk-handler.ts` | ✅ 存在 | risk_assessment 工具处理器 |
| `src/platforms/types.ts` | ✅ 存在 | PlatformAdapter 接口 |
| `src/platforms/github.ts` | ✅ 存在 | GitHub 适配器 |
| `src/platforms/generic.ts` | ✅ 存在 | Generic 适配器 |
| `src/platforms/local.ts` | ✅ 存在 | Local 适配器 |
| `src/tests/state.test.ts` | ✅ 存在 | 状态管理测试 |
| `src/tests/security.test.ts` | ✅ 存在 | 安全测试 |
| `src/tests/schemas.test.ts` | ✅ 存在 | Schema 测试 |
| `src/tests/impact-analysis.test.ts` | ✅ 存在 | 影响分析测试 |
| `src/tests/recommendation.test.ts` | ✅ 存在 | 推荐测试 |
| `src/tests/risk-assessment.test.ts` | ✅ 存在 | 风险评估测试 |
| `enterprise/` | ✅ 存在 | 企业配置目录 |
| `examples/` | ✅ 存在 | 配置模板 |
| `scripts/` | ✅ 存在 | 工具脚本 |
| `.githooks/` | ✅ 存在 | pre-commit + pre-push |
| `.github/workflows/` | ✅ 存在 | CI 安全扫描 |

### ❌ 已删除/不存在

| 文件 | 说明 |
|------|------|
| `src/analyzer-registry/types.ts` | Phase 5a 产物，已删除。Phase 5b 时恢复 |
| `src/analyzer-registry/state.ts` | Phase 5a 产物，已删除 |
| `src/analyzer-registry/registry.ts` | Phase 5a 产物，已删除 |
| `src/analyzer-registry/adapters/jacg.ts` | Phase 5a 产物，已删除 |
| `src/tests/analyzer-registry.test.ts` | 对应测试，已删除 |
| `analyzers.conf.json` | 分析器配置文件，已删除 |
| `src/call-chain/` | 从未创建（v2/v3 蓝图规划，未实现） |
| `src/impact-analysis/panorama-state.ts` | v3 蓝图规划，未创建 |
| `src/impact-analysis/merge-engine.ts` | v3 蓝图规划，未创建 |
| `src/business-scenario/` | v2 蓝图规划，从未实现 |

### 🔜 Phase 5b 规划新增+修改

| 操作 | 文件 | 说明 |
|------|------|------|
| 恢复 | `src/analyzer-registry/` | 恢复 types.ts / state.ts / registry.ts |
| 新增 | `src/analyzer-registry/adapters/jacg.ts` | 升级：analyzeFull() + analyze() |
| 新增 | `src/call-chain/types.ts` | CallChainImpact / CallChainPath / PanoramaIndex |
| 新增 | `src/call-chain/analyzer.ts` | 逆向 BFS：reverseImpactFromIndex() |
| 新增 | `src/impact-analysis/panorama-state.ts` | .tia/{branch}/panorama-*.json 读写 |
| 新增 | `src/impact-analysis/merge-engine.ts` | 融合引擎：去重+合并+加权仲裁 |
| 修改 | `src/impact-analysis/types.ts` | 新增 PanoramaIndex / MergeResult 等类型 |
| 修改 | `src/impact-analysis/handler.ts` | 多分析器并行路由 |
| 修改 | `src/tools/schemas.ts` | impact_analysis Schema 升级双模 |
| 新增 | `src/tests/call-chain.test.ts` | BFS + 索引读写测试 |
| 新增 | `src/tests/merge-engine.test.ts` | 融合引擎测试 |
| 恢复 | `analyzers.conf.json` | 分析器配置（当前为 examples/ 模板）

### 与 v2 的差异

| v2 (废弃) | v3 替代 |
|-----------|--------|
| `src/code-panorama/*` (12 files) | ❌ 从未创建 — 外部分析器(JACG)替代 |
| `npm i tree-sitter tree-sitter-java` | ❌ 不需要 |
| code_panorama 新 MCP 工具 | ❌ 不新增 — 合并到 impact_analysis |
| 自建调用图为主 + JACG 增强 | → 外部分析器为主，TIA 融合多源（规划中） |

### MCP 工具总量

```
当前 6 工具 → 未来 6 工具 (零新增)
├─ TIA-init         → 不变
├─ repo_monitor     → 不变
├─ repo_clone       → 不变
├─ impact_analysis  → 当前: 文件级 glob 匹配
│              未来: 升级 v3（full / incremental / rebuild）
│                    内部: N 分析器并行 → 融合 → 统一报告
├─ test_recommendation → 不变
└─ risk_assessment     → 不变
```

---

## 十、风险与缓解

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| JACG 全量分析大仓库耗时长 | 中 | full 是一次性离线操作；rebuild 做增量更新 |
| JACG MCP 工具签名变化 | 中 | ListTools 动态发现 + JacgAdapter 封装隔离 |
| 部分分析器不可用 | 高 | N 路并行 + 单路失败不影响其他；全部不可用则降级glob |
| 多分析器结果冲突 | 中 | 加权仲裁（confidenceWeight）+ 交叉验证奖励 |
| 索引文件过大 | 低 | 10万方法 ≈ 15MB；按分支+分析器分文件；`.tia/` 独立目录可随时清理重建 |
| 分析器数量增长导致延迟 | 低 | 并行调用 + 全景索引缓存；N≤5 时延迟可接受 |
| 企业敏感信息泄露到 GitHub | ~~高~~ 低 | ✅ 已通过第十一章信息安全分层架构缓解：enterprise/ 隔离 + .gitignore 加固 + pre-commit hook + 文档脱敏（已全部实现） |

---

## 十二、分析引擎选型附录

> **本章记录已评估过的分析引擎方案，供未来重新决策时参考。**

### 12.1 方案 A：MCP Server 编织（java-all-call-graph-server）

| 维度 | 内容 |
|------|------|
| **标签** | ❌ 已毙 |
| **思路** | 通过 MCP 协议调用 `java-all-call-graph-server`，TIA 作为编织层委托给下游分析器 |
| **毙掉原因** | JACG MCP Server 不靠谱——启动复杂（JDK + Gradle 构建 + Spring Boot 服务）、/health 端点不存在导致可用性检测误判、实际运行后频繁连不上。零代码启动的 MCP 理想没有实现 |
| **参考文档** | 已删除的 `docs/adr/0001-analyzer-integration-pattern.md`、`phase5a-jacg-integration.md` |

---

### 12.2 方案 B：子进程调用核心库（java-all-call-graph）

| 维度 | 内容 |
|------|------|
| **标签** | ❌ 已毙 |
| **思路** | 通过 `execFile("java", ["-jar", "jacg.jar"])` 子进程调用 JACG 核心库 |
| **毙掉原因** | JACG 设计目标是"把 Java 代码结构化到数据库"，而非轻量 CLI。核心问题：1) 需要编译后的 jar/class 作为输入（TIA 只能拿到源码）；2) 输出写 MySQL/H2 数据库，非 JSON；3) 非标准 CLI 接口，靠 `.bat/.sh` 脚本驱动 |
| **调研日期** | 2026-06-15 |

---

### 12.3 方案 C：离线 JSON 生成器 + H2 持久化  🔖 待采用

| 维度 | 内容 |
|------|------|
| **标签** | 🔖 **待采用**（方案可靠但实施太重，暂时搁置） |
| **设计日期** | 2026-06-15，由 `ecc:code-architect` 完成架构设计 |
| **核心思路** | JACG 负责离线全量分析（H2 → 150 行 Java 桥接层 → stdout JSON），TIA 负责在线消费（加载 `.tia/main/panorama-jacg.json.gz` → BFS → 输出） |

#### 架构全貌

```
离线（一次性全量）                                  在线（每次MR）
┌──────────────────────┐                    ┌──────────────────────────┐
│  JACG 全量分析        │                    │  TIA 消费全景索引         │
│  java -jar jacg.jar  │                    │                          │
│       ↓              │                    │  loadPanoramaIndex()     │
│  H2 数据库文件        │                    │       ↓                  │
│       ↓              │                    │  逆向 BFS               │
│  JacgExporter.java   │     stdout JSON    │       ↓                  │
│  (150行 JDBC→JSON)   │ ──────────────────→│  受影响 API/MQ/Job       │
│                      │   落盘 .tia/main/   │                          │
└──────────────────────┘                    └──────────────────────────┘
```

#### 7 项核心决策

| # | 决策 | 理由 |
|:--:|------|------|
| 1 | **薄 Java 桥接层** `JacgExporter.java`，而非 Node.js 直读 H2 | H2 是 Java 原生二进制格式，无可靠 Node.js 驱动 |
| 2 | **扩展 impact_analysis**，不新增 MCP 工具 | 遵循克制原则 |
| 3 | **保留现有 glob 匹配**作降级兜底 | 全景索引不存在时自动 fallback |
| 4 | JACG 输入需要编译产物（`mvn compile`） | ASM 字节码分析，TIA 需先触发编译 |
| 5 | **新增 `jacg.conf.json`**，不污染 `monitors.conf.json` | 配置分离 |
| 6 | 从 H2 的 `method_call` + `method_call_info` 表 JOIN 出调用图 | JACG 核心输出表 |
| 7 | **Gzip JSON 存储** `.json.gz` | 10 万方法 ≈ 100MB 原始 JSON，压缩 5-10x |

#### 新增文件清单

| 优先级 | 文件 | 用途 |
|:--:|------|------|
| P0 | `src/call-chain/types.ts` | PanoramaIndex 类型（✅ 已实现） |
| P0 | `src/call-chain/bfs-analyzer.ts` | `reverseImpactFromIndex()`（✅ 已实现） |
| P0 | `src/impact-analysis/panorama-state.ts` | `.tia/` 下索引读写（✅ 已实现，需加 gzip） |
| P1 | `src/jacg/types.ts` | JacgConfig 类型 |
| P1 | `src/jacg/config.ts` | `jacg.conf.json` 加载/种子 |
| P1 | `src/jacg/runner.ts` | 子进程编排：编译→JACG→导出→落盘 |
| P1 | `src/jacg/verifier.ts` | JDK/JACG jar 环境预检 |
| P1 | `jacg-bridge/JacgExporter.java` | **150 行 Java 桥接**：H2 JDBC→JSON stdout |
| P1 | `examples/jacg.conf.example.json` | 配置模板 |
| P2 | `jacg-bridge/compile.bat` / `.sh` | 桥接层编译 |
| P2 | `src/tests/call-chain.test.ts` | BFS 单元测试 |

#### 修改文件清单

| 文件 | 变更 |
|------|------|
| `src/tools/schemas.ts` | `impact_analysis` 新增 `action` 参数 (full/incremental/rebuild) |
| `src/impact-analysis/handler.ts` | action 分发：full→JACG→落盘 / incremental→BFS / glob 降级 |
| `src/index.ts` | 启动时 `ensureJacgConfig()` |

#### 搁置原因

| 原因 | 说明 |
|------|------|
| **引入 Java 栈依赖** | JDK + JACG jar + 桥接层编译，TIA 从纯 TS 项目变成 TS+Java 混合部署 |
| **全量分析前置成本** | 每次新仓库都要跑一遍 `mvn compile` + JACG 全量分析（大仓库 10-30 分钟） |
| **桥接层维护** | 150 行 Java 虽小，但跨语言调试、跨平台编译、JACG 版本升级都需要多维护一份代码 |
| **用户环境要求** | 需要本机同时有 Node.js + JDK + Maven/Gradle，门槛偏高 |

#### 恢复条件

满足以下条件之一即可重启此方案：
- TIA 已稳定，有真实用户愿意接受 30 分钟全量分析的前置代价
- java-all-call-graph 官方提供了原生 JSON 输出（不再需要桥接层）
- 有预算在 Server 端 CI 环境预先全量分析，客户端只消费产出

---

**设计日期**: 2026-06-14 | **实施日期**: 2026-06-14  
**背景**: 项目开源在 GitHub，开发者在家庭办公网络直接推送代码。未来可能在企业内部网络继续开发，企业有严格的信息安全制度——所有企业相关配置（代码仓地址、分支信息、业务模块名、项目文档等）一律不得传出内部网络。  
**核心目标**: 通过目录隔离 + .gitignore 加固 + 模板化策略，将项目严格分为"源码层"和"企业配置层"，杜绝企业敏感信息提交到远端 GitHub 仓库。  
**实现状态**: 全部代码改造、文件创建、文档脱敏已完成。

### 11.0 敏感信息审计摘要

> 完整审计报告见 2026-06-14 代码审查（`code-review-2026-06-14.md`）。

| 风险级别 | 典型信息 | 出现位置 |
|----------|---------|---------|
| 🔴 红色（企业敏感） | `codehub.huawei.com`、员工工号 `l30026134`、Windows 绝对路径、内部项目名 `myproject` | `monitors.conf.json`、`server.conf.json`、CLAUDE.md、多处 README、`.mcp.json` |
| 🟡 黄色（建议清理） | GitHub 用户名 `WayneLiu519888`、`myteam/backend.git` 占位示例 | `monitors.conf.json`、CLAUDE.md |
| 🟢 绿色（安全可提交） | `impact-rules.conf.json`（纯示例规则）、`.opencode.json`（已用 `${PROJECT_ROOT}` 占位） | 根目录 |

### 11.1 分层架构总览

```
┌─────────────────────────────────────────────┐
│  GitHub 开源仓库（源码层 — 可安全提交）        │
│                                             │
│  src/           ← 核心源码                   │
│  docs/          ← 文档（已脱敏）              │
│  examples/      ← 🆕 配置模板（.example）     │
│  scripts/       ← 🆕 工具脚本                 │
│  .githooks/     ← 🆕 Git Hooks              │
│  README.md 系列  ← 项目说明（已脱敏）          │
│  CLAUDE.md      ← 项目指导（已脱敏）           │
│                                             │
├─────────────────────────────────────────────┤
│  enterprise/    ← 🔒 企业配置层（.gitignore） │
│                                             │
│  monitors.conf.json   ← 真实仓库监控配置      │
│  server.conf.json     ← 真实 HTTP 安全配置    │
│  .mcp.json            ← 真实 MCP 连接配置     │
│                                             │
│  ⚠️ 整个目录被 .gitignore 排除，永不提交      │
└─────────────────────────────────────────────┘
```

### 11.2 新目录结构

```
项目根目录/
│
├── 📦 源码层（提交到 GitHub）
│   ├── src/                          # 核心源码
│   │   ├── index.ts                  # 入口（启动时调 ensureEnterpriseDir）
│   │   ├── state.ts                  # 状态管理（新增 resolveConfigPath）
│   │   ├── paths.ts                  # 路径定位（新增 ensureEnterpriseDir）
│   │   ├── security.ts               # 安全（server.conf 路径改用 resolveConfigPath）
│   │   ├── tools/
│   │   │   ├── index.ts              # 路由分发
│   │   │   ├── tia-init.ts           # TIA-init（模板路径改为 examples/）
│   │   │   └── ...
│   │   ├── impact-analysis/
│   │   ├── platforms/
│   │   └── tests/                    # 测试（敏感测试数据替换为通用占位符）
│   │
│   ├── docs/                         # 文档（已脱敏）
│   │   ├── Test-Impact-Analysis-mcp用户指南.md
│   │   ├── adr/
│   │   ├── zh-TW/
│   │   └── ja-JP/
│   │
│   ├── examples/                     # 🆕 配置模板目录
│   │   ├── monitors.conf.example.json
│   │   ├── server.conf.example.json
│   │   └── .mcp.example.json
│   │
│   ├── scripts/                      # 🆕 工具脚本
│   │   └── check-sensitive-data.sh   # 敏感信息自查脚本
│   │
│   ├── .githooks/                    # 🆕 Git Hooks
│   │   └── pre-commit                # 提交前安全检查
│   │
│   ├── README.md                     # 入口页
│   ├── README.zh-CN.md               # 中文完整文档
│   ├── README.en.md                  # 英文完整文档
│   ├── CLAUDE.md                     # 项目指导
│   ├── .claude/commands/             # CC 命令
│   ├── .opencode/commands/           # OpenCode 命令
│   ├── .codex/skills/               # Codex 技能
│   ├── .codex/config.toml            # Codex 配置
│   ├── .gitignore                    # 🆕 加固版
│   └── package.json                  # 新增 prepare 脚本
│
├── 🔒 企业配置层（.gitignore 排除，永不提交）
│   └── enterprise/                   # 🆕
│       ├── .gitkeep                  # 保持目录结构
│       ├── monitors.conf.json        # 真实仓库监控配置
│       ├── server.conf.json          # 真实 HTTP 安全配置
│       └── .mcp.json                 # 真实 MCP 连接配置
│
└── 🚫 运行时产物（.gitignore 排除）
    └── monitors.json                 # 程序维护的水位状态
```

### 11.3 配置分层策略

| 文件 | 归属层 | 处理方式 | .gitignore |
|------|--------|----------|------------|
| `monitors.conf.json` | 🔒 企业层 | 放 `enterprise/`，提供 `examples/monitors.conf.example.json` 模板 | ✅ |
| `server.conf.json` | 🔒 企业层 | 放 `enterprise/`，提供 `examples/server.conf.example.json` 模板 | ✅ |
| `.mcp.json` | 🔒 企业层 | 放 `enterprise/`，提供 `examples/.mcp.example.json` | ✅ |
| `monitors.json` | 🚫 运行时 | 已在 .gitignore，需 `git rm --cached` | ✅ |
| `.claude/settings.local.json` | 🔒 企业层 | 加入 .gitignore | ✅ |
| `impact-rules.conf.json` | 📦 源码层 | 仅含示例规则，可安全提交 | ❌ |
| `.opencode.json` | 📦 源码层 | 已用 `${PROJECT_ROOT}` 占位，安全 | ❌ |
| `.codex/config.toml` | 📦 源码层 | 已用 `${PROJECT_ROOT}` 占位，安全 | ❌ |

### 11.4 .gitignore 完整规则

```gitignore
# === 依赖 ===
node_modules/

# === 企业配置层（核心安全 — 双重保险） ===
enterprise/

# === 本地敏感配置（防止未放 enterprise/ 直接放根目录） ===
server.conf.json
monitors.conf.json
.mcp.json
.claude/settings.local.json

# === 运行时状态 ===
monitors.json

# === 克隆的第三方仓库 ===
Repository/

# === IDE 和编辑器 ===
.vscode/
.idea/
*.swp
*.swo

# === 系统文件 ===
.DS_Store
Thumbs.db

# === 环境变量 ===
.env
.env.local
```

> **双重保险设计**：`enterprise/` 整体排除 + 根目录下敏感文件单独排除。即使开发者忘记将配置放入 `enterprise/` 而直接放根目录，也会被 .gitignore 拦截。

### 11.5 模板化清单

#### `examples/monitors.conf.example.json`

```jsonc
{
  "_comment": "复制此文件到 enterprise/monitors.conf.json 并填入真实配置",
  "baseDir": ".",
  "repositories": [
    {
      "name": "example-backend",
      "url": "git@<YOUR-GIT-HOST>:<YOUR-ORG>/backend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "backend",
      "module": "示例模块"
    },
    {
      "name": "example-generic",
      "url": "git@<YOUR-GIT-HOST>:<YOUR-PROJECT>/example-service.git",
      "platform": "generic",
      "branch": "develop",
      "repoType": "backend",
      "module": "示例模块",
      "genericConfig": {
        "apiBase": "https://<YOUR-GIT-HOST>",
        "apiTemplate": "/api/v1/projects/{owner}/repos/{repo}/commits?ref={branch}",
        "mrApiTemplate": "/api/v1/projects/{owner}/repos/{repo}/merge_requests?state=merged&target_branch={branch}&order_by=created_at&sort=asc"
      }
    }
  ]
}
```

#### `examples/server.conf.example.json`

```jsonc
{
  "_comment": "复制此文件到 enterprise/server.conf.json 并填入真实配置",
  "host": "127.0.0.1",
  "port": 3100,
  "allowedIps": ["127.0.0.1"],
  "allowedOrigins": [],
  "contactInfo": "<YOUR-CONTACT-ID>",
  "apiKeys": []
}
```

#### `examples/.mcp.example.json`

```jsonc
{
  "_comment": "复制此文件到 enterprise/.mcp.json",
  "mcpServers": {
    "test-impact-analysis": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"]
    }
  }
}
```

### 11.6 代码改造点

#### 核心改造：`src/state.ts` — 新增 `resolveConfigPath()`

```
查找配置文件的优先级（多级 fallback）：
  1. enterprise/{filename}          ← 企业配置（优先）
  2. {filename}                      ← 根目录（fallback，兼容旧版）
  3. examples/{filename}.example     ← 模板（首次初始化提示）
```

```typescript
// src/state.ts 新增函数

import { ensureEnterpriseDir } from "./paths.js";

/**
 * 解析配置文件路径，支持多级 fallback。
 * 
 * 优先级: enterprise/ > 根目录 > examples/ 模板
 */
export function resolveConfigPath(filename: string): string {
  const root = getProjectRoot();
  const enterprisePath = join(root, "enterprise", filename);
  const rootPath = join(root, filename);

  // 1. 企业配置目录优先
  if (fs.existsSync(enterprisePath)) return enterprisePath;

  // 2. 根目录 fallback（向后兼容，打印迁移提示）
  if (fs.existsSync(rootPath)) {
    console.warn(`⚠️  ${filename} 在根目录已弃用，请移动到 enterprise/ 目录`);
    return rootPath;
  }

  // 3. 从模板创建
  const examplePath = join(root, "examples", filename + ".example");
  if (fs.existsSync(examplePath)) {
    ensureEnterpriseDir();
    fs.copyFileSync(examplePath, enterprisePath);
    console.log(`📋 已从模板创建 enterprise/${filename}，请编辑后重新运行`);
    return enterprisePath;
  }

  throw new Error(`找不到配置文件: ${filename}（请在 enterprise/ 或根目录提供，或检查 examples/ 模板）`);
}
```

#### `src/paths.ts` — 新增 `ensureEnterpriseDir()`

```typescript
/** 确保 enterprise/ 目录存在 */
export function ensureEnterpriseDir(): void {
  const dir = path.join(getProjectRoot(), "enterprise");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, ".gitkeep"), "");
  }
}
```

#### 受影响文件清单

| 文件 | 改动内容 | 改动量 |
|------|---------|--------|
| `src/state.ts` | 新增 `resolveConfigPath()`；所有配置读取路径改用此函数 | 中 |
| `src/paths.ts` | 新增 `ensureEnterpriseDir()` | 小 |
| `src/security.ts` | `server.conf.json` 读取路径改为 `resolveConfigPath()` | 小 |
| `src/index.ts` | 启动时调用 `ensureEnterpriseDir()` | 1行 |
| `src/tools/tia-init.ts` | 模板文件路径从根目录改为 `examples/` | 小 |
| `src/tests/state.test.ts` | 测试数据中 `codehub.huawei.com:myproject` → `git.example.com:demo/project.git` | 小 |
| `package.json` | 新增 `"prepare": "git config core.hooksPath .githooks"` | 1行 |

### 11.7 文档脱敏清单

| 文件 | 位置 | 当前内容 | 替换为 |
|------|------|---------|--------|
| `CLAUDE.md` | L427-433 | `codehub.huawei.com` + `myproject/order-service` | `<YOUR-GIT-HOST>` + `<YOUR-ORG>/example-project` |
| `README.zh-CN.md` | L502-508 | 同上 | 同上 |
| `README.en.md` | L482-488 | 同上 | 同上 |
| `docs/Test-Impact-Analysis-mcp用户指南.md` | L692 | `"contactInfo": "l30026134"` | `"contactInfo": "<YOUR-CONTACT-ID>"` |
| `docs/zh-TW/README.md` | L123 | `myteam/backend` | `<YOUR-ORG>/example-backend` |
| `docs/ja-JP/README.md` | L123 | `myteam/backend` | 同上 |
| `.claude/commands/repo_add.md` | L64 | `codehub.huawei.com:team/api.git` | `<YOUR-GIT-HOST>:<YOUR-ORG>/example.git` |
| `src/tests/state.test.ts` | L31 | `codehub.huawei.com:myproject` | `git.example.com:demo/project.git` |

### 11.8 保障机制

#### 11.8.1 Pre-commit Hook（`.githooks/pre-commit`）

```bash
#!/bin/bash
# TIA 信息安全 pre-commit 检查
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
echo "[TIA-SEC] 正在检查提交内容..."

VIOLATIONS=0

# 规则1: enterprise/ 目录绝不允许被跟踪
if git diff --cached --name-only | grep -q "^enterprise/"; then
  echo -e "${RED}[TIA-SEC] ❌ 禁止提交 enterprise/ 目录${NC}"
  VIOLATIONS=1
fi

# 规则2: 禁止真实工号模式 (l + 8位数字)
if git diff --cached -G "l[0-9]{8}" --name-only | grep -q .; then
  echo -e "${RED}[TIA-SEC] ❌ 疑似员工工号，请替换为 <YOUR-CONTACT-ID>${NC}"
  VIOLATIONS=1
fi

# 规则3: 禁止企业内部域名
if git diff --cached -G "codehub\.huawei\.com" --name-only | grep -q .; then
  echo -e "${RED}[TIA-SEC] ❌ 企业域名，请替换为 <YOUR-GIT-HOST> 或放入 enterprise/${NC}"
  VIOLATIONS=1
fi

# 规则4: 禁止 Windows 绝对路径
if git diff --cached -G "[A-Za-z]:/(Users|Program|Workspace|Wayne)" --name-only | grep -q .; then
  echo -e "${RED}[TIA-SEC] ❌ Windows 绝对路径，请使用相对路径或 ${PROJECT_ROOT}${NC}"
  VIOLATIONS=1
fi

# 规则5: 禁止 monitors.conf.json 出现在根目录
if git diff --cached --name-only | grep -q "^monitors.conf.json$"; then
  echo -e "${RED}[TIA-SEC] ❌ 请将 monitors.conf.json 放在 enterprise/ 目录${NC}"
  VIOLATIONS=1
fi

if [ $VIOLATIONS -eq 0 ]; then
  echo -e "${GREEN}[TIA-SEC] ✅ 检查通过${NC}"
  exit 0
else
  echo -e "${RED}[TIA-SEC] ❌ 提交被阻止，请修复以上问题${NC}"
  exit 1
fi
```

#### 11.8.2 敏感信息自查脚本（`scripts/check-sensitive-data.sh`）

```bash
#!/bin/bash
# 全仓库敏感信息扫描（脱离 pre-commit，可手动执行或 CI 调用）
echo "=== TIA 敏感信息自查 ==="

PATTERNS=(
  "codehub\.huawei\.com"
  "WayneLiu"
  "l[0-9]{8}"
  "[A-Za-z]:/(Users|Program|Workspace|Wayne)[^'\"]*\.json"
)

for pattern in "${PATTERNS[@]}"; do
  matches=$(git grep -n "$pattern" -- ':!enterprise/' ':!scripts/' ':!node_modules/' ':!.git/' 2>/dev/null || true)
  if [ -n "$matches" ]; then
    echo "⚠️  发现疑似敏感信息: $pattern"
    echo "$matches"
    echo "---"
  fi
done

echo "=== 自查完成 ==="
```

#### 11.8.3 CI 检查（GitHub Actions — 可选）

```yaml
# .github/workflows/security-check.yml
name: Security Check
on: [push, pull_request]
jobs:
  sensitive-data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: 检查敏感信息
        run: bash scripts/check-sensitive-data.sh
```

### 11.9 双环境工作流

```
【家庭办公 → GitHub】
  $ git clone git@github.com:xxx/TIA.git
  $ cd TIA
  $ cp examples/monitors.conf.example.json enterprise/monitors.conf.json
  $ vim enterprise/monitors.conf.json     # 填入个人 GitHub 仓库
  $ npm install && npm start
  $ git add . && git commit && git push   # pre-commit 自动检查 → enterprise/ 被 .gitignore 拦截 ✅

【企业内部 → 内网 GitLab / CodeHub】
  $ git clone git@codehub.internal.com:xxx/TIA.git
  $ cd TIA
  $ cp examples/monitors.conf.example.json enterprise/monitors.conf.json
  $ vim enterprise/monitors.conf.json     # 填入企业内部仓库（CodeHub地址、内部项目名等）
  $ npm install && npm start
  $ git add . && git commit && git push   # enterprise/ 自动被 .gitignore 拦截 ✅
                                           # pre-commit 检查通过 — 源码层不含企业信息 ✅
```

> **关键保障**：无论哪种环境，`enterprise/` 目录永不被提交。企业配置只存在于开发者本地，不会泄漏到任何远端仓库。

### 11.10 开发者日常操作决策树

```
开始编码
  │
  ├─ 我在家 → 确保 enterprise/monitors.conf.json 是家庭配置
  │           修改代码 → git add → pre-commit 自动检查 → git push
  │
  └─ 我在公司 → 确保 enterprise/monitors.conf.json 是企业配置
                 修改代码 → git add → pre-commit 自动检查 → git push

新增监控仓库：
  ├─ 仓库是公开 GitHub 项目 → 编辑 enterprise/monitors.conf.json 即可 ✓
  └─ 仓库是企业内部项目 → 编辑 enterprise/monitors.conf.json（不进 git，安全）✓

新增文档/代码：
  ├─ 需要示例 → 使用 <YOUR-GIT-HOST> / <YOUR-CONTACT-ID> 等通用占位符
  └─ 需要真实企业数据 → 放在 enterprise/ 目录下

不小心 git add 了敏感文件：
  git reset enterprise/
  （pre-commit hook 会拦截，.gitignore 也会阻止）

首次克隆后：
  npm install          → 自动执行 prepare 脚本 → git config core.hooksPath .githooks
  首次启动 npm start   → ensureEnterpriseDir() → 自动创建 enterprise/ + 从模板复制配置文件
```

### 11.11 实施计划（全部已完成）

| Phase | 内容 | 改动量 | 依赖 | 验证方式 | 状态 |
|-------|------|--------|------|---------|------|
| **Phase 0** 🔴 | **Git 历史清理**：`git rm --cached` 敏感文件（monitors.conf.json、server.conf.json、monitors.json）+ 历史重写 | 危险操作 | 无 | `git grep` 确认无敏感数据残留 | ✅ |
| **Phase 1** | **目录结构**：创建 `enterprise/`、`examples/`、`scripts/`、`.githooks/` 目录；加固 `.gitignore` | 新建 4 目录 + 改 1 文件 | Phase 0 | `git status` 无 enterprise/ | ✅ |
| **Phase 2** | **模板创建**：编写所有 `.example` 模板文件 | 新建 3-4 个模板 | Phase 1 | JSON 可解析 + 无敏感词 | ✅ |
| **Phase 3** | **代码改造**：`src/state.ts` 新增 `resolveConfigPath()`，所有配置读取路径改用此函数 | 改 6-7 个源文件 | Phase 1 | `npm start` 正常启动 | ✅ |
| **Phase 4** | **文档脱敏**：清理所有文档中的企业敏感信息 | 改 8+ 个文档文件 | Phase 2 | `git grep` 无敏感词 | ✅ |
| **Phase 5** | **保障机制**：pre-commit hook + 自查脚本 + CI workflow | 新建 3 个文件 | Phase 1 | 故意添加敏感文件 → hook 拦截 | ✅ |
| **Phase 6** | **验证**：`npm test` + `tsc --noEmit` + 双环境模拟测试 | 验证报告 | Phase 3+4 | 全绿 | ✅ |

### 11.12 安全风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|:--:|---------|
| **Git 历史泄露**：敏感信息曾提交，即使删除文件仍可从历史恢复 | ~~🔴 高~~ ✅ 已缓解 | 执行了 Phase 0 清理操作；后续 pre-commit + .gitignore 阻止再次提交 |
| **配置文件丢失**：用户误删 `enterprise/` 目录 | 🟡 中 | `ensureEnterpriseDir()` 启动时自动重建目录；`.example` 模板在 `examples/` 中始终存在；但数据无法恢复需自行备份 |
| **双环境配置同步**：家和公司之间配置文件需手动同步 | 🟢 低 | 维护两套配置文件（`monitors.conf.home.json` / `monitors.conf.company.json`）；未来可考虑加密备份方案 |
| **开源用户首次体验**：空白 `enterprise/` 目录让新手困惑 | 🟢 低 | `resolveConfigPath()` 自动从 `examples/` 复制模板，启动时打印清晰的编辑指引 |
| **开发者绕过 pre-commit**：`git commit --no-verify` | 🟡 中 | .gitignore 为最后防线（enterprise/ 无论如何不会被 add）；CI 自查脚本做兜底扫描 |

---

## 十三、分析引擎候选工具评估

> **评估日期**: 2026-06-15 | **数据来源**: GitHub API + npm Registry + WebSearch  
> **评估 Agent**: Explore Agent

### 13.1 推荐组合策略

TIA 需要覆盖 **Java 后端**（方法级调用链 + 框架注解感知）和 **JS/TS 前端**（方法级调用链）。采用**分层组合**：

```
第一层（快速路径 — 秒级）:
  TS/JS → dependency-cruiser (模块级 JSON, npx 即用)
  Java  → jdeps (类级, JDK 内置零安装)
  
第二层（精确路径 — 分钟级）:
  TS/JS → TypeScript-Call-Graph (函数级调用图)
  Java  → java-callgraph (方法级调用图, java -jar)
         + 自建注解扫描器 (抽取 Spring 端点)

第三层（自研兜底 — 按需）:
  Java: ASM bytecode visitor + ts-morph AST traversal
```

### 13.2 详细评估（14 个候选工具）

#### 🟢 强烈推荐

| # | 工具 | 类型 | CLI | JSON | 调用链 | Stars | 一句话 |
|:--:|------|------|:--:|:--:|:--:|:--:|------|
| 1 | **java-callgraph** (gousiosg) | Java | ✅ `java -jar` | ⚠️ 规整文本 | 方法级 | 845 | 零依赖 standalone JAR，完美适配 execFile |
| 2 | **dependency-cruiser** | JS/TS | ✅ `npx depcruise` | ✅ 原生JSON | 文件/模块级 | 6.8k | 活跃维护 (2026.05)，社区认可度最高 |
| 3 | **TypeScript-Call-Graph** | TS | ✅ `tcg src/` | ❌ DOT/HTML | 函数级 | 286 | 唯一专注 TS 函数级调用图的 CLI |
| 4 | **code2flow** | 跨语言 | ✅ `code2flow` | ❌ DOT | 函数级 | 4.6k | 支持上下游深度控制 |

#### 🟡 可考虑

| # | 工具 | 类型 | CLI | 调用链 | Stars | 亮点/短板 |
|:--:|------|------|:--:|:--:|:--:|------|
| 5 | **custom-bytecode-analyzer** | Java | ✅ | 方法级 | 74 | JSON规则可匹配注解；输出DOT非JSON |
| 6 | **Soot/SootUp** | Java | ⚠️ fat jar | 方法级(CHA/RTA/SPARK) | 3.1k/795 | 学术级精度；需自写分析插件 |
| 7 | **ENRE-ts** | TS | ✅ | 实体级 | 15 | 原生JSON；社区极小 |
| 8 | **jdeps** | Java(JDK内置) | ✅ | 类级 | N/A | 零安装；仅类级不够精细 |
| 9 | **madge** | JS/TS | ✅ | 模块级 | 10.1k | npm即用；不到方法级 |

#### 🔴 不推荐（太重/不匹配/不可靠）

| # | 工具 | 毙掉原因 |
|:--:|------|---------|
| 10 | WALA | IBM 纯库形态，无 CLI，无 JSON 输出 |
| 11 | SPOON | 纯 Java API，无 CLI，无内置调用图生成 |
| 12 | Doop | 学术工具，依赖 Datalog 引擎 |
| 13 | fta | 代码复杂度分析，非调用图 |
| 14 | static-analysis-part1 | 0 stars 学生项目 |

### 13.3 第一优先级集成路径

```
Phase 2a-1: dependency-cruiser (TS项目快速路径)
  → npx depcruise src --output-type json
  → 解析 JSON → PanoramaIndex (文件级)
  → 时间: 1天

Phase 2a-2: java-callgraph (Java项目精确路径)
  → git clone https://github.com/gousiosg/java-callgraph
  → mvn package -DskipTests → javacg-static.jar
  → java -jar javacg-static.jar target/classes/
  → 解析文本输出 → PanoramaIndex (方法级)
  → 时间: 2天
```

---

## 十四、多分析引擎可插拔框架

> **设计日期**: 2026-06-15 | **设计 Agent**: ecc:architect  
> **核心命题**: TIA 架构必须支持未来配置多个分析引擎并行工作 — 去重、汇总、仲裁、统一报告

### 14.1 三层架构

```
┌──────────────────────────────────────────────────────────┐
│  handler 层: 只管"串"和"降"                               │
│  analyzeWithEngines() — 串联引擎 + 降级到 glob            │
└────────────────────────┬─────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────┐
│  聚合层 (Aggregation): 只管"合"和"判"                    │
│  ├─ 去重 (按方法FQN)        ├─ 冲突仲裁                    │
│  ├─ 调用链合并 (A→B + A→C)  ├─ 差异补全 (标注来源)        │
│  └─ 置信度加权 (weight/50)  └─ 降级融合                    │
└────────────────────────┬─────────────────────────────────┘
                         ▼
┌──────────────────────────────────────────────────────────┐
│  引擎抽象层 (Engines): 只管"跑"和"收"                    │
│  AnalysisEngine 接口 → exec/mcp/http 三种 Runner          │
│  每个引擎输出 → PanoramaIndex → .tia/{branch}/panorama-{id}.json │
└──────────────────────────────────────────────────────────┘
```

### 14.2 AnalysisEngine 接口

```typescript
// src/engines/types.ts

export interface AnalysisEngine {
  readonly id: string;
  readonly name: string;
  /** 声明支持的能力 */
  readonly capabilities: EngineCapabilities;
  /** 可信度权重 0-100，用于多引擎加权仲裁 */
  readonly confidenceWeight: number;

  /** 全量分析：生成完整 PanoramaIndex */
  runFullAnalysis(repoPath: string, branch: string): Promise<PanoramaIndex>;

  /** 增量分析：基于已有索引更新（可选） */
  runIncrementalAnalysis?(
    repoPath: string, branch: string, baseIndex: PanoramaIndex,
    changedFiles: string[]
  ): Promise<PanoramaIndex>;

  /** 可用性检测（惰性调用） */
  checkAvailability(): Promise<string | null>;
}

export interface EngineCapabilities {
  /** 支持的文件扩展名 */
  fileExtensions: string[];
  /** 支持的分析模式 */
  modes: ("full" | "incremental")[];
  /** 分析粒度 */
  granularity: "method" | "class" | "file" | "module";
  /** 是否具备框架感知（Spring 注解等） */
  frameworkAwareness: boolean;
}

export interface RunnerConfig {
  type: "exec" | "mcp" | "http";
  command?: string;           // exec: 启动命令
  args?: string[];            // exec: 参数，支持 {repoPath} 等占位符
  url?: string;               // http: MCP/HTTP 端点
  timeoutMs: number;          // 默认 600000 (10min)
}
```

### 14.3 聚合算法

```typescript
// src/aggregation/aggregator.ts

interface AggregationInput {
  engineResults: EngineAnalysisResult[];
  changedFiles: string[];
  allowDegraded: boolean;
}

interface AggregationOutput {
  unified: UnifiedImpactResult;
  stats: AggregationStats;
}

// 六步流水线:
// 1. mergeCallChains() — A→B→C + A→D→C = A→{B,D}→C
// 2. dedupByFqn()        — 同FQN保留最高置信度，合并sources[]
// 3. weightConfidence()   — 归一化 = raw × (weight/50)，交叉验证+10
// 4. arbitrateConflicts() — 取多数票 / 投信任票
// 5. diffComplete()       — 标注独有发现来源
// 6. fallbackToGlob()     — uncovered文件 → analyzer.ts glob匹配
```

### 14.4 配置文件（engines.conf.json）

```jsonc
{
  "engines": [
    {
      "id": "depcruiser",
      "name": "依赖分析 (TS/JS)",
      "enabled": true,
      "fileExtensions": [".ts", ".tsx", ".js", ".jsx"],
      "confidenceWeight": 65,
      "capabilities": { "modes": ["full"], "granularity": "file" },
      "runner": {
        "type": "exec",
        "command": "npx",
        "args": ["depcruise", "{repoPath}", "--output-type", "json"],
        "timeoutMs": 120000
      }
    },
    {
      "id": "java-callgraph",
      "name": "Java 方法调用图",
      "enabled": false,
      "fileExtensions": [".java"],
      "confidenceWeight": 85,
      "capabilities": { "modes": ["full"], "granularity": "method" },
      "runner": {
        "type": "exec",
        "command": "java",
        "args": ["-jar", "/path/to/javacg-static.jar", "{repoPath}"],
        "timeoutMs": 600000
      }
    },
    {
      "id": "tcg",
      "name": "TypeScript 函数调用图",
      "enabled": false,
      "fileExtensions": [".ts", ".tsx"],
      "confidenceWeight": 80,
      "capabilities": { "modes": ["full"], "granularity": "function" },
      "runner": {
        "type": "exec",
        "command": "npx",
        "args": ["tcg", "{repoPath}"],
        "timeoutMs": 300000
      }
    }
  ]
}
```

### 14.5 文件清单（实际产出 ~1080 行，Phase 2a + 2d）

| 新建 | 文件 | 行数 | 状态 | 说明 |
|:--:|------|:--:|:--:|------|
| ✅ | `src/engines/types.ts` | ~220 | 已创建 | AnalysisEngine 接口 + PanoramaIndex + CallChainImpact + EngineConfig + UnifiedImpactResult |
| ✅ | `src/engines/registry.ts` | ~115 | 已创建 | 引擎注册表：配置读写 + 扩展名匹配 + 惰性缓存 |
| ✅ | `src/engines/runner.ts` | ~195 | 已创建 | 引擎运行器：runEngineAnalysis() 调度 (内置/通用) + exec/mcp/http + checkAvailability() |
| ✅ | `src/engines/call-chain-traversal.ts` | ~117 | 已创建 | 逆向 BFS：computeImpactsFromIndex() |
| ✅ | `src/engines/adapters/java-callgraph.ts` | ~320 | 已创建 | java-callgraph 专用适配器：编译→运行→解析→PanoramaIndex |
| ✅ | `scripts/setup-java-callgraph.sh` | ~90 | 已创建 | java-callgraph 自动安装脚本 (克隆+编译+部署) |
| ✅ | `examples/engines.conf.example.json` | ~35 | 已创建 | 引擎配置模板（预置 java-callgraph 示例） |
| ✅ | `lib/java-callgraph/.gitkeep` | 1 | 已创建 | JAR 存放位置标注 |

| 修改 | 文件 | 行数 | 状态 | 说明 |
|:--:|------|:--:|:--:|------|
| ✅ | `src/impact-analysis/handler.ts` | +120 | 已完成 | analyzeWithEngines() + enrichWithEngineImpacts() + locateRepoClone() |
| ✅ | `src/index.ts` | +2 | 已完成 | ensureEngineConfig() 启动调用 |

> **选做**: `src/aggregation/types.ts` + `src/aggregation/aggregator.ts` — 多引擎聚合模块（Phase 2b，待引入第二个引擎时实现）
> **不动**: analyzer.ts (glob 兜底)、platforms/、tools/

### 14.6 实施序列

```
Phase 2a (引擎抽象层, ✅ 2026-06-14 完成):
  ✅ Step 1: src/engines/types.ts            — 接口+类型 (220行)
  ✅ Step 2: src/engines/registry.ts         — 注册表 (115行)
  ✅ Step 3: src/engines/runner.ts           — 子进程运行器 + 适配器调度 (195行)
  ✅ Step 4: src/engines/call-chain-traversal.ts — BFS 逆向遍历 (117行)
  ✅ Step 5: examples/engines.conf.example.json
  ✅ Step 6: src/index.ts                    — ensureEngineConfig() 启动注册

Phase 2b (聚合模块, 🔜 待引入第二个引擎):
  Step 1: src/aggregation/types.ts
  Step 2: src/aggregation/aggregator.ts      — 核心多引擎聚合流水线
  Step 3: src/tests/aggregation.test.ts

Phase 2c (handler 集成, ✅ 2026-06-14 完成):
  ✅ Step 1: handler.ts → analyzeWithEngines()      (引擎匹配 → 可用性检测 → 运行分析)
  ✅ Step 2: handler.ts → enrichWithEngineImpacts()  (引擎结果合并到 legacy 格式)
  ✅ Step 3: handler.ts → locateRepoClone()          (本地克隆定位)

Phase 2d (java-callgraph 引擎接入, ✅ 2026-06-14 完成):
  ✅ Step 1: scripts/setup-java-callgraph.sh     — 自动安装脚本
  ✅ Step 2: src/engines/adapters/java-callgraph.ts — 专用适配器 (编译→分析→解析, 320行)
  ✅ Step 3: runner.ts 适配器调度层               — runEngineAnalysis() 内置引擎路由
  ✅ Step 4: examples/engines.conf.example.json   — 配置模板更新

Phase 2e (dependency-cruiser 引擎接入, 🔜 待定):
  待用户决策后引入
```

### 14.7 关键设计决策 (ADR)

| # | 决策 | 理由 |
|:--:|------|------|
| 1 | **PanoramaIndex 独立存储** — `.tia/{branch}/panorama-{engineId}.json` | 解耦引擎间依赖，原子更新 |
| 2 | **置信度线性加权** — `归一化 = raw × (weight/50)` | 简单透明，与 Confidence(0-100) 直接兼容 |
| 3 | **引擎惰性初始化** — 启动不检测，首次调用时检测 | 快速启动，HTTP 模式友好，与 getAdapter() 模式一致 |
| 4 | **Glob 匹配永不删除** — 作为终极降级 | 全部引擎失败时零依赖可用 |
| 5 | **Backward Compatible** — `UnifiedImpactResult → enrichWithEngineImpacts() → RepoImpactResult` | Phase 3/4 (test_recommendation + risk_assessment) 零改动 |
| 6 | **专门适配器 > 通用 runner** — java-callgraph 输出文本而非 JSON，必须专用解析 | runner.ts 的 runEngineAnalysis() 按 engineId 路由到适配器或通用 exec runner |

### 14.8 java-callgraph 适配器 — 技术细节

#### 14.8.1 为什么需要专用适配器？

java-callgraph 输出的**不是 JSON**，而是自定义文本格式：

```
M:com.example.Foo:<init>() (M)java.lang.Object:<init>()    ← 方法调用行
C:com.example.Foo com.example.Bar                          ← 类调用行
J:1 /path/to/app.jar                                       ← JAR 索引行
```

通用 `runner.ts` 的 `runFullAnalysis()` 期望 `JSON.parse(stdout)` → 会解析失败。
因此需要专用适配器：解析文本行 → `PanoramaIndex`。

#### 14.8.2 适配器工作流

```
createJavaCallGraphEngine(runner, projectRoot)
  └─ runFullAnalysis(repoPath, branch)
       ├─ 1. 可选编译 (buildCommand)
       ├─ 2. 查找编译产物 (target/classes/ 或 target/*.jar)
       ├─ 3. 运行 javacg-static.jar → stdout 文本
       ├─ 4. parseOutput() 解析文本行
       │    ├─ M: 行 → callGraph + reverseCallGraph + method→file 映射
       │    ├─ C: 行 → 类级补充
       │    └─ J: 行 → JAR 位置（可选）
       └─ 5. 返回 PanoramaIndex
            ├─ callGraph: callerFqn → [calleeFqn, ...]
            ├─ reverseCallGraph: calleeFqn → [callerFqn, ...]  ← BFS 输入
            ├─ fileToMethods: filePath → [methodFqn, ...]
            └─ terminalMethods: 空（java-callgraph 无框架感知，端点在 Phase 5b 增强）
```

#### 14.8.3 Runner 配置格式

```jsonc
{
  "id": "java-callgraph",
  "enabled": true,
  "runner": {
    "type": "exec",
    "command": "java",
    "args": [
      "-Xmx2g",
      "-jar",
      "lib/java-callgraph/javacg-static.jar",
      "{repoPath}"                // 占位符 → 替换为编译产物路径
    ],
    "timeoutMs": 600000           // 10 分钟超时
  }
}
```

> **注意**: runner.args 仅作为**元数据参考**。适配器内部自行构造 `java -jar` 命令，
> args 主要用于记录 JAR 路径（适配器通过 `-jar` 后第一个参数提取）。

#### 14.8.4 关键限制与未来增强

| 限制 | 影响 | 解决方案 |
|------|------|----------|
| **分析 JAR/class 而非源码** | 仓库需预先编译（`mvn compile`） | 通过 `buildCommand` 或手动编译 |
| **无框架感知** | 不识别 @Controller/@KafkaListener 等注解 | Phase 5b 补充→需结合源码注解扫描 |
| **无行号信息** | 标准版 java-callgraph 不输出行号 | 使用增强版或接受无行号 |
| **全量分析无增量** | 每次运行重新分析所有 class | Phase 2e 增量索引方案 |

#### 14.8.5 安装脚本

```bash
bash scripts/setup-java-callgraph.sh
```

行为：
1. 检查 JDK 11+、Maven、Git
2. `git clone` java-callgraph 源码
3. `mvn clean package -DskipTests`
4. 复制 `javacg-static.jar` → `lib/java-callgraph/`
5. 写入版本信息到 `lib/java-callgraph/VERSION.txt`
6. 清理临时文件

#### 14.8.6 解析器设计 (parseOutput)

**行类型检测**（按首字符）:

```
'M' + ':'  → 方法调用行  → callGraph + reverseCallGraph
'C' + ':'  → 类调用行    → 类级统计
'J' + ':'  → JAR 索引行  → 可选，增强版才有
```

**方法调用行解析**:

```
输入: "M:com.example.Foo:<init>(java.lang.String) (M)java.lang.Object:<init>()"
       └─ 去掉 "M:"
         └─ com.example.Foo:<init>(java.lang.String) (M)java.lang.Object:<init>()
              └─ 在 ") (" 处分割
                ├─ caller: "com.example.Foo:<init>(java.lang.String)"  → FQN: "com.example.Foo:<init>"
                └─ callee: "M)java.lang.Object:<init>()"               → FQN: "java.lang.Object:<init>"
```

**类→文件映射**（惰性缓存）:

```typescript
// com.example.Foo → src/main/java/com/example/Foo.java
const relativePath = className.replace(/\./g, "/").split("$")[0] + ".java";
// 去掉内部类后缀 ($Inner) ，定位外部类文件
```

### 14.9 当前架构全景图（2026-06-14 最终状态）

```
impact_analysis 工具
  │
  └─ handleImpactAnalysis()
       └─ analyzeRepo() × N 仓库
            ├─ adapter.getDiffFiles(from, to)           ← 变更文件列表
            │
            ├─ analyzeWithEngines(repo, changedFiles)   ← Phase 2a ✅ 引擎增强
            │   ├─ matchEngineFiles(changedFiles)       ← registry: 扩展名匹配
            │   │   └─ .java → java-callgraph
            │   ├─ locateRepoClone(repo)                ← 本地克隆存在性检查
            │   ├─ checkAvailability(engineConfig)      ← runner: 内置/通用检测
            │   ├─ runEngineAnalysis(engineConfig, ...) ← runner: 内置→适配器 / 通用→exec
            │   │   └─ java-callgraph → createJavaCallGraphEngine()
            │   │       ├─ 编译 (可选 buildCommand)
            │   │       ├─ javacg-static.jar → 文本输出
            │   │       └─ parseOutput() → PanoramaIndex
            │   ├─ computeImpactsFromIndex(files, idx)  ← call-chain-traversal: BFS
            │   └─ getUnmatchedFiles()                  ← registry: 未覆盖文件
            │
            ├─ analyzeImpact(uncoveredFiles, config)    ← glob 文件级兜底 ✅
            │
            └─ enrichWithEngineImpacts(base, unified)   ← Phase 2a ✅ 引擎结果合并
                 ├─ API/MQ/Job 端点 → 测试模块摘要
                 └─ engineModules[] + glob modules[] = 最终结果

═══════════════════════════════════════════════════════
引擎适配器层 (src/engines/)

types.ts              ← AnalysisEngine 接口契约
registry.ts           ← 引擎注册表 (配置读写 + 匹配)
runner.ts             ← 运行器 (内置/通用路由 + exec/mcp/http)
call-chain-traversal.ts ← BFS 算法 (PanoramaIndex → CallChainImpact)
adapters/
  java-callgraph.ts   ← java-callgraph 专用适配器 (✅ 已实现)

═══════════════════════════════════════════════════════
安装与配置

scripts/setup-java-callgraph.sh   ← 自动安装脚本
examples/engines.conf.example.json ← 配置模板
lib/java-callgraph/               ← JAR 存放目录
```
