# Test Impact Analysis MCP Server（簡稱 TIA）

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/-MCP-black?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)

> **面向軟體測試人員的 MCP 工具集** | **6 個核心工具** | **雙 Transport 模式** | **3 平台適配器** | **跨 AI 程式框架支援**

---

<div align="center">

**🌐 語言 / Language / 語言**

[**English**](../README.en.md) | [简体中文](../README.zh-CN.md) | [繁體中文](zh-TW/README.md) | [日本語](ja-JP/README.md)

</div>

---

**面向軟體測試人員的智慧化 MCP 工具集。覆蓋測試生命週期中的"變更感知 → 影響分析 → 用例推薦 → 風險評估"全鏈路。**

透過 stdio / http 雙模 Transport 向 Claude Code、OpenCode、Codex 等 AI 程式框架暴露測試分析能力。持續監控程式碼倉庫變更，自動拉取增量程式碼，為測試人員提供基於程式碼變更的測試影響分析。

---

## 🎯 專案定位

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → 定時觸發 repo_monitor(action='check')│
│  ├─ /repo_xxx 斜線命令 → 快捷操控                    │
│  └─ MCP Client (stdio / http transport)               │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (本地)  │ http (遠端, 需認證)
┌─────────▼────────┐ ┌──▼───────────────────────────────┐
│ 直接處理序通訊    │ │ Express App (port 3100)          │
│ (零設定)          │ │  ├─ 第 0 層: IP 白名單           │
│ 直接執行 git clone │ │  ├─ 第 1 層: API KEY 校驗       │
│                   │ │  │   (TIA-init 免檢)            │
│                   │ │  ├─ /mcp → Streamable HTTP       │
│                   │ │  └─ /health                      │
└───────────────────┘ └──────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ TIA MCP Server (本專案)                              │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模組 1: Git Monitor (✅ 已實作)               │     │
│  │  ├─ 3 個 Tool — TIA-init / repo_monitor / repo_clone │
│  │  ├─ 3 種平台適配器 (GitHub / Local / Generic)  │     │
│  │  └─ 設定/狀態分離 + seenShas 去重              │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模組 2: Impact Analysis (🔜 規劃中)            │     │
│  │  └─ 程式碼變更 → 受影響模組/用例分析            │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模組 3: Test Recommendation (💡 規劃中)        │     │
│  │  └─ 基於變更智慧推薦測試用例                    │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模組 4: Risk Assessment (💡 規劃中)            │     │
│  │  └─ 變更風險量化與報告                          │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 快速開始

### 步驟 1：設定 MCP 連線

**本地模式（stdio）** — 零設定，直接使用：

```json
// .claude/settings.local.json
{
  "enabledMcpjsonServers": ["test-impact-analysis"]
}
```

**遠端模式（HTTP）** — 跨網路呼叫：

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

### 步驟 2：初始化客戶端

首次連線時呼叫 `TIA-init` 工具，自動完成 API KEY 簽發和命令檔案註冊：

```bash
TIA-init
# 或指定 Agent 類型
TIA-init(agentType="ClaudeCode")
```

### 步驟 3：設定要監控的倉庫

編輯 `monitors.conf.json`，新增要監控的倉庫：

```jsonc
{
  "repositories": [
    {
      "name": "my-backend",
      "url": "git@github.com:myteam/backend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "backend",
      "module": "使用者中心"
    }
  ]
}
```

### 步驟 4：開始使用

```bash
# 檢視所有倉庫水位
/repo_status

# 檢查新提交
/repo_check

# 按模組檢查
/repo_check module=使用者中心

# 複製程式碼到本地分析
/repo_clone full module=使用者中心
```

✨ **完成！** 你現在擁有了程式碼變更自動感知 + 增量程式碼拉取能力。

---

## 📦 專案結構

```
Test-Impact-Analysis-mcp/
│
├── src/                        # 核心原始碼
│   ├── index.ts                # MCP Server 入口 + Transport 雙模啟動
│   ├── tools.ts                # 3 個 Tool 的 Schema + 路由 + 處理函式
│   ├── state.ts                # 設定/狀態讀寫、水位管理、快照歸檔
│   ├── types.ts                # 共享型別定義
│   └── platforms/              # Git 平台適配器層
│       ├── types.ts            # PlatformAdapter 介面定義
│       ├── github.ts           # GitHub REST API v3 適配器
│       ├── generic.ts          # 通用 REST API 適配器（GitLab/CodeHub 等）
│       └── local.ts            # 本地 git 命令適配器
│
├── .claude/commands/           # Claude Code 斜線命令
│   ├── repo_monitor.md         # /repo_monitor — 統一監控入口
│   ├── repo_clone.md           # /repo_clone — 統一副製入口
│   ├── repo_status.md          # /repo_status — 檢視水位
│   ├── repo_check.md           # /repo_check — 檢查更新
│   └── repo_reset.md           # /repo_reset — 重置水位
│
├── .opencode/commands/         # OpenCode 命令
├── .agents/skills/             # Codex 技能
│
├── monitors.conf.json          # 使用者手寫的倉庫監控設定
├── monitors.json               # 程式維護的水位狀態檔案
└── server.conf.json            # HTTP 模式安全設定
```

---

## 🛠️ 核心工具

### 克制設計原則

> **MCP 工具越多 → 上下文膨脹 → LLM 推理能力下降。** 本專案從 7 個工具合併為 3 個，精簡 57%。

| 原則 | 做法 |
|------|------|
| 能透過設定檔完成的事 | **不建工具**。直接編輯 JSON |
| 純查詢無副作用 | 合併到既有工具的 `action` 參數 |
| 單一功能薄包裝 | 審視是否可以合併到語義相近的工具 |

### Tool 1：`repo_monitor` — 統一倉庫監控

三種操作透過 `action` 參數選擇：

#### `action=status` — 檢視水位狀態

```bash
repo_monitor(action="status")                     # 全部倉庫
repo_monitor(action="status", name="gh-backend")  # 單個倉庫
repo_monitor(action="status", module="使用者中心")  # 按模組
```

#### `action=check` — 檢查新提交

比對遠端 HEAD 與本地水位，返回新提交摘要。**首次檢查自動初始化水位。**

```bash
repo_monitor(action="check")                      # 全部倉庫
repo_monitor(action="check", name="gh-backend")   # 單個倉庫
repo_monitor(action="check", module="使用者中心")  # 按模組
```

配合定時監控：

```bash
# 每 15 分鐘自動檢查全部倉庫
/cron "*/15 * * * *" "repo_monitor(action='check')"

# 每 2 小時檢查某模組
/cron "7 */2 * * *" "repo_monitor(action='check', module='使用者中心')"
```

#### `action=reset` — 重置水位（迭代切換）

```bash
# 普通重置
repo_monitor(action="reset", name="gh-backend", label="手動重置")

# 日期定位 — 自動尋找迭代第一個 MR 的 base commit
repo_monitor(action="reset", module="使用者中心", label="Sprint 26 啟動", sinceDate="2026-06-13")
```

### Tool 2：`repo_clone` — 複製程式碼到本地

按 `repoType` 自動選擇儲存路徑：

```
{baseDir}/Repository/
├── Frontend repository/   ← repoType="frontend"
│   └── {repo-name}/
│       ├── {branch}/      ← mode=full 全量
│       └── {mr-id}/       ← mode=incremental
└── Backend repository/    ← repoType="backend"
    └── {repo-name}/
```

#### mode=full — 全量複製

```bash
repo_clone(mode="full", name="gh-backend")               # 單個倉庫初始化
repo_clone(mode="full", module="使用者中心")               # 按模組批次初始化
repo_clone(mode="full", name="gh-backend", force=true)   # 強制覆蓋
```

#### mode=incremental — 增量複製 MR

```bash
# 按日期拉取
repo_clone(mode="incremental", module="使用者中心", sinceDate="2026-06-01")

# 按基線 MR 拉取
repo_clone(mode="incremental", name="gh-backend", sinceMrId="1234")
```

### Tool 3：`TIA-init` — 客戶端初始化引導

首次連線時呼叫，自動完成：
- 🔑 API KEY 簽發（SHA-256 雜湊儲存）
- 📁 命令檔案註冊（自動識別 Claude Code / OpenCode / Codex）
- 🔗 MCP 設定範本返回

---

## 🗺️ 命令速查

| 命令 | 用法 | 說明 |
|------|------|------|
| `/repo_monitor` | `/repo_monitor <action> [name=\|module=] [flags]` | 統一監控入口 |
| `/repo_clone` | `/repo_clone <mode> <name=\|module=> [flags]` | 統一副製入口 |
| `/repo_status` | `/repo_status [name=\|module=]` | 檢視倉庫水位（快捷命令） |
| `/repo_check` | `/repo_check [name=\|module=]` | 檢查新提交（快捷命令） |
| `/repo_reset` | `/repo_reset <target> [--label] [--since]` | 重置水位（快捷命令） |

---

## 🌐 跨平台支援

同一套 MCP 工具，三個 AI 程式框架共享。

| 維度 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **命令目錄** | `.claude/commands/` | `.opencode/commands/` | `.agents/skills/` |
| **檔案格式** | `.md` (frontmatter + 指令) | `.md` ($NAME 佔位符) | `SKILL.md` (YAML frontmatter) |
| **呼叫方式** | `/命令名` | `Ctrl+K` 命令面板 | `$技能名` |
| **MCP 設定** | `.claude/settings.local.json` | `.opencode.json` → `mcpServers` | `.codex/config.toml` |

### 命令/技能對映

| 功能 | Claude Code | OpenCode | Codex |
|------|------------|----------|-------|
| 統一監控 | `/repo_monitor` | `repo_monitor` cmd | `$repo-monitor` |
| 統一複製 | `/repo_clone` | `repo_clone` cmd | `$repo-clone` |
| 檢視水位 | `/repo_status` | `repo_status` cmd | `$repo-status` |
| 檢查更新 | `/repo_check` | `repo_check` cmd | `$repo-check` |
| 重置水位 | `/repo_reset` | `repo_reset` cmd | `$repo-reset` |

---

## 🔌 Transport 雙模

| 模式 | 環境變數 | Transport | repo_clone 行為 | 適用場景 |
|------|---------|-----------|----------------|---------|
| stdio | 預設 | `StdioServerTransport` | 直接執行 git clone | 本地開發 / 單機使用 |
| http | `MCP_TRANSPORT=http` | `StreamableHTTPServerTransport` | 返回指令，客戶端執行 | 遠端呼叫 / 多客戶端 |

### HTTP 模式啟動

```bash
MCP_TRANSPORT=http npx tsx src/index.ts
MCP_TRANSPORT=http MCP_PORT=4200 npx tsx src/index.ts    # 自訂埠號
```

### 安全認證（兩層防護）

```
第 0 層 (Express 中介層): 所有 /mcp 請求 → IP 白名單校驗 → 通過/403
                            │
              ┌─────────────┼─────────────┐
              ▼                           ▼
         TIA-init 工具              其他所有工具
         (免 API KEY)              (必檢 API KEY)
              │                           │
              ▼                           ▼
      簽發 API KEY                  校驗 API KEY
      返回命令檔案                  touchApiKey (更新 lastUsed)
```

---

## 🗺️ 開發路線圖

| 階段 | 內容 | 狀態 |
|------|------|------|
| Phase 1 | Git Monitor — 倉庫變更感知與程式碼拉取 | ✅ 已完成 |
| Phase 1.5 | Transport 雙模 + IP 白名單 | ✅ 已完成 |
| Phase 1.6 | `repo_clone` 遠端模式 | ✅ 已完成 |
| Phase 1.7 | TIA-init 客戶端初始化引導 | ✅ 已完成 |
| Phase 2 | Impact Analysis — 程式碼變更影響分析 | ✅ 已完成 |
| Phase 3 | Test Recommendation — 智慧測試推薦 | ✅ 已完成 |
| Phase 4 | Risk Assessment — 變更風險量化 | ✅ 已完成 |

---

## 📄 技術棧

- TypeScript / ESM（`"type": "module"`）
- `@modelcontextprotocol/sdk` — MCP Server SDK
- Express.js（HTTP 模式）
- `tsx` — 執行時（零建置步驟）
- Node.js >= 18

---

## 📄 授權條款

MIT — 自由使用，依需求修改，如果可以請回饋貢獻。

---

**如果本專案對你有幫助，請點亮 Star。把程式碼變更感知能力帶給你的測試工作流。**
