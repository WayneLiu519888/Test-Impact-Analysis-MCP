# TIA (Test Impact Analysis) MCP Server — 使用指导

> **版本**: v1.1.0 | **工具数**: 6 个 | **Transport**: stdio / HTTP 双模 | **平台**: GitHub / Local / Generic | **分析器**: JACG

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
9. [附录 A：独立部署 JACG 分析器（全流程）](#附录-a独立部署-jacg-分析器全流程)

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

**分析器编织层**（Phase 5a）：

impact_analysis 在执行时会自动匹配下游分析器对变更文件做语义分析。例如 `.java` 文件会委派给 JACG MCP Server 做方法调用链级别的分析，`.ts/.js` 文件走文件级 glob 匹配。

编织层具有三层降级容错：
- 分析器可用 → 调用分析 → 结果聚合到 final 输出
- 分析器不可用 → 自动降级为文件级 glob 匹配
- 分析器异常 → 降级 + 标注错误状态

---

### 附录 A：独立部署 JACG 分析器（全流程）

JACG（java-all-call-graph-server）是独立的 MCP Server，为 TIA 提供 Java 方法调用链分析能力。它是一个 **Java 进程**，需要单独下载、构建、配置为后台服务，然后注册到 Claude Code。

> 源码仓库：[https://github.com/Adrninistrator/java-all-call-graph-server](https://github.com/Adrninistrator/java-all-call-graph-server)
>
> 推荐安装目录：`D:\0_WayneArchiveFiles\MCP-Servers\java-all-call-graph\`

---

#### A.1 环境要求

| 依赖 | 版本要求 | 验证命令 |
|------|---------|---------|
| JDK | 8+（推荐 17/21） | `java -version` |
| Git | 任意 | `git --version` |
| Gradle | 内置（`gradlew`），无需安装 | — |

> ⚠️ **JDK 兼容性**：如果本机 JDK 版本 ≥ 21，需修改 `gradle/wrapper/gradle-wrapper.properties`，将 Gradle 版本从 7.6.6 升级到 8.5+（JDK 21 不兼容 Gradle 7.x）。详见 A.2。

---

#### A.2 下载和构建

```bash
# 1. 克隆仓库到目标目录
git clone https://github.com/Adrninistrator/java-all-call-graph-server.git
cd java-all-call-graph-server
```

```bash
# 2. 【重要】如果 JDK 版本 ≥ 21，修改 Gradle Wrapper 版本
#    编辑 gradle/wrapper/gradle-wrapper.properties，将 distributionUrl 改为：
#    distributionUrl=https\://services.gradle.org/distributions/gradle-8.5-all.zip
```

```bash
# 3. 构建可执行 JAR（Windows）
gradlew bootJar

# 或（Linux / Mac）
./gradlew bootJar
```

构建完成后，产物位置：

```
build/libs/
├── java-all-call-graph-server.jar    ← 可执行 JAR（~62MB）
├── start.bat                         ← 官方前台启动脚本
├── start.sh                          ← 官方前台启动脚本
└── conf/
    ├── application.yml               ← Spring Boot 配置
    └── log4j2.xml                    ← 日志配置
```

---

#### A.3 注册到 Claude Code

JACG 需要作为 MCP Server 注册到 Claude Code，使其工具可以被调用。

在 **用户级 MCP 配置** 中新增（`~/.claude/mcp.json`，不存在则创建）：

```json
{
  "mcpServers": {
    "jacg": {
      "type": "http",
      "url": "http://127.0.0.1:34567/mcp/sse"
    }
  }
}
```

同时在 Claude Code 的项目或用户级 `settings.local.json` 中添加工具使用权限：

```json
{
  "permissions": {
    "allow": [
      "mcp__jacg__*"
    ]
  }
}
```

执行 `/reload-plugins` 使配置生效。

---

#### A.4 一键后台启动（start-jacg.bat）

默认的 `start.bat` 会前台阻塞 PowerShell 窗口，关闭即停。以下脚本使用 `javaw` 后台启动，关闭窗口不影响服务。

在 JACG 项目根目录（`java-all-call-graph/`）下创建 `start-jacg.bat`：

```batch
@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set APP_NAME=java-all-call-graph-server
set SCRIPT_DIR=%~dp0

:: 切换到 JAR 所在目录
cd /d "%SCRIPT_DIR%build\libs"

:: 查找 JAR 文件
set JAR_FILE=
for %%f in ("%APP_NAME%*.jar") do (
    if not "%%f"=="%APP_NAME%-sources.jar" (
        if not "%%f"=="%APP_NAME%-javadoc.jar" (
            set JAR_FILE=%%f
        )
    )
)

if "%JAR_FILE%"=="" (
    echo [错误] 未找到 JAR 文件: %APP_NAME%.jar
    echo 请先执行构建: cd "%SCRIPT_DIR%" ^& gradlew bootJar
    pause
    exit /b 1
)

echo [JACG] JAR: %JAR_FILE%

:: JVM 参数
set JVM_OPTS=-Xms512m -Xmx2048m
set CONF_DIR=%SCRIPT_DIR%build\libs\conf

:: 输出根目录设为 build\libs
set OUTPUT_ROOT=%SCRIPT_DIR%build\libs

if not exist "%CONF_DIR%" (
    echo [警告] 配置目录不存在: %CONF_DIR%
)

:: 替换路径中的反斜杠为正斜杠
set CONF_DIR_URI=%CONF_DIR:\=/%

:: 后台启动：javaw 无控制台窗口，start "" 脱离父进程
start "" javaw %JVM_OPTS% -Djacgserver.output.root.path="%OUTPUT_ROOT%" -Dspring.config.additional-location="file:%CONF_DIR_URI%/" -Dlog4j2.configurationFile="%CONF_DIR%\log4j2.xml" -jar "%JAR_FILE%"

:: 等 2 秒确认进程启动
timeout /t 2 /nobreak >nul

:: 检查 java 进程
tasklist /FI "IMAGENAME eq javaw.exe" /FI "WINDOWTITLE eq *%APP_NAME%*" 2>nul | find /i "javaw.exe" >nul
if errorlevel 1 (
    tasklist /FI "IMAGENAME eq javaw.exe" 2>nul | find /i "javaw.exe" >nul
    if errorlevel 1 (
        echo [警告] javaw 进程未检测到，请检查 build/libs/log 目录下的日志
    ) else (
        echo [JACG] 已后台启动
    )
) else (
    echo [JACG] 已后台启动
)

echo [JACG] 端口: 34567  端点: http://127.0.0.1:34567/mcp/sse
echo [JACG] 停止服务: 双击 stop-jacg.bat
exit /b 0
```

**原理**：
- `javaw` 替代 `java` — 不显示控制台窗口
- `start ""` — 将进程从当前 shell 剥离，关闭 PowerShell 不影响服务
- 进程以 `javaw.exe` 名常驻后台，类似 Chrome 的工作方式

---

#### A.5 一键清理后台进程（stop-jacg.bat）

在 JACG 项目根目录下创建 `stop-jacg.bat`：

```batch
@echo off
chcp 65001 >nul
echo [JACG] 正在查找 java-all-call-graph-server 进程...

:: 查找监听 34567 端口的 PID
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":34567" ^| findstr "LISTENING"') do (
    set PID=%%a
    goto :found
)

echo [JACG] 未发现监听 34567 端口的进程
goto :force

:found
echo [JACG] 发现进程 PID: %PID%，正在终止...
taskkill /PID %PID% /F >nul 2>&1
if errorlevel 1 (
    echo [JACG] 终止 PID %PID% 失败，尝试强制终止所有 javaw 进程...
    goto :force
)
echo [JACG] 进程 PID %PID% 已终止
goto :end

:force
:: 兜底：杀掉所有 javaw.exe 进程（会同时终止其他 Java 桌面程序）
echo [JACG] 终止所有 javaw.exe 后台进程...
taskkill /F /IM javaw.exe >nul 2>&1
if errorlevel 1 (
    echo [JACG] 没有运行中的 javaw 进程
) else (
    echo [JACG] 已终止所有 javaw 进程
)

:end
exit /b 0
```

**原理**：
- `netstat -ano | findstr ":34567"` → 精确找到占用 34567 端口的 PID
- `taskkill /PID` → 精确终止，不误杀其他进程
- 找不到端口时 → `taskkill /IM javaw.exe` 兜底（适用于端口未正常释放的极端情况）

---

#### A.6 在 TIA 中启用

编辑 TIA 项目根目录下的 `analyzers.conf.json`，将 `jacg` 的 `enabled` 设为 `true`：

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 调用链分析",
      "fileExtensions": [".java"],
      "enabled": true,                   // ← 改为 true
      "description": "基于 java-all-call-graph-server 的 Java 方法调用链分析",
      "connection": {
        "transport": "http",
        "url": "http://127.0.0.1:34567/mcp/sse"
      }
    }
  ]
}
```

不需要重启 TIA，下次 `impact_analysis` 调用时自动检测并连接。

---

#### A.7 验证是否生效

**步骤 1**：确认 JACG 服务已启动

```bash
# 检查 34567 端口是否在监听
netstat -ano | findstr ":34567"
```

**步骤 2**：调用 Claude Code MCP 工具确认

```
# 在 Claude Code 中查看 JACG 提供的工具
/plugin list    # 或通过 MCP 工具发现机制确认 jacg 已连接
```

**步骤 3**：执行含 `.java` 文件的影响分析，观察输出中的分析器状态：

```
📦 my-backend  (abc123 → def456)
   🧠 Java 调用链分析 [jacg]: 3 个语义分析项   ← JACG 已生效
   ⚠️ Java 调用链分析 [jacg]: 不可用，已降级   ← JACG 未启动或未启用
```

---

#### A.8 JACG 核心能力速览

| 能力 | 说明 |
|------|------|
| 方法调用链生成 | 从指定方法向上/向下生成完整调用链（树形） |
| Spring Bean 注入解析 | 自动识别接口→实现类的多态关系 |
| MyBatis SQL 关联 | 调用链中标注 Mapper 方法操作的数据库表名 |
| 代码影响范围评估 | 修改方法后，找出所有受影响的上下游调用方 |
| 跨模块间接调用追踪 | 递归遍历完整的调用链，不遗漏跨模块依赖 |

更多用法参考 JACG 的 [MCP_SERVER.md](https://github.com/Adrninistrator/java-all-call-graph-server/blob/master/MCP_SERVER.md)。

---

#### A.9 迁移部署清单

以下是将 JACG 完整迁移到另一台机器所需的所有操作：

| # | 操作 | 命令/文件 |
|---|------|---------|
| 1 | 安装 JDK 8+ | 系统包管理器 或 [Adoptium](https://adoptium.net/) |
| 2 | 拷贝 JACG 目录 | 复制整个 `java-all-call-graph/` 文件夹 |
| 3 | 如果 JDK ≥ 21 | 修改 `gradle-wrapper.properties`（见 A.2 步骤 2） |
| 4 | 构建 JAR | `gradlew bootJar` |
| 5 | 注册 MCP 配置 | 写入 `~/.claude/mcp.json`（见 A.3） |
| 6 | 添加工具权限 | `settings.local.json` 中加 `mcp__jacg__*` |
| 7 | 启动服务 | 双击 `start-jacg.bat` |
| 8 | 验证 | `netstat -ano \| findstr ":34567"` |

> 💡 `start-jacg.bat` 和 `stop-jacg.bat` 是纯文本批处理文件，可以直接复制到新机器使用，无需修改。

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

TIA 有 5 个配置文件，配置/状态分离：

| 文件 | 类型 | 用途 |
|------|------|------|
| `monitors.conf.json` | 用户手写 | 仓库监控配置 |
| `monitors.json` | 程序维护 | 水位状态（自动生成） |
| `impact-rules.conf.json` | 用户手写 | 影响分析规则 |
| `analyzers.conf.json` | 用户手写 | 下游分析器注册（Phase 5a 新增） |
| `server.conf.json` | 用户手写 | HTTP 模式安全配置 |

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
  "contactInfo": "l30026134",
  "apiKeys": []    // TIA-init 自动签发，无需手写
}
```

### analyzers.conf.json（Phase 5a 新增）

分析器注册表，声明 TIA 编织层可调用的下游 MCP 分析器。新分析器只需在此文件中添加一行配置即可横向扩展。

```jsonc
{
  "analyzers": [
    {
      "id": "jacg",
      "name": "Java 调用链分析",
      "fileExtensions": [".java"],       // 匹配的文件扩展名
      "enabled": false,                   // 是否启用（需先安装 JACG MCP Server）
      "description": "基于 java-all-call-graph-server 的 Java 方法调用链分析",
      "connection": {
        "transport": "http",              // stdio | http
        "url": "http://127.0.0.1:34567/mcp/sse"
      }
    }
  ]
}
```

**字段说明**：

| 字段 | 说明 |
|------|------|
| `id` | 分析器唯一 ID（注册表工厂用此值查找适配器） |
| `fileExtensions` | 匹配的文件扩展名（含 `.` 前缀），命中后触发该分析器 |
| `enabled` | `true` 启用 / `false` 跳过 |
| `connection.transport` | `"stdio"` — 启动命令；`"http"` — SSE/HTTP URL |
| `connection.url` | HTTP 模式下的 MCP 端点地址 |

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
<summary><b>如何接入 Java 调用链分析（JACG）？</b></summary>

详见 [附录 A：安装和配置 JACG 分析器](#附录-a安装和配置-jacg-分析器)。

快捷步骤：
1. `git clone` + `gradlew bootJar` 构建 JACG
2. 启动 MCP 服务（默认端口 34567）
3. 在 TIA 的 `analyzers.conf.json` 中将 jacg 的 `enabled` 设为 `true`

</details>

<details>
<summary><b>怎么添加新的分析器（SQL/性能/Python）？</b></summary>

3 步横向扩展：
1. 实现 `AnalyzerAdapter` 接口（`src/analyzer-registry/types.ts`）
2. 在 `registry.ts` 的 `ADAPTER_FACTORIES` 中注册
3. 在 `analyzers.conf.json` 中添加配置并启用

TIA 编织层自动完成匹配→调用→容错的全流程。

</details>

<details>
<summary><b>analysis 结果中的 🧠 和 ⚠️ 是什么意思？</b></summary>

- 🧠 `分析器名 [ID]`: 该分析器可用，正在执行语义级分析
- ⚠️ `分析器名 [ID]: 不可用，已降级为文件匹配`: 该分析器未安装或未启用，改走文件级 glob 匹配兜底

</details>

<details>
<summary><b>支持哪些 AI 编程框架？</b></summary>

| 框架 | MCP 配置 | 命令文件 |
|------|---------|---------|
| Claude Code | `.claude/settings.local.json` | `.claude/commands/` |
| OpenCode | `.opencode.json` | `.opencode/commands/` |
| Codex (OpenAI) | `.codex/config.toml` | `.agents/skills/` |

</details>
