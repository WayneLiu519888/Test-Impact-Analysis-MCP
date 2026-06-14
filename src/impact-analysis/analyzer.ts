/**
 * Impact Analysis 核心匹配引擎
 *
 * 给定变更文件列表 + 规则配置，返回受影响测试模块的聚合结果。
 *
 * 匹配策略:
 *   1. 精确文件名匹配 → 95%
 *   2. 目录级别 glob 匹配 (src/foo/**) → 70%
 *   3. 通配符匹配 (src/**) → 45%
 *   4. 自动推断 → 30%
 *
 * 零外部依赖 — glob 转正则自实现。
 */

import type {
  ImpactRule,
  ImpactConfigFile,
  ImpactMatch,
  ImpactModule,
  RepoImpactResult,
  RiskLevel,
  Confidence,
} from "./types.js";

// ═══════════════════════════════════════════════════════
// Glob → Regex
// ═══════════════════════════════════════════════════════

/**
 * 将简单的 glob 模式转换为正则表达式。
 *
 * 支持语法:
 *   **    → 匹配任意层级目录
 *   *     → 匹配单层内的任意字符（不含 /）
 *   ?     → 匹配单个字符（不含 /）
 *   {a,b} → 匹配 a 或 b
 *
 * @param pattern  glob 模式，如 "src/auth/**"
 * @param anchor   是否精确匹配整行 (^...$)
 */
function globToRegex(pattern: string, anchor = true): RegExp {
  // 转义正则特殊字符。注意：{} 不逃逸——它们先被花括号展开处理。
  let re = pattern
    .replace(/[.+^$()|[\]\\]/g, "\\$&")
    // ** → 匹配任意字符（含 /）
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    // * → 匹配单层（不含 /）
    .replace(/\*/g, "[^/]*")
    // ? → 单字符
    .replace(/\?/g, "[^/]")
    // {a,b} → (a|b) — 必须在 ** 展开之后
    .replace(/\{([^}]+)\}/g, (_, group) => `(${group.replace(/,/g, "|")})`)
    // 恢复 **
    .replace(/<<<GLOBSTAR>>>/g, ".*");

  return new RegExp(anchor ? `^${re}$` : re);
}

// ═══════════════════════════════════════════════════════
// 匹配引擎
// ═══════════════════════════════════════════════════════

/**
 * 对单个文件执行规则匹配，返回所有匹配（含置信度）。
 */
function matchFile(
  filePath: string,
  rules: ImpactRule[]
): ImpactMatch[] {
  const results: ImpactMatch[] = [];

  for (const rule of rules) {
    for (const pattern of rule.filePatterns) {
      const regex = globToRegex(pattern);

      if (regex.test(filePath)) {
        // 计算置信度
        const confidence = calcConfidence(filePath, pattern);

        for (const testPath of rule.testPaths) {
          results.push({
            ruleId: rule.id,
            ruleName: rule.name,
            changedFile: filePath,
            testPath,
            confidence,
            matchType: getMatchType(filePath, pattern),
          });
        }
      }
    }
  }

  return results;
}

/**
 * 计算匹配置信度。
 */
function calcConfidence(filePath: string, pattern: string): Confidence {
  // 精确文件名匹配（无通配符）→ 95%
  if (!pattern.includes("*") && !pattern.includes("?")) {
    return 95;
  }

  // 目录级别匹配：pattern 以 ** 结尾，且 file 在 pattern 的同级目录下
  if (pattern.endsWith("/**")) {
    const dir = pattern.slice(0, -3); // e.g. "src/auth"
    const parent = filePath.substring(0, filePath.lastIndexOf("/"));
    if (parent === dir) {
      return 70;
    }
  }

  // 单层通配：pattern 含 *.ts / *.js 等
  if (pattern.includes("*.") && !pattern.includes("**")) {
    const dir = pattern.substring(0, pattern.lastIndexOf("/"));
    const parent = filePath.substring(0, filePath.lastIndexOf("/"));
    if (dir === parent) {
      return 70;
    }
  }

  // 剩下的通配符场景（含 ** 跨目录）→ 45%
  return 45;
}

/** 返回匹配类型描述 */
function getMatchType(
  _filePath: string,
  pattern: string
): ImpactMatch["matchType"] {
  if (!pattern.includes("*") && !pattern.includes("?")) return "exact";
  if (pattern.endsWith("/**")) return "directory";
  if (pattern.includes("**")) return "wildcard";
  return "directory";
}

// ═══════════════════════════════════════════════════════
// 自动推断
// ═══════════════════════════════════════════════════════

/**
 * 根据 source→test 映射自动推断测试路径。
 *
 * 例如: src/auth/login.ts + {"src/": "tests/"} → tests/auth/login.test.ts
 */
function autoInfer(
  filePath: string,
  sourceToTestMapping: Record<string, string>
): string[] {
  const results: string[] = [];
  for (const [srcPrefix, testPrefix] of Object.entries(sourceToTestMapping)) {
    if (filePath.startsWith(srcPrefix)) {
      const relative = filePath.slice(srcPrefix.length);
      const withoutExt = relative.replace(/\.(ts|tsx|js|jsx)$/, "");
      // 生成常见测试文件名
      results.push(
        `${testPrefix}${withoutExt}.test.ts`,
        `${testPrefix}${withoutExt}.spec.ts`,
        `${testPrefix}${withoutExt}Test.ts`,
      );
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════
// 聚合
// ═══════════════════════════════════════════════════════

/**
 * 将匹配结果聚合为 ImpactModule 列表。
 * 同一 rule 的多个 testPath 合并；自动推断的单独分组。
 */
function aggregateMatches(matches: ImpactMatch[]): ImpactModule[] {
  const moduleMap = new Map<string, ImpactModule>();

  for (const m of matches) {
    const key = m.ruleId;
    const existing = moduleMap.get(key);

    if (existing) {
      // 合并
      if (!existing.testPaths.includes(m.testPath)) {
        existing.testPaths.push(m.testPath);
      }
      if (!existing.changedFiles.includes(m.changedFile)) {
        existing.changedFiles.push(m.changedFile);
      }
      existing.confidence = Math.max(existing.confidence, m.confidence);
    } else {
      moduleMap.set(key, {
        ruleId: m.ruleId,
        name: m.ruleName,
        riskLevel: "medium", // 会被后续修正
        testPaths: [m.testPath],
        changedFiles: [m.changedFile],
        confidence: m.confidence,
      });
    }
  }

  return Array.from(moduleMap.values());
}

/**
 * 将规则中的 riskLevel 合并到聚合结果。
 */
function applyRiskLevels(
  modules: ImpactModule[],
  rules: ImpactRule[]
): ImpactModule[] {
  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  return modules.map((mod) => ({
    ...mod,
    riskLevel: ruleMap.get(mod.ruleId)?.riskLevel ?? "medium",
  }));
}

// ═══════════════════════════════════════════════════════
// 对外接口
// ═══════════════════════════════════════════════════════

/**
 * 执行完整的影响分析。
 *
 * @param changedFiles  变更的文件路径列表
 * @param config        影响分析规则配置
 * @returns 仓库级影响分析结果
 */
export function analyzeImpact(
  repoName: string,
  fromSha: string,
  toSha: string,
  changedFiles: string[],
  config: ImpactConfigFile
): RepoImpactResult {
  // 1. 规则匹配
  const ruleMatches: ImpactMatch[] = [];
  for (const file of changedFiles) {
    ruleMatches.push(...matchFile(file, config.rules));
  }

  // 2. 自动推断（对未命中规则的文件）
  if (config.autoInfer.enabled) {
    const matchedFiles = new Set(ruleMatches.map((m) => m.changedFile));
    for (const file of changedFiles) {
      if (!matchedFiles.has(file)) {
        const inferred = autoInfer(file, config.autoInfer.sourceToTestMapping);
        for (const testPath of inferred) {
          ruleMatches.push({
            ruleId: "auto-inferred",
            ruleName: "自动推断",
            changedFile: file,
            testPath,
            confidence: 30,
            matchType: "inferred",
          });
        }
      }
    }
  }

  // 3. 先聚合（收集所有 changedFiles），再模块内去重 testPaths
  const modules = aggregateMatches(ruleMatches);

  // 4. 应用风险等级 + 排序
  const result = applyRiskLevels(modules, config.rules);
  result.sort((a, b) => b.confidence - a.confidence);

  return {
    repoName,
    fromSha,
    toSha,
    changedFiles,
    impactedModules: result,
    matches: ruleMatches,
  };
}

// ═══════════════════════════════════════════════════════
// 导出匹配工具（供测试用）
// ═══════════════════════════════════════════════════════

export { globToRegex, matchFile, autoInfer, calcConfidence };
