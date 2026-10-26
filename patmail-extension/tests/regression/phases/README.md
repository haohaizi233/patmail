> 本文件是测试结构重构时生成的映射与维护说明。

# tests/regression/phases 测试说明

## 1. 这批测试的定位

`tests/regression/phases/` 保存的是**历史阶段（Phase 2.3 ～ Phase 3.9）交付时锁定的跨模块业务契约与回归断言**。它们的特点：

- 每个文件都同时跨越多个 `src/` 模块（如 background + automation + mail + workflow），断言的是"当时定下来的业务规则"而不是某个函数的输入输出。例如"UNKNOWN 任务已发请求就不能再被覆盖保存""字典名不升格为已验证邮件参数""写开关默认开放且 502 不算成功"。
- 这些断言对应的背景决策记录在 `docs/phase*-*.md`（当时的方案、验收与结项报告）。测试是这些决策的可执行形态，是防止历史缺陷复发的回归防线。
- 文件名保留重构前的名字（`phase2-6.test.ts` 等），但**文件名与其中的 describe 名称并不总是一致**（例如 `phase2-6.test.ts` 里是 `Phase 2.5 收口`，`phase2-7.test.ts` 里是 `Phase 2.6 重新规划`）。以文件名做索引，以 describe 名做语义锚点。

**新测试放在哪里：**

| 场景 | 放置位置 |
| --- | --- |
| 单个稳定业务模块的函数/类行为（如字典缓存、发文分组、schema 解析） | `tests/unit/<模块>/`（agent、api、automation、content、customer、filing、mail、pct、query、ui、workflow） |
| 跨模块协作流程（background 消息路由、EASY 传输、打包/加载等运行时链路） | `tests/integration/`（background、easy、packaging） |
| 修复了一个历史缺陷，且该缺陷属于某阶段定下的跨模块业务契约 | `tests/regression/phases/`（新建 `phaseX-Y-<主题>.test.ts` 或并入语义相近的既有文件） |
| 仅是重构后新代码的常规覆盖 | 不进本目录，按模块归 `tests/unit/<模块>/` |

简言之：**只有"跨模块的历史业务契约/回归断言"才进这里**；单模块行为进 unit，模块间链路进 integration。

## 2. 文件条目表

用例数量统计方式：`npx vitest run tests/regression/phases --reporter=json`（2026-10-26 校验，与 `it(`/`test(` 计数一致；本目录无 `it.each`，每个 `it` 即一个用例）。

| 文件名（新路径 `tests/regression/phases/`） | 原始路径（重构前） | 包含的顶层 describe | 用例数 | 涉及的业务语义 | 主要被测 src 模块 |
| --- | --- | --- | --- | --- | --- |
| `phase2-3.test.ts` | `tests/phase2-3.test.ts` | 查询范围；基础字典；文件描述树和 Schema；模板加载竞态和本地配置 | 8 | 查询范围校验（拒状态标志、认业务过滤/日期）；字典数组形态与缓存去重、登录态拒绝、自定义列/列表列解析；文件描述树构建/排序/搜索/坏链上报、按案件类型过滤选项、内部 ID 显示解析、表单值转字段；模板加载只提交最新一次、dispose 后不生效、不覆盖不兼容模板包、并发编辑保留 | `api/dictionaries`、`api/file-search-params`、`api/transport`、`query/load-coordinator`、`query/repository`、`schema/{dependencies,file-type-tree,resolver,validators}`、`storage/query-bundle` |
| `phase2-4.test.ts` | `tests/phase2-4.test.ts` | 文件描述显示；字典缓存世代；文件选择；发文分组；发文类型映射和草稿；发文配置存储；发文类型字典 | 11 | 保存 ID 与历史文本走同一解析器、历史文本是 ID 串时不冒充名字、多选值逐个转人名再拼接；失效请求不回灌缓存；跨页按文件 ID 选择去重；仅同客户同描述合并、一客户双描述时按映射取查询方式；发文类型精确 ID 匹配、缺/停用映射拦截、草稿主题正文不执行模板文本；发文配置按账号隔离、写排队、拒收损坏/外来数据；发文类型字典坏载荷不造 ID | `api/dictionaries`、`api/transport`、`schema/{resolver,file-type-tree}`、`mail`（index：选择/分组/主题正文/绑定/映射/存储键）、`mail/fingerprint` |
| `phase2-5.test.ts` | `tests/phase2-5.test.ts` | 客户身份和映射；创建契约；邮件读取和保存；消息门禁 | 12 | 不合并不同已确认客户与冲突映射；按文件序构造合并请求、未确认单发改拒发、写开关关闭不调 EASY、UNKNOWN 创建不重发、响应丢失记 UNKNOWN 且后续读失败仍留邮件 ID；PatMail 字段映射到保存名、拒收 profile ID 与文件不符、保存→绑定→复读核对文件 ID、保存失败/未知/文件 ID 格式未确认不绑定、复读与计划不符记部分失败、读信 ID 或登录态不符拒收；创建消息需显式确认、无会话不从运行时建信 | `api/{client,transport}`、`mail/easy/{adapter,contracts,gate,read-service,runtime,state,store,types}`、`mail`、`mail/fingerprint`、`shared/message` |
| `phase2-6.test.ts` | `tests/phase2-6.test.ts` | Phase 2.5 收口；流程读取 | 8 | 保存前展示真实差异、复读变化即中止；指纹按当前选择重算而非调用方字符串；同一运行时一个指纹只进一次 MailCustomer；两个执行存储无法构成 chrome.storage 原子；流程信息/历史/紧急度读取且历史与当前活动分离；未验证邮件拦截、空/非法/登出/网关响应拒绝；不按名字取第一个节点或审核人；模拟提交构造、版本过期拒收、UNKNOWN 结果不重试 | `api/transport`、`mail/easy/{gate,runtime,store}`、`mail`、`mail/fingerprint`、`workflow/{gate,submit-builder,contracts,store,runtime}` |
| `phase2-7.test.ts` | `tests/phase2-7.test.ts` | Phase 2.6 重新规划；Dry-run；执行协调与恢复；接口契约与写开关 | 11 | 节点/审核人/紧急度/备注变化即弃旧计划、刷新见新流程版本弃计划并回只读视图、中断提交记 UNKNOWN 不再发送；Dry-run 一客户一描述合并其余拆分且不调 fetch、伪造指纹/规则版本变化记过期；每指纹一个属主且第二指纹独立、双标签各自加锁无法证明互斥、协调器重启后恢复已发请求并拒二次认领、调用前落写检查点且未知创建停发、任务不跨账号且诊断脱敏；写开关默认开放、502 不算 GetFlowSubmit 成功 | `api/{client,transport}`、`automation/{contract-evidence,coordinator,checkpoint,dry-run,executor,logger,recovery,repository,state,task-builder,task-validator}`、`mail/easy/gate`、`workflow/gate` |
| `phase2-8.test.ts` | `tests/phase2-8.test.ts` | 任务身份；任务存储；执行记录事务；Dry-run 与契约 | 5 | UUID 任务 ID 与稳定内容哈希；旧 ID 保留为迁移记录、不清未知邮件；任务保存/重载/迁移/拒归档未知任务；一指纹一属主、检查点存不下即停；Dry-run 只做阶段计划不调 fetch、模拟/502 证据不升格 | `automation/{task-builder,task-service,repository,ledger,checkpoint-service,contract-capture,easy-acceptance,stage-plan,dry-run,sha256}`、`api/transport`、`mail`、`mail/easy/gate`、`workflow/gate` |
| `phase2-9.test.ts` | `tests/phase2-9.test.ts` | 用户命名空间与快照；租约与迁移；验收、契约与测试写 | 6 | 操作人 guid 未确认前不落盘不列任务、冻结快照不受实时规则/绑定/客户 ID 变化影响；未发租约释放、已发租约保持 UNKNOWN、迁移中保存的任务与迁移任务并存；拦截写调用/502/过期会话/字段不符/模拟替代；HAR 条目脱敏、markSent 成功前拒写 | `automation/{acceptance-runner,checkpoint-service,evidence-store,har-import,indexed-store,ledger,repository,task-builder,task-service,task-validator,test-write,verifiers}`、`background/authority`、`mail`、`workflow/gate` |
| `phase3-0.test.ts` | `tests/phase3-0.test.ts` | 完整页面入口与连接；完整页面数据与证据 | 10 | 图标路径保留在单个应用标签页、移除 popup（读 manifest/源码断言）；一个已登录标签接入、多账号手选、工作区打开时跟随单账号、刷新后重读登录态；标签关闭/刷新/离开 EASY/换人即解绑、同人接回换人待确认；工作区单页复用并聚焦；客户与规则留在确认账号内、变更任务标记过期；整页不读他人操作数据、不自铸通过凭证；跨页选文件并构建本地计划、不谎称已发送 | `background/{workspace,account-data,scope,authority}`、`automation/{acceptance-trust,evidence-store,ledger,indexed-store,task-builder,contract-capture}`、`app/record-status`、`shared/{connection,message}`、`mail`、`workflow/gate` |
| `phase3-1.test.ts` | `tests/phase3-1.test.ts` | Phase 3.1 连接、规则与任务来源 | 6 | 只恢复待定候选、忽略过期会话结果；鹏城实验室站点按可绑定 EASY 页面处理；客户覆盖保留、过期规则包拒收；仅 EASY origin 的消息可存任务；缺业务参数的验收调用在发请求前拦截；验收记录带回只读探测字段；floating 页面源码不使用 location.origin（源码断言） | `background/{workspace,account-data,scope,authority}`、`automation/{acceptance-context,evidence-store,ledger,indexed-store,task-builder}`、`mail`、`mail/repository`、`shared/{connection,message}` |
| `phase3-2.test.ts` | `tests/phase3-2.test.ts` | Phase 3.2 写入入口、账号隔离与只读契约 | 6 | 期限发文用该账号发文映射的默认审核人、不信任页面审核人、操作账号不变；未配置默认审核人不向 EASY 转发创建；迟到账号响应与过期表单保存拒收；共享客户保存标记任务过期、伪造任务拒收；连接快照写不重复、两个编辑器走后台路径（源码断言）；请求字段按已确认信息构造、业务/模拟失败不通过 | `background/{workspace,account-data,authority}`、`automation/{acceptance-runner,readonly-contracts,ledger,indexed-store,task-builder,evidence-store}`、`app/composables/useWorkspace`、`shared/{connection,message}`、`mail`、`workflow/gate` |
| `phase3-3.test.ts` | `tests/phase3-3.test.ts` | Phase 3.3 可信任务、模板摘要与账号事务 | 5 | 已发请求的 UNKNOWN 任务不被 SaveTask 覆盖；模板内容变化即标记过期（与客户时间戳无关）；读/存中途切账号不串号；后起读取不丢变更回执、存储事件合并；手工字段比对不算独立 UI 比对 | `automation/{query-dependency,snapshot,task-builder,task-validator,acceptance-runner,ledger,indexed-store,evidence-store}`、`background/{workspace,account-data,authority}`、`app/composables/useWorkspace`、`query/query-types`、`shared/{connection,message}`、`mail`、`workflow/gate` |
| `phase3-4.test.ts` | `tests/phase3-4.test.ts` | Phase 3.4 任务权威、依赖范围与文件来源 | 8 | 伪造完成项与从未发请求的"已验证检查点"拒收；过期 READY 更新与原子迁移竞态保持 UNKNOWN；模板字段摘要编码无换行/等号冲突；只对任务真正引用的客户标记过期；覆盖客户需预期 revision；逐条返回同账号变更回执；文件来源仅对观测搜索中的 ID 升级；未确认契约保持待定、生产写保持关闭 | `automation/{ledger,indexed-store,readonly-contracts,query-dependency,task-builder,task-validator,evidence-store,acceptance-runner}`、`background/{workspace,account-data,authority}`、`app/composables/useWorkspace`、`shared/{connection,message}`、`query/query-types`、`mail`、`workflow/gate` |
| `phase3-5.test.ts` | `tests/phase3-5.test.ts` | Phase 3.5 查询会话、文件字段与任务回执 | 6 | 同一查询跨页文件合并、不同查询隔离；篡改的文件字段用查询快照重建、本地绑定保留；内存缓存丢失可从存储恢复查询会话、存储被清即失效；返回 PROTECTED_EVIDENCE 而非静默保存、UNKNOWN 不翻成 STALE；任务复验失败时规则保存照常上报；页面伪造文件经工作区桥接拒收且写保持关闭 | `automation/{file-search-snapshot,indexed-store,task-builder,task-validator,evidence-store}`、`background/{workspace,account-data}`、`api/file-search-types`、`shared/{connection,message}`、`query/query-types`、`mail`、`workflow/gate` |
| `phase3-6.test.ts` | `tests/phase3-6.test.ts` | Phase 3.6 查询快照与内部标识 | 9 | 同页重查丢弃消失文件、异页存留文件保留、新查询开新运行不混旧数据、页大小变化不追加旧页布局；未验证内部 ID 不随真实文件 ID 提交；描述 ID 仅在字典唯一匹配时解析、记忆字典不接受首个歧义 guid；账号变更后丢弃迟到搜索结果；IndexedDB 持久化失败不恢复快照 | `automation/{file-search-snapshot,file-description-resolver,indexed-store,evidence-store}`、`background/workspace`、`shared/{connection,message}`、`api/file-search-types` |
| `phase3-7.test.ts` | `tests/phase3-7.test.ts` | Phase 3.7 查询证据 | 12 | 同 ID 业务字段一致去重；同页描述/客户冲突保留且不授予观测信任；跨页一致接受、跨页冲突标记、后页快照消除分歧后重算；旧页时效不因后页读取而延长；仅存内存的观察不算可恢复；保存失败留痕不掩盖当前观察；未知续页拒绝而非沿用旧运行；唯一字典名不升格为已验证邮件参数；客户 guid 与描述 ID 未验证时关闭写阶段 | `automation/{file-search-snapshot,file-description-resolver,task-builder,stage-plan,contract-capture}`、`schema/file-type-tree`、`mail`、`workflow/gate` |
| `phase3-8.test.ts` | `tests/phase3-8.test.ts` | Phase 3.8 恢复与证据时间 | 8 | 翻页失败残留的旧磁盘记录不采信；重启后恢复的会话仅作历史；缺 IndexedDB 不把内存 Map 当持久化库；旧记录未记持久化则不升级；任务证据重开即过期但不改原观察时间；他文件旧页过期不影响新页有效；证据过期后可接受新查询；客户/描述 ID 未确认时写阶段保持关闭 | `automation/{task-builder,stage-plan,evidence-evaluation,file-search-snapshot,contract-capture}`、`mail`、`workflow/gate` |
| `phase3-9.test.ts` | `tests/phase3-9.test.ts` | Phase 3.9 当前来源与证据聚合 | 8 | 已移除文件在已存任务上不再可信；新增页不撤销未变化文件；同 ID 换描述/客户需复验；重启磁盘记录仅作历史、待用户再查询；缺失持久化值不聚合成 PERSISTED；证据时间缺失/非法不算新鲜；已发任务失去当前文件来源保留检查点；信任由后台重算、不信页面结论 | `automation/{evidence-evaluation,file-search-snapshot,evidence-store,ledger,task-builder,task-validator,stage-plan,contract-capture}`、`background/authority`、`mail`、`workflow/gate` |

**describe 命名与文件名不一致提醒**：`phase2-6.test.ts` 的主 describe 是 `Phase 2.5 收口`，`phase2-7.test.ts` 的主 describe 是 `Phase 2.6 重新规划`；`phase2-3/2-4/2-5/2-8/2-9/3-0` 使用纯业务名（如 `基础字典`、`任务身份`）。检索语义时以 describe 名为准，检索文件时以文件名为准。

## 3. 迁移映射表

本次重构对这 17 个文件做的是**平移 + 相对导入深度调整**，测试名称、describe 结构、断言内容全部未改：

| 重构前 | 重构后 |
| --- | --- |
| `tests/phase2-3.test.ts` | `tests/regression/phases/phase2-3.test.ts` |
| `tests/phase2-4.test.ts` | `tests/regression/phases/phase2-4.test.ts` |
| `tests/phase2-5.test.ts` | `tests/regression/phases/phase2-5.test.ts` |
| `tests/phase2-6.test.ts` | `tests/regression/phases/phase2-6.test.ts` |
| `tests/phase2-7.test.ts` | `tests/regression/phases/phase2-7.test.ts` |
| `tests/phase2-8.test.ts` | `tests/regression/phases/phase2-8.test.ts` |
| `tests/phase2-9.test.ts` | `tests/regression/phases/phase2-9.test.ts` |
| `tests/phase3-0.test.ts` | `tests/regression/phases/phase3-0.test.ts` |
| `tests/phase3-1.test.ts` | `tests/regression/phases/phase3-1.test.ts` |
| `tests/phase3-2.test.ts` | `tests/regression/phases/phase3-2.test.ts` |
| `tests/phase3-3.test.ts` | `tests/regression/phases/phase3-3.test.ts` |
| `tests/phase3-4.test.ts` | `tests/regression/phases/phase3-4.test.ts` |
| `tests/phase3-5.test.ts` | `tests/regression/phases/phase3-5.test.ts` |
| `tests/phase3-6.test.ts` | `tests/regression/phases/phase3-6.test.ts` |
| `tests/phase3-7.test.ts` | `tests/regression/phases/phase3-7.test.ts` |
| `tests/phase3-8.test.ts` | `tests/regression/phases/phase3-8.test.ts` |
| `tests/phase3-9.test.ts` | `tests/regression/phases/phase3-9.test.ts` |

移动时改动的内容（仅此两类）：

1. **导入前缀加深两级**：`from '../src/...'` → `from '../../../src/...'`（`tests/` → `tests/regression/phases/`）。`from 'vitest'` 不变。
2. **`process.cwd()` 读源码改走 `tests/helpers/project.ts`**：原先用 `process.cwd()` + `readFileSync` 读 `manifest.json`、`src/content/index.ts`、`src/app/App.vue`、`src/app/pages/CustomersPage.vue`、`src/floating/*.vue` 做源码断言的文件（`phase3-0`、`phase3-1`、`phase3-2`），改为 `import { projectPath } from '../../helpers/project'` 后 `readFileSync(projectPath('src/...'), 'utf8')`。`projectPath` 从测试文件向上定位最近的 `package.json` 确定项目根，不依赖 cwd。

其余（用例名、describe 名、fixture、断言）逐字未动。校验：`npx vitest run tests/regression/phases` 17 个文件全部通过。

## 4. 维护约定

**如何定位历史语义**

- 文件名 = 迁移批次号（`phaseX-Y`）；describe 名 = 当时交付时的阶段名；两者不一致时以 describe 为准。
- 背景决策看 `docs/`：`docs/phase*-*.md` 是当时的计划/架构/验收/结项报告（例如 `docs/phase2-7-checkpoint-recovery.md`、`docs/phase3-7-query-evidence.md`、`docs/phase3-9-evidence-aggregation.md`）。**`docs/` 只读引用，不要修改**；测试与文档冲突时，以代码当前行为 + 结项报告的验收结论共同判断，再最小化修正测试。
- 修改这些文件时：优先只动断言期望值并在提交说明里写清"哪条历史契约被有意变更"；不要顺手重构测试结构（那是后续批次的事）。

**日后可迁出到业务模块的 describe（仅建议，本次不执行）**

| describe（所在文件） | 建议目标 | 理由 |
| --- | --- | --- |
| 查询范围、基础字典（`phase2-3`） | `tests/unit/api/` | `assessQueryScope`、字典 adapters/cache/service 是稳定单模块纯逻辑，且 `tests/unit/api/` 已有 `file-search-params.test.ts` 等同类测试，可并入 |
| 文件描述树和 Schema（`phase2-3`） | `tests/unit/query/` | 只涉及 `schema/*` 的构建/过滤/解析/校验，无跨模块链路 |
| 模板加载竞态和本地配置（`phase2-3`） | `tests/unit/query/` | `query/load-coordinator`、`query/repository`、`storage/query-bundle` 的单模块竞态语义 |
| 字典缓存世代、发文类型字典（`phase2-4`） | `tests/unit/api/` | 字典缓存与载荷容错是 `api/dictionaries` 的模块内契约 |
| 文件描述显示（`phase2-4`） | `tests/unit/query/` 或 `tests/unit/ui/` | `schema/resolver` 的 ID→名称显示规则，单模块可测 |
| 文件选择、发文分组、发文类型映射和草稿、发文配置存储（`phase2-4`） | `tests/unit/mail/` | 全部是 `mail` index 的纯函数/仓储行为，`tests/unit/mail/` 已有大量同类测试 |
| 客户身份和映射、消息门禁（`phase2-5`） | `tests/unit/mail/` | 映射合并规则与消息确认门禁是纯函数契约 |
| 创建契约、邮件读取和保存（`phase2-5`） | `tests/integration/easy/` | 走 `EasyRuntime` + transport 假件的链路验证，与 `tests/integration/easy/` 现有用例同层 |
| Phase 2.5 收口（`phase2-6`） | `tests/unit/mail/` | 差异预览、指纹重算、单次进入、存储非原子均为 `mail/easy` 模块内语义 |
| 流程读取（`phase2-6`） | `tests/unit/workflow/` | `workflow/contracts`、`submit-builder`、`runtime`、`store` 的模块内契约 |
| 任务身份、任务存储、执行记录事务、Dry-run 与契约（`phase2-8`） | `tests/unit/automation/` | 任务身份/持久化/台账/证据等级都是 `automation` 单模块稳定逻辑，`tests/unit/automation/` 已有 `wal-ledger.test.ts` 等同类 |
| 租约与迁移（`phase2-9`） | `tests/unit/automation/` | 租约释放与迁移并发是 repository/task-service 的模块内行为 |
| Dry-run、执行协调与恢复、接口契约与写开关（`phase2-7`）中单模块部分 | `tests/unit/automation/`（纯逻辑） | `dry-run`、`checkpoint`、`state` 的纯函数部分可下沉；**跨标签互斥/协调器恢复属跨模块契约，建议留在本目录** |
| Phase 3.6 查询快照与内部标识（`phase3-6`）、Phase 3.7 查询证据（`phase3-7`） | `tests/unit/automation/` | 主要锚定 `automation/file-search-snapshot`、`file-description-resolver` 两个模块；若这两个模块 API 稳定不再演进，可整体下沉 |

**建议保留在本目录**：`phase2-7`（含跨标签协调/恢复的全局契约）、`phase3-0` ～ `phase3-5`、`phase3-8`、`phase3-9`——这些断言横跨 background 消息路由、账号隔离、证据时间、写开关等多个模块，是典型的"历史阶段验收契约"，拆开后单模块测试无法表达其语义。

迁出时的注意：只改文件位置与导入深度，断言不动；迁出后在本 README 的条目表里更新对应行，并在 `docs/` 之外（如提交说明）记录迁移动因。

## 5. 校验记录

- 2026-10-26：`npx vitest run tests/regression/phases` → 17 个文件、56 个 describe、139 个用例全部通过（`--reporter=json` 复核计数：total=139，passed=139，failed=0）。
