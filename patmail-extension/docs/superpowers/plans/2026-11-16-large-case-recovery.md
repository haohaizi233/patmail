# 三件大客户容灾

范围：PO2530287HAGUE、PA2532115CN-HAGUE、PA2532089CN-HAGUE。恢复原草稿，不分配替代编号。补正案 PA2532083CN-HAGUE 的材料问题另行保留。

根因证据：原站 Document 跳转使上传/视图 RPC 失去回执；本轮两案出现 AUTH_REDIRECT，受保护 GET 多次 302，正常导航 /login 曾返回 500。另一案整计划指纹不一致：旧计划的设计人名 Anwen、当前 An；仅恢复这一字段便精确重现旧 planKey，差异在未执行的后续步骤。

实现：

- 保存逐步 SHA-256 指纹及图纸字节哈希。已执行部分和当前不确定步骤必须完全一致，允许更新更后面的字段；不将文件时间、JSON 键顺序视为业务变化。
- 旧检查点只能用重现旧完整指纹的原计划升级；升级不改变 reference、next、status、重试预算。
- 认证恢复使用原批准标签页，先等旧 RPC 安静，再进行最多三次正常受保护页面导航和新文档验证。5xx/空白认证页有限退避；真实登录挑战明确暂停，不读取/填写凭据。
- 回执 RPC 失败或宿主文档变化时先协调恢复，再核对原业务步骤；页面变化不立即销毁整批。运行期间禁用插件内的会话切换入口。

迁移：三件旧完整指纹均复现成功，已备份并升级原检查点。分别保留 WIPO188229/26、188230/34、188231/36，状态均 uncertain。该步骤是本次修复的数据迁移，不计作无人干预业务验收。

验证：全量 289 文件 / 2007 项测试通过；构建、类型检查、变更文件 ESLint 通过。现场恢复验收已通过：2026-11-16 16:14 从正常插件 UI 启动，16:20 前插件自行完成 3 件，成功 3、异常 0、171/171；补正材料单独跳过 1 件。启动后只读观察，未中途代填。

原 reference 188229/188230/188231 保持不变，最终检查点分别 41/41、66/66、64/64，状态均 saved。三份具名 PDF 共 14 页、50 个图纸实例，逐份文本包含对应 WIPO reference。应用 trace 证明本轮 create 步骤 0 次、最终 saveDraft 核验 3 次。两案各发生一次 priority BUSINESS_UNCONFIRMED，插件自动核对并恢复成功，不计为终态失败。

现场加载 JS 与构建哈希起止一致：5edb41c5f95f02371a3fbd8a15a63461cf914a4b28ebfd38230d9173b9078f73。证据在本机忽略目录 test-results/hague-live 下的 large-recovery-final-ui.json、large-recovery-final-workbench.png、large-customer-final-checkpoints.json、large-recovery-pdfs.json、large-recovery-trace-proof.json、UI 观察锁审计。

最后补充的 RPC_FAILED / NETWORK_ABORTED 回归与其他恢复测试共 38 项通过。
