# Hague 执行链源码审计

审计基线：`ceabd813a67d6f91a74410e1561ba313e4bba0c3`及当前工作区；本表来自源码，不是生产WIPO页面抓取。21种动作由 `src/hague/draft-contract.ts` 定义，常规步骤在 `draft-runner.ts:draftSteps` 生成，HTTP在 `http-driver.ts:call` 复用 `draft-page.ts:executeDraftPage` 的脱离DOM模型；Page模式由后台绑定文档执行同一页面操作。所有业务数据仅用于执行，不是诊断可公开字段。

## A. 全部业务动作

下表“JSF”指预期POST到当前 `application.xhtml`、合法partial XML或完整HTML，可能有先行refresh RemoteCommand和多次请求；不是每个业务步骤只有一次请求。动作的具体source/process/update由当前页面AST解析并验证，不硬编码推测动态组件。P=Page模式原站AJAX，H=HTTP脱离DOM协议模型。

所有写步骤发送前持久化 `status=uncertain,next=i`，成功回执后才推进next。异常仍uncertain，禁止无证据重复执行。自动恢复仅 `parties/locarno/priority/saveDraft`，最多一次且须重新读取规范回执；其余为人工核对。下表“否”不是诊断故障重试授权。

|op / 发起入口|步骤 / 模式|页面及form / 预期网络返回|成功证据|恢复 / 现有缺失|
|---|---|---|---|---|
|inspect / runner开始、导航轮询、恢复|结构检查 H/P|portfolioManager/application/summary；通常本地结构读取，HTTP精确定位可分页POST|page、reference、计数；列表精确draftSaved|只读；无响应不补造网络事件|
|prepare / draftSteps第1步|英文新申请 H/P|portfolio、quickSearchPanel；New、语言/新申请选择的JSF|portfolio及可识别控件|否；字段值不是诊断证据|
|create / 第2步|分配草稿 H/P|portfolio Confirm POST；导航application HTML|runner轮询application，reference检查；HTTP创建池串行并初次保存握手|否；必须避免重复创建|
|applicant / 每申请人|申请人 H/P|ApplicantForm showApplicantForm/saveAppBtn；JSF|添加前index一致、保存编辑器消失、计数index+1|否；计数与ViewState变化不足以单独证明全部输入值|
|representative / 固定步骤|代理机构 H/P|ApplicantForm repBtn/saveRepBtn；JSF|无既有代理、保存编辑器消失|否；不可输出姓名地址|
|parties / 固定步骤|指定缔约方 H/P|Designationform，refreshDesignationUI、对话框/Ok；JSF|选中集合与计划一致、ensure无业务错误|有条件；重新加载表单后才允许幂等重试|
|locarno / 固定步骤|大类 H/P|locarnoClassForm locClass，refreshDesignUI；JSF|idle与ensure；恢复按规范select当前值比较|有条件；原始值不进入Trace|
|design / 每设计|新设计 H/P|designForm Add design/SaveAddDesignBtn；JSF|前置设计数index、出现文件上传控件|否；不因诊断故障再添加|
|openDesign / httpRestoreCommands|恢复已有设计 H/P|designForm designsDataTable:addReproduction；JSF|打开指定设计编辑区域|否；非正常新增步骤|
|upload / 每图纸|上传 H/P|designForm multipart及processFile RemoteCommand；JSF|前置图纸数count、上传后count+1|否；文件名/Base64/字节禁止进入日志|
|legend / 每图纸|核对视图 H/P|designForm reproDT分页、legend编辑/保存；JSF|只定位精确文件行，合法选项、ensure|否；诊断仅计数/安全结构|
|closeDesign / 每设计末|关闭设计 H/P|designForm Ok；JSF|idle/ensure|否；不等价最终保存草稿|
|description / 可选|说明 H/P|DescriptionForm addDescription/save；JSF|输入编辑器消失、ensure|否；说明正文不公开|
|creator / 每设计人|设计人 H/P|CreatorForm addCreator/buttonSave；JSF|前置计数、编辑器消失|否；姓名地址不公开|
|priority / 每优先权|优先权 H/P|PriorityForm AddPriority/save；JSF|前置记录数index、编辑器消失|有条件；规范显示记录国家/日期/编号全匹配completed，计数等于index才retry，冲突unknown|
|publication / 固定步骤|公开时间 H/P|PublicationForm savePublicationBtn；JSF|编辑区域消失、ensure|否；保存回执缺失则unknown|
|signature / 固定步骤|签名和我方文号 H/P|signForm Save；JSF|签名选项存在、idle/ensure|否；reference不可充当Trace ID|
|summary / 固定步骤及恢复|摘要 H/P|headerForm:sum，导航summary.xhtml HTML|runner轮询summary页|否；HTTP200本身不证明导航|
|print / 固定步骤|生成打印文件 H/P后台|HTTP Summary HTML经离线PDF打印通道，独立chrome.debugger生命周期；不是网页JSF提交|downloadId或artifact回执|否；无CDP Observer也应可打印|
|backToApplication / 固定步骤|回编辑器 H/P|summary headerForm:back POST（专门白名单）|runner轮询application|否；不能扩大写URL许可|
|saveDraft / 最后步骤|保存草稿 H/P|headerForm:backApp/Close + Draft(s)确认Yes，导航portfolio|列表精确找到本案draftSaved|有条件；需已持久化同next/op且page=portfolio的ack，再列表精确回读|

补充入口：`draft-batch.ts`负责1～6路案件调度，`http-client.ts:createHttpChain`维护独立context与创建串行池；`background/hague-draft.ts`绑定目标文档；`hague-session.ts`验证会话；`hague-offline-pdf.ts`独立打印。诊断不能合并不同case context，也不能把HTTP失败转成业务重发。

## B. HTTP/RPC状态传递

|层级|基线保留|基线丢失/压缩|升级诊断契约|
|---|---|---|---|
|fetchHague / 注入isolated world|真实status、最终URL、MIME、响应bytes(Base64仅执行传输)|fetch失败/Abort变异常，登录跳转只抛字符串；自动重定向中间状态未知|观测到的status才填值，未收到响应null；独立transport/protocol/business状态；不得复制响应进Trace|
|handleHagueHttp / 后台|ok+完整执行结果，绑定tab/document，6路网络PermitPool|catch仅error.message；executeScript失败缺HTTP上下文|结构化errorCode/errorStage/httpStatus/traceId；安全调用方、URL/headers白名单保持|
|hagueHttpFetch / RPC客户端|按reply.status构造Response，MIME和url保留|ok=false抛普通Error；RPC异常与网络异常混淆|保留安全结构化异常；trace作为元数据，禁止新增认证头|
|HagueHttpContext.fetchComplete/read|排队、Response.status、location；非ok错误包含数字|非ok统一字符串；JSF parser/validation/DOM失败无分层|http.response/jsf.parsed/dom.updated，结构差异、ViewState摘要，不保存原文|
|HagueHttpDriver.call|隔离DOM/ViewState、running防交错、失败后禁写、业务计数|页面catch压缩为receipt.error；部分JSF状态不能直接被runner看到|同Trace上下文串联；AST未知停止写入；诊断故障不重试|
|runDraftPlan|pre-send uncertain、ack、reference校验、恢复限制|UI checkpoint.error是字符串、缺最早失败层|step/checkpoint/business/recovery事件，结构化错误附诊断；不改变业务推进条件|
|UI HaguePage|检查点stage/status/error和下载结果|同URL/CDP归因未知、无协议时间线|应用Trace面板/导出；固定安全CDP事件桥回流，断线显示缺证据，不编造归属|

升级列为本次跨文件接口约定；实际是否全部接入以测试和验收报告为准。Observer已实现的C/D表见 [hague-cdp-reverse-engineering.md](hague-cdp-reverse-engineering.md)。

## D. 应用证据盲区

|盲区 / 根因|影响|修复位置 / 验证|
|---|---|---|
|RPC错误仅字符串|HTTP状态/失败阶段消失|background/hague-http、http-client、diagnostics/errors；状态传播Fixture|
|JSF XML只执行无摘要|200校验失败难与成功区分|http-context、diagnostics/protocol；malformed/validation/error/redirect多更新Fixture|
|DOM前后无结构差异|无法知道更新目标是否存在|diagnostics/protocol；form/count/navigation Fixture，不含input值|
|case步骤与网络缺稳定ID|并发归因可能串案|runner/context/client trace；六路同URL隔离及Observer ambiguous Fixture|
|旧正则把动态JS当静态|未知动作误写风险|ast/analyzer、http-driver.jsfAction；静态/动态/包装/解码/限额Fixture|
|仅状态错误无首因报告|人工难判断副作用与恢复|diagnostics/reports/replay/UI；首异常/uncertain离线回放Fixture|
|真实页面版本未知|Fixture支持不能代表生产已出现|协议指纹差异；真实CDP/生产JS来源尚未授权验证|
