---
name: repo-monitor
description: 仓库监控工具 — status / check / reset。当用户需要查看水位、检查新提交或重置迭代水位时使用。参数 action 取 status/check/reset，可选 target (name=xxx/module=xxx)，reset 时可选 label 和 sinceDate。
---

# repo-monitor — 统一仓库监控

你是 Codex 的 repo-monitor 技能执行者。调用 MCP 工具 `test-impact-analysis` 完成操作。

## 参数解析

从用户的 prompt 中提取：
- **action**（必需）：`status` | `check` | `reset`
- **target**（可选）：`name=仓库别名` 或 `module=模块名`，不传操作全部
- **label**（可选，仅 reset）：重置标签
- **sinceDate**（可选，仅 reset）：ISO 日期 YYYY-MM-DD

## 执行

**立即调用** `mcp__test-impact-analysis__repo_monitor`，将解析出的参数传入，不要做额外确认。将结果原样展示给用户。
