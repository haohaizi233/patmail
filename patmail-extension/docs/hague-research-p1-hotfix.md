# Hague Research P1 Hotfix 验收记录

日期：2026-11-14。分支：`fix/hague-research-p1-hotfix`。

开始前工作区干净；执行 `git fetch origin` 后，HEAD 和 `origin/main` 均为审计基线 `93d9d259691ad6f4474f196bee7e4014d8626e28`。三个缺陷均仍存在，没有覆盖后续修复。补丁只涉及诊断模块、原有测试及本记录。

## A. 代码变更与根因

| 缺陷 | 文件 | 最小修复 |
| --- | --- | --- |
| FIX-01 / FIX-02：Worker 动作字段被忽略，集合比较漏掉顺序 | `scripts/hague-research-worker.mjs`、`src/hague/diagnostics/protocol/jsf-diff.mjs` / `.d.mts` | Worker 使用标准 `actionTypes`，显式标记观测有效性。比较器在同一模块内规范化旧 `expectedActions`、`observedActions`、`actionTypes` 及原有 `actions`；缺失、非法或互相冲突的动作字段不能构成相同证据。逐项保留顺序及重复次数，增加 `action_sequence_changed`。空数组与未采集明确区分。解析失败或不支持的协议为 `unresolved`。 |
| FIX-03 / FIX-04：把有指纹误当作已比较；只选首个结论 | Worker、`src/hague/diagnostics/reports.ts`、`schema.mjs`、`trace.ts` | Worker 无基线也显式输出 `baseline_missing`，以 `driftCompared` 标明有效比较。报告对所有相关观测确定性聚合，经过白名单清洗后仍保留标记。可信漂移优先；不完整比较、缺失与有效比较混合、多版本基线均不能整体输出 `no_drift`。JSON 和 Markdown 同时显示版本列表及部分结论标记。静态 AST 指纹不作为运行时比较。 |
| FIX-05 / FIX-06：取消丢失身份，退化为全局 requestId 搜索 | `scripts/hague-research.mjs`、`src/hague/diagnostics/protocol/jsf-state-machine.mjs` / `.d.mts` | 从原请求注册表取回 Session、Target、Frame、Loader、Form，验证身份后先通知 Worker 再删除本地记录；未知请求不发送清理。状态机只删除唯一匹配的注册请求，拒绝无 Session 或非法、歧义 Scope。异步摘要计算前后校验同一请求记录和 Document 仍有效，取消后的迟到结果不能写入 ViewState 历史。 |

报告规则：可信 `drift_detected` 优先；否则存在 `unresolved`、混合缺基线或多版本基线则为 `unresolved`；全部缺基线或没有协议观测为 `baseline_missing`；只有全部有效比较且同版本无差异才为 `no_drift`。已证明的漂移可以在部分观测不完整时保留，同时标记 `driftPartial`。

独立审查补充了正文读取失败 / 超限 / 不支持、XML 分析跳过造成的缺失观测：即使它们没有产生 `jsf.parsed`，也必须阻止整体 `no_drift`。成功的正文伴随事件和 AST 跳过不会误判成 XML 缺失。该项先取得 4 项失败测试再修复；同时补测未知 namespace / ViewState 行为为 `unresolved`，不把未知值当成已证明变化。独立复核确认上述问题关闭，没有其他重要发现。

## B. 失败转通过证据

先写回归测试，运行原实现确认失败，再修改实现。最终测试又在 `test-results/p1-baseline` 中针对审计提交的隔离代码重放，结果为 **4 个文件、70 项测试，其中 19 失败 / 51 通过**；补丁代码同组测试 **70 / 70 通过**。隔离基线及日志均为本机生成物，不提交。

| 复现输入 | 修复前 | 修复后 | 精确测试位置 |
| --- | --- | --- | --- |
| 基线 `update → extension`，真实 Worker 解析到 `redirect` | 动作字段未参与比较，可能误报相同 | `drift_detected`，`driftCompared: true` | `tests/unit/hague/research-full-chain.test.ts`：`P1 Worker drift and report evidence` |
| 基线 `update → eval`，观测 `eval → update` | 仅检查包含关系，漏掉顺序 | `action_sequence_changed` | `tests/unit/hague/jsf-diff.test.ts`：`P1 canonical action observations`；上述真实 Worker 测试 |
| 动作信息缺失、失败 XML、不支持的 HTML、合法空动作数组 | 空列表回退掩盖未知，可能 `no_drift` | 前三者 `unresolved`；只有有效空数组与空基线相同才 `no_drift` | 同上两文件 |
| 有指纹、无基线；或仅声明 `no_drift` 没有有效比较 | 无基线也可能 `no_drift` | 分别 `baseline_missing` / `unresolved` | `research-full-chain.test.ts`：参数化报告测试 |
| 多请求：缺基线 / 有漂移 / 无漂移；不同基线版本 | 首个状态掩盖后续漂移或不可比性 | 前者 `drift_detected`，后者 `unresolved`；逆序输入一致 | 同上；同时断言重复清洗、JSON 和 Markdown |
| Session A、B 都有 requestId `123`，取消 A | B 一并被删 | A 不可验证，B 保持并正常提交其状态 | `jsf-state-machine.test.ts`：`P1 scoped cancellation`；`research-full-chain.test.ts`：真实 Worker 取消测试 |
| 同 Session 不同 Frame / Loader / Form；非法或歧义 Scope | 缺 Scope 存在全局删除风险 | 精确 Scope 只清理一项；未知或歧义 Scope 保留其他请求；重复取消幂等 | `jsf-state-machine.test.ts`：参数化身份及恶意调用测试 |
| 取消发生在正文读取、XML 解析前或摘要计算期间；清理后迟到取消、重新启用 Research | 身份丢失，或迟到解析仍可写状态 | 无取消后解析事件，计数和租约释放；无跨 Session 写入；未知取消无信号 | 上述状态机 / Worker 测试；`tests/unit/scripts/hague-research.test.ts` 的取消与重新启用测试 |

原始失败日志：`test-results/p1-hotfix-red.log`；最终测试对审计基线的重放：`test-results/p1-baseline-red.log`；全量测试日志：`test-results/p1-hotfix-full-suite.log`。

## C. 兼容性

- `computeProtocolFingerprint()` 的算法、序列化字段顺序和 `proto:` 格式未改。Worker 去掉重复的 `actions` 后，同一动作序列由 `actionTypes` 产生相同指纹。
- 原基线字段继续接受；字段冲突或证据不足保守标为未知，不静默选一个字段。
- Trace 版本仍为 1，增加可选布尔字段 `driftCompared`，并允许既有诊断原因码 `baseline_missing` / `insufficient_data` 通过清洗；报告增加 `baselineVersions` / `driftPartial`。旧事件可读，但没有有效比较标记时不承诺 `no_drift`。
- Worker 请求消息种类未改；返回增加可选标记，无基线时返回明确状态。取消消息仍为 `forget_request`，只是补齐原有 Scope 字段。数字基线版本转成字符串，以满足原有 Trace 白名单。
- 修复共享 Worker 投影、Trace 白名单和全链路测试，以一个原子 Hotfix 提交交付，避免中间提交暴露不一致契约。

## D. 安全与业务边界

- ViewState 原文仍只在 Worker 内参与有界解析和私有 HMAC；取消既不删无关 Document 历史，也不提交已经失效请求的结果。测试严格检查原文不出 Worker。
- 保留 Research 随 CDP 自动启用、原授权边界、超时、队列与正文预算、XML / AST 限制、敏感信息清洗和六层证据模型。
- 未改 EASY、海牙草稿执行、成功回执判断或 UI；没有增加写入权限，没有发起真实海牙业务请求。
- 开始前读取本机 CDP 状态和近期日志。实际会话监听服务未重启，未为本补丁建立现场 CDP 连接。
- 检查发现 `pnpm build` 会启动或复用 Observer，因此未运行。E2E 使用独立临时浏览器及本地响应夹具，所有 HTTP 目的地在实际网络 I/O 前拦截；`externalRequests: 0`、`paused: 0`，未操作用户浏览器。

## E. 验证结果与范围

| 实际执行命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm exec vitest run tests/unit/hague/jsf-diff.test.ts` | 10 / 10 |
| `pnpm exec vitest run tests/unit/hague/jsf-state-machine.test.ts` | 18 / 18 |
| `pnpm exec vitest run tests/unit/hague/research-full-chain.test.ts` | 19 / 19 |
| `pnpm exec vitest run tests/unit/scripts/hague-research.test.ts` | 23 / 23 |
| `pnpm exec vitest run tests/unit/hague --maxWorkers=4` | 62 文件，408 / 408 |
| `pnpm test:regression --maxWorkers=4` | 17 文件，139 / 139 |
| `pnpm exec vitest run --maxWorkers=4` | 271 文件，1894 / 1894 |
| `pnpm lint` | 基线门禁 PASS；历史存量 432 errors / 25 warnings，未放宽基线 |
| `pnpm scan:secrets` | PASS，0 error；247 个历史 warn、5 个登记例外 |
| `pnpm licenses:check` | PASS，26 个直接依赖许可通过 |
| `HAGUE_TEST_CHROME=本机Chrome node tests/e2e/hague-research.e2e.mjs` | PASS；1 次正文读取、1 个 AST 证据、exact 关联；0 外部请求 |
| `git diff --check` | PASS |

**结论：PASS（本地 Hotfix 验收）。** FIX-01 至 FIX-08 在上述范围通过。未运行具有 Observer 副作用的打包脚本、真实站点草稿回归或远端 GitHub Actions；没有推送、合并 main，也没有将本地历史 lint 告警宣称为零告警。

## F. 分批交付补记（2026-11-14）

本节记录 A–E 验收之后的实际入库方式，不改变上述验收结论。原 Hotfix 以一个原子提交 `310924d` 完成本地验收；推送到 `haohaizi233/main` 时按依赖关系拆为 4 批依次进入：

| 批次 | commit | 内容 |
| --- | --- | --- |
| 1 | `fd08bf6` | 协议漂移证据规范化：`jsf-diff.mjs` / `.d.mts`、`schema.mjs`、`trace.ts`、`jsf-diff.test.ts` |
| 2 | `0e31ced` | ViewState 取消作用域隔离：`jsf-state-machine.mjs` / `.d.mts`、`hague-research.mjs` 及两项单测 |
| 3 | `f01a7a1` | Worker 观测标记与报告确定性聚合：`hague-research-worker.mjs`、`reports.ts`、`research-full-chain.test.ts` |
| 4 | 本提交 | 本验收记录及本节补记 |

每批在推送前，都以「只含该批及之前改动」的代码树单独运行对应定向单测（10 / 41 / 19 例通过）；完整门禁 4 步与全量 1894 例回归在原原子提交上运行通过，其代码树与最终 `src`、`scripts`、`tests` 三个目录完全一致。最终入库树与原原子提交的差异仅为本节补记。

原 C 节「以一个原子 Hotfix 提交交付」描述的是验收当时的形态，E 节「没有推送、合并 main」也是验收时点状态；最终入库历史为上表 4 个提交。远端 GitHub Actions 以最终 head 单独复核。
