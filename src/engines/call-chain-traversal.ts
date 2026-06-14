/**
 * 调用链逆向 BFS — 从全景索引计算变更影响
 *
 * 输入: 变更文件列表 + PanoramaIndex
 * 输出: CallChainImpact[] — 受影响 API/MQ/Job 端点 + 调用链路径
 *
 * 核心算法: 在预构建的 reverseCallGraph 上逆向 BFS
 *   变更方法 → 调用者 → 调用者的调用者 → ... → 端点方法(terminal)
 *   最大深度 10 层，最大结果 200 条路径
 */

import type {
  PanoramaIndex, CallChainImpact, CallChainPath,
  ImpactedEndpoint, ApiEndpoint, MqConsumer, ScheduledJob,
} from "./types.js";

interface BfsNode {
  method: string;
  chain: string[];
  depth: number;
}

/**
 * 从全景索引逆向 BFS，计算变更文件影响的 API/MQ/Job 端点。
 */
export function computeImpactsFromIndex(
  changedFiles: string[],
  index: PanoramaIndex,
  maxDepth: number = 10
): CallChainImpact {
  // 1. 文件 → 变更方法
  const changedMethods: string[] = [];
  for (const file of changedFiles) {
    const methods = index.fileToMethods[file];
    if (methods) changedMethods.push(...methods);
  }

  if (changedMethods.length === 0) {
    return {
      engineId: index.engineId,
      changedMethods: [],
      impactedApis: [],
      impactedMqs: [],
      impactedJobs: [],
      degraded: false,
    };
  }

  // 2. 构建快速查找表
  const terminalSet = new Set(index.terminalMethods);
  const apiByHandler = new Map(index.apiEndpoints.map(a => [a.handlerFqn, a]));
  const mqByHandler = new Map(index.mqConsumers.map(m => [m.handlerFqn, m]));
  const jobByHandler = new Map(index.scheduledJobs.map(j => [j.handlerFqn, j]));

  // 3. BFS 逆向遍历
  const impactMap = new Map<string, CallChainPath[]>();

  for (const startMethod of changedMethods) {
    const visited = new Set<string>();
    const queue: BfsNode[] = [{ method: startMethod, chain: [], depth: 0 }];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node.method) || node.depth > maxDepth) continue;
      visited.add(node.method);

      // 到达终端 → 记录路径，不继续向上
      if (terminalSet.has(node.method)) {
        const paths = impactMap.get(node.method) ?? [];
        paths.push({ chain: [...node.chain, node.method], depth: node.depth });
        impactMap.set(node.method, paths);
        continue;
      }

      // 继续向上遍历
      const callers = index.reverseCallGraph[node.method];
      if (!callers) continue;
      for (const caller of callers) {
        queue.push({
          method: caller,
          chain: [...node.chain, node.method],
          depth: node.depth + 1,
        });
      }
    }
  }

  // 4. 分类映射
  const impactedApis: ImpactedEndpoint<ApiEndpoint>[] = [];
  const impactedMqs: ImpactedEndpoint<MqConsumer>[] = [];
  const impactedJobs: ImpactedEndpoint<ScheduledJob>[] = [];

  for (const [handlerFqn, chains] of impactMap) {
    const api = apiByHandler.get(handlerFqn);
    if (api) { impactedApis.push({ endpoint: api, chains, sources: [index.engineId] }); continue; }
    const mq = mqByHandler.get(handlerFqn);
    if (mq) { impactedMqs.push({ endpoint: mq, chains, sources: [index.engineId] }); continue; }
    const job = jobByHandler.get(handlerFqn);
    if (job) { impactedJobs.push({ endpoint: job, chains, sources: [index.engineId] }); }
  }

  // 按深度排序（浅层优先 = 直接影响）
  const byDepth = (a: ImpactedEndpoint<any>, b: ImpactedEndpoint<any>) =>
    Math.min(...a.chains.map(c => c.depth)) - Math.min(...b.chains.map(c => c.depth));
  impactedApis.sort(byDepth);
  impactedMqs.sort(byDepth);
  impactedJobs.sort(byDepth);

  return {
    engineId: index.engineId,
    changedMethods,
    impactedApis,
    impactedMqs,
    impactedJobs,
    degraded: false,
  };
}
