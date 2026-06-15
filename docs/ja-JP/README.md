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
  リポジトリ変更の継続監視、増分コード自動取得、外部静的解析エンジン統合。<br/>
  テストライフサイクル全体をカバー：<strong>変更検知 → 影響分析 → テスト推薦 → リスク評価</strong>。
</p>

<hr/>

<details open>
<summary><strong>📋 クイックナビゲーション</strong></summary>

| したいこと | 参照 |
|:---|:---|
| すぐに始める | [🚀 クイックスタート](#-クイックスタート) |
| 機能を理解する | [🎯 アーキテクチャ](#-アーキテクチャ) |
| ツール一覧 | [🛠️ 5 MCP ツール](#️-5-mcp-ツール) |
| エンジン統合 | [🔬 エンジン統合](#-エンジン統合) |
| Claude Code / OpenCode 設定 | [📥 インストール](#-インストール) |
| 設計ブループリント | [`.claude/plans/ultimate-blueprint-v3.md`](../../.claude/plans/ultimate-blueprint-v3.md) |
</details>

---

## 📦 内容

| カテゴリ | 内容 | 説明 |
|------|------|:--:|
| 🛠️ **MCP ツール** | repo_monitor / repo_clone / impact_analysis / test_recommendation / risk_assessment | 5 ツール |
| 🔬 **分析エンジン** | codebase-memory-mcp（158 言語静的解析、メソッドレベルコールグラフ） | 1 エンジン |
| 🔒 **セキュリティ** | 公開ソース(GitHub) ↔ 企業設定(.gitignore) | 2 層 |

---

## 🎯 アーキテクチャ

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → 定期 repo_monitor                   │
│  └─ MCP Client (stdio / http transport)               │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (ローカル) │ http (リモート)
┌─────────▼────────┐ ┌──▼──────────────────────────────┐
│ 直接 IPC         │ │ Express App (port 3100)          │
│ (ゼロ設定)       │ │  └─ IP ホワイトリスト → 通過/403 │
└──────────────────┘ └──────────────────────────────────┘
```

---

## 🚀 クイックスタート

### 1️⃣ クローンとインストール

```bash
git clone git@github.com:WayneLiu519888/Test-Impact-Analysis-MCP.git
cd Test-Impact-Analysis-MCP
npm install          # git hooks 自動インストール
```

### 2️⃣ リポジトリ設定

```bash
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # 監視するリポジトリを追加
```

### 3️⃣ MCP 接続設定

**Stdio モード**（ゼロ設定）：

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

**HTTP リモートモード**（IP ホワイトリスト要設定）：

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

### 4️⃣ 使用開始

```bash
/repo_status                              # 水位確認
/repo_check module="ユーザーセンター"      # 新規コミット確認
/repo_clone full module="ユーザーセンター" # コードクローン
impact_analysis(name="backend")           # 変更影響分析
test_recommendation(name="backend")       # テスト推薦
risk_assessment(name="backend")           # リスク評価
```

---

## 🛠️ 5 MCP ツール

| したいこと | ツール | 説明 |
|:---|:---|:---|
| 水位の確認/チェック/リセット | `repo_monitor` | `action=status\|check\|reset` |
| コードをローカルにクローン | `repo_clone` | 全量 / 増分 MR |
| 変更のテスト影響を分析 | `impact_analysis` | glob + エンジンコールチェーン + 自動推論 |
| テスト優先順位付け | `test_recommendation` | 推奨スコア = リスク重み × 信頼度 |
| 変更リスクの定量化 | `risk_assessment` | 3 次元スコア (0-100)、緩和策付き |

---

## 🔬 エンジン統合

TIA は外部静的解析エンジンと統合して**メソッドレベルのコールグラフ分析**を提供します。

### codebase-memory-mcp エンジン

単一静的バイナリ（~36MB）、tree-sitter ベース、158 言語対応、ゼロ依存。

```powershell
# インストール（PowerShell、3 ステップ）
mkdir D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
curl -o "$env:TEMP\cbm.zip" "https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-windows-amd64.zip"
Expand-Archive "$env:TEMP\cbm.zip" D:\0_WayneArchiveFiles\MCP-Servers\codebase-memory-mcp
.\codebase-memory-mcp.exe --version

# 有効化: engines.conf.json → "enabled": true
```

```
impact_analysis 呼び出し
  └─ .java/.ts/.py 変更 → codebase-memory-mcp CLI
      └─ インデックス → アーキテクチャ抽出 → コールエッジ → BFS
          └─ 影響分析レポートに統合
```

> ✅ 100% ローカル | 🔌 エンジン不可時は glob に自動フォールバック

---

## 🌐 クロスプラットフォーム

| 次元 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **コマンドディレクトリ** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
| **ファイル形式** | `.md` (frontmatter) | `.md` ($NAME) | `SKILL.md` (YAML) |
| **呼び出し方法** | `/コマンド名` | `Ctrl+K` パレット | `$スキル名` |

---

## 📥 インストール

### Claude Code (stdio)

```json
{ "enabledMcpjsonServers": ["test-impact-analysis"] }
```

### HTTP リモート

```bash
MCP_TRANSPORT=http MCP_PORT=3100 npx tsx src/index.ts
```

---

## 📂 リポジトリ構成

```
Test-Impact-Analysis-MCP/
├── src/                    # コアソースコード
├── examples/               # 設定テンプレート
├── enterprise/             # 🔒 企業設定（.gitignore）
└── docs/                   # 多言語ドキュメント
```

---

## 🔒 セキュリティ

```
公開層 → GitHub ✅        企業層 → enterprise/ ❌ コミット不可
src/ docs/ examples/      monitors.conf.json  server.conf.json
                          リポジトリURL / IP / モジュール名
```

HTTP セキュリティ：IP ホワイトリスト（完全一致 + CIDR サブネット）。

---

## ❓ FAQ

<details>
<summary><strong>必要な実行環境は？</strong></summary>

Node.js >= 18 | TypeScript ESM | Git CLI | tsx

```bash
npm start && npm test    # 起動 + 65 テスト
```
</details>

<details>
<summary><strong>なぜ IP ホワイトリストのみ？</strong></summary>

TIA は企業イントラネット内で動作。ネットワーク分離はインフラが保証済み。IP ホワイトリストはゼロメンテナンス。
</details>

<details>
<summary><strong>エンジンが利用不可の場合は？</strong></summary>

自動的に glob ルールマッチングにフォールバック。分析は中断されません。
</details>

<details>
<summary><strong>codebase-memory-mcp は安全？</strong></summary>

100% ローカル。セマンティックモデルはバイナリにコンパイル済み。起動時のバージョンチェックのみ。
</details>

---

## 📋 要件

| 依存 | バージョン |
|:---|:---|
| Node.js | >= 18 |
| TypeScript | 5.x |
| tsx | >= 4 |
| Git | 任意 |

## 🔧 コマンド

| コマンド | 説明 |
|:---|:---|
| `npm start` | 起動（stdio） |
| `npm run dev` | 開発ホットリロード |
| `npm test` | 65 テスト |
| `npx tsc --noEmit` | 型チェック |

---

## 🗺️ ロードマップ

| フェーズ | 内容 | 状態 |
|------|------|:--:|
| Phase 1 | Git Monitor | ✅ |
| Phase 2 | Impact Analysis | ✅ |
| Phase 3 | Test Recommendation | ✅ |
| Phase 4 | Risk Assessment | ✅ |
| Phase 5a | エンジンフレームワーク + codebase-memory-mcp | ✅ |
| Phase 5c | エンジン拡張 | 💡 |
| Phase 6 | セキュリティ分層 | ✅ |

---

## 📄 ライセンス

MIT
