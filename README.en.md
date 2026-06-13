# Test Impact Analysis MCP Server (TIA)

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/-MCP-black?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)

> **MCP Toolset for Software Testers** | **6 Core Tools** | **Dual Transport** | **3 Platform Adapters** | **Cross-Framework Support**

---

<div align="center">

**🌐 语言 / Language / 語言**

[**English**](README.en.md) | [简体中文](README.zh-CN.md) | [繁體中文](docs/zh-TW/README.md) | [日本語](docs/ja-JP/README.md)

</div>

---

**An intelligent MCP (Model Context Protocol) toolset built for software testers. Covers the full testing lifecycle: "Change Awareness → Impact Analysis → Test Recommendation → Risk Assessment."**

Exposes test analysis capabilities to Claude Code, OpenCode, Codex, and other AI coding frameworks via stdio / HTTP dual-mode transport. Continuously monitors repository changes, automatically pulls incremental code, and provides change-based test impact analysis for QA teams.

---

## 🎯 Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → scheduled repo_monitor(action='check')│
│  ├─ /repo_xxx slash commands → quick actions         │
│  └─ MCP Client (stdio / http transport)               │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (local) │ http (remote, authenticated)
┌─────────▼────────┐ ┌──▼───────────────────────────────┐
│ Direct process   │ │ Express App (port 3100)          │
│ (zero config)    │ │  ├─ Layer 0: IP Whitelist        │
│ Direct git clone │ │  ├─ Layer 1: API KEY Auth        │
│                  │ │  │   (TIA-init exempt)           │
│                  │ │  ├─ /mcp → Streamable HTTP       │
│                  │ │  └─ /health                      │
└──────────────────┘ └──────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ TIA MCP Server (This Project)                        │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ Module 1: Git Monitor (✅ Complete)          │     │
│  │  ├─ 3 Tools — TIA-init / repo_monitor / repo_clone │
│  │  ├─ 3 Platform Adapters (GitHub / Local / Generic) │
│  │  └─ Config/State Separation + seenShas Dedup       │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ Module 2: Impact Analysis (✅ Complete)           │     │
│  │  ├─ impact_analysis Tool                           │     │
│  │  ├─ Glob matching engine + confidence scoring      │     │
│  │  └─ Auto-inference of test mappings                │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ Module 3: Test Recommendation (✅ Complete)       │     │
│  │  ├─ test_recommendation Tool                      │     │
│  │  ├─ Score = risk_weight × confidence              │     │
│  │  └─ Minimum viable test suite generation          │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ Module 4: Risk Assessment (✅ Complete)           │     │
│  │  ├─ risk_assessment Tool                          │     │
│  │  ├─ 3-factor scoring (files/modules/confidence)   │     │
│  │  └─ Intelligent mitigation suggestions            │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Step 1: Configure MCP Connection

**Local Mode (stdio)** — Zero config, instant use:

```json
// .claude/settings.local.json
{
  "enabledMcpjsonServers": ["test-impact-analysis"]
}
```

**Remote Mode (HTTP)** — Cross-network invocation:

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

### Step 2: Initialize Client

Call the `TIA-init` tool on first connection to auto-issue API KEY and register command files:

```bash
# In Claude Code
TIA-init
```

### Step 3: Configure Repositories to Monitor

Edit `monitors.conf.json` to add your repositories:

```jsonc
{
  "repositories": [
    {
      "name": "my-backend",
      "url": "git@github.com:myteam/backend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "backend",
      "module": "User Center"
    }
  ]
}
```

### Step 4: Start Using

```bash
# View all repository watermarks
/repo_status

# Check for new commits
/repo_check

# Check by module
/repo_check module="User Center"

# Clone code for local analysis
/repo_clone full module="User Center"
```

✨ **Done!** You now have automated code change detection + incremental code pulling.

---

## 📦 What's Inside

```
Test-Impact-Analysis-mcp/
│
├── src/                        # Core source code
│   ├── index.ts                # MCP Server entry + dual transport startup
│   ├── tools.ts                # 3 Tool schemas + routing + handlers
│   ├── state.ts                # Config/state R/W, watermark management, snapshot archiving
│   ├── types.ts                # Shared type definitions
│   └── platforms/              # Git platform adapter layer
│       ├── types.ts            # PlatformAdapter interface
│       ├── github.ts           # GitHub REST API v3 adapter
│       ├── generic.ts          # Generic REST API adapter (GitLab/CodeHub/etc.)
│       └── local.ts            # Local git command adapter
│
├── .claude/commands/           # Claude Code slash commands
│   ├── repo_monitor.md         # /repo_monitor — unified monitoring
│   ├── repo_clone.md           # /repo_clone — unified cloning
│   ├── repo_status.md          # /repo_status — view watermarks
│   ├── repo_check.md           # /repo_check — check updates
│   └── repo_reset.md           # /repo_reset — reset watermarks
│
├── .opencode/commands/         # OpenCode commands
│   ├── repo_monitor.md
│   ├── repo_clone.md
│   ├── repo_status.md
│   ├── repo_check.md
│   └── repo_reset.md
│
├── .agents/skills/             # Codex skills
│   ├── repo-monitor/SKILL.md
│   ├── repo-clone/SKILL.md
│   ├── repo-status/SKILL.md
│   ├── repo-check/SKILL.md
│   └── repo-reset/SKILL.md
│
├── monitors.conf.json          # User-edited repository monitoring config
├── monitors.json               # Program-maintained watermark state
└── server.conf.json            # HTTP mode security config
```

---

## 🛠️ Core Tools

### Design Principle: Tool Restraint

> **More MCP tools → bigger context footprint → degraded LLM reasoning.** The project started by merging 7 tools into 3 (57% reduction). Phase 2-4 added 3 analysis tools (6 total), each justified by distinct data sources/outcomes.

| Principle | Practice |
|-----------|----------|
| Config-file tasks | **No tool.** Edit JSON directly |
| Read-only queries | Merge into existing tool via `action` param |
| Thin single-purpose wrappers | Evaluate semantic merge opportunities |

### Tool 1: `repo_monitor` — Unified Repository Monitoring

Three operations via the `action` parameter:

#### `action=status` — View Watermark Status

```bash
repo_monitor(action="status")                     # All repositories
repo_monitor(action="status", name="gh-backend")  # Single repository
repo_monitor(action="status", module="User Center") # By module
```

Sample output:

```
📊 Monitoring 5 repositories:

📦 gh-backend  [Module: User Center]
   Type: backend    Platform: github     Branch: main
   Watermark: a1b2c3d   Last check: 2026/6/13 14:30:00
   Last reset: "Sprint 25 kickoff" (e4f5g6h → a1b2c3d)
```

#### `action=check` — Check for New Commits

Compares remote HEAD against the local watermark, returns new commit summaries. **Auto-initializes watermark on first run.**

```bash
repo_monitor(action="check")                      # All repositories
repo_monitor(action="check", name="gh-backend")   # Single repository
repo_monitor(action="check", module="User Center") # By module
```

Scheduled monitoring with CronCreate:

```bash
# Check all repos every 15 minutes
/cron "*/15 * * * *" "repo_monitor(action='check')"

# Check a module every 2 hours
/cron "7 */2 * * *" "repo_monitor(action='check', module='User Center')"
```

#### `action=reset` — Reset Watermark (Sprint Transition)

```bash
# Standard reset — reset to current remote HEAD
repo_monitor(action="reset", name="gh-backend", label="Manual reset")

# Date-based — auto-locate first MR base commit after sprint start
repo_monitor(action="reset", module="User Center", label="Sprint 26 Kickoff", sinceDate="2026-06-13")
```

### Tool 2: `repo_clone` — Clone Code Locally

Auto-selects storage path based on `repoType`:

```
{baseDir}/Repository/
├── Frontend repository/   ← repoType="frontend"
│   └── {repo-name}/
│       ├── {branch}/      ← mode=full
│       └── {mr-id}/       ← mode=incremental
└── Backend repository/    ← repoType="backend"
    └── {repo-name}/
```

#### mode=full — Full Clone

```bash
repo_clone(mode="full", name="gh-backend")               # Single repo init
repo_clone(mode="full", module="User Center")             # Batch by module
repo_clone(mode="full", name="gh-backend", force=true)   # Force overwrite
```

#### mode=incremental — Incremental MR Clone

```bash
# Pull by date range
repo_clone(mode="incremental", module="User Center", sinceDate="2026-06-01")

# Pull from baseline MR
repo_clone(mode="incremental", name="gh-backend", sinceMrId="1234")
```

### Tool 3: `TIA-init` — Client Initialization Bootstrap

Call on first connection to auto-complete:
- 🔑 API KEY issuance (SHA-256 hash stored)
- 📁 Command file registration (auto-detects Claude Code / OpenCode / Codex)
- 🔗 MCP configuration template returned

```bash
TIA-init
# Or specify agent type
TIA-init(agentType="ClaudeCode")
```

### Tool 4: `impact_analysis` — Change Impact Analysis

Matches changed files to test modules using rules from `impact-rules.conf.json`.

```bash
impact_analysis(name="gh-backend")                  # Analyze from watermark to HEAD
impact_analysis(module="User Center")               # Analyze by module
```

**Strategy**: glob matching + 4-level confidence (exact 95% / directory 70% / wildcard 45% / inferred 30%)

### Tool 5: `test_recommendation` — Smart Test Recommendation

Computes recommendation scores, prioritizes tests, and generates a minimum viable test suite.

```bash
test_recommendation(name="gh-backend")
```

**Score** = risk_weight (high=100/medium=50/low=20) × confidence (0-100)  
**Groups**: Strong (≥7000) | Recommended (≥2000) | Optional

### Tool 6: `risk_assessment` — Change Risk Assessment

Quantifies change risk across three dimensions: file count, module risk distribution, and confidence.

```bash
risk_assessment(name="gh-backend")
```

**Scoring**: files (0-60) + modules (0-40) + confidence penalty (0-20) = 0-100  
**Levels**: 🟢 Low (≤30) | 🟡 Medium (31-60) | 🟠 High (61-85) | 🔴 Critical (86-100)

---

## 🗺️ Command Reference

| Command | Usage | Description |
|------|------|------|
| `/repo_monitor` | `/repo_monitor <action> [name=\|module=] [flags]` | Unified monitoring entry |
| `/repo_clone` | `/repo_clone <mode> <name=\|module=> [flags]` | Unified clone entry |
| `/repo_status` | `/repo_status [name=\|module=]` | View watermarks (shortcut) |
| `/repo_check` | `/repo_check [name=\|module=]` | Check new commits (shortcut) |
| `/repo_reset` | `/repo_reset <target> [--label] [--since]` | Reset watermarks (shortcut) |
| `impact_analysis` | `impact_analysis [name=\|module=] [from=] [to=]` | Change impact analysis |
| `test_recommendation` | `test_recommendation [name=\|module=] [from=] [to=]` | Smart test recommendation |
| `risk_assessment` | `risk_assessment [name=\|module=] [from=] [to=]` | Change risk assessment |

### Common Examples

```bash
/repo_status                                          # View all repository watermarks
/repo_status name=gh-backend                          # View single repository
/repo_check module="User Center"                      # Check module for new commits
/repo_reset module="User Center" --label "S26" --since 2026-06-13  # Sprint transition
/repo_clone full name=gh-backend                      # Full clone
/repo_clone incremental module="User Center" --since 2026-06-01  # Incremental MR pull
```

---

## 🌐 Cross-Platform Support

Same MCP toolset, shared across three AI coding frameworks.

| Dimension | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **Command Dir** | `.claude/commands/` | `.opencode/commands/` | `.agents/skills/` |
| **File Format** | `.md` (frontmatter + instructions) | `.md` ($NAME placeholders) | `SKILL.md` (YAML frontmatter) |
| **Invocation** | `/command-name` | `Ctrl+K` command palette | `$skill-name` |
| **MCP Config** | `.claude/settings.local.json` | `.opencode.json` → `mcpServers` | `.codex/config.toml` → `[mcp_servers]` |

### Command/Skill Mapping

| Feature | Claude Code | OpenCode | Codex |
|------|------------|----------|-------|
| Unified Monitor | `/repo_monitor` | `repo_monitor` cmd | `$repo-monitor` |
| Unified Clone | `/repo_clone` | `repo_clone` cmd | `$repo-clone` |
| View Watermarks | `/repo_status` | `repo_status` cmd | `$repo-status` |
| Check Updates | `/repo_check` | `repo_check` cmd | `$repo-check` |
| Reset Watermarks | `/repo_reset` | `repo_reset` cmd | `$repo-reset` |
| Impact Analysis | `impact_analysis` | `impact_analysis` cmd | `$impact-analysis` |
| Test Recommend | `test_recommendation` | `test_recommendation` cmd | `$test-recommendation` |
| Risk Assess | `risk_assessment` | `risk_assessment` cmd | `$risk-assessment` |

---

## 🔌 Dual Transport

| Mode | Env Var | Transport | repo_clone Behavior | Use Case |
|------|---------|-----------|-------------------|----------|
| stdio | Default | `StdioServerTransport` | Executes git clone directly | Local dev / single machine |
| http | `MCP_TRANSPORT=http` | `StreamableHTTPServerTransport` | Returns instructions, client executes | Remote / multi-client |

### HTTP Mode Startup

```bash
# Basic startup
MCP_TRANSPORT=http npx tsx src/index.ts

# Custom port
MCP_TRANSPORT=http MCP_PORT=4200 npx tsx src/index.ts
```

### Security (Two-Layer Defense)

```
Layer 0 (Express Middleware): All /mcp requests → IP Whitelist → Pass / 403
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                                       ▼
         TIA-init Tool                        All Other Tools
         (API KEY exempt)                     (API KEY required)
              │                                       │
              ▼                                       ▼
      Issue API KEY                           Verify API KEY
      Return command files                    touchApiKey (update lastUsed)
```

---

## 🏗️ Architecture

### Layered Design (Unidirectional Dependencies)

| Layer | Files | Responsibility | Depends On |
|----|------|------|------|
| **Types** | `types.ts` + `platforms/types.ts` | All type definitions + adapter interfaces | None |
| **State** | `state.ts` | Config/state R/W, watermark management, snapshot archiving | Types |
| **Security** | `security.ts` | IP whitelist, API KEY issuance/verification | Types |
| **Tools** | `tools/*.ts` | 6 Tool schemas + routing | State + Security + Adapters |
| **Impact Analysis** | `impact-analysis/*.ts` | Rule matching / recommendation / risk scoring | Types + State |
| **Adapters** | `platforms/*.ts` | Git platform API encapsulation, implements `PlatformAdapter` | Types |
| **Entry** | `index.ts` | Dual transport startup + security middleware injection | All above |

### Platform Adapters

| Platform | Adapter | HEAD | Commit Range | MR Locate | MR List |
|------|--------|------|---------|--------|--------|
| `github` | `GitHubAdapter` | REST API `/git/refs` | `/compare` API | Query closed PRs, filter | Paginate closed PRs |
| `local` | `LocalGitAdapter` | `git rev-parse` | `git log base..head` | `git log --merges` | No sinceMrId support |
| `generic` | `GenericGitAdapter` | Generic API template | 100 commits, local slice | `mrApiTemplate` compatible | `mrApiTemplate` pagination |

### State Management

- **Config/State Separation**: `monitors.conf.json` (user-edited) ↔ `monitors.json` (program-maintained)
- **seenShas Dedup**: Up to 500 entries, prevents duplicate reporting
- **Watermark Snapshots**: Up to 20 entries, retains sprint transition history
- **API KEY Security**: SHA-256 hash only; raw key shown once at issuance

---

## 📋 Configuration Reference

### monitors.conf.json

```jsonc
{
  "repositories": [
    {
      "name": "my-backend",                       // Unique repository alias
      "url": "git@github.com:myteam/backend.git", // Git remote URL
      "platform": "github",                       // github | local | generic
      "branch": "main",                           // Branch to monitor
      "repoType": "backend",                      // frontend | backend
      "module": "User Center",                    // Business module name
      "auth": { "type": "none" }                  // none | token | rsa
    },
    {
      "name": "codehub-order",
      "url": "git@codehub.huawei.com:myproject/order-service.git",
      "platform": "generic",
      "branch": "develop",
      "repoType": "backend",
      "module": "Order System",
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

## 🧪 Typical Workflow

```
# ─── One-time Setup ───
# 1. Edit monitors.conf.json to add repositories
# 2. Call TIA-init to complete initialization

# ─── Daily Monitoring ───
/repo_check                                        # Check for new commits
/repo_check module="User Center"                   # Check specific module

# ─── Pull Code for Analysis ───
/repo_clone full module="User Center"              # Initialize full codebase
/repo_clone incremental module="User Center" --since 2026-06-01  # Pull sprint MRs

# ─── Sprint Transition ───
/repo_reset module="User Center" --label "Sprint 26 Kickoff" --since 2026-06-13

# ─── Scheduled Monitoring ───
/cron "*/15 * * * *" "repo_monitor(action='check')"

# ─── Impact Analysis ───
impact_analysis(name="gh-backend")              # What tests are affected?
test_recommendation(name="gh-backend")          # Which to run first?
risk_assessment(name="gh-backend")              # How risky is this change?
```

---

## ❓ FAQ

<details>
<summary><b>What runtime environment does TIA require?</b></summary>

- Node.js >= 18
- TypeScript / ESM (`"type": "module"`)
- Git CLI tools
- `tsx` runtime (zero build steps, executes .ts directly)

```bash
npm start              # npx tsx src/index.ts
npm run dev            # tsx --watch (hot reload)
npx tsc --noEmit       # Type checking
```

</details>

<details>
<summary><b>Why is auth type "none" by default?</b></summary>

In most scenarios, local git SSH config + RSA public keys handle authentication. The MCP Server just needs to spawn git clone/fetch — auth goes through the OS-level SSH agent. Only when API calls (e.g., GitHub REST API) are needed do you configure a token.

</details>

<details>
<summary><b>Which Git platforms does the Generic adapter support?</b></summary>

The `genericConfig.apiTemplate` and `genericConfig.mrApiTemplate` patterns support any Git platform with a REST API:
- **GitLab**: Use GitLab-format API paths
- **Huawei CodeHub**: Configure Huawei Cloud API endpoints
- **Gitee**: Configure Gitee API endpoints
- **Self-hosted GitLab / Gogs / Gitea**: All adaptable via URL templates

The adapter auto-detects response formats (GitHub vs GitLab style) and handles various data containers (top-level array / `{data: []}` / `{items: []}`).

</details>

<details>
<summary><b>What are the prerequisites for incremental cloning?</b></summary>

1. Repository must have `repoType` configured (frontend or backend)
2. Platform must support MR/PR queries:
   - GitHub: Native support
   - Generic: Requires `mrApiTemplate` config
   - Local: Only supports `sinceDate` mode
3. A full clone must already exist (incremental mode uses `git clone --no-hardlinks` from the full clone as shared object store)

</details>

<details>
<summary><b>How is security handled in HTTP mode?</b></summary>

Two-layer defense:
- **Layer 0**: IP whitelist (exact IP + CIDR subnet), non-whitelisted IPs get 403
- **Layer 1**: API KEY verification (SHA-256 hash comparison), only `TIA-init` is exempt
- API KEY never stored in plaintext — only SHA-256 hash
- `server.conf.json` is independent from `monitors.conf.json` — security config never leaks

</details>

<details>
<summary><b>Which AI coding frameworks are supported?</b></summary>

Three platforms currently supported:

| Framework | Command Files | MCP Config |
|------|---------|---------|
| **Claude Code** | `.claude/commands/*.md` | `.claude/settings.local.json` |
| **OpenCode** | `.opencode/commands/*.md` | `.opencode.json` |
| **Codex** | `.agents/skills/*/SKILL.md` | `.codex/config.toml` |

</details>

---

## 🗺️ Roadmap

| Phase | Content | Status |
|------|------|------|
| Phase 1 | Git Monitor — Repository change detection & code pulling | ✅ Complete |
| Phase 1.5 | Dual Transport + IP Whitelist | ✅ Complete |
| Phase 1.6 | `repo_clone` remote mode (Transport-aware, returns instructions) | ✅ Complete |
| Phase 1.7 | TIA-init client bootstrap (API KEY self-service + Commands sync) | ✅ Complete |
| Phase 2 | Impact Analysis — Code changes → Affected modules/test cases | ✅ Complete |
| Phase 3 | Test Recommendation — Change-based intelligent test recommendations | ✅ Complete |
| Phase 4 | Risk Assessment — Change risk quantification & reporting | ✅ Complete |

---

## 🤝 Contributing

**Contributions welcome!** This project targets software testing scenarios. If you have:

- New Git platform adapters
- Better config file templates
- Improved test analysis algorithms
- Command adaptations for more AI coding frameworks

Please submit an Issue or PR.

---

## 📄 Tech Stack

- TypeScript / ESM (`"type": "module"`)
- `@modelcontextprotocol/sdk` — MCP Server SDK
- Express.js (HTTP mode)
- `tsx` — Runtime (zero build steps)
- Node.js >= 18

```bash
npm start              # Start MCP Server
npm run dev            # Dev hot reload
npx tsc --noEmit       # Type check (tsconfig strict: true)
```

---

## 📄 License

MIT — Use freely, modify as needed, contribute back if you can.

---

**If this project helps you, please give it a Star. Bring change awareness to your testing workflow.**
