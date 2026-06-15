<p align="center">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?logo=nodedotjs" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/MCP-1.x-black?logo=anthropic" alt="MCP 1.x">
  <img src="https://img.shields.io/badge/MIT-license-blue" alt="MIT License">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-零錯誤-informational?logo=typescript" alt="TypeScript 零錯誤">
  <img src="https://img.shields.io/badge/MCP工具-5個-critical" alt="5 個 MCP 工具">
  <img src="https://img.shields.io/badge/測試-65通過-success" alt="65 測試通過">
  <img src="https://img.shields.io/badge/引擎-1個-orange" alt="1 個引擎">
</p>

<div align="center">

**🌐 Language / 语言 / 語言**: [English](../../README.en.md) | [简体中文](../../README.zh-CN.md) | **[繁體中文](README.md)** | [日本語](../ja-JP/README.md)

</div>

<h1 align="center">Test Impact Analysis MCP Server（TIA）</h1>

<p align="center">
  <strong>為軟體測試人員打造的智能程式碼變更影響分析 MCP 工具集</strong>
</p>

<p align="center">
  持續監控程式碼倉庫變更，自動拉取增量程式碼，整合外部靜態分析引擎。<br/>
  覆蓋測試生命週期中的 <strong>變更感知 → 影響分析 → 用例推薦 → 風險評估</strong> 全鏈路。
</p>

<hr/>

<details open>
<summary><strong>📋 快速指引</strong></summary>

| 我想... | 看這裡 |
|:---|:---|
| 快速把專案跑起來 | [🚀 快速開始](#-快速開始) |
| 了解能做什麼 | [🎯 專案定位](#-專案定位) |
| 看有哪些工具可用 | [🛠️ 5 個 MCP 工具](#️-5-個-mcp-工具) |
| 接入外部分析引擎 | [🔬 分析引擎整合](#-分析引擎整合) |
| 設定 Claude Code / OpenCode | [📥 安裝方式](#-安裝方式) |
| 看完整設計藍圖 | [`.claude/plans/ultimate-blueprint-v3.md`](../../.claude/plans/ultimate-blueprint-v3.md) |
</details>

---

## 📦 包含內容

| 分類 | 內容 | 說明 |
|------|------|:--:|
| 🛠️ **MCP 工具** | repo_monitor / repo_clone / impact_analysis / test_recommendation / risk_assessment | 5 個工具 |
| 🔬 **分析引擎** | codebase-memory-mcp（158 語言靜態分析，方法級呼叫鏈） | 1 個引擎 |
| 🔒 **安全分層** | 原始碼層(提交GitHub) ↔ 企業設定層(.gitignore) | 雙層 |

---

## 🎯 專案定位

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → 定時觸發 repo_monitor               │
│  └─ MCP Client (stdio / http transport)               │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (本機)  │ http (遠端)
┌─────────▼────────┐ ┌──▼──────────────────────────────┐
│ 直接 IPC         │ │ Express App (port 3100)          │
│ (零設定)         │ │  └─ IP 白名單 → 通過/403         │
└──────────────────┘ └──────────────────────────────────┘
```

---

## 🚀 快速開始

### 1️⃣ 克隆並安裝

```bash
git clone git@github.com:WayneLiu519888/Test-Impact-Analysis-MCP.git
cd Test-Impact-Analysis-MCP
npm install          # 自動安裝 git hooks
```

### 2️⃣ 設定倉庫

```bash
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # 填入要監控的倉庫
```

### 3️⃣ 設定 MCP 連線

**Stdio 本機模式**（零設定）：

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

**HTTP 遠端模式**（需先設定 IP 白名單）：

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

### 4️⃣ 開始使用

```bash
/repo_status                              # 檢視倉庫水位
/repo_check module=用戶中心                # 檢查新提交
/repo_clone full module=用戶中心           # 克隆程式碼
impact_analysis(name="backend")           # 變更影響分析
test_recommendation(name="backend")       # 測試推薦
risk_assessment(name="backend")           # 風險評估
```

---

## 🛠️ 5 個 MCP 工具

| 我想... | 使用此工具 | 說明 |
|:---|:---|:---|
| 檢視/檢查/重置水位 | `repo_monitor` | 三合一：`action=status\|check\|reset` |
| 克隆程式碼到本機 | `repo_clone` | 全量 / 增量 MR |
| 分析變更對測試的影響 | `impact_analysis` | glob + 引擎呼叫鏈追蹤 + 自動推斷 |
| 推薦測試執行順序 | `test_recommendation` | 推薦分 = 風險權重 × 信賴度 |
| 評估變更風險 | `risk_assessment` | 三維評分 (0-100)，含緩解建議 |

---

## 🔬 分析引擎整合

TIA 支援接入外部程式碼靜態分析引擎，提供**方法級精確呼叫鏈分析**。

### codebase-memory-mcp 引擎

單一靜態二進位（~36MB），基於 tree-sitter，支援 158 種語言，零執行時依賴。

```powershell
# 安裝（PowerShell，3 步）
mkdir D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
curl -o "$env:TEMP\cbm.zip" "https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-windows-amd64.zip"
Expand-Archive "$env:TEMP\cbm.zip" D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
.\codebase-memory-mcp.exe --version

# 啟用引擎：編輯 engines.conf.json → "enabled": true
```

```
impact_analysis 呼叫
  └─ .java/.ts/.py 變更 → codebase-memory-mcp CLI
      └─ 索引 → 架構提取 → 呼叫邊 → 翻譯 → BFS
          └─ 合併到影響分析報告
```

> ✅ 100% 本機 | 🔌 不可用時靜默降級 glob

---

## 🌐 跨平台支援

同一套 MCP 工具，三個 AI 程式設計框架共享。

| 維度 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **命令目錄** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
| **檔案格式** | `.md` (frontmatter) | `.md` ($NAME) | `SKILL.md` (YAML) |
| **呼叫方式** | `/命令名` | `Ctrl+K` 命令面板 | `$技能名` |

---

## 📥 安裝方式

### Claude Code (stdio)

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

### HTTP 遠端

```bash
MCP_TRANSPORT=http MCP_PORT=3100 npx tsx src/index.ts
```

---

## 📂 倉庫目錄

```
Test-Impact-Analysis-MCP/
├── src/                    # 核心原始碼
├── examples/               # 設定範本
├── enterprise/             # 🔒 企業設定（.gitignore）
└── docs/                   # 多語言文件
```

---

## 🔒 資訊安全

```
開源層 → GitHub ✅       企業層 → enterprise/ ❌ 永不提交
src/ docs/ examples/     monitors.conf.json  server.conf.json
                         倉庫地址 / IP / 模組名
```

HTTP 安全：IP 白名單（精確 IP + CIDR 子網）。

---

## ❓ FAQ

<details>
<summary><strong>需要什麼執行環境？</strong></summary>

Node.js >= 18 | TypeScript ESM | Git CLI | tsx

```bash
npm start && npm test    # 啟動 + 65 測試
```
</details>

<details>
<summary><strong>為什麼只做 IP 白名單？</strong></summary>

TIA 執行在企業內網，網路隔離已由企業基礎設施保障。IP 白名單零維護。
</details>

<details>
<summary><strong>引擎不可用時怎麼辦？</strong></summary>

自動降級到 glob 規則匹配，不阻斷分析流程。
</details>

<details>
<summary><strong>codebase-memory-mcp 安全嗎？</strong></summary>

100% 本機，語義模型編譯進二進位，不傳程式碼。僅啟動時檢查版本號。
</details>

---

## 📋 環境要求

| 依賴 | 版本 |
|:---|:---|
| Node.js | >= 18 |
| TypeScript | 5.x |
| tsx | >= 4 |
| Git | 任意 |

## 🔧 可用命令

| 命令 | 說明 |
|:---|:---|
| `npm start` | 啟動（stdio） |
| `npm run dev` | 開發熱重載 |
| `npm test` | 65 測試 |
| `npx tsc --noEmit` | 類型檢查 |

---

## 🗺️ 路線圖

| 階段 | 內容 | 狀態 |
|------|------|:--:|
| Phase 1 | Git Monitor | ✅ |
| Phase 2 | Impact Analysis | ✅ |
| Phase 3 | Test Recommendation | ✅ |
| Phase 4 | Risk Assessment | ✅ |
| Phase 5a | 引擎框架 + codebase-memory-mcp | ✅ |
| Phase 5c | 更多引擎擴展 | 💡 |
| Phase 6 | 資訊安全分層 | ✅ |

---

## 📄 授權條款

MIT
