# Test Impact Analysis MCP Server（简称 TIA）

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/-MCP-black?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)

> **面向软件测试人员的 MCP 工具集** | **3 个核心工具** | **双 Transport 模式** | **3 平台适配器** | **跨 AI 编程框架支持**

---

<div align="center">

**🌐 语言 / Language / 言語**

[**English**](README.en.md) | [简体中文](README.zh-CN.md) | [繁體中文](docs/zh-TW/README.md) | [日本語](docs/ja-JP/README.md)

</div>

---

**面向软件测试人员的智能化 MCP（Model Context Protocol）工具集。覆盖测试生命周期中的"变更感知 → 影响分析 → 用例推荐 → 风险评估"全链路。**

通过 stdio / http 双模 Transport 向 Claude Code、OpenCode、Codex 等 AI 编程框架暴露测试分析能力。持续监控代码仓库变更，自动拉取增量代码，为测试人员提供基于代码变更的测试影响分析。

---

## 🎯 项目定位

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
│  │ 模块 2: Impact Analysis (🔜 规划中)            │     │
│  │  └─ 代码变更 → 受影响模块/用例分析              │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 3: Test Recommendation (💡 规划中)        │     │
│  │  └─ 基于变更智能推荐测试用例                    │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 4: Risk Assessment (💡 规划中)            │     │
│  │  └─ 变更风险量化与报告                          │     │
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
├── src/                        # 核心源码
│   ├── index.ts                # MCP Server 入口 + Transport 双模启动
│   ├── tools.ts                # 3 个 Tool 的 Schema + 路由 + 处理函数
│   ├── state.ts                # 配置/状态读写、水位管理、快照归档
│   ├── types.ts                # 共享类型定义
│   └── platforms/              # Git 平台适配器层
│       ├── types.ts            # PlatformAdapter 接口定义
│       ├── github.ts           # GitHub REST API v3 适配器
│       ├── generic.ts          # 通用 REST API 适配器（GitLab/CodeHub 等）
│       └── local.ts            # 本地 git 命令适配器
│
├── .claude/commands/           # Claude Code 斜杠命令
│   ├── repo_monitor.md         # /repo_monitor — 统一监控入口
│   ├── repo_clone.md           # /repo_clone — 统一克隆入口
│   ├── repo_status.md          # /repo_status — 查看水位
│   ├── repo_check.md           # /repo_check — 检查更新
│   └── repo_reset.md           # /repo_reset — 重置水位
│
├── .opencode/commands/         # OpenCode 命令
│   ├── repo_monitor.md
│   ├── repo_clone.md
│   ├── repo_status.md
│   ├── repo_check.md
│   └── repo_reset.md
│
├── .agents/skills/             # Codex 技能
│   ├── repo-monitor/SKILL.md
│   ├── repo-clone/SKILL.md
│   ├── repo-status/SKILL.md
│   ├── repo-check/SKILL.md
│   └── repo-reset/SKILL.md
│
├── monitors.conf.json          # 用户手写的仓库监控配置
├── monitors.json               # 程序维护的水位状态文件
└── server.conf.json            # HTTP 模式安全配置
```

---

## 🛠️ 核心工具

### 克制设计原则

> **MCP 工具越多 → 上下文膨胀 → LLM 推理能力下降。** 本项目从 7 个工具合并为 3 个，精简 57%。

| 原则 | 做法 |
|------|------|
| 能通过配置文件完成的事 | **不建工具**。直接编辑 JSON |
| 纯查询无副作用 | 合并到已有工具的 `action` 参数 |
| 单一功能薄包装 | 审视是否可以合并到语义相近的工具 |

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

---

## 🗺️ 命令速查

| 命令 | 用法 | 说明 |
|------|------|------|
| `/repo_monitor` | `/repo_monitor <action> [name=\|module=] [flags]` | 统一监控入口 |
| `/repo_clone` | `/repo_clone <mode> <name=\|module=> [flags]` | 统一克隆入口 |
| `/repo_status` | `/repo_status [name=\|module=]` | 查看仓库水位（快捷命令） |
| `/repo_check` | `/repo_check [name=\|module=]` | 检查新提交（快捷命令） |
| `/repo_reset` | `/repo_reset <target> [--label] [--since]` | 重置水位（快捷命令） |

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
| **命令目录** | `.claude/commands/` | `.opencode/commands/` | `.agents/skills/` |
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
| **工具层** | `tools.ts` | 3 个 Tool 的 Schema + 路由 + 处理函数 | 状态层 + 安全层 + 适配器层 |
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
      "url": "git@codehub.huawei.com:myproject/order-service.git",
      "platform": "generic",
      "branch": "develop",
      "repoType": "backend",
      "module": "订单系统",
      "genericConfig": {
        "apiBase": "https://codehub.huawei.com",
        "apiTemplate": "/api/v1/projects/{owner}/repos/{repo}/commits?ref={branch}",
        "mrApiTemplate": "/api/v1/projects/{owner}/repos/{repo}/merge_requests?state=merged&target_branch={branch}&order_by=created_at&sort=asc"
      }
    }
  ]
}
```

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
| **Codex** | `.agents/skills/*/SKILL.md` | `.codex/config.toml` |

</details>

---

## 🗺️ 开发路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | Git Monitor — 仓库变更感知与代码拉取 | ✅ 已完成 |
| Phase 1.5 | Transport 双模 + IP 白名单 | ✅ 已完成 |
| Phase 1.6 | `repo_clone` 远程模式（Transport 感知，自动返回指令） | ✅ 已完成 |
| Phase 1.7 | TIA-init 客户端初始化引导（API KEY 自助签发 + Commands 同步） | ✅ 已完成 |
| Phase 2 | Impact Analysis — 代码变更 → 受影响模块/用例分析 | 🔜 规划中 |
| Phase 3 | Test Recommendation — 基于变更智能推荐测试用例 | 💡 规划中 |
| Phase 4 | Risk Assessment — 变更风险量化与报告 | 💡 规划中 |

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
