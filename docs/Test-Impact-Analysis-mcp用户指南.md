# TIA (Test Impact Analysis) MCP Server — 使用指导

> **版本**: v1.2.0 | **工具数**: 6 个 | **Transport**: stdio / HTTP 双模 | **平台**: GitHub / Local / Generic

---

## 目录

1. [前置准备](#前置准备)
2. [工具速查表](#工具速查表)
3. [工具详解](#工具详解)
   - [TIA-init — 初始化引导](#工具一tia-init--初始化引导)
   - [repo_monitor — 仓库监控](#工具二repo_monitor--仓库监控)
   - [repo_clone — 代码克隆](#工具三repo_clone--代码克隆)
   - [impact_analysis — 影响分析](#工具四impact_analysis--影响分析)
   - [test_recommendation — 测试推荐](#工具五test_recommendation--测试推荐)
   - [risk_assessment — 风险评估](#工具六risk_assessment--风险评估)
4. [Transport 分级](#transport-分级)
5. [配置文件参考](#配置文件参考)
6. [典型工作流](#典型工作流)
7. [CronCreate 定时监控](#croncreate-定时监控)
8. [常见问题](#常见问题)

---

## 前置准备

### 1. 配置 MCP 连接

**本地模式（stdio）** — 零配置，直接使用：

```json
// .claude/settings.local.json
{
  "enabledMcpjsonServers": ["test-impact-analysis"]
}
```

**HTTP 远程模式** — 跨网络调用，需先执行 TIA-init：

```json
{
  "mcpServers": {
    "test-impact-analysis": {
      "type": "http",
      "url": "http://your-server:3100/mcp",
      "headers": {
        "X-Agent-Type": "ClaudeCode"
      }
    }
  }
}
```

### 2. 初始化

```bash
# stdio 模式跳过，HTTP 模式首次连接后执行
TIA-init
```

### 3. 添加要监控的仓库

编辑 `monitors.conf.json`（直接编辑 JSON 文件，无需 MCP 工具）：

```jsonc
{
  "repositories": [
    {
      "name": "user-backend",                     // 仓库别名，全局唯一
      "url": "git@github.com:team/user-backend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "backend",                      // frontend | backend
      "module": "用户中心"                         // 业务模块名
    },
    {
      "name": "user-frontend",
      "url": "git@github.com:team/user-frontend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "frontend",
      "module": "用户中心"
    },
    {
      "name": "order-backend",
      "url": "git@github.com:team/order-backend.git",
      "platform": "github",
      "branch": "main",
      "repoType": "backend",
      "module": "订单系统"
    }
  ]
}
```

---

## 工具速查表

| # | 工具 | 用途 | Transport |
|---|------|------|-----------|
| 1 | `TIA-init` | 客户端初始化引导（API KEY 签发 + 命令注册） | all |
| 2 | `repo_monitor` | 统一仓库监控：查看水位 / 检查新提交 / 迭代重置 | all |
| 3 | `repo_clone` | 代码克隆：全量拉取 / 增量 MR 拉取 | all |
| 4 | `impact_analysis` | 代码变更 → 受影响测试用例分析 | all |
| 5 | `test_recommendation` | 智能测试优先级排序 + 最小可行测试集 | stdio-only |
| 6 | `risk_assessment` | 变更风险评分 (0-100) + 缓解建议 | stdio-only |

---

## 工具详解

### 工具一：TIA-init — 初始化引导

> **Transport**: all | **HTTP 首次必调**

```bash
TIA-init
# 或指定 Agent 类型
TIA-init(agentType="ClaudeCode")    # ClaudeCode | CodeX | OpenCode
```

自动完成：API KEY 签发（SHA-256 哈希存储）、命令文件注册（自动识别 Claude Code / OpenCode / Codex）、MCP 配置模板返回。

---

### 工具二：repo_monitor — 仓库监控

> **Transport**: all | **3 种操作**: status / check / reset

#### `action=status` — 查看水位状态

```bash
repo_monitor(action="status")                     # 全部仓库
repo_monitor(action="status", name="user-backend") # 单个仓库
repo_monitor(action="status", module="用户中心")    # 按模块
```

#### `action=check` — 检查新提交

对比远程 HEAD 与本地水位，返回新提交摘要。**首次检查自动初始化水位**。

```bash
repo_monitor(action="check")                      # 全部仓库
repo_monitor(action="check", module="用户中心")    # 按模块
```

#### `action=reset` — 迭代切换

```bash
# 重置到当前 HEAD
repo_monitor(action="reset", name="user-backend", label="手动重置")

# 日期定位：自动找迭代第一个 MR 的 base commit
repo_monitor(action="reset", module="用户中心", label="Sprint 26", sinceDate="2026-06-13")
```

---

### 工具三：repo_clone — 代码克隆

> **Transport**: all | **mode**: full / incremental

#### 存储路径

```
Repository/
├── Frontend repository/      ← repoType="frontend"
│   └── {repo-name}/
│       ├── {branch}/         ← 全量克隆的代码
│       ├── 1001/             ← MR #1001
│       └── 1002/             ← MR #1002
└── Backend repository/       ← repoType="backend"
    └── {repo-name}/
```

#### mode=full — 全量克隆

```bash
# 单个仓库
repo_clone(mode="full", name="user-backend")

# 按模块批量
repo_clone(mode="full", module="用户中心")

# 强制覆盖已有目录
repo_clone(mode="full", name="user-backend", force=true)
```

#### mode=incremental — 增量克隆 MR

```bash
# 按日期拉取（6月13日之后合入的所有 MR）
repo_clone(mode="incremental", module="用户中心", sinceDate="2026-06-13")

# 按基线 MR 拉取（#1234 之后合入的所有 MR）
repo_clone(mode="incremental", name="user-backend", sinceMrId="1234")
```

---

### 工具四：impact_analysis — 影响分析

> **Transport**: all | **分析代码变更影响了哪些测试用例**

基于 `impact-rules.conf.json` 中配置的文件→测试映射规则，自动匹配变更文件对应的测试模块。

```bash
# 分析从当前水位到远程 HEAD 的变更
impact_analysis(name="user-backend")

# 指定 SHA 范围
impact_analysis(name="user-backend", from="abc123", to="def456")

# 按模块批量分析
impact_analysis(module="用户中心")
```

**匹配策略**: glob 模式匹配 + 四级置信度：

| 匹配方式 | 置信度 | 示例 |
|----------|--------|------|
| 精确文件匹配 | 95% | `src/auth/login.ts` 精确命中 |
| 同级目录匹配 | 70% | `src/auth/login.ts` 匹配 `src/auth/**` |
| 上级目录通配 | 45% | `src/auth/sub/file.ts` 匹配 `src/**` |
| 自动推断 | 30% | 未命中规则时根据 `src/→tests/` 映射推断 |

**规则配置示例** (`impact-rules.conf.json`)：

```jsonc
{
  "rules": [
    {
      "id": "auth-module",
      "name": "认证模块",
      "filePatterns": ["src/auth/**"],
      "testPaths": ["tests/auth/login.test.ts", "tests/auth/register.test.ts"],
      "riskLevel": "high"
    },
    {
      "id": "database-layer",
      "name": "数据库层",
      "filePatterns": ["src/database/**", "src/models/*.ts"],
      "testPaths": ["tests/db/"],
      "riskLevel": "medium"
    }
  ],
  "autoInfer": {
    "enabled": true,
    "sourceToTestMapping": { "src/": "tests/" }
  }
}
```

---

### 工具五：test_recommendation — 测试推荐

> **Transport**: stdio-only | **按优先级排序测试 + 最小可行测试集**

```bash
test_recommendation(name="user-backend")
test_recommendation(module="用户中心")
```

**推荐分** = 风险权重 × 置信度：

| 风险等级 | 权重 |
|----------|------|
| high | 100 |
| medium | 50 |
| low | 20 |

**三级分组**：

| 分组 | 阈值 | 含义 |
|------|------|------|
| ✅ 强烈建议 | ≥ 7000 | 高权重 × 高置信度，必须运行 |
| 🟡 建议 | 2000 ~ 6999 | 建议运行，可酌情跳过 |
| 💡 可选 | < 2000 | 低优先级，资源充裕时运行 |

**最小可行测试集**：自动筛选覆盖所有 high + medium 风险模块的最少测试集合。

---

### 工具六：risk_assessment — 风险评估

> **Transport**: stdio-only | **变更风险 0-100 量化评分**

```bash
risk_assessment(name="user-backend")
risk_assessment(module="用户中心")
```

**评分公式**：

```
总分 = 文件分(0-60) + 模块分(0-40) + 置信度惩罚(0-20) = 0-100
```

| 分数 | 等级 | 建议 |
|------|------|------|
| 0-30 | 🟢 低风险 | 运行关键测试即可 |
| 31-60 | 🟡 中等风险 | 标准 CR 流程 |
| 61-85 | 🟠 高风险 | 全部测试 + 代码审查 |
| 86-100 | 🔴 严重风险 | 测试+CR+QA验收三步走 |

**风险因素**：

- **文件维度**：1 个文件 = 10 分基础 + 每多 1 个 +5 分（上限 60）
- **模块维度**：每个 high-risk +20 分，每个 medium-risk +8 分（上限 60）
- **置信度惩罚**：平均置信度 < 50% 额外 +10 分，< 30% 额外 +20 分

---

## 🔧 JACG 安装配置 🔜 Phase 5b 规划中

> **JACG**（Java All Call Graph）是 TIA Phase 5b 的核心增强——通过方案 D（子进程 jar 调用）集成，为 Java 项目提供**字节码级调用链分析能力**。JACG 作为可选依赖：JDK 可用时增强分析精度，不可用时自动降级到现有文件级 glob 匹配。

### JACG 是什么？

基于 Java 字节码（ASM）的静态调用链分析引擎。它可以从方法 A 正向追踪到所有下游调用，也可以从方法 B 逆向追溯到所有上游入口（Controller / MQ 消息消费 / 定时任务）。在 TIA 中，JACG 将当前的"文件级测试映射"升级为"方法级端到端调用链分析"。

### 前置要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| JDK | >= 11（推荐 17+） | 运行时依赖。不可用时 TIA 自动降级为文件级 glob 匹配 |
| java-all-call-graph JAR | 已包含在 `lib/jacg/` 中 | 项目自带预编译 JAR，无需额外下载 |

### 多平台安装

#### Claude Code 环境

```bash
# 步骤1：确认 JDK 可用
java -version  # 应输出 JDK 11+

# 步骤2（如未安装）：安装 JDK
# macOS
brew install openjdk@17

# Ubuntu/Debian
sudo apt install openjdk-17-jdk

# Windows
# 下载 https://adoptium.net/ 的 .msi 安装包

# 步骤3：验证 JACG 集成状态
impact_analysis(action="full", name="your-java-project")
# 输出 "📐 JACG 全量分析 (42s)" = 集成成功
# 输出 "⚠️ JDK 不可用，降级为文件匹配" = JDK 未配置
```

#### OpenCode 环境

```json
// .opencode.json — 确保 TIA 通过 stdio 连接
{
  "mcpServers": {
    "test-impact-analysis": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/index.ts"]
    }
  }
}
```
JDK 安装步骤与 Claude Code 相同。

#### Codex 环境

```toml
# .codex/config.toml
[mcp_servers.test-impact-analysis]
command = "npx"
args = ["tsx", "src/index.ts"]
enabled = true
```
JDK 安装步骤与上述相同。

### 配置文件

`analyzers.conf.json`（规划中恢复）中 JACG 相关配置项：

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 调用链分析",
      "enabled": true,              // false 可禁用
      "fileExtensions": [".java"],
      "confidenceWeight": 90,
      "config": {
        "jarPath": "lib/jacg/java-all-call-graph.jar",
        "maxHeap": "2g",            // JVM 最大堆内存
        "timeout": 600              // 超时秒数
      }
    }
  ]
}
```

### 工作模式

| 模式 | 触发方式 | 说明 |
|------|---------|------|
| 全量预生成 | `impact_analysis(action="full", name="xxx")` | 调用 JACG 对全量 Java 代码生成调用图，落盘 `.tia/` 目录 |
| 增量实时分析 | `impact_analysis(name="xxx", mrId="1423")` | 变更文件 → 查全景索引 → 逆向 BFS 遍历 → 精准定位受影响 API |
| 降级兜底 | 自动（JDK 不可用时） | 自动降级为文件级 glob 匹配（当前默认行为） |

### 效果对比

| 分析方式 | 精度 | 示例 |
|----------|:--:|------|
| 文件级 glob 匹配（当前） | 文件→测试映射 | `OrderService.java` 变更 → 建议运行 `OrderServiceTest` |
| JACG 调用链分析（Phase 5b） | 方法→API 端点到端链路 | `OrderService.createOrder()` → `OrderController.createOrder()` → `POST /api/orders` |

### 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| `⚠️ JDK 不可用` | java 不在 PATH 中 | `which java` 确认路径，或设置 `JAVA_HOME` |
| `JACG 超时` | 项目过大 | 增大 `analyzers.conf.json` 中的 `timeout` 值 |
| `OutOfMemoryError` | 堆内存不足 | 增大 `maxHeap`（如 `"4g"`） |
| `JAR 文件缺失` | `lib/jacg/*.jar` 不存在 | 运行 `scripts/download-jacg.sh` 下载/构建 |

> ⚠️ **本章节所有内容为 Phase 5b 规划预览，尚未实现。** 当前 TIA 使用文件级 glob 匹配进行影响分析，功能完全可用。

---

## Transport 分级

TIA 工具按 Transport 模式分级暴露，确保远程客户端看不到无法使用的工具：

| 模式 | 可用工具数 | 可见工具 |
|------|-----------|---------|
| **stdio**（本地） | 6 个 | 全部工具 |
| **HTTP**（远程） | 4 个 | TIA-init, repo_monitor, repo_clone, impact_analysis |

**远程模式降级行为**：

| 工具 | 本地 (stdio) | 远程 (HTTP) |
|------|-------------|------------|
| repo_clone | 直接执行 git clone | 返回 git 指令，客户端本地执行 |
| impact_analysis | 直接分析 diff | 降级返回分析指令（后续补充） |
| test_recommendation | 正常推荐 | ❌ 拒绝 + 提示仅本地可用 |
| risk_assessment | 正常评估 | ❌ 拒绝 + 提示仅本地可用 |

---

## 配置文件参考

TIA 有 4 个配置文件，配置/状态分离。**企业敏感配置（含内部仓库地址等）请放入 `enterprise/` 目录**，
该目录被 `.gitignore` 排除，不会被提交到 GitHub：

| 文件 | 类型 | 用途 |
|------|------|------|
| `monitors.conf.json` | 用户手写 | 仓库监控配置 |
| `monitors.json` | 程序维护 | 水位状态（自动生成） |
| `impact-rules.conf.json` | 用户手写 | 影响分析规则 |
| `server.conf.json` | 用户手写 | HTTP 模式安全配置 |

> ⚠️ **信息安全提示**：所有 `.conf.json` 文件优先从 `enterprise/` 目录读取。
> 首次启动时如 `enterprise/` 为空，会自动从 `examples/` 复制模板。

### monitors.conf.json

```jsonc
{
  "baseDir": "/data/repos",          // 可选，代码克隆根目录
  "repositories": [
    {
      "name": "my-backend",          // 仓库别名
      "url": "git@github.com:org/repo.git",
      "platform": "github",          // github | local | generic
      "branch": "main",
      "repoType": "backend",         // frontend | backend
      "module": "用户中心",
      "auth": { "type": "none" }     // none | token | rsa
    }
  ]
}
```

### server.conf.json

```jsonc
{
  "port": 3100,
  "host": "0.0.0.0",
  "allowedIps": ["192.168.1.0/24", "127.0.0.1"],
  "xForwardedFor": false,
  "contactInfo": "<YOUR-CONTACT-ID>",
  "apiKeys": []    // TIA-init 自动签发，无需手写
}
```

### 影响分析规则配置

TIA 使用两级规则体系来定义"文件变更 → 测试用例"的映射关系，支撑 `impact_analysis`、`test_recommendation`、`risk_assessment` 三个分析工具。

#### 两级规则体系

```
通用规则（第 1 级）              企业规则（第 2 级）
impact-rules.conf.json        enterprise/impact-rules.conf.json
├─ 项目根目录                   ├─ enterprise/ 目录（.gitignore 排除）
├─ 可提交到 GitHub              ├─ 仅本地有效，永不提交
├─ 提供开箱即用的示例规则         ├─ 企业内部定制规则
└─ 所有团队共享的基础规则         └─ 同 id 覆盖通用规则

最终生效 = 通用规则 ∪ 企业规则（同 id 企业覆盖通用）
```

**设计意图**：
- 通用规则随代码仓库分发，提供基础的"源码目录 → 测试目录"映射，任何 clone 项目的人都能直接使用
- 企业规则放在 `enterprise/` 目录（被 `.gitignore` 排除），存放内部项目特有的规则，不会意外提交到公共仓库
- 两个文件独立加载，运行时合并，企业规则优先

#### 快速上手（3 步）

```bash
# 第 1 步：查看通用规则（已内置示例）
cat impact-rules.conf.json
# 输出示例：
# {
#   "rules": [
#     { "id": "example-auth", "name": "认证模块示例", ... }
#   ],
#   "autoInfer": { "enabled": true, "sourceToTestMapping": { "src/": "tests/" } }
# }

# 第 2 步：从示例模板创建企业规则
cp examples/impact-rules.conf.example.json enterprise/impact-rules.conf.json

# 第 3 步：编辑企业规则，根据你的项目取消注释适用的预设规则
vim enterprise/impact-rules.conf.json
```

#### 规则字段详解

```jsonc
{
  // 唯一标识，全局不可重复。企业规则建议使用 "ent-" 前缀避免与通用规则冲突
  "id": "ent-controller",

  // 规则名称，用于在分析结果中展示，便于识别
  "name": "Controller 层变更",

  // 可选描述，说明该规则的业务含义和覆盖范围
  "description": "所有 Controller 类变更 → 运行对应集成测试",

  // 文件匹配模式，支持 glob 语法。变更文件命中任一模式即触发规则
  "filePatterns": [
    "src/main/java/**/*Controller.java",
    "src/main/java/**/*Controller.kt"
  ],

  // 测试路径，可为具体文件或目录（目录以 / 结尾）
  "testPaths": [
    "src/test/java/**/*ControllerTest.java",
    "src/test/java/**/*ControllerIT.java"
  ],

  // 风险等级，影响推荐分计算和风险评估
  // high=100权重 / medium=50权重 / low=20权重
  "riskLevel": "high",

  // 可选：规则适用范围筛选。不填则对所有仓库生效
  "appliesTo": {
    "names": ["order-service"],     // 仅对指定仓库别名生效
    "modules": ["订单系统"],          // 仅对指定业务模块生效
    "repoTypes": ["backend"],       // 仅对指定仓库类型生效
    "platforms": ["github"]         // 仅对指定 Git 平台生效
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:--:|------|
| `id` | string | ✅ | 唯一标识。企业规则建议使用 `ent-` 前缀避免冲突 |
| `name` | string | ✅ | 规则名称，便于在分析结果中识别 |
| `description` | string | ❌ | 规则描述，说明该规则覆盖的业务场景 |
| `filePatterns` | string[] | ✅ | 文件匹配的 glob 模式（支持 `**` `*` `{a,b}` `?` `[a-z]`） |
| `testPaths` | string[] | ✅ | 对应的测试文件或测试目录路径。以 `/` 结尾表示目录 |
| `riskLevel` | "high" / "medium" / "low" | ✅ | 风险等级，影响推荐分和风险评估结果 |
| `appliesTo` | object | ❌ | 规则适用范围筛选。不填则对所有仓库生效 |

#### `appliesTo` 筛选逻辑详解

`appliesTo` 包含 4 个可选维度，控制规则生效的仓库范围：

| 维度 | 字段 | 类型 | 示例 | 说明 |
|------|------|------|------|------|
| 仓库别名 | `names` | string[] | `["order-service", "user-service"]` | 与 `monitors.conf.json` 中 `name` 字段匹配 |
| 业务模块 | `modules` | string[] | `["订单系统", "用户中心"]` | 与 `monitors.conf.json` 中 `module` 字段匹配 |
| 仓库类型 | `repoTypes` | string[] | `["backend"]` 或 `["frontend"]` | 对应 `repoType` 字段 |
| Git 平台 | `platforms` | string[] | `["github", "generic"]` | 对应 `platform` 字段（不填则忽略平台） |

**组合逻辑**：

```
规则是否生效 = (names 中有匹配 或 names 未填)
              AND (modules 中有匹配 或 modules 未填)
              AND (repoTypes 中有匹配 或 repoTypes 未填)
              AND (platforms 中有匹配 或 platforms 未填)
```

- 多个维度之间：**AND** 关系（全部满足才生效）
- 单个维度内：**OR** 关系（命中数组中任一项即满足该维度）
- 某维度不填：视为"不限制"，该维度自动通过

**示例**：

```jsonc
// 示例 1：仅对 order-service 仓库生效
{ "appliesTo": { "names": ["order-service"] } }

// 示例 2：仅对后端仓库中的"订单系统"和"用户中心"模块生效
{ "appliesTo": { "modules": ["订单系统", "用户中心"], "repoTypes": ["backend"] } }

// 示例 3：对所有 GitHub 平台的前端仓库生效
{ "appliesTo": { "repoTypes": ["frontend"], "platforms": ["github"] } }
```

#### glob 模式速查

TIA 使用标准 glob 语法进行文件匹配：

| 模式 | 说明 | 匹配示例 | 不匹配示例 |
|------|------|----------|------------|
| `**` | 匹配任意层级目录（含零层） | `src/**/*.java` 匹配 `src/Foo.java` 和 `src/a/b/Foo.java` | — |
| `*` | 匹配单层目录内任意字符（不含路径分隔符） | `src/*.ts` 匹配 `src/index.ts` | `src/sub/index.ts` |
| `?` | 匹配单个字符 | `src/?.ts` 匹配 `src/a.ts` | `src/ab.ts` |
| `{a,b}` | 匹配花括号内任一选项 | `*.{ts,tsx}` 匹配 `foo.ts` 和 `foo.tsx` | `foo.js` |
| `[a-z]` | 匹配字符范围 | `src/[a-z]*.ts` 匹配 `src/foo.ts` | `src/123.ts` |

**常用组合**：

```jsonc
// 匹配所有 Java 源文件
"src/main/java/**/*.java"

// 匹配所有 TypeScript 和 TSX 文件
"src/**/*.{ts,tsx}"

// 匹配 controllers 目录及其子目录下所有文件
"src/controllers/**"

// 匹配数据库迁移文件（命名约定）
"db/migrations/*.sql"
```

#### 自动推断机制（autoInfer）

当变更文件没有命中任何规则时，TIA 启动自动推断：

```jsonc
{
  "autoInfer": {
    "enabled": true,              // 是否启用自动推断
    "sourceToTestMapping": {      // 源码 → 测试路径映射
      "src/": "tests/"            // src/auth/login.ts → tests/auth/login.test.ts
    }
  }
}
```

推断逻辑：
1. 将变更文件路径中的 `src/` 替换为 `tests/`
2. 根据文件扩展名追加 `.test` 后缀（如 `login.ts` → `login.test.ts`）
3. 推断结果的置信度固定为 30%，标记 `matchType: "inferred"`

> **提示**：自动推断是兜底机制，精度有限。对高频变更文件，建议添加显式规则提升置信度。

#### 预设规则模板速览

`examples/impact-rules.conf.example.json` 提供 3 类、共 12 条预设规则（默认全部注释），按需取消注释或修改：

##### Java 后端（5 条）

| 规则 ID | 文件匹配模式 | 测试路径 | 风险 | 适用场景 |
|---------|-------------|---------|:--:|----------|
| `ent-controller` | `**/*Controller.java` | `**/*ControllerTest.java` | high | REST API 端点变更 |
| `ent-service` | `**/*Service*.java` | `**/*Service*Test.java` | high | 业务逻辑层变更 |
| `ent-repository` | `**/*Repository.java`, `**/*Mapper.java` | `**/*RepositoryTest.java` | medium | 数据访问层变更 |
| `ent-orm` | `**/entity/*.java`, `**/model/*.java` | `**/repository/*Test.java` | medium | ORM 实体/Model 变更 |
| `ent-spring-config` | `**/config/*.java`, `**/*.properties`, `**/*.yml` | `**/config/*Test.java` | high | Spring 配置变更 |

##### JS/TS 前端（5 条）

| 规则 ID | 文件匹配模式 | 测试路径 | 风险 | 适用场景 |
|---------|-------------|---------|:--:|----------|
| `ent-component` | `**/*.{tsx,jsx}` | `**/*.test.{tsx,jsx}`, `**/__tests__/**` | medium | React/Vue 组件变更 |
| `ent-state` | `**/store/**`, `**/redux/**`, `**/atoms/**` | `**/store/**/*.test.*` | high | 状态管理变更 |
| `ent-hooks` | `**/hooks/use*.{ts,tsx}` | `**/hooks/use*.test.*` | high | 自定义 Hook 变更 |
| `ent-api-service` | `**/api/**`, `**/services/*.{ts,tsx}` | `**/api/**/*.test.*`, `**/services/*.test.*` | medium | API 调用层变更 |
| `ent-utils` | `**/utils/**`, `**/helpers/**` | `**/utils/**/*.test.*` | low | 工具函数变更 |

##### 通用（2 条）

| 规则 ID | 文件匹配模式 | 测试路径 | 风险 | 适用场景 |
|---------|-------------|---------|:--:|----------|
| `ent-config` | `**/*.{json,yaml,yml,toml,env}` | `**/*.test.*` | medium | 配置文件变更 |
| `ent-db-migration` | `**/migrations/**`, `**/db/changelog/**` | `**/migrations/**` | high | 数据库迁移脚本 |
| `ent-security` | `**/security/**`, `**/auth/**`, `**/middleware/auth*` | `**/security/**/*Test*` | high | 安全/认证代码 |

#### 置信度与匹配策略

`impact_analysis` 工具对每条规则采用四级匹配策略：

| 匹配方式 | 置信度 | 触发条件 | 示例 |
|----------|:----:|----------|------|
| **精确匹配** (exact) | 95% | 变更文件与 testPath 指向的具体文件一一对应 | `src/auth/login.ts` → `tests/auth/login.test.ts` |
| **目录匹配** (directory) | 70% | 变更文件在 filePattern 的目录范围内，但 testPath 是目录 | `src/auth/login.ts` 匹配 `src/auth/**` → `tests/auth/` |
| **通配匹配** (wildcard) | 45% | 通过 `**` 或 `*` 通配符间接匹配 | `src/a/b/c/login.ts` 匹配 `src/**` → `tests/` |
| **自动推断** (inferred) | 30% | 未命中任何规则，通过 autoInfer 映射推断 | `src/order/service.ts` → `tests/order/service.test.ts` |

> **推荐**：目标是将高频变更路径的匹配控制在"精确匹配"和"目录匹配"级别（置信度 >= 70%）。

#### 完整配置示例

以下是一个典型的企业规则配置，覆盖了电商系统的后端服务和前端应用：

```jsonc
{
  "_comment": "电商系统影响分析规则 — 企业版",
  "rules": [
    // ============ 订单系统（backend） ============
    {
      "id": "ent-order-controller",
      "name": "订单 Controller 层",
      "description": "订单相关 REST API 端点变更 → 运行 Controller 集成测试",
      "filePatterns": ["**/order/**/*Controller.java"],
      "testPaths": ["**/order/**/*ControllerTest.java", "**/order/**/*ControllerIT.java"],
      "riskLevel": "high",
      "appliesTo": { "modules": ["订单系统"] }
    },
    {
      "id": "ent-order-service",
      "name": "订单 Service 层",
      "description": "订单业务逻辑变更 → 运行 Service 单元测试",
      "filePatterns": ["**/order/**/*Service*.java"],
      "testPaths": ["**/order/**/*Service*Test.java"],
      "riskLevel": "high",
      "appliesTo": { "modules": ["订单系统"] }
    },
    // ============ 用户中心（前端） ============
    {
      "id": "ent-user-component",
      "name": "用户中心 React 组件",
      "description": "用户中心页面组件变更 → 运行组件测试",
      "filePatterns": ["src/pages/user/**/*.{tsx,jsx}"],
      "testPaths": ["src/pages/user/**/*.test.{tsx,jsx}", "src/pages/user/__tests__/**"],
      "riskLevel": "medium",
      "appliesTo": { "modules": ["用户中心"], "repoTypes": ["frontend"] }
    },
    {
      "id": "ent-user-api",
      "name": "用户中心 API 层",
      "description": "用户中心 API 调用层变更 → 运行 API 层测试",
      "filePatterns": ["src/services/user*.{ts,tsx}", "src/api/user/**"],
      "testPaths": ["src/services/__tests__/user*.test.*", "src/api/user/**/*.test.*"],
      "riskLevel": "high",
      "appliesTo": { "modules": ["用户中心"], "repoTypes": ["frontend"] }
    },
    // ============ 通用规则 ============
    {
      "id": "ent-global-config",
      "name": "全局配置变更",
      "description": "任何仓库的配置文件变更 → 运行全量回归",
      "filePatterns": ["**/*.{properties,yml,yaml}", "**/.env*"],
      "testPaths": ["**/"],
      "riskLevel": "high"
    }
  ],
  "autoInfer": {
    "enabled": true,
    "sourceToTestMapping": {
      "src/main/java/": "src/test/java/",
      "src/": "__tests__/"
    }
  }
}
```

#### 后续扩展指引

- **添加新规则**：在 `enterprise/impact-rules.conf.json` 的 `rules` 数组中新增条目，参考预设模板的字段格式。规则 id 建议遵循 `ent-{模块}-{层次}` 命名约定
- **规则验证**：运行 `impact_analysis` 工具后，观察输出中每条匹配的 `matchType` 和 `confidence` 字段，确认规则命中符合预期
- **调优建议**：
  - 如果某类文件变更每次都触发自动推断（置信度 30%），说明缺少对应规则，建议补充
  - 如果某条规则命中过于宽泛（频繁触发但对测试选择无帮助），考虑收紧 `filePatterns` 或添加 `appliesTo` 限制
- **规则数量建议**：10-30 条为推荐范围。规则过少覆盖不全，过多则维护困难、匹配变慢。超过 30 条时考虑按 `appliesTo` 拆分到不同模块/仓库
- **定期审查**：建议每季度审查一次规则命中率，重点关注：
  - 自动推断占比（target < 20%）
  - 零命中规则（超过 1 个迭代未触发 → 考虑删除或更新）
  - 高频变更路径是否有对应规则

#### 常见问题

<details>
<summary><b>Q: 规则不生效怎么办？</b></summary>

排查步骤：
1. **检查 `appliesTo` 筛选条件**：确认规则中的 `names`/`modules`/`repoTypes`/`platforms` 是否匹配当前操作的仓库。例如 `appliesTo.modules: ["订单系统"]` 对 module 为"用户中心"的仓库不会生效
2. **检查 glob 模式**：确认 `filePatterns` 中的模式是否能匹配实际变更文件的相对路径。注意 glob 匹配的基准路径是仓库根目录
3. **确认规则文件路径**：通用规则读取 `impact-rules.conf.json`，企业规则读取 `enterprise/impact-rules.conf.json`。两个文件都会加载，但只在对应位置存在时才生效
4. **确认规则未被覆盖**：如果企业规则中有同 `id` 的规则，它会覆盖通用规则中同 id 的规则。检查是否存在意外覆盖
</details>

<details>
<summary><b>Q: 如何验证规则是否正确？</b></summary>

最佳实践是构造一个测试 MR，然后运行 `impact_analysis` 对比预期：

```bash
# 1. 创建一个包含目标文件变更的测试分支
# 2. 运行影响分析
impact_analysis(name="your-repo")

# 3. 观察输出中的关键字段：
#    - matchType: "exact"|"directory" → 规则命中（好）
#    - matchType: "inferred" → 走了自动推断（需补充规则）
#    - confidence: 数值越高匹配越精确
#    - matchedRule: 显示命中了哪条规则的 id
```

如果预期命中的规则没有出现：
- 检查该规则的 `filePatterns` 是否能匹配你的变更文件
- 检查该规则的 `appliesTo` 条件是否满足
- 临时将 `riskLevel` 改为 `"high"` 以排除被其他规则抢先匹配的可能
</details>

<details>
<summary><b>Q: 通用规则和企业规则冲突怎么办？</b></summary>

当两条规则的 `id` 相同时，企业规则（`enterprise/impact-rules.conf.json`）会覆盖通用规则（`impact-rules.conf.json`）。

这是设计行为——"企业定制优先"。典型场景：
- 通用规则中某规则的 `filePatterns` 太宽泛 → 在企业规则中定义同 `id` 的规则，收窄匹配范围
- 通用规则中某规则的 `riskLevel` 不适合你的项目 → 在企业规则中覆盖为合适的等级

注意：`id` 不同则不会覆盖，两条规则独立生效。
</details>

<details>
<summary><b>Q: 规则数量有上限吗？</b></summary>

无硬性上限，但有以下实际考量：
- **性能**：每条规则都会对每个变更文件做 glob 匹配，规则越多越慢。30 条以内匹配时间可以忽略不计
- **维护**：规则越多，理解和维护成本越高。建议每季度清理零命中规则
- **拆分策略**：如果超过 30 条，使用 `appliesTo` 将规则按模块/仓库拆分，减少每次匹配的规则数量

推荐：10-30 条，用 `appliesTo` 做范围控制。
</details>

<details>
<summary><b>Q: 自动推断（autoInfer）应该开启还是关闭？</b></summary>

建议保持开启（默认）。自动推断是兜底机制，确保即使没有配置规则也能给出初步分析结果（置信度 30%）。

关闭自动推断的场景：
- 你的团队已经配置了完整覆盖的规则集
- 不希望低置信度结果干扰测试决策

开启自动推断后，建议定期检查推断命中率。如果某类文件频繁触发推断，说明应该添加显式规则来提升置信度。
</details>

---

## 典型工作流

### 日常开发全链路

```bash
# ─── 一次性配置 ───
# 1. 编辑 monitors.conf.json 添加仓库
# 2. 编辑 impact-rules.conf.json 配置文件→测试映射
# 3. HTTP 模式执行 TIA-init

# ─── 迭代启动 ───
# 全量克隆代码
repo_clone(mode="full", module="用户中心")

# 重置水位到迭代起始点
repo_monitor(action="reset", module="用户中心", label="Sprint 26", sinceDate="2026-06-13")

# ─── 日常检查 ───
# 拉取增量 MR
repo_clone(mode="incremental", module="用户中心", sinceDate="2026-06-13")

# 检查新提交
repo_monitor(action="check", module="用户中心")

# ─── 变更分析 ───
# 1. 哪些测试受影响？
impact_analysis(name="user-backend")

# 2. 先跑哪些测试？
test_recommendation(name="user-backend")

# 3. 这次变更风险多大？
risk_assessment(name="user-backend")
```

### CronCreate 定时流水线

```bash
# 每 15 分钟自动检查全部仓库
/cron "*/15 * * * *" "repo_monitor(action='check')"

# 每 2 小时检查某模块 + 自动分析
/cron "7 */2 * * *" "repo_monitor(action='check', module='用户中心')"

# 每工作日上午 10 点全量分析
/cron "3 10 * * 1-5" "impact_analysis(module='用户中心') && test_recommendation(module='用户中心')"
```

---

## 常见问题

<details>
<summary><b>HTTP 模式下哪些工具不可用？</b></summary>

`test_recommendation` 和 `risk_assessment` 仅限 stdio 本地模式。HTTP 客户端调用会被拦截并返回明确提示。

HTTP 模式下可用的 4 个工具：`TIA-init`、`repo_monitor`、`repo_clone`、`impact_analysis`。

</details>

<details>
<summary><b>怎么添加新仓库？</b></summary>

直接编辑 `monitors.conf.json`，添加一个仓库对象即可。不需要重启 MCP Server，配置自动生效。

</details>

<details>
<summary><b>impact_analysis 没配置规则会怎样？</b></summary>

自动推断模式（`autoInfer.enabled: true`）会根据源码路径自动推断测试路径：

- `src/auth/login.ts` → `tests/auth/login.test.ts`
- 置信度 30%，标记为"自动推断"

配置了规则后，置信度会提升到 45-95%。

</details>

<details>
<summary><b>username/password 怎么配置？</b></summary>

绝大多数场景不需要。本地 git 已通过 SSH config + RSA 公钥完成鉴权。仅当 REST API 需要额外认证时才配置 token。

</details>

<details>
<summary><b>test_recommendation 和 risk_assessment 有什么区别？</b></summary>

- **test_recommendation**：告诉你"跑哪些测试"——推荐分排序 + 最小可行测试集
- **risk_assessment**：告诉你"这次变更多危险"——0-100 评分 + 风险评估 + 缓解建议

两者互补，建议一起使用。

</details>

<details>
<summary><b>支持哪些 AI 编程框架？</b></summary>

| 框架 | MCP 配置 | 命令文件 |
|------|---------|---------|
| Claude Code | `.claude/settings.local.json` | `.claude/commands/` |
| OpenCode | `.opencode.json` | `.opencode/commands/` |
| Codex (OpenAI) | `.codex/config.toml` | `.codex/skills/` |

</details>
