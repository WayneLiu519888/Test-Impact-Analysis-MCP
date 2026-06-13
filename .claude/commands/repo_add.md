---
description: "添加监控仓库到 monitors.conf.json"
arguments:
  - name: repo_info
    description: "仓库信息: URL、分支、类型、模块等（自然语言描述）"
    required: true
---

# /repo_add — 添加监控仓库

你是 Claude Code 的 repo_add 命令处理器。用户通过此命令将新仓库加入 TIA 监控。

## 参数提取

从用户的自然语言输入中提取以下信息：

| 参数 | 必需 | 说明 |
|------|------|------|
| url | ✅ | Git 远程 URL（如 `git@github.com:user/repo.git`） |
| branch | ✅ | 监控的分支名 |
| repoType | ✅ | `frontend` 或 `backend` |
| module | ✅ | 业务模块名（如 "电商系统"、"用户中心"） |
| name | 可选 | 仓库别名（不提供则自动从 URL 提取 repo 名） |
| platform | 可选 | 自动检测：github.com → github，其他 → generic |

## 执行步骤

1. **理解用户意图**，从用户输入中提取上述参数
2. 如果用户未提供 `name`，从 URL 中提取：取 `owner/repo` 中的 `repo` 部分作为别名
3. 如果用户未提供 `platform`，按 URL 自动判断：`github.com` → `github`，其他 → `generic`
4. 如果 `platform=generic`，自动生成 genericConfig 占位（apiBase + apiTemplate 由用户后续编辑）
5. **Read** `monitors.conf.json`
6. 检查 name 是否已存在 → 存在则提示 `⚠️ 仓库别名已存在`
7. 在 `repositories` 数组末尾追加新条目（保持 JSON 格式与现有条目一致）
8. **Edit** 或 **Write** 文件
9. 提示用户执行下一步操作：
   ```
   ✅ 仓库 "<name>" 已加入监控
   
   下一步:
   1. repo_monitor check name=<name>  — 初始化水位
   2. repo_clone mode=full name=<name>  — 拉取代码到本地
   ```

## JSON 模板

```jsonc
{
  "name": "<别名>",
  "url": "<git URL>",
  "platform": "<github|generic>",
  "branch": "<分支名>",
  "repoType": "<frontend|backend>",
  "module": "<模块名>"
}
```

> 仅 github 平台无需 `genericConfig`。其他平台建议用户手动补充 `genericConfig`。

## 示例

```
/repo_add 监控 git@github.com:macrozheng/mall.git，branch=master，backend，电商系统
/repo_add 添加仓库 <YOUR-GIT-HOST>:<YOUR-ORG>/example.git，develop 分支，backend 类型，用户中心模块
/repo_add name=my-service url=git@github.com:me/my-service.git branch=main type=backend module=测试模块
```
