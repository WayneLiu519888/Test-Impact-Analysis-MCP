---
description: "【快捷命令】检查仓库新提交"
arguments:
  - name: target
    description: "可选: name=仓库别名 或 module=模块名，不传检查全部"
    required: false
---

# /repo_check — 快捷检查新提交

等价于 `/repo_monitor check [name=xxx|module=xxx]`

**立即调用** `mcp__test-impact-analysis__repo_monitor`，参数：
- `action`: `"check"`
- 如果用户提供了 `name=xxx`，加上 `name: "xxx"`
- 如果用户提供了 `module=xxx`，加上 `module: "xxx"`
- 如果都没有，省略 name 和 module 以检查全部仓库

不要做任何额外确认，直接调用工具并展示结果。
