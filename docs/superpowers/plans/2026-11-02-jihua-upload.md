# 季华实验室传文 Implementation Plan

> **For agentic workers:** Use bounded subagents for the inventory, browser transport and UI. The primary agent owns the client, runner, integration and final verification.

**Goal:** 从用户选择的目录递归读取文件名，按申请号核对季华台账，六路补传缺失材料，并保留可恢复、可导出的逐行结果。

**Architecture:** 工作台负责本地目录句柄、元数据清单与持久任务；独立 OA 传输通道在用户已登录的原标签页执行同源请求。六个申请号工作者独占各自案件，每类材料按上传、保存关联、回读确认分段落账。Web Lock 防止多个工作台重复执行。

**Tech Stack:** Vue 3 / TypeScript / IndexedDB / File System Access / Chrome scripting MAIN world / Vitest / isolated Chromium.

**Spec:** 用户本轮的季华工作流需求；接口依据 `API/external-platforms/jihualab.md` 和 `jihualab-attachments.md`。

## Global Constraints

- 扫描只读名称与目录，不调用 getFile 或读取正文。默认仅 pdf、docx、doc。
- 递交合并档对应专利请求书；新申请文档对应申请文件。
- 已有同类附件跳过；不能凭模糊名称或查询首行选择案件。
- 六路按申请号并发；同一案件写入串行，保存前重新回读保留所有其他附件及业务字段。
- 会话令牌仅留在目标页请求闭包中；不记录 Cookie、令牌、文件正文或完整 HTTP 正文。
- 上传未确认时不盲重传；保存未确认先回读。刷新后任务暂停，用户恢复后继续检查点。
- 不改 EASY 绑定语义，不调用附件删除，不修改用户客户资产，不提交或推送。

## Review Focus

- 多层目录、名称带连字符、重复选目录、无匹配描述：清单稳定且可人工选择。
- 同申请号同类多文件与 OFC 单份限制：不随意选择文件，不覆盖原附件。
- 上传完成后断线、关联响应丢失：复用附件 ID 或原请求回执，回读确认。
- 登录变化、页面重载、工作台刷新及并发工作台：阻止跨会话续写和重复发送。
- 列表错误、鉴权失败、HTML 响应、落账失败：有明确退出与详细错误，成功只在回读后成立。

## Tasks

- [x] Inventory: `src/jihua/{types,materials,inventory,repository}.ts` and targeted tests. Prove scans never read bytes; persistence retains handles/checkpoints; repeated imports preserve outcomes.
- [x] Transport: `src/background/jihua-page-world.ts`, `src/jihua/transport.ts`, narrow host permission and background channel. Bounded 256 KiB staged chunks; requestId-based asynchronous receipt; session/document fencing; no generic arbitrary-route execution. Test sender/origin gates, duplicate requests, transport errors.
- [x] Client/runner: `src/jihua/{client,runner}.ts`. Test exact paginated app matching, full attachment preservation, six-lane maximum, existing-file skip, ambiguous upload recovery, post-update verification, pause/reload and durable checkpoint failures.
- [x] UI: `src/app/pages/JihuaUploadPage.vue`, workflow launch card and app route. Paginated tables, material overrides, extension selection, source-tab binding, pause/resume, per-row results, BOM CSV export. Reuse top CheckRainbow with meaningful counters.
- [x] Integration: typecheck, focused regression, build, lint baseline gate, isolated browser smoke with mocked OA; document actual evidence and remaining live-server validation limits.

No production customer files are uploaded as part of automated verification.

## Verification (2026-11-02)

- Jihua unit tests: 9 files, 66 tests passed.
- Final isolated browser test: passed; 12 rows, observed 6 concurrent uploads, 9 multipart requests, 0 additional uploads after workbench refresh and association retry; CSV exported.
- Build including vue-tsc: passed. ESLint baseline gate: passed. Manifest verification: passed.
- Full Vitest: 1270 passed, 1 pre-existing failure at `tests/unit/agent/agent-api-docs.test.ts:27` (expected 389 interfaces, current source index yields 390). This unrelated fixture was not changed.
- Generated evidence: `patmail-extension/test-results/jihua-upload/` plus `jihua-upload-{unit,build,lint,e2e,manifest,vitest-all}.log` in `test-results/`.
- Real customer-platform multipart/update acceptance remains unverified; no customer files were read or uploaded during verification. Local single-file staging cap: 256 MiB, distinct from unknown server limits.
