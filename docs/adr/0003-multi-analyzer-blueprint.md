# ADR-0003: TIA 多分析器集成蓝图

**日期**：2026-06-14
**状态**：accepted
**决策者**：TIA 架构设计

---

## Context

TIA Phase 2-4 完成后的 `impact_analysis` 工具基于 **文件级 glob 匹配**，受限于：
1. 只能做"文件名→测试路径"的映射，缺少代码语义理解
2. 无法分析 Java 方法级调用链对测试的影响
3. 无法追踪数据库 SQL 变更的影响范围
4. 无法分析 Python/Go/C++ 等异构代码仓

需要引入专项分析器，同时保持架构可持续扩展。

---

## Decision

**TIA 作为 MCP 编织层（MCP Orchestrator），通过 MCP 协议委托下游分析器完成代码语义分析，将结果聚合到 impact_analysis 工具中。**

### 三层模型

```
Layer 1 (Host Agent): Claude Code / OpenCode / Codex
    │ MCP
Layer 2 (Orchestrator): TIA MCP Server
    │  ├─ repo_monitor: 变更感知
    │  ├─ repo_clone:    代码拉取
    │  ├─ impact_analysis:  ↓ 整合分析 ↓
    │  │    ├─ Phase 1: 文件级匹配（当前 ✅）
    │  │    ├─ Phase 2: 委托下游 MCP 做语义分析
    │  │    └─ Phase 3: 多维度加权合成最终结论
    │  ├─ test_recommendation (stdio-only)
    │  └─ risk_assessment (stdio-only)
    │ MCP (stdio 本地)
Layer 3 (Analyzers): 专项代码分析器
    ├─ JACG MCP Server (Java):       方法调用链 + SQL 关联
    ├─ SQL Analyzer MCP (规划中):     SQL 变更语义分析
    ├─ Perf Analyzer MCP (规划中):    性能热点分析
    ├─ Python Call Graph (规划中):    Python 调用链
    └─ Go Call Graph (规划中):        Go 调用链
```

### 数据流（以 Java 为例）

```
1. Host Agent 调用 impact_analysis(name="backend", from="abc", to="def")

2. TIA impact_analysis handler:
   a. 获取变更文件列表（已有：adapter.getDiffFiles）
   b. 检测文件类型 → 判断需要哪些分析器
      - .java 文件 → 需要 JACG MCP
      - .sql 文件 → 需要 SQL Analyzer MCP（未来）
      - .py 文件 → 需要 Python Call Graph MCP（未来）
   c. 对每个需要调用的下游 MCP：
      - 调用其 ListTools 确认可用性
      - 构造请求参数（文件列表 + SHA 范围）
      - 调用下游工具获取分析结果
   d. 聚合所有分析器的结果
   e. 格式化为统一输出

3. JACG MCP Server:
   a. 接收变更文件列表
   b. 解析这些文件的 jar/class → 查找受影响的方法
   c. 生成向上/向下调用链
   d. 返回受影响的方法列表 + 调用链
```

### 新增模块：`src/analyzer-registry/`

```
src/analyzer-registry/
  ├── types.ts          ← AnalyzerAdapter 接口
  ├── registry.ts       ← 分析器注册表（配置驱动）
  └── adapters/
      └── jacg.ts       ← JACG MCP 适配器
```

### AnalyzerAdapter 接口

```typescript
interface AnalyzerAdapter {
  /** 分析器唯一标识 */
  id: string;
  /** 支持的文件扩展名（用于自动匹配） */
  fileExtensions: string[];
  /** 分析器 MCP 连接信息 */
  connection: McpConnection;
  /**
   * 分析变更文件对测试的影响。
   * @returns 受影响的方法/模块列表，不可用时返回 null（TIA 降级）
   */
  analyze(
    repo: MonitorEntry,
    changedFiles: string[],
    fromSha: string,
    toSha: string
  ): Promise<AnalyzerResult | null>;
}

interface McpConnection {
  transport: "stdio" | "http";
  /** stdio: 启动命令；http: URL */
  endpoint: string;
  /** 可选：HTTP headers */
  headers?: Record<string, string>;
}

interface AnalyzerResult {
  analyzerId: string;
  impactedItems: AnalyzerImpactItem[];
  /** 补充增强：调用链、SQL 语句等 */
  details?: Record<string, unknown>;
}

interface AnalyzerImpactItem {
  type: "method" | "sql" | "class" | "function";
  name: string;
  testPaths: string[];
  confidence: number;
  callChain?: string;  // JACG 返回的调用链树形文本
}
```

### 配置驱动

分析器注册通过 `analyzers.conf.json`（新增配置文件）完成：

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 调用链分析",
      "fileExtensions": [".java"],
      "enabled": true,
      "connection": {
        "transport": "stdio",
        "endpoint": "java -jar jacg-mcp-server.jar"
      }
    },
    {
      "id": "sql-analyzer",
      "name": "SQL 变更分析",
      "fileExtensions": [".sql", ".xml"],
      "enabled": false,           // 未实现前禁用
      "connection": { "transport": "stdio", "endpoint": "" }
    }
  ]
}
```

### 降级策略（三层容错）

```
impact_analysis 调用过程：

Level 1: 启用分析器
  └─ 下游 MCP 可用?
      ├─ YES → Level 2: 执行分析
      │          └─ 结果非空?
      │              ├─ YES → 聚合到最终输出（标注来源分析器）
      │              └─ NO  → 降级到文件级 glob 匹配
      └─ NO  → 降级到文件级 glob 匹配（当前 Phase 1 行为）

降级输出示例:
  🔬 影响分析结果
  📦 backend (abc → def)
     🧠 Java 调用链分析 [JACG]: 3 个受影响方法
     ⚠️ SQL 分析器不可用 — 已降级为文件匹配
     📁 文件级匹配: 5 个受影响测试模块
```

### 横向扩展路径

```
                     TIA MCP Server (编织层)
                    ┌───────────────────┐
                    │  impact_analysis  │
                    │ test_recommendation│
                    │  risk_assessment  │
                    └──┬──┬──┬──┬──┬───┘
                       │  │  │  │  │
        ┌──────────────┘  │  │  │  └──────────────┐
        ▼                  ▼  ▼  ▼                  ▼
   ┌─────────┐      ┌─────────┐ ┌─────────┐  ┌─────────┐
   │  JACG   │      │  SQL    │ │  Perf   │  │  Go     │
   │  MCP    │      │ Analyzer│ │ Analyzer│  │ Call    │
   │ (Java)  │      │  MCP    │ │  MCP    │  │ Graph   │
   │ 已就绪  │      │ (规划)  │ │ (规划)  │  │ (规划)  │
   └─────────┘      └─────────┘ └─────────┘  └─────────┘
   2026.06 先集成    2026 Q3    2026 Q3     2026 Q4
```

---

## Alternatives Considered

### 方案 A：所有分析器内嵌 TIA 仓库

- **Why not**：见 ADR-0001。技术栈混杂、升级耦合、不可持续

### 方案 B：只做文件级匹配，不引入语义分析

- **Why not**：文件级匹配已经做到了（Phase 2-4），再往下走就必须引入代码语义分析才能突破瓶颈

### 方案 C：TIA 不做编织层，让 Host Agent 直接调用各分析器

- **Why not**：Host Agent 需要理解每个分析器的工具参数和结果格式，TIA 的"单一入口"价值被削弱

---

## Consequences

### Positive

- TIA 的技术栈保持纯净（纯 TypeScript/MCP），不引入 Java/Python 运行时
- 每个分析器可独立选型、独立升级、独立部署
- 新分析器接入只需：1) 实现 MCP 工具 2) 配置 `analyzers.conf.json` 3) TIA 适配层 ~30 行
- impact_analysis 对上层 Agent 保持不变的接口，内部对下游 MCP 的调用透明
- 下游分析器也可被 Host Agent 直接使用（不经过 TIA），两种用法共存

### Negative

- 需要维护 MCP 编织逻辑（ListTools 发现 + CallTool 调用 + 结果聚合 + 容错）
- 下游 MCP Server 的部署增加了运维复杂度
- MCP 调用链变长：Host Agent → TIA → JACG，调试需要三层排查

### Risks

- **JACG MCP 协议版本兼容性**：与 ADR-0001 同 → 固定 MCP SDK 版本
- **分析器不可用时降级体验**：设计三层容错 + 明确告知用户降级状态
- **不同分析器返回格式不统一**：AnalyzerAdapter 统一为 `AnalyzerResult` 接口

---

## 实施路线图

### Phase 5a：JACG 集成（2026.06）

| # | 任务 | 文件 |
|---|------|------|
| 1 | 定义 `AnalyzerAdapter` 接口 + `analyzers.conf.json` | `src/analyzer-registry/types.ts` |
| 2 | 实现分析器注册表（配置读写） | `src/analyzer-registry/registry.ts` |
| 3 | 实现 JACG MCP 适配器 | `src/analyzer-registry/adapters/jacg.ts` |
| 4 | impact_analysis handler 增加编织逻辑 | `src/impact-analysis/handler.ts` |
| 5 | 降级输出格式化 | `src/impact-analysis/handler.ts` |
| 6 | 单元测试 | `src/tests/analyzer-registry.test.ts` |

### Phase 5b：SQL 分析器集成（2026 Q3）

### Phase 5c：性能分析器集成（2026 Q3）

### Phase 5d：Python / Go 调用链集成（2026 Q4）
