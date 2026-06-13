# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Test Impact Analysis MCP Server（简称 TIA）

面向软件测试人员的 MCP 工具集，通过 stdio / http transport 向 Claude Code 暴露各类测试分析能力。
目标：覆盖测试生命周期中的**变更感知 → 影响分析 → 用例推荐 → 风险评估**全链路。

> ⚠️ `package.json` 中 `name` 为 `"test-impact-analysis-mcp"`，项目简称 **TIA**。

---

## 项目定位

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
│  │ 模块 2: Impact Analysis (✅ 已实现)            │     │
│  │  ├─ impact_analysis Tool — 代码变更影响分析    │     │
│  │  ├─ test_recommendation Tool — 智能测试推荐    │     │
│  │  ├─ risk_assessment Tool — 变更风险量化        │     │
│  │  ├─ glob 文件级匹配 + 自动推断 + 测试推荐引擎   │     │
│  │  └─ 0-100 风险评分 + 缓解建议                   │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 安全层: Security (✅ 已实现)                  │     │
│  │  ├─ IP 白名单 + DNS rebinding 防护            │     │
│  │  ├─ API KEY 签发 + SHA-256 哈希校验           │     │
│  │  └─ Transport 分级暴露 (visibility 字段)      │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 🎯 Claude Code 斜杠命令速查

> 所有命令定义在 `.claude/commands/` 目录，<kbd>/</kbd> 键一键调用，无需自然语言中转。

### 核心命令

| 命令 | 用法 | 说明 |
|------|------|------|
| `/repo_monitor` | `/repo_monitor <action> [name=\|module=] [flags]` | 统一监控入口 |
| `/repo_clone` | `/repo_clone <mode> <name=\|module=> [flags]` | 统一克隆入口 |
| `/repo_add` | `/repo_add <URL> <branch> <type> <module>` | 快速添加监控仓库 |
| `TIA-init` (MCP 工具) | 首次连接时调用，免斜杠命令 | 客户端初始化引导 |

### 快捷命令

| 命令 | 等价于 |
|------|--------|
| `/repo_status [name=\|module=]` | `/repo_monitor status` |
| `/repo_check [name=\|module=]` | `/repo_monitor check` |
| `/repo_reset <target> [--label] [--since] [--sha]` | `/repo_monitor reset` |

### 常用示例

```
/repo_status                                    # 查看全部仓库水位
/repo_status name=hermes-agent-evolution         # 查看单个仓库
/repo_check module=订单系统                      # 检查模块新提交
/repo_reset module=订单系统 --label "S26" --since 2026-06-13  # 迭代切换（日期定位）
/repo_reset name=mall --sha 2616ba4... --label "2025-09-28"  # 精确 SHA 重置
/repo_clone full name=hermes-agent-evolution     # 全量克隆
/repo_clone incremental module=订单系统 --since 2026-06-01    # 增量拉MR
/repo_clone sync name=mall                      # 同步已有克隆到远程最新
/repo_add git@github.com:user/repo.git branch=main backend 电商系统  # 添加仓库
```

### 参数速查

| 参数 | 适用命令 | 说明 |
|------|---------|------|
| `name=xxx` | 全部 | 仓库别名（精确匹配） |
| `module=xxx` | 全部 | 模块名（批量操作） |
| `--force` | repo_clone | 强制覆盖已有目录 |
| `--label "xxx"` | repo_monitor reset / repo_reset | 重置标签 |
| `--since YYYY-MM-DD` | repo_monitor reset / repo_reset / repo_clone incremental | 日期过滤 |
| `--sha <SHA>` | repo_monitor reset / repo_reset | 精确 SHA 重置 |
| `--mr ID` | repo_clone incremental | 基线 MR ID |

---

## 🌐 跨平台命令体系

> 同一套 MCP 工具，三个平台共享。命令/Skill 文件在各平台对应目录下。

### 三平台对比

| 维度 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **命令目录** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
| **文件格式** | `.md` (frontmatter + 指令) | `.md` ($NAME 占位符) | `SKILL.md` (YAML frontmatter) |
| **调用方式** | `/命令名` | `Ctrl+K` 命令面板 | `$技能名` |
| **参数** | 自然语言解析 | `$PARAM` 占位符 | YAML `name` + 自然语言 |
| **MCP 配置** | `.claude/settings.local.json` | `.opencode.json` → `mcpServers` | `.codex/config.toml` → `[mcp_servers]` |

### 命令/技能映射

| 功能 | Claude Code | OpenCode | Codex |
|------|------------|----------|-------|
| 统一监控 | `/repo_monitor` | `repo_monitor` cmd | `$repo-monitor` |
| 统一克隆 | `/repo_clone` | `repo_clone` cmd | `$repo-clone` |
| 查看水位 | `/repo_status` | `repo_status` cmd | `$repo-status` |
| 检查更新 | `/repo_check` | `repo_check` cmd | `$repo-check` |
| 重置水位 | `/repo_reset` | `repo_reset` cmd | `$repo-reset` |

### MCP 服务器配置模板

**Claude Code** (`.claude/settings.local.json`)：
```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

**OpenCode** (`.opencode.json`)：
```json
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

**Codex** (`.codex/config.toml`)：
```toml
[mcp_servers.test-impact-analysis]
command = "npx"
args = ["tsx", "src/index.ts"]
enabled = true
```

### 未来部署清单

```
项目根目录/
├── .claude/commands/        ← Claude Code  ✅ 已就绪
│   ├── repo_monitor.md
│   ├── repo_clone.md
│   ├── repo_status.md
│   ├── repo_check.md
│   └── repo_reset.md
├── .opencode/commands/      ← OpenCode     ✅ 已就绪
│   ├── repo_monitor.md
│   ├── repo_clone.md
│   ├── repo_status.md
│   ├── repo_check.md
│   └── repo_reset.md
├── .codex/skills/          ← Codex        ✅ 已就绪
│   ├── repo-monitor/SKILL.md
│   ├── repo-clone/SKILL.md
│   ├── repo-status/SKILL.md
│   ├── repo-check/SKILL.md
│   └── repo-reset/SKILL.md
├── .opencode.json           ← OpenCode MCP配置 ✅
└── .codex/config.toml       ← Codex MCP配置   ✅
```

---

## 模块化架构

### 当前目录结构

```
src/
├── index.ts              # MCP Server 入口 + Transport 双模 + 安全中间件
├── state.ts              # 配置/状态读写、水位管理、快照归档
├── types.ts              # 共享类型定义 (RepoConfig / RepoState / MonitorEntry)
├── security.ts           # IP 白名单 + API KEY + DNS rebinding 防护
├── paths.ts              # 路径定位 + resolveConfigPath + ensureEnterpriseDir
├── shared/               # 🆕 共享工具模块
│   └── json-utils.ts     # safeJsonLoad 统一实现
├── tools/                # MCP 工具模块 (6 个工具)
│   ├── index.ts          # 路由分发 + Transport 分级过滤
│   ├── schemas.ts        # 6 个 Tool Schema + visibility 元数据
│   ├── helpers.ts        # 适配器工厂 / 参数校验 / 响应辅助
│   ├── tia-init.ts       # TIA-init 客户端初始化引导
│   ├── repo-monitor.ts   # 仓库监控 (status/check/reset 三合一)
│   └── repo-clone.ts     # 代码克隆 (全量/增量 + 远程降级)
├── impact-analysis/      # 影响分析模块 (Phase 2-4)
│   ├── types.ts          # ImpactRule / ImpactModule / 推荐/风险类型
│   ├── state.ts          # impact-rules.conf.json 读写
│   ├── analyzer.ts       # glob 匹配引擎 + 置信度计算 + 自动推断
│   ├── handler.ts        # impact_analysis 工具: 变更文件→受影响模块
│   ├── recommendation.ts # test_recommendation 推荐引擎
│   ├── risk-scorer.ts    # risk_assessment 风险评分引擎
│   └── risk-handler.ts   # risk_assessment 工具处理器
├── platforms/            # Git 平台适配器层 (不感知 MCP 协议)
│   ├── types.ts          # PlatformAdapter 接口 (含 getDiffFiles)
│   ├── github.ts         # GitHub REST API v3
│   ├── generic.ts        # 通用 REST API (GitLab/CodeHub) + RSA 签名
│   └── local.ts          # 本地 git 命令
└── tests/                # 单元测试 (83 个测试用例)
    ├── state.test.ts
    ├── security.test.ts
    ├── schemas.test.ts
    ├── impact-analysis.test.ts
    ├── recommendation.test.ts
    └── risk-assessment.test.ts
```

---

## JACG 集成说明 🔜 Phase 5b 规划中

> **JACG**（Java All Call Graph）是 Phase 5b 核心增强，通过方案 D（子进程 jar 调用）集成，为 Java 项目提供**字节码级调用链分析能力**。

### 设计概述

JACG 作为可选依赖，遵循"可用时增强、不可用时降级"原则：

| 场景 | 行为 |
|------|------|
| JDK >= 11 可用 | `impact_analysis` 调用 JACG jar 生成调用图 → 逆向 BFS 精准定位受影响 API |
| JDK 不可用 | 自动降级为现有文件级 glob 匹配（零影响） |

### 架构关系

```
impact_analysis 工具
  ├─ JDK 可用？
  │   ├─ 是 → 方案 D（子进程 spawn java -jar jacg.jar）
  │   │       → 生成调用图落盘 .tia/
  │   │       → 逆向 BFS 遍历 → 精确 API 级影响
  │   └─ 否 → 降级到现有 glob 匹配引擎
  └─ 结果统一返回 MCP 响应
```

### 配置（`analyzers.conf.json`，规划中恢复）

```jsonc
{
  "analyzers": [{
    "id": "jacg",
    "enabled": true,
    "fileExtensions": [".java"],
    "confidenceWeight": 90,
    "config": {
      "jarPath": "lib/jacg/java-all-call-graph.jar",
      "maxHeap": "2g",
      "timeout": 600
    }
  }]
}
```

### 关键决策

- **方案选择**：方案 D（子进程 jar）而非 MCP 编织 — 避免跨网络延迟，TIA 直接管理 JACG 生命周期
- **降级策略**：JDK 不可用时静默降级，不阻断分析流程
- **状态标注**：当前为规划阶段预览文档，尚未实现

### 相关文件（待恢复）

| 文件 | 说明 |
|------|------|
| `lib/jacg/java-all-call-graph.jar` | JACG 预编译 JAR |
| `scripts/download-jacg.sh` | JACG 下载/构建脚本 |
| `analyzers.conf.json` | 分析器注册配置（含 JACG） |
| `src/analyzer-registry/` | 分析器编织层（Phase 5a 代码） |

---

# 模块 1：Git Monitor — 使用指南

## 3 个 MCP 工具（克制设计）

**核心原则：配置管理不占 MCP 工具。** 仓库的添加/删除直接编辑 `monitors.conf.json`，简单直观。

| 工具 | 参数 | 用途 |
|------|------|------|
| `TIA-init` | `agentType?`（claude / opencode / codex） | 客户端初始化引导（签发 API KEY + 注册命令） |
| `repo_monitor` | `action` + `name?`/`module?` + 各 action 专用参数 | 统一仓库监控入口（status / check / reset） |
| `repo_clone` | `mode` + `name?`/`module?` + 克隆专用参数 | 代码落盘（全量初始化 / 增量 MR） |

---

### 工具 1：`repo_monitor` — 统一仓库监控

三种操作通过 `action` 参数选择：

#### `action=status` — 查看水位状态

列出所有（或指定）仓库的当前水位、上次检查时间、最近重置快照。

```
repo_monitor(action="status")                              # 全部仓库
repo_monitor(action="status", name="gh-backend")           # 单个仓库
repo_monitor(action="status", module="订单系统")           # 按模块
```

返回示例：
```
📊 共监控 5 个仓库:

📦 gh-backend  [模块: 示例模块]
   类型: backend    平台: github     分支: main            认证: none
   水位: a1b2c3d   上次检查: 2026/6/13 14:30:00
   最近重置: "Sprint 25 kickoff" (e4f5g6h → a1b2c3d)
   源头: git@github.com:myteam/backend.git
```

#### `action=check` — 检查新提交

对比远程 HEAD 与本地水位 SHA，返回新提交摘要。**首次检查自动初始化水位**。

```
repo_monitor(action="check")                                # 全部仓库
repo_monitor(action="check", name="gh-backend")             # 单个仓库
repo_monitor(action="check", module="订单系统")             # 按模块
```

行为：
- 无水位 → 自动初始化（`🆕 首次初始化`）
- HEAD 相同 → `📭 无新提交`
- HEAD 前进 → 拉取区间提交，过滤 seenShas，展示新提交
- 更新水位 + 将新 SHA 加入 seenShas 去重集

配合 CronCreate 定时监控：
```
/cron "*/15 * * * *" "repo_monitor(action='check')"
/cron "7 */2 * * *" "repo_monitor(action='check', module='订单系统')"
```

#### `action=reset` — 重置水位（迭代切换）

将水位重置到目标 SHA。两种模式：

**模式 1：普通重置**（不传 sinceDate）— 直接重置到当前远程 HEAD：
```
repo_monitor(action="reset", name="gh-backend", label="手动重置")
```

**模式 2：日期定位**（传 sinceDate）— 自动查找迭代第一个 MR 的 base commit：
```
repo_monitor(action="reset", module="订单系统", label="Sprint 26 kickoff", sinceDate="2026-06-13")
```

行为：
- `sinceDate` 传入 → 调 `adapter.findFirstMrBaseAfter()` 定位 MR base commit
- MR 找不到 → 自动 fallback 到当前 HEAD
- 旧水位归档为 `WatermarkSnapshot`（最多保留 20 条）
- seenShas 清空（新迭代重新计数）

---

### 工具 2：`repo_clone` — 克隆代码到本地

按 `repoType` 自动选择存储路径：
```
Repository/
├── Frontend repository/   ← repoType="frontend"
│   └── {repo-name}/
│       ├── {branch}/      ← mode=full 全量
│       └── {mr-id}/       ← mode=incremental
└── Backend repository/    ← repoType="backend"
    └── {repo-name}/
        ├── {branch}/
        └── {mr-id}/
```

#### mode=full — 全量克隆（初始化 / 强制更新）

```
repo_clone(mode="full", name="gh-backend")                # 单个仓库初始化
repo_clone(mode="full", module="订单系统")                # 按模块批量初始化
repo_clone(mode="full", name="gh-backend", force=true)    # 强制覆盖已有目录
```

行为：
- 目录不存在 → `git clone --branch {branch} --single-branch`
- 目录存在 + force=false → 提示 `⚠️ 目录已存在`
- 目录存在 + force=true → 删除旧目录后重新 clone

#### mode=incremental — 增量克隆 MR

需平台支持 MR 查询（GitHub 或已配置 `mrApiTemplate` 的 Generic）。

**按日期拉取**（sinceDate 之后合入的所有 MR）：
```
repo_clone(mode="incremental", module="订单系统", sinceDate="2026-06-01")
repo_clone(mode="incremental", name="codehub-order-service", sinceDate="2026-06-01", force=true)
```

**按基线 MR 拉取**（sinceMrId 之后合入的所有 MR，不含自身）：
```
repo_clone(mode="incremental", name="gh-backend", sinceMrId="1234")
```

行为：
1. 确保基础克隆存在（全量 clone 目标分支，作为共享 object store）
2. `git fetch origin {branch}` 更新基础克隆
3. 调 `adapter.listMrs()` 获取 MR 列表
4. 每个 MR：`git clone --no-hardlinks` 从基础克隆本地检出 → `checkout mr.headSha`
5. 已存在的 MR 目录默认跳过，传 `force=true` 覆盖

---

### 典型工作流

```
# ─── 一次性配置 ───
# 编辑 monitors.conf.json 添加要监控的仓库

# ─── 日常监控 ───
repo_monitor(action="check")                              # 查看是否有新提交
repo_monitor(action="check", module="订单系统")           # 只看某模块

# ─── 拉代码分析 ───
repo_clone(mode="full", module="订单系统")                 # 初始化全量代码
repo_clone(mode="incremental", module="订单系统", sinceDate="2026-06-01")  # 拉迭代内 MR

# ─── 迭代切换 ───
repo_monitor(action="reset", module="订单系统", label="Sprint 26 kickoff", sinceDate="2026-06-13")

# ─── 查看状态 ───
repo_monitor(action="status")                             # 确认水位正常
```

---

## CronCreate 定时监控

| 场景 | cron 命令 |
|------|----------|
| 每 15 分钟检查全部 | `/cron "*/15 * * * *" "repo_monitor(action='check')"` |
| 每 2 小时检查某模块 | `/cron "7 */2 * * *" "repo_monitor(action='check', module='订单系统')"` |
| 每个工作日上午 9 点 | `/cron "3 9 * * 1-5" "repo_monitor(action='check')"` |

---

## monitors.conf.json 配置参考

```jsonc
{
  "repositories": [
    {
      "name": "my-backend",                    // 仓库别名，全局唯一
      "url": "git@github.com:myteam/backend.git", // Git 远程 URL
      "platform": "github",                    // github | local | generic
      "branch": "main",                        // 监控的分支
      "repoType": "backend",                   // frontend | backend（决定克隆路径）
      "module": "用户中心",                     // 业务模块名（批量操作时用）
      "auth": { "type": "none" }               // none | token | rsa（默认 none）
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

**字段说明：**

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | ✅ | 仓库别名，全局唯一 |
| `url` | ✅ | Git 远程 URL（SSH 或 HTTPS） |
| `branch` | ✅ | 监控的分支名 |
| `repoType` | ✅ | `frontend` 或 `backend`，决定 clone 存储路径 |
| `module` | ✅ | 业务模块名，`repo_monitor`/`repo_clone` 按此批量操作 |
| `platform` | 自动检测 | `github` / `local` / `generic`。默认按 URL 自动判断 |
| `auth` | 否 | 认证方式。默认 `none`（本地 SSH config 鉴权已覆盖绝大多数场景） |
| `localPath` | `local` 时必填 | 本地仓库路径 |
| `genericConfig.apiBase` | `generic` 时必填 | API 基础 URL |
| `genericConfig.apiTemplate` | `generic` 时必填 | 提交查询 API 路径模板 |
| `genericConfig.mrApiTemplate` | 可选 | MR 查询 API 路径模板。配置后支持 `reset` 和 `incremental clone` |

---

# 架构细节

## 分层架构（单向依赖）

| 层 | 文件 | 职责 | 依赖 |
|----|------|------|------|
| **类型层** | `types.ts` + `platforms/types.ts` | `RepoConfig` / `RepoState` / `MonitorEntry` / `ServerConf` / `PlatformAdapter` | 无 |
| **状态层** | `state.ts` | 配置/状态读写、合并逻辑、水位更新/重置/归档、启动校验、`getBaseDir()` | 类型层 |
| **安全层** | `security.ts` | `server.conf.json` 管理、IP 白名单校验、API KEY 生成/校验 | 类型层 |
| **工具层** | `tools/*.ts` | 6 个 Tool 的 Schema + 路由 + 处理函数（含 API KEY 校验 + Transport 分级） | 状态层 + 安全层 + 适配器层 |
| **影响分析层** | `impact-analysis/*.ts` | Phase 2-4: 文件匹配 / 测试推荐 / 风险评估 | 类型层 + 状态层 |
| **适配器层** | `platforms/*.ts` | 封装 Git 平台 API 差异，实现 `PlatformAdapter` 接口 | 类型层 |
| **共享层** | `shared/*.ts` | 通用工具函数（safeJsonLoad 等），消除跨模块代码重复 | 无 |
| **入口** | `index.ts` | Transport 双模启动（stdio / http）+ 安全中间件注入 | 以上全部 |

**关键设计决策：**
- `tools.ts` **不直接读文件**，所有配置/状态读写通过 `state.ts` / `security.ts` 提供的函数完成
- 适配器层**不感知 MCP 协议**，只返回纯数据，由 tools 层组装成 MCP 响应
- Transport **双模但代码尽可能少分支**：`index.ts` 负责启动方式切换，`tools.ts` 完全不感知 transport 类型
- `server.conf.json`**独立于** `monitors.conf.json`：安全配置不外泄，不会随仓库配置一起分发
- API KEY 只存 **SHA-256 哈希**，原始 key 仅在生成时终端显示一次
- 类型层定义了**三层类型**对应两个 JSON 文件 + 一个内存视图：
  - `RepoConfig` → `monitors.conf.json`（用户手写）
  - `RepoState` → `monitors.json`（程序维护）
  - `MonitorEntry` → `getMonitorEntries()` 合并产物（仅内存，不落盘）

## 数据流

### HTTP 模式请求认证流

```
1. 客户端发送 HTTP POST (JSON-RPC) 到 /mcp
2. Express 中间件 → checkIpAccess() → IP 白名单校验
   ├─ 不在白名单 → 403 + contactInfo 提示
   └─ 在白名单 → next()
3. 中间件 → verifyApiKey() → 预校验 API KEY，结果存入 setRequestAuth()
4. StreamableHTTPServerTransport → 解析 JSON-RPC → CallToolRequest
5. tools.ts handleToolCall():
   ├─ TIA-init → 免 API KEY 校验
   └─ 其他工具 → getRequestAuth().apiKeyEntry 必须非 null
6. 工具处理 → 返回结果
```

### TIA-init 初始化流

```
1. 客户端首次连接（无 API KEY）→ 调用 TIA-init
2. IP 白名单通过
3. API KEY 预校验返回 null（无 key）→ 工具层放行（TIA-init 免检）
4. handleTiaInit():
   a. issueApiKey() 签发新 key → 哈希存入 serverConf.apiKeys[]
   b. getCmdBundles() 读取命令文件（支持 Claude/OpenCode/Codex）
   c. 返回: API KEY + MCP 配置模板 + 命令文件内容
5. 客户端 LLM 通过 Write/Bash 工具写入配置和命令文件
6. 客户端重启 MCP 连接（携带 API KEY）→ 正常使用
```

## 配置与状态分离

```
monitors.conf.json   ←  用户手写 — 仓库 URL / 分支 / 认证 / platform / repoType / module
monitors.json        ←  程序维护 — lastSha / lastCheck / seenShas / snapshots
impact-rules.conf.json ← 用户手写 — 文件→测试映射规则
server.conf.json     ←  用户手写 — HTTP 端口 / IP 白名单 / API KEY 哈希

🔒 所有 .conf.json 文件优先读取 enterprise/ 目录（企业配置隔离），
   通过 resolveConfigPath() 实现三级 fallback：
   enterprise/ > 根目录 > examples/ 模板
```

**合并规则**（`getMonitorEntries()`）：
- 配置中有 + 状态中有 → 合并为 `MonitorEntry`
- 配置中有 + 状态中无 → `lastSha` 为空，首次 `repo_monitor(action='check')` 自动初始化
- 配置中无 + 状态中有 → 忽略（用户已从配置中移除）

## Transport 双模

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

### 安全认证流程（三层）

```
第 0 层 (Express 中间件): 所有 /mcp 请求 → Origin 校验（DNS rebinding 防护）→ IP 白名单 → 通过/403
                                     │
                       localhost 绑定自动跳过    非 localhost 需配置 allowedOrigins
                                     │
              ┌──────────────────────┼──────────────────┐
              ▼                                         ▼
         TIA-init 工具                            其他所有工具
         (免 API KEY)                            (必检 API KEY)
              │                                         │
              ▼                                         ▼
      签发 API KEY                                校验 API KEY
      返回命令文件                                touchApiKey (更新 lastUsed)
```

API KEY 特点：
- 服务端仅存 SHA-256 哈希（`apiKeys` 数组），原始 key 签发时只返回一次
- TIA-init 自助签发：客户端通过 IP 白名单后自动获取
- `generate-api-key.ts` 手动签发：服务端管理员预先分配

### TIA-init 客户端初始化流程

```
1. 客户端配置 MCP HTTP 连接，在 headers 中声明 Agent 类型：
   {
     "mcpServers": {
       "test-impact-analysis": {
         "type": "http",
         "url": "http://AAA:3100/mcp",
         "headers": { "X-Agent-Type": "ClaudeCode" }   ← 声明客户端类型
       }
     }
   }

2. 客户端调用 TIA-init 工具（此时 API KEY 尚未签发）
   ├─ IP 在白名单中 → 通过
   │   ├─ 从 X-Agent-Type 头自动识别客户端类型
   │   ├─ 签发 API KEY（如尚无）
   │   ├─ 返回 MCP 配置模板（含 X-API-Key + X-Agent-Type）
   │   ├─ 返回对应平台的命令文件（如 .claude/commands/*.md）
   │   └─ 客户端 LLM 通过 Write 工具写入配置和命令文件
   └─ IP 不在白名单中 → 403 + contactInfo

3. 客户端重启 MCP 连接（携带 X-API-Key + X-Agent-Type）
4. 正常使用 /repo_monitor /repo_clone 等命令
```

### Agent 类型识别优先级

```
X-Agent-Type 请求头  >  tool 参数 agentType  >  拒绝请求（必须指定）
      │                          │
  ClaudeCode → claude      ClaudeCode → claude
  CodeX      → codex        CodeX      → codex
  OpenCode   → opencode     OpenCode   → opencode

两者都未指定 → ❌ 返回错误，提示必须指定
```

### 代码存储路径（baseDir）

```
{baseDir}/Repository/
├─ Frontend repository/   ← repoType="frontend"
│    └─ {repo-name}/
│         ├─ {branch}/        ← mode=full 全量
│         └─ {mr-id}/         ← mode=incremental
└─ Backend repository/    ← repoType="backend"
     └─ {repo-name}/
          ├─ {branch}/
          └─ {mr-id}/
```

`baseDir` 在 `monitors.conf.json` 中配置，不配置默认使用项目目录。

### repo_clone 行为模式（Transport 自动感知）

`repo_clone` 根据 transport 模式**自动决定**行为，无需用户干预：

| Transport | 行为 | 说明 |
|-----------|------|------|
| `stdio` | **本地模式** — MCP Server 直接执行 `git clone` | 代码落在服务端 baseDir 下 |
| `http` | **远程模式** — 返回结构化 git 指令，客户端 Bash 执行 | 代码落在客户端本地 |
| `http` + 未认证 | 拦截 — 提示先执行 TIA-init | API KEY 校验不通过 |

## 状态管理

**seenShas 去重**（上限 500 条）：
```
repo_monitor(action='check') 发现 HEAD 前进
  → getCommitsBetween(oldSha, newSha) 获取区间提交
  → 过滤已见过的 SHA
  → 仅展示真正未见过的新提交
  → updateWatermark() 将新 SHA 加入 seenShas
  → seenShas 超过 500 条时 .slice(-500) 截断
```

**水位快照归档**（上限 20 条）：
```
repo_monitor(action='reset', label="Sprint 26 kickoff")
  → 当前水位归档为 WatermarkSnapshot { label, prevSha, newSha, time }
  → snapshots.unshift(snapshot)
  → lastSha = newSha + seenShas = []  ← 新迭代重新计数
```

## 适配器模式

三种 `PlatformAdapter` 实现，惰性初始化并缓存为模块级单例：

```
getAdapter("github")  → _github  ??= new GitHubAdapter()
getAdapter("local")   → _local   ??= new LocalGitAdapter()
getAdapter("generic") → _generic ??= new GenericGitAdapter()
```

适配器选择逻辑（配置时确定）：
- 有 `localPath` → `local`
- URL host 含 `github.com` → `github`
- 其他 → `generic`（需 `genericConfig`）

接口方法分**必需**和**可选**两层：
- 必需：`getHeadSha` / `getCommitsBetween` / `getRecentCommits`
- 可选：`findFirstMrBaseAfter` / `listMrs` — 仅 `repo_monitor(action='reset')` 和 `repo_clone incremental` 需要

| 平台 | 适配器 | HEAD | 提交区间 | MR 定位 | MR 列表 |
|------|--------|------|---------|--------|--------|
| `github` | `GitHubAdapter` | `GET /git/refs/heads/{branch}` | `/compare/base...head` | 查 closed PRs，过滤 `merged_at >= sinceDate`，取 `base.sha` | 分页查 closed PRs |
| `local` | `LocalGitAdapter` | `git fetch` + `rev-parse` | `git log base..head --reverse` | `git log --merges --since={date}`，取 `mergeSha^1` | `git log --merges --since={date}`（不支持 sinceMrId） |
| `generic` | `GenericGitAdapter` | 拉最新 1 条取 sha | 拉 100 条，本地定位 base 后截取 | 通过 `mrApiTemplate` 查 MRs，兼容多种 base_sha 字段 | 通过 `mrApiTemplate` 分页查 MRs |

### GenericGitAdapter 关键细节

- **响应格式自适应**：自动识别 GitHub 格式（`raw.sha` / `raw.commit.message`）和 GitLab 格式（`raw.id` / `raw.title`）
- **容器兼容**：顶层数组直接用；`{data: [...]}` / `{items: [...]}` 自动解包
- **RSA 签名**：`authType=rsa` 时用 `crypto.createSign("RSA-SHA256")` 签名 `(method + path + timestamp)`
- **MR base_sha 兼容**：查找 `base.sha` / `base_sha` / `diff_refs.base_sha` / `target_sha` / `target.sha`
- **API 模板占位符**：`{owner}` `{repo}` `{branch}` `{projectId}` — 字符串替换构建 URL

## 错误处理策略

- **启动期**：`validateConfig()` 校验配置，只警告不中断 — 出错的仓库被跳过
- **运行期**：每个 handler 内 `try/catch` 捕获异常，返回 `ok("❌ 错误: ...")` 而非抛给 MCP SDK
- **批量操作**：遍历仓库时单个失败不中断其他仓库
- **水位初始化失败**：首次 `repo_monitor(action='check')` 时自动重试

---

## 技术栈与命令

- TypeScript / ESM（`"type": "module"`）
- `@modelcontextprotocol/sdk` — MCP Server SDK
- `tsx` — 运行时（零构建步骤，直接执行 .ts）
- Node.js >= 18

```bash
npm start              # npx tsx src/index.ts
npm run dev            # tsx --watch（开发热重载）
npx tsc --noEmit       # 类型检查（不产出文件，tsconfig strict: true）
```

## 关键约束

- `TOOL_SCHEMAS` 为静态 plain object 数组，参数校验使用手工 `requireString()` / `optionalString()`，**未使用 Zod**
- `seenShas` 最多 **500** 条；水位快照最多 **20** 条
- `git` 命令超时：clone **5min**；buffer 上限：clone **10MB**
- `parseGitUrl()` 支持三种格式：`https://` / `ssh://git@` / `git@host:`
- 认证默认 `none` — 绝大多数场景由本地 git SSH config + RSA 公钥完成鉴权
- `repo_clone` 增量模式：基于全量 clone 做 `git clone --no-hardlinks` 快速检出，每个 MR 一个子目录以 MR ID 命名

## 开发路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | Git Monitor — 仓库变更感知与代码拉取 | ✅ |
| Phase 1.5 | Transport 双模 + IP 白名单 | ✅ |
| Phase 1.6 | `repo_clone` 远程模式（Transport 感知，自动返回指令）| ✅ |
| Phase 1.7 | TIA-init 客户端初始化引导（API KEY 自助签发 + Commands 同步）| ✅ |
| Phase 2 | Impact Analysis — 代码变更 → 受影响模块/用例分析 | ✅ |
| Phase 3 | Test Recommendation — 基于变更智能推荐测试用例 | ✅ |
| Phase 4 | Risk Assessment — 变更风险量化与报告 | ✅ |
| Phase 5a | Analyzer Registry — MCP 编织层 | ✅ |
| Phase 5b | JACG 调用链分析（子进程 jar 调用，字节码级端到端链路） | 🔜 规划中 |
| Phase 5c | SQL / Perf / Python / Go 分析器横向扩展 | 💡 构思中 |
| Phase 6 | 信息安全分层重构 — enterprise/ 隔离 + .gitignore 加固 | ✅ |

## 设计原则

### ⚡ 原则 0：MCP 工具克制（最高优先级）

**这是本项目 vibecoding 开发过程中的核心铁律。**

MCP Server 通过 `ListToolsRequestSchema` 将全部工具的 name + description + inputSchema 注入 LLM 上下文。每增加一个工具，意味着：

- 一份完整的 JSON Schema（含所有参数定义、枚举值、描述文本）常驻在**每一次对话**的上下文中
- 多个小工具叠加 → 上下文膨胀 → 挤占 LLM 的实际推理空间
- 工具越多，LLM 选择工具的准确率越低（选择负担）

**克制策略：**

| 场景 | 做法 |
|------|------|
| 能通过配置文件完成的事 | **不建工具**。用户直接编辑 JSON 文件 |
| 纯查询（无副作用） | 优先合并到已有工具的 `action` 参数中 |
| 单一功能的薄包装 | 审视是否可以合并到语义相近的工具 |
| 新增独立工具 | 必须有充分的独立性理由（不同的数据源/不同的副作用/不同的安全边界） |

**合并技巧：**
- 用 `action` 枚举参数（`"status"` / `"check"` / `"reset"`）在一个工具内承载多个操作
- 用可选参数覆盖边缘场景，而非为每个场景建独立工具
- 工具命名统一前缀（如 `repo_xxx`），让 LLM 按命名空间快速定位

> 本案从 7 个工具合并为 3 个（`TIA-init` + `repo_monitor` + `repo_clone`），精简 57%，就是这一原则的实践。

---

1. **测试人员优先**：Tool 设计以测试人员的日常使用场景为出发点
2. **模块化隔离**：每个分析模块独立目录，共享基础设施但业务逻辑不耦合
3. **渐进式交付**：每个模块独立可运行，不依赖其他模块
4. **配置与状态分离**：延续 `monitors.conf.json` / `monitors.json` 双文件模式
5. **错误容忍**：批量操作中单个失败不阻塞整体，启动期校验只警告不中断
