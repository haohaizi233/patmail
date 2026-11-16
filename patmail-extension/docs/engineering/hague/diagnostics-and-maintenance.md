# 海牙诊断与维护

更新：2026-11-16。本文供维护人员定位批量草稿、认证、恢复与 Summary 下载问题。用户操作见[海牙工作流操作说明](../../hague-workflow.md)，并发和恢复状态机见[并发与恢复算法](./concurrency-and-recovery.md)。

## 先分清本地状态与远端结果

工作台工作区快照和 IndexedDB 材料是本地恢复数据；草稿检查点记录步骤进度、`caseRunId`、`reference`、`tabId`、传输模式、计划身份与回执。WIPO Draft(s) 列表才是草稿保存的远端核对依据。Summary 下载记录则是 Chrome 下载状态。三类记录各自证明不同事实，不能以 PDF 存在推断草稿已保存，也不能以本地 `next` 值推断原站已执行。

诊断时按单案 `caseRunId` 与步骤序号检查对应检查点和 trace；若批次恢复，确认 job 保存的 `caseRunId` 与检查点相等。先比较当前步骤身份和原计划；若 reference 或目标标签页变更、运行模式不一致，停止自动续跑并人工核对原站。不得通过清除检查点来消除不确定结果。

## 故障定位顺序

先读取仓库根 `log/cdp/status.json` 和最近 JSONL，沿 requestId / progressId / taskId 串联事件，再决定是否需要现场连接；保留期为本机最近 24 小时，不提交日志。状态、授权与采集约束以[Observer 维护说明](../../cdp-observer.md)为准。`pnpm cdp:status` 只查看状态；`cdp:start`、`cdp:stop` 会影响服务，不能为阅读文档随意调用。根目录及扩展的 `pnpm build` 会启动或复用监听器，纯文档回归优先直接调用 typecheck 与两个 Vite 构建入口，复用用户现有诊断环境。

1. 确认原站登录账号、WIPO 标签页和工作区批准标签页仍是同一目标；登录检测通过不代表后续业务回执必然成功。
2. 检查该案检查点状态、`next`、reference、传输模式、计划身份、`acknowledged`、`recoveryAttempts`、`recoveryRetries` 与 `recoveryDecision`。
3. 查看最新步骤错误和诊断 trace。`uncertain` 表示请求可能产生副作用；先查原站，再使用“核对并恢复当前草稿”。不要把超时解释为请求未执行。
4. 核对材料是否被替换。当前/已执行步骤变化会阻止恢复；只有未来步骤变化可在留下警告后继续。缺图或 IndexedDB 材料丢失时重新导入，并人工确认旧草稿归属。
5. 若认证刷新失败，先在原站重新登录并重新检测。认证修复不会重置每步骤一次的自动恢复预算，也不会自动启动原批次写入。
6. 查看下载列表确认 Summary 的下载 ID、文件名、完成状态及存在性。超时后先人工确认下载是否已落盘，避免重复操作造成同名副本。

认证失效会停止后续批次领取；受影响案件保留检查点。失败标签页不会被调度给下一案件。仅在有明确远端证据且操作员理解旧请求状态时，才通过产品提供的人工接管/新任务流程处理，不应直接编辑存储记录。

## 维护约束

- 修改单案步骤顺序或业务字段时同步检查逐步 identity、写前 uncertain、回执确认及恢复分支。
- 修改工作区存储结构时保持“材料字节先提交、清单后提交、旧材料最后清理”的顺序；恢复必须拒绝不属于当前 materialId 的文件引用。
- 修改并发调度时确保单案串行、跨案标签页隔离、caseRunId 代际校验和认证丢失后的停止行为。
- 修改 Summary 下载时验证建议文件名、PDF 签名、下载状态、落盘名称及释放 Blob URL。
- 运行仓库测试只能说明其覆盖的模拟行为；实站链路证据应单独记录来源、样本边界与观察时间。历史批次数据不是当前普遍性能或正确率保证。

## 源码与测试入口

核心实现：[draft-runner.ts](../../../src/hague/draft-runner.ts)、[draft-batch.ts](../../../src/hague/draft-batch.ts)、[workspace-recovery.ts](../../../src/hague/workspace-recovery.ts)、[http-client.ts](../../../src/hague/http-client.ts)、[session-gate.ts](../../../src/hague/session-gate.ts)、[summary-download.ts](../../../src/hague/summary-download.ts)、[hague-session.ts](../../../src/background/hague-session.ts)。

回归入口：[draft-runner.test.ts](../../../tests/unit/hague/draft-runner.test.ts)、[runner-recovery.test.ts](../../../tests/unit/hague/runner-recovery.test.ts)、[draft-batch.test.ts](../../../tests/unit/hague/draft-batch.test.ts)、[workspace-recovery.test.ts](../../../tests/unit/hague/workspace-recovery.test.ts)、[http-client.test.ts](../../../tests/unit/hague/http-client.test.ts)、[session-gate.test.ts](../../../tests/unit/hague/session-gate.test.ts)、[summary-download.test.ts](../../../tests/unit/hague/summary-download.test.ts)、[session-refresh.test.ts](../../../tests/unit/hague/session-refresh.test.ts)。
