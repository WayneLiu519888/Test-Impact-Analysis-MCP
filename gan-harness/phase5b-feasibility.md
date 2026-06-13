# Phase 5b 可行性分析：java-all-call-graph 接入 TIA 方案评估

**分析日期**: 2026-06-14
**分析对象**: java-all-call-graph (简称 JACG)
**目标**: 评估"源码引入"方式将 JACG 集成到 TIA 项目的可行性

---

## 一、JACG 项目架构

| 维度 | TIA | JACG | 兼容？ |
|------|-----|------|:---:|
| 语言 | TypeScript (ESM) | Java 8+ | **否** |
| 运行时 | Node.js >= 18 | JVM (JDK 11+) | **否** |
| 构建 | tsx 直接执行 | Gradle 多模块 | **否** |
| 核心依赖 | @modelcontextprotocol/sdk | ASM 9.x, SQLite | **否** |
| 代码规模 | ~3000 行 TS | 数万行 Java (5-8 子模块) | -- |

## 二、四种方案对比

| 方案 | 可行性 | 理由 |
|------|:--:|------|
| A: 源码引入 | ❌ | 语言异构反模式，Gradle构建链沉重，仓库膨胀50MB+ |
| B: Maven依赖 | ❌ | JACG未发布到公共仓库 |
| C: MCP Server | 🔜 | 蓝图长期目标，需自行包装JACG为MCP Server |
| **D: 子进程jar调用** | ✅ | 务实首选，~200行TS代码，jar不进Git |

## 三、推荐方案D的实施要点

- JDK作为**可选依赖**，不可用时自动降级glob匹配
- Phase 5b MVP：先打通 `action=full`（全量生成PanoramaIndex并落盘）
- 恢复 `analyzers.conf.json` 作为JACG配置入口
- 融合引擎暂缓，代码保留 `Promise.all(analyzers.map(...))` 扩展点

## 四、Phase 5b 实施文件清单

新增 7 个文件 + 修改 5 个文件，详见 `gan-harness/phase5b-feasibility.md` 完整版。
