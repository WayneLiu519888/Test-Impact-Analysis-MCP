# Test Impact Analysis MCP Server（TIA）

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/-MCP-black?logo=anthropic&logoColor=white)
![Express](https://img.shields.io/badge/-Express-000000?logo=express&logoColor=white)

> **ソフトウェアテスター向け MCP ツールセット** | **6 つのコアツール** | **デュアルトランスポート** | **3 プラットフォーム対応** | **AI フレームワーク横断**

---

<div align="center">

**🌐 語言 / Language / 語言**

[**English**](../README.en.md) | [简体中文](../README.zh-CN.md) | [繁體中文](zh-TW/README.md) | [日本語](ja-JP/README.md)

</div>

---

**ソフトウェアテスター向けのインテリジェント MCP（Model Context Protocol）ツールセット。テストライフサイクル全体「変更検知 → 影響分析 → テスト推奨 → リスク評価」をカバーします。**

stdio / HTTP デュアルモードトランスポートを通じて、Claude Code、OpenCode、Codex などの AI コーディングフレームワークにテスト分析機能を公開します。リポジトリの変更を継続的に監視し、増分コードを自動取得。QA チームにコード変更ベースのテスト影響分析を提供します。

---

## 🎯 アーキテクチャ概要

```
┌──────────────────────────────────────────────────────┐
│ Claude Code / OpenCode / Codex (Host)                │
│  ├─ CronCreate → 定期監視 repo_monitor(action='check')│
│  ├─ /repo_xxx スラッシュコマンド → クイック操作      │
│  └─ MCP Client (stdio / http transport)              │
└─────────┬──────────────┬──────────────────────────────┘
          │ stdio (ローカル)│ http (リモート, 認証付き)
┌─────────▼────────┐ ┌──▼───────────────────────────────┐
│ 直接プロセス通信  │ │ Express App (port 3100)          │
│ (ゼロ設定)        │ │  ├─ レイヤー 0: IP ホワイトリスト│
│ 直接 git clone    │ │  ├─ レイヤー 1: API KEY 認証    │
│                   │ │  │   (TIA-init は免除)          │
│                   │ │  ├─ /mcp → Streamable HTTP      │
│                   │ │  └─ /health                     │
└───────────────────┘ └──────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ TIA MCP Server (本プロジェクト)                       │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │ モジュール 1: Git Monitor (✅ 完了)          │     │
│  │  ├─ 3 ツール — TIA-init / repo_monitor / repo_clone │
│  │  ├─ 3 プラットフォームアダプター (GitHub / Local / Generic) │
│  │  └─ 設定/状態分離 + seenShas 重複排除          │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ モジュール 2: Impact Analysis (🔜 計画中)    │     │
│  │  └─ コード変更 → 影響モジュール/テストケース │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ モジュール 3: Test Recommendation (💡 計画中)│     │
│  │  └─ 変更ベースのインテリジェントテスト推奨  │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ モジュール 4: Risk Assessment (💡 計画中)    │     │
│  │  └─ 変更リスクの定量化とレポート             │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 🚀 クイックスタート

### ステップ 1: MCP 接続の設定

**ローカルモード（stdio）** — ゼロ設定、即時利用:

```json
// .claude/settings.local.json
{
  "enabledMcpjsonServers": ["test-impact-analysis"]
}
```

**リモートモード（HTTP）** — ネットワーク越し呼び出し:

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

### ステップ 2: クライアント初期化

初回接続時に `TIA-init` ツールを呼び出して、API KEY の発行とコマンドファイルの登録を自動実行:

```bash
TIA-init
# またはエージェントタイプを指定
TIA-init(agentType="ClaudeCode")
```

### ステップ 3: 監視リポジトリの設定

`monitors.conf.json` を編集して監視対象リポジトリを追加:

```jsonc
{
  "repositories": [
    {
      "name": "my-backend",
      "url": "git@github.com:myteam/backend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "backend",
      "module": "ユーザーセンター"
    }
  ]
}
```

### ステップ 4: 使い始める

```bash
# 全リポジトリの水位を表示
/repo_status

# 新規コミットをチェック
/repo_check

# モジュール別にチェック
/repo_check module=ユーザーセンター

# コードをローカルにクローンして分析
/repo_clone full module=ユーザーセンター
```

✨ **完了！** コード変更の自動検知 + 増分コード取得が使えるようになりました。

---

## 🛠️ コアツール

### 設計原則: ツールの抑制

> **MCP ツールが多い → コンテキスト増大 → LLM 推論能力低下。** 本プロジェクトは 7 ツールを 3 つに統合、57% 削減。

| 原則 | 実践 |
|------|------|
| 設定ファイルで済むこと | **ツールを作らない**。JSON を直接編集 |
| 副作用のない参照系 | 既存ツールの `action` パラメータに統合 |
| 薄い単機能ラッパー | 意味的に近いツールへの統合を検討 |

### ツール 1: `repo_monitor` — 統合リポジトリ監視

`action` パラメータで 3 つの操作を切り替え:

#### `action=status` — 水位状態の表示

```bash
repo_monitor(action="status")                     # 全リポジトリ
repo_monitor(action="status", name="gh-backend")  # 単一リポジトリ
repo_monitor(action="status", module="ユーザーセンター") # モジュール別
```

#### `action=check` — 新規コミットのチェック

リモート HEAD とローカル水位を比較し、新規コミットサマリーを返します。**初回実行時に水位を自動初期化。**

```bash
repo_monitor(action="check")                      # 全リポジトリ
repo_monitor(action="check", name="gh-backend")   # 単一リポジトリ
repo_monitor(action="check", module="ユーザーセンター") # モジュール別
```

CronCreate による定期監視:

```bash
# 15 分ごとに全リポジトリをチェック
/cron "*/15 * * * *" "repo_monitor(action='check')"

# 2 時間ごとに特定モジュールをチェック
/cron "7 */2 * * *" "repo_monitor(action='check', module='ユーザーセンター')"
```

#### `action=reset` — 水位のリセット（スプリント切り替え）

```bash
# 通常リセット — 現在のリモート HEAD にリセット
repo_monitor(action="reset", name="gh-backend", label="手動リセット")

# 日付ベース — スプリント開始後の最初の MR base commit を自動特定
repo_monitor(action="reset", module="ユーザーセンター", label="Sprint 26 開始", sinceDate="2026-06-13")
```

### ツール 2: `repo_clone` — コードのローカルクローン

`repoType` に基づいて保存パスを自動選択:

```
{baseDir}/Repository/
├── Frontend repository/   ← repoType="frontend"
│   └── {repo-name}/
│       ├── {branch}/      ← mode=full 全量
│       └── {mr-id}/       ← mode=incremental
└── Backend repository/    ← repoType="backend"
    └── {repo-name}/
```

#### mode=full — 全量クローン

```bash
repo_clone(mode="full", name="gh-backend")               # 単一リポジトリ初期化
repo_clone(mode="full", module="ユーザーセンター")        # モジュール別一括初期化
repo_clone(mode="full", name="gh-backend", force=true)   # 強制上書き
```

#### mode=incremental — 増分 MR クローン

```bash
# 日付範囲で取得
repo_clone(mode="incremental", module="ユーザーセンター", sinceDate="2026-06-01")

# ベースライン MR から取得
repo_clone(mode="incremental", name="gh-backend", sinceMrId="1234")
```

### ツール 3: `TIA-init` — クライアント初期化ブートストラップ

初回接続時に呼び出して以下を自動実行:
- 🔑 API KEY 発行（SHA-256 ハッシュ保存）
- 📁 コマンドファイル登録（Claude Code / OpenCode / Codex を自動検出）
- 🔗 MCP 設定テンプレートを返却

---

## 🌐 クロスプラットフォーム対応

同一の MCP ツールセットを 3 つの AI コーディングフレームワークで共有。

| 項目 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **コマンドディレクトリ** | `.claude/commands/` | `.opencode/commands/` | `.agents/skills/` |
| **ファイル形式** | `.md` (frontmatter + 命令) | `.md` ($NAME プレースホルダー) | `SKILL.md` (YAML frontmatter) |
| **呼び出し方法** | `/コマンド名` | `Ctrl+K` コマンドパレット | `$スキル名` |
| **MCP 設定** | `.claude/settings.local.json` | `.opencode.json` → `mcpServers` | `.codex/config.toml` |

---

## 🔌 デュアルトランスポート

| モード | 環境変数 | トランスポート | repo_clone の動作 | ユースケース |
|------|---------|-----------|----------------|---------|
| stdio | デフォルト | `StdioServerTransport` | git clone を直接実行 | ローカル開発 / 単一マシン |
| http | `MCP_TRANSPORT=http` | `StreamableHTTPServerTransport` | 命令を返し、クライアントが実行 | リモート呼び出し / マルチクライアント |

### HTTP モード起動

```bash
MCP_TRANSPORT=http npx tsx src/index.ts
MCP_TRANSPORT=http MCP_PORT=4200 npx tsx src/index.ts  # カスタムポート
```

### セキュリティ（2 層防御）

```
レイヤー 0 (Express ミドルウェア): 全 /mcp リクエスト → IP ホワイトリスト → 通過/403
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                                       ▼
         TIA-init ツール                      その他全ツール
         (API KEY 免除)                      (API KEY 必須)
              │                                       │
              ▼                                       ▼
      API KEY 発行                            API KEY 検証
      コマンドファイル返却                     touchApiKey (lastUsed 更新)
```

---

## 🗺️ コマンドリファレンス

| コマンド | 使い方 | 説明 |
|------|------|------|
| `/repo_monitor` | `/repo_monitor <action> [name=\|module=] [flags]` | 統合監視エントリ |
| `/repo_clone` | `/repo_clone <mode> <name=\|module=> [flags]` | 統合クローンエントリ |
| `/repo_status` | `/repo_status [name=\|module=]` | 水位表示（ショートカット） |
| `/repo_check` | `/repo_check [name=\|module=]` | 新規コミットチェック（ショートカット） |
| `/repo_reset` | `/repo_reset <target> [--label] [--since]` | 水位リセット（ショートカット） |

---

## 🗺️ ロードマップ

| フェーズ | 内容 | ステータス |
|------|------|------|
| Phase 1 | Git Monitor — リポジトリ変更検知とコード取得 | ✅ 完了 |
| Phase 1.5 | デュアルトランスポート + IP ホワイトリスト | ✅ 完了 |
| Phase 1.6 | `repo_clone` リモートモード | ✅ 完了 |
| Phase 1.7 | TIA-init クライアントブートストラップ | ✅ 完了 |
| Phase 2 | Impact Analysis — コード変更 → 影響分析 | ✅ 完了 |
| Phase 3 | Test Recommendation — インテリジェントテスト推奨 | ✅ 完了 |
| Phase 4 | Risk Assessment — 変更リスク定量化 | ✅ 完了 |

---

## 🤝 コントリビューション

**コントリビューション歓迎！** 本プロジェクトはソフトウェアテスト向けです:

- 新しい Git プラットフォームアダプター
- より良い設定ファイルテンプレート
- 改善されたテスト分析アルゴリズム
- さらなる AI コーディングフレームワークのコマンド対応

Issue または PR をぜひお寄せください。

---

## 📄 技術スタック

- TypeScript / ESM（`"type": "module"`）
- `@modelcontextprotocol/sdk` — MCP Server SDK
- Express.js（HTTP モード）
- `tsx` — ランタイム（ゼロビルドステップ）
- Node.js >= 18

```bash
npm start              # MCP サーバー起動
npm run dev            # 開発ホットリロード
npx tsc --noEmit       # 型チェック（tsconfig strict: true）
```

---

## 📄 ライセンス

MIT — 自由に使用し、必要に応じて改変し、可能であれば貢献をお返しください。

---

**このプロジェクトが役立つと思ったら、Star ⭐ をお願いします。テストワークフローに変更検知の力を。**
