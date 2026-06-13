# 企业级 impact-rules 配置方案

> 完整方案由 ecc:architect Agent 产出。以下为结构索引，完整内容见 Agent 输出。

## 方案结构

1. **JSON Schema 定义** — `appliesTo` / `tags` / `_schema` 字段扩展
2. **预设规则模板** — Java后端 5条 + JS前端 5条 + 通用 3条（共13条）
3. **种子文件** — `examples/impact-rules.conf.example.json` 完整内容（~200行含注释）
4. **规则编写指南** — glob技巧 + 风险等级标准 + 5个反模式
5. **验证与运维** — 规则命中验证方法 + 数量建议 + 季度审查提醒
6. **README 更新摘要** — 多语种术语对照表

## 关键设计决策

- **不新增 MCP 工具** — 坚持原则0，规则通过直接编辑JSON管理
- **appliesTo AND语义** — 多个维度同时满足才生效
- **企业规则统一 `ent-` 前缀** — 避免与通用规则ID冲突
- **种子文件全注释** — 用户取消注释即可启用预设规则
