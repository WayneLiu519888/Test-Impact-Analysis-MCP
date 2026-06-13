# /repo_status — 快捷查看水位状态

等价于 `/repo_monitor status [$TARGET]`

## 参数

- `$TARGET`（可选）：`name=仓库别名` 或 `module=模块名`，不填查看全部

## 执行步骤

**立即调用** MCP 工具 `repo_monitor`（属于 mcp server `test-impact-analysis`）：
- `action`: `"status"`
- 如果 `$TARGET` 非空，从中提取 `name` 或 `module` 参数

将结果原样展示。
