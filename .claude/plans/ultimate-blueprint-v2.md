# TIA 终极蓝图 v2 — 代码全景解析 + 逆向调用链 + 场景级精准测试

**设计日期**: 2026-06-14  
**定位**: 已有 Phase 2-5a 规划的上游基建层，互补而非替换  
**与已有规划的关系**:

| 已有规划 | 本蓝图关系 |
|----------|-----------|
| `phase2-impact-analysis-plan.md` | ✅ 已实现。我的蓝图将其升级为调用链级分析 |
| `phase3-4-plan.md` (测试推荐+风险评分) | 下游消费者 — 改用我的全景索引和调用链结果作为输入 |
| `phase5a-jacg-integration.md` (JACG 编织层) | 互补 — 我的自建调用图 + JACG 外部调用图双源融合 |

---

## 一、终极架构全景图

```
                          ┌──────────────────────────────┐
                          │      Playwright MCP (外部)     │
                          │      业务场景树               │
                          └──────────────┬───────────────┘
                                         │ MCP 桥接
┌─────────────────────────────────────────▼──────────────────────────────┐
│                          TIA MCP Server (本项目)                        │
│                                                                        │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────┐       │
│  │repo_monitor│  │repo_clone │  │code_panorama│ │impact_analysis│      │
│  │  (Phase1)  │  │  (Phase1) │  │  (★新增)   │  │  (升级v3)    │       │
│  └─────┬─────┘  └─────┬─────┘  └──────┬──────┘  └──────┬───────┘       │
│        │              │               │                │               │
│  ┌─────▼─────┐  ┌─────▼─────┐  ┌──────▼──────┐  ┌──────▼──────────┐   │
│  │ 水位管理   │  │ 代码落盘   │  │ 全景解析     │  │ 影响分析 v3     │   │
│  │ seenShas  │  │ full/inc  │  │ AST+调用图  │  │ 双模引擎        │   │
│  └───────────┘  └───────────┘  └──────┬──────┘  └──────┬──────────┘   │
│                                       │                │              │
│                                panorama-index.json      │              │
│                                (符号表+调用图+字典)      │              │
│                                                        │              │
│  ┌─────────────────────────────────────────────────────▼────────┐     │
│  │  impact_analysis v3 三源融合引擎                               │     │
│  │  ├─ 源1: code_panorama 自建调用图（逆向 BFS）— 始终可用       │     │
│  │  ├─ 源2: AnalyzerRegistry 外部分析器（JACG 等）— 可用时增强   │     │
│  │  │    └─ JACG 不可用 → 自动降级，标注 "⚠️ 仅静态分析"          │     │
│  │  └─ 源3: 旧路径 glob 文件匹配 — 无全景索引时兜底              │     │
│  └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  Phase 4 消费者 (已有规划 phase3-4-plan.md)                    │     │
│  │  ├─ test_recommendation — 测试推荐排序                         │     │
│  │  └─ risk_assessment    — 风险量化评分                          │     │
│  └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 二、与已有规划的融合路径

```
已有规划中的不足                    本蓝图填补
─────────────────────────────────   ─────────────────────────────────
phase2: 只有文件→测试路径匹配        → 升级为方法→调用链→API/MQ/Job 映射
phase2: 不识别框架特征               → 新增框架检测器(Controller/MQ/Job注解)
phase2: 无符号级信息                  → 新增 AST 级符号提取
phase3-4: 推荐分=规则权重×置信度     → 改为 推荐分=调用链深度×变更类型×业务关键度
phase5a: JACG 适配器（可用性检测）    → 融合为 system v3 的第二数据源
phase5a: 仅委托JACG(可能不可用)      → 自建调用图+JACG双源，自动降级+标注
全部: 无业务场景映射                  → 新增业务场景桥接模块
```

---

## 三、核心模块 1：代码全景解析 (`code_panorama`)

### 3.1 能力定位

输入已克隆的代码目录，产出**代码全景索引** (`panorama-index.json`)：

```
全景索引 = {
  符号表:     { 文件 → [类/方法/字段] },
  调用图:     { 方法 → [被调方法] }   ← 双向索引（正向+逆向）
  API字典:    { URL+HTTP方法 → Controller方法 },
  MQ字典:     { Queue/Topic → Consumer方法 },
  Job字典:    { Cron表达式 → 定时任务方法 },
  文件索引:   { 文件 → [顶层类] }
}
```

### 3.2 技术选型

| 维度 | 方案 | 理由 |
|------|------|------|
| **Java AST** | **tree-sitter** + `tree-sitter-java` | 纯 C binding，无需 JVM，MCP Server 单进程运行 |
| **注解识别** | tree-sitter query + 正则回退 | S-expression query 精确定位注解 |
| **调用图存储** | 文件系统 JSON | 沿用现有配置/状态分离模式，无外部DB |
| **增量更新** | git diff → 仅重新解析变更文件 | 大仓库扫描从分钟级降到秒级 |
| **多语言扩展** | LanguageParser 接口 | 未来可加 TypeScript/Python 解析器 |

### 3.3 框架识别清单

| 框架 | 识别特征 | 产出 |
|------|---------|------|
| Spring Boot Controller | `@RestController` + `@GetMapping/@PostMapping/...` | API 端点 |
| Spring Boot Service | `@Service` + 方法签名 | 调用图中间节点 |
| Spring Data Repository | `@Repository` / `extends JpaRepository` | DB 访问层 |
| RabbitMQ Consumer | `@RabbitListener(queues="...")` | MQ 消费者 |
| Kafka Consumer | `@KafkaListener(topics="...")` | MQ 消费者 |
| Spring Scheduled | `@Scheduled(cron="...")` | 定时任务 |
| XXL-Job | `@XxlJob("handlerName")` | 定时任务 |
| Feign Client | `@FeignClient(name="...")` | RPC 调用边界 |

### 3.4 调用图构建策略

```
对每个 .java 文件 tree-sitter 解析 → AST:
  ├─ 提取 import 语句 → 建立短类名→全限定名映射
  ├─ 提取所有方法 → 记录签名+注解
  └─ 遍历方法体:
      ├─ 方法调用表达式 (method_invocation):
      │   ├─ 同文件调用 → 直接记录边
      │   ├─ 跨文件调用 → import映射 → 记录边
      │   ├─ this.method() → 当前类内边
      │   └─ field.method() → 类型推断 → 边
      ├─ Spring Bean 注入 (@Autowired/@Resource):
      │   └─ 注入字段的方法调用 → 解析到被注入Bean
      └─ Lambda/方法引用 → 尽力而为标注
```

**限制（文档明确标注）**：
- 静态分析无法处理反射调用 `Class.forName().getMethod().invoke()`
- Spring AOP 代理的间接调用标注为 "可能经过AOP代理"
- 动态代理 (MyBatis Mapper) 仅记录到接口层

### 3.5 新 MCP 工具 Schema

```typescript
{
  name: "code_panorama",
  description:
    "代码全景解析 — 对代码仓库进行 AST 级解析，构建符号表、调用图、API字典。\n\n" +
    "三种操作:\n" +
    "  - scan    — 全量扫描代码，生成 panorama-index.json\n" +
    "  - query   — 查询已生成的全景索引\n" +
    "  - rebuild — 增量重建（基于 git diff 仅重新解析变更文件）\n\n" +
    "前置: 已通过 repo_clone(mode='full') 拉取代码\n\n" +
    "查询示例:\n" +
    '  code_panorama(action="query", name="gh-backend", type="api")          — 列出所有API\n' +
    '  code_panorama(action="query", name="gh-backend", type="callers",     — 查谁调用了某方法\n' +
    '                symbol="UserService.login")\n' +
    '  code_panorama(action="query", name="gh-backend", type="callees",     — 查某方法调用了谁\n' +
    '                symbol="UserController.createOrder")',
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["scan", "query", "rebuild"] },
      name:   { type: "string", description: "仓库别名" },
      module: { type: "string", description: "模块名(批量)" },
      type:   { type: "string", enum: ["api", "mq", "job", "callees", "callers", "symbols", "summary"],
                description: "查询类型(仅 action=query)" },
      symbol: { type: "string", description: "符号全限定名(仅 callees/callers)" },
      limit:  { type: "number", description: "返回上限，默认50" },
    },
    required: ["action"],
  },
}
```

### 3.6 核心类型

```typescript
// src/code-panorama/types.ts

export interface SymbolEntry {
  name: string;            // 简单名
  fqn: string;            // 全限定名: com.example.UserService
  kind: "class" | "interface" | "method" | "field" | "enum";
  filePath: string;
  line: number;
  modifiers: string[];     // ["public", "static"]
  annotations: string[];   // ["@RestController", "@RequestMapping("/api")"]
  parentClass?: string;    // 所属类的 FQN
  returnType?: string;
  params?: { name: string; type: string }[];
}

export interface CallEdge {
  caller: string;          // "com.example.UserController.createOrder"
  callee: string;          // "com.example.UserService.validateUser"
  filePath: string;
  line: number;
  callType: "direct" | "interface" | "bean_injection" | "lambda";
  confidence: number;      // 0-100，静态分析的确定性
}

export interface ApiEndpoint {
  url: string;             // "/api/users/{id}"
  httpMethod: string;      // "GET" | "POST" | "PUT" | "DELETE"
  handlerFqn: string;      // "com.example.UserController.getUser"
  controllerClass: string;
  filePath: string;
  line: number;
  module?: string;         // 从 @RequestMapping 前缀推断的功能模块
}

export interface MqConsumer {
  queueOrTopic: string;
  mqType: "rabbitmq" | "kafka" | "rocketmq" | "other";
  handlerFqn: string;
  filePath: string;
  line: number;
}

export interface ScheduledJob {
  name: string;
  triggerType: "@Scheduled" | "@XxlJob" | "@ElasticJob" | "other";
  cronOrTrigger: string;
  handlerFqn: string;
  filePath: string;
  line: number;
}

export interface PanoramaIndex {
  repoName: string;
  branch: string;
  headSha: string;
  indexedAt: string;       // ISO 8601
  
  summary: {
    totalFiles: number;
    totalClasses: number;
    totalMethods: number;
    totalCallEdges: number;
    totalApis: number;
    totalMqConsumers: number;
    totalJobs: number;
    parseTimeMs: number;
  };
  
  /** 符号表: 文件路径 → 符号列表 */
  symbols: Record<string, SymbolEntry[]>;
  /** 调用图: 所有边 */
  callGraph: CallEdge[];
  /** 各种字典 */
  apiEndpoints: ApiEndpoint[];
  mqConsumers: MqConsumer[];
  scheduledJobs: ScheduledJob[];
  /** 文件→顶层类 */
  fileIndex: Record<string, string[]>;
}
```

---

## 四、核心模块 2：逆向调用链分析（impact_analysis v3 升级）

### 4.1 升级策略

**旧路径（向后兼容）**：无全景索引时，走现有 `analyzer.ts` 的 glob 文件级匹配  
**新路径（精确分析）**：有全景索引时，走方法→调用链→API/MQ/Job 精确定位

```
impact_analysis(name="order-service")
  │
  ├─ 读取 panorama-index.json
  │
  ├─ 索引不存在 → 旧路径 (现有 analyzer.ts, 文件级glob匹配)
  │   输出: "建议测试: tests/order/OrderServiceTest.java (置信度 70%)"
  │
  └─ 索引存在 → 新路径 (调用链分析)
      ├─ 获取变更文件列表 (git diff)
      ├─ 从全景索引查变更文件中的方法
      ├─ 对每个变更方法: 逆向 BFS 遍历调用图
      │   createOrder()
      │     ← OrderController.createOrder()   ← API: POST /api/orders
      │     ← PaymentListener.onPaid()        ← MQ: payment.success
      │     ← DailyReportJob.generate()       ← Job: @Scheduled daily
      ├─ 聚合: 去重API/MQ/Job + 记录完整调用链路径
      └─ 输出:
          受影响 API:  POST /api/orders (2层调用链)
                       GET  /api/users/{id} (3层调用链)
          受影响 MQ:   payment.success 消费者
          受影响 Job:  DailyReportJob (间接影响，4层调用链)
```

### 4.2 逆向 BFS 核心算法

```typescript
// src/call-chain/analyzer.ts

/**
 * 从变更方法出发，逆向 BFS 遍历调用图，
 * 找到所有受到影响的 API/MQ/Job 端点。
 *
 * @param changedMethods  变更的方法 FQN 列表
 * @param callGraph       全景调用图
 * @param terminalFqns    终端方法集合(API+MQL+Job handler 的 FQN)
 * @param maxDepth        最大遍历深度(默认 10)
 */
function reverseImpactAnalysis(
  changedMethods: string[],
  callGraph: CallEdge[],
  terminalFqns: Set<string>,
  maxDepth: number = 10
): Map<string, CallChainPath[]> {
  
  // 构建逆向邻接表: callee → [caller, ...]
  const reverseAdj = new Map<string, string[]>();
  for (const edge of callGraph) {
    const callers = reverseAdj.get(edge.callee) ?? [];
    callers.push(edge.caller);
    reverseAdj.set(edge.callee, callers);
  }
  
  // BFS 队列
  const result = new Map<string, CallChainPath[]>();
  
  for (const startMethod of changedMethods) {
    const visited = new Set<string>();
    const queue: BfsNode[] = [
      { method: startMethod, chain: [], depth: 0 }
    ];
    
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node.method) || node.depth > maxDepth) continue;
      visited.add(node.method);
      
      // 到达终端节点 (API/MQ/Job)
      if (terminalFqns.has(node.method)) {
        const paths = result.get(node.method) ?? [];
        paths.push({ chain: [...node.chain, node.method], depth: node.depth });
        result.set(node.method, paths);
        continue; // 不继续向上——终端节点之上是框架层
      }
      
      // 继续向上遍历
      const callers = reverseAdj.get(node.method) ?? [];
      for (const caller of callers) {
        queue.push({
          method: caller,
          chain: [...node.chain, node.method],
          depth: node.depth + 1,
        });
      }
    }
  }
  
  return result;
}
```

### 4.3 impact_analysis v3 输出增强

在现有输出基础上追加调用链分析结果：

```
🔬 影响分析结果 (调用链模式)

📦 order-service (abc123 → def456)
   变更文件: 3 个 | 变更方法: 5 个

   🔗 受影响 API (2 个):
     POST /api/orders
       调用链: OrderService.createOrder() → OrderController.createOrder() [2层]
       风险: 🔴 HIGH
     GET  /api/users/{id}
       调用链: UserMapper.findById() → UserService.getUser() → UserController.getUser() [3层]
       风险: 🟡 MEDIUM

   📨 受影响 MQ (1 个):
     payment.success (RabbitMQ)
       调用链: OrderService.createOrder() → OrderStatusHandler → PaymentListener.onPaid() [3层]
       风险: 🔴 HIGH

   ⏰ 受影响定时任务 (1 个):
     DailyReportJob
       调用链: OrderService.createOrder() → ... → DailyReportJob.generate() [4层]
       风险: 🟢 LOW (间接影响，深度4层)

   🎯 受影响测试模块:
     [保留现有的文件级匹配结果]
```

---

## 五、核心模块 3：业务场景桥接

### 5.1 交互模型

TIA 不直接调用 Playwright MCP（MCP Server 间直接通信复杂且脆弱），而是通过 **Claude Code Host 代理协调**：

```
┌──────────────────────────────────────────────┐
│              Claude Code Host                 │
│                                              │
│  1. 调用 TIA impact_analysis → 得到技术影响  │
│  2. 调用 Playwright MCP → 获取业务场景树     │
│  3. 调用 TIA test_recommendation             │
│     传入: 技术影响 + 业务场景树               │
│     返回: 精准测试推荐报告                    │
└──────────────────────────────────────────────┘
```

### 5.2 业务场景数据结构

```typescript
// src/business-scenario/types.ts

export interface ScenarioNode {
  id: string;
  name: string;                // "账号密码登录"
  path: string[];              // ["用户中心", "登录", "账号密码登录"]
  /** 关联的技术标识 */
  techMappings: {
    type: "api" | "mq" | "job";
    identifier: string;        // "POST /api/login" / "payment.success"
    matchConfidence: number;   // 映射置信度 0-100
  }[];
  children?: ScenarioNode[];
}

/** Playwright MCP 返回的场景树顶层结构 */
export interface ScenarioTree {
  source: string;              // "playwright-mcp"
  fetchedAt: string;
  modules: ScenarioNode[];
}
```

### 5.3 技术→业务映射引擎

```typescript
// src/business-scenario/mapper.ts

/**
 * 将技术影响 (API/MQ/Job) 映射到业务场景树。
 *
 * 映射策略:
 *   1. API URL 匹配 → techMappings 中 identifier 精确匹配
 *   2. MQ Queue 匹配 → techMappings 中 identifier 精确匹配
 *   3. 模糊匹配 → URL 路径段相似度 > 80%
 *   4. 未匹配 → 标记为 "场景树遗漏"
 */
function mapTechToScenario(
  callChainImpact: CallChainImpact,
  scenarioTree: ScenarioTree
): TechScenarioMapping[] {
  // ...
}
```

---

## 五-B：分析器编织层 — 自建调用图 + 外部分析器双源融合

> 融合自 `phase5a-jacg-integration.md` 的 Architect 决策。  
> 核心思想：**自建调用图（code_panorama）是基座，外部分析器（JACG）是增强**。  
> 通过统一的 AnalyzerAdapter 接口编织两者，实现透明的多源聚合与自动降级。

### 5B.1 双源架构

```
impact_analysis(name="order-service")
  │
  ├─ ① 读取自建全景索引 (panorama-index.json)
  │     └─ tree-sitter 静态调用图：符号表 + 调用边 + API/MQ/Job 字典
  │
  ├─ ② 查询外部分析器注册表 (analyzers.conf.json → AnalyzerRegistry)
  │     └─ 按变更文件扩展名匹配分析器（如 .java → JACG）
  │
  ├─ ③ 双源并行调用（非串行）：
  │     ├─ self: code_panorama 逆向 BFS（自建调用图）→ 始终可用
  │     └─ external: JACG MCP 调用链分析（字节码级）→ 可用时增强
  │
  ├─ ④ 结果融合：
  │     ├─ 同名方法 → 合并调用链，标注"来自自建+JACG双源验证"
  │     ├─ JACG 独有 → 标注"🧠 JACG 深度分析"
  │     ├─ 自建独有 → 标注"📐 静态分析"
  │     └─ JACG 不可用 → 标注"⚠️ JACG 不可用，仅静态分析"
  │
  └─ ⑤ 聚合输出（同 4.3 输出增强格式）
```

### 5B.2 AnalyzerAdapter 接口（源自 phase5a）

```typescript
// src/analyzer-registry/types.ts

/** 分析器连接方式：stdio 进程 或 HTTP MCP */
export type AnalyzerConnection =
  | { type: "stdio"; command: string; args: string[] }
  | { type: "http"; url: string; apiKey?: string };

/** 单个外部分析器配置（analyzers.conf.json） */
export interface AnalyzerConfig {
  id: string;                    // "jacg"
  name: string;                  // "Java 全量调用图分析器"
  enabled: boolean;
  fileExtensions: string[];      // [".java"]
  connection: AnalyzerConnection;
  timeoutMs?: number;            // 默认 60000
}

export interface AnalyzerConfigFile {
  analyzers: AnalyzerConfig[];
}

/** 分析器返回的单条影响项 */
export interface AnalyzerImpactItem {
  changedMethod: string;
  impactedEndpoints: {
    type: "api" | "mq" | "job";
    identifier: string;          // "POST /api/orders"
    callChain: string[];         // [被改方法, 中间方法..., 端点方法]
    confidence: number;
  }[];
}

/** 分析器适配器接口 */
export interface AnalyzerAdapter {
  readonly id: string;
  readonly name: string;
  readonly fileExtensions: string[];

  /**
   * 分析变更文件的调用链影响。
   * 返回 null 表示该分析器当前不可用（自动降级）。
   */
  analyze(
    repo: MonitorEntry,
    changedFiles: string[],
    fromSha: string,
    toSha: string
  ): Promise<AnalyzerImpactItem[] | null>;
}
```

### 5B.3 注册表（Registry）+ 懒加载

```typescript
// src/analyzer-registry/registry.ts

/** 分析器注册表 — 模块级懒加载单例（镜像 adapter 工厂模式） */
let _registry: AnalyzerAdapter[] | null = null;

export function getAnalyzerRegistry(): AnalyzerAdapter[] {
  if (_registry !== null) return _registry;

  const config = loadAnalyzerConfig();
  _registry = [];

  for (const ac of config.analyzers) {
    if (!ac.enabled) continue;
    switch (ac.id) {
      case "jacg":
        _registry.push(new JacgAdapter(ac));
        break;
      // 未来扩展: "sonarqube", "codeql" 等
    }
  }

  return _registry;
}

/** 按变更文件扩展名匹配分析器 */
export function matchAnalyzers(changedFiles: string[]): AnalyzerAdapter[] {
  const extensions = new Set(changedFiles.map(f => path.extname(f)));
  return getAnalyzerRegistry().filter(a =>
    a.fileExtensions.some(ext => extensions.has(ext))
  );
}
```

### 5B.4 JACG 适配器（首版：可用性检测 + 降级标记）

```typescript
// src/analyzer-registry/adapters/jacg.ts

export class JacgAdapter implements AnalyzerAdapter {
  readonly id = "jacg";
  readonly name = "Java 全量调用图分析器";
  readonly fileExtensions = [".java"];

  private config: AnalyzerConfig;
  private available: boolean | null = null;  // null=未检测

  constructor(config: AnalyzerConfig) {
    this.config = config;
  }

  async analyze(
    repo: MonitorEntry,
    changedFiles: string[],
    fromSha: string,
    toSha: string
  ): Promise<AnalyzerImpactItem[] | null> {
    // 首版 (Phase 5a): 只做可用性检测
    if (this.available === null) {
      this.available = await this.checkAvailability();
    }

    if (!this.available) {
      return null;  // ← 返回 null 触发自动降级
    }

    // Phase 5b: 实际调用 JACG MCP 工具
    // const result = await this.callJacgMcp(repo, changedFiles, fromSha, toSha);
    // return this.parseResult(result);

    return null;  // 首版降级占位
  }

  private async checkAvailability(): Promise<boolean> {
    try {
      if (this.config.connection.type === "http") {
        const res = await fetch(`${this.config.connection.url}/health`, {
          signal: AbortSignal.timeout(5000),
        });
        return res.ok;
      }
      // stdio: 尝试启动进程
      return false; // 首版仅支持 HTTP 模式
    } catch {
      return false;
    }
  }
}
```

### 5B.5 编织逻辑（注入 impact_analysis handler）

在现有的 `impact_analysis` handler 的 `analyzeRepo()` 中，**在调用自建调用链分析之前**插入编织步骤：

```typescript
// src/impact-analysis/handler.ts 的 analyzeRepo() 中新增

async function analyzeRepo(...) {
  // ... 现有 SHA 范围确定 + 变更文件获取 ...

  // ★ 新增: 0. 查询并调用外部分析器
  const externalResults: AnalyzerImpactItem[] = [];
  const degradationNotes: string[] = [];
  const matchedAnalyzers = matchAnalyzers(changedFiles);

  if (matchedAnalyzers.length > 0) {
    for (const analyzer of matchedAnalyzers) {
      try {
        const result = await analyzer.analyze(repo, changedFiles, from, to);
        if (result === null) {
          degradationNotes.push(`⚠️ ${analyzer.name} 不可用，降级跳过`);
        } else {
          externalResults.push(...result);
        }
      } catch (err: any) {
        degradationNotes.push(`❌ ${analyzer.name} 异常: ${err.message}`);
      }
    }
  }

  // ★ 新增: 1. 尝试自建调用链分析（有全景索引时）
  let callChainResult: CallChainImpact | null = null;
  const panoramaIdx = loadPanoramaIndex(repo.name);
  if (panoramaIdx) {
    callChainResult = reverseImpactAnalysis(/* 从 panoramaIdx 提取 */);
  }

  // ★ 新增: 2. 双源融合
  const merged = mergeAnalysisResults(
    callChainResult,
    externalResults,
    degradationNotes
  );

  // 3. 回退到旧的 glob 匹配（无全景索引且无外部结果）
  if (!merged) {
    return analyzeImpact(/* ... 现有 analyzer.ts 逻辑 */);
  }

  return merged;
}
```

### 5B.6 配置文件 (analyzers.conf.json)

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 全量调用图分析器",
      "enabled": false,
      "fileExtensions": [".java"],
      "connection": {
        "type": "http",
        "url": "http://localhost:3101/mcp"
      },
      "timeoutMs": 60000
    }
  ]
}
```

### 5B.7 与自建调用图的关系

| 维度 | 自建调用图 (code_panorama) | 外部分析器 (JACG) |
|------|---------------------------|-------------------|
| **分析方式** | tree-sitter 静态 AST 解析 | Java 字节码分析 |
| **准确性** | 中（反射/动态代理盲区） | 高（字节码级完整调用图） |
| **可用性** | 始终可用（纯本地） | 依赖外部 MCP Server 运行 |
| **覆盖范围** | .java 文件 | .java 文件 |
| **启动成本** | 需先 code_panorama scan | 无需预扫描 |
| **增量成本** | 增量 rebuild（秒级） | 每次实时分析 |
| **角色** | **基座** — 始终提供分析 | **增强** — 提升准确性和覆盖 |

### 5B.8 新增文件（Phase 5a 织入）

| 文件 | 说明 |
|------|------|
| `src/analyzer-registry/types.ts` | AnalyzerAdapter / AnalyzerConfig 类型 |
| `src/analyzer-registry/state.ts` | analyzers.conf.json 读写 + 种子文件 |
| `src/analyzer-registry/registry.ts` | 注册表 + matchAnalyzers() |
| `src/analyzer-registry/adapters/jacg.ts` | JACG 适配器（可用性检测 + 降级） |
| `src/impact-analysis/handler.ts` | 修改：注入编织逻辑 |
| `src/tests/analyzer-registry.test.ts` | 注册表 + JACG 适配器测试 |
| `analyzers.conf.json` | 种子配置文件 |

---

## 六、实施路线图

```
Week 1-2: Phase 2 — 代码全景解析
  ├─ npm i tree-sitter tree-sitter-java
  ├─ src/code-panorama/*  (8 files)
  ├─ 产出: panorama-index.json
  └─ 验证: 对真实 Java 项目 scan → 检查符号表+调用图完整性

Week 3: Phase 3a — 逆向调用链分析
  ├─ src/call-chain/* (2 files)
  ├─ impact_analysis handler 双模升级
  └─ 验证: impact_analysis 在有无全景索引下均可用

Week 3-4: Phase 5a — 分析器编织层（融合 JACG）
  ├─ src/analyzer-registry/* (5 files)
  ├─ impact_analysis handler 三源融合升级
  └─ 验证: JACG 不可用 → 自动降级；可用 → 双源聚合

Week 4: Phase 3b — 业务场景桥接 + 报告整合
  ├─ src/business-scenario/* (2 files)
  ├─ 报告增强 (API/MQ/Job影响 + 业务场景映射)
  └─ 验证: 端到端流程 (clone → scan → monitor → impact_analysis → 场景映射)
```

---

## 七、文件清单总览

### Phase 2 新增 (8 files)

| 文件 | 说明 |
|------|------|
| `src/code-panorama/types.ts` | PanoramaIndex / SymbolEntry / ApiEndpoint 等全类型 |
| `src/code-panorama/state.ts` | panorama-index.json 读写 |
| `src/code-panorama/scanner.ts` | 文件遍历 + 按语言分发 |
| `src/code-panorama/parsers/types.ts` | LanguageParser 接口 |
| `src/code-panorama/parsers/java/parser.ts` | tree-sitter Java 解析器 |
| `src/code-panorama/parsers/java/queries.ts` | tree-sitter S-expression queries |
| `src/code-panorama/symbol-extractor.ts` | 符号表提取 |
| `src/code-panorama/call-graph-builder.ts` | 调用图构建 |
| `src/code-panorama/framework-detector.ts` | 框架特征识别 (Controller/MQ/Job) |
| `src/code-panorama/handler.ts` | code_panorama MCP 工具处理 |

### Phase 5a 新增（分析器编织层，融合自 phase5a-jacg-integration.md）

| 文件 | 说明 |
|------|------|
| `src/analyzer-registry/types.ts` | AnalyzerAdapter / AnalyzerConfig / AnalyzerImpactItem 类型 |
| `src/analyzer-registry/state.ts` | analyzers.conf.json 读写 + 校验 + 种子文件 |
| `src/analyzer-registry/registry.ts` | 分析器注册表 + matchAnalyzers() |
| `src/analyzer-registry/adapters/jacg.ts` | JACG 适配器（可用性检测 + 降级） |
| `src/impact-analysis/handler.ts` | 修改：注入三源编织逻辑 |
| `src/tests/analyzer-registry.test.ts` | 注册表 + JACG 适配器测试 |
| `analyzers.conf.json` | 种子配置文件 |

### 总文件清单

| Phase | 新增 | 修改 | 说明 |
|-------|:--:|:--:|------|
| Phase 2 | 12 | 2 | code_panorama 全景解析 |
| Phase 3a | 4 | 2 | call-chain 调用链 + business-scenario 桥接 |
| Phase 5a | 5 | 1 | analyzer-registry 编织层（JACG 融合） |
| **合计** | **21** | **5** | |

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/call-chain/types.ts` | 新增 | CallChainImpact / CallChainPath |
| `src/call-chain/analyzer.ts` | 新增 | 逆向BFS调用链分析 |
| `src/business-scenario/types.ts` | 新增 | ScenarioNode / ScenarioTree |
| `src/business-scenario/mapper.ts` | 新增 | 技术→业务映射 |
| `src/impact-analysis/handler.ts` | 修改 | 集成调用链双模逻辑 |
| `src/tools/schemas.ts` | 修改 | 新增 code_panorama Schema |

### 配置文件

| 文件 | 说明 |
|------|------|
| `panorama.conf.json` | 全景解析配置（语言、框架检测开关、排除模式） |
| `business-scenario.conf.json` | 业务场景桥接配置（可选，Phase 4） |

---

## 八、风险与缓解

| 风险 | 等级 | 缓解 |
|------|:--:|------|
| tree-sitter-java 跨平台安装失败 | 中 | 提供预编译 binary + fallback 正则解析 |
| 大型仓库 AST 全量解析耗时长 | 中 | 增量 rebuild + 并行 worker_threads |
| 静态调用图不完整（反射/动态代理） | 高 | 标注 confidence + 文档说明覆盖范围 |
| JACG 外部分析器不可用 | 低 | 自建调用图独立运行，JACG 作为增强而非依赖 |
| Playwright MCP 未开发完成 | 中 | Phase 3b 独立于 Phase 2/3a，不影响核心链路 |
