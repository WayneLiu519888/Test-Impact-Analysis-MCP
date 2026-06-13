# ADR-0001: 第三方分析器集成模式 — MCP 编织 vs 内嵌代码

**日期**：2026-06-14
**状态**：accepted
**决策者**：TIA 架构设计

---

## Context

TIA 需要引入 java-all-call-graph（一个 Java 静态调用链分析工具）的能力。该工具已有：
- `java-all-call-graph`：核心 Java 库（566 stars, Maven Central 发版），解析 Java 字节码生成方法调用关系图
- `java-all-call-graph-server`：2026 年 5 月发布的 MCP Server 版，暴露 MCP 工具给大模型 Agent

未来还计划引入更多分析能力（SQL 分析、性能分析、Python/Go/C++ 调用链分析等），需要选择一个可持续扩展的集成模式。

两个方案：
- **方案 A（内嵌代码）**：将 java-all-call-graph 的 Java 代码引入 TIA 项目，作为 TypeScript 进程的子进程调用
- **方案 B（MCP 编织）**：独立安装 java-all-call-graph-server MCP，TIA 通过 MCP 协议调用其暴露的工具

---

## Decision

**采用方案 B：MCP 编织（MCP-to-MCP delegation）。**

TIA 作为"编织层"（Orchestrator MCP），不内嵌任何第三方分析器的代码。每个外部分析器（如 java-all-call-graph-server）作为独立的 MCP Server 运行，TIA 通过 `ListTools` 发现其工具并通过 `CallTool` 调用，将结果聚合后返回给上层 Agent。

```
┌──────────────────────────────────────────────────────┐
│  Claude Code / OpenCode / Codex (Host Agent)         │
│    └─ MCP Client                                     │
└───────────┬──────────────────────────────────────────┘
            │ MCP 协议（stdio / HTTP）
┌───────────▼──────────────────────────────────────────┐
│  TIA MCP Server (编织层 / Orchestrator)               │
│  ├─ repo_monitor / repo_clone / impact_analysis      │
│  ├─ test_recommendation / risk_assessment            │
│  └─ impact_analysis (enhanced)                       │
│       ├─ Phase 1: 文件级匹配（当前）                   │
│       ├─ Phase 2: 调用链级分析（委托给 JACG）         │
│       └─ 未来: SQL/Perf/Python 分析（委托给对应 MCP）  │
└─────┬────────────┬──────────────┬────────────────────┘
      │ MCP        │ MCP          │ MCP
┌─────▼────┐ ┌─────▼──────┐ ┌─────▼──────────┐
│ JACG     │ │ SQL        │ │ Performance    │
│ MCP      │ │ Analyzer   │ │ Analyzer       │
│ Server   │ │ MCP Server │ │ MCP Server     │
│ (Java)   │ │ (Python?)  │ │ (Go/Rust?)     │
└──────────┘ └────────────┘ └────────────────┘
```

---

## Alternatives Considered

### 方案 A：内嵌代码

将 java-all-call-graph 的 JAR 引入 TIA，通过 `child_process.execFile("java", ["-jar", "jacg.jar", ...])` 调用。

- **Pros**：部署简单（单一进程），无网络依赖
- **Cons**：
  - TIA 是 TypeScript/MCP 项目，引入 Java 会破坏技术栈一致性
  - 每个分析器都需要子进程封装 → 大量重复代码
  - 每个分析器升级需要 TIA 重新发版
  - 横向扩展时变成"大杂烩"：TypeScript + Java + Python + Go 混在一个仓库
  - java-all-call-graph 已有 MCP Server，重新封装是重复劳动
- **Why not**：java-all-call-graph-server 已经提供了标准 MCP 接口，再用子进程封装是重新发明轮子

### 方案 B：MCP 编织（选择）

每个分析器独立运行 MCP Server，TIA 作为编织层调用它们。

- **Pros**：
  - 技术栈解耦：每个分析器用自己的语言/运行时
  - 独立升级：升级 JACG 不需要改 TIA 代码
  - 横向扩展简单：新分析器只需要暴露 MCP 工具
  - 利用已有生态：java-all-call-graph-server 已有 MCP 版
  - 安全隔离：每个分析器在独立进程中运行，崩溃不互相影响
  - 按需加载：Agent 可以选择性地启用分析器
- **Cons**：
  - 部署多进程：每个分析器需要单独启动
  - MCP 调用增加网络开销（本地 stdio 可缓解）
  - TIA 需要处理下游 MCP 不可用的容错
- **Why this**：横向扩展能力是首要目标，技术栈解耦是可持续架构的前提

---

## Consequences

### Positive

- TIA 项目保持纯 TypeScript/MCP 技术栈，不引入 Java/Python 依赖
- 新增分析器只需配置 MCP 连接 + 添加少量适配代码（~30 行/分析器）
- java-all-call-graph-server 的 MCP 工具可被 TIA 和上层 Agent 同时直接使用
- 每个分析器的版本独立管理，互不干扰
- impact_analysis 工具可以透明地调用下游分析器，对上层 Agent 表现为单一入口

### Negative

- 部署复杂度增加：每个分析器需要自己的 JDK/Python 环境和启动命令
- MCP 调用链变长：Host Agent → TIA → JACG MCP，调试难度增加
- 下游 MCP 不可用时，TIA 需要优雅降级（当前已有此机制）

### Risks

- **下游 MCP 协议不兼容**：MCP 协议版本升级可能导致编织层失效 → 固定 MCP SDK 版本
- **性能瓶颈**：多层 MCP 调用增加延迟 → 异步并发调用 + 本地 stdio transport 降低开销
- **工具名冲突**：不同分析器可能有同名工具 → TIA 适配层做 namespacing
