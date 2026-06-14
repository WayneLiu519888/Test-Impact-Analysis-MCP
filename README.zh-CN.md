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

<table width="100%">
<tr><th width="40%">我想...</th><th>看这里</th></tr>
<tr><td>快速把项目跑起来</td><td><a href="#-快速开始">🚀 快速开始</a></td></tr>
<tr><td>了解能做什么</td><td><a href="#-项目定位">🎯 项目定位</a></td></tr>
<tr><td>看有哪些工具可用</td><td><a href="#️-5-个-mcp-工具">🛠️ 5 个 MCP 工具</a></td></tr>
<tr><td>接入外部分析引擎</td><td><a href="#-分析引擎集成">🔬 分析引擎集成</a></td></tr>
<tr><td>配置 Claude Code / OpenCode</td><td><a href="#-安装方式">📥 安装方式</a></td></tr>
<tr><td>看完整设计蓝图</td><td><a href=".claude/plans/ultimate-blueprint-v3.md">ultimate-blueprint-v3.md</a></td></tr>
</table>
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

> 从初始 7 个工具合并为 3 个（精简 57%），Phase 2-4 新增 2 个分析工具（共 5 个）。安全认证从两层（API KEY + IP）精简为一层（IP 白名单）。简单、实用、免维护。

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
│  ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ Git Monitor│ │ Impact     │ │ Recommend  │ Risk   │
│  │ 2 tools    │ │ Analysis   │ │ + Assess   │ 2 tools│
│  │ + 3 adapter│ │ + 引擎增强  │ │ 2 tools    │        │
│  └────────────┘ └────────────┘ └────────────┘        │
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

---

## 🛠️ 5 个 MCP 工具

| 我想... | 使用此工具 | 说明 |
|:---|:---|:---|
| 查看/检查/重置仓库水位 | `repo_monitor` | 三合一：`action=status\|check\|reset`，支持 name/module 筛选 |
| 克隆代码到本地 | `repo_clone` | 全量（`mode=full`）/ 增量 MR（`mode=incremental`），按 repoType 自动存储 |
| 分析变更对测试的影响 | `impact_analysis` | glob 规则匹配 + 引擎调用链追踪 + 自动推断 |
| 推荐测试执行顺序 | `test_recommendation` | 推荐分 = 风险权重 × 置信度，生成最小可行测试集 |
| 评估变更风险 | `risk_assessment` | 文件+模块+置信度三维评分 (0-100)，含缓解建议 |

---

## 🔬 分析引擎集成

TIA 支持接入外部代码静态分析引擎，提供**方法级精确调用链分析**能力。

### codebase-memory-mcp 引擎

单一静态二进制（~36MB），基于 tree-sitter 支持 158 种编程语言，零运行时依赖。

```powershell
# 安装（PowerShell，3 步）
mkdir D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
curl -o "$env:TEMP\cbm.zip" "https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-windows-amd64.zip"
Expand-Archive "$env:TEMP\cbm.zip" D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
.\codebase-memory-mcp.exe --version    # → codebase-memory-mcp 0.8.1

# 启用引擎
# 编辑 engines.conf.json → "enabled": true
```

```
impact_analysis 调用
  └─ .java/.ts/.py → codebase-memory-mcp CLI
      └─ index → 架构提取 → 调用边 → 翻译为 PanoramaIndex
          └─ BFS 调用链逆向遍历 → 合并到影响分析报告
```

> ✅ 100% 本地分析 | 🔌 不可用时静默降级 glob | 📖 [集成方案](.claude/plans/codebase-memory-mcp-integration.md)

---

## 📥 安装方式

### Claude Code (stdio)

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

### HTTP 远程模式

```bash
MCP_TRANSPORT=http MCP_PORT=3100 npx tsx src/index.ts
```

### OpenCode / Codex

详见项目内 `.opencode/commands/` 和 `.codex/skills/` 目录。

---

## 📂 仓库目录

```
Test-Impact-Analysis-MCP/
├── src/                         # 核心源码
│   ├── index.ts                 # 入口 + Transport 双模
│   ├── tools/                   # MCP 工具（3 handler）
│   ├── impact-analysis/         # 影响分析 / 推荐 / 风险评估
│   ├── engines/adapters/        # codebase-memory-mcp 适配器
│   └── platforms/               # Git 平台适配器
├── examples/                    # 配置模板
├── enterprise/                  # 🔒 企业配置（.gitignore）
└── docs/                        # 多语言文档
```

---

## 🔒 信息安全

```
开源层 → GitHub ✅       企业层 → enterprise/ ❌ 永不提交
src/ docs/ examples/     monitors.conf.json  server.conf.json
                         仓库地址 / IP / 模块名
```

HTTP 安全：IP 白名单（精确 IP + CIDR 子网）。

---

## ❓ FAQ

<details>
<summary><strong>需要什么运行环境？</strong></summary>

Node.js >= 18 | TypeScript ESM | Git CLI | tsx

```bash
npm start && npm test    # 启动 + 65 测试
```
</details>

<details>
<summary><strong>为什么只做 IP 白名单？</strong></summary>

TIA 运行在企业内网，网络隔离已由企业基础设施保障。IP 白名单零维护。
</details>

<details>
<summary><strong>引擎不可用时怎么办？</strong></summary>

自动降级到 glob 规则匹配，不阻断分析。
</details>

<details>
<summary><strong>codebase-memory-mcp 安全吗？</strong></summary>

100% 本地，语义模型编译进二进制，不传代码。仅启动时检查版本号。
</details>

---

## 📋 环境要求

| 依赖 | 版本 |
|:---|:---|
| Node.js | >= 18 |
| TypeScript | 5.x |
| tsx | >= 4 |
| Git | 任意 |

## 🔧 可用命令

| 命令 | 说明 |
|:---|:---|
| `npm start` | 启动（stdio） |
| `npm run dev` | 开发热重载 |
| `npm test` | 65 测试 |
| `npx tsc --noEmit` | 类型检查 |
| `npm run security-check` | 安全自查 |

---

## 🗺️ 路线图

| 阶段 | 内容 | 状态 |
|------|------|:--:|
| Phase 1 | Git Monitor | ✅ |
| Phase 2 | Impact Analysis | ✅ |
| Phase 3 | Test Recommendation | ✅ |
| Phase 4 | Risk Assessment | ✅ |
| Phase 5a | 引擎框架 + codebase-memory-mcp | ✅ |
| Phase 5c | 更多引擎扩展 | 💡 |
| Phase 6 | 信息安全分层 | ✅ |

---

## 📄 许可证

MIT

---

<p align="center">
  <sub>设计蓝图 → <a href=".claude/plans/ultimate-blueprint-v3.md">ultimate-blueprint-v3.md</a></sub>
</p>

<p align="center">
  <sub>🤖 Generated with <a href="https://claude.com/claude-code">Claude Code</a></sub>
</p>
