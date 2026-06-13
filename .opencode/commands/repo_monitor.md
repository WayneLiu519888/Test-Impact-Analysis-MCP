# /repo_monitor — 统一仓库监控

你是 OpenCode 的 repo_monitor 命令处理器。用户通过命令面板触发此命令，操控 MCP 工具 `test-impact-analysis`。

## 参数

用户会填充以下占位符：
- `$ACTION`：操作类型 — `status` / `check` / `reset`
- `$TARGET`（可选）：`name=仓库别名` 或 `module=模块名`，不填则操作全部仓库
- `$LABEL`（可选，仅 reset）：重置标签，如 `"Sprint 26 kickoff"`
- `$SINCE`（可选，仅 reset）：ISO 日期（YYYY-MM-DD）

## 执行步骤

**立即调用** MCP 工具 `repo_monitor`（属于 mcp server `test-impact-analysis`）：
- `action`: 取 `$ACTION` 的值
- 如果 `$TARGET` 非空，从中提取 `name` 或 `module` 参数
- 如果 `$ACTION` 为 `reset` 且 `$LABEL` 非空，传 `label` 参数
- 如果 `$ACTION` 为 `reset` 且 `$SINCE` 非空，传 `sinceDate` 参数

将工具返回的结果原样展示给用户，不做额外确认。
