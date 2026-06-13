---
name: repo-check
description: 快捷检查仓库是否有新提交。等价于 repo-monitor action=check。可选参数 target (name=xxx 或 module=xxx)，不传检查全部。
---

# repo-check — 快捷检查新提交

**立即调用** `mcp__test-impact-analysis__repo_monitor`：
- `action`: `"check"`
- 如果用户提供了 name=xxx 或 module=xxx，提取传入

不要做额外确认，直接展示结果。
