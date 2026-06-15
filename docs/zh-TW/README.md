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
  <strong>變更感知 → 影響分析 → 用例推薦 → 風險評估</strong> 全鏈路。
</p>

<hr/>

<details open>
<summary><strong>📋 快速指引</strong></summary>

| 我想... | 看這裡 |
|:---|:---|
| 快速把專案跑起來 | [🚀 快速開始](#-快速開始) |
| 看有哪些工具可用 | [🛠️ 5 個 MCP 工具](#️-5-個-mcp-工具) |
| 接入外部分析引擎 | [🔬 分析引擎整合](#-分析引擎整合) |

---

## 📦 包含內容

| 分類 | 內容 | 說明 |
|------|------|:--:|
| 🛠️ **MCP 工具** | repo_monitor / repo_clone / impact_analysis / test_recommendation / risk_assessment | 5 個 |
| 🔬 **分析引擎** | codebase-memory-mcp（158 語言靜態分析） | 1 個 |
| 🔒 **安全分層** | 原始碼層(提交GitHub) ↔ 企業設定層(.gitignore) | 雙層 |

---

## 🚀 快速開始

### 1️⃣ 克隆並安裝

```bash
git clone git@github.com:WayneLiu519888/Test-Impact-Analysis-MCP.git
cd Test-Impact-Analysis-MCP
npm install
```

### 2️⃣ 設定

```bash
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json
```

### 3️⃣ MCP 連線

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

### 4️⃣ 開始

```bash
/repo_status
impact_analysis(name="backend")
risk_assessment(name="backend")
```

---

## 🛠️ 5 個 MCP 工具

| 工具 | 說明 |
|:---|:---|
| `repo_monitor` | 監控倉庫水位（status/check/reset） |
| `repo_clone` | 全量/增量克隆程式碼 |
| `impact_analysis` | 變更影響分析 + 引擎呼叫鏈 |
| `test_recommendation` | 測試推薦排序 |
| `risk_assessment` | 變更風險評分 (0-100) |

---

## 🔬 分析引擎整合

**codebase-memory-mcp**（~36MB 單一二進位，158 語言）：

```powershell
mkdir D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
curl -o "$env:TEMP\cbm.zip" "https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-windows-amd64.zip"
Expand-Archive "$env:TEMP\cbm.zip" D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
# 啟用：engines.conf.json → "enabled": true
```

> ✅ 100% 本機 | 🔌 失敗時自動降級 glob

---

## 📄 授權條款

MIT
