# /repo_reset — 快捷重置水位

等价于 `/repo_monitor reset <$TARGET> [--label "..."] [--since YYYY-MM-DD]`

## 参数

- `$TARGET`（必需）：`name=仓库别名` 或 `module=模块名`
- `$LABEL`（可选）：重置标签，如 `"Sprint 26 kickoff"`
- `$SINCE`（可选）：ISO 日期（YYYY-MM-DD），用于自动定位迭代首个 MR

## 执行步骤

**立即调用** MCP 工具 `repo_monitor`（属于 mcp server `test-impact-analysis`）：
- `action`: `"reset"`
- 从 `$TARGET` 中提取 `name` 或 `module`
- 如果 `$LABEL` 非空，传 `label`
- 如果 `$SINCE` 非空，传 `sinceDate`

将结果原样展示。
