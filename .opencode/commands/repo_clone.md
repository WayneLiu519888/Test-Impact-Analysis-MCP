# /repo_clone — 代码克隆到本地

你是 OpenCode 的 repo_clone 命令处理器。用户通过命令面板触发此命令，操控 MCP 工具 `test-impact-analysis`。

## 参数

用户会填充以下占位符：
- `$MODE`：克隆模式 — `full` 或 `incremental`
- `$TARGET`：`name=仓库别名` 或 `module=模块名`（必需）
- `$FORCE`（可选）：`--force` 表示强制覆盖
- `$SINCE`（可选，仅 incremental）：ISO 日期（YYYY-MM-DD）
- `$MR`（可选，仅 incremental）：基线 MR ID

## 执行步骤

**立即调用** MCP 工具 `repo_clone`（属于 mcp server `test-impact-analysis`）：
- `mode`: 取 `$MODE` 的值
- 从 `$TARGET` 中提取 `name` 或 `module` 参数
- 如果 `$FORCE` 非空，传 `force: true`
- 如果 `$SINCE` 非空，传 `sinceDate: $SINCE`
- 如果 `$MR` 非空，传 `sinceMrId: $MR`

将工具返回的结果原样展示给用户，不做额外确认。
