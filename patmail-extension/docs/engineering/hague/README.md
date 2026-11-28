# 海牙技术总览

本组规范核验当前生产代码调用，不以文件存在证明已经集成。版本与证据等级在[知识总览](../README.md)及治理清单中记录。

[跳至生产调用核验](#生产调用核验)。

## 生产调用核验

| 机制 | 实际入口 | 证据及边界 |
|---|---|---|
| ViewState 状态机 | [Research Worker](../../../scripts/hague/research/hague-research-worker.mjs) 的 signal 与 xml 分支 | begin_request、recordResponseViewState、文档/会话失效在真实研究消息链调用；不是业务写入授权 |
| JSF 统一语义 | 同一 Worker 调用 parseJsfProtocol；[HTTP context](../../../src/hague/http-context.ts) 消费共享语义 | 保序协议事实与实际业务回执分开判定 |
| 指纹/漂移与组件注册 | Worker xml 分支调用 computeProtocolFingerprint、detectProtocolDrift、registerComponent | 缺少 baseline 不能声称无漂移 |
| AST | Worker ast / lookup 分支 | 静态识别不代表已执行 |
| 逐步计划指纹 | [runner](../../../src/hague/draft-runner.ts) 调用 createPlanIdentity / comparePlanIdentity | 核对已执行前缀和当前不确定步骤，后续变更单独处理 |
| 材料恢复 | [HaguePage](../../../src/app/pages/HaguePage.vue) 调用 [workspace-recovery](../../../src/hague/workspace-recovery.ts) | Blob 先落盘、WAL 清单后提交；恢复不代表远端已成功 |
| 剩余工作量调度 | [draft-batch](../../../src/hague/draft-batch.ts) HTTP jobs 稳定降序排序 | 单案顺序不变，安全独占区不取消 |
| 会话导航恢复 | [会话处理器](../../../src/background/hague-session.ts) recover 分支 | 原批准标签页、有限次数、二次验证边界 |

## 专题

[架构](architecture.md) → [CDP](cdp-research.md) → [AST](javascript-ast.md) → [JSF](jsf-protocol.md) → [ViewState](viewstate-state-machine.md) → [漂移](protocol-fingerprint.md) → [证据](correlation-evidence.md) → [并发容灾](concurrency-and-recovery.md) → [维护](diagnostics-and-maintenance.md)。

## 验收口径

用户确认最新真实业务验收通过。仓库中的[三案恢复记录](../../superpowers/plans/2026-11-16-large-case-recovery.md)包含当时的运行结果描述及本机证据路径；本机忽略目录中的原始证据未随 Git 提交，因此记录可审阅，不等于第三方可在本仓库离线重放原站批次。历史审计的失败与后续验收成功都保留时序，不以不同批次相加构造成功率。
