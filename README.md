# Test Impact Analysis MCP Server（简称 TIA）

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/-MCP-black?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)

> **面向软件测试人员的 MCP 工具集** | **6 个核心工具** | **双 Transport 模式** | **3 平台适配器** | **跨 AI 编程框架支持**
>
> **MCP Toolset for Software Testers** | **6 Core Tools** | **Dual Transport** | **3 Platform Adapters** | **Cross-Framework Support**

---

<div align="center">

**🌐 语言 / Language / 語言**

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
│
├── 📦 源码层（提交到 GitHub）
│   ├── src/                    # 核心源码 / Core source
│   ├── docs/                   # 文档 / Documentation
│   ├── examples/               # 配置模板 / Config templates
│   ├── scripts/                # 工具脚本 / Utility scripts
│   ├── .githooks/              # Git 安全钩子 / Security hooks
│   ├── .github/workflows/      # CI 安全扫描 / CI security scan
│   ├── .claude/commands/       # Claude Code 命令
│   ├── .opencode/commands/     # OpenCode 命令
│   ├── .codex/skills/         # Codex 技能
│   ├── README.md               # 项目入口
│   └── impact-rules.conf.json  # 影响分析规则（示例）
│
├── 🔒 企业配置层（.gitignore 排除，永不提交）
│   └── enterprise/             # 你的真实配置放这里
│       ├── monitors.conf.json
│       ├── server.conf.json
│       └── .mcp.json
│
└── 🚫 运行时产物（.gitignore 排除）
    └── monitors.json           # 程序维护的水位状态
```

---

## 🗺️ 开发路线图 / Roadmap

| 阶段 / Phase | 内容 / Content | 状态 / Status |
|------|------|------|
| Phase 1 | Git Monitor — 仓库变更感知与代码拉取 | ✅ |
| Phase 1.5 | Transport 双模 + IP 白名单 | ✅ |
| Phase 1.6 | `repo_clone` 远程模式 | ✅ |
| Phase 1.7 | TIA-init 客户端初始化引导 | ✅ |
| Phase 2 | Impact Analysis — 代码变更影响分析 | ✅ |
| Phase 3 | Test Recommendation — 智能测试推荐 | ✅ |
| Phase 4 | Risk Assessment — 变更风险量化 | ✅ |
| Phase 5a | Analyzer Registry — MCP 编织层 | ✅ |
| Phase 5c | SQL / Perf / Python / Go 分析器横向扩展 | 💡 |
| Phase 6 | 信息安全分层重构 — enterprise/ 隔离 | ✅ |

---

## 📄 许可证 / License

MIT — 自由使用 / Use freely, 按需修改 / modify as needed, 欢迎回馈 / contribute back.

---

**如果本工具对你有帮助，请点亮 Star ⭐**
**If this tool helps you, please give it a Star ⭐**
