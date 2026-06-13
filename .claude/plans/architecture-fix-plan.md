# 架构审查修复方案

**来源审查报告**: `TIA-架构审查报告-2026-06-13.md`  
**修复日期**: 2026-06-13  
**整体复杂度**: Medium（共 4 个文件变更 + 1 个新增目录）

---

## 当前状态扫描

| 优先级 | 问题 | 状态 | 说明 |
|--------|------|------|------|
| P0 | 拆分 `tools.ts` | ✅ 已完成 | 已拆为 `src/tools/{index,schemas,helpers,tia-init,repo-monitor,repo-clone}.ts` |
| P1 | 状态读写缓存 | ❌ 待修复 | `state.ts` 每次循环都 `readFileSync` + `JSON.parse` |
| P1 | 单元测试 | ❌ 待修复 | 无测试目录，但纯函数不需要 mock |
| P2 | Magic string 常量化 | ❌ 待修复 | `helpers.ts` 有类型但未导出，`index.ts` 用字符串字面量 |
| P3 | Express 类型 | ❌ 待修复 | `index.ts` 内联了 `ExpressReq` / `ExpressRes` |

---

## 修复 1: P2 — Magic string 常量化 (首先做，影响面最小)

### 改什么

**文件**: `src/tools/helpers.ts`

将私有的 `TransportMode` 类型改为导出，添加常量值：

```typescript
// 改为：
export type TransportMode = "stdio" | "http";

/** Transport 模式常量，避免散落字符串字面量 */
export const TRANSPORT = {
  STDIO: "stdio" as const,
  HTTP: "http" as const,
} as const;
```

**文件**: `src/index.ts`

将 4 处字符串字面量替换为常量引用：
- `line 78`: `process.env.MCP_TRANSPORT || TRANSPORT.STDIO`
- `line 80`: `mode === TRANSPORT.HTTP`
- `line 90`: `setTransportMode(TRANSPORT.STDIO)`
- `line 99`: `setTransportMode(TRANSPORT.HTTP)`

```typescript
// 新增 import:
import { TOOL_SCHEMAS, handleToolCall, setTransportMode, TRANSPORT } from "./tools/index.js";
```

### 验证方式

```bash
npx tsc --noEmit
```

---

## 修复 2: P1 — 状态读写加入内存缓存

### 改什么

**文件**: `src/state.ts`

在 `loadConfig()` / `loadState()` 加入模块级缓存，基于 mtime 自动刷新：

```typescript
import { statSync } from "fs";

// 模块级缓存
let _configCache: { data: MonitorConfigFile; mtime: number } | null = null;
let _stateCache: { data: MonitorStateFile; mtime: number } | null = null;

/** 文件的最后修改时间（毫秒时间戳） */
function fileMtime(filePath: string): number {
  try { return statSync(filePath).mtimeMs; } catch { return 0; }
}

export function loadConfig(): MonitorConfigFile {
  const mtime = fileMtime(CONFIG_FILE);
  if (_configCache && _configCache.mtime === mtime) return _configCache.data;
  
  const data = safeJsonLoad<any>(CONFIG_FILE, () => ({ repositories: [] }), "monitors.conf.json");
  _configCache = { data: { baseDir: typeof data.baseDir === "string" ? data.baseDir : undefined, repositories: Array.isArray(data.repositories) ? data.repositories : [] }, mtime };
  return _configCache.data;
}

export function loadState(): MonitorStateFile {
  const mtime = fileMtime(STATE_FILE);
  if (_stateCache && _stateCache.mtime === mtime) return _stateCache.data;
  
  const data = safeJsonLoad<MonitorStateFile>(STATE_FILE, () => ({}), "monitors.json");
  _stateCache = { data, mtime };
  return _stateCache.data;
}
```

同时在写操作后刷新缓存（写穿策略）：
- `saveConfig()` → 调用后 `_configCache = null`
- `saveState()` → 调用后 `_stateCache = null`
- `updateWatermark()` → 调用 `saveState` 后（已有）缓存自动失效

### 验证方式

```bash
npx tsc --noEmit
# 逻辑验证：多次调用 loadConfig() 应命中缓存（同一 mtime 不重复读文件）
```

---

## 修复 3: P3 — Express 类型改为 import

### 决策

`ExpressReq` / `ExpressRes` 是**有意为之**的内联类型（避免 `@types/express` 依赖），不是反模式。改为加注释说明意图即可。

### 改什么

**文件**: `src/index.ts` line 29-38

```typescript
/**
 * Express 请求/响应的最小类型声明。
 * 刻意不使用 @types/express：避免引入额外依赖，且仅需两个接口。
 * 如需更完整的类型，可安装 @types/express 后替换为 import type { Request, Response } from "express"。
 */
interface ExpressReq {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  body?: unknown;
}
interface ExpressRes {
  status(code: number): { json(data: unknown): void };
  json(data: unknown): void;
}
```

### 验证方式

```bash
npx tsc --noEmit
```

---

## 修复 4: P1 — 为纯函数加单元测试

### 可独立测试的纯函数

| 函数 | 所在文件 | 测试重点 |
|------|---------|---------|
| `parseGitUrl()` | `state.ts` | 3 种 URL 格式解析 + 异常路径 |
| `ip4ToUint()` | `security.ts` | 合法 IP / 非法值 / 边界 |
| `isIpInWhitelist()` | `security.ts` | 精确匹配 / CIDR 子网 / 不匹配 |
| `sha256()` | `security.ts` | 确定性输出 |
| `validateAgentType()` | `security.ts` | 合法枚举 / 大小写容错 / 非法值 |

### 工具选择

使用 **Node.js 内置 `node:test`** + `node:assert`（零依赖）：

```bash
node --import tsx --test src/tests/*.test.ts
```

### 新增文件

```
src/tests/
├── state.test.ts         ← parseGitUrl 测试
├── security.test.ts      ← ip4ToUint / isIpInWhitelist / sha256 / validateAgentType 测试
└── schemas.test.ts       ← TOOL_SCHEMAS 结构校验（3 个 tool 名称/action 枚举正确）
```

### package.json 新增脚本

```json
{
  "scripts": {
    "start": "npx tsx src/index.ts",
    "dev": "npx tsx --watch src/index.ts",
    "test": "node --import tsx --test src/tests/*.test.ts"     // ← 新增
  }
}
```

### 验证方式

```bash
npm test
```

---

## 执行顺序

```
Step 1: P2 Magic string 常量化    (5 min, 2 文件)
         ↓
Step 2: P3 Express 类型注释       (3 min, 1 文件)
         ↓
Step 3: P1 状态读写缓存          (15 min, 1 文件)
         ↓
Step 4: P1 单元测试              (30 min, 4 文件新增)
         ↓
Step 5: npx tsc --noEmit + npm test 验证
```

## 影响范围汇总

| 步骤 | 文件 | 操作 | 风险 |
|------|------|------|------|
| P2 | `src/tools/helpers.ts` | 导出 TRANSPORT 常量 | 无（纯新增导出） |
| P2 | `src/index.ts` | 替换 4 处字符串字面量 | 极低（语义不变） |
| P3 | `src/index.ts` | 改善注释 | 无 |
| P1 | `src/state.ts` | add mtime 缓存 | 低（缓存层在现有函数内部） |
| P1 | `src/tests/*.ts` | 新增 3 个测试文件 | 无（不修改生产代码） |
| P1 | `package.json` | 新增 test 脚本 | 无 |
