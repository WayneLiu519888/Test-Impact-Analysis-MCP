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
---

## 🏗️ セットアップとセキュリティ

> ⚠️ **初回使用時必読** — clone 後 3 ステップで安全に使用開始。企業の機密設定は一切漏洩しません。

### 1. セットアップ（3 ステップ）

```bash
# ステップ 1：リポジトリをクローン
git clone git@github.com:xxx/TIA.git && cd TIA

# ステップ 2：依存関係をインストール（git hooks が自動設定されます）
npm install

# ステップ 3：監視対象リポジトリを設定
cp examples/monitors.conf.example.json enterprise/monitors.conf.json
vim enterprise/monitors.conf.json   # 監視するリポジトリ情報を記入
```

### 2. セキュリティ境界（3 層防御）

TIA は**公開ソース層**と**企業設定層**を厳密に分離し、企業内部情報が GitHub に流出するのを防ぎます：

```
┌──────────────────────────────────────────────┐
│  GitHub リポジトリ（公開層 — 安全にコミット可） │
│  src/  docs/  examples/  CLAUDE.md  README   │
├──────────────────────────────────────────────┤
│  enterprise/  ← 🔒 企業設定層（コミット不可）   │
│  monitors.conf.json  server.conf.json など    │
│  ⚠️ このディレクトリ全体が .gitignore で除外   │
└──────────────────────────────────────────────┘
```

| 防御層 | トリガー | メカニズム |
|--------|----------|------------|
| **L1** | ファイル保存時 | `.gitignore` が `enterprise/` とルートの機密ファイルを除外 |
| **L2** | `git commit` | `.githooks/pre-commit` の 5 ルールでリアルタイム遮断 |
| **L3** | `git push` / PR | `.github/workflows/security-check.yml` CI 自動スキャン |

### 3. デュアル環境ワークフロー

```
【自宅 → GitHub】            【社内 → 内部分析】
git push → GitHub          git clone TIA（読み取り専用）
ソース層はクリーン ✅         enterprise/ に社内設定を格納
                           コード取得 → 分析 → プッシュなし ✅
```

### 4. 動作確認

```bash
npm run security-check   # ソース層が ✅ クリーンと表示されること
npm test                 # 83 テストが全て通過すること
```

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
│  │ モジュール 2: Impact Analysis (✅ 完了)    │     │
│  │  └─ コード変更 → 影響モジュール/テストケース │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ モジュール 3: Test Recommendation (✅ 完了)│     │
│  │  └─ 変更ベースのインテリジェントテスト推奨  │     │
│  └─────────────────────────────────────────────┘     │
│  ┌─────────────────────────────────────────────┐     │
│  │ モジュール 4: Risk Assessment (✅ 完了)    │     │
│  │  └─ 変更リスクの定量化とレポート             │     │
│  └─────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────┘
```

---

## 📦 プロジェクト構造

```
Test-Impact-Analysis-mcp/
│
├── 📦 公開層（GitHub にコミット）
│   ├── src/                        # コアソースコード
│   │   ├── index.ts                # MCP Server エントリ + デュアルトランスポート
│   │   ├── state.ts                # 設定/状態の読み書き、水位管理
│   │   ├── paths.ts                # パス解決 + resolveConfigPath
│   │   ├── security.ts             # IP ホワイトリスト + API KEY セキュリティ
│   │   ├── platforms/              # Git プラットフォームアダプター層
│   │   ├── tools/                  # MCP ツールモジュール（6 ツール）
│   │   ├── impact-analysis/        # 影響分析モジュール（Phase 2-4）
│   │   └── tests/                  # ユニットテスト（83 件）
│   ├── docs/                       # 多言語ドキュメント
│   ├── examples/                   # 設定テンプレート（.example.json）
│   ├── scripts/                    # セキュリティ監査スクリプト
│   ├── .githooks/                  # Git セキュリティフック（pre-commit）
│   ├── .github/workflows/          # CI セキュリティスキャン
│   ├── .claude/commands/           # Claude Code スラッシュコマンド
│   ├── .opencode/commands/         # OpenCode コマンド
│   ├── .codex/skills/             # Codex スキル
│   ├── README.md                   # プロジェクトエントリ
│   └── impact-rules.conf.json      # 影響分析ルール（サンプル）
│
├── 🔒 企業設定層（.gitignore で除外、コミット不可）
│   └── enterprise/                 # 実際の設定はここに配置
│       ├── monitors.conf.json      # リポジトリ監視設定
│       ├── server.conf.json        # HTTP セキュリティ設定
│       └── .mcp.json               # MCP 接続設定
│
└── 🚫 ランタイム生成物（.gitignore で除外）
    └── monitors.json               # プログラムが管理する水位状態
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
      "url": "git@github.com:<YOUR-ORG>/example-backend.git",
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

> **MCP ツールが多い → コンテキスト増大 → LLM 推論能力低下。** 本プロジェクトは 7 ツールを 3 つに統合、57% 削減。Phase 2-4 で 3 つの分析ツールを追加（合計 6 つ）、それぞれ独立したデータソースと副作用境界を持つ。

| 原則 | 実践 |
|------|------|
| 設定ファイルで済むこと | **ツールを作らない**。JSON を直接編集 |
| 異なるデータソース/副作用 | 独立したツール（impact_analysis / test_recommendation / risk_assessment） |
| 意味的に統合可能 | 既存ツールの `action` パラメータに統合 |

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

### ツール 4: `impact_analysis` — コード変更影響分析

`impact-rules.conf.json` に設定されたファイル→テストマッピングルールに基づき、変更ファイルに対応するテストモジュールを自動マッチング。

```bash
impact_analysis(name="gh-backend")              # 水位から HEAD まで分析
impact_analysis(name="gh-backend", from="a", to="b")  # SHA 範囲指定
impact_analysis(module="ユーザーセンター")        # モジュール別一括分析
```

**戦略**: glob マッチング + 4 段階の信頼度（完全一致 95% / ディレクトリ 70% / ワイルドカード 45% / 推論 30%）

### ツール 5: `test_recommendation` — スマートテスト推奨

影響分析結果に基づいて推奨スコアを計算し、優先度順にソート、最小限のテストスイートを生成。

```bash
test_recommendation(name="gh-backend")
test_recommendation(module="ユーザーセンター")
```

**スコア** = リスク重み (high=100 / medium=50 / low=20) × 信頼度 (0-100)  
**グループ**: 強く推奨 (≥7000) | 推奨 (≥2000) | 任意

### ツール 6: `risk_assessment` — 変更リスク評価

コード変更リスクをファイル数、モジュールリスク分布、信頼度の 3 次元で定量化。

```bash
risk_assessment(name="gh-backend")
risk_assessment(module="ユーザーセンター")
```

**スコア**: ファイル (0-60) + モジュール (0-40) + 信頼度ペナルティ (0-20) = 0-100  
**レベル**: 🟢 低 (≤30) | 🟡 中 (31-60) | 🟠 高 (61-85) | 🔴 重大 (86-100)

---

## 🔧 JACG セットアップガイド 🔜 Phase 5b 計画中

> **JACG**（Java All Call Graph）は TIA Phase 5b の中核強化機能です——方式 D（サブプロセス jar 呼び出し）で統合し、Java プロジェクトに**バイトコードレベルの呼び出しチェーン分析**を提供します。JACG はオプションの依存関係です：JDK が利用可能な場合は分析精度を向上させ、JDK が利用できない場合は既存のファイルレベル glob マッチングに自動的にフォールバックします。

### JACG とは？

Java バイトコード（ASM）に基づく静的呼び出しチェーン分析エンジンです。メソッド A から全ての下流呼び出しを前方追跡でき、メソッド B から全ての上流エントリーポイント（Controller / MQ コンシューマ / スケジュールタスク）を逆方向追跡できます。TIA では、JACG が現在の「ファイルレベルのテストマッピング」を「メソッドレベルのエンドツーエンド呼び出しチェーン分析」にアップグレードします。

### 前提条件

| 依存関係 | バージョン | 説明 |
|------|------|------|
| JDK | >= 11（17+ 推奨） | ランタイム依存。利用不可時は TIA がファイルレベル glob マッチングに自動降格 |
| java-all-call-graph JAR | `lib/jacg/` に同梱 | ビルド済み JAR がプロジェクトに同梱、別途ダウンロード不要 |

### マルチプラットフォームインストール

#### Claude Code 環境

```bash
# 手順1：JDK の利用可否を確認
java -version  # JDK 11+ が出力されること

# 手順2（未インストールの場合）：JDK をインストール
# macOS
brew install openjdk@17

# Ubuntu/Debian
sudo apt install openjdk-17-jdk

# Windows
# https://adoptium.net/ から .msi インストーラーをダウンロード

# 手順3：JACG 統合状態を検証
# TIA で影響分析を実行：
impact_analysis(action="full", name="your-java-project")
# "📐 JACG 全量分析 (42s)" = 統合成功
# "⚠️ JDK 不可用，降級為文件匹配" = JDK 未設定
```

#### OpenCode 環境

```json
// .opencode.json — TIA が stdio で接続されていることを確認
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
JDK のインストール手順は Claude Code と同じです。

#### Codex 環境

```toml
# .codex/config.toml
[mcp_servers.test-impact-analysis]
command = "npx"
args = ["tsx", "src/index.ts"]
enabled = true
```
JDK のインストール手順は上記と同じです。

### 設定ファイル

`analyzers.conf.json`（復旧予定）における JACG 関連設定：

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 呼び出しチェーン分析",
      "enabled": true,              // false で無効化
      "fileExtensions": [".java"],
      "confidenceWeight": 90,
      "config": {
        "jarPath": "lib/jacg/java-all-call-graph.jar",
        "maxHeap": "2g",            // JVM 最大ヒープサイズ
        "timeout": 600              // タイムアウト秒数
      }
    }
  ]
}
```

### 動作モード

| モード | トリガー | 説明 |
|------|---------|------|
| 全量事前生成 | `impact_analysis(action="full", name="xxx")` | JACG を Java コード全体に実行し、呼び出しグラフを生成して `.tia/` ディレクトリに保存 |
| 増分リアルタイム分析 | `impact_analysis(name="xxx", mrId="1423")` | 変更ファイル → 全体グラフインデックス検索 → 逆方向 BFS 走査 → 影響 API を正確に特定 |
| フォールバック | 自動（JDK 利用不可時） | ファイルレベル glob マッチングに自動降格（現在のデフォルト動作） |

### 効果比較

| 分析方式 | 精度 | 例 |
|----------|:--:|------|
| ファイルレベル glob マッチング（現在） | ファイル→テストマッピング | `OrderService.java` 変更 → `OrderServiceTest` の実行を提案 |
| JACG 呼び出しチェーン分析（Phase 5b） | メソッド→API エンドポイント間チェーン | `OrderService.createOrder()` → `OrderController.createOrder()` → `POST /api/orders` |

### トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|------|
| `⚠️ JDK 不可用` | java が PATH にない | `which java` でパスを確認、または `JAVA_HOME` を設定 |
| `JACG タイムアウト` | プロジェクトが大きすぎる | `analyzers.conf.json` の `timeout` 値を増やす |
| `OutOfMemoryError` | ヒープメモリ不足 | `maxHeap` を増やす（例：`"4g"`） |
| `JAR ファイル不在` | `lib/jacg/*.jar` が存在しない | `scripts/download-jacg.sh` を実行してダウンロード/ビルド |

> ⚠️ **このセクションの全内容は Phase 5b のプレビューであり、まだ実装されていません。** 現在の TIA は影響分析にファイルレベル glob マッチングを使用しており、完全に機能します。

---

## 🌐 クロスプラットフォーム対応

同一の MCP ツールセットを 3 つの AI コーディングフレームワークで共有。

| 項目 | Claude Code | OpenCode | Codex (OpenAI) |
|------|------------|----------|----------------|
| **コマンドディレクトリ** | `.claude/commands/` | `.opencode/commands/` | `.codex/skills/` |
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
| `impact_analysis` | `impact_analysis [name=\|module=] [from=] [to=]` | コード変更影響分析 |
| `test_recommendation` | `test_recommendation [name=\|module=] [from=] [to=]` | スマートテスト推奨 |
| `risk_assessment` | `risk_assessment [name=\|module=] [from=] [to=]` | 変更リスク評価 |

---

## 📋 影響分析ルール設定

TIA は「ファイル変更 → テストケース」のマッピングを定義する 2 層ルールシステムを採用し、`impact_analysis`、`test_recommendation`、`risk_assessment` の 3 つの分析ツールを支えます。

#### 2 層ルールシステム

```
汎用ルール（第 1 層）              企業ルール（第 2 層）
impact-rules.conf.json           enterprise/impact-rules.conf.json
├─ プロジェクトルート               ├─ enterprise/ ディレクトリ（.gitignore で除外）
├─ GitHub にコミット可能             ├─ ローカルのみ、コミット不可
└─ すぐに使用可能                   └─ 企業カスタムルール

最終結果 = 汎用ルール ∪ 企業ルール（同 id は企業が上書き）
```

#### クイックスタート（3 ステップ）

```bash
# ステップ 1：汎用ルールを確認（サンプルあり）
cat impact-rules.conf.json

# ステップ 2：企業ルールを作成（テンプレートからコピー）
cp examples/impact-rules.conf.example.json enterprise/impact-rules.conf.json

# ステップ 3：企業ルールを編集し、該当するプリセットルールのコメントを解除
vim enterprise/impact-rules.conf.json
```

#### ルールフィールド説明

| フィールド | 型 | 必須 | 説明 |
|------|------|:--:|------|
| `id` | string | ✅ | 一意識別子。企業ルールには競合回避のため `ent-` プレフィックスを推奨 |
| `name` | string | ✅ | ルール名（識別用） |
| `description` | string | ❌ | ルールの説明（対象ビジネスシナリオ） |
| `filePatterns` | string[] | ✅ | ファイル一致の glob パターン（`**` `*` `{a,b}` 対応） |
| `testPaths` | string[] | ✅ | 対応するテストファイルまたはテストディレクトリパス |
| `riskLevel` | "high" / "medium" / "low" | ✅ | リスクレベル（推奨スコアとリスク評価に影響） |
| `appliesTo` | object | ❌ | ルール適用範囲フィルター（下記参照） |

#### `appliesTo` フィルターロジック

`appliesTo` を使用して、ルールを特定のリポジトリ/モジュールに限定できます：

| 次元 | フィールド | 例 | 説明 |
|------|------|------|------|
| リポジトリエイリアス | `names` | `["order-service"]` | 指定リポジトリにのみ適用 |
| ビジネスモジュール | `modules` | `["注文システム"]` | 指定モジュールにのみ適用 |
| リポジトリタイプ | `repoTypes` | `["backend"]` | `backend` / `frontend` |
| Git プラットフォーム | `platforms` | `["github"]` | `github` / `generic` / `local` |

**論理**：複数次元間は **AND**（すべて満たす必要あり）。単一次元内の値は **OR**（いずれか一致で可）。

#### glob パターン早見表

| パターン | 説明 | 例 |
|------|------|------|
| `**` | 任意の階層のディレクトリに一致 | `src/**/*.java` — すべての Java ファイル |
| `*` | 単一ディレクトリ階層内の任意の文字に一致 | `src/*.ts` — src 内の全 TS ファイル |
| `{a,b}` | a または b に一致 | `*.{ts,tsx}` — 全 TS および TSX ファイル |

#### プリセットルールテンプレート概要

テンプレートファイル `examples/impact-rules.conf.example.json` には 3 カテゴリのプリセットルール（コメントアウト済）が含まれています：

| カテゴリ | ルール ID | 適用シナリオ |
|------|---------|----------|
| **Java バックエンド** | `ent-controller` / `ent-service` / `ent-repository` / `ent-orm` / `ent-spring-config` | Controller / Service / Repository 層、ORM マッピング、Spring 設定 |
| **JS フロントエンド** | `ent-component` / `ent-state` / `ent-hooks` / `ent-api-service` / `ent-utils` | React コンポーネント、状態管理、Hooks、API サービス層、ユーティリティ |
| **汎用** | `ent-config` / `ent-db-migration` / `ent-security` | 設定ファイル、DB マイグレーションスクリプト、セキュリティ関連コード |

#### 拡張ガイド

- **新規ルール追加**：`enterprise/impact-rules.conf.json` にエントリを追加し、プリセットテンプレートを参照
- **ルール検証**：`impact_analysis` ツールを実行し、出力の `matchType` と `confidence` フィールドを確認
- **推奨ルール数**：10〜30 件。30 件を超える場合は `appliesTo` で分割を検討
- **定期レビュー**：四半期ごとに自動推論ヒット率（`matchType: "inferred"`）を確認し、不足ルールを追加

#### FAQ

<details>
<summary><b>ルールが効かない場合は？</b></summary>

1. `appliesTo` フィルターが現在のリポジトリ/モジュールに一致するか確認
2. glob パターンが実際のファイルパスに一致するか確認（相対パス基準に注意）
3. 正しいルールファイルパスか確認：汎用は `impact-rules.conf.json`、企業は `enterprise/impact-rules.conf.json`
</details>

<details>
<summary><b>ルールの正しさを検証するには？</b></summary>

テスト MR を作成し、`impact_analysis` を実行して以下を確認：
- `matchType: "exact"` → 完全一致（信頼度 95%）
- `matchType: "inferred"` → ルール未一致、自動推論を使用（信頼度 30%）
- 期待したルールが発火しない場合は、glob パターンと `appliesTo` 条件を確認
</details>

<details>
<summary><b>汎用ルールと企業ルールが競合したら？</b></summary>

同じ `id` の企業ルールが汎用ルールを上書きします。「企業カスタマイズ優先」の設計思想で、チームレベルのルールが汎用ルールに影響されないようになっています。
</details>

<details>
<summary><b>ルール数の上限は？</b></summary>

ハードリミットはありませんが、30 件以内を推奨します。ルールが多すぎるとマッチング性能が低下し、メンテナンス負荷も増加します。30 件を超える場合は `appliesTo` でリポジトリごとに分割してください。
</details>

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
| Phase 5a | Analyzer Registry — MCP オーケストレーション層 | ✅ 完了 |
| Phase 5b | JACG 呼び出しチェーン分析（デュアルモードエンジン + マージエンジン） | 🔜 計画中 |
| Phase 5c | SQL / Perf / Python / Go アナライザー拡張 | 💡 構想 |
| Phase 6 | 情報セキュリティ階層型リファクタリング — enterprise/ 分離 | ✅ 完了 |

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
