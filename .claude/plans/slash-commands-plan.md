# 计划：将 MCP 工具注册为 Claude Code 斜杠命令

## 目标

让用户通过 `/repo_monitor`、`/repo_clone` 直接操控 MCP 工具，无需自然语言中转。

## 技术原理

Claude Code 自定义命令 = `.claude/commands/` 目录下的 `.md` 文件。文件名即命令名，内容即给 Claude 的指令模板。当用户敲 `/命令名 参数` 时，CC 将该 `.md` 内容 + 用户参数一起发给模型。

## 命令设计

```
.claude/commands/
├── repo_monitor.md   ← /repo_monitor <action> [name|module] [...]
├── repo_clone.md     ← /repo_clone <mode> [name|module] [...]
├── repo_status.md    ← 快捷命令 /repo_status [name|module]
├── repo_check.md     ← 快捷命令 /repo_check [name|module]
└── repo_reset.md     ← 快捷命令 /repo_reset <name|module> [--sinceDate]
```

### 1. `/repo_monitor` — 统一监控入口

```
/repo_monitor status                          → mcp__repo_monitor(action="status")
/repo_monitor status name=xxx                 → mcp__repo_monitor(action="status", name="xxx")
/repo_monitor check                           → mcp__repo_monitor(action="check")
/repo_monitor check module=xxx                → mcp__repo_monitor(action="check", module="xxx")
/repo_monitor reset name=xxx --label "S26"    → mcp__repo_monitor(action="reset", name="xxx", label="S26")
/repo_monitor reset module=xxx --since 5/16   → mcp__repo_monitor(action="reset", module="xxx", sinceDate="2026-05-16")
```

### 2. `/repo_clone` — 统一克隆入口

```
/repo_clone full name=xxx                     → mcp__repo_clone(mode="full", name="xxx")
/repo_clone full module=xxx --force           → mcp__repo_clone(mode="full", module="xxx", force=true)
/repo_clone incremental module=xxx --since 6/1→ mcp__repo_clone(mode="incremental", module="xxx", sinceDate="2026-06-01")
/repo_clone incremental name=xxx --mr 1234    → mcp__repo_clone(mode="incremental", name="xxx", sinceMrId="1234")
```

### 3. 快捷命令

| 命令 | 等价于 |
|------|--------|
| `/repo_status [name\|module]` | `/repo_monitor status` |
| `/repo_check [name\|module]` | `/repo_monitor check` |
| `/repo_reset <target> [--label] [--since]` | `/repo_monitor reset` |

## 实现步骤

1. 创建 `.claude/commands/` 目录
2. 编写 5 个 `.md` 命令文件，每个包含：
   - frontmatter（description）
   - 参数解析规则
   - 对应的 MCP 工具调用指令
3. 更新 `CLAUDE.md` 添加命令速查表
4. 验证：用户敲 `/repo_status` 后模型正确调用 MCP 工具

## 涉及文件

- 新建：`.claude/commands/repo_monitor.md`
- 新建：`.claude/commands/repo_clone.md`
- 新建：`.claude/commands/repo_status.md`
- 新建：`.claude/commands/repo_check.md`
- 新建：`.claude/commands/repo_reset.md`
- 修改：`CLAUDE.md`（追加命令速查章节）
