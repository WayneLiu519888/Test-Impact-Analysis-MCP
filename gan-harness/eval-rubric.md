# TIA 信息安全分层重构 — 评估评分矩阵

> Generator 产出物的自动化 + 人工可复核评分标准。总分 100 分。

---

## 一、设计质量（权重 0.3，满分 30 分）

### 1.1 目录分层隔离（10 分）
| 分数 | 标准 |
|------|------|
| 10 | `enterprise/` 与源码层物理隔离。`.gitignore` 双重保险（目录级 + 文件级）均生效。`git add .` 后 enterprise/ 下任何文件不会被 staged |
| 7 | 隔离存在但仅有一层防护（只排除了 enterprise/ 目录，未排除根目录敏感文件） |
| 4 | 目录创建了但 `.gitignore` 未正确配置，enterprise/ 可被 staged |
| 0 | 未创建 enterprise/ 目录 |

### 1.2 模板文件质量（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 3 个 `.example` 文件均通过 `JSON.parse` 校验。所有敏感信息已替换为 `<YOUR-*>` 占位符。每个模板包含 `_comment` 使用说明。占位符命名一致且有自解释性 |
| 7 | 模板文件 JSON 合法但占位符命名不一致，或缺少 `_comment` |
| 4 | 部分模板 JSON 格式错误，或仍残留敏感信息 |
| 0 | 模板文件缺失或全不可解析 |

### 1.3 终端输出专业性（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 所有安全相关终端输出使用 `[TIA-SEC]` 或 `[TIA]` 前缀。警告使用 `⚠️` 前缀。首次启动无 enterprise/ 时打印清晰的编辑指引（含文件路径和下一步操作说明） |
| 7 | 有提示但信息不够具体（如只说"请编辑配置文件"但未指明路径） |
| 4 | 仅有裸 console.error，无前缀无指引 |
| 0 | 无任何安全相关终端输出 |

---

## 二、独创性（权重 0.2，满分 20 分）

### 2.1 resolveConfigPath() 设计健壮性（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 3 级 fallback 全部实现（enterprise/ → 根目录 → examples/ 模板）。根目录 fallback 时打印弃用警告。模板复制时自动创建 enterprise/ 目录。三级都缺失时抛出含路径信息的明确错误 |
| 7 | 3 级 fallback 实现但缺少某一级的日志提示 |
| 4 | 仅实现了 1-2 级 fallback |
| 0 | 未实现或实现有逻辑错误 |

### 2.2 双环境兼容设计（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 代码在"无 enterprise/ 目录"和"有 enterprise/ 目录"两种状态下均能正常启动。首次克隆（无 enterprise/）→ 自动创建目录 + 从模板复制 → 打印编辑指引。已有企业配置 → 正常加载 |
| 7 | 两种状态均能启动但首次体验缺少明确指引 |
| 4 | 仅一种状态正常，另一种报错 |
| 0 | 两种状态均报错 |

---

## 三、工艺细节（权重 0.3，满分 30 分）

### 3.1 代码质量（10 分）
| 分数 | 标准 |
|------|------|
| 10 | `npx tsc --noEmit` 零新增错误。新增代码遵循项目已有风格（ESM import、JSDoc 注释、中文注释）。函数签名清晰，单一职责 |
| 7 | 编译通过但有 1-3 个 warning |
| 4 | 有新增 TypeScript 错误 |
| 0 | 代码无法编译 |

### 3.2 Hook 脚本正确性（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 5 条规则全部正确实现。每条规则独立测试均能正确拦截和放行。输出含 ANSI 颜色码。exit 1 时阻止提交，exit 0 时允许提交 |
| 7 | 5 条规则实现但有 1 条在边缘情况有误（如正则过于宽泛或过于严格） |
| 4 | 规则不全（缺少 1-2 条）或 hook 无法执行 |
| 0 | pre-commit hook 不存在或完全无法工作 |

### 3.3 边界情况覆盖（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 覆盖以下所有边界情况：① enterprise/ 被误删后重启 → 自动重建 ② examples/ 模板被误删 → resolveConfigPath 给出明确错误 ③ 根目录和 enterprise/ 同时存在配置文件 → enterprise/ 优先 ④ monitors.json 不参与 enterprise/ fallback ⑤ 模板 JSON 格式损坏时 → safeJsonLoad 兜底 |
| 7 | 覆盖 3-4 个边界情况 |
| 4 | 仅覆盖 1-2 个边界情况 |
| 0 | 无边界情况处理 |

---

## 四、功能正确性（权重 0.2，满分 20 分）

### 4.1 核心工作流（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 以下 4 个核心场景全部通过：① `npm start`（stdio 模式）正常启动 ② `MCP_TRANSPORT=http MCP_PORT=3100 npm start`（http 模式）正常启动 ③ `npm test` 全部通过（含 `state.test.ts` 中的脱敏后测试用例） ④ `bash scripts/check-sensitive-data.sh` 返回 exit 0 且状态为 clean |
| 7 | 3 个场景通过 |
| 4 | 1-2 个场景通过 |
| 0 | 全部失败 |

### 4.2 敏感信息清除（10 分）
| 分数 | 标准 |
|------|------|
| 10 | 在源码层（排除 enterprise/ + scripts/ + node_modules/ + .git/ + Repository/）中 `git grep` 搜索以下模式全部零命中：`codehub.huawei.com`、`WayneLiu`、`l[0-9]{8}`、Windows 绝对路径 |
| 7 | 有 1-2 处误报或遗留（非关键路径） |
| 4 | 有 3-5 处遗漏 |
| 0 | 大量敏感信息残留（>5 处） |

---

## 五、扣分项（一票否决/额外扣分）

| 场景 | 扣分 |
|------|------|
| 企业敏感信息被提交到 git staged（pre-commit hook 未拦截成功） | **-50 分，总分上限 50** |
| `npm start` 完全无法启动 | **-30 分** |
| 生产配置文件（enterprise/ 下的真实配置）被意外提交 | **-100 分，一票否决** |
| `resolveConfigPath()` 修改导致现有功能回归（如 repo_monitor、repo_clone 不可用） | **-20 分/每个受影响功能** |

---

## 六、评分汇总表

| 维度 | 权重 | 满分 | 得分 | 加权 |
|------|------|------|------|------|
| 设计质量 | 0.3 | 30 | /30 | |
| 独创性 | 0.2 | 20 | /20 | |
| 工艺细节 | 0.3 | 30 | /30 | |
| 功能正确性 | 0.2 | 20 | /20 | |
| **总计** | | **100** | **/100** | |
| 扣分项 | | | | |
| **最终得分** | | | **/100** | |

### 评级标准
- **90-100**: 优秀 — 可直接合并，多层防线完备
- **75-89**: 良好 — 有小瑕疵但不影响安全目标，少量修复后可合并
- **60-74**: 及格 — 核心功能可用但需改进细节
- **<60**: 不及格 — 安全问题未解决，需重新实施

---

## 七、快速测试剧本（Evaluator 可直接执行）

### 测试 1: 首次克隆体验
```bash
# 模拟首次克隆：删除 enterprise/ 目录
rm -rf enterprise/
npm start &
sleep 3
# 预期：enterprise/ 目录自动创建，.gitkeep 存在
test -f enterprise/.gitkeep && echo "PASS: enterprise/ 自动创建" || echo "FAIL"
# 停止服务器
kill %1
```

### 测试 2: .gitignore 双重保险
```bash
echo '{"test": true}' > enterprise/test.json
git add enterprise/test.json 2>&1
# 预期：文件未被 staged（.gitignore 拦截）
git status --short | grep -q "enterprise/" && echo "FAIL: enterprise/ 被 staged" || echo "PASS"
rm enterprise/test.json
```

### 测试 3: Pre-commit Hook 拦截
```bash
# 在源码层临时写入敏感信息
echo 'codehub.huawei.com' > /tmp/test-sensitive.txt
cp /tmp/test-sensitive.txt ./test-sensitive.txt
git add ./test-sensitive.txt
git commit -m "test: should be blocked" 2>&1
# 预期：提交被拦截
test $? -ne 0 && echo "PASS: 敏感信息被拦截" || echo "FAIL"
git reset HEAD ./test-sensitive.txt
rm ./test-sensitive.txt
```

### 测试 4: 自查脚本
```bash
bash scripts/check-sensitive-data.sh
# 预期：exit 0，输出 "✅ 自查通过"
test $? -eq 0 && echo "PASS: 自查通过" || echo "FAIL"
```

### 测试 5: resolveConfigPath 优先级
```bash
# 如果有 enterprise/monitors.conf.json
node --import tsx -e "
const { resolveConfigPath } = require('./src/state.js');
const p = resolveConfigPath('monitors.conf.json');
console.log(p.includes('enterprise') ? 'PASS: enterprise/ 优先' : 'FAIL: ' + p);
"
```
