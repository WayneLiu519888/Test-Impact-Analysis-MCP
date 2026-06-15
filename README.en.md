<p align="center">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?logo=nodedotjs" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/MCP-1.x-black?logo=anthropic" alt="MCP 1.x">
  <img src="https://img.shields.io/badge/Express-4.x-000?logo=express" alt="Express">
  <img src="https://img.shields.io/badge/MIT-license-blue" alt="MIT License">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-zero_errors-informational?logo=typescript" alt="TypeScript zero errors">
  <img src="https://img.shields.io/badge/Source-37_files-blueviolet" alt="37 source files">
  <img src="https://img.shields.io/badge/MCP_Tools-5_tools-critical" alt="5 MCP tools">
  <img src="https://img.shields.io/badge/Tests-65_pass-success" alt="65 tests pass">
  <img src="https://img.shields.io/badge/Engine-1_engine-orange" alt="1 engine">
</p>

<div align="center">

**🌐 Language / 语言 / 語言**: **[English](README.en.md)** | [简体中文](README.zh-CN.md) | [繁體中文](docs/zh-TW/README.md) | [日本語](docs/ja-JP/README.md)

</div>

<h1 align="center">Test Impact Analysis MCP Server (TIA)</h1>

<p align="center">
  <strong>Intelligent code change impact analysis MCP toolset for software testers</strong>
</p>

<p align="center">
  Continuously monitors repository changes, automatically pulls incremental code,<br/>
  integrates external static analysis engines. Covers the full testing lifecycle:<br/>
  <strong>Change Awareness → Impact Analysis → Test Recommendation → Risk Assessment</strong>.
</p>

<hr/>

<details open>
<summary><strong>📋 Quick Navigation</strong></summary>

| I want to... | Go to |
|:-----------|:------|
| Get started quickly | [🚀 Quick Start](#-quick-start) |
| Understand what TIA does | [🎯 Architecture](#-architecture) |
| See available tools | [🛠️ 5 MCP Tools](#️-5-mcp-tools) |
| Integrate an analysis engine | [🔬 Engine Integration](#-engine-integration) |
| Configure Claude Code / OpenCode | [📥 Installation](#-installation) |
| Read the full blueprint | [`.claude/plans/ultimate-blueprint-v3.md`](.claude/plans/ultimate-blueprint-v3.md) |
</details>

---

## 📦 What's Inside

| Category | Contents | Details |
|------|------|------|
| 🛠️ **MCP Tools** | repo_monitor / repo_clone / impact_analysis / test_recommendation / risk_assessment | 5 tools |
| 🔌 **Dual Transport** | stdio (local, zero-config) / HTTP (IP whitelist) | Dual mode |
| 🌐 **Platform Adapters** | GitHub / Local / Generic REST API | 3 platforms |
| 🔬 **Analysis Engine** | codebase-memory-mcp (158 languages, method-level call graph) | 1 engine |
| 📊 **Impact Analysis** | glob rule matching + BFS call-chain traversal + 4-tier confidence | Phase 2-4 |
| 🔒 **Security** | Public source (GitHub) ↔ Enterprise config (.gitignore) | 2 layers |

> Merged from 7 tools → 3 (57% reduction), then added 2 analysis tools (5 total). Security simplified from 2-layer (API KEY + IP) to 1-layer (IP whitelist). Simple, practical, zero maintenance.

---

## 🎯 Architecture

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → scheduled repo_monitor              │
│  ├─ /repo_xxx slash commands → quick actions         │
│  └─ MCP Client (stdio / http transport)               │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (local) │ http (remote)
┌─────────▼────────┐ ┌──▼──────────────────────────────┐
│ Direct IPC       │ │ Express App (port 3100)          │
│ (zero config)    │ │  └─ IP Whitelist → Pass / 403   │
│ Direct git clone │ └──────────────────────────────────┘
└──────────────────┘

┌──────────────────────────────────────────────────────┐
│ TIA MCP Server                                       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐        │
│  │ Git Monitor│ │ Impact     │ │ Recommend  │ Risk   │
│  │ 2 tools    │ │ Analysis   │ │ + Assess   │ 2 tools│
│  │ + 3 adapter│ │ + Engine   │ │ 2 tools    │        │
│  └────────────┘ └────────────┘ └────────────┘        │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1️⃣ Clone & Install

```bash
git clone git@github.com:WayneLiu519888/Test-Impact-Analysis-MCP.git
cd Test-Impact-Analysis-MCP
npm install          # auto-installs git hooks
```

### 2️⃣ Configure Repositories

```bash
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # add your repos
```

### 3️⃣ Configure MCP Connection

**Stdio (local)** — zero config:

```json
// .claude/settings.local.json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

**HTTP (remote)** — configure IP whitelist first:

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

### 4️⃣ Start Using

```bash
/repo_status                              # view watermarks
/repo_check module="User Center"          # check new commits
/repo_clone full module="User Center"     # clone code
impact_analysis(name="backend")           # change impact
test_recommendation(name="backend")       # test priority
risk_assessment(name="backend")           # risk score
```

✨ **Done!** Automated change detection + incremental code pulling + precise test impact analysis.

---

## 🛠️ 5 MCP Tools

| I want to... | Use | Description |
|:---|:---|:---|
| View/check/reset repo watermarks | `repo_monitor` | 3-in-1: `action=status\|check\|reset`, name or module filter |
| Clone code locally | `repo_clone` | Full (`mode=full`) / incremental MR (`mode=incremental`), auto-path by repoType |
| Analyze change impact on tests | `impact_analysis` | glob matching + engine call-chain tracing + auto-inference |
| Prioritize test execution | `test_recommendation` | Score = risk_weight × confidence, generates minimum viable suite |
| Quantify change risk | `risk_assessment` | 3-factor scoring (files/modules/confidence), with mitigation tips |

All 5 tools available in both stdio and HTTP modes.

---

## 🔬 Engine Integration

TIA supports external static analysis engines for **method-level call-graph analysis**.

### codebase-memory-mcp

Single static binary (~36MB), tree-sitter based, **158 languages**, zero runtime dependencies.

```powershell
# Install (PowerShell, 3 steps)
mkdir D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
curl -o "$env:TEMP\cbm.zip" "https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-windows-amd64.zip"
Expand-Archive "$env:TEMP\cbm.zip" D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
.\codebase-memory-mcp.exe --version    # → codebase-memory-mcp 0.8.1

# Enable: edit engines.conf.json → "enabled": true
```

```
impact_analysis call
  └─ .java/.ts/.py changes → codebase-memory-mcp CLI
      └─ index → extract architecture → extract CALLS edges → translate
          └─ BFS reverse traversal → merged into impact report
```

> ✅ 100% local | 🔌 Auto-fallback to glob on engine failure | 📖 [Integration guide](.claude/plans/codebase-memory-mcp-integration.md)

---

## 📥 Installation

### Claude Code (stdio)

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

### HTTP Remote

```bash
MCP_TRANSPORT=http MCP_PORT=3100 npx tsx src/index.ts
```

### OpenCode / Codex

See `.opencode/commands/` and `.codex/skills/` in the repo.

---

## 📂 Repository Structure

```
Test-Impact-Analysis-MCP/
├── src/                         # Core source
│   ├── index.ts                 # Entry + dual transport
│   ├── tools/                   # MCP tools (3 handlers)
│   ├── impact-analysis/         # Impact / recommend / risk
│   ├── engines/adapters/        # codebase-memory-mcp adapter
│   └── platforms/               # Git platform adapters
├── examples/                    # Config templates (.example.json)
├── enterprise/                  # 🔒 Enterprise config (.gitignore excluded)
└── docs/                        # Multi-language docs
```

---

## 🔒 Security

```
Public Layer → GitHub ✅      Enterprise Layer → enterprise/ ❌ never committed
src/ docs/ examples/          monitors.conf.json  server.conf.json
                              repo URLs / IPs / module names
```

HTTP security: IP whitelist (exact IP + CIDR subnet). Whitelisted IPs can access all 5 tools.

---

## ❓ FAQ

<details>
<summary><strong>What runtime does TIA need?</strong></summary>

Node.js >= 18 | TypeScript ESM | Git CLI | tsx

```bash
npm start && npm test    # start + 65 tests
```
</details>

<details>
<summary><strong>Why only IP whitelist for security?</strong></summary>

TIA runs inside the enterprise intranet — network isolation is already handled by infra. IP whitelist is zero-maintenance access control.
</details>

<details>
<summary><strong>What if the engine is unavailable?</strong></summary>

Silent fallback to built-in glob rule matching. Analysis never blocked.
</details>

<details>
<summary><strong>Does codebase-memory-mcp send code externally?</strong></summary>

**No.** 100% local. Embeddings compiled into binary. Only checks GitHub for version number on startup — no code leaves the machine.
</details>

<details>
<summary><strong>Which Git platforms are supported?</strong></summary>

GitHub (native) / GitLab / CodeHub / Gitee / self-hosted — via URL template adapter with auto-format detection.
</details>

<details>
<summary><strong>Full clone vs incremental?</strong></summary>

- `mode=full` — first-time full code pull
- `mode=incremental` — sprint MR changes only, requires platform MR API
</details>

---

## 📋 Requirements

| Dependency | Version |
|:---|:---|
| Node.js | >= 18 |
| TypeScript | 5.x |
| tsx | >= 4 |
| @modelcontextprotocol/sdk | >= 1.0 |
| Git | any |

## 🔧 Commands

| Command | Description |
|:---|:---|
| `npm start` | Start MCP Server (stdio) |
| `npm run dev` | Dev hot-reload |
| `npm test` | 65 unit tests |
| `npx tsc --noEmit` | Type check |
| `npm run security-check` | Source layer audit |

---

## 🗺️ Roadmap

| Phase | Content | Status |
|------|------|:--:|
| Phase 1 | Git Monitor | ✅ |
| Phase 2 | Impact Analysis | ✅ |
| Phase 3 | Test Recommendation | ✅ |
| Phase 4 | Risk Assessment | ✅ |
| Phase 5a | Engine framework + codebase-memory-mcp | ✅ |
| Phase 5c | More engine expansion | 💡 |
| Phase 6 | Security layered refactoring | ✅ |

---

## 📄 License

MIT — Use freely, modify as needed, contribute back if you can.

---

<p align="center">
  <sub>Design blueprint → <a href=".claude/plans/ultimate-blueprint-v3.md">ultimate-blueprint-v3.md</a></sub>
</p>

<p align="center">
  <sub>🤖 Generated with <a href="https://claude.com/claude-code">Claude Code</a></sub>
</p>
