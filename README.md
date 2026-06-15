<p align="center">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?logo=nodedotjs" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/MCP-1.x-black?logo=anthropic" alt="MCP 1.x">
  <img src="https://img.shields.io/badge/Express-4.x-000?logo=express" alt="Express">
  <img src="https://img.shields.io/badge/MIT-license-blue" alt="MIT License">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-零错误-informational?logo=typescript" alt="TypeScript 零错误">
  <img src="https://img.shields.io/badge/源码文件-37_files-blueviolet" alt="37 个源码文件">
  <img src="https://img.shields.io/badge/MCP工具-5_tools-critical" alt="5 个 MCP 工具">
  <img src="https://img.shields.io/badge/测试-65_pass-success" alt="65 测试通过">
  <img src="https://img.shields.io/badge/引擎-1_engine-orange" alt="1 个分析引擎">
</p>

<div align="center">

**🌐 Language / 语言 / 語言**: [English](README.en.md) | **[简体中文](README.zh-CN.md)** | [繁體中文](docs/zh-TW/README.md) | [日本語](docs/ja-JP/README.md)

</div>

<h1 align="center">Test Impact Analysis MCP Server（TIA）</h1>

<p align="center">
  <strong>面向软件测试人员的智能代码变更影响分析 MCP 工具集</strong>
</p>

<p align="center">
  持续监控代码仓库变更，自动拉取增量代码，集成外部静态分析引擎，<br/>
  覆盖测试生命周期中的 <strong>变更感知 → 影响分析 → 用例推荐 → 风险评估</strong> 全链路。
</p>

<hr/>

<details open>
<summary><strong>📋 快速指引</strong></summary>

| 我想... | 看这里 |
|:---|:---|
| 快速把项目跑起来 | [🚀 快速开始](#-快速开始) |
| 了解能做什么 | [🎯 项目定位](#-项目定位) |
| 看有哪些工具可用 | [🛠️ 5 个 MCP 工具](#️-5-个-mcp-工具) |
| 接入外部分析引擎 | [🔬 分析引擎集成](#-分析引擎集成) |
| 配置 Claude Code / OpenCode | [📥 安装方式](#-安装方式) |
| 看完整设计蓝图 | [.claude/plans/ultimate-blueprint-v3.md](.claude/plans/ultimate-blueprint-v3.md) |
</details>

---

## 📦 包含内容

| 分类 | 内容 | 说明 |
|------|------|------|
| 🛠️ **MCP 工具** | repo_monitor / repo_clone / impact_analysis / test_recommendation / risk_assessment | 5 个工具 |
| 🔌 **Transport 双模** | stdio（本地零配置）/ http（远程 IP 白名单） | 双模 |
| 🌐 **平台适配器** | GitHub / Local / Generic REST API | 3 种平台 |
| 🔬 **分析引擎** | codebase-memory-mcp（158 语言静态分析，方法级调用链） | 1 个引擎 |
| 📊 **影响分析** | glob 规则匹配 + BFS 调用链追踪 + 四级置信度 | Phase 2-4 |
| 🔒 **安全分层** | 源码层(提交GitHub) ↔ 企业配置层(.gitignore) | 双层 |

> 从初始 7 个工具合并为 3 个（精简 57%），Phase 2-4 新增 2 个分析工具（5 个）。安全认证从两层（API KEY + IP）精简为一层（IP 白名单）。简单、实用、免维护。

---

## 🎯 项目定位

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → 定时触发 repo_monitor               │
│  ├─ /repo_xxx 斜杠命令 → 快捷操控                    │
│  └─ MCP Client (stdio / http transport)               │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (本地)  │ http (远程)
┌─────────▼────────┐ ┌──▼───────────────────────────────┐
│ 直接进程通信      │ │ Express App (port 3100)          │
│ (零配置)          │ │  └─ IP 白名单 → 通过/403         │
│ 直接执行 git clone │ └──────────────────────────────────┘
└──────────────────┘

┌──────────────────────────────────────────────────────┐
│ TIA MCP Server                                       │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 1: Git Monitor                          │     │
│  │ repo_monitor + repo_clone                   │     │
│  │ GitHub / Local / Generic 三平台适配           │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 2: Impact Analysis + 引擎增强            │     │
│  │ impact_analysis + codebase-memory-mcp        │     │
│  │ BFS 调用链逆向追踪 + glob 文件级兜底          │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 3: Test Recommendation                  │     │
│  │ test_recommendation                         │     │
│  │ 推荐分 = 风险权重 × 置信度                    │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模块 4: Risk Assessment                      │     │
│  │ risk_assessment                             │     │
│  │ 文件+模块+置信度 三维评分 (0-100)             │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 1️⃣ 克隆并安装

```bash
git clone git@github.com:WayneLiu519888/Test-Impact-Analysis-MCP.git
cd Test-Impact-Analysis-MCP
npm install          # 自动安装 git hooks
```

### 2️⃣ 配置你的仓库

```bash
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # 填入你要监控的仓库
```

### 3️⃣ 配置 MCP 连接

**Stdio 本地模式**（零配置）：

```json
// .claude/settings.local.json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

**HTTP 远程模式**（需先配置 IP 白名单）：

```json
{
  "mcpServers": {
    "test-impact-analysis": {
      "type": "http",
      "url": "http://your-server:3100/mcp"
    }
  }
}
```

### 4️⃣ 开始使用

```bash
/repo_status                              # 查看仓库水位
/repo_check module=用户中心                # 检查新提交
/repo_clone full module=用户中心           # 克隆代码
impact_analysis(name="backend")           # 变更影响分析
test_recommendation(name="backend")       # 测试推荐
risk_assessment(name="backend")           # 风险评估
```

✨ **完成！** 代码变更自动感知 + 增量代码拉取 + 精准测试影响分析。

---

## 🛠️ 5 个 MCP 工具

| 我想... | 使用此工具 | 说明 |
|:---|:---|:---|
| 查看/检查/重置仓库水位 | `repo_monitor` | 三合一：`action=status\|check\|reset`，支持 name/module 筛选 |
| 克隆代码到本地 | `repo_clone` | 全量（`mode=full`）/ 增量 MR（`mode=incremental`），按 repoType 自动存储 |
| 分析变更对测试的影响 | `impact_analysis` | glob 规则匹配 + 引擎调用链追踪 + 自动推断 |
| 推荐测试执行顺序 | `test_recommendation` | 推荐分 = 风险权重 × 置信度，生成最小可行测试集 |
| 评估变更风险 | `risk_assessment` | 文件+模块+置信度三维评分 (0-100)，含缓解建议 |

所有 5 个工具在 stdio 和 HTTP 模式下均可用。

---

## 🔬 分析引擎集成

TIA 支持接入外部代码静态分析引擎，提供**方法级精确调用链分析**能力。首个支持的引擎是 **codebase-memory-mcp**。

### codebase-memory-mcp 引擎

单一静态二进制（~36MB），基于 tree-sitter 支持 **158 种编程语言**，零运行时依赖。

```powershell
# 安装（PowerShell，3 步）
mkdir D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
curl -o "$env:TEMP\cbm.zip" "https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-windows-amd64.zip"
Expand-Archive "$env:TEMP\cbm.zip" D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
.\codebase-memory-mcp.exe --version    # → codebase-memory-mcp 0.8.1

# 启用引擎
# 编辑 engines.conf.json → "enabled": true
```

### 工作流程

```
impact_analysis 调用
  └─ .java/.ts/.py 等 → codebase-memory-mcp CLI 子进程
      ├─ index_repository    → 索引代码到本地 SQLite
      ├─ get_architecture    → 提取方法/入口点
      ├─ query_graph         → 提取全部 CALLS 调用边
      └─ 翻译为 PanoramaIndex → BFS 调用链逆向遍历
          └─ 合并到 TIA 影响分析报告
```

> ✅ 代码分析 100% 本地 | 🔌 引擎不可用时静默降级到 glob 匹配 | 📖 [完整配置指导](.claude/plans/codebase-memory-mcp-integration.md)

---

## 🌐 跨平台支持

同一套 MCP 工具，三个 AI 编程框架共享。

| 维度 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **命令目录** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
| **文件格式** | `.md` (frontmatter + 指令) | `.md` ($NAME 占位符) | `SKILL.md` (YAML frontmatter) |
| **调用方式** | `/命令名` | `Ctrl+K` 命令面板 | `$技能名` |
| **MCP 配置** | `.claude/settings.local.json` | `.opencode.json` | `.codex/config.toml` |

---

## 📥 安装方式

### Claude Code (stdio)

```json
// .claude/settings.local.json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

### Claude Code (HTTP 远程)

```json
{
  "mcpServers": {
    "test-impact-analysis": {
      "type": "http",
      "url": "http://your-server:3100/mcp"
    }
  }
}
```

```bash
# 服务端启动
MCP_TRANSPORT=http MCP_PORT=3100 npx tsx src/index.ts
```

### OpenCode / Codex

详见项目内 `.opencode/commands/` 和 `.codex/skills/` 目录。

---

## 📂 仓库目录

```
Test-Impact-Analysis-MCP/
│
├── src/
│   ├── index.ts                  # MCP Server 入口 + Transport 双模
│   ├── types.ts / state.ts       # 类型定义 / 配置状态管理
│   ├── security.ts               # IP 白名单
│   ├── paths.ts                  # 路径定位 + 企业配置层
│   ├── platforms/                # Git 平台适配器（GitHub/Local/Generic）
│   ├── tools/                    # MCP 工具模块（schemas + helpers + 3 handler）
│   ├── impact-analysis/          # 影响分析 / 推荐 / 风险评估
│   ├── engines/                  # 分析引擎框架
│   │   └── adapters/             # codebase-memory-mcp 适配器
│   └── tests/                    # 65 个单元测试
│
├── examples/                     # 配置模板（.example.json）
├── docs/                         # 多语言文档
├── .claude/commands/             # Claude Code 斜杠命令
├── .opencode/commands/           # OpenCode 命令
├── .codex/skills/               # Codex 技能
│
├── enterprise/                   # 🔒 企业配置层（.gitignore 排除）
│   ├── monitors.conf.json        #   仓库监控配置
│   ├── server.conf.json          #   IP 白名单配置
│   ├── impact-rules.conf.json    #   影响分析规则
│   └── engines.conf.json         #   引擎配置
│
└── Repository/                   # 🚫 克隆的代码（.gitignore 排除）
```

---

## 🔒 信息安全

```
┌─────────────────────────────────┐
│ 开源层（提交 GitHub ✅）          │
│ src/ docs/ examples/ README     │
│ 不含企业 URL / 仓库 / 内网 IP    │
├─────────────────────────────────┤
│ 企业层（.gitignore 排除 ❌）      │
│ enterprise/ 整目录               │
│ 仓库地址 / IP 白名单 / 业务模块   │
└─────────────────────────────────┘
```

**两层防护**：`.gitignore` 排除 `enterprise/` + Pre-commit hook 实时拦截。

**HTTP 安全**：IP 白名单（精确 IP + CIDR 子网），白名单内可直接连接全部 5 个工具。

---

## ❓ FAQ

<details>
<summary><strong>TIA 需要什么运行环境？</strong></summary>

- Node.js >= 18 | TypeScript / ESM | Git CLI | tsx 运行时

```bash
npm start              # npx tsx src/index.ts
npm run dev            # tsx --watch（热重载）
npx tsc --noEmit       # 类型检查
npm test               # 65 个测试
```
</details>

<details>
<summary><strong>为什么安全层只是 IP 白名单？</strong></summary>

TIA 运行在**企业内网**，网络隔离已由企业基础设施保障。IP 白名单作为唯一接入控制——简单、零维护、无密钥管理成本。
</details>

<details>
<summary><strong>codebase-memory-mcp 会把代码传到互联网吗？</strong></summary>

**不会。** 代码分析 100% 本地执行，语义向量模型编译进二进制，无外部 API 调用。启动时仅检查 GitHub Release 版本号（不含代码）。
</details>

<details>
<summary><strong>引擎不可用时怎么办？</strong></summary>

自动静默降级到 TIA 内置的 glob 文件匹配规则。引擎失败不阻断分析流程。
</details>

<details>
<summary><strong>Generic 适配器支持哪些 Git 平台？</strong></summary>

GitLab / 华为 CodeHub / Gitee / 自建 GitLab / Gogs / Gitea — 通过 URL 模板适配，自动识别响应格式。
</details>

<details>
<summary><strong>增量和全量模式怎么选？</strong></summary>

- `repo_clone mode=full` — 首次拉取全量代码
- `repo_clone mode=incremental` — 只拉迭代内的 MR 变更，需要平台支持 MR API
</details>

---

## 📋 环境要求

| 依赖 | 版本 |
|:---|:---|
| Node.js | >= 18 |
| TypeScript | 5.x |
| tsx | >= 4 |
| @modelcontextprotocol/sdk | >= 1.0 |
| Git | 任意 |

---

## 🔧 可用命令

| 命令 | 说明 |
|:---|:---|
| `npm start` | 启动 MCP Server（默认 stdio） |
| `npm run dev` | 开发热重载（tsx --watch） |
| `npm test` | 运行 65 个单元测试 |
| `npx tsc --noEmit` | 类型检查 |
| `npm run security-check` | 源码层安全自查 |

---

## 🗺️ 开发路线图

| 阶段 | 内容 | 状态 |
|------|------|:--:|
| Phase 1 | Git Monitor — 仓库变更感知与代码拉取 | ✅ |
| Phase 1.5 | Transport 双模 + IP 白名单 | ✅ |
| Phase 1.6 | repo_clone 远程模式 | ✅ |
| Phase 2 | Impact Analysis — 代码变更影响分析 | ✅ |
| Phase 3 | Test Recommendation — 智能测试推荐 | ✅ |
| Phase 4 | Risk Assessment — 变更风险量化 | ✅ |
| Phase 5a | 分析引擎框架 + codebase-memory-mcp 接入 | ✅ |
| Phase 5c | 更多分析引擎横向扩展 | 💡 |
| Phase 6 | 信息安全分层重构 | ✅ |

---

## 📄 许可证

MIT — 自由使用，按需修改，欢迎回馈。

---

<p align="center">
  <sub>设计蓝图 → <a href=".claude/plans/ultimate-blueprint-v3.md">ultimate-blueprint-v3.md</a></sub>
</p>

<p align="center">
  <sub>🤖 Generated with <a href="https://claude.com/claude-code">Claude Code</a></sub>
</p>
