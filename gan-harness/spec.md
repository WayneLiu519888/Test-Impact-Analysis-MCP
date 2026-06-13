# 产品规格：TIA 信息安全分层重构

> Generated from brief: "TIA 项目 v3 终极蓝图第十一章 — 信息安全分层架构实施"

## Vision

通过目录隔离 + .gitignore 加固 + 模板化策略，将 TIA 项目严格划分为"源码层"和"企业配置层"。源码层不含任何企业敏感信息，可安全推送至 GitHub；企业配置层（`enterprise/`）被 `.gitignore` 多层拦截，永不提交。无论开发者在家办公还是企业内网，同一份代码基均能安全使用。

## 项目上下文

- 项目路径：`D:\0_WayneArchiveFiles\MCP-Servers\Test-Impact-Analysis-mcp`
- 语言：TypeScript (ESM)，Node.js >= 18
- 包名：`test-impact-analysis-mcp`
- 注意：Phase 0（Git 历史清理）已跳过。当前 git 仓库中可能残留历史敏感文件（`monitors.conf.json`、`server.conf.json`、`monitors.json` 等），这些文件已通过后续 Phase 的 `.gitignore` 加固排除，不会出现在新提交中，但历史中的痕迹不在本次重构范围。

## Design Direction

- **Color palette**: N/A（基础设施重构，无 UI）
- **Typography**: N/A
- **Layout philosophy**: 分层隔离架构 — `enterprise/` 与 `src/` 物理分离，中间通过 `resolveConfigPath()` 桥接
- **Visual identity**: 安全相关的 banner 和提示使用 `[TIA-SEC]` 前缀，终端输出采用 ANSI 颜色码（红色=阻止，黄色=警告，绿色=通过）
- **Inspiration**: GitHub 官方 `.gitignore` 最佳实践、OWASP 敏感信息管理指南、12-Factor App 配置分离原则

---

## Features (prioritized)

### Must-Have (Sprint 1-2)

#### F1: 目录结构初始化
创建四个新目录并加固 `.gitignore`，为后续所有 Feature 提供基础设施。
- **验收标准**:
  - [ ] `enterprise/` 目录存在，内含 `.gitkeep` 文件
  - [ ] `examples/` 目录存在且包含 3 个 `.example` 模板文件（如已创建则等待 F2）
  - [ ] `scripts/` 目录存在
  - [ ] `.githooks/` 目录存在
  - [ ] `.gitignore` 包含双重保险规则：`enterprise/` 整体排除 + 根目录敏感文件逐个排除
  - [ ] 执行 `git status` 后，`enterprise/` 目录不出现在 untracked files 中
  - [ ] 在 `enterprise/` 下创建任意文件后执行 `git add .`，该文件不会被 staged

#### F2: 配置模板化
编写所有 `.example` 模板文件，使用通用占位符替换企业敏感信息。用户在任一环境克隆项目后，复制模板即可填入本地配置。
- **验收标准**:
  - [ ] `examples/monitors.conf.example.json` — 可被 `JSON.parse()` 成功解析
  - [ ] `examples/server.conf.example.json` — 可被 `JSON.parse()` 成功解析
  - [ ] `examples/.mcp.example.json` — 可被 `JSON.parse()` 成功解析
  - [ ] 所有模板中的 URL、主机名、路径使用 `<YOUR-*>` 占位符，不含任何 `codehub.huawei.com`、`WayneLiu`、`l30026134` 等真实信息
  - [ ] 每个模板包含 `_comment` 字段说明使用方式
  - [ ] `git grep "codehub.huawei.com\|WayneLiu\|l[0-9]{8}" -- ':!enterprise/' ':!scripts/'` 在模板文件中无命中

#### F3: resolveConfigPath() 多级 Fallback
在 `src/state.ts` 中新增核心函数 `resolveConfigPath()`，实现企业配置优先的查找链。所有现有配置读取路径改用此函数。
- **验收标准**:
  - [ ] `enterprise/{filename}` 存在时，返回 `enterprise/{filename}` 的绝对路径
  - [ ] `enterprise/{filename}` 不存在、根目录存在时，返回根目录路径并打印迁移警告（`console.warn`，含 `⚠️` 和弃用提示）
  - [ ] 两者都不存在、`examples/{filename}.example` 存在时，自动调用 `ensureEnterpriseDir()`，复制模板到 `enterprise/`，打印模板创建提示（`console.log`，含 `📋`），返回 `enterprise/{filename}` 路径
  - [ ] 三者都不存在时，抛出明确的错误信息（含文件名和搜索路径提示）
  - [ ] `monitors.conf.json` 和 `monitors.json` 的路径常量改用 `resolveConfigPath()`
  - [ ] `src/security.ts` 中 `SERVER_CONF_FILE` 常量改用 `resolveConfigPath("server.conf.json")`

#### F4: ensureEnterpriseDir() 启动保障
在 `src/paths.ts` 中加入 `ensureEnterpriseDir()`，并在 `src/index.ts` 启动时调用，确保企业配置目录在任何环境下都自动创建。
- **验收标准**:
  - [ ] `ensureEnterpriseDir()` 在 `enterprise/` 不存在时创建目录和 `.gitkeep`
  - [ ] `ensureEnterpriseDir()` 在 `enterprise/` 已存在时不做任何操作（幂等）
  - [ ] `src/index.ts` 在 `ensureConfigFile()` 之前调用 `ensureEnterpriseDir()`
  - [ ] `npm start`（stdio 模式）启动时，若 `enterprise/` 不存在，自动创建并打印日志
  - [ ] 验收方式：删除 `enterprise/` 后执行 `npm start`，exit（Ctrl+C），确认 `enterprise/.gitkeep` 已生成

#### F5: 文档脱敏
清理 TIA 项目所有文档中的企业敏感信息，替换为通用占位符。此 Feature 是"源码层可安全提交 GitHub"的关键一步。
- **验收标准**:
  - [ ] `CLAUDE.md` 中无 `codehub.huawei.com`、`myproject`、`l30026134`、`WayneLiu519888`
  - [ ] `README.zh-CN.md` 中无上述敏感信息
  - [ ] `README.en.md` 中无上述敏感信息
  - [ ] `docs/Test-Impact-Analysis-mcp用户指南.md` 中无上述敏感信息
  - [ ] `docs/zh-TW/README.md` 中无上述敏感信息
  - [ ] `docs/ja-JP/README.md` 中无上述敏感信息
  - [ ] `.claude/commands/repo_add.md` 中无上述敏感信息
  - [ ] `src/tests/state.test.ts` 中 `codehub.huawei.com:myproject` 替换为 `git.example.com:demo/project.git`
  - [ ] 自查脚本 `bash scripts/check-sensitive-data.sh` 返回 `✅ 自查通过，未发现敏感信息`
  - [ ] 所有替换后的文档中示例仍可正常解析（JSON 结构完整，URL 格式合法）

#### F6: Pre-commit Hook 防线
编写 `.githooks/pre-commit` 脚本，在每次 `git commit` 时执行 5 条安全检查规则。
- **验收标准**:
  - [ ] 规则 1：staged 文件中出现 `enterprise/` 路径 → 阻止提交，exit 1
  - [ ] 规则 2：staged 文件内容匹配 `l[0-9]{8}` 模式 → 阻止提交
  - [ ] 规则 3：staged 文件内容匹配 `codehub\.huawei\.com` → 阻止提交
  - [ ] 规则 4：staged 文件内容匹配 Windows 绝对路径 `[A-Za-z]:/(Users|Program|Workspace|Wayne)` → 阻止提交
  - [ ] 规则 5：staged 文件出现根目录 `monitors.conf.json`（非 enterprise/ 下） → 阻止提交
  - [ ] 所有规则通过时打印绿色 `✅ 检查通过`，exit 0
  - [ ] 任一规则触发时打印红色错误信息，exit 1
  - [ ] Hook 脚本可执行（Unix: `chmod +x`；Windows Git Bash: 可运行）
  - [ ] `npm install` 时通过 `prepare` 脚本自动配置 `git config core.hooksPath .githooks`

#### F7: 自查脚本完善
`scripts/check-sensitive-data.sh` 已部分创建。此 Feature 确保脚本与重构后的项目结构完全兼容，且支持 JSON 输出模式供 CI 消费。
- **验收标准**:
  - [ ] 脚本排除 `enterprise/`、`scripts/`、`node_modules/`、`.git/`、`Repository/`
  - [ ] 覆盖 4 类敏感模式：企业域名、个人账号、员工工号、Windows 绝对路径
  - [ ] `--json` 参数输出合法 JSON，`summary.status` 为 `"clean"` 或 `"issues_found"`
  - [ ] 无参数时输出人类可读的彩色终端报告
  - [ ] 在脱敏后的项目中执行返回 exit 0
  - [ ] 故意在源码层添加敏感信息后执行返回 exit 1

### Should-Have (Sprint 3-4)

#### F8: CI 安全扫描工作流
创建 GitHub Actions workflow，在每次 push 和 PR 时自动运行敏感信息扫描。
- **验收标准**:
  - [ ] `.github/workflows/security-check.yml` 存在且语法合法
  - [ ] workflow 触发条件：`push` + `pull_request`
  - [ ] 使用 `actions/checkout@v4`
  - [ ] 运行 `bash scripts/check-sensitive-data.sh --json`
  - [ ] 发现敏感信息时 CI 状态为失败（红色）
  - [ ] 手动在 PR 中引入敏感词 → CI 拦截

#### F9: TIA-init 模板路径迁移
将 `src/tools/tia-init.ts` 中命令文件模板的读取路径从根目录切换到 `examples/` 目录，确保 TIA-init 返回的配置模板不含任何企业敏感路径。
- **验收标准**:
  - [ ] TIA-init 返回的 MCP 配置模板中 `url` 字段不含真实 IP 或内部域名
  - [ ] 命令文件内容中的示例 URL 使用占位符
  - [ ] TIA-init 在 HTTP 模式下能正常签发 API KEY 并返回配置
  - [ ] 现有 TIA-init 测试（若存在）继续通过

### Nice-to-Have (Sprint 5+)

#### F10: 双环境配置切换辅助
提供简单的机制帮助开发者在"家庭配置"和"企业配置"之间快速切换，降低双环境维护的心智负担。
- **验收标准**:
  - [ ] `enterprise/` 下可维护 `monitors.conf.home.json` 和 `monitors.conf.company.json`
  - [ ] 提供 `scripts/switch-env.sh <home|company>` 切换脚本
  - [ ] 切换脚本自动将对应文件复制为 `enterprise/monitors.conf.json`

#### F11: 敏感信息审计报告生成
增强自查脚本，支持生成 Markdown 格式的审计报告，供安全审计使用。
- **验收标准**:
  - [ ] `--report` 参数输出 Markdown 表格格式的审计报告
  - [ ] 报告包含：发现时间、文件路径、行号、风险级别、匹配内容（脱敏展示）

#### F12: 配置文件完整性校验
在启动时增加配置文件的完整性校验，确保关键配置值非空且格式合法（在现有 `validateConfig()` 基础上增强）。
- **验收标准**:
  - [ ] 空 URL、空 branch、空 module 时打印明确警告
  - [ ] 占位符 `<YOUR-*>` 未被替换时打印友好提示

---

## Technical Stack

- Frontend: N/A（纯后端 MCP Server）
- Backend: TypeScript (ESM) + Node.js >= 18
- Codebase: `tsx` 运行时（零构建步骤）
- CI: GitHub Actions
- Hooks: Git native hooks (`.githooks/pre-commit` bash 脚本)
- Key libraries: 无新增依赖（纯文件系统操作，使用 Node.js 内置 `fs`、`path`、`crypto`）

---

## 文件级变更清单

### 新建文件（8 个）

| # | 文件路径 | 说明 | Phase |
|---|---------|------|-------|
| N1 | `enterprise/.gitkeep` | 空文件，保持目录结构 | Phase 1 |
| N2 | `examples/monitors.conf.example.json` | 仓库监控配置模板 | Phase 2 |
| N3 | `examples/server.conf.example.json` | HTTP 安全配置模板 | Phase 2 |
| N4 | `examples/.mcp.example.json` | MCP 连接配置模板 | Phase 2 |
| N5 | `.githooks/pre-commit` | 提交前 5 规则安全检查 | Phase 5 |
| N6 | `.github/workflows/security-check.yml` | CI 安全扫描工作流 | Phase 5 |
| N7 | `gan-harness/eval-rubric.md` | 评估评分矩阵（本规格配套） | (元文件) |

### 修改文件（13 个）

| # | 文件路径 | 变更类型 | 说明 | Phase |
|---|---------|---------|------|-------|
| M1 | `.gitignore` | 扩展 | 新增 `enterprise/` + 敏感文件逐个排除规则 | Phase 1 |
| M2 | `src/paths.ts` | 新增函数 | 新增 `ensureEnterpriseDir()` 导出函数 | Phase 3 |
| M3 | `src/state.ts` | 新增函数+路径改动 | 新增 `resolveConfigPath()`；`CONFIG_FILE`/`STATE_FILE` 改用此函数；`ensureConfigFile()` 适配 | Phase 3 |
| M4 | `src/security.ts` | 路径改动 | `SERVER_CONF_FILE` 改用 `resolveConfigPath("server.conf.json")` | Phase 3 |
| M5 | `src/index.ts` | 启动流程 | 在 `ensureConfigFile()` 之前调用 `ensureEnterpriseDir()` | Phase 3 |
| M6 | `src/tools/tia-init.ts` | 路径改动 | 模板文件路径从根目录改为 `examples/` | Phase 3 |
| M7 | `CLAUDE.md` | 脱敏 | `codehub.huawei.com` → `<YOUR-GIT-HOST>` 等 | Phase 4 |
| M8 | `README.zh-CN.md` | 脱敏 | 同上 | Phase 4 |
| M9 | `README.en.md` | 脱敏 | 同上 | Phase 4 |
| M10 | `docs/Test-Impact-Analysis-mcp用户指南.md` | 脱敏 | `l30026134` → `<YOUR-CONTACT-ID>` | Phase 4 |
| M11 | `docs/zh-TW/README.md` | 脱敏 | `myteam/backend` → `<YOUR-ORG>/example-backend` | Phase 4 |
| M12 | `docs/ja-JP/README.md` | 脱敏 | 同上 | Phase 4 |
| M13 | `.claude/commands/repo_add.md` | 脱敏 | `codehub.huawei.com:team/api.git` → `<YOUR-GIT-HOST>:<YOUR-ORG>/example.git` | Phase 4 |

### 无需修改的文件（确认清单）

| 文件 | 原因 |
|------|------|
| `impact-rules.conf.json` | 纯示例规则，无企业信息 |
| `.opencode.json` | 已用 `${PROJECT_ROOT}` 占位 |
| `.codex/config.toml` | 已用 `${PROJECT_ROOT}` 占位 |
| `package.json` | `prepare` 脚本已存在且正确 |
| `scripts/check-sensitive-data.sh` | 已存在，功能完整（F7 仅做兼容确认） |

---

## 依赖关系图

```
Phase 1 (目录+gitignore)
 ├── F1: 目录结构初始化
 │    └── 被依赖: F2, F3, F4, F5, F6, F7
 │
 ├── Phase 2 (模板)
 │    └── F2: 配置模板化
 │         ├── 依赖: F1 (examples/ 目录已存在)
 │         └── 被依赖: F3 (resolveConfigPath 的 fallback 第3级)
 │
 ├── Phase 3 (代码改造)
 │    ├── F3: resolveConfigPath()
 │    │    ├── 依赖: F1 (enterprise/ 目录已存在)
 │    │    └── 被依赖: F4 (ensureEnterpriseDir 被 resolveConfigPath 调用)
 │    ├── F4: ensureEnterpriseDir()
 │    │    ├── 依赖: F1 (enterprise/ 目录概念已建立)
 │    │    └── 被依赖: F3 (resolveConfigPath fallback)
 │    └── F9: TIA-init 模板路径迁移 (可选)
 │         └── 依赖: F2 (examples/ 下有模板文件)
 │
 ├── Phase 4 (文档脱敏)
 │    └── F5: 文档脱敏
 │         ├── 依赖: F2 (模板已建立占位符标准)
 │         └── 被依赖: F7 (自查脚本依赖脱敏后的文档)
 │
 ├── Phase 5 (保障机制)
 │    ├── F6: Pre-commit Hook
 │    │    ├── 依赖: F1 (.githooks/ 目录已存在)
 │    │    └── 被依赖: 无（最终防线）
 │    ├── F7: 自查脚本完善
 │    │    ├── 依赖: F5 (文档脱敏完成后才能通过检查)
 │    │    └── 被依赖: F8 (CI 工作流调用此脚本)
 │    └── F8: CI 安全扫描
 │         ├── 依赖: F7 (自查脚本可用)
 │         └── 被依赖: 无
 │
 └── Phase 6 (验证)
      ├── 依赖: Phase 3 + Phase 4 全部完成
      └── 被依赖: 无（收尾阶段）

无循环依赖。Feature 可线性交付。
```

---

## 每个 Feature 的详细文件级变更

### F1: 目录结构初始化

**操作**:
1. 创建目录 `enterprise/`，在其中创建 `.gitkeep`（空文件）
2. 创建目录 `examples/`（模板文件在 F2 创建）
3. 确认 `scripts/` 目录已存在（已存在 `check-sensitive-data.sh`）
4. 创建目录 `.githooks/`
5. 编辑 `.gitignore`，追加以下规则：

```gitignore
# === 企业配置层（核心安全 — 双重保险） ===
enterprise/

# === 本地敏感配置（防止未放 enterprise/ 直接放根目录） ===
server.conf.json
monitors.conf.json
.mcp.json
.claude/settings.local.json

# === Git Hooks 启用标记（开发环境自动配置，不提交） ===

# === CI 缓存 ===
.github/
```

**关键约束**: `.gitignore` 修改后，需确认 `monitors.json` 规则已存在（当前 gitignore L5 已有）。

### F2: 配置模板化

**操作**: 创建以下 3 个模板文件，内容完全按照蓝图章节 11.5 中的模板：

1. `examples/monitors.conf.example.json`
2. `examples/server.conf.example.json`
3. `examples/.mcp.example.json`

**关键约束**:
- 所有 URL/host/路径使用 `<YOUR-*>` 占位符
- `_comment` 字段说明复制和编辑方式
- JSON 格式必须合法（`JSON.parse` 可解析）
- 模板中不出现 `codehub`、`huawei`、`Wayne`、`l30026134`、`myproject` 等字符串

### F3: resolveConfigPath() 多级 Fallback

**操作**:

`src/paths.ts` 新增：
```typescript
import { existsSync, mkdirSync, writeFileSync } from "fs";
/** 确保 enterprise/ 目录存在（幂等） */
export function ensureEnterpriseDir(): void { /* 见蓝图 11.6 */ }
```

`src/state.ts` 新增：
```typescript
import { resolveConfigPath } from "./paths.js";  // 实际在本文件实现
// 或直接在 state.ts 实现 resolveConfigPath，import ensureEnterpriseDir from paths
```

根据蓝图 11.6 的设计，`resolveConfigPath()` 应在 `src/state.ts` 中实现，调用 `ensureEnterpriseDir()`（后者在 `src/paths.ts` 中）。

**改造点**:
- `CONFIG_FILE`（L39）从 `join(PROJECT_ROOT, "monitors.conf.json")` → `resolveConfigPath("monitors.conf.json")`
- `STATE_FILE`（L40）从 `join(PROJECT_ROOT, "monitors.json")` → `resolveConfigPath("monitors.json")`（但 `monitors.json` 是运行时产物，不应从 enterprise/ 加载。需要特殊处理：仅在根目录查找，不 fallback 到 enterprise/）
- `ensureConfigFile()`（L408）中的 `CONFIG_FILE` 引用同步更新

**特别处理**: `monitors.json`（运行时状态文件）与 `monitors.conf.json`（配置文件）的查找逻辑不同：
- `monitors.conf.json` → 走完整 fallback（enterprise/ > 根目录 > examples/）
- `monitors.json` → 始终在根目录（纯运行时产物，不属于企业配置）。建议保留 `join(PROJECT_ROOT, "monitors.json")` 不变。

### F4: ensureEnterpriseDir() 启动保障

**操作**:

`src/index.ts` 修改 — 在 `ensureConfigFile()` 调用之前插入：

```typescript
import { ensureEnterpriseDir } from "./paths.js";

// 在 ensureConfigFile() 调用之前:
ensureEnterpriseDir();  // ← 新增
ensureConfigFile();
```

### F5: 文档脱敏

**操作**: 对每个文档文件执行字符串替换。替换映射：

| 原文 | 替换为 |
|------|--------|
| `codehub.huawei.com` | `<YOUR-GIT-HOST>` |
| `myproject/order-service` | `<YOUR-ORG>/example-project` |
| `myteam/backend` | `<YOUR-ORG>/example-backend` |
| `"contactInfo": "l30026134"` | `"contactInfo": "<YOUR-CONTACT-ID>"` |
| `WayneLiu519888` | `<YOUR-GITHUB-USERNAME>` |
| 含 `myteam` 的示例 URL | 使用 `<YOUR-ORG>` 替代 |

**需处理的文件清单**: 见上方"修改文件"表 M7-M13。

**关键约束**: 替换后 JSON 结构和 Markdown 格式不能破坏。特别是 CLAUDE.md 中的 JSON 示例代码块，替换后必须保持合法 JSON。

### F6: Pre-commit Hook

**操作**: 创建 `.githooks/pre-commit`，内容完全参照蓝图 11.8.1 节。注意：
- Shebang: `#!/bin/bash`
- 使用 `git diff --cached --name-only` 检查 staged 文件
- 使用 `git diff --cached -G "<regex>"` 对 staged 内容做正则匹配
- 输出带 ANSI 颜色码（红/绿）

### F7: 自查脚本完善

**当前状态**: `scripts/check-sensitive-data.sh` 已存在且功能完整。
**操作**: 验证脚本与重构后的项目结构兼容。如已满足 F7 验收标准，无需修改。

### F8: CI 安全扫描

**操作**: 创建 `.github/workflows/security-check.yml`，参照蓝图 11.8.3 节。

### F9: TIA-init 模板路径迁移

**操作**: `src/tools/tia-init.ts` 中检查模板文件的读取路径。当前 `PROJECT_ROOT` 指向项目根目录，命令文件在 `.claude/commands/` 等目录下。此 Feature 需确认 TIA-init 返回的 MCP 配置模板中不含真实信息。核心改动：确保返回的配置 JSON 中的 `url` 使用 `conf.host:conf.port`（动态获取），而非硬编码 IP。

---

## Sprint Plan

### Sprint 1: 地基搭建
- **目标**: 目录结构就绪 + .gitignore 加固 + 模板可用
- **Feature**: F1（目录结构）、F2（配置模板化）
- **产出物**: `enterprise/.gitkeep`、`examples/*.example.json`（3 个）、`.githooks/` 目录、加固的 `.gitignore`
- **Definition of done**:
  - `git status` 无 enterprise/ 出现在 untracked
  - 3 个模板文件通过 `JSON.parse` 校验
  - 自查脚本无敏感信息命中

### Sprint 2: 代码核心改造
- **目标**: resolveConfigPath() 可用，所有配置路径正确 fallback
- **Feature**: F3（resolveConfigPath）、F4（ensureEnterpriseDir）、F9（TIA-init 路径迁移）
- **产出物**: `src/paths.ts` 改造、`src/state.ts` 改造、`src/security.ts` 改造、`src/index.ts` 改造
- **Definition of done**:
  - `npm start` 在无 enterprise/ 时自动创建目录
  - `npm start` 在有 enterprise/ 时正常加载企业配置
  - 无 enterprise/ 且无根目录配置时，自动从模板创建
  - `npm test` 全部通过

### Sprint 3: 文档脱敏
- **目标**: 所有文档零敏感信息
- **Feature**: F5（文档脱敏）
- **产出物**: 8 个脱敏后的文档文件
- **Definition of done**:
  - `bash scripts/check-sensitive-data.sh` 退出码 0
  - 文档中所有示例 JSON 可解析
  - Markdown 渲染无断链

### Sprint 4: 保障机制 + 验证
- **目标**: 多层防线就绪，端到端验证通过
- **Feature**: F6（Pre-commit Hook）、F7（自查脚本确认）、F8（CI 工作流）
- **Definition of done**:
  - 故意在源码层添加敏感信息 → pre-commit 拦截
  - `npm test` 全绿
  - `npx tsc --noEmit` 无新增错误
  - 双环境模拟测试（无 enterprise/ / 有 enterprise/）通过

---

## Evaluation Criteria

详细的评分矩阵见 `gan-harness/eval-rubric.md`。此处提供概要：

### Design Quality (weight: 0.3)
- 分层隔离的清晰度：enterprise/ 与 src/ 是否物理隔离
- .gitignore 双重保险是否完善
- 终端输出（警告/错误/提示）是否专业且信息充分

### Originality (weight: 0.2)
- resolveConfigPath 的 fallback 链是否健壮
- 双环境工作流是否考虑周全

### Craft (weight: 0.3)
- 代码无新增 TypeScript 编译错误
- 所有新建 JSON 文件格式合法
- pre-commit hook 5 条规则是否正确拦截
- 边界情况处理：首次启动、enterprise/ 被误删、模板缺失

### Functionality (weight: 0.2)
- npm start 正常启动（stdio 和 http 模式）
- npm test 全部通过
- 自查脚本返回 clean
- 双环境（有/无 enterprise/）均正常工作
