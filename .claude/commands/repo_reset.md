---
description: "【快捷命令】重置仓库水位"
arguments:
  - name: target
    description: "必需: name=仓库别名 或 module=模块名"
    required: true
  - name: flags
    description: "--label \"标签\" --since YYYY-MM-DD"
    required: false
---

# /repo_reset — 快捷重置水位

等价于 `/repo_monitor reset <name=xxx|module=xxx> [--label "..."] [--since YYYY-MM-DD]`

**立即调用** `mcp__test-impact-analysis__repo_monitor`，参数：
- `action`: `"reset"`
- `name` 或 `module`：从用户输入中提取
- `label`：从 `--label "xxx"` 中提取（可选）
- `sinceDate`：从 `--since YYYY-MM-DD` 中提取（可选）

不要做任何额外确认，直接调用工具并展示结果。
