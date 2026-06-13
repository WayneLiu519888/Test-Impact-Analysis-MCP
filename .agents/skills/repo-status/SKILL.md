---
name: repo-status
description: 快捷查看仓库监控水位状态。等价于 repo-monitor action=status。可选参数 target (name=xxx 或 module=xxx)，不传查看全部。
---

# repo-status — 快捷查看水位

**立即调用** `mcp__test-impact-analysis__repo_monitor`：
- `action`: `"status"`
- 如果用户提供了 name=xxx 或 module=xxx，提取传入

不要做额外确认，直接展示结果。
