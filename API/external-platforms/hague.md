# WIPO eHague：接口逆向与草稿调用契约

更新时间：2026-11-12。范围：海牙新申请的数据读取、逐项填写、Summary PDF 和 Draft(s) 保存；不含正式递交、付款。

## 1. 证据与接口边界

此文整理当前代码、原站 DOM/PrimeFaces 控件及本机 CDP 网络元数据。已完成一次真实站点的单设计、8 图草稿保存，并核对 Summary PDF 和 Draft(s) 中的同一 WIPO reference；双申请人、双设计的顺序与数量另有隔离浏览器回归。隔离测试不能替代真实站点验证。

**eHague 当前填写页是有状态的 JSF / PrimeFaces 应用，不是每个业务动作各有一个 JSON REST 接口。** 本项目复用已登录页面的控件触发请求，保留 ViewState、组件树和上传队列。下文分别标明：

- **HTTP 观测**：日志确认过的路径或代码实际执行的只读请求；不代表完整报文已逆向。
- **页面契约**：已实现的控件、字段和回执判断；由原站脚本组织网络请求。
- **插件 RPC**：扩展内部消息，不能向 WIPO 域名直接发送这些 JSON。

CDP 日志仅保留最近 24 小时。本文不保存 Cookie、请求头、ViewState 值、密码、完整业务响应、真实案件材料或可重放报文。数值组件 ID `j_idtNNN`、文件存储路径、文档 ID 都是运行时值，不得硬编码。操作说明见[海牙工作流](../../patmail-extension/docs/hague-workflow.md)。

## 2. 目标站 HTTP 路径

Origin：`https://hague.wipo.int`。

| 路径 | 用途与已知行为 | 验证边界 |
|---|---|---|
| `/#/landing/home` | 官方入口；hash 路由不是服务端 API | 创建标签页入口 |
| `/HagueEFilingWeb/protected/portfolioManager.xhtml` | 案件组合、Draft(s) 列表；会话探针发 GET | 日志观测、探针与实际列表核对 |
| `/HagueEFilingWeb/protected/page/application.xhtml` | 新建和编辑；多项操作共享此页，由 PrimeFaces 发送 JSF 请求 | 网络路径与页面动作已验证；未导出完整 POST 报文 |
| `/HagueEFilingWeb/protected/page/summary.xhtml` | Summary 页面 | 实际导航及打印验证 |
| `/HagueEFilingWeb/login` | 登录入口/失效后跳转 | 日志观测；登录由用户在原站完成 |
| `/HagueEFilingWeb/DesignServlet` | 原站图纸读取；页面曾带 `imagefile` 参数指向服务器转换图 | 路径观测；不是已逆向的公开上传 API |
| `/HagueEFilingWeb/javax.faces.resource/*` | JSF 静态资源、主题和 PrimeFaces 脚本 | 资源请求；不是业务 API |

编辑页曾出现 `appNo` 查询参数；当前程序以实际页面内 WIPO reference 校验目标，不自行拼接编号访问其他案件。登录过程中还观察到 WIPO 身份服务跳转；本项目没有实现 OAuth、验证码或二次验证协议。

### 登录探针

实现：[background/hague-session.ts](../../patmail-extension/src/background/hague-session.ts)。在所选官方标签页 ISOLATED world 中执行：

```js
fetch('/HagueEFilingWeb/protected/portfolioManager.xhtml', {
  method: 'GET', credentials: 'include', cache: 'no-store',
  redirect: 'follow', signal // 12 秒 AbortController
})
```

通过条件同时满足：HTTP 成功、最终 origin/path 仍是官方 portfolio 页面、响应 HTML 含 `form#portfolio`、`form#quickSearchPanel`、`input[name="javax.faces.ViewState"]`，且没有密码输入框。仅存在标签页、ViewState 或返回 200 都不足以确认登录。校验前后 URL 和主文档必须一致。

### JSF 与上传的已知边界

表单依赖 `javax.faces.ViewState`、当前 form、运行时 source/process/update 组件及 PrimeFaces 队列。当前没有独立实现通用 JSF 请求拼装器，也没有保存一套可脱离页面重放的字段模板。不要把本文控件名当成 HTTP 参数全集。

2026-11-12 已补直接请求实验：在一个已有登录页中用 `fetch(credentials:'include')` GET portfolio，将响应解析到独立 DOM；以该响应的 ViewState 和动态 radio ID 发送 JSF partial POST，选择 New application，返回 HTTP 200、`partial-response`，更新 `portfolio:optionPanel` 与 ViewState，无 error/redirect。没有新建标签页、没有调用 Confirm、没有创建申请。由浏览器携带现有 Cookie，未读取、导出或记录 Cookie 值。

该准备动作的请求约定（运行时取值，非固定报文）：

| 项目 | 值 |
|---|---|
| URL / 方法 | 当前 form.action，POST；限定官方 portfolio 路径 |
| Content-Type | `application/x-www-form-urlencoded; charset=UTF-8` |
| Faces-Request | `partial/ajax` |
| X-Requested-With | `XMLHttpRequest` |
| form 字段 | 当前响应中的 successful controls、form 隐藏项及 ViewState；语言 en、申请类型为 New application |
| javax.faces.partial.ajax | `true` |
| javax.faces.source | 本响应 New application radio 的 element.id |
| javax.faces.partial.execute | 本响应 radio 的 name |
| javax.faces.partial.render | `portfolio:optionPanel` |
| javax.faces.behavior.event / partial.event | `click` / `click` |

这证明携带浏览器会话的纯请求路径可行，不代表完整草稿链已迁移。后续每案必须独立维护 HTML/组件 ID/ViewState，并处理 partial updates、重定向和错误；创建、全部表单、multipart 上传、Summary 仍需逐项验证。现行正式执行器仍为页面驱动。

上传控件为 `designForm:fileuploader:fileupload_input`，使用 PrimeFaces advanced/auto uploader。已观察到上传完成后调用 `processFile([{name:'dtId',value:'designForm:reproDT'}])` 更新图纸表。**完整 multipart URL、part 名、临时文件令牌、服务端错误响应格式尚未独立归档验证**；当前以原站 file input 触发上传并核对记录数，不把它宣称为已完成的直接上传 API。

## 3. EASY 来源读取接口

实现：[hague/easy.ts](../../patmail-extension/src/hague/easy.ts)、[api/transport.ts](../../patmail-extension/src/api/transport.ts)。复用已连接的 EASY 大客户或中小客户系统，不能把两个系统的案件 ID 混用。鉴权、表单编码及公共响应见 [EASY 通用约定](../00-通用约定.md)。

均为 `POST`，`application/x-www-form-urlencoded`，由 `Call` 分发：

| 入口 | Call | 本工作流参数与用途 |
|---|---|---|
| `/AjaxServers/CaseInfo.ashx` | `ICSearchList` | 以文号构造查询；结果再按文号忽略大小写精确匹配，必须恰好一条 |
| `/AjaxServers/CaseInfo.ashx` | `GetCaseInfo` | `case_id=<精确匹配案件 ID>`；案件及备注 |
| `/AjaxServers/PatentAction.ashx` | `GetCaseApplicant` | `id=<案件 ID>`；全部申请人 |
| `/AjaxServers/PatentAction.ashx` | `GetCaseInventor` | `apply_id=<案件 ID>&_PK=inventor_id`；全部设计人 |
| `/AjaxServers/PatentAction.ashx` | `GetCasePriority` | `id=<案件 ID>&_PK=priority_id`；全部优先权 |

后四项还传 `pageSize=50`、从 1 开始的 `pageIndex`、空 `searchKey` / `colsel`、`log_pagename=CaseManage.aspx`。每路最多 20 页；`TableRows` 不满 50 条停止，达到上限仍满页则报未读完整。四路可并行，受工作流网络并发 6 的总限制约束。每次响应验证 `ClientInfo` 登录状态；交给仲裁前剔除会话元数据。总来源文本超过 100,000 字符不交给模型。

字段规则见 [hague/source.ts](../../patmail-extension/src/hague/source.ts)：

| 目标 | 来源/规则 |
|---|---|
| 申请人英文名 | `applicant_name_en`；中文栏确实保存英文时可沿用英文原文 |
| 详细地址 | `contact_address_en`，保持英文并截取到区；城市、省份独立，不以合作区替代省份 |
| 城市 / 省份 / 邮编 | `city` / `province` / `postcode`；城市、省份须为英文 |
| 设计人姓名 | 英文姓/名来源优先；有中文原名而无英文名时，由海牙 AI 仲裁拼音转写，保留来源标记 |
| 设计人地址 | 复用第一申请人的详细地址、城市、省份、邮编和国家 |
| 优先权 | `priority_no`、`priority_date_dd` 或 `priority_date`、`priority_country_id`、`access_code` |
| 不可作优先权号 | `priority_id`、`seq`；它们是数据库标识/序号 |
| 缔约方 / 公开方式 | 本案备注和材料独立解析；未知或冲突的公开月份为 `null`，不能默认立即公开 |

不可用的中国优先权号可生成**草稿占位号**，保留 `originalNumber`、`generated`、`requiresReview`，等待人工替换。DAS 不编造。不固定指定国集合；六国示例只作回归材料。

邮编占位符不作有效值；字段不可用时只从截断前完整英文地址末尾提取明确邮编，不依据城市生成。CN/SG 需六位数字，SG 保留前导零。国家忽略占位符并归一二字母代码，可从英文地址末尾明确国名恢复；不接受无来源的模型国家猜测。字段与地址冲突时保留首个有效来源字段并警告。公开时间优先读取案件备注“公开情况”（兼容“公开方式”“公开时间”）后的客户要求：正常/12个月公开 → 12，立即公开 → 0，其他明确月份 → chosen time。正常公开（已申请提前公开）仍为 12，不因办理记录报冲突。历史公开、展会和其他申请描述不覆盖该字段。多段指定清单或多条明确的本案公开要求相互矛盾时保留冲突。对应回归见 `tests/unit/hague/requirements-contact.test.ts`。

## 4. 扩展内部 RPC

调用方限定同扩展 `app.html`。这两组 channel 都是 `chrome.runtime.sendMessage`，不是第三方网络地址。

### 会话 channel：`PATMAIL_HAGUE_SESSION`

| 请求 | 成功返回 |
|---|---|
| `{channel, action:'listTabs'}` | `{ok:true,tabs:[{id,title}]}`，只含官方 origin 标签页 |
| `{channel, action:'open'}` | `{ok:true}`，打开官方首页 |
| `{channel, action:'verify',tabId}` | `{ok:true,session:{tabId,title,documentId,verifiedAt,expiresAt}}` |

失败统一 `{ok:false,error}`。会话有效期 5 分钟；页面跳转、关闭或换页使绑定失效，实际写入仍需核对当前 documentId。类型见 [session-contract.ts](../../patmail-extension/src/hague/session-contract.ts)。

### 草稿 channel：`PATMAIL_HAGUE_DRAFT`

请求外壳：`{channel,tabId,documentId?,reference?,command}`。除只读 `inspect` 外，必须提供并匹配当前 documentId；写入固定官方 protected 页面和 WIPO reference。同标签页操作互斥。实现见 [background/hague-draft.ts](../../patmail-extension/src/background/hague-draft.ts)。

`Applicant = {name,address,city,region,postalCode,country}`；`Priority = {number,date,country,das,originalNumber?,generated?,requiresReview?}`。以下参数列仅列 `command` 中除 `op` 外的字段：

| op | 参数 | 行为/回执 |
|---|---|---|
| `inspect` | 无 | 检查页面、reference、documentId、各类记录数；portfolio 可核对草稿已保存 |
| `prepare` | 无 | portfolio 中 New，选择 English / New application |
| `create` | 无 | Confirm 新建；导航后重新取得文档及 reference |
| `applicant` | `data:Applicant,index,email` | 第 index 位申请人，逐位 Add / Save 并验证数量 |
| `representative` | `data:Applicant & {email}` | 填写代理机构并 Save |
| `parties` | `codes:string[]` | 按国家/组织代码选择并核对精确集合 |
| `locarno` | `value:string` | 选择 Locarno 大类 |
| `design` | `index,subclass,product` | Add design / Save |
| `openDesign` | `index` | 打开对应设计的 reproductions |
| `upload` | `name,base64,mime,count` | 上传一张；count 为本组上传前数量，成功后必须增加 1 |
| `legend` | `name,label` | 按文件名打开记录，按名称匹配视图类型并 Save |
| `closeDesign` | 无 | Ok 保存本组后才进入下一设计 |
| `description` | `text` | 填写说明并 Save；来源空时 runner 跳过 |
| `creator` | `index,givenName,familyName,address:Applicant` | 逐位 Add Creator / Save |
| `priority` | `index,data:Priority` | 逐项填写在先申请并 Save |
| `publication` | `months` | 明确选择立即、正常或具体延迟月份 |
| `signature` | `reference,representative` | 选择代理签名并填我方文号；这里 reference 参数是我方文号，外壳 reference 是 WIPO 编号 |
| `summary` | 无 | 导航至 Summary |
| `print` | `caseVolume` | 后台生成并下载 Summary PDF，返回 downloadId |
| `backToApplication` | 无 | 返回编辑页 |
| `saveDraft` | 无 | Close / Yes，返回 portfolio 后核对 Draft(s) 精确编号 |

返回 `DraftReceipt`：`ok`，以及适用的 `error/documentId/reference/page/applicants/creators/priorities/designs/reproductions/downloadId/warnings/draftSaved`。`page` 为 `portfolio|application|summary|other`。类型中保留的 `printUrl` 不是已实现的 WIPO PDF 下载接口。完整类型以 [draft-contract.ts](../../patmail-extension/src/hague/draft-contract.ts) 为准。

## 5. 页面字段与必须遵守的顺序

实现：[draft-page.ts](../../patmail-extension/src/hague/draft-page.ts)。冒号是原站 ID 的一部分；用 `getElementById` 或正确转义，不能直接当普通 CSS 选择器。

| 表单 | 关键控件 / 操作 |
|---|---|
| 申请人 | `ApplicantForm:showApplicantForm`；法人名称 `firstname:input`；地址后缀 `address/cp/city/state/country/email`；`saveAppBtn` |
| 代理机构 | `ApplicantForm:repBtn`；法人名称 `ApplicantForm:name:input`；saveRepBtn |
| 指定缔约方 | `Designationform:desPanel:changeDesignationsSelection`；原站 `selectOffice`；逐次等 AJAX 后 Ok |
| Locarno | `locarnoClassForm:locClass:input` |
| 设计 | `designForm:selectSubClass:input`、`designForm:productIndication:inputAutoComplete:input`、SaveAddDesignBtn |
| 图纸 | `designForm:designsDataTable:${index}:addReproduction`；file input；`designForm:reproDT_data` |
| Legend | Open/edit；`designForm:legend:input`；自定义 `designForm:legendText:input`；Save |
| Description | `DescriptionForm:addDescription`；Select all；`DescriptionForm:texto:input`；Save |
| Creator | addCreator；`CreatorForm:name:input` 为 givenName、lastname 为 familyName；地址与 Select all；Save |
| Priority | Add Priority；先选 country 并等待 AJAX、Select all，再填 nbFiling/date/DAS；Save |
| Publication | 编辑后按显示含义选 radio；custom 用 `comboAjourn:input`；savePublicationBtn |
| Signature | signForm 中选择代理机构；`firstname:input` 填我方文号；Save |
| 导航 | `headerForm:sum`、`headerForm:back`、`headerForm:backApp`；关闭弹窗 Yes |

关键防错约束：

1. N 位申请人执行 N 次 Add Applicant / Save，保存后数量必须等于 index + 1。当前自动填写配置仅适用于中国法人申请人；其他类型在创建前拦截，不声称已支持外籍或自然人填表。
2. 产品表第 4 列是小类，第 2 列是图纸数。`1.x`、`2.x` 分别 Add design；本组计数从 0 开始，上传、Legend、Ok 完成后才开始下一组。
3. 上传限 JPG/TIF、单张不超过 2MB。PNG 本地预览支持不等于目标站可上传。超过 10 图须翻页找对应文件，按数值排序处理 1.10 等编号。
4. **Word 视图代码不能直接写入原站代码。** 当前原站选项观测：1 Perspective、2 Front、3 Back、4 Top、5 Bottom、6 Left、7 Right、9 Unfolded、10 Exploded、11 Cross-sectional、12 Enlarged、0 Other。代码只作观测，执行时按英文名称匹配；Other 需填原说明。
5. Priority 选国家会触发 AJAX，必须先完成它再填编号和日期，否则输入可能被重绘清空。日期输入显示 `dd/mm/yyyy`。DAS 不满足四位格式时留空、保留原值和警告。
6. 原站 publication radio 的 `Pub6` 实际对应 12 个月，不能按控件 ID 推断月份。6 个月使用延期选项 `6 months.`；可选范围由当前缔约方决定。
7. 每步等待 PrimeFaces AJAX 队列清空及页面错误消息，再读回数量/字段。默认等待 20 秒，上传 60 秒；RPC 客户端 75 秒超时，超时不能证明写入失败。

## 6. PDF、状态机与失败恢复

原站 Print 按钮调用浏览器 `print()`，没有据此逆向出独立 PDF HTTP 接口。实现 [hague-pdf.ts](../../patmail-extension/src/background/hague-pdf.ts) 临时使用 `chrome.debugger` 的 `Page.printToPDF`，打印前校验 Summary 的 documentId、origin/path，打印后再次确认 documentId 未变化，校验 PDF magic 后通过 `chrome.downloads` 保存：

`PatMail/Hague/<我方文号>/Summary-WIPO<编号>.pdf`

等待 downloadId 完成，失败/中断报错；最后释放 debugger。不设置浏览器下载行为，CDP 只读监听器不参与打印。PDF 成功不代表草稿已保存；仍需返回编辑器 Close / Yes，再在 Draft(s) 列表精确找到同一 WIPO reference。

[draft-runner.ts](../../patmail-extension/src/hague/draft-runner.ts) 检查点包含 `tabId/documentId/reference/next/total/status/stage/planKey/downloadId/generatedPriorities` 等。状态为 `running|stopped|uncertain|saved|failed`：

- 发出写入前先记 uncertain；收到可验证回执后推进 next。
- 页面恢复时，已确认边界可继续；结果不确定不自动重试，避免重复申请人、设计或上传。
- 目标文档/reference 或材料 planKey 改变时不能复用旧写入位置。生成的优先权占位号随检查点保留，不因重试随机变化。
- 停止等待当前操作回执；批量目标站写入默认串行，可选最多 6 路独立标签页，每案内部仍串行。读取/仲裁流水线另有网络 6、AI 调用 1 的限制。
- 最后保存回执丢失时，可用精确 Draft(s) 记录恢复为 saved；仅导航回 portfolio 不算成功。

海牙仲裁使用独立 skill `hague-filing-arbitration`，批次隔离并返回逐案 JSON；不是 PCT skill，也不是 WIPO API。模型输出还经过程序来源复核，不直接作为目标站写请求。

## 7. 验证与后续逆向范围

| 项目 | 当前证据 |
|---|---|
| 会话正向校验、文档绑定、同标签页互斥 | 单元测试及真实连接 |
| 单设计 8 图、Summary PDF、Draft(s) 保存 | 真实站点验证；不在本文复制真实材料 |
| 双申请人、双设计 16 图、逐项 Save/Ok | 隔离浏览器回归，见 tests/e2e/hague-draft-ui.e2e.mjs |
| 超时、不确定回执、恢复检查点 | runner 单元测试 |
| 原始 JSF POST 完整字段、multipart 上传完整契约 | 尚未独立验证归档；当前依赖页面驱动 |
| 外国/自然人申请人的资格表单 | 当前自动化范围外 |
| 正式递交、Payment/Validation、缴费回执 | 未实现、未验证 |

排查从本机 `log/cdp/status.json` 和最新 JSONL 开始，按 requestId/progressId/taskId 关联；必要时再现场只读检查。日志只保存请求元数据，不依赖它恢复 ViewState 或业务正文。监听约束见 [cdp-observer.md](../../patmail-extension/docs/cdp-observer.md)。

### 批量并发补充（2026-11-12）

### 纯接口链研究补充

后续重做：创建 187942 后立即 Close/Yes 保存，Draft(s) 精确命中，再以列表 Open/Edit 恢复成功；随后纯 multipart 上传 8 图、逐图 Legend 并关闭设计，重新打开该编号的服务端设计表读到 1 项设计、8 图。这些是已验证范围，不等于整案字段完整。

读回另发现产品名称/小类未落入该研究设计：原请求默认 process 错用 source；原站 PrimeFaces 未显式指定 process 时默认处理 `@all`。已改正并加入失败再通过的回归，但该研究设计的字段修正与完整链末端仍待验证。选项区虽存在，也必须在设计变化后调用 refreshOptionsUI 取得最新表单。187919/187920 等旧编号与本次编号不得混作同一检查点。

研究代码：`src/hague/http-context.ts`、`http-driver.ts`，尚未接替正式批量入口。每链独立 detached Document、ViewState、reference、请求队列和失败状态，共享浏览器凭据；响应不更新真实页面，不执行响应任意脚本。

已验证的协议细节：

- partial response 替换 form 后可能不含隐藏 ViewState。必须持有本链最新状态，并为替换后的 form 补回；不能沿用全局其他链的状态。
- 非 behavior 的 CommandButton 请求还需 source=source 参数；multipart 文件 part 也以 source 命名，但不能再发送同名字符串 part，否则服务端取值会歧义。
- 上传沿用 form successful controls；partial.execute 为 uploader ID 加配置中的 process；partial.render 来自 uploader update；文件 part 名为 uploader ID（不是 `_input`）。浏览器生成 multipart boundary。完成后仍需调用 `processFile`，传 `dtId=designForm:reproDT` 并验证本组数量。
- 表单初始懒加载依赖 `refreshDesignationUI`、`refreshDesignUI`、`refreshOptionsUI` remoteCommand；纯请求端必须明确调用，不能假定初始 HTML 已包含所有段落。
- 拦截 detached radio/checkbox click 时不能 preventDefault，否则浏览器回滚 checked，提交的法人/指定国选择将错误。
- 恢复必须从 Draft(s) 精确匹配编号并调用该行明确的 Open/Edit 动作。`application.xhtml?appNo=编号` 可能返回 portfolio，HTTP 200 不能作为恢复成功证据。

研究曾取得两个独立编号 187919/187920，并分别填写申请人、代理机构、指定国和首项设计；没有完成上传/保存的端到端验证。后续研究页刷新，内存上下文丢失；重新查询时当前 Draft(s) 无这两个编号，未自动创建替代草稿。不能将之前内存中的成功回执宣称为最终持久化成功。

最近验证：HTTP 上下文/驱动相关 6 项测试通过，覆盖交错隔离、ViewState 补回、失败冻结、radio 选择及 multipart part；完整测试和类型检查受本机内存不足中断，未宣称通过。正式入口继续保留原执行路径，纯接口未标记可用。

调度见 [draft-batch.ts](../../patmail-extension/src/hague/draft-batch.ts)，工作页见 [draft-tabs.ts](../../patmail-extension/src/hague/draft-tabs.ts)。批量模式使用扩展 chrome.tabs.create 打开官方 portfolio 页面，逐页 verify 后才写入；每路成功回到列表后立即复用，异常页面保留，检查点恢复必须使用原标签页。调用参数、ViewState、上传队列、documentId/reference 都不跨标签页共享。相同标签页互斥仍保留。

实际扩展只读实验 6/6 页面成功登录、6/6 加载完成、6 个不同 ViewState（约 18.2 秒）；原生 CDP Target.createTarget 的首轮实验仅 1/6 成功，不能将两种入口等同。该差异原因未确定；正式工作页使用已验证的扩展入口。隔离 UI 验证 7 案/6 路和 112 图，无外站写入。真实六路完整业务及服务器限流尚未压测，界面默认 1 路，其余为试运行，不宣称真实六路写入已通过。

## 当前接口执行入口与全流程验证

最新实现已接入工作流“接口链（试运行）”，此前段落中的“尚未接入”是对应研究阶段的历史状态。`background/hague-http.ts` 提供 PATMAIL_HAGUE_HTTP 内部通道，只接受本扩展 app.html，限定官方路径及表单头，认证由已有标签页的浏览器环境自动携带，不允许调用方传 Cookie 或任意认证头。`hague/http-client.ts` 负责每案独立驱动与新建后保存/重开。网络上限6；全链状态只更新所属实例。

执行顺序与原草稿步骤一致，print 动作改走 `background/hague-offline-pdf.ts`：原站 Summary HTML/样式/图片直接读取，移除活动代码和外链，短暂 about:blank 离线渲染，Page.printToPDF 后下载并清理；打印并发1，不设置下载行为。该步骤是浏览器本地输出 API，并非臆造的 WIPO PDF 下载 HTTP 地址。

真实单案187942全流程已完成并保存/重开：申请人1、设计人1、优先权2、设计1、图8；读回产品与小类正确，Summary包含本案文号，PDF已生成，扩展模块实际下载回执18。真实六链完整业务尚未同时压测。

协议资料：[PrimeFaces AJAX](https://github.com/primefaces/primefaces/blob/master/docs/13_0_0/core/ajaxRendering.md)、[FileUpload](https://github.com/primefaces/primefaces/blob/master/docs/7_0/components/fileupload.md)、[AutoComplete JS API](https://primefaces.github.io/primefaces/jsdocs/classes/src_PrimeFaces.PrimeFaces.widget.AutoComplete-1.html)。版本差异以原站实际加载脚本和请求回执为准；原站 custom autoCompleteHelper 的 inputHidden 同步和 Mojarra onchange 都已现场核对。


### 原生导出封装（2026-11-12）

`PATMAIL_HAGUE_HTTP` 的 `print` 支持 `delivery: "artifact"`，返回 `{ok, base64, fileName}`，仅生成离线 PDF，不触发下载；兼容原有默认下载行为。应用通过 `downloadDocuments("pdf" | "zip", sources, fileName)` 交给现有原生流后端保存。应用专用 `PATMAIL_DOCUMENT_EXPORT` 验证扩展 app.html 来源、PDF/ZIP 文件名与清单，使用独立 BrowserStreamDownloads 租约实例，沿用每任务 token、offset、sequence、缓存与完成确认。不会把文档渲染或本地 ZIP 行为误认为 WIPO 提交接口。
