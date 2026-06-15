<p align="center">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-18%2B-green?logo=nodedotjs" alt="Node.js 18+">
  <img src="https://img.shields.io/badge/MCP-1.x-black?logo=anthropic" alt="MCP 1.x">
  <img src="https://img.shields.io/badge/MIT-license-blue" alt="MIT License">
  <br/>
  <img src="https://img.shields.io/badge/TypeScript-0%E3%82%A8%E3%83%A9%E3%83%BC-informational?logo=typescript" alt="TypeScript 0エラー">
  <img src="https://img.shields.io/badge/MCP%E3%83%84%E3%83%BC%E3%83%AB-5%E3%81%A4-critical" alt="5 MCPツール">
  <img src="https://img.shields.io/badge/%E3%83%86%E3%82%B9%E3%83%88-65%E5%80%8B%E6%88%90%E5%8A%9F-success" alt="65テスト成功">
  <img src="https://img.shields.io/badge/%E3%82%A8%E3%83%B3%E3%82%B8%E3%83%B3-1%E3%81%A4-orange" alt="1エンジン">
</p>

<div align="center">

**🌐 Language / 语言 / 語言**: [English](../../README.en.md) | [简体中文](../../README.zh-CN.md) | [繁體中文](../zh-TW/README.md) | **[日本語](README.md)**

</div>

<h1 align="center">Test Impact Analysis MCP Server（TIA）</h1>

<p align="center">
  <strong>ソフトウェアテスターのためのコード変更影響分析 MCP ツールセット</strong>
</p>

<p align="center">
  リポジトリ変更の継続監視、増分コード自動取得、外部解析エンジン統合。<br/>
  <strong>変更検知 → 影響分析 → テスト推薦 → リスク評価</strong>。
</p>

<hr/>

<details open>
<summary><strong>📋 クイックナビゲーション</strong></summary>

| したいこと | 参照 |
|:---|:---|
| すぐに始める | [🚀 クイックスタート](#-クイックスタート) |
| ツール一覧 | [🛠️ 5 MCP ツール](#️-5-mcp-ツール) |
| エンジン統合 | [🔬 エンジン統合](#-エンジン統合) |

---

## 📦 内容

| カテゴリ | 内容 | 数 |
|------|------|:--:|
| 🛠️ **MCP ツール** | repo_monitor / repo_clone / impact_analysis / test_recommendation / risk_assessment | 5 |
| 🔬 **分析エンジン** | codebase-memory-mcp（158 言語、静的解析） | 1 |
| 🔒 **セキュリティ** | 公開ソース(GitHub) ↔ 企業設定(.gitignore) | 2 層 |

---

## 🚀 クイックスタート

```bash
git clone git@github.com:WayneLiu519888/Test-Impact-Analysis-MCP.git
cd Test-Impact-Analysis-MCP
npm install
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json
```

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

```bash
/repo_status
impact_analysis(name="backend")
risk_assessment(name="backend")
```

---

## 🛠️ 5 MCP ツール

| ツール | 説明 |
|:---|:---|
| `repo_monitor` | 水位監視（status/check/reset） |
| `repo_clone` | コードクローン（全量/増分） |
| `impact_analysis` | 変更影響分析 + コールチェーン |
| `test_recommendation` | テスト優先順位付け |
| `risk_assessment` | リスクスコア (0-100) |

---

## 🔬 エンジン統合

**codebase-memory-mcp**（~36MB 単一バイナリ、158 言語）：

```powershell
mkdir D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
curl -o "$env:TEMP\cbm.zip" "https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-windows-amd64.zip"
Expand-Archive "$env:TEMP\cbm.zip" D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
# engines.conf.json → "enabled": true
```

> ✅ 100% ローカル | 🔌 エンジン不可時は glob に自動フォールバック

---

## 📄 ライセンス

MIT
