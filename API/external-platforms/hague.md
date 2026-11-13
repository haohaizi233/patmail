# WIPO eHague 接口与草稿调用契约

更新：2026-11-13。本文依据当前仓库实现、原站 DOM/PrimeFaces 元数据及本机 CDP 排障经验整理，是本项目的集成契约，不是 WIPO 官方公开 API 规范。范围为材料读取、草稿填写、Summary 与下载、草稿保存；正式递交、付款及登录认证协议未实现。

相关文档：[技术算法与容灾](../../patmail-extension/docs/mechanisms/海牙接口链与容灾算法.md)、[工作流操作说明](../../patmail-extension/docs/workflows/海牙新申请.md)、[CDP 监听约束](../../patmail-extension/docs/cdp-observer.md)。

## 1. 当前架构与验证等级

目标站是有状态的 JSF / PrimeFaces 应用。业务动作共享 XHTML 地址，通过运行时组件 ID、ViewState、表单和 partial response 表达，不能按无状态 JSON REST API 使用。

| 名称 | 含义 | 当前实现 |
|---|---|---|
| WIPO HTTP | 原站 GET、JSF POST、multipart、资源读取 | `HagueHttpContext` 与 `HagueHttpDriver` |
| 页面填写 | 在真实页面操作同一套业务控件 | `executeDraftPage` + 草稿 RPC |
| 接口链 | 在独立 detached Document 中维护本案页面状态，经已登录官方标签页发送 HTTP | 工作流默认选项，批量默认6路，可选1–6路 |
| 扩展 RPC | `chrome.runtime.sendMessage` 内部消息 | 不能直接向 WIPO 发送这些 JSON |
| 本地 PDF 输出 | 离线渲染与 Chrome 打印 | 不是 WIPO 独立 PDF 下载接口 |

验证证据分开记录：

- **真实站点已验证**：本批 13 件最终保存在 13 个不同 reference 下，13 份 Summary PDF 下载完成；既有编号续接、CN/SG 法人、分页定位、图纸与 PDF 等在本批实际处理过。
- **现场辅助恢复**：本批部分异常由 CDP 核对回执后续接，不能据此断言后加的自动恢复全量生产验收通过。
- **自动恢复代码验证**：2026-11-13 海牙 149 项测试、类型检查、ESLint 基线门禁、根目录和扩展构建通过；包含故障注入与刷新中断测试。
- **当前边界**：新增自动恢复的后续真实只读核查未取得 Draft(s) 入口，返回 unknown，没有进行业务写入；新自动恢复尚无一轮全量真实成功回归。

本页替代此前研究阶段“没有通用请求拼装器、仅页面驱动、纯接口尚未接入”的结论。历史实验不再作为当前能力描述。

## 2. 原站 HTTP 地址

Origin 固定为 `https://hague.wipo.int`。下表路径相对此 origin。

| 路径 | 方法与用途 | 限制 |
|---|---|---|
| `/#/landing/home` | 官方入口 | hash 不是服务端 API |
| `/HagueEFilingWeb/protected/portfolioManager.xhtml` | GET 初始化/登录探针；POST 准备、创建、Draft(s) 查询、打开、分页 | 创建必须取得编号；不能仅凭 200 判断成功 |
| `/HagueEFilingWeb/protected/page/application.xhtml` | GET/POST 草稿编辑、表单更新、上传 | 每案独立组件树与 ViewState |
| `/HagueEFilingWeb/protected/page/summary.xhtml` | GET Summary；POST 返回编辑器 | POST 仅放行 `javax.faces.source=headerForm:back` |
| `/HagueEFilingWeb/DesignServlet` | GET 图纸资源 | 不是上传地址；资源参数从本案响应提取 |
| `/HagueEFilingWeb/javax.faces.resource/*` | GET JSF、PrimeFaces 与样式资源 | 不是业务动作 |
| `/HagueEFilingWeb/resources/*` | GET 原站资源 | 按当前响应引用读取 |
| `/HagueEFilingWeb/login` | 登录入口/失效跳转 | 登录由用户完成，不作为业务调用目标 |

不能自行拼 `application.xhtml?appNo=<reference>` 代替恢复：历史观测中该方式可返回 portfolio，甚至 HTTP 200，但并未打开目标草稿。恢复路径是 Draft(s) 精确编号 → 该行 Open/edit → 编辑器编号再次核对。

### 2.1 登录探针

在选中的官方标签页 ISOLATED world 中 GET portfolio，使用 `credentials:'include'`、`cache:'no-store'`、跟随重定向和 12 秒超时。成功必须同时满足：

1. 最终 origin/path 为官方 portfolio 页面，HTTP 成功。
2. 包含 `form#portfolio`、`form#quickSearchPanel` 和 ViewState 输入。
3. 不含密码输入框；校验期间标签页 URL 与主文档身份未切换。

会话验证有效期为 5 分钟。存在官方标签页、响应 200 或单独存在 ViewState 均不足以证明登录。EASY 与 eHague 会话分别管理。见 [hague-session.ts](../../patmail-extension/src/background/hague-session.ts)。

### 2.2 JSF 请求模板

所有值在本案当前响应中解析。下列内容是字段约定，不是可直接重放的固定报文。

```text
POST <当前 form.action>
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Faces-Request: partial/ajax
X-Requested-With: XMLHttpRequest

<当前 form 的 successful controls>
javax.faces.ViewState=<本链最新值>
javax.faces.partial.ajax=true
javax.faces.source=<source>
javax.faces.partial.execute=<process，省略时 @all>
javax.faces.partial.render=<update，存在时>
javax.faces.behavior.event=<event，behavior 请求时>
javax.faces.partial.event=<event，behavior 请求时>
<source>=<source>                  # 非 behavior、非上传的按钮动作
<remoteCommand 参数>              # 例如 param=<指定国代码>
```

Successful controls 排除 disabled、无 name、button/submit/reset/file 及未选中的 checkbox/radio，多选 select 逐值提交。完整提交 `full=true` 不附加 partial 字段。`j_idtNNN` 不稳定，必须从当前配置提取。

支持静态解析 `PrimeFaces.ab`、`mojarra.ab`、有限的 `selectOffice` / `processFile` remoteCommand 以及 JSF 完整提交。`s/f/p/u/e` 分别对应 source/form/process/update/event。不会执行服务端任意脚本文本。

### 2.3 响应契约

| 响应形态 | 处理 |
|---|---|
| 完整 HTML | 重建本链 DOM，更新路径、reference 与 ViewState |
| `<partial-response>` 的 `<update>` | 按组件替换；ViewRoot 更新视为完整页面 |
| ViewState update | 更新链内值，并给替换后的所有 form 补隐藏状态 |
| `<redirect url>` | 在允许的官方 protected 路径内继续 GET |
| `<eval>` | 仅识别静态引号内的 location 导航；不 eval 其他代码 |
| `<error>`、XML 解析失败 | 该链失败，不把 200 当成功 |
| extension JSON `validationFailed:true` | 校验失败，不能确认保存 |
| DataTable 行片段 | 将 `<tr>` 内容写入 `<组件ID>_data` 的 tbody，保留外围组件 |

每次新响应的 reference 若与该链已绑定编号冲突则报错。网络失败会冻结原链；自动恢复建立新上下文，不清除原链错误后盲目重放。见 [http-context.ts](../../patmail-extension/src/hague/http-context.ts)。

## 3. 业务动作与回执

`Applicant={name,address,city,region,postalCode,country}`；`Priority={number,date,country,das,originalNumber?,generated?,requiresReview?}`。表中参数为 command 除 `op` 外的字段。

| op | 参数 | 控件/行为 | 成功判据 |
|---|---|---|---|
| inspect | 无 | 读取页面、编号和计数 | portfolio 可按 reference 分页核对 draftSaved |
| prepare | 无 | New，English，New application | 准备区响应正常 |
| create | 无 | Confirm | 编辑器与新编号；接口链随后初始保存并重新打开 |
| applicant | data,index,email | `ApplicantForm:showApplicantForm` → 字段 → saveAppBtn | 保存前数量=index，保存后=index+1 |
| representative | data（含 email） | repBtn → saveRepBtn | 不重复添加已有代理机构；编辑区关闭 |
| parties | codes | changeDesignationsSelection → selectOffice → Ok | 勾选代码集合与本案集合一致 |
| locarno | value | `locarnoClassForm:locClass:input` | 数值正规化后选择；`03` 匹配 `3` |
| design | index,subclass,product | Add design → SaveAddDesignBtn | 保存前设计数=index；进入本组图纸区 |
| openDesign | index | designsDataTable 对应行 addReproduction | 本组图纸区打开 |
| upload | name,base64,mime,count | uploader → processFile | 本组数量由 count 增至 count+1 |
| legend | name,label | 按文件名 Open/edit，按英文含义匹配选项 | Save 与校验正常；必要时翻页 |
| closeDesign | 无 | 本组 Ok | 本组关闭后才处理下一设计 |
| description | text | addDescription / Select all / Save | 来源为空则不产生该步骤 |
| creator | index,givenName,familyName,address | Add Creator / Select all / Save | 保存前计数检查；编辑区关闭 |
| priority | index,data | AddPriority；先国家、等待更新、Select all，再编号/日期/DAS | 写入前优先权数量=index；保存后编辑区关闭 |
| publication | months | radio / comboAjourn / Save | 原站无校验错误，编辑区关闭 |
| signature | reference,representative | signForm 签名选项、firstname:input、Save | 本案代理签名及我方文号 |
| summary | 无 | `headerForm:sum` | 确认 Summary 页面与 WIPO 编号 |
| print | caseVolume | 页面模式在线打印；接口模式离线渲染并导出 | 有效 PDF + 真实下载完成回执 |
| backToApplication | 无 | `headerForm:back` | 回到本案编辑器 |
| saveDraft | 无 | Close / Yes | 返回 portfolio，Draft(s) 精确编号匹配 |

`signature.command.reference` 是我方文号；消息外壳/检查点中的 reference 是 WIPO 编号，不得混用。

### 3.1 懒加载与事件细节

- 指定国、设计、其他选项区分别依赖 `refreshDesignationUI`、`refreshDesignUI`、`refreshOptionsUI`。表单存在不代表所有分区内容都已加载。
- checkbox 的 `click` 会产生 `input`。监听器只能在 click/change 分派原站动作，input 仅同步 autocomplete 隐藏值，随后返回。否则一次勾选可能请求两次，将指定国选上又取消。
- 不对 checkbox/radio 的 click 调用 preventDefault，否则浏览器可能回滚预激活 checked 状态。
- 产品输入框 `:inputAutoComplete:input` 还需同步同组件的 `:inputHidden`。
- 选择优先权国家后必须等待 AJAX，再填写编号与 `dd/mm/yyyy` 日期。日历显示范围不能单独作为服务端拒绝原因；本批曾由真实保存反证该误判。
- `Pub6` 对应正常公开 12 个月，不是 6 个月；0 对应 Immediat，其他明确月份用 Ajourn 与相应选项。

### 3.2 Multipart 上传

上传目标为当前编辑表单 action。文件 input：`designForm:fileuploader:fileupload_input`；source/文件 part 名为去掉 `_input` 的 uploader ID。

1. 读取本链当前 form 的 successful controls 和最新 ViewState。
2. execute 包含 uploader source 与其配置中的 process；render 取当前 uploader 的 update。
3. 文件使用 FormData；浏览器生成 boundary，不手工写 Content-Type。
4. 不额外附加同名 source 字符串 part，避免和文件 part 冲突。
5. 上传响应后调用 processFile，参数 `dtId=designForm:reproDT`。
6. 核对本组图纸数量恰好增加 1；不以 HTTP 200 或收到上传响应替代此检查。

当前支持编号 JPG/JPEG/TIF/TIFF、JPEG/TIFF MIME、单图不超过 2 MiB。PNG 可在本地预览，不代表原站上传已支持。超时/计数不确定的上传不自动重放。

### 3.3 Draft(s) 分页

DataTable ID 从当前 DOM 获取，例如结构性组件 `portfolio:enCours`；rows/rowCount 来自当前 PrimeFaces DataTable 配置。以该 ID 作 source/process/update，在 portfolio form 上发送：

```text
<id>_pagination=true
<id>_first=<0-based offset>
<id>_rows=<当前页大小>
<id>_skipChildren=true
<id>_encodeFeature=true
```

按页串行查找首格文本精确等于 `WIPO<reference>` 的行。当前扫描仅在配置 rows 合法且 rowCount≤10,000 时执行；配置无法识别或未命中则暂停，不创建替代草稿。恢复和最终保存验证共用此查找。字段依据原站 components.js 的 DataTable.paginate 实现，不能拿 DataGrid 的更新规则替代 DataTable 行片段规则。

## 4. EASY 来源接口

EASY 为来源系统，不是 WIPO 接口。沿用当前已连接的大客户/中小客户账号，不跨系统混用案件 ID。公共约定见 [EASY 通用约定](../00-通用约定.md)，实现见 [easy.ts](../../patmail-extension/src/hague/easy.ts)。

| POST 入口 | Call | 参数/用途 |
|---|---|---|
| `/AjaxServers/CaseInfo.ashx` | ICSearchList | 文号查询后忽略大小写精确匹配，必须恰好一案 |
| 同上 | GetCaseInfo | case_id；案件及备注 |
| `/AjaxServers/PatentAction.ashx` | GetCaseApplicant | id；全部申请人 |
| 同上 | GetCaseInventor | apply_id、_PK=inventor_id；设计人 |
| 同上 | GetCasePriority | id、_PK=priority_id；优先权 |

四类明细每页 50、最多 20 页，pageIndex 从 1 开始；达到上限仍满页则报未读完整。每页检查 ClientInfo 登录状态，交给模型前剔除会话元数据；来源 JSON 超过 100,000 字符则不仲裁。日期、邮编、姓名、指定国等来源算法见技术文档。

## 5. 扩展内部 RPC

调用方必须是本扩展 `chrome-extension://<extension-id>/app.html`。

### 5.1 会话与页面填写

- `PATMAIL_HAGUE_SESSION`：`listTabs`、`open`、`verify(tabId)`；成功返回 tabs 或 `{tabId,title,documentId,verifiedAt,expiresAt}`。
- `PATMAIL_HAGUE_DRAFT`：`{channel,tabId,documentId?,reference?,command}`；除 inspect 外，页面写入须提供并匹配 documentId，同标签页互斥。
- 失败使用 `{ok:false,error}`；成功使用 DraftReceipt。`printUrl` 是类型保留字段，不是已实现 PDF HTTP 地址。

### 5.2 接口链通道 PATMAIL_HAGUE_HTTP

```ts
// 扩展内部消息类型，非 WIPO HTTP JSON
type HagueHttpMessage = {
  channel: 'PATMAIL_HAGUE_HTTP';
  tabId: number;
  request: {
    url: string; method: 'GET' | 'POST';
    params?: [string, string][];
    headers?: Record<string, string>;
    file?: { field: string; name: string; mime: string; base64: string };
  };
};
```

tabId 实际必须为非负安全整数；params/headers/file 均按需省略。成功返回 `{ok:true,status,url,mime,base64}`；base64 是原始响应字节编码，不代表响应是 JSON。

后台只接受官方地址白名单；POST 限 portfolio/application，Summary 仅允许 Back source。headers 仅 content-type、faces-request、x-requested-with；调用方不能传 Cookie 或任意认证头。params 最多 600 项，每项必须为两个字符串；请求 JSON 序列化长度上限 4,000,000 字符。随后校验绑定标签页 origin 和当前主文档，再在其 ISOLATED world 调用 fetch，认证由浏览器携带。后台网络池上限 6，单次 fetch 超时 60 秒。

### 5.3 打印分支

同一 HTTP channel 的内部打印消息：`{channel,action:'print',html,caseVolume,reference,delivery?:'artifact'}`。

- caseVolume 必须满足当前 P…HAGUE 文号格式，reference 必须全为数字。
- HTML 最多 20,000,000 字符；拒绝活动标签、事件属性、外部 HTTP src/href、远程 CSS url 和 @import。
- artifact 返回 `{ok:true,base64,fileName}`；download 分支返回 downloadId。生产接口链使用 artifact，随后统一交给原生下载导出器。
- about:blank 渲染页阻断外网；等待图片/字体就绪最多 30 秒；校验 PDF 文件签名，finally 释放 debugger 并关闭渲染页。
- 打印池并发 1。不改变日常 Chrome 下载行为，不通过 Playwright 接管下载。

## 6. 本地类型和自动恢复结果

类型来源：[draft-contract.ts](../../patmail-extension/src/hague/draft-contract.ts)。

| 类型 | 关键字段 |
|---|---|
| DraftReceipt | ok,error,documentId,reference,page,applicants,creators,priorities,designs,reproductions,downloadId,warnings,draftSaved |
| DraftCheckpoint | transport,tabId,documentId,reference,next,total,status,stage,planKey,downloadId,generatedPriorities,warnings,error |
| 恢复元数据 | recoveryAttempts（按步骤计数）、acknowledged（next/op/page）、recoveryDecision（next/reference/retry） |
| DraftRecovery | outcome=completed/retry/unknown，receipt?，reason? |

page 为 portfolio/application/summary/other；检查点状态为 running/stopped/uncertain/saved/failed。next 是下一步下标，不是已执行但尚未确认的当前步骤完成数。

自动恢复是本地 `Host.recover → createHttpChain.recover → driver.recoverStep`，不是新增 WIPO endpoint，也不是新的扩展 RPC action。仅 HTTP 模式接入。原子推进、一次预算、优先权匹配和保存证明算法详见[技术文档第 6 节](../../patmail-extension/docs/mechanisms/海牙接口链与容灾算法.md#6-有界自动恢复)。

## 7. 关键限制与维护入口

- 申请人自动配置当前支持 CN/SG 法人；SG 省份可空。资格国家/ACP 按来源国家形成草稿候选，须审核，不能据此推断所有国家和自然人均已支持。
- 邮编为本批原站观测的选填字段：缺失可空，非空仍校验；现实现不按城市编造邮编。
- 多设计、多申请人、原文冲突和材料修正需按当前来源逐项核对。六行重复编号修正只在严格匹配且用户触发时执行，Word 原文件不变。
- 未验证任意站点版本、全部指定国组合、长期负载/限流，以及正式递交/缴费。
- 原始业务数据只在执行链与明确工作流响应中流转。文档和日志不存真实报文、Cookie、密码、ViewState 值、令牌或完整材料清单。

源码导航：

| 模块 | 责任 |
|---|---|
| [http-context.ts](../../patmail-extension/src/hague/http-context.ts) | 请求队列、ViewState、响应更新 |
| [http-driver.ts](../../patmail-extension/src/hague/http-driver.ts) | 静态协议解析、动作适配、分页和恢复读回 |
| [http-client.ts](../../patmail-extension/src/hague/http-client.ts) | RPC fetch、创建后初始保存/重开、Summary/导出 |
| [hague-http.ts](../../patmail-extension/src/background/hague-http.ts) | 后台调用方、地址、请求头与容量校验 |
| [draft-page.ts](../../patmail-extension/src/hague/draft-page.ts) | 业务字段与控件动作 |
| [draft-runner.ts](../../patmail-extension/src/hague/draft-runner.ts) | 步骤计划、持久化、恢复协调 |
| [draft-recovery.ts](../../patmail-extension/src/hague/draft-recovery.ts) | 可恢复动作范围、优先权读回判定 |

排障先读本机 log/cdp/status.json 与最新 JSONL，关联 requestId/progressId/taskId，必要时再连接现场。日志仅留 24 小时，不能用于重建 ViewState 或重放业务正文。协议变化后，应先新增最小失败回归，再修改适配；构建不会自动使已打开的旧扩展上下文升级。
