# Phase 2: Impact Analysis 实现计划

**目标**: 代码变更 → 受影响测试用例分析  
**新增 MCP 工具**: `impact_analysis`（第 4 个工具）  
**复杂度**: Medium | **预估工时**: 4-6h

---

## 架构设计

```
现有入口
  index.ts  ← 注册新工具 TOOL_SCHEMAS
      │
src/impact-analysis/         ← 新模块目录
  ├── types.ts               ← ImpactRule / ImpactResult / ImpactConfigFile
  ├── state.ts               ← impact-rules.conf.json 读写
  ├── analyzer.ts            ← diff 分析 + 规则匹配引擎
  └── handler.ts             ← MCP 工具处理函数
      │
  └── tests/
      └── impact-analysis.test.ts  ← 单元测试
```

### 现有基础设施复用

| 已有 | 位置 | Phase 2 用法 |
|------|------|-------------|
| `getAdapter()` | `helpers.ts` | 新增 `getDiffFiles()` 方法获取变更文件列表 |
| `getMonitorEntries()` | `state.ts` | 获取仓库信息（URL、分支、水位） |
| `resolveRepos()` | `helpers.ts` | 按 name/module 筛选仓库 |
| `ok()` / `requireString()` | `helpers.ts` | 响应辅助、参数校验 |
| `getCommitsBetween()` | 适配器 | 缩小 diff 范围到具体 commit 区间 |

---

## 新 MCP 工具: `impact_analysis`

### Schema

```typescript
{
  name: "impact_analysis",
  description: "分析代码变更对测试用例的影响...",
  inputSchema: {
    type: "object",
    properties: {
      name:   { type: "string", description: "仓库别名（与 module 二选一）" },
      module: { type: "string", description: "模块名（与 name 二选一）" },
      from:   { type: "string", description: "起始 SHA（不传=当前水位）" },
      to:     { type: "string", description: "目标 SHA（不传=远程 HEAD）" },
      diffMode: { type: "string", enum: ["files", "detailed"], description: "files=仅文件列表, detailed=含diff片段" },
    },
    required: [],
  },
}
```

### 行为

1. 解析仓库范围（name/module 二选一，都不传=全部仓库）
2. 对每个仓库：
   a. `from` 不传 → 使用 `repo.lastSha`（当前水位）
   b. `to` 不传 → 调用 `adapter.getHeadSha()` 获取远程 HEAD
   c. 调用 `adapter.getDiffFiles(repo, from, to)` 获取变更文件列表
   d. 加载 `impact-rules.conf.json` 的规则
   e. 逐文件匹配规则 → 汇总受影响的测试模块
3. 返回格式化的影响分析报告

### 输出格式

```
🔬 影响分析结果

📦 gh-backend (3 个文件变更)
   变更文件:
     src/auth/login.ts
     src/database/users.ts
     src/middleware/ratelimit.ts

   🎯 受影响的测试模块:
     🔴 高 | 用户认证模块
         测试: tests/auth/login.test.ts, tests/e2e/login.spec.ts
         原因: src/auth/login.ts 变更
         置信度: 95%

     🟡 中 | 数据库访问层
         测试: tests/db/users.test.ts
         原因: src/database/users.ts 变更
         置信度: 70%

     🟢 低 | 中间件单元测试
         测试: tests/middleware/rate-limit.test.ts
         原因: src/middleware/ratelimit.ts 变更
         置信度: 45%

📊 汇总:
   仓库数: 1   变更文件: 3   受影响测试模块: 3
   建议运行: tests/auth/login.test.ts, tests/db/users.test.ts, ...
```

---

## 适配器新增方法: `getDiffFiles`

```typescript
// platforms/types.ts 新增
getDiffFiles?(
  repo: MonitorEntry,
  base: string,
  head: string
): Promise<string[]>;  // 返回变更文件路径数组
```

### 三平台实现

| 平台 | 方式 |
|------|------|
| `github` | `GET /repos/:owner/:repo/compare/{base}...{head}` → 提取 `files[].filename` |
| `local` | `git diff --name-only {base}...{head}` |
| `generic` | 同 `getCommitsBetween` 的 API，额外收集每个 commit 的 `files` 字段（GitLab 格式自带）|

---

## 配置文件: `impact-rules.conf.json`

```jsonc
{
  "rules": [
    {
      "id": "auth-module",
      "name": "用户认证模块",
      "description": "登录、注册、Token 刷新相关",
      "filePatterns": [
        "src/auth/**",
        "src/login/**",
        "src/middleware/auth*.ts"
      ],
      "testPaths": [
        "tests/auth/login.test.ts",
        "tests/auth/register.test.ts",
        "tests/e2e/login.spec.ts"
      ],
      "riskLevel": "high"
    },
    {
      "id": "database-layer",
      "name": "数据库访问层",
      "filePatterns": ["src/database/**", "src/models/**/*.ts"],
      "testPaths": ["tests/db/"],
      "riskLevel": "medium"
    }
  ],
  // 默认规则：未匹配到任何规则的变更文件，按路径自动推断
  "autoInfer": {
    "enabled": true,
    // src/xxx/ → tests/xxx/
    "sourceToTestMapping": { "src/": "tests/" }
  }
}
```

---

## 规则匹配引擎

### 匹配逻辑

```
对每个变更文件:
  1. 遍历所有 rules，用 minimatch 匹配 filePatterns
  2. 命中规则 → 收集该规则的 testPaths，记录置信度：
     - 精确文件名匹配 → 95%
     - 目录级别匹配 → 70%
     - 上级目录通配 → 45%
  3. 未命中 → autoInfer.enabled=true 时自动推断测试路径（置信度 30%）
  4. 去重合并同一个 testPath 的多条匹配（取最高置信度）
```

### 置信度计算

| 匹配方式 | 置信度 | 说明 |
|----------|--------|------|
| 精确文件匹配 | 95% | `src/auth/login.ts` 匹配 `src/auth/login.ts` |
| 同级目录匹配 | 70% | `src/auth/login.ts` 匹配 `src/auth/**` |
| 上级目录匹配 | 45% | `src/auth/login.ts` 匹配 `src/**` |
| 自动推断 | 30% | `src/foo/bar.ts` → 推断 `tests/foo/bar.test.ts` |

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `src/impact-analysis/types.ts` | ImpactRule / ImpactResult 类型定义 |
| 新增 | `src/impact-analysis/state.ts` | impact-rules.conf.json 读写 + 校验 |
| 新增 | `src/impact-analysis/analyzer.ts` | 核心匹配引擎 |
| 新增 | `src/impact-analysis/handler.ts` | MCP 工具处理函数 |
| 新增 | `src/tests/impact-analysis.test.ts` | 匹配引擎 + handler 测试 |
| 修改 | `src/tools/schemas.ts` | 新增 impact_analysis 的 Schema |
| 修改 | `src/tools/index.ts` | 路由分发新增 case "impact_analysis" |
| 修改 | `src/platforms/types.ts` | PlatformAdapter 新增 getDiffFiles 可选方法 |
| 修改 | `src/platforms/github.ts` | 实现 getDiffFiles |
| 修改 | `src/platforms/local.ts` | 实现 getDiffFiles |
| 修改 | `src/platforms/generic.ts` | 实现 getDiffFiles（尽力而为）|

---

## 执行顺序

```
Step 1: src/impact-analysis/types.ts    (10 min, 纯类型)
         ↓
Step 2: src/impact-analysis/state.ts    (15 min, 配置读写)
         ↓
Step 3: src/impact-analysis/analyzer.ts (30 min, 核心引擎)
         ↓
Step 4: src/platforms/types.ts          (5 min, 新增接口方法)
         ↓
Step 5: src/platforms/github.ts         (15 min, getDiffFiles 实现)
Step 6: src/platforms/local.ts          (10 min, getDiffFiles 实现)
Step 7: src/platforms/generic.ts        (10 min, getDiffFiles 实现)
         ↓
Step 8: src/impact-analysis/handler.ts  (30 min, 工具处理器)
         ↓
Step 9: src/tools/schemas.ts + index.ts (10 min, 注册新工具)
         ↓
Step 10: src/tests/impact-analysis.test.ts (30 min, 测试)
         ↓
Step 11: npx tsc --noEmit + npm test   (验证)
```

---

## 风险评估

| 风险 | 可能性 | 缓解措施 |
|------|--------|---------|
| Generic 平台 diff 信息不可用 | 中 | fallback: 用 getCommitsBetween 收集文件变更 |
| 大型仓库 diff 文件过多 | 中 | 限制返回文件数（默认 500），加 `--limit` 参数 |
| 规则匹配性能 | 低 | minimatch 单文件匹配 <1ms，1000 文件 <1s |
