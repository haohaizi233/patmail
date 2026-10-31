# 流水下载凭据中断与自动续跑容灾（2026-10-31）

## 事故经过

16:34–16:36 一轮 495 个附件的浏览器流水下载（任务 `cd7da6bf`，进度 `df34a6c4`）在取名 120/495、入包 0/495 时整批终止，页面报「流水下载失败：下载凭据已失效或不属于当前账号和来源页面。」。日志时间线（UTC，-8 即本地时间）：

- `08:34:37` `BROWSER_STREAM_DOWNLOAD start` 建任务并开盘；`08:34:39` 原生下载请求 `_patmail_native_download/...` 出现 411ms 的 network.failure，其后下载项仅收到 123B（ZIP 头）。
- `08:35:09–08:35:10` 取名推进到 120/495 后停滞；下载水位长期 0。
- `08:36:09` 工作台发起 `WORKSPACE refreshSession`（会话重检，最终 ok:false）。
- `08:36:10` 第一条 `cache read` 报 ERROR —— 下载写入凭据（lease）已在此时失效，此后 status/write/pause 全部被拒。
- `08:36:22` 流程触发 `PAUSE_DOWNLOAD`；`08:36:23` 浏览器下载项转 `interrupted / USER_CANCELED`。
- `08:36:26` `DOWNLOAD_FILES_RESULT` 以 `BUSINESS_ERROR` 整批终止，随后 `refreshSession + load` 恢复会话正常。

## 根因

1. **凭据撤销被瞬时会话波动放大**：后台 `persistConnection()` 在连接快照变为 `expired/unauthenticated` 时调用 `revokeOtherOwners('')`，撤销全部下载凭据（账号绑定的既有安全策略）。会话探测的瞬时波动（本次 refreshSession 前后）把这一策略触发成"传输中凭据被回收"。
2. **流程层没有容灾**：凭据一旦失效，`nativeStreamArchive` 立即终态失败，整批 495 个附件终止。实际上后台任务缓存是持久的（附件分片、取名检查点、ZIP 水位都在 IndexedDB），`start` 以同一 taskId 重启即可从检查点续跑——工作台的「继续下载」走的正是这条路，但当时只能人工点击。
3. **原生下载管道无自愈**：`_patmail_native_download` 请求早期失败后下载项停滞在 0 字节，没有任何重开目标的机制，进一步延长了停滞时间。

## 容灾改动

- `src/api/download-failure.ts`：新增 `isResumableDownloadInterruption`（可续跑中断分类）与 `runWithDownloadRecovery`（按同一持久任务自动续跑，指数退避）。可续跑：凭据失效、来源页面或账号暂离、保存文件工作台未响应、回执/初始化超时、封存未确认关闭；不可续跑（立即上抛）：用户暂停、取消、被新恢复请求接管、任务已完成。
- `src/content/index.ts`：流水下载包裹自动续跑（最多 3 次，间隔 2s/4s/6s），续跑沿用同一 taskId 的持久缓存；成功通知附续跑次数，重试用尽时提示"任务缓存已保留，可在工作台点「继续下载」"。
- `src/utils/stream-download.ts`：新增 `onTaskId` 回调，把后台分配的任务号回报给调用方，续跑即使在工作台未预分配 taskId 时也能凭同一任务恢复。

## 验证

- 新增 `tests/unit/api/download-stream-recovery.test.ts`：可续跑分类边界、续跑重试/退避/放弃语义、"凭据中断后续跑同一持久任务（已缓存附件零网络请求、ZIP 完整收尾）"端到端用例。
- 全量单测 965/965 通过；改动文件 ESLint 无新增问题；`pnpm build`（vue-tsc + 两次 vite 构建）通过。

## 遗留

- 原生下载项停滞（请求失败后水位长期 0）尚无看门狗：仅凭水位判断会误伤"首个大附件仍在取包"的正常慢速，需要结合附件缓存活跃度再做。
- 会话波动撤销凭据是账号绑定的安全策略，未放松；由流程层续跑兜底。
