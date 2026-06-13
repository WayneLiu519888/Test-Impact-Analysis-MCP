---
name: repo-reset
description: 快捷重置仓库水位。等价于 repo-monitor action=reset。必需 target (name=xxx/module=xxx)，可选 --label "标签" --since YYYY-MM-DD。
---

# repo-reset — 快捷重置水位

**立即调用** `mcp__test-impact-analysis__repo_monitor`：
- `action`: `"reset"`
- 从用户输入中提取 `name` 或 `module`
- 如果用户提供了 --label "xxx"，传入 `label`
- 如果用户提供了 --since YYYY-MM-DD，传入 `sinceDate`

不要做额外确认，直接展示结果。
