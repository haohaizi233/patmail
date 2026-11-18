# 文档治理维护

正式入口在[技术知识总览](../engineering/README.md)，历史材料在[档案索引](../archive/hague/README.md)。本目录不打包为插件正式菜单。

## 命令与数据

在 patmail-extension 运行 `pnpm docs:check` 检查本地链接、正式文档锚点、结构、目录元数据与重复权威来源；CI 离线执行，不连接浏览器或业务站点。`pnpm docs:audit` 重新生成 [inventory.json](inventory.json) 和 [inventory.md](inventory.md)。[catalog.json](catalog.json) 是状态元数据和正式技术目录来源，[migrations.json](migrations.json) 记录旧路径、权威路径、操作、理由与证据。人工结论在[审计报告](audit-report.md)。

新技术规范应登记 current、适用 scope、真实核验 commit、review 日期、准确证据等级和相关源码/测试。display 仅允许 current。标题和权威正文不应重复；目录与渲染的对应关系另由 docs-catalog 单元测试验证。既有使用指南、API 与学习笔记保持原目录，新增技术集合按登记状态筛选。旧规范可用 canonical_path 指向当前已展示规范；隐藏档案不因这个字段自动公开。

## 维护规则

先核验当前调用入口与关键分支，再引用测试和历史记录。源码变动后重新核验事实并更新 last_verified_commit，不能仅修改日期消除提示。审计基于核验提交至当前工作区的相关源码差异输出 CURRENT / REVIEW_REQUIRED；没有逐条核验的文档保持 REVIEW_REQUIRED。CURRENT 是维护提示，不是正确性证明。未注册旧文档仍保留，不自动删改。

状态使用 current、historical、superseded、experimental、unverified；证据使用 design_only、code_verified、tested_offline、browser_e2e、live_business_verified。算法的 code_verified 不会因为文档窗口 E2E 通过就提升为 live_business_verified。用户确认的现场通过与仓库内独立证据分别记录。

迁移前保存原文及哈希，再写映射并修复引用。已知 GitHub 旧路径保留兼容说明。原文中独有故障数据和验收数字留档，不混算新旧批次。元数据采用外置 JSON，正文不显示 YAML；Front Matter 检查只检查边界闭合，不承担完整 YAML 语法验证。

## 门禁范围和限制

精确重复使用 SHA-256；高相似度用归一化字符三元组 Jaccard，结合内容分类、长度比输出人工候选，既非语义模型也不会自动删除。分类是基于内容和路径的启发式，待核验条目仍需人工追踪源码。

链接检查不联网，不能判断远端网站是否失效；Markdown 引用式链接、复杂嵌套语法和 Mermaid 语法完整性仍依赖渲染回归。简单结构检查不能替代 Mermaid 浏览器渲染。当前 legacy-baseline 无豁免项；`--write-baseline` 仅供显式初次迁移，禁止在 CI 或日常修复中自动更新以掩盖新增问题。正式目录错误不受基线豁免。
