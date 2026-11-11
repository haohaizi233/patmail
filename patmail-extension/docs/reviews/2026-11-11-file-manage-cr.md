# 2026-11-11 文件管理发文 CR 与 E2E

范围：单个来文 mailstyle=2、客户独立发文配置、默认继承、固定类型映射与标题规则、布局及热加载、配置保存/恢复、实际发文请求。未扩展海牙或其他独立功能。

## 结论

发现并修复 1 个 P1。修复后专项 E2E 与相关回归通过，独立复核已确认该修复充分。

### P1：单个来文恢复了旧合并草稿

原逻辑根据文件 ID 账本沿用 mailId，没有核对该草稿是否还含其他文件。从合并模式改为单个来文，可能把 A+B 的旧草稿作为 A 的单封提交。

修复：复用现有草稿前分页读取 GetMailFile，核对完整文件 ID 集合；多文件、缺文件、分页未读全或读取失败均停止，不保存、不提交、不自动重建。已结束旧流程需要另建的原有分支继续按原规则处理。

对应单测先复现失败，再验证修复通过；真实扩展 E2E 验证不匹配时 MailCustomer / SaveMailInfo / MailSubmit 写请求数量不增加。

## 验证

- 17 个相关测试文件，77 项单元/回归测试通过。
- 原有 workspace.e2e.mjs 通过：客户增改、刷新、跨页同步、查询来源、持久化任务、过期/伪造防护、服务工作线程恢复、账号隔离及并发规则版本校验。
- 新增 file-manage-customer.e2e.mjs 五组检查通过，浏览器 pageerror 为 0：
  1. 发件人/审核人/签名横排三列，客户没有标题或发文类型覆盖入口。
  2. 自定义配置保存后刷新回填，切换客户不串值。
  3. 从实际扩展 UI 经后台及内容脚本，到 MailCustomer、SaveMailInfo、MailSubmit：mailstyle=2、固定映射类型、单文件、发件邮箱、案件联系人与追加收件人、指定抄送、原站签名 HTML、指定审核人全部正确。
  4. 复用旧合并附件草稿时停止且无写请求。
  5. 清空设置恢复默认继承，并确认另一客户配置未变化。
- file-pages.e2e.mjs 通过：1597 个文件全选与刷新恢复，15 个剩余分页请求、并发峰值 6、进度保留均符合预期。
- 类型检查及两段生产构建通过；本次新增/修改代码定向 ESLint 通过。

## 运行与边界

新增命令：`pnpm test:e2e:file-manage`。默认使用 Playwright Chromium；本机可指定 `PATMAIL_E2E_CHROME` 为 Chrome 可执行文件路径，通过原生 CDP Extensions.loadUnpacked 在全新隔离 profile 加载测试扩展。

测试扩展复制到独立目录；所有 EASY HTTP 请求均由夹具拦截，不调用真实业务服务器、不提交真实客户邮件。HAR 参数证据与隔离接口回归相结合；没有重放生产发文。

专项报告：`test-results/file-manage-customer.json`；截图：`test-results/file-manage-customer.png`。工作台报告：`test-results/patmail-e2e-workspace.txt`。
