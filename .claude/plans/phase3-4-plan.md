# Phase 3 + Phase 4 实现计划

**Phase 3**: Test Recommendation — 基于变更智能推荐测试用例  
**Phase 4**: Risk Assessment — 变更风险量化与报告  
**复用基础**: Phase 2 `analyzeImpact()` + `RepoImpactResult`  
**新增 MCP 工具**: 2 个（总数升至 6）  
**复杂度**: Small（每个工具 ~80 行核心逻辑 + 计分函数）

---

## 设计决策：与 Phase 2 是否合并

| 方案 | 优点 | 缺点 |
|------|------|------|
| 拆成独立目录 | 模块边界清晰 | 3 个目录各 2-3 文件，碎片化 |
| **放 impact-analysis/ 下** | 共享类型、analyzer 复用 | 目录稍大（5-6 文件） |

**决策**: 放 `impact-analysis/` 下。三个功能（影响分析 / 测试推荐 / 风险评估）共享同一数据源，放在一起更自然。新增文件：

```
src/impact-analysis/
  ├── types.ts           ← 新增 Phase 3/4 类型
  ├── state.ts           ← 不变
  ├── analyzer.ts        ← 不变（analyzeImpact 供 Phase 3/4 复用）
  ├── handler.ts         ← 不变
  ├── recommendation.ts  ← Phase 3: 测试推荐引擎
  ├── risk-scorer.ts     ← Phase 4: 风险评分引擎
  └── risk-handler.ts    ← Phase 4: risk_assessment 工具处理器
```

---

## Phase 3: test_recommendation

### 计分公式

```
推荐分 = 风险权重 × 置信度
  风险权重: high=100, medium=50, low=20
  置信度: 0-100

排序: 按推荐分降序 + 同分按风险等级 → 置信度 → 模块名
```

### 输出结构

```
🧪 测试推荐

📦 gh-backend (abc123 → def456)  — 风险评分: 72/100

  ✅ 强烈建议 (推荐分 ≥ 7000):
    #1  tests/auth/login.test.ts         (risk=high, confidence=95%, score=9500)
    #2  tests/auth/middleware.test.ts     (risk=high, confidence=70%, score=7000)

  🟡 建议 (推荐分 ≥ 2000):
    #3  tests/db/users.test.ts           (risk=medium, confidence=70%, score=3500)

  💡 可选:
    #4  tests/utils/helper.test.ts       (risk=low, confidence=45%, score=900)

  📋 最小可行测试集 (覆盖所有高风险模块):
    npm test -- tests/auth/login.test.ts tests/auth/middleware.test.ts
```

### 新增类型

```typescript
interface RecommendationItem {
  testPath: string;
  ruleName: string;
  riskLevel: RiskLevel;
  confidence: Confidence;
  score: number; // risk_weight × confidence
}

interface TestRecommendation {
  repoName: string;
  fromSha: string;
  toSha: string;
  items: RecommendationItem[];
  minimumViableSuite: string[];  // 覆盖所有 high+medium 风险模块的最少测试
  summary: {
    strongRecommend: number;  // score ≥ 7000
    recommend: number;        // 2000 ≤ score < 7000
    optional: number;         // score < 2000
  };
}
```

---

## Phase 4: risk_assessment

### 风险评分公式

```
文件风险分:
  1 个变更文件 = 基础分 10
  每多 1 个 = +5 (上限 60)

模块风险分:
  每命中 1 个 high-risk 模块 = +20 (上限 60)
  每命中 1 个 medium-risk 模块 = +8 (上限 30)
  low-risk 模块不加分

置信度惩罚:
  平均置信度 < 50% → +10 (不确定性风险)
  平均置信度 < 30% → +20

总风险分 = min(文件风险分 + 模块风险分 + 置信度惩罚, 100)

风险等级:
  0-30:  🟢 低风险
  31-60: 🟡 中等风险
  61-85: 🟠 高风险
  86-100: 🔴 严重风险
```

### 输出结构

```
⚠️ 风险评估报告

📦 gh-backend (abc123 → def456)
   变更文件: 7 个  受影响模块: 3 个  平均置信度: 70%

   风险评分: 72/100  🟠 高风险

   风险分解:
     📁 文件变更: 7 个文件 → 40/60 分
     🎯 影响模块: high=2, medium=1 → 28/40 分
     🔍 置信度: 平均 70% → 0 惩罚

   风险因素:
     🔴 高风险模块 "认证模块" 被触发（95% 置信度）
     🟡 "数据库层" 变更涉及 3 个文件

   建议:
     1. 优先运行 tests/auth/login.test.ts
     2. 在合并前完成代码审查
     3. 考虑灰度发布策略
```

### 新增类型

```typescript
interface RiskBreakdown {
  fileRisk: { raw: number; max: number; files: number };
  moduleRisk: { raw: number; max: number; highCount: number; mediumCount: number };
  confidencePenalty: number;
}

interface RiskAssessment {
  repoName: string;
  fromSha: string;
  toSha: string;
  score: number;
  level: "low" | "medium" | "high" | "critical";
  breakdown: RiskBreakdown;
  topRisks: string[];    // 人类可读的风险描述
  suggestions: string[]; // 缓解建议
}
```

---

## 工具 Schema（5+6）

### test_recommendation

```typescript
{
  name: "test_recommendation",
  description: "基于代码变更智能推荐测试用例执行顺序...",
  inputSchema: {
    properties: {
      name, module, from, to  // 同 impact_analysis
    },
    required: [],
  },
}
```

### risk_assessment

```typescript
{
  name: "risk_assessment",
  description: "量化代码变更风险，生成风险评分与缓解建议...",
  inputSchema: {
    properties: {
      name, module, from, to  // 同 impact_analysis
    },
    required: [],
  },
}
```

---

## 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/impact-analysis/types.ts` | 新增 Phase 3/4 类型 + 导出 |
| 新增 | `src/impact-analysis/recommendation.ts` | 测试推荐引擎 + 处理函数 |
| 新增 | `src/impact-analysis/risk-scorer.ts` | 风险评分引擎 |
| 新增 | `src/impact-analysis/risk-handler.ts` | risk_assessment 处理器 |
| 修改 | `src/tools/schemas.ts` | 新增 2 个 Tool Schema |
| 修改 | `src/tools/index.ts` | 路由分发新增 2 个 case |
| 新增 | `src/tests/recommendation.test.ts` | Phase 3 测试 |
| 新增 | `src/tests/risk-assessment.test.ts` | Phase 4 测试 |

---

## 执行顺序

```
Step 1: types.ts 新增 Phase 3/4 类型     (5 min)
Step 2: recommendation.ts 引擎+处理器     (30 min)
Step 3: risk-scorer.ts 评分引擎           (20 min)
Step 4: risk-handler.ts 处理器            (20 min)
Step 5: schemas.ts + index.ts 注册       (10 min)
Step 6: 单元测试                         (30 min)
Step 7: npx tsc --noEmit + npm test      (验证)
```
