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
---

## 🏗️ 初始化與安全

> ⚠️ **首次使用必讀** — clone 後只需 3 步即可安全使用，企業敏感設定永不外洩。

### 1. 初始化（3 步上手）

```bash
# 第 1 步：複製倉庫
git clone git@github.com:xxx/TIA.git && cd TIA

# 第 2 步：安裝依賴（自動安裝 git hooks）
npm install

# 第 3 步：設定你的倉庫
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # 填入你要監控的倉庫資訊
```

### 2. 安全邊界（三層防護）

TIA 嚴格區分**原始碼層**與**企業設定層**，確保企業內部資訊永遠不會提交到 GitHub：

```
┌──────────────────────────────────────────────┐
│  GitHub 倉庫（原始碼層 — 安全可提交）           │
│  src/  docs/  examples/  CLAUDE.md  README   │
├──────────────────────────────────────────────┤
│  enterprise/  ← 🔒 企業設定層（永不提交）       │
│  monitors.conf.json  server.conf.json 等      │
│  ⚠️ 整個目錄被 .gitignore 排除                │
└────────────────────────────────────────────┘
```

| 防線 | 觸發時機 | 機制 |
|------|----------|------|
| **第 1 層** | 檔案落盤 | `.gitignore` 排除 `enterprise/` 及根目錄敏感檔案 |
| **第 2 層** | `git commit` | `.githooks/pre-commit` 5 條規則即時攔截 |
| **第 3 層** | `git push` / PR | `.github/workflows/security-check.yml` CI 自動掃描 |

### 3. 雙環境無感切換

```
【在家 → GitHub】            【公司 → 內網分析】
git push → GitHub          git clone TIA（唯讀）
原始碼層不含企業資訊 ✅       enterprise/ 配企業倉庫
                           拉程式碼 → 分析 → 不推送 ✅
```

### 4. 驗證安裝

```bash
npm run security-check   # 原始碼層應顯示 ✅ 自查通過
npm test                 # 83 個測試應全部通過
```

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
│  │ 模組 2: Impact Analysis (✅ 已實作)            │     │
│  │  └─ 程式碼變更 → 受影響模組/用例分析            │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模組 3: Test Recommendation (✅ 已實作)        │     │
│  │  └─ 基於變更智慧推薦測試用例                    │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ 模組 4: Risk Assessment (✅ 已實作)            │     │
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
      "url": "git@github.com:<YOUR-ORG>/example-backend.git",
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
├── 📦 原始碼層（提交到 GitHub）
│   ├── src/                        # 核心原始碼
│   ├── docs/                       # 文件
│   ├── examples/                   # 設定範本
│   ├── scripts/                    # 工具腳本
│   ├── .githooks/                  # Git 安全掛鉤
│   ├── .github/workflows/          # CI 安全掃描
│   ├── .claude/commands/           # Claude Code 斜線命令
│   ├── .opencode/commands/         # OpenCode 命令
│   ├── .codex/skills/             # Codex 技能
│   ├── README.md                   # 專案入口
│   └── impact-rules.conf.json      # 影響分析規則（範例）
│
├── 🔒 企業設定層（.gitignore 排除，永不提交）
│   └── enterprise/                 # 你的真實設定放這裡
│       ├── monitors.conf.json
│       ├── server.conf.json
│       └── .mcp.json
│
└── 🚫 執行時期產物（.gitignore 排除）
    └── monitors.json               # 程式維護的水位狀態
```

---

## 🛠️ 核心工具

### 克制設計原則

> **MCP 工具越多 → 上下文膨脹 → LLM 推理能力下降。** 本專案從 7 個工具合併為 3 個，精簡 57%。Phase 2-4 新增 3 個分析工具（共 6 個），每個都有獨立的資料源和副作用邊界。

| 原則 | 做法 |
|------|------|
| 能透過設定檔完成的事 | **不建工具**。直接編輯 JSON |
| 不同資料源/副作用 | 獨立工具（impact_analysis / test_recommendation / risk_assessment） |
| 語義相近可合併 | 合併到既有工具的 `action` 參數 |

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

### Tool 4：`impact_analysis` — 程式碼變更影響分析

基於 `impact-rules.conf.json` 中設定的檔案→測試對映規則，自動匹配變更檔案對應的測試模組。

```bash
impact_analysis(name="gh-backend")              # 分析從水位到 HEAD
impact_analysis(name="gh-backend", from="a", to="b")  # 指定 SHA 範圍
impact_analysis(module="使用者中心")               # 按模組批次分析
```

**匹配策略**: glob 匹配 + 四級信心度（精確 95% / 目錄 70% / 萬用字元 45% / 推斷 30%）

### Tool 5：`test_recommendation` — 智慧測試推薦

在影響分析結果上計算推薦分，按優先級排序，生成最小可行測試集。

```bash
test_recommendation(name="gh-backend")
test_recommendation(module="使用者中心")
```

**推薦分** = 風險權重 (high=100 / medium=50 / low=20) × 信心度 (0-100)  
**分組**: 強烈建議 (≥7000) | 建議 (≥2000) | 可選

### Tool 6：`risk_assessment` — 變更風險評估

量化程式碼變更風險，綜合檔案數量、模組風險分佈、信心度三維度計算。

```bash
risk_assessment(name="gh-backend")
risk_assessment(module="使用者中心")
```

**評分**: 檔案分 (0-60) + 模組分 (0-40) + 信心度懲罰 (0-20) = 0-100  
**等級**: 🟢 低 (≤30) | 🟡 中 (31-60) | 🟠 高 (61-85) | 🔴 嚴重 (86-100)

---

## 🗺️ 命令速查

| 命令 | 用法 | 說明 |
|------|------|------|
| `/repo_monitor` | `/repo_monitor <action> [name=\|module=] [flags]` | 統一監控入口 |
| `/repo_clone` | `/repo_clone <mode> <name=\|module=> [flags]` | 統一副製入口 |
| `/repo_status` | `/repo_status [name=\|module=]` | 檢視倉庫水位（快捷命令） |
| `/repo_check` | `/repo_check [name=\|module=]` | 檢查新提交（快捷命令） |
| `/repo_reset` | `/repo_reset <target> [--label] [--since]` | 重置水位（快捷命令） |
| `impact_analysis` | `impact_analysis [name=\|module=] [from=] [to=]` | 程式碼變更影響分析 |
| `test_recommendation` | `test_recommendation [name=\|module=] [from=] [to=]` | 智慧測試推薦 |
| `risk_assessment` | `risk_assessment [name=\|module=] [from=] [to=]` | 變更風險評估 |

---

## 🌐 跨平台支援

同一套 MCP 工具，三個 AI 程式框架共享。

| 維度 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **命令目錄** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
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
| 影響分析 | `impact_analysis` | `impact_analysis` cmd | `$impact-analysis` |
| 測試推薦 | `test_recommendation` | `test_recommendation` cmd | `$test-recommendation` |
| 風險評估 | `risk_assessment` | `risk_assessment` cmd | `$risk-assessment` |

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

## 📋 影響分析規則配置

TIA 使用兩級規則體系來定義「檔案變更 → 測試案例」的對應關係，支撐 `impact_analysis`、`test_recommendation`、`risk_assessment` 三個分析工具。

#### 兩級規則體系

```
通用規則（第 1 級）              企業規則（第 2 級）
impact-rules.conf.json        enterprise/impact-rules.conf.json
├─ 專案根目錄                   ├─ enterprise/ 目錄（.gitignore 排除）
├─ 可提交到 GitHub              ├─ 僅本機有效，永不提交
└─ 所有使用者開箱即用            └─ 企業內部客製化規則

最終生效 = 通用規則 ∪ 企業規則（同 id 企業覆蓋通用）
```

#### 快速上手（3 步）

```bash
# 第 1 步：檢視通用規則（已有範例）
cat impact-rules.conf.json

# 第 2 步：建立企業規則（從範本複製）
cp examples/impact-rules.conf.example.json enterprise/impact-rules.conf.json

# 第 3 步：編輯企業規則，取消註解適用的預設規則
vim enterprise/impact-rules.conf.json
```

#### 規則欄位說明

| 欄位 | 類型 | 必填 | 說明 |
|------|------|:--:|------|
| `id` | string | ✅ | 唯一識別碼。企業規則建議使用 `ent-` 前綴避免衝突 |
| `name` | string | ✅ | 規則名稱，便於識別 |
| `description` | string | ❌ | 規則描述，說明該規則涵蓋的業務場景 |
| `filePatterns` | string[] | ✅ | 檔案比對的 glob 模式（支援 `**` `*` `{a,b}`） |
| `testPaths` | string[] | ✅ | 對應的測試檔案或測試目錄路徑 |
| `riskLevel` | "high" / "medium" / "low" | ✅ | 風險等級，影響推薦分和風險評估 |
| `appliesTo` | object | ❌ | 規則適用範圍篩選（見下方說明） |

#### `appliesTo` 篩選邏輯

透過 `appliesTo` 可讓規則僅對特定倉庫/模組生效，避免全域比對：

| 維度 | 欄位 | 範例 | 說明 |
|------|------|------|------|
| 倉庫別名 | `names` | `["order-service"]` | 僅對指定倉庫生效 |
| 業務模組 | `modules` | `["訂單系統"]` | 僅對指定模組生效 |
| 倉庫類型 | `repoTypes` | `["backend"]` | `backend` / `frontend` |
| Git 平台 | `platforms` | `["github"]` | `github` / `generic` / `local` |

**規則**：多個維度之間是 **AND** 關係（同時滿足），單個維度內是 **OR** 關係（命中任一即可）。

#### glob 模式速查

| 模式 | 說明 | 範例 |
|------|------|------|
| `**` | 比對任意層級目錄 | `src/**/*.java` — 所有 Java 檔案 |
| `*` | 比對單層目錄內任意字元 | `src/*.ts` — src 目錄下所有 TS 檔案 |
| `{a,b}` | 比對 a 或 b | `*.{ts,tsx}` — 所有 TS 和 TSX 檔案 |

#### 預設規則範本速覽

範本檔案 `examples/impact-rules.conf.example.json` 提供 3 類預設規則（已註解），依需求取消註解或修改：

| 類別 | 規則 ID | 適用場景 |
|------|---------|----------|
| **Java 後端** | `ent-controller` / `ent-service` / `ent-repository` / `ent-orm` / `ent-spring-config` | Controller / Service / Repository 層、ORM 對映、Spring 設定 |
| **JS 前端** | `ent-component` / `ent-state` / `ent-hooks` / `ent-api-service` / `ent-utils` | React 元件、狀態管理、Hooks、API 服務層、工具函式 |
| **通用** | `ent-config` / `ent-db-migration` / `ent-security` | 設定檔、資料庫遷移腳本、安全相關程式碼 |

#### 後續擴充指引

- **新增規則**：在 `enterprise/impact-rules.conf.json` 中新增條目，參考預設範本格式
- **規則驗證**：執行 `impact_analysis` 工具，觀察輸出中的 `matchType` 和 `confidence` 欄位
- **規則數量建議**：10-30 條為推薦範圍，超過 30 條建議按 `appliesTo` 拆分
- **定期審查**：每季檢查自動推斷命中率（`matchType: "inferred"`），補充遺漏規則

#### FAQ

<details>
<summary><b>規則沒生效怎麼辦？</b></summary>

1. 檢查 `appliesTo` 篩選條件是否符合當前倉庫/模組
2. 檢查 glob 模式是否符合實際檔案路徑（注意相對路徑基準）
3. 確認規則檔案路徑正確：通用 `impact-rules.conf.json`，企業 `enterprise/impact-rules.conf.json`
</details>

<details>
<summary><b>如何驗證規則是否正確？</b></summary>

構造一個測試 MR，執行 `impact_analysis`，觀察：
- `matchType: "exact"` 表示精確命中（信心度 95%）
- `matchType: "inferred"` 表示未命中任何規則，走了自動推斷（信心度 30%）
- 如果預期命中的規則沒生效，檢查 glob 模式和 `appliesTo` 條件
</details>

<details>
<summary><b>通用規則和企業規則衝突怎麼辦？</b></summary>

同 `id` 的企業規則會覆蓋通用規則。這是「企業客製優先」的設計，確保團隊級規則不被通用規則干擾。
</details>

<details>
<summary><b>規則數量有上限嗎？</b></summary>

無硬性上限，但建議控制在 30 條以內。規則過多會拖慢比對效能，也增加維護負擔。超過 30 條時考慮按 `appliesTo` 拆分到不同倉庫。
</details>

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
| Phase 5a | Analyzer Registry — MCP 編織層 | ✅ 已完成 |
| Phase 5c | SQL / Perf / Python / Go 分析器橫向擴展 | 💡 構思中 |
| Phase 6 | 資訊安全分層重構 — enterprise/ 隔離 | ✅ 已完成 |

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
