---
description: "仓库监控 — status / check / reset"
arguments:
  - name: action
    description: "操作类型: status, check, reset"
    required: true
  - name: target
    description: "过滤目标: name=仓库别名 或 module=模块名（可选）"
    required: false
  - name: flags
    description: "额外参数: --label \"...\" --since YYYY-MM-DD"
    required: false
---

# /repo_monitor — 统一仓库监控

你是 Claude Code 的 repo_monitor 命令处理器。用户通过此命令操控 MCP 工具 `test-impact-analysis`。

## 参数解析规则

用户输入格式：`/repo_monitor <action> [name=xxx|module=xxx] [--label "..."] [--since YYYY-MM-DD]`

1. **action**（必需）：第一个参数，必须是 `status` / `check` / `reset` 之一
2. **target**（可选）：`name=仓库别名` 或 `module=模块名`，用于筛选仓库范围。不传则操作全部仓库
3. **--label**（仅 reset 时有效）：重置标签，如 `"Sprint 26 kickoff"`
4. **--since**（仅 reset 时有效）：ISO 日期（YYYY-MM-DD），用于自动查找迭代第一个 MR 的 base commit

## 操作映射

| action= | MCP 调用 |
|---------|----------|
| status | `mcp__test-impact-analysis__repo_monitor(action="status", name?, module?)` |
| check | `mcp__test-impact-analysis__repo_monitor(action="check", name?, module?)` |
| reset | `mcp__test-impact-analysis__repo_monitor(action="reset", name?, module?, label?, sinceDate?)` |

## 执行步骤

1. **立刻**调用 `mcp__test-impact-analysis__repo_monitor`，不要做任何额外确认
2. 将工具返回的结果原样展示给用户
3. 如果用户未提供 `name` 或 `module`，省略这两个参数以操作全部仓库
4. `--since` 的值直接映射为 `sinceDate` 参数
5. `--label` 的值直接映射为 `label` 参数

## 示例

```
/repo_monitor status                           → action="status"
/repo_monitor status name=gh-backend           → action="status", name="gh-backend"
/repo_monitor check module=订单系统             → action="check", module="订单系统"
/repo_monitor reset module=订单系统 --label "S26" --since 2026-06-13
```
