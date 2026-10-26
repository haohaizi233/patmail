# 测试文件迁移映射（测试工程结构重构）

本次重构只调整测试代码的目录组织与共享测试设施，不改生产业务逻辑。所有历史测试文件都平移到新位置，导入由 `../src/...` 按新目录深度改写为 `../../../src/...`；读取项目内文件（manifest、源码文本、外部 API 文档）的地方改走 `tests/helpers/project.ts`。用例断言未做删减：迁移前 780 个用例，迁移后仍是 780 个。

历史阶段测试的逐文件语义与维护约定见 `tests/regression/phases/README.md`。

## 拆分的文件

| 原文件 | 拆分后 | 说明 |
| --- | --- | --- |
| tests/agent-loop.test.ts | tests/unit/agent/agent-memory.test.ts（agent memory，9）<br>tests/unit/agent/agent-tools.test.ts（agent tools，4）<br>tests/unit/agent/agent-loop.test.ts（agent loop，30）<br>tests/unit/agent/agent-tool-waves.test.ts（tool waves and schemas，9）<br>tests/unit/agent/agent-memory-fallback.test.ts（agent 记忆写不下时的兜底，3） | 按 describe 职责拆分，55 用例不变；共享脚手架抽到 tests/unit/agent/support/agent-test-kit.ts |
| tests/limit-mail-submit.test.ts | tests/unit/mail/limit-mail-submit-guards.test.ts（9）<br>tests/unit/mail/limit-mail-submit-batch.test.ts（5）<br>tests/unit/mail/limit-mail-submit-address.test.ts（5）<br>tests/unit/mail/limit-mail-submit-grouping.test.ts（12） | 按提交门禁、批量重试、收发件人写回、分组与按钮分叉拆分，31 用例不变；共享构造抽到 tests/unit/mail/support/limit-mail-submit-fixtures.ts |
| tests/pct-workbook.test.ts | tests/unit/pct/pct-workbook.test.ts（两张表一起读 / 查不到的行按源表导出 / 大表导入，6）<br>tests/unit/pct/pct-workbook-lookup.test.ts（一件没查成不停下其余，9）<br>tests/unit/pct/pct-workbook-arbitration.test.ts（仲裁交给本地模型时分批，11） | 26 用例不变；gap() 抽到 tests/unit/pct/support/pct-workbook-fixtures.ts |
| tests/query-template.test.ts | tests/unit/query/query-template.test.ts（历史模板响应 / QueryXml / 模板合并 / 本地模板和客户配置，12）<br>tests/integration/easy/query-template-transport.test.ts（历史模板传输，5） | `历史模板传输` 是跨模块集成（HistoryQueryService + EasyTransport），迁入 integration/easy；17 用例不变 |

## 平移映射

| 原路径（tests/ 下） | 新路径（tests/ 下） |
| --- | --- |
| `agent-actions.test.ts` | `unit/agent/agent-actions.test.ts` |
| `agent-api-docs.test.ts` | `unit/agent/agent-api-docs.test.ts` |
| `agent-ask.test.ts` | `unit/agent/agent-ask.test.ts` |
| `agent-frame.test.ts` | `unit/agent/agent-frame.test.ts` |
| `agent-llm.test.ts` | `unit/agent/agent-llm.test.ts` |
| `agent-loop.test.ts` | `unit/agent/agent-loop.test.ts` |
| `agent-plan.test.ts` | `unit/agent/agent-plan.test.ts` |
| `agent-sessions.test.ts` | `unit/agent/agent-sessions.test.ts` |
| `agent-slash.test.ts` | `unit/agent/agent-slash.test.ts` |
| `agent-trace.test.ts` | `unit/agent/agent-trace.test.ts` |
| `agent-turn-policy.test.ts` | `unit/agent/agent-turn-policy.test.ts` |
| `rag-store.test.ts` | `unit/agent/rag-store.test.ts` |
| `documented-call.test.ts` | `unit/api/documented-call.test.ts` |
| `message.test.ts` | `unit/api/message.test.ts` |
| `file-search-params.test.ts` | `unit/api/file-search-params.test.ts` |
| `file-search-normalizer.test.ts` | `unit/api/file-search-normalizer.test.ts` |
| `ic-search.test.ts` | `unit/api/ic-search.test.ts` |
| `process-list-search.test.ts` | `unit/api/process-list-search.test.ts` |
| `picker-catalog.test.ts` | `unit/api/picker-catalog.test.ts` |
| `reviewers.test.ts` | `unit/api/reviewers.test.ts` |
| `file-manage-plan.test.ts` | `unit/automation/file-manage-plan.test.ts` |
| `file-manage-runs.test.ts` | `unit/automation/file-manage-runs.test.ts` |
| `limit-monitor.test.ts` | `unit/automation/limit-monitor.test.ts` |
| `limit-query-xml.test.ts` | `unit/automation/limit-query-xml.test.ts` |
| `live-readonly-policy.test.ts` | `unit/automation/live-readonly-policy.test.ts` |
| `wal-ledger.test.ts` | `unit/automation/wal-ledger.test.ts` |
| `customer-list.test.ts` | `unit/customer/customer-list.test.ts` |
| `customer-page.test.ts` | `unit/customer/customer-page.test.ts` |
| `case-arbitration.test.ts` | `unit/customer/case-arbitration.test.ts` |
| `case-contact.test.ts` | `unit/customer/case-contact.test.ts` |
| `case-demand.test.ts` | `unit/customer/case-demand.test.ts` |
| `case-record.test.ts` | `unit/customer/case-record.test.ts` |
| `sme-customers.test.ts` | `unit/customer/sme-customers.test.ts` |
| `mail-bcc.test.ts` | `unit/mail/mail-bcc.test.ts` |
| `mail-contacts.test.ts` | `unit/mail/mail-contacts.test.ts` |
| `mail-concurrency.test.ts` | `unit/mail/mail-concurrency.test.ts` |
| `mail-flow.test.ts` | `unit/mail/mail-flow.test.ts` |
| `mail-inventor-column.test.ts` | `unit/mail/mail-inventor-column.test.ts` |
| `mail-process.test.ts` | `unit/mail/mail-process.test.ts` |
| `mailset.test.ts` | `unit/mail/mailset.test.ts` |
| `signature-catalog.test.ts` | `unit/mail/signature-catalog.test.ts` |
| `signature-read.test.ts` | `unit/mail/signature-read.test.ts` |
| `template-subject.test.ts` | `unit/mail/template-subject.test.ts` |
| `download-name.test.ts` | `unit/mail/download-name.test.ts` |
| `description-import.test.ts` | `unit/mail/description-import.test.ts` |
| `policy-remark.test.ts` | `unit/mail/policy-remark.test.ts` |
| `limit-mail-submit.test.ts` | `unit/mail/limit-mail-submit.test.ts` |
| `filing-batch.test.ts` | `unit/filing/filing-batch.test.ts` |
| `filing-export.test.ts` | `unit/filing/filing-export.test.ts` |
| `filing-export-panel.test.ts` | `unit/filing/filing-export-panel.test.ts` |
| `filing-pages.test.ts` | `unit/filing/filing-pages.test.ts` |
| `filing-rows.test.ts` | `unit/filing/filing-rows.test.ts` |
| `filing-search.test.ts` | `unit/filing/filing-search.test.ts` |
| `filing-templates.test.ts` | `unit/filing/filing-templates.test.ts` |
| `workflow-catalog.test.ts` | `unit/workflow/workflow-catalog.test.ts` |
| `workflow-mail.test.ts` | `unit/workflow/workflow-mail.test.ts` |
| `workflow-pave.test.ts` | `unit/workflow/workflow-pave.test.ts` |
| `workflow-preview.test.ts` | `unit/workflow/workflow-preview.test.ts` |
| `write-switch.test.ts` | `unit/workflow/write-switch.test.ts` |
| `pct-flow-status.test.ts` | `unit/pct/pct-flow-status.test.ts` |
| `pct-recipients.test.ts` | `unit/pct/pct-recipients.test.ts` |
| `pct-sheet.test.ts` | `unit/pct/pct-sheet.test.ts` |
| `pct-workbook.test.ts` | `unit/pct/pct-workbook.test.ts` |
| `query-template.test.ts` | `unit/query/query-template.test.ts` |
| `query-surfaces.test.ts` | `unit/query/query-surfaces.test.ts` |
| `option-tree.test.ts` | `unit/query/option-tree.test.ts` |
| `option-fallback.test.ts` | `unit/query/option-fallback.test.ts` |
| `field-labels.test.ts` | `unit/query/field-labels.test.ts` |
| `form-check.test.ts` | `unit/query/form-check.test.ts` |
| `avatar.test.ts` | `unit/ui/avatar.test.ts` |
| `check-progress.test.ts` | `unit/ui/check-progress.test.ts` |
| `column-fit.test.ts` | `unit/ui/column-fit.test.ts` |
| `docs-markdown.test.ts` | `unit/ui/docs-markdown.test.ts` |
| `greeting.test.ts` | `unit/ui/greeting.test.ts` |
| `hint.test.ts` | `unit/ui/hint.test.ts` |
| `home-lines.test.ts` | `unit/ui/home-lines.test.ts` |
| `home-report.test.ts` | `unit/ui/home-report.test.ts` |
| `mermaid-theme.test.ts` | `unit/ui/mermaid-theme.test.ts` |
| `mermaid-view-mode.test.ts` | `unit/ui/mermaid-view-mode.test.ts` |
| `progress-tally.test.ts` | `unit/ui/progress-tally.test.ts` |
| `theme-select.test.ts` | `unit/ui/theme-select.test.ts` |
| `w-date-picker.test.ts` | `unit/ui/w-date-picker.test.ts` |
| `injector.test.ts` | `unit/content/injector.test.ts` |
| `scanner.test.ts` | `unit/content/scanner.test.ts` |
| `semantic-scanner.test.ts` | `unit/content/semantic-scanner.test.ts` |
| `easy-runtime.test.ts` | `integration/easy/easy-runtime.test.ts` |
| `easy-session.test.ts` | `integration/easy/easy-session.test.ts` |
| `easy-transport.test.ts` | `integration/easy/easy-transport.test.ts` |
| `full-page-query.test.ts` | `integration/easy/full-page-query.test.ts` |
| `customer-mode.test.ts` | `integration/background/customer-mode.test.ts` |
| `customer-list-load.test.ts` | `integration/background/customer-list-load.test.ts` |
| `packaging-security.test.ts` | `integration/packaging/packaging-security.test.ts` |
| `phase2-3.test.ts` | `regression/phases/phase2-3.test.ts` |
| `phase2-4.test.ts` | `regression/phases/phase2-4.test.ts` |
| `phase2-5.test.ts` | `regression/phases/phase2-5.test.ts` |
| `phase2-6.test.ts` | `regression/phases/phase2-6.test.ts` |
| `phase2-7.test.ts` | `regression/phases/phase2-7.test.ts` |
| `phase2-8.test.ts` | `regression/phases/phase2-8.test.ts` |
| `phase2-9.test.ts` | `regression/phases/phase2-9.test.ts` |
| `phase3-0.test.ts` | `regression/phases/phase3-0.test.ts` |
| `phase3-1.test.ts` | `regression/phases/phase3-1.test.ts` |
| `phase3-2.test.ts` | `regression/phases/phase3-2.test.ts` |
| `phase3-3.test.ts` | `regression/phases/phase3-3.test.ts` |
| `phase3-4.test.ts` | `regression/phases/phase3-4.test.ts` |
| `phase3-5.test.ts` | `regression/phases/phase3-5.test.ts` |
| `phase3-6.test.ts` | `regression/phases/phase3-6.test.ts` |
| `phase3-7.test.ts` | `regression/phases/phase3-7.test.ts` |
| `phase3-8.test.ts` | `regression/phases/phase3-8.test.ts` |
| `phase3-9.test.ts` | `regression/phases/phase3-9.test.ts` |

## 其它调整

- `tests/setup.ts` → `tests/setup/vitest-setup.ts`（vitest.config.ts 的 setupFiles 同步更新）。
- `tests/extension.e2e.mjs`、`tests/limit-query.e2e.mjs`、`tests/docs.e2e.mjs` → `tests/e2e/`，公共支撑抽到 `tests/e2e/support/`（paths / fixture-server / easy-mock / browser / report），extension 的场景拆到 `tests/e2e/scenarios/`；脚本入口仍各自独立运行。
- 新增共享测试设施：`tests/helpers/project.ts`（项目路径解析）、`tests/factories/`（memory-area、customer-profile、query-template、mail-rules、patent-file，共迁移 24 个文件里的重复构造）。
- `tests/unit/pct/pct-sheet.test.ts` 里的本机 xlsx 样例改为可用 `PATMAIL_PCT_SAMPLE` 指定，文件不存在时跳过该用例（样例不入库）。
