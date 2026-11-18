# 诊断 UI / 报告 / 回放验收记录

2026-11-13；此记录只覆盖诊断展示与纯离线模块，整体构建与现场验证以总验收文档为准。

- `pnpm exec vitest run tests/unit/hague/diagnostics-reports-replay.test.ts tests/unit/hague/diagnostics-ui.test.ts`：2 文件、10 测试通过。
- 已执行红灯阶段：模块与 Vue 组件不存在时测试失败；实现后修正测试事件满足强制 traceId/caseRunId 和 ISO timestamp 契约，再通过。
- DOM 挂载验证：默认折叠；独立深度脚本授权说明可见；无 CDP 显示证据缺失；显式切换采集后显示安全事件、请求详情和案件代号，隐私探针不进入 UI。
- 离线验证：HTTP 200 不推断业务成功；业务拒绝与不确定结果可并存；超时不补造 HTTP；六案件不串案；未归属 CDP 保留未归属；隐私探针不进入三种导出；版本/大小限制；单行 JSONL 和摘要 JSON 回放；指纹排序稳定且仅输出安全结构。
- 最初全项目Typecheck的Observer声明/构造函数泛型问题已修复；最终全项目检查结果见主验收。
- 未执行真实 WIPO 浏览器写操作、深度脚本读取或现场 CDP 授权；不声称通过实站业务验收。
- 新增隔离浏览器验收：`HAGUE_TEST_CHROME=C:/Users/Administrator/AppData/Local/Google/Chrome/Application/chrome.exe node tests/e2e/hague-diagnostics-ui.e2e.mjs` 通过。使用现有 Hague 页面 harness、全新无用户配置浏览器及人工构造 Trace；所有外网请求被拦截，实际外网请求数为 0。
- 已在 1440 / 860 像素视口检查默认折叠、明确开启、错误/不确定证据展示、请求详情、三种实际下载、隐私过滤、JSONL 回放、返回观测及清空。截图位于 `test-results/hague-diagnostics-ui/panel-desktop.png` 与 `panel-narrow.png`，已打开检查；窄屏表格采用独立横向滚动，避免案件列被逐字挤压。
- 首次浏览器执行发现 `@babel/types` 的 `process is not defined` 导致页面挂载失败；AST 模块移除该运行时依赖后重跑通过。没有通过 fixture 添加 process shim 掩盖问题。
- 截图与 `result.json` 是本地测试产物，不提交；隔离浏览器验证不等同于真实 WIPO 登录态或业务写入验收。


- 最后补充固定`patmail-hague-cdp-trace`合成事件接收验证：展示probable及CDP证据，敏感额外字段仍不进入UI和导出。此测试验证安全事件接收，不冒充日常Chrome现场CDP连接。
