---
description: "代码克隆 — full / incremental"
arguments:
  - name: mode
    description: "克隆模式: full 或 incremental"
    required: true
  - name: target
    description: "过滤目标: name=仓库别名 或 module=模块名"
    required: true
  - name: flags
    description: "额外参数: --force --since YYYY-MM-DD --mr ID"
    required: false
---

# /repo_clone — 代码克隆到本地

你是 Claude Code 的 repo_clone 命令处理器。用户通过此命令操控 MCP 工具 `test-impact-analysis`。

## 参数解析规则

用户输入格式：`/repo_clone <mode> <name=xxx|module=xxx> [--force] [--since YYYY-MM-DD] [--mr ID]`

1. **mode**（必需）：第一个参数，必须是 `full` 或 `incremental`
2. **target**（必需）：`name=仓库别名` 或 `module=模块名`
3. **--force**（可选）：强制覆盖已存在的目录
4. **--since**（仅 incremental 时有效）：ISO 日期，拉取该日期后合入的所有 MR
5. **--mr**（仅 incremental 时有效）：基线 MR ID，拉取该 MR 后合入的所有 MR（不含自身）

## 操作映射

| mode= | MCP 调用 |
|-------|----------|
| full | `mcp__test-impact-analysis__repo_clone(mode="full", name?, module?, force?)` |
| incremental | `mcp__test-impact-analysis__repo_clone(mode="incremental", name?, module?, sinceDate?, sinceMrId?, force?)` |

## 执行步骤

1. **立刻**调用 `mcp__test-impact-analysis__repo_clone`，不要做任何额外确认
2. 将工具返回的结果原样展示给用户
3. `name=` 和 `module=` 二选一，至少提供一个
4. `--force` 存在时传 `force=true`
5. `--since` 的值直接映射为 `sinceDate`
6. `--mr` 的值直接映射为 `sinceMrId`

## 示例

```
/repo_clone full name=hermes-agent-evolution
/repo_clone full module=订单系统 --force
/repo_clone incremental module=订单系统 --since 2026-06-01
/repo_clone incremental name=gh-backend --mr 1234
```
