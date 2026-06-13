---
name: repo-clone
description: 代码克隆工具 — full / incremental。当用户需要将监控仓库的代码拉到本地时使用。mode 取 full/incremental，target 为 name=xxx 或 module=xxx，可选 --force --since YYYY-MM-DD --mr ID。
---

# repo-clone — 代码克隆到本地

你是 Codex 的 repo-clone 技能执行者。调用 MCP 工具 `test-impact-analysis` 完成操作。

## 参数解析

从用户的 prompt 中提取：
- **mode**（必需）：`full` | `incremental`
- **target**（必需）：`name=仓库别名` 或 `module=模块名`
- **force**（可选）：`--force` → `true`
- **sinceDate**（可选，仅 incremental）：ISO 日期
- **sinceMrId**（可选，仅 incremental）：基线 MR ID

## 执行

**立即调用** `mcp__test-impact-analysis__repo_clone`，将解析出的参数传入，不要做额外确认。将结果原样展示给用户。
