# Test Impact Analysis MCP Server（简称 TIA）

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/-MCP-black?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)

> **面向软件测试人员的 MCP 工具集** | **3 个核心工具** | **双 Transport 模式** | **3 平台适配器** | **跨 AI 编程框架支持**
>
> **MCP Toolset for Software Testers** | **3 Core Tools** | **Dual Transport** | **3 Platform Adapters** | **Cross-Framework Support**

---

<div align="center">

**🌐 语言 / Language / 言語**

[**English**](README.en.md) | [简体中文](README.zh-CN.md) | [繁體中文](docs/zh-TW/README.md) | [日本語](docs/ja-JP/README.md)

</div>

---

**面向软件测试人员的智能化 MCP 工具集。覆盖测试生命周期中的"变更感知 → 影响分析 → 用例推荐 → 风险评估"全链路。**

通过 stdio / http 双模 Transport 向 Claude Code、OpenCode、Codex 等 AI 编程框架暴露测试分析能力。持续监控代码仓库变更，自动拉取增量代码，为测试人员提供基于代码变更的测试影响分析。

---

**An intelligent MCP toolset for software testers. Covers the full testing lifecycle: "Change Awareness → Impact Analysis → Test Recommendation → Risk Assessment."**

Exposes test analysis capabilities to Claude Code, OpenCode, Codex, and other AI coding frameworks via stdio / HTTP dual-mode transport. Continuously monitors repository changes, automatically pulls incremental code, and provides change-based test impact analysis for QA teams.

---

## 🚀 快速开始 / Quick Start

<details>
<summary><b>🇨🇳 简体中文</b></summary>

```bash
# 1. 配置 MCP 连接（.claude/settings.local.json）
{ "enabledMcpjsonServers": ["test-impact-analysis"] }

# 2. 初始化客户端
TIA-init

# 3. 编辑 monitors.conf.json 添加要监控的仓库

# 4. 开始使用
/repo_status              # 查看仓库水位
/repo_check               # 检查新提交
/repo_clone full module=用户中心  # 克隆代码
```

</details>

<details>
<summary><b>🇬🇧 English</b></summary>

```bash
# 1. Configure MCP connection (.claude/settings.local.json)
{ "enabledMcpjsonServers": ["test-impact-analysis"] }

# 2. Initialize client
TIA-init

# 3. Edit monitors.conf.json to add repositories

# 4. Start using
/repo_status              # View repository watermarks
/repo_check               # Check for new commits
/repo_clone full module="User Center"  # Clone code
```

</details>

---

## 📖 完整文档 / Full Documentation

选择你的语言查看完整文档：
Choose your language for the full documentation:

- [🇨🇳 **简体中文** — README.zh-CN.md](README.zh-CN.md)
- [🇬🇧 **English** — README.en.md](README.en.md)
- [🇹🇼 **繁體中文** — docs/zh-TW/README.md](docs/zh-TW/README.md)
- [🇯🇵 **日本語** — docs/ja-JP/README.md](docs/ja-JP/README.md)

---

## 🎯 项目定位 / Architecture

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
│ (零配置)          │ │  ├─ Layer 0: IP 白名单           │
│ 直接执行 git clone │ │  ├─ Layer 1: API KEY 校验       │
└───────────────────┘ └──────────────────────────────────┘
```

---

## 📦 仓库结构 / Repository Structure

```
Test-Impact-Analysis-mcp/
├── src/                        # 核心源码 / Core source
│   ├── index.ts                # MCP Server 入口 + Transport 双模
│   ├── tools.ts                # 3 个 Tool Schema + 路由
│   ├── state.ts                # 配置/状态读写、水位管理
│   ├── types.ts                # 共享类型定义
│   ├── security.ts             # IP 白名单 + API KEY 安全
│   └── platforms/              # Git 平台适配器层
│       ├── types.ts            # PlatformAdapter 接口
│       ├── github.ts           # GitHub REST API v3
│       ├── generic.ts          # 通用 REST API (GitLab/CodeHub)
│       └── local.ts            # 本地 git 命令
│
├── .claude/commands/           # Claude Code 斜杠命令
├── .opencode/commands/         # OpenCode 命令
├── .agents/skills/             # Codex 技能
│
├── monitors.conf.json          # 用户手写仓库监控配置
├── monitors.json               # 程序维护水位状态
└── server.conf.json            # HTTP 模式安全配置
```

---

## 🗺️ 开发路线图 / Roadmap

| 阶段 / Phase | 内容 / Content | 状态 / Status |
|------|------|------|
| Phase 1 | Git Monitor — 仓库变更感知与代码拉取 | ✅ |
| Phase 1.5 | Transport 双模 + IP 白名单 | ✅ |
| Phase 1.6 | `repo_clone` 远程模式 | ✅ |
| Phase 1.7 | TIA-init 客户端初始化引导 | ✅ |
| Phase 2 | Impact Analysis — 代码变更影响分析 | 🔜 |
| Phase 3 | Test Recommendation — 智能测试推荐 | 💡 |
| Phase 4 | Risk Assessment — 变更风险量化 | 💡 |

---

## 📄 许可证 / License

MIT — 自由使用 / Use freely, 按需修改 / modify as needed, 欢迎回馈 / contribute back.

---

**如果本工具对你有帮助，请点亮 Star ⭐**
**If this tool helps you, please give it a Star ⭐**
