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
---

## 🏗️ Setup & Security

> ⚠️ **Read this first** — 3 steps after clone to get started. Enterprise configs never leak.

### 1. Setup (3 Steps)

```bash
# Step 1: Clone
git clone git@github.com:xxx/TIA.git && cd TIA

# Step 2: Install (auto-installs git hooks)
npm install

# Step 3: Configure your repos
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # Add your monitored repos
```

### 2. Security Boundary (3-Layer Defense)

TIA separates **public source** from **enterprise config**. Internal info (repo URLs, branch names, module names) will never reach GitHub:

```
┌──────────────────────────────────────────────┐
│  GitHub Repo (Public Layer — safe to commit)  │
│  src/  docs/  examples/  CLAUDE.md  README   │
├──────────────────────────────────────────────┤
│  enterprise/  ← 🔒 Enterprise Layer (never committed) │
│  monitors.conf.json  server.conf.json  etc.   │
│  ⚠️ Entire directory excluded by .gitignore   │
└──────────────────────────────────────────────┘
```

| Layer | Trigger | Mechanism |
|-------|---------|-----------|
| **L1** | File on disk | `.gitignore` excludes `enterprise/` + root-level sensitive files |
| **L2** | `git commit` | `.githooks/pre-commit` 5 rules intercept in real-time |
| **L3** | `git push` / PR | `.github/workflows/security-check.yml` CI auto-scans |

### 3. Dual-Environment Workflow

```
【Home → GitHub】             【Office → Internal Analysis】
git push → GitHub           git clone TIA (read-only)
Source is clean ✅           enterprise/ holds internal configs
                            Pull code → Analyze → Never push ✅
```

### 4. Verify

```bash
npm run security-check   # Should show ✅ All clean
npm test                 # 83 tests should pass
```

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
├── 📦 Public Layer (committed to GitHub)
│   ├── src/                        # Core source code
│   │   ├── index.ts                # MCP Server entry + dual transport
│   │   ├── state.ts                # Config/state R/W, watermark management
│   │   ├── paths.ts                # Path resolution + resolveConfigPath
│   │   ├── security.ts             # IP whitelist + API KEY security
│   │   ├── platforms/              # Git platform adapter layer
│   │   ├── tools/                  # MCP tool modules (6 tools)
│   │   ├── impact-analysis/        # Impact analysis (Phase 2-4)
│   │   └── tests/                  # Unit tests (83 cases)
│   ├── docs/                       # Multi-language documentation
│   ├── examples/                   # Config templates (.example.json)
│   ├── scripts/                    # Security audit script
│   ├── .githooks/                  # Git security hooks (pre-commit)
│   ├── .github/workflows/          # CI security scan
│   ├── .claude/commands/           # Claude Code slash commands
│   ├── .opencode/commands/         # OpenCode commands
│   ├── .codex/skills/             # Codex skills
│   ├── README.md                   # Project entry
│   └── impact-rules.conf.json      # Impact analysis rules (sample)
│
├── 🔒 Enterprise Layer (.gitignore excluded, never committed)
│   └── enterprise/                 # Your real configs go here
│       ├── monitors.conf.json      # Repository monitoring config
│       ├── server.conf.json        # HTTP security config
│       └── .mcp.json               # MCP connection config
│
└── 🚫 Runtime Artifacts (.gitignore excluded)
    └── monitors.json               # Program-maintained watermark state
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

## 🔧 JACG Setup Guide 🔜 Phase 5b Planned

> **JACG** (Java All Call Graph) is a Phase 5b core enhancement for TIA — integrating via approach D (subprocess jar invocation) to provide **bytecode-level call chain analysis** for Java projects. JACG is an optional dependency: it enhances analysis precision when JDK is available, and gracefully degrades to the existing file-level glob matching when JDK is unavailable.

### What is JACG?

A static call chain analysis engine based on Java bytecode (ASM). It can forward-trace from method A to all downstream calls, and reverse-trace from method B back to all upstream entrypoints (Controller / MQ consumers / scheduled tasks). Within TIA, JACG upgrades the current "file-level test mapping" to "method-level end-to-end call chain analysis."

### Prerequisites

| Dependency | Version | Notes |
|------|------|------|
| JDK | >= 11 (17+ recommended) | Runtime dependency. TIA auto-degrades to file-level glob matching when unavailable |
| java-all-call-graph JAR | Included in `lib/jacg/` | Pre-built JAR ships with the project, no extra download needed |

### Multi-Platform Installation

#### Claude Code Environment

```bash
# Step 1: Verify JDK is available
java -version  # Should output JDK 11+

# Step 2 (if not installed): Install JDK
# macOS
brew install openjdk@17

# Ubuntu/Debian
sudo apt install openjdk-17-jdk

# Windows
# Download the .msi installer from https://adoptium.net/

# Step 3: Verify JACG integration status
# Run impact analysis in TIA:
impact_analysis(action="full", name="your-java-project")
# Output "📐 JACG 全量分析 (42s)" = integration successful
# Output "⚠️ JDK 不可用，降级为文件匹配" = JDK not configured
```

#### OpenCode Environment

```json
// .opencode.json — ensure TIA is connected via stdio
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
JDK installation steps are identical to Claude Code.

#### Codex Environment

```toml
# .codex/config.toml
[mcp_servers.test-impact-analysis]
command = "npx"
args = ["tsx", "src/index.ts"]
enabled = true
```
JDK installation steps are identical to the above.

### Configuration File

JACG-related configuration in `analyzers.conf.json` (planned for restoration):

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java Call Chain Analysis",
      "enabled": true,              // set to false to disable
      "fileExtensions": [".java"],
      "confidenceWeight": 90,
      "config": {
        "jarPath": "lib/jacg/java-all-call-graph.jar",
        "maxHeap": "2g",            // JVM max heap size
        "timeout": 600              // timeout in seconds
      }
    }
  ]
}
```

### Working Modes

| Mode | Trigger | Description |
|------|---------|------|
| Full Pre-generation | `impact_analysis(action="full", name="xxx")` | Invoke JACG on the entire Java codebase to generate a call graph, persisted to `.tia/` directory |
| Incremental Live Analysis | `impact_analysis(name="xxx", mrId="1423")` | Changed files → query full graph index → reverse BFS traversal → pinpoint affected APIs |
| Graceful Degradation | Automatic (when JDK unavailable) | Auto-falls back to file-level glob matching (current default behavior) |

### Comparison

| Analysis Method | Granularity | Example |
|----------|:--:|------|
| File-level glob matching (current) | File→Test mapping | `OrderService.java` changed → suggest running `OrderServiceTest` |
| JACG call chain analysis (Phase 5b) | Method→API endpoint-to-endpoint chain | `OrderService.createOrder()` → `OrderController.createOrder()` → `POST /api/orders` |

### Troubleshooting

| Issue | Cause | Solution |
|------|------|------|
| `⚠️ JDK 不可用` | java not in PATH | Run `which java` to verify path, or set `JAVA_HOME` |
| `JACG timeout` | Project too large | Increase `timeout` value in `analyzers.conf.json` |
| `OutOfMemoryError` | Insufficient heap memory | Increase `maxHeap` (e.g., `"4g"`) |
| `JAR file missing` | `lib/jacg/*.jar` does not exist | Run `scripts/download-jacg.sh` to download/build |

> ⚠️ **All content in this section is a Phase 5b preview and is not yet implemented.** TIA currently uses file-level glob matching for impact analysis, which is fully functional.

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
| **Command Dir** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
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
      "url": "git@<YOUR-GIT-HOST>:<YOUR-ORG>/example-project.git",
      "platform": "generic",
      "branch": "develop",
      "repoType": "backend",
      "module": "Order System",
      "genericConfig": {
        "apiBase": "https://<YOUR-GIT-HOST>",
        "apiTemplate": "/api/v1/projects/{owner}/repos/{repo}/commits?ref={branch}",
        "mrApiTemplate": "/api/v1/projects/{owner}/repos/{repo}/merge_requests?state=merged&target_branch={branch}&order_by=created_at&sort=asc"
      }
    }
  ]
}
```

### Impact Analysis Rules Configuration

TIA uses a two-tier rule system to define "file change → test case" mappings, powering the `impact_analysis`, `test_recommendation`, and `risk_assessment` tools.

#### Two-Tier Rule System

```
Universal Rules (Tier 1)        Enterprise Rules (Tier 2)
impact-rules.conf.json         enterprise/impact-rules.conf.json
├─ Project root                 ├─ enterprise/ directory (.gitignore excluded)
├─ Can be committed to GitHub   ├─ Local-only, never committed
└─ Ready to use out of the box  └─ Custom enterprise rules

Final result = Universal ∪ Enterprise (same id: Enterprise overrides Universal)
```

#### Quick Start (3 Steps)

```bash
# Step 1: View universal rules (already has examples)
cat impact-rules.conf.json

# Step 2: Create enterprise rules (copy from template)
cp examples/impact-rules.conf.example.json enterprise/impact-rules.conf.json

# Step 3: Edit enterprise rules, uncomment applicable preset rules
vim enterprise/impact-rules.conf.json
```

#### Rule Fields

| Field | Type | Required | Description |
|------|------|:--:|------|
| `id` | string | Yes | Unique identifier. Use `ent-` prefix for enterprise rules to avoid conflicts |
| `name` | string | Yes | Rule name for easy identification |
| `description` | string | No | Rule description explaining the covered scenarios |
| `filePatterns` | string[] | Yes | Glob patterns for file matching (supports `**` `*` `{a,b}`) |
| `testPaths` | string[] | Yes | Corresponding test file or directory paths |
| `riskLevel` | "high" / "medium" / "low" | Yes | Risk level, affects recommendation score and risk assessment |
| `appliesTo` | object | No | Rule scope filter (see below) |

#### `appliesTo` Filter Logic

Use `appliesTo` to limit rules to specific repos/modules, avoiding global matches:

| Dimension | Field | Example | Description |
|------|------|------|------|
| Repo alias | `names` | `["order-service"]` | Only applies to specified repos |
| Business module | `modules` | `["Order System"]` | Only applies to specified modules |
| Repo type | `repoTypes` | `["backend"]` | `backend` / `frontend` |
| Git platform | `platforms` | `["github"]` | `github` / `generic` / `local` |

**Logic**: Multiple dimensions use **AND** (all must match). Within a single dimension, values use **OR** (any match suffices).

#### Glob Pattern Quick Reference

| Pattern | Description | Example |
|------|------|------|
| `**` | Matches any level of directories | `src/**/*.java` — all Java files |
| `*` | Matches any characters within a single directory level | `src/*.ts` — all TS files in src |
| `{a,b}` | Matches a or b | `*.{ts,tsx}` — all TS and TSX files |

#### Preset Rule Templates Overview

The template file `examples/impact-rules.conf.example.json` provides 3 categories of preset rules (commented out), uncomment or modify as needed:

| Category | Rule IDs | Applicable Scenarios |
|------|---------|----------|
| **Java Backend** | `ent-controller` / `ent-service` / `ent-repository` / `ent-orm` / `ent-spring-config` | Controller / Service / Repository layers, ORM mapping, Spring config |
| **JS Frontend** | `ent-component` / `ent-state` / `ent-hooks` / `ent-api-service` / `ent-utils` | React components, state management, Hooks, API service layer, utilities |
| **Universal** | `ent-config` / `ent-db-migration` / `ent-security` | Config files, DB migration scripts, security-related code |

#### Extension Guide

- **Add new rules**: Add entries to `enterprise/impact-rules.conf.json`, referencing preset template format
- **Rule validation**: Run the `impact_analysis` tool and observe `matchType` and `confidence` fields in output
- **Recommended count**: 10-30 rules; split by `appliesTo` if exceeding 30
- **Periodic review**: Check auto-inference hit rate (`matchType: "inferred"`) quarterly, add missing rules

#### FAQ

<details>
<summary><b>Rules not taking effect?</b></summary>

1. Check if `appliesTo` filters match the current repo/module
2. Verify glob patterns match actual file paths (check relative path base)
3. Confirm correct rule file path: universal `impact-rules.conf.json`, enterprise `enterprise/impact-rules.conf.json`
</details>

<details>
<summary><b>How to verify rules are correct?</b></summary>

Create a test MR, run `impact_analysis`, and observe:
- `matchType: "exact"` means precise match (95% confidence)
- `matchType: "inferred"` means no rule matched, auto-inference used (30% confidence)
- If an expected rule didn't fire, check glob patterns and `appliesTo` conditions
</details>

<details>
<summary><b>What if universal and enterprise rules conflict?</b></summary>

Enterprise rules with the same `id` override universal rules. This is by design — "enterprise customization takes priority" ensures team-level rules are not affected by universal rules.
</details>

<details>
<summary><b>Is there a limit on the number of rules?</b></summary>

No hard limit, but 30 is recommended. Too many rules slow down matching and increase maintenance burden. Split by `appliesTo` for different repos when exceeding 30.
</details>

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
| **Codex** | `.codex/skills/*/SKILL.md` | `.codex/config.toml` |

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
| Phase 5a | Analyzer Registry — MCP orchestration layer | ✅ Complete |
| Phase 5b | JACG call-chain analysis (dual-mode + merge engine) | 🔜 Planned |
| Phase 5c | SQL / Perf / Python / Go analyzer expansion | 💡 Idea |
| Phase 6 | InfoSec layered refactoring — enterprise/ isolation | ✅ Complete |

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
