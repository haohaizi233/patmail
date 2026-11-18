# 海牙草稿并发与恢复算法

更新：2026-11-16。本文描述仓库实现，不替代 WIPO 的业务规则。工作流入口见[操作说明](../../hague-workflow.md)，底层机制见[接口链与容灾算法](../../mechanisms/海牙接口链与容灾算法.md)。

## 范围与身份

批量入口在 `src/hague/draft-batch.ts`，单案步骤执行在 `draft-runner.ts`。每个案件按 `draftSteps(plan)` 固定顺序执行：准备、创建、申请人及代理、指定缔约方和 Locarno、逐设计上传与图例、可选说明、设计人和优先权、公开时间、签名、Summary、打印、返回编辑器、保存草稿。单案步骤严格串行；并发只发生在案件之间。

检查点的关键身份是 `caseRunId`、目标 `tabId`、WIPO `reference`、传输模式、`next` 和逐步 `planIdentity`。批次恢复仅接受 `checkpoint.caseRunId === job.caseRunId`，因此旧批次的迟到回执不能推进新批次。reference 是远端草稿身份；本地我方文号不能代替它。已运行检查点不能换标签页或在 HTTP/page 模式间续跑。

`createPlanIdentity` 对每一步的命令和业务字段做键排序、稳定序列化并 SHA-256；上传步骤以图像文件名、大小和内容 SHA-256 表示文件，不把 Base64 重复放入身份。时间戳和展示信息不是写入身份。比较时，已执行或当前步骤（索引 `<= next`）发生变化即阻断；只变更未来步骤时允许续跑并留下警告。旧版只有整体 `planKey` 时，不能清空进度迁就新材料；须提供能重现原指纹的旧计划升级。身份生成时间和内容哈希计算量随步骤数及文件总字节数线性增长；文件对象哈希在同一对象内缓存。

## 并发调度

并发上限为 1–6。调度器先做批次预检：跳过已保存、重复我方文号、重复 WIPO reference、检查点模式冲突、未获 HTTP 恢复能力的 uncertain 项，以及 page 模式中占用冲突标签页的案件。HTTP 任务按剩余估算工作量降序稳定排序（上传权重 3，其余步骤权重 1），只改变哪个独立案件先启动，不改变案内顺序。最多启动 `min(limit, jobs.length)` 个 worker；一个案件成功后该 worker 可继续领取下一件。

page 模式占用标签页期间由 claimed 集合排他；HTTP 模式也保留各案件原检查点标签页。失败的编辑器不会回收到另一个案件使用。认证失效会停止批次后续领取，避免用失效会话继续写入。全批次另由浏览器 Web Locks 的 `patmail:hague-draft-batch` 锁互斥；浏览器不支持锁时拒绝启动。复杂度为 O(n log n) 排序及 O(n) 预检/调度空间，实际请求和图像处理成本由每案步骤数与文件大小决定；并发数不是 WIPO 限流承诺。

## 写前持久化与不确定结果

### 网络槽、案件槽与会话门禁

上述 worker 是案件槽，一个案件在等待网络或回执期间仍占用案件槽。[HTTP context](../../../src/hague/http-context.ts) 的模块级 PermitPool(6) 则约束实际 HTTP 请求；网络槽释放不等于案件完成。每个 driver 拥有独立的文档、ViewState、reference 和请求链，不能把一个案件的表单状态复用于另一个案件。

[http-client](../../../src/hague/http-client.ts) 还区分两个更强的锁：creationPool(1) 串行覆盖新草稿分配、创建前重新初始化、首次保存与重新打开；[HagueSessionGate](../../../src/hague/session-gate.ts) 有六份许可，普通字段命令占一份，create、inspect、summary、backToApplication、saveDraft、恢复以及 portfolio 读取占全部六份。其 FIFO 队列只检查队首，已排队的独占请求不会被后来共享请求饿死；代价是独占请求等待期间不能继续填满空闲槽。释放函数幂等，异常在 finally 中释放，排队中止会移除等待项。

所以“六路案件”不承诺任一时刻都有六个网络请求：创建及原站共享视图操作有意排他，网络等待、材料处理与单案串行也会降低瞬时请求数。提高案件并发不能绕过这些原站状态约束。队列数组的移除/shift 最坏 O(q)，许可数固定；这与批次 O(n log n) 排序是不同成本。

## 不确定写入的裁决

每步发送前先将状态写成 `uncertain`，清除旧确认，再调用原站。只有收到有效回执、reference 一致并完成必要页面/列表核对后，才写入 acknowledged 并推进 `next`。因此刷新恢复时，uncertain 意味着“可能已执行”，不能按失败直接重发。保存草稿需在 Draft(s) 列表确认；创建后只拿到编号不代表整案完成。

当步骤失败且诊断表明请求尚未派发、无副作用时，变为 stopped 等待继续。认证重定向、RPC 失败或网络中断会先尝试刷新认证；刷新成功只允许继续进行受限的读回核对，不直接授权重发写入。HTTP 恢复 hook 只对有原 reference、身份匹配、未停止且可恢复的步骤工作。每一步核对尝试计入 `recoveryAttempts[next]`；读回明确证明完成则推进一步，明确安全重试则持久化一次 `recoveryDecision` 与 `recoveryRetries[next]=1`，重试后再失败即暂停。未知、读回异常、reference/页面/计数不匹配均保留 uncertain。无无限重试、指数退避、自动重建草稿或自动切换账号。页面填写路径依赖回执，结果不确定时交人工核对。

恢复期间预算和授权先写入检查点，所以刷新不会重置预算。写入授权保持 uncertain；恢复中断后仍须重新核对，已消费的一次重试不会被再次授权。创建请求没有可确认 reference 时尤其禁止自动创建替代草稿。打印是本地输出步骤，uncertain 的打印可转为 stopped 后重开 Summary，不把它误当成远端申请写入。

## 工作区刷新恢复

`workspace-recovery.ts` 把材料字节存入 IndexedDB `patmail-hague-materials-v1`，清单以 materialId、文件键、名称、类型、大小、修改时间和相对路径引用文件；工作区快照包含案件行、选中项、并发、模式、导出格式、批次、当前检查点、活动批次及已批准标签页。材料先提交，之后才发布引用它们的清单；替换清单成功后才在运行锁内清理旧材料。恢复逐项校验键属于当前 materialId，文件必须仍是 Blob 且大小一致；缺失即停止，不创建草稿。它没有逐字节重新计算材料清单摘要，上传计划身份的 SHA-256 才负责核验具体图纸内容。

该 WAL 方案能恢复工作区数据，不保证浏览器存储永不被清理，也不能凭空恢复 WIPO 登录、页面 DOM 或站点会话。运行中仍应避免关闭扩展或切换账号；恢复后按检查点机制核对远端结果。

## Summary 下载核验

`summary-download.ts` 用 Blob URL 和原生下载锚点发起下载，以便使用建议文件名；要求文件名匹配本案约定且字节以 `%PDF-` 开头。以 `caseRunId + 文件名` 保存下载 ID，最多等待 60 秒，通过 downloads API 确认 complete、存在且文件名匹配；中断、超时或名称不符都报告异常。它确认的是本地 PDF 下载记录，不等于 WIPO 草稿保存或正式递交。

## 代码与回归证据

- 执行/恢复：[draft-runner.ts](../../../src/hague/draft-runner.ts)、[draft-recovery.ts](../../../src/hague/draft-recovery.ts)、[plan-identity.ts](../../../src/hague/plan-identity.ts)
- 调度/工作区：[draft-batch.ts](../../../src/hague/draft-batch.ts)、[workspace-recovery.ts](../../../src/hague/workspace-recovery.ts)、[summary-download.ts](../../../src/hague/summary-download.ts)
- 对应回归：[draft-runner.test.ts](../../../tests/unit/hague/draft-runner.test.ts)、[draft-recovery.test.ts](../../../tests/unit/hague/draft-recovery.test.ts)、[plan-identity.test.ts](../../../tests/unit/hague/plan-identity.test.ts)、[concurrency.test.ts](../../../tests/unit/hague/concurrency.test.ts)、[workspace-recovery.test.ts](../../../tests/unit/hague/workspace-recovery.test.ts)、[summary-download.test.ts](../../../tests/unit/hague/summary-download.test.ts)

测试用例证明仓库模拟条件下的状态机与边界，不单独证明未覆盖的实站协议分支。最新一次 live business pass 是用户确认的独立现场结论，不应与仓库测试覆盖混为一谈；具体现场样本和历史证据见机制文档。
