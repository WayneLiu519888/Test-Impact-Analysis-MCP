# Test Impact Analysis MCP Server（简称 TIA）

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/-MCP-black?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)

> **面向软件测试人员的 MCP 工具集** | **6 个核心工具** | **双 Transport 模式** | **3 平台适配器** | **跨 AI 编程框架支持**

---

<div align="center">

**🌐 语言 / Language / 語言**

[**English**](README.en.md) | [简体中文](README.zh-CN.md) | [繁體中文](docs/zh-TW/README.md) | [日本語](docs/ja-JP/README.md)

</div>

---

**面向软件测试人员的智能化 MCP（Model Context Protocol）工具集。覆盖测试生命周期中的"变更感知 → 影响分析 → 用例推荐 → 风险评估"全链路。**

通过 stdio / http 双模 Transport 向 Claude Code、OpenCode、Codex 等 AI 编程框架暴露测试分析能力。持续监控代码仓库变更，自动拉取增量代码，为测试人员提供基于代码变更的测试影响分析。

---

## 🎯 项目定位
---

## 🏗️ 初始化与安全

> ⚠️ **首次使用必读** — clone 后只需 3 步即可安全使用，企业敏感配置永不泄露。

### 1. 初始化（3 步上手）

```bash
# 第 1 步：克隆仓库
git clone git@github.com:xxx/TIA.git && cd TIA

# 第 2 步：安装依赖（自动安装 git hooks）
npm install

# 第 3 步：配置你的仓库
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # 填入你要监控的仓库信息
```

### 2. 安全边界（三层防护）

TIA 严格区分**源码层**与**企业配置层**，确保企业内部信息永远不会提交到 GitHub：

```
┌──────────────────────────────────────────────┐
│  GitHub 仓库（源码层 — 安全可提交）             │
│  src/  docs/  examples/  CLAUDE.md  README   │
├──────────────────────────────────────────────┤
│  enterprise/  ← 🔒 企业配置层（永不提交）       │
│  monitors.conf.json  server.conf.json 等      │
│  ⚠️ 整个目录被 .gitignore 排除                │
└──────────────────────────────────────────────┘
```

| 防线 | 触发时机 | 机制 |
|------|----------|------|
| **第 1 层** | 文件落盘 | `.gitignore` 排除 `enterprise/` 及根目录敏感文件 |
| **第 2 层** | `git commit` | `.githooks/pre-commit` 5 条规则实时拦截 |
| **第 3 层** | `git push` / PR | `.github/workflows/security-check.yml` CI 自动扫描 |

### 3. 双环境无感切换

```
【在家 → GitHub】            【公司 → 内网分析】
git push → GitHub          git clone TIA（只读）
源码层不含企业信息 ✅         enterprise/ 配企业仓库
                           拉代码 → 分析 → 不推送 ✅
```

### 4. 验证安装

```bash
npm run security-check   # 源码层应显示 ✅ 自查通过
npm test                 # 83 个测试应全部通过
```

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → 定时触发 repo_monitor(action='check')│
│  ├─ /repo_xxx 斜杠命令 → 快捷操控                    │
│  └─ MCP Client (stdio / http transport)               │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (本地)  │ http (远程, 需认证)
┌─────────▼────────┐ ┌──▼───────────────────────────────┐
│ 直接进程通信      │ │ Express App (port 3100)          │
│ (零配置)          │ │  ├─ 第 0 层: IP 白名单           │
│ 直接执行 git clone │ │  ├─ 第 1 层: API KEY 校验       │
│                   │ │  │   (TIA-init 免检)            │
│                   │ │  ├─ /mcp → Streamable HTTP       │
│                   │ │  └─ /health                      │
└───────────────────┘ └──────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ TIA MCP Server (本项目)                              │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 1: Git Monitor (✅ 已实现)               │     │
│  │  ├─ 3 个 Tool — TIA-init / repo_monitor / repo_clone │
│  │  ├─ 3 种平台适配器 (GitHub / Local / Generic)  │     │
│  │  └─ 配置/状态分离 + seenShas 去重               │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 2: Impact Analysis (✅ 已实现)               │     │
│  │  ├─ impact_analysis Tool                         │     │
│  │  ├─ glob 规则匹配引擎 + 置信度计算                  │     │
│  │  └─ 自动推断测试映射                               │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 3: Test Recommendation (✅ 已实现)          │     │
│  │  ├─ test_recommendation Tool                   │     │
│  │  ├─ 推荐分计算 + 排序 (权重×置信度)              │     │
│  │  └─ 最小可行测试集生成                            │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 4: Risk Assessment (✅ 已实现)              │     │
│  │  ├─ risk_assessment Tool                       │     │
│  │  ├─ 三位风险评分 (文件/模块/置信度)               │     │
│  │  └─ 智能缓解建议生成                              │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 步骤 1：配置 MCP 连接

**本地模式（stdio）** — 零配置，直接使用：

```json
// .claude/settings.local.json
{
  "enabledMcpjsonServers": ["test-impact-analysis"]
}
```

**远程模式（HTTP）** — 跨网络调用：

```json
{
  "mcpServers": {
    "test-impact-analysis": {
      "type": "http",
      "url": "http://your-server:3100/mcp",
      "headers": {
        "X-Agent-Type": "ClaudeCode",
        "X-API-Key": "your-api-key-here"
      }
    }
  }
}
```

### 步骤 2：初始化客户端

首次连接时调用 `TIA-init` 工具，自动完成 API KEY 签发和命令文件注册：

```bash
# Claude Code 中直接输入
TIA-init
```

### 步骤 3：配置要监控的仓库

编辑 `monitors.conf.json`，添加要监控的仓库：

```jsonc
{
  "repositories": [
    {
      "name": "my-backend",
      "url": "git@github.com:myteam/backend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "backend",
      "module": "用户中心"
    }
  ]
}
```

### 步骤 4：开始使用

```bash
# 查看所有仓库水位
/repo_status

# 检查新提交
/repo_check

# 按模块检查
/repo_check module=用户中心

# 克隆代码到本地分析
/repo_clone full module=用户中心
```

✨ **完成！** 你现在拥有了代码变更自动感知 + 增量代码拉取能力。

---

## 📦 里面有什么

```
Test-Impact-Analysis-mcp/
│
├── 📦 源码层（提交到 GitHub）
│   ├── src/                        # 核心源码
│   │   ├── index.ts                # MCP Server 入口 + Transport 双模启动
│   │   ├── state.ts                # 配置/状态读写、水位管理
│   │   ├── paths.ts                # 路径定位 + resolveConfigPath
│   │   ├── security.ts             # IP 白名单 + API KEY 安全
│   │   ├── platforms/              # Git 平台适配器层
│   │   ├── tools/                  # MCP 工具模块（6 个工具）
│   │   ├── impact-analysis/        # 影响分析模块（Phase 2-4）
│   │   └── tests/                  # 单元测试（83 个）
│   ├── docs/                       # 多语言文档
│   ├── examples/                   # 配置模板（.example.json）
│   ├── scripts/                    # 安全自查脚本
│   ├── .githooks/                  # Git 安全钩子（pre-commit）
│   ├── .github/workflows/          # CI 安全扫描
│   ├── .claude/commands/           # Claude Code 斜杠命令
│   ├── .opencode/commands/         # OpenCode 命令
│   ├── .codex/skills/             # Codex 技能
│   ├── README.md                   # 项目入口
│   └── impact-rules.conf.json      # 影响分析规则（示例）
│
├── 🔒 企业配置层（.gitignore 排除，永不提交）
│   └── enterprise/                 # 你的真实配置放这里
│       ├── monitors.conf.json      # 仓库监控配置
│       ├── server.conf.json        # HTTP 安全配置
│       └── .mcp.json               # MCP 连接配置
│
└── 🚫 运行时产物（.gitignore 排除）
    └── monitors.json               # 程序维护的水位状态
```

---

## 🛠️ 核心工具

### 克制设计原则

> **MCP 工具越多 → 上下文膨胀 → LLM 推理能力下降。** 本项目初期从 7 个工具合并为 3 个（精简 57%），Phase 2-4 新增 3 个分析工具（共 6 个），每个都有独立的数据源和副作用边界。

| 原则 | 做法 |
|------|------|
| 能通过配置文件完成的事 | **不建工具**。直接编辑 JSON |
| 不同数据源/副作用 | 独立工具（impact_analysis / test_recommendation / risk_assessment） |
| 语义相近可合并 | 合并到已有工具的 `action` 参数 |

### 工具 1：`repo_monitor` — 统一仓库监控

三种操作通过 `action` 参数选择：

#### `action=status` — 查看水位状态

```bash
repo_monitor(action="status")                     # 全部仓库
repo_monitor(action="status", name="gh-backend")  # 单个仓库
repo_monitor(action="status", module="用户中心")   # 按模块
```

返回示例：

```
📊 共监控 5 个仓库:

📦 gh-backend  [模块: 示例模块]
   类型: backend    平台: github     分支: main
   水位: a1b2c3d   上次检查: 2026/6/13 14:30:00
   最近重置: "Sprint 25 kickoff" (e4f5g6h → a1b2c3d)
```

#### `action=check` — 检查新提交

对比远程 HEAD 与本地水位，返回新提交摘要。**首次检查自动初始化水位**。

```bash
repo_monitor(action="check")                      # 全部仓库
repo_monitor(action="check", name="gh-backend")   # 单个仓库
repo_monitor(action="check", module="用户中心")   # 按模块
```

配合定时监控：

```bash
# 每 15 分钟自动检查全部仓库
/cron "*/15 * * * *" "repo_monitor(action='check')"

# 每 2 小时检查某模块
/cron "7 */2 * * *" "repo_monitor(action='check', module='用户中心')"
```

#### `action=reset` — 重置水位（迭代切换）

```bash
# 普通重置 — 直接重置到当前远程 HEAD
repo_monitor(action="reset", name="gh-backend", label="手动重置")

# 日期定位 — 自动查找迭代第一个 MR 的 base commit
repo_monitor(action="reset", module="用户中心", label="Sprint 26 启动", sinceDate="2026-06-13")
```

### 工具 2：`repo_clone` — 克隆代码到本地

按 `repoType` 自动选择存储路径：

```
{baseDir}/Repository/
├── Frontend repository/   ← repoType="frontend"
│   └── {repo-name}/
│       ├── {branch}/      ← mode=full 全量
│       └── {mr-id}/       ← mode=incremental
└── Backend repository/    ← repoType="backend"
    └── {repo-name}/
```

#### mode=full — 全量克隆

```bash
repo_clone(mode="full", name="gh-backend")               # 单个仓库初始化
repo_clone(mode="full", module="用户中心")                # 按模块批量初始化
repo_clone(mode="full", name="gh-backend", force=true)   # 强制覆盖
```

#### mode=incremental — 增量克隆 MR

```bash
# 按日期拉取
repo_clone(mode="incremental", module="用户中心", sinceDate="2026-06-01")

# 按基线 MR 拉取
repo_clone(mode="incremental", name="gh-backend", sinceMrId="1234")
```

### 工具 3：`TIA-init` — 客户端初始化引导

首次连接时调用，自动完成：
- 🔑 API KEY 签发（SHA-256 哈希存储）
- 📁 命令文件注册（自动识别 Claude Code / OpenCode / Codex）
- 🔗 MCP 配置模板返回

```bash
TIA-init
# 或指定 Agent 类型
TIA-init(agentType="ClaudeCode")
```

### 工具 4：`impact_analysis` — 代码变更影响分析

基于 `impact-rules.conf.json` 中配置的文件→测试映射规则，自动匹配变更文件对应的测试模块。

```bash
impact_analysis(name="gh-backend")              # 分析从水位到 HEAD
impact_analysis(name="gh-backend", from="a", to="b")  # 指定 SHA 范围
impact_analysis(module="用户中心")               # 按模块批量分析
```

**匹配策略**: glob 匹配 + 四级置信度（精确 95% / 目录 70% / 通配 45% / 推断 30%）

### 工具 5：`test_recommendation` — 智能测试推荐

在影响分析结果上计算推荐分，按优先级排序，生成最小可行测试集。

```bash
test_recommendation(name="gh-backend")
test_recommendation(module="用户中心")
```

**推荐分** = 风险权重 (high=100 / medium=50 / low=20) × 置信度 (0-100)  
**分组**: 强烈建议 (≥7000) | 建议 (≥2000) | 可选

### 工具 6：`risk_assessment` — 变更风险评估

量化代码变更风险，综合文件数量、模块风险分布、置信度三维度计算。

```bash
risk_assessment(name="gh-backend")
risk_assessment(module="用户中心")
```

**评分**: 文件分 (0-60) + 模块分 (0-40) + 置信度惩罚 (0-20) = 0-100  
**等级**: 🟢 低 (≤30) | 🟡 中 (31-60) | 🟠 高 (61-85) | 🔴 严重 (86-100)

---

## 🔧 JACG 安装配置 🔜 Phase 5b 规划中

> **JACG**（Java All Call Graph）是 TIA Phase 5b 的核心增强——通过方案 D（子进程 jar 调用）集成，为 Java 项目提供**字节码级调用链分析能力**。JACG 作为可选依赖：JDK 可用时增强分析精度，不可用时自动降级到现有文件级 glob 匹配。

### JACG 是什么？

基于 Java 字节码（ASM）的静态调用链分析引擎。它可以从方法 A 正向追踪到所有下游调用，也可以从方法 B 逆向追溯到所有上游入口（Controller / MQ 消息消费 / 定时任务）。在 TIA 中，JACG 将当前的"文件级测试映射"升级为"方法级端到端调用链分析"。

### 前置要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| JDK | >= 11（推荐 17+） | 运行时依赖。不可用时 TIA 自动降级为文件级 glob 匹配 |
| java-all-call-graph JAR | 已包含在 `lib/jacg/` 中 | 项目自带预编译 JAR，无需额外下载 |

### 多平台安装

#### Claude Code 环境

```bash
# 步骤1：确认 JDK 可用
java -version  # 应输出 JDK 11+

# 步骤2（如未安装）：安装 JDK
# macOS
brew install openjdk@17

# Ubuntu/Debian
sudo apt install openjdk-17-jdk

# Windows
# 下载 https://adoptium.net/ 的 .msi 安装包

# 步骤3：验证 JACG 集成状态
# 在 TIA 中运行影响分析：
impact_analysis(action="full", name="your-java-project")
# 输出 "📐 JACG 全量分析 (42s)" = 集成成功
# 输出 "⚠️ JDK 不可用，降级为文件匹配" = JDK 未配置
```

#### OpenCode 环境

```json
// .opencode.json — 确保 TIA 通过 stdio 连接
{
  "mcpServers": {
    "test-impact-analysis": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"]
    }
  }
}
```
JDK 安装步骤与 Claude Code 相同。

#### Codex 环境

```toml
# .codex/config.toml
[mcp_servers.test-impact-analysis]
command = "npx"
args = ["tsx", "src/index.ts"]
enabled = true
```
JDK 安装步骤与上述相同。

### 配置文件

`analyzers.conf.json`（规划中恢复）中 JACG 相关配置项：

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 调用链分析",
      "enabled": true,              // false 可禁用
      "fileExtensions": [".java"],
      "confidenceWeight": 90,
      "config": {
        "jarPath": "lib/jacg/java-all-call-graph.jar",
        "maxHeap": "2g",            // JVM 最大堆内存
        "timeout": 600              // 超时秒数
      }
    }
  ]
}
```

### 工作模式

| 模式 | 触发方式 | 说明 |
|------|---------|------|
| 全量预生成 | `impact_analysis(action="full", name="xxx")` | 调用 JACG 对全量 Java 代码生成调用图，落盘 `.tia/` 目录 |
| 增量实时分析 | `impact_analysis(name="xxx", mrId="1423")` | 变更文件 → 查全景索引 → 逆向 BFS 遍历 → 精准定位受影响 API |
| 降级兜底 | 自动（JDK 不可用时） | 自动降级为文件级 glob 匹配（当前默认行为） |

### 效果对比

| 分析方式 | 精度 | 示例 |
|----------|:--:|------|
| 文件级 glob 匹配（当前） | 文件→测试映射 | `OrderService.java` 变更 → 建议运行 `OrderServiceTest` |
| JACG 调用链分析（Phase 5b） | 方法→API 端点到端链路 | `OrderService.createOrder()` → `OrderController.createOrder()` → `POST /api/orders` |

### 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| `⚠️ JDK 不可用` | java 不在 PATH 中 | `which java` 确认路径，或设置 `JAVA_HOME` |
| `JACG 超时` | 项目过大 | 增大 `analyzers.conf.json` 中的 `timeout` 值 |
| `OutOfMemoryError` | 堆内存不足 | 增大 `maxHeap`（如 `"4g"`） |
| `JAR 文件缺失` | `lib/jacg/*.jar` 不存在 | 运行 `scripts/download-jacg.sh` 下载/构建 |

> ⚠️ **本章节所有内容为 Phase 5b 规划预览，尚未实现。** 当前 TIA 使用文件级 glob 匹配进行影响分析，功能完全可用。

---

## 🗺️ 命令速查

| 命令 | 用法 | 说明 |
|------|------|------|
| `/repo_monitor` | `/repo_monitor <action> [name=\|module=] [flags]` | 统一监控入口 |
| `/repo_clone` | `/repo_clone <mode> <name=\|module=> [flags]` | 统一克隆入口 |
| `/repo_status` | `/repo_status [name=\|module=]` | 查看仓库水位（快捷命令） |
| `/repo_check` | `/repo_check [name=\|module=]` | 检查新提交（快捷命令） |
| `/repo_reset` | `/repo_reset <target> [--label] [--since]` | 重置水位（快捷命令） |
| `impact_analysis` | `impact_analysis [name=\|module=] [from=] [to=]` | 代码变更影响分析 |
| `test_recommendation` | `test_recommendation [name=\|module=] [from=] [to=]` | 智能测试推荐 |
| `risk_assessment` | `risk_assessment [name=\|module=] [from=] [to=]` | 变更风险评估 |

### 常用示例

```bash
/repo_status                                    # 查看全部仓库水位
/repo_status name=gh-backend                    # 查看单个仓库
/repo_check module=用户中心                      # 检查模块新提交
/repo_reset module=用户中心 --label "S26" --since 2026-06-13  # 迭代切换
/repo_clone full name=gh-backend                # 全量克隆
/repo_clone incremental module=用户中心 --since 2026-06-01    # 增量拉 MR
```

---

## 🌐 跨平台支持

同一套 MCP 工具，三个 AI 编程框架共享。

| 维度 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **命令目录** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
| **文件格式** | `.md` (frontmatter + 指令) | `.md` ($NAME 占位符) | `SKILL.md` (YAML frontmatter) |
| **调用方式** | `/命令名` | `Ctrl+K` 命令面板 | `$技能名` |
| **MCP 配置** | `.claude/settings.local.json` | `.opencode.json` → `mcpServers` | `.codex/config.toml` → `[mcp_servers]` |

### 命令/技能映射

| 功能 | Claude Code | OpenCode | Codex |
|------|------------|----------|-------|
| 统一监控 | `/repo_monitor` | `repo_monitor` cmd | `$repo-monitor` |
| 统一克隆 | `/repo_clone` | `repo_clone` cmd | `$repo-clone` |
| 查看水位 | `/repo_status` | `repo_status` cmd | `$repo-status` |
| 检查更新 | `/repo_check` | `repo_check` cmd | `$repo-check` |
| 重置水位 | `/repo_reset` | `repo_reset` cmd | `$repo-reset` |
| 影响分析 | `impact_analysis` | `impact_analysis` cmd | `$impact-analysis` |
| 测试推荐 | `test_recommendation` | `test_recommendation` cmd | `$test-recommendation` |
| 风险评估 | `risk_assessment` | `risk_assessment` cmd | `$risk-assessment` |

---

## 🔌 Transport 双模

| 模式 | 环境变量 | Transport | repo_clone 行为 | 适用场景 |
|------|---------|-----------|----------------|---------|
| stdio | 默认 | `StdioServerTransport` | 直接执行 git clone | 本地开发 / 单机使用 |
| http | `MCP_TRANSPORT=http` | `StreamableHTTPServerTransport` | 返回指令，客户端执行 | 远程调用 / 多客户端 |

### HTTP 模式启动

```bash
# 基础启动
MCP_TRANSPORT=http npx tsx src/index.ts

# 自定义端口
MCP_TRANSPORT=http MCP_PORT=4200 npx tsx src/index.ts
```

### 安全认证（两层防护）

```
第 0 层 (Express 中间件): 所有 /mcp 请求 → IP 白名单校验 → 通过/403
                            │
              ┌─────────────┼─────────────┐
              ▼                           ▼
         TIA-init 工具              其他所有工具
         (免 API KEY)              (必检 API KEY)
              │                           │
              ▼                           ▼
      签发 API KEY                  校验 API KEY
      返回命令文件                  touchApiKey (更新 lastUsed)
```

---

## 🏗️ 架构设计

### 分层架构（单向依赖）

| 层 | 文件 | 职责 | 依赖 |
|----|------|------|------|
| **类型层** | `types.ts` + `platforms/types.ts` | 所有类型定义 + 适配器接口 | 无 |
| **状态层** | `state.ts` | 配置/状态读写、水位管理、快照归档 | 类型层 |
| **安全层** | `security.ts` | IP 白名单校验、API KEY 签发/校验 | 类型层 |
| **工具层** | `tools/*.ts` | 6 个 Tool 的 Schema + 路由 | 状态层 + 安全层 + 适配器层 |
| **影响分析层** | `impact-analysis/*.ts` | 规则匹配 / 推荐 / 风险评估 | 类型层 + 状态层 |
| **适配器层** | `platforms/*.ts` | Git 平台 API 封装，实现 `PlatformAdapter` | 类型层 |
| **入口** | `index.ts` | Transport 双模启动 + 安全中间件注入 | 以上全部 |

### 适配器模式

| 平台 | 适配器 | HEAD | 提交区间 | MR 定位 | MR 列表 |
|------|--------|------|---------|--------|--------|
| `github` | `GitHubAdapter` | REST API `/git/refs` | `/compare` API | 查 closed PRs 过滤 | 分页查 closed PRs |
| `local` | `LocalGitAdapter` | `git rev-parse` | `git log base..head` | `git log --merges` | 不支持 sinceMrId |
| `generic` | `GenericGitAdapter` | 通用 API 模板 | 100 条本地截取 | `mrApiTemplate` 兼容 | `mrApiTemplate` 分页 |

### 状态管理

- **配置与状态分离**：`monitors.conf.json`（用户手写）↔ `monitors.json`（程序维护）
- **seenShas 去重**：最多 500 条，防止重复上报
- **水位快照归档**：最多 20 条，保留迭代切换历史
- **API KEY 安全**：仅存 SHA-256 哈希，原始 key 仅在签发时显示一次

---

## 📋 配置参考

### monitors.conf.json

```jsonc
{
  "repositories": [
    {
      "name": "my-backend",                    // 仓库别名，全局唯一
      "url": "git@github.com:myteam/backend.git", // Git 远程 URL
      "platform": "github",                    // github | local | generic
      "branch": "main",                        // 监控的分支
      "repoType": "backend",                   // frontend | backend
      "module": "用户中心",                     // 业务模块名
      "auth": { "type": "none" }               // none | token | rsa
    },
    {
      "name": "codehub-order",
      "url": "git@<YOUR-GIT-HOST>:<YOUR-ORG>/example-project.git",
      "platform": "generic",
      "branch": "develop",
      "repoType": "backend",
      "module": "订单系统",
      "genericConfig": {
        "apiBase": "https://<YOUR-GIT-HOST>",
        "apiTemplate": "/api/v1/projects/{owner}/repos/{repo}/commits?ref={branch}",
        "mrApiTemplate": "/api/v1/projects/{owner}/repos/{repo}/merge_requests?state=merged&target_branch={branch}&order_by=created_at&sort=asc"
      }
    }
  ]
}
```

### 影响分析规则配置

TIA 使用两级规则体系来定义"文件变更 → 测试用例"的映射关系，支撑 `impact_analysis`、`test_recommendation`、`risk_assessment` 三个分析工具。

#### 两级规则体系

```
通用规则（第 1 级）              企业规则（第 2 级）
impact-rules.conf.json        enterprise/impact-rules.conf.json
├─ 项目根目录                   ├─ enterprise/ 目录（.gitignore 排除）
├─ 可提交到 GitHub              ├─ 仅本地有效，永不提交
└─ 所有用户开箱即用              └─ 企业内部定制规则

最终生效 = 通用规则 ∪ 企业规则（同 id 企业覆盖通用）
```

#### 快速上手（3 步）

```bash
# 第 1 步：查看通用规则（已有示例）
cat impact-rules.conf.json

# 第 2 步：创建企业规则（从模板复制）
cp examples/impact-rules.conf.example.json enterprise/impact-rules.conf.json

# 第 3 步：编辑企业规则，取消注释适用的预设规则
vim enterprise/impact-rules.conf.json
```

#### 规则字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|:--:|------|
| `id` | string | ✅ | 唯一标识。企业规则建议使用 `ent-` 前缀避免冲突 |
| `name` | string | ✅ | 规则名称，便于识别 |
| `description` | string | ❌ | 规则描述，说明该规则覆盖的业务场景 |
| `filePatterns` | string[] | ✅ | 文件匹配的 glob 模式（支持 `**` `*` `{a,b}`） |
| `testPaths` | string[] | ✅ | 对应的测试文件或测试目录路径 |
| `riskLevel` | "high" / "medium" / "low" | ✅ | 风险等级，影响推荐分和风险评估 |
| `appliesTo` | object | ❌ | 规则适用范围筛选（见下方说明） |

#### `appliesTo` 筛选逻辑

通过 `appliesTo` 可让规则仅对特定仓库/模块生效，避免全量匹配：

| 维度 | 字段 | 示例 | 说明 |
|------|------|------|------|
| 仓库别名 | `names` | `["order-service"]` | 仅对指定仓库生效 |
| 业务模块 | `modules` | `["订单系统"]` | 仅对指定模块生效 |
| 仓库类型 | `repoTypes` | `["backend"]` | `backend` / `frontend` |
| Git 平台 | `platforms` | `["github"]` | `github` / `generic` / `local` |

**规则**：多个维度之间是 **AND** 关系（同时满足），单个维度内是 **OR** 关系（命中任一即可）。

#### glob 模式速查

| 模式 | 说明 | 示例 |
|------|------|------|
| `**` | 匹配任意层级目录 | `src/**/*.java` — 所有 Java 文件 |
| `*` | 匹配单层目录内任意字符 | `src/*.ts` — src 目录下所有 TS 文件 |
| `{a,b}` | 匹配 a 或 b | `*.{ts,tsx}` — 所有 TS 和 TSX 文件 |

#### 预设规则模板速览

模板文件 `examples/impact-rules.conf.example.json` 提供 3 类预设规则（已注释），按需取消注释或修改：

| 类别 | 规则 ID | 适用场景 |
|------|---------|----------|
| **Java 后端** | `ent-controller` / `ent-service` / `ent-repository` / `ent-orm` / `ent-spring-config` | Controller / Service / Repository 层、ORM 映射、Spring 配置 |
| **JS 前端** | `ent-component` / `ent-state` / `ent-hooks` / `ent-api-service` / `ent-utils` | React 组件、状态管理、Hooks、API 服务层、工具函数 |
| **通用** | `ent-config` / `ent-db-migration` / `ent-security` | 配置文件、数据库迁移脚本、安全相关代码 |

#### 后续扩展指引

- **添加新规则**：在 `enterprise/impact-rules.conf.json` 中新增条目，参考预设模板格式
- **规则验证**：运行 `impact_analysis` 工具，观察输出中的 `matchType` 和 `confidence` 字段
- **规则数量建议**：10-30 条为推荐范围，超过 30 条建议按 `appliesTo` 拆分
- **定期审查**：每季度检查自动推断命中率（`matchType: "inferred"`），补充遗漏规则

#### FAQ

<details>
<summary><b>规则不生效怎么办？</b></summary>

1. 检查 `appliesTo` 筛选条件是否匹配当前仓库/模块
2. 检查 glob 模式是否匹配实际文件路径（注意相对路径基准）
3. 确认规则文件路径正确：通用 `impact-rules.conf.json`，企业 `enterprise/impact-rules.conf.json`
</details>

<details>
<summary><b>如何验证规则是否正确？</b></summary>

构造一个测试 MR，运行 `impact_analysis`，观察：
- `matchType: "exact"` 说明精确命中（置信度 95%）
- `matchType: "inferred"` 说明未命中任何规则，走了自动推断（置信度 30%）
- 如果预期命中的规则没生效，检查 glob 模式和 `appliesTo` 条件
</details>

<details>
<summary><b>通用规则和企业规则冲突怎么办？</b></summary>

同 `id` 的企业规则会覆盖通用规则。这是"企业定制优先"的设计，确保团队级规则不被通用规则干扰。
</details>

<details>
<summary><b>规则数量有上限吗？</b></summary>

无硬性上限，但建议控制在 30 条以内。规则过多会拖慢匹配性能，也增加维护负担。超过 30 条时考虑按 `appliesTo` 拆分到不同仓库。
</details>

---

## 🧪 典型工作流

```
# ─── 一次性配置 ───
# 1. 编辑 monitors.conf.json 添加要监控的仓库
# 2. 调用 TIA-init 完成初始化

# ─── 日常监控 ───
/repo_check                                        # 查看是否有新提交
/repo_check module=用户中心                         # 只看某模块

# ─── 拉代码分析 ───
/repo_clone full module=用户中心                    # 初始化全量代码
/repo_clone incremental module=用户中心 --since 2026-06-01  # 拉迭代内 MR

# ─── 迭代切换 ───
/repo_reset module=用户中心 --label "Sprint 26 启动" --since 2026-06-13

# ─── 定时监控 ───
/cron "*/15 * * * *" "repo_monitor(action='check')"

# ─── 影响分析 ───
impact_analysis(name="gh-backend")               # 变更影响了哪些测试？
test_recommendation(name="gh-backend")           # 先跑哪些测试？
risk_assessment(name="gh-backend")               # 这次变更风险多大？
```

---

## ❓ 常见问题

<details>
<summary><b>TIA 需要什么运行环境？</b></summary>

- Node.js >= 18
- TypeScript / ESM（`"type": "module"`）
- Git 命令行工具
- `tsx` 运行时（零构建步骤，直接执行 .ts）

```bash
npm start              # npx tsx src/index.ts
npm run dev            # tsx --watch（开发热重载）
npx tsc --noEmit       # 类型检查
```

</details>

<details>
<summary><b>为什么认证默认是 none？</b></summary>

绝大多数场景由本地 git SSH config + RSA 公钥完成鉴权。MCP Server 只需发起 git clone/fetch，认证走操作系统层面的 SSH agent。仅在需要 API 调用（如 GitHub REST API）时才需配置 token。

</details>

<details>
<summary><b>Generic 平台适配器支持哪些 Git 平台？</b></summary>

通过 `genericConfig.apiTemplate` 和 `genericConfig.mrApiTemplate` 可适配任何兼容 REST API 的 Git 平台：
- **GitLab**：使用 GitLab 格式的 API 路径
- **华为 CodeHub**：配置华为云 API 端点
- **Gitee**：配置码云 API 端点
- **自建 GitLab / Gogs / Gitea**：都可通过 URL 模板适配

适配器自动识别响应格式（GitHub 格式 vs GitLab 格式），并兼容多种数据结构容器（顶层数组 / `{data: []}` / `{items: []}`）。

</details>

<details>
<summary><b>增量克隆 (incremental) 的前提条件是什么？</b></summary>

1. 仓库必须配置了 `repoType`（frontend 或 backend）
2. 平台必须支持 MR/PR 查询：
   - GitHub：原生支持
   - Generic：需配置 `mrApiTemplate`
   - Local：仅支持 `sinceDate` 模式
3. 基础全量克隆必须先存在（增量克隆基于全量 clone 做 `git clone --no-hardlinks` 快速检出）

</details>

<details>
<summary><b>HTTP 模式下安全性如何保障？</b></summary>

双层防护：
- **第 0 层**：IP 白名单（精确 IP + CIDR 子网），非白名单 IP 直接返回 403
- **第 1 层**：API KEY 校验（SHA-256 哈希比对），仅 `TIA-init` 免检
- API KEY 不落盘明文，仅存哈希值
- `server.conf.json` 独立于 `monitors.conf.json`，安全配置不外泄

</details>

<details>
<summary><b>支持哪些 AI 编程框架？</b></summary>

目前已完成三平台适配：

| 框架 | 命令文件 | MCP 配置 |
|------|---------|---------|
| **Claude Code** | `.claude/commands/*.md` | `.claude/settings.local.json` |
| **OpenCode** | `.opencode/commands/*.md` | `.opencode.json` |
| **Codex** | `.codex/skills/*/SKILL.md` | `.codex/config.toml` |

</details>

---

## 🗺️ 开发路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | Git Monitor — 仓库变更感知与代码拉取 | ✅ 已完成 |
| Phase 1.5 | Transport 双模 + IP 白名单 | ✅ 已完成 |
| Phase 1.6 | `repo_clone` 远程模式（Transport 感知，自动返回指令） | ✅ 已完成 |
| Phase 1.7 | TIA-init 客户端初始化引导（API KEY 自助签发 + Commands 同步） | ✅ 已完成 |
| Phase 2 | Impact Analysis — 代码变更 → 受影响模块/用例分析 | ✅ 已完成 |
| Phase 3 | Test Recommendation — 基于变更智能推荐测试用例 | ✅ 已完成 |
| Phase 4 | Risk Assessment — 变更风险量化与报告 | ✅ 已完成 |
| Phase 5a | Analyzer Registry — MCP 编织层 | ✅ 已完成 |
| Phase 5b | JACG 调用链分析（双模引擎 + 融合引擎） | 🔜 规划中 |
| Phase 5c | SQL / Perf / Python / Go 分析器横向扩展 | 💡 构思中 |
| Phase 6 | 信息安全分层重构 — enterprise/ 隔离 | ✅ 已完成 |

---

## 🤝 贡献

**欢迎贡献！** 本项目面向软件测试场景，如果你有：

- 新的 Git 平台适配器
- 更好的配置文件模板
- 改进的测试分析算法
- 更多 AI 编程框架的命令适配

请提交 Issue 或 PR。

---

## 📄 技术栈

- TypeScript / ESM（`"type": "module"`）
- `@modelcontextprotocol/sdk` — MCP Server SDK
- Express.js（HTTP 模式）
- `tsx` — 运行时（零构建步骤）
- Node.js >= 18

```bash
npm start              # 启动 MCP Server
npm run dev            # 开发热重载
npx tsc --noEmit       # 类型检查（tsconfig strict: true）
```

---

## 📄 许可证

MIT — 自由使用，根据需要修改，如果可以请回馈贡献。

---

**如果本项目对你有帮助，请点亮 Star。把代码变更感知能力带给你的测试工作流。**
