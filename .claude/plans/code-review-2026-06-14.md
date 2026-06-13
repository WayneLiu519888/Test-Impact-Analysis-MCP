# TIA 项目 TypeScript 代码审查报告

**审查日期**: 2026-06-14 | **审查范围**: 18 个核心源文件 | **TypeScript 编译**: `tsc --noEmit` 通过

---

## 总体评价

项目整体代码质量**良好**，架构分层清晰，安全设计审慎。在类型安全性和部分异常处理方面存在可改进点。

---

## HIGH — 4 个问题

### H1. 多处 `as any` 类型断言绕过联合类型窄化
- **文件**: `repo-monitor.ts:39`, `generic.ts:61,68`, `index.ts:153,174`
- **描述**: `AuthConfig` 可辨识联合类型被 `as any` 强制绕过，`ExpressReq/ExpressRes` 手写接口与 SDK 类型不兼容
- **修复**: 使用 `switch` 语句利用 TS 控制流窄化；安装 `@types/express` 消除手写类型桥接

### H2. `verifyApiKey` 中 `timingSafeEqual` 被预比较架空
- **文件**: `security.ts:274-294`
- **描述**: 字符串全等比较命中的情况下 `timingSafeEqual` 恒返回 true，成为冗余代码
- **修复**: 简化为纯 `entry.hash === keyHash` 比较（SHA-256 第二原像抗性足够），或移除预比较对所有 entry 执行常量时间比较

### H3. `getCommitsBetween` URL 参数拼接可能产生重复参数
- **文件**: `generic.ts:197-198`
- **描述**: 若 `apiTemplate` 已含 `per_page`，追加 `&per_page=100` 造成重复参数，多数框架取第一个值导致数据不完整
- **修复**: 使用 `URLSearchParams.set()` 确保参数被正确覆盖

### H4. `repo_clone` 中 `mr.id` 未校验直接用于 `rmSync` 路径
- **文件**: `repo-clone.ts:234-248`
- **描述**: `mr.id` 来自外部 API，若含路径遍历字符可导致 `rmSync` 删除非预期目录
- **修复**: 添加 `^[a-zA-Z0-9_-]+$` 白名单校验

---

## MEDIUM — 8 个问题

| ID | 位置 | 描述 | 修复建议 |
|----|------|------|---------|
| M1 | `tia-init.ts:24` | `readFileSync` 同步阻塞事件循环 | 改用异步读取或预读缓存 |
| M2 | `helpers.ts:103-107` | `throttleTouchApiKey` 空 catch 静默吞异常 | 至少输出 `console.error` |
| M3 | `state.ts:46-52` | mtime 缓存不支持多进程 TOCTOU | 文档注明限制 |
| M4 | `helpers.ts:46-49` | 模块级可变状态 `_transportMode` | 添加锁定防护 |
| M5 | `state.ts` + `impact-analysis/state.ts` | `safeJsonLoad` 重复定义 | 提取到共享模块 |
| M6 | `generic.ts:413-464` | `getDiffFiles` 在 generic 平台不可靠 | 文档说明局限性，增加 local fallback |
| M7 | `analyzer.ts:286-299` | `dedupByTestPath` 定义但未调用 | 删除或添加注释说明 |
| M8 | 遍布多处 | 日志用 `console.error` 无级别区分 | 引入轻量日志库 |

---

## LOW — 5 个问题

| ID | 位置 | 描述 |
|----|------|------|
| L1 | `repo-monitor.ts:39` | Token 前缀 8 位暴露过多 |
| L2 | `state.ts:76-105` | `parseGitUrl` 抛错可导致 `getMonitorEntries` 崩溃 |
| L3 | `generate-api-key.ts:53` | API Key 通过 `console.log` 泄漏风险 |
| L4 | `repo-monitor.ts:94` | CJK 字符 `padEnd` 对齐错位 |
| L5 | `repo-clone.ts:201,248` | cleanup `rmSync` 失败静默吞异常 |

---

## 架构亮点

1. 命令注入防护到位 — 全线使用 `execFile` 而非 `exec`
2. 安全层设计审慎 — SHA-256 哈希、CIDR 白名单、Origin 校验、AsyncLocalStorage
3. 配置与状态分离清晰
4. 错误容忍策略一致（批量操作单点失败不阻塞）
5. 文件权限安全意识（`mode: 0o600`）
6. TypeScript strict 模式零编译错误
7. 零硬编码密钥
