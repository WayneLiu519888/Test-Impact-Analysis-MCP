# ADR-0002: MCP 工具 Transport 分级暴露

**日期**：2026-06-14
**状态**：accepted
**决策者**：TIA 架构设计

---

## Context

TIA 的 6 个 MCP 工具在 stdio 和 HTTP 两种 Transport 模式下最初全部暴露。部分工具（如 `test_recommendation`、`risk_assessment`）依赖本地代码分析结果，HTTP 远程客户端无法直接使用。

另外部分工具（如 `repo_clone`、`impact_analysis`）在 HTTP 模式下需要降级为"指令返回"模式（返回 git 命令和分析指令由客户端本地执行），而 stdio 模式下直接执行。

需要一个机制让 MCP 工具的可见性和行为按 Transport 模式差异化。

---

## Decision

**为每个 MCP Tool Schema 添加 `visibility` 元数据字段，在 `ListToolsRequestSchema` 和 `CallToolRequestSchema` 两层做过滤和拦截。**

- `ListToolsRequestSchema`：根据当前 transport 返回过滤后的工具列表，`visibility` 字段在返回前剥离（不泄露到 MCP 协议）
- `CallToolRequestSchema`：二次拦截，防止 LLM 通过缓存等方式绕过第一步调用 stdio-only 工具

### 分级规则

| 工具 | visibility | stdio 行为 | HTTP 行为 |
|------|-----------|-----------|----------|
| TIA-init | all | 跳过（stdio 不需要） | API KEY 签发 + 命令注册 |
| repo_monitor | all | 直接 API 查询 | 不变（纯 API，无本地操作） |
| repo_clone | all | 直接执行 git clone | 返回 git 指令（已实现降级） |
| impact_analysis | all | 直接分析 diff | 降级返回分析指令（后续实现） |
| test_recommendation | stdio-only | 推荐分计算 | 拒绝 + 提示仅本地可用 |
| risk_assessment | stdio-only | 风险评分 | 拒绝 + 提示仅本地可用 |

---

## Alternatives Considered

### 方案 A：运行时动态判断（不控制 Schema 可见性）

LLM 能看到所有 6 个工具，调用时才报错。

- **Cons**：LLM 看到不可用工具会产生错误的推理路径，浪费 token
- **Why not**：隐藏不可用工具是更好的 UX

### 方案 B：两套 Schema 常量化

维护 `STDIO_TOOLS` 和 `HTTP_TOOLS` 两套列表。

- **Cons**：重复维护，修改工具名需要改多处
- **Why not**：单套 Schema + `visibility` 字段 + 过滤函数更 DRY

---

## Consequences

### Positive

- LLM 在 HTTP 模式下看不到 `test_recommendation` 和 `risk_assessment`，上下文更干净
- 新增工具只需加一行 `visibility` 即可纳入分级管理
- `getFilteredSchemas()` 是纯函数，易于测试（已有 5 个专项测试）
- `visibility` 字段不会泄露到 MCP 协议响应中（测试验证）

### Negative

- Schema 对象比纯 MCP 规范多一个私有字段（被过滤函数剥离）
- HTTP 模式下可用工具较少（4 vs 6），remote-only 用户功能受限

### Risks

- **LLM 绕过 ListTools 直接调用**：已通过 CallTool 层二次拦截缓解
