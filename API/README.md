# 专利案件管理系统接口文档

这些是原站抓包和页面对出来的接口记录，不是插件的现行说明。插件现在怎么工作，见仓库根目录 [README](../README.md)。使用范围见 [LICENSE](../LICENSE)。

服务地址：`http://183.36.43.66:88`  
技术栈：ASP.NET WebForms，Ajax `.ashx` Handler  
统一入口：`POST /AjaxServers/*.ashx`  
Content-Type：`application/x-www-form-urlencoded; charset=UTF-8`

业务动作由参数 `Call` 分发。公共约定见 [00-通用约定.md](00-通用约定.md)。

外部客户平台另行记录，不使用本页的 EASY 鉴权和 `Call` 协议，也不计入下述接口数量：

- [季华实验室代理机构管理平台：附件上传与台账更新](external-platforms/jihualab.md)
- [季华平台附件分类与关联字段](external-platforms/jihualab-attachments.md)
- [WIPO eHague：HTTP、JSF、上传与扩展 RPC 契约](external-platforms/hague.md)
- [海牙技术算法：材料解析、并发隔离、检查点与有界容灾](../patmail-extension/docs/mechanisms/海牙接口链与容灾算法.md)

按「入口 + Call」去重后，本索引共 **456** 个接口。同名但入口不同的分开计算，例如两个 `GetCaseInfo`。`GetPublishConfig` 有三个入口：`Common.ashx`、`BaseInfo.ashx` 与 `Bill.ashx`。

表里的「骨架」链到 14–43 的响应字段，「01」到「13」链到页面怎么读这些字段。两边都有的 Call，字段骨架看抓包文档，页面含义看专题文档。

## 文档

| 文档 | 内容 |
|---|---|
| [00-通用约定.md](00-通用约定.md) | 鉴权、公共请求头、公共响应、调用规则 |
| [01-案件信息.md](01-案件信息.md) | 案件详情、销售、流程人员、费用。页面读法 |
| [02-公共数据.md](02-公共数据.md) | 基础枚举、流向、文件类型、部门人员树、分部、标签 |
| [03-历史查询条件.md](03-历史查询条件.md) | 查询条件的列表、保存、删除 |
| [04-文件查询.md](04-文件查询.md) | GetSearchFiles 的请求和响应 |
| [05-文件查询字段映射.md](05-文件查询字段映射.md) | FileSearch DOM / QueryXml 与 GetSearchFiles 的对照 |
| [06-文件操作.md](06-文件操作.md) | 文件名、下载模板、收文、删除、上传、下载 |
| [07-发文与邮件.md](07-发文与邮件.md) | 客户发文、保存邮件、关联文件 |
| [08-流程审批.md](08-流程审批.md) | 发文邮件的缓急、流程信息、提交、结束 |
| [09-期限监控.md](09-期限监控.md) | 期限列表、创建发文、邮件页读取 |
| [10-邮件签名.md](10-邮件签名.md) | 个人签名、发文页签名下拉、邮箱预留段 |
| [11-客户要求.md](11-客户要求.md) | 客户列表、客户资料、客户级要求。不发文 |
| [12-案件流程图.md](12-案件流程图.md) | 子流程当前节点、已办节点、处理事项表 |
| [13-案件查询.md](13-案件查询.md) | ICSearchList。结束的事项仍能对上案子 |
| [14-案件信息-基础与详情.md](14-案件信息-基础与详情.md) | CaseInfo.ashx 基础数据、案件详情、收藏。22 个 Call |
| [15-案件信息-费用流程与文件.md](15-案件信息-费用流程与文件.md) | CaseInfo.ashx 费用、流程列表、文件查询。22 个 Call |
| [16-案件查询与基础枚举.md](16-案件查询与基础枚举.md) | 案件查询、IPGetBasicData、历史查询列表。17 个 Call |
| [17-公共-流程配置与树.md](17-公共-流程配置与树.md) | Common.ashx 待办、发布配置、机构树。22 个 Call |
| [18-公共-字典与列表列.md](18-公共-字典与列表列.md) | Common.ashx 字典和 LoadListColumn。12 个 Call |
| [19-客户-资料与合同.md](19-客户-资料与合同.md) | Customer.ashx 资料、申请人、合同，另加小写 customer.ashx。23 个 Call |
| [20-客户-跟进.md](20-客户-跟进.md) | Customer.ashx 发明人、跟进、催邮。10 个 Call |
| [21-专利动作.md](21-专利动作.md) | PatentAction.ashx。20 个 Call |
| [22-基础信息.md](22-基础信息.md) | BaseInfo.ashx 分部、文件名模板、发布配置。8 个 Call |
| [23-递交.md](23-递交.md) | 专利、商标、CPC 账号、美国递交。13 个 Call |
| [24-数据更新.md](24-数据更新.md) | UDAction.ashx。4 个 Call |
| [25-官文.md](25-官文.md) | Notice.ashx、TNotice.ashx。8 个 Call |
| [26-核稿.md](26-核稿.md) | Eflow.ashx、核稿页，以及一条 404。9 个 Call |
| [27-期限监控列表.md](27-期限监控列表.md) | Report.ashx。页面含义仍看 09。6 个 Call |
| [28-账单与发票.md](28-账单与发票.md) | Bill.ashx、CFInvoice.ashx。4 个 Call |
| [29-合同CRM.md](29-合同CRM.md) | CRMAction.ashx。5 个 Call |
| [30-外联配置.md](30-外联配置.md) | WadeButtAction.ashx。5 个 Call |
| [31-基础信息补充.md](31-基础信息补充.md) | BaseInfo.ashx 新增的基础数据、项目菜单、用户详情。4 个 Call |
| [32-批处理.md](32-批处理.md) | Batch.ashx。5 个 Call |
| [33-账单请款.md](33-账单请款.md) | Bill.ashx 请款、账单草稿和账单文件。10 个 Call |
| [34-账单官费到款.md](34-账单官费到款.md) | Bill.ashx 官费、到款、请款客户。10 个 Call |
| [35-案件客户与专利费用.md](35-案件客户与专利费用.md) | GetKyxAencyList、密级、本所代理、自动费用类型。5 个 Call |
| [36-公共补充.md](36-公共补充.md) | Common.ashx 新增的流程、代理树、费用阶段。7 个 Call |
| [37-登录邮箱与官文通知.md](37-登录邮箱与官文通知.md) | 邮箱设置、代理签名、官文通知，以及编辑器 config。5 个 Call |
| [38-发文列表.md](38-发文列表.md) | Mail.ashx 发文列表、草稿、待办、收件。7 个 Call |
| [39-外部邮件.md](39-外部邮件.md) | MailAction.ashx。3 个 Call |
| [40-报表.md](40-报表.md) | Report.ashx 自定义报表、点数、项目费用。12 个 Call |
| [41-发文页读取.md](41-发文页读取.md) | 发文页 Filing.aspx 打开时的读取。24 个 Call |
| [42-案件页读取.md](42-案件页读取.md) | 案件页 CaseManage.aspx 的权限、读取和留痕。9 个 Call |
| [43-首页与待办.md](43-首页与待办.md) | 首页与流程待办页 ProcessNew.aspx。6 个 Call |
| [44-费用查询.md](44-费用查询.md) | 费用查询 FeeSearch / FeeSearchTotalAmount、初始化与二级弹窗字典、历史查询条件（FeeSearch）与生产站基线 |
| [45-高级导出与模板协议.md](45-高级导出与模板协议.md) | 通用高级导出弹窗 IhgAdvExport 模板接口（Common.ashx）与费用三大服务端 Excel 导出接口（Report.ashx）及同步/异步下载分流 |
| [46-运行期补充接口契约.md](46-运行期补充接口契约.md) | 运行期已接入的会话探测、费用辅助树、提案流程、递交版本探测、代理所检索与 FileHandler 取件契约 |
| [47-来文管理.md](47-来文管理.md) | 来文管理 NoticeInfo.aspx 全量 8 个页签查询、字典热加载、CPC 扫码鉴权与轮询、业务写操作、四大导出与压缩包上传 |

14–30 是第一段抓包的 210 个 Call。31–40 是第二段抓包里索引原先没有的 68 个，其中 67 个是业务 Call，1 个是编辑器 `controller.ashx?action=config`。01–13 是页面专题，和抓包文档有重叠，不另加个数。41–43 是第三段抓包里索引原先没有的 39 个。44–47 补齐费用查询、高级导出、运行期补充接口与来文管理全量接口。下面的入口表才是去重后的 456。

## 抓包里需要单独看的几条

第一段 `183.36.43.66.har`（13:17–13:35 UTC）593 条 `POST`，592 条 HTTP 200，1 条 HTTP 404。第二段同名文件（14:37–14:55 UTC）320 条请求，317 条 `POST`、3 条编辑器 `GET`，全部 HTTP 200。两段里已经写过的 Call 没有重复建条目。

- 收藏页是 `CaseInfo.ashx` 的 `GetMyFavoriteCase`，参数名是小写 `call`。
- `Common.ashx` 的 `GetProcessByType_CO` 在 `pageSize=10` 时单条响应约 21MB。
- `customer.ashx`（小写）只有 `GetBrachDept`，响应键是 `BrachDeptinfo`。
- 批量核稿被拼到 `/Forms/Patent/undefined/api/DataPush/BatchEflowList`，HTTP 404。
- 不少接口 `ClientInfo.Result=false` 且 `Status=true`，数组里仍有数据。各文档按样本原样记录。

第三段 `183.36.43.66.har`（06:55–06:57 UTC）628 条请求，219 条 POST，另有 FAQ 跨域 JSONP 3 条全部 HTTP 502。这一段里已经写过的 Call 没有重复建条目。

- 发文页的 `Genetic_Registered` 被拼到 `/AjaxServers/undefined`，HTTP 404。和第二段的 BatchEflowList 一样是前端拼错路径。
- `GetFilingTypeInfo` 的业务键名随 `type_code` 变，`type_code=100108` 时键名是空字符串。
- `GetIPProcessListCount` 的 `where` 是 base64，解码后是 `new_todo`、`center_todo` 这类范围名。
- `GetUnReadPageMessCount` 的 `MessCount`、`RemindCount` 是 DataRow 的序列化形态，不是普通对象。
- `GetResearchGroupInfo` 由页面提交字符串 `undefined` 当 `group_id`，响应 `ResearchGroupInfo` 为 null。

## 入口一览

| 入口 | 接口数 |
|---|---:|
| [CaseInfo.ashx](#caseinfoashx) | 88 |
| [Common.ashx](#commonashx) | 63 |
| [Customer.ashx](#customerashx) | 42 |
| [Mail.ashx](#mailashx) | 27 |
| [Bill.ashx](#billashx) | 23 |
| [PatentAction.ashx](#patentactionashx) | 22 |
| [Report.ashx](#reportashx) | 27 |
| [BaseInfo.ashx](#baseinfoashx) | 21 |
| [Notice.ashx](#noticeashx) | 34 |
| [Login.ashx](#loginashx) | 10 |
| [Eflow.ashx](#eflowashx) | 6 |
| [FilingAction.ashx](#filingactionashx) | 23 |
| [Batch.ashx](#batchashx) | 5 |
| [CRMAction.ashx](#crmactionashx) | 6 |
| [WadeButtAction.ashx](#wadebuttactionashx) | 5 |
| [UDAction.ashx](#udactionashx) | 4 |
| [FilingApiAction.ashx](#filingapiactionashx) | 25 |
| [FilingTradeAction.ashx](#filingtradeactionashx) | 3 |
| [MailAction.ashx](#mailactionashx) | 3 |
| [AgencyEpEflow.aspx](#agencyepeflowaspx) | 2 |
| [AjaxServers/undefined](#ajaxserversundefined) | 1 |
| [BatchEflowList](#batcheflowlist) | 1 |
| [CFInvoice.ashx](#cfinvoiceashx) | 1 |
| [controller.ashx](#controllerashx) | 1 |
| [customer.ashx](#customerashx-lower) | 1 |
| [FileHandlerNew.ashx](#filehandlernewashx) | 1 |
| [FilingUSAction.ashx](#filingusactionashx) | 1 |
| [Rule.ashx](#ruleashx) | 1 |
| [TNotice.ashx](#tnoticeashx) | 1 |
| [UploadFile.aspx](#uploadfileaspx) | 1 |
| [AgencyAction.ashx](#agencyactionashx) | 1 |
| [FileHandler.ashx](#filehandlerashx) | 1 |
| [UploadFile.ashx](#uploadfileashx) | 4 |
| [Forms/MultiUPload/UploadMethod.ashx](#formsmultiuploaduploadmethodashx) | 1 |
| 合计 | 456 |

## 全部接口

<a id="caseinfoashx"></a>

### CaseInfo.ashx

88 个。

| Call | 文档 |
|---|---|
| `AddReceiveFile` | [06](06-文件操作.md#上传)。上传完成后挂到收文 |
| `ApplyCaseSearchBaseData` | [骨架](14-案件信息-基础与详情.md#applycasesearchbasedata) |
| `BatchDelFile` | [06](06-文件操作.md#删除)。确认后删除，未调用 |
| `BusinessCaseSearch` | [骨架](14-案件信息-基础与详情.md#businesscasesearch) |
| `CaseButtonConfig` | [骨架](14-案件信息-基础与详情.md#casebuttonconfig) |
| `CheckCaseAuthority` | [骨架](42-案件页读取.md#caseinfoashx-checkcaseauthority) |
| `DeptCaseInit` | [骨架](14-案件信息-基础与详情.md#deptcaseinit) |
| `GetAencyList` | [骨架](14-案件信息-基础与详情.md#getaencylist) · [10](10-邮件签名.md#getaencylist) |
| `GetAgentBusinessLevel` | [骨架](14-案件信息-基础与详情.md#getagentbusinesslevel) |
| `GetAgentContact` | [骨架](14-案件信息-基础与详情.md#getagentcontact) |
| `GetAllocateTsFinishedList` | [骨架](14-案件信息-基础与详情.md#getallocatetsfinishedlist) |
| `GetApplicantDemand` | [骨架](14-案件信息-基础与详情.md#getapplicantdemand) |
| `GetApplicantList` | [骨架](14-案件信息-基础与详情.md#getapplicantlist) |
| `GetApplyTags` | [骨架](14-案件信息-基础与详情.md#getapplytags) · [02](02-公共数据.md#getapplytags) |
| `GetApprovalByFileNo` | [06](06-文件操作.md#下载)。下载前的审批检查 |
| `GetBasicData` | [骨架](14-案件信息-基础与详情.md#getbasicdata) |
| `GetBoxSetUpInfo` | [骨架](14-案件信息-基础与详情.md#getboxsetupinfo) |
| `GetBranchDept` | [骨架](14-案件信息-基础与详情.md#getbranchdept) |
| `GetCaseAgent` | [骨架](14-案件信息-基础与详情.md#getcaseagent) |
| `GetCaseBusFlow` | [骨架](14-案件信息-基础与详情.md#getcasebusflow) · [12](12-案件流程图.md#getcasebusflow) |
| `GetCaseDemand` | [骨架](14-案件信息-基础与详情.md#getcasedemand) |
| `GetCaseInfo` | [骨架](14-案件信息-基础与详情.md#getcaseinfo) · [01](01-案件信息.md#getcaseinfo) |
| `GetCaseInfoBase` | [骨架](14-案件信息-基础与详情.md#getcaseinfobase) |
| `GetCaseMailAndPackage` | [骨架](14-案件信息-基础与详情.md#getcasemailandpackage) |
| `GetCasePriority` | [骨架](14-案件信息-基础与详情.md#getcasepriority) |
| `GetCaseSales` | [01](01-案件信息.md#getcasesales) |
| `GetCaseSalesAssistant` | [骨架](42-案件页读取.md#caseinfoashx-getcasesalesassistant) |
| `GetCaseSendList` | [骨架](15-案件信息-费用流程与文件.md#getcasesendlist) |
| `GetColorConfig` | [骨架](15-案件信息-费用流程与文件.md#getcolorconfig) |
| `GetDefaultApplicantTree` | [骨架](15-案件信息-费用流程与文件.md#getdefaultapplicanttree) |
| `GetDelCaseRoles` | [骨架](15-案件信息-费用流程与文件.md#getdelcaseroles) |
| `GetDelFileInfo` | [06](06-文件操作.md#删除)。删除前的提示，未调用 |
| `GetDictionary` | [骨架](15-案件信息-费用流程与文件.md#getdictionary) |
| `GetEditCustomerFieldRoles` | [骨架](15-案件信息-费用流程与文件.md#geteditcustomerfieldroles) |
| `GetFeeListByCase` | [骨架](15-案件信息-费用流程与文件.md#getfeelistbycase) · [01](01-案件信息.md#getfeelistbycase) |
| `GetFileName` | [06](06-文件操作.md#getfilename) |
| `GetFileNameByConfig` | [06](06-文件操作.md#getfilename)。没有配置重命名时的替代 Call，这次没单独调用 |
| `GetFileReceiveInfo` | [06](06-文件操作.md#getfilereceiveinfo) |
| `GetFinishedList` | [骨架](15-案件信息-费用流程与文件.md#getfinishedlist) |
| `GetFlowdirection` | [骨架](15-案件信息-费用流程与文件.md#getflowdirection) · [02](02-公共数据.md#getflowdirection) |
| `GetFlowNodeInfo` | [12](12-案件流程图.md#getflownodeinfo)。只描述已办节点的这一步 |
| `GetFlowUser` | [01](01-案件信息.md#getflowuser) |
| `GetFormPath` | [骨架](15-案件信息-费用流程与文件.md#getformpath) |
| `GetIPFile` | [骨架](41-发文页读取.md#caseinfoashx-getipfile) |
| `GetIPProcessClaseCount` | [骨架](15-案件信息-费用流程与文件.md#getipprocessclasecount) |
| `GetIPProcessList` | [骨架](15-案件信息-费用流程与文件.md#getipprocesslist) |
| `GetIPProcessListCount` | [骨架](43-首页与待办.md#caseinfoashx-getipprocesslistcount) |
| `GetKyxAencyList` | [骨架](35-案件客户与专利费用.md#caseinfoashx-getkyxaencylist) |
| `GetMyFavoriteCase` | [骨架](14-案件信息-基础与详情.md#未带-call-的请求)。参数名是小写 call，没有大写 Call |
| `GetMyTsFavoriteCase` | [骨架](15-案件信息-费用流程与文件.md#getmytsfavoritecase) |
| `GetOfficeInfoForCase` | [骨架](15-案件信息-费用流程与文件.md#getofficeinfoforcase) |
| `GetPatentFamily` | [骨架](42-案件页读取.md#caseinfoashx-getpatentfamily) |
| `GetProcList` | [12](12-案件流程图.md#getproclist)。处理事项表，没有子流程节点 |
| `GetProcStage` | [骨架](42-案件页读取.md#caseinfoashx-getprocstage) |
| `GetRecentCase` | [骨架](15-案件信息-费用流程与文件.md#getrecentcase) |
| `GetRelateUser` | [骨架](15-案件信息-费用流程与文件.md#getrelateuser) |
| `GetRightClickMenuPermissionsSjhc` | [骨架](15-案件信息-费用流程与文件.md#getrightclickmenupermissionssjhc) |
| `GetSalesAssistant` | [01](01-案件信息.md#getsalesassistant)。现有参数返回系统繁忙 |
| `GetSearchFiles` | [骨架](15-案件信息-费用流程与文件.md#getsearchfiles) · [04](04-文件查询.md) · [05](05-文件查询字段映射.md) |
| `GetSecretLevel` | [骨架](35-案件客户与专利费用.md#caseinfoashx-getsecretlevel) |
| `GetSumFeeListByCase` | [骨架](15-案件信息-费用流程与文件.md#getsumfeelistbycase) |
| `GetTechRelate` | [骨架](15-案件信息-费用流程与文件.md#gettechrelate) |
| `GetTechService` | [骨架](15-案件信息-费用流程与文件.md#gettechservice) |
| `GetTechServiceProcStatus` | [骨架](15-案件信息-费用流程与文件.md#gettechserviceprocstatus) |
| `GetTradeGoods` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-gettradegoods) |
| `GetTradeRelatedMessage` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-gettraderelatedmessage) |
| `GetTsAllocateList` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-gettsallocatelist) |
| `GetTsFinishedList` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-gettsfinishedlist) |
| `GetTsProcessList` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-gettsprocesslist) |
| `GetUnFinishProc` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-getunfinishproc) |
| `GetVoiceFile` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-getvoicefile) |
| `HasFavorite` | [骨架](42-案件页读取.md#caseinfoashx-hasfavorite) |
| `ICSearchList` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-icsearchlist) · [13](13-案件查询.md#2-icsearchlist) |
| `ICSearchList1` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-icsearchlist1) |
| `IPCaseSearch` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-ipcasesearch) |
| `IPCaseSearch2` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-ipcasesearch2) |
| `IPCaseSearch3` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-ipcasesearch3) |
| `IPGetBasicData` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-ipgetbasicdata) · [02](02-公共数据.md#ipgetbasicdata) |
| `IPGetBasicDataCustomer` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-ipgetbasicdatacustomer) |
| `LawCaseSearch` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-lawcasesearch) |
| `LawGetBasicData` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-lawgetbasicdata) |
| `LoadAgency` | [09](09-期限监控.md#1-打开列表)。期限页代理机构框 |
| `LoadTipCaseStatus` | [骨架](42-案件页读取.md#caseinfoashx-loadtipcasestatus) |
| `SaveFileReceiveInfo` | [06](06-文件操作.md#savefilereceiveinfo)。页面参数已核对，未调用 |
| `SearchQueryHisDelete` | [03](03-历史查询条件.md#searchqueryhisdelete) |
| `SearchQueryHisList` | [骨架](16-案件查询与基础枚举.md#caseinfoashx-searchqueryhislist) · [03](03-历史查询条件.md#searchqueryhislist) |
| `SearchQueryHisSave` | [03](03-历史查询条件.md#searchqueryhissave) |
| `GetIsNewCPC` | [46](46-运行期补充接口契约.md#getisnewcpccaseinfoashx)。递交流程打开表单前只读探测新旧 CPC 版本 |

<a id="commonashx"></a>

### Common.ashx

63 个。

| Call | 文档 |
|---|---|
| `AddUserReadLog` | [骨架](42-案件页读取.md#commonashx-adduserreadlog) |
| `CheckCaseCustomerAuthority` | [骨架](17-公共-流程配置与树.md#checkcasecustomerauthority) |
| `FlowSubmit` | [08](08-流程审批.md#mailsubmit)。通用提交。这次发文没有调用 |
| `GetAccepttype` | [06](06-文件操作.md#上传)。允许的上传扩展名 |
| `GetAllProvinceCity` | [骨架](17-公共-流程配置与树.md#getallprovincecity) |
| `GetAllPublishConfig` | [骨架](17-公共-流程配置与树.md#getallpublishconfig) |
| `GetApendNextNode` | [08](08-流程审批.md#getflowsubmit)。这次 Result 为 null |
| `GetCtrlProc` | [骨架](17-公共-流程配置与树.md#getctrlproc) |
| `GetCustomField` | [骨架](17-公共-流程配置与树.md#getcustomfield) |
| `GetFileType` | [骨架](17-公共-流程配置与树.md#getfiletype) · [02](02-公共数据.md#getfiletype) |
| `GetFlowHistory` | [骨架](17-公共-流程配置与树.md#getflowhistory) · [08](08-流程审批.md#getflowhistory) |
| `GetFlowInfo` | [08](08-流程审批.md#getflowinfo)。发文邮件审批，不是案件页流程图 |
| `GetFlowLastStatus` | [08](08-流程审批.md#getflowsubmit) |
| `GetFlowSubmit` | [08](08-流程审批.md#getflowsubmit)。Result=false 时节点数组仍可能有数据 |
| `GetGUID` | [骨架](36-公共补充.md#commonashx-getguid) |
| `GetIPCountByParentMenuId` | [骨架](17-公共-流程配置与树.md#getipcountbyparentmenuid) |
| `GetMailType` | [骨架](36-公共补充.md#commonashx-getmailtype) |
| `GetMailTypeNew` | [09](09-期限监控.md#4-进入邮件页) |
| `GetPicProcessCount` | [08](08-流程审批.md#getflowsubmit)。只用于显示待办数量 |
| `GetProcess` | [骨架](17-公共-流程配置与树.md#getprocess) |
| `GetProcessByType` | [骨架](17-公共-流程配置与树.md#getprocessbytype) |
| `GetProcessByType_AC` | [骨架](17-公共-流程配置与树.md#getprocessbytype_ac) |
| `GetProcessByType_AP` | [骨架](17-公共-流程配置与树.md#getprocessbytype_ap) |
| `GetProcessByType_CO` | [骨架](17-公共-流程配置与树.md#getprocessbytype_co)。pageSize=10 时单条响应约 21MB |
| `GetProcessByType_DR` | [骨架](17-公共-流程配置与树.md#getprocessbytype_dr) |
| `GetProcessByType_EF` | [骨架](17-公共-流程配置与树.md#getprocessbytype_ef) |
| `GetProcessByType_RE` | [骨架](17-公共-流程配置与树.md#getprocessbytype_re) |
| `GetProcessByTypeAC` | [骨架](36-公共补充.md#commonashx-getprocessbytypeac)。与 GetProcessByType_AC 不是同一个 Call |
| `GetProcessByTypeCO` | [骨架](17-公共-流程配置与树.md#getprocessbytypeco) |
| `GetProcessByTypeEF` | [骨架](43-首页与待办.md#commonashx-getprocessbytypeef)。与 GetProcessByType_EF 不是同一个 Call |
| `GetProcessNew` | [骨架](17-公共-流程配置与树.md#getprocessnew) |
| `GetPublishConfig` | [骨架](17-公共-流程配置与树.md#getpublishconfig)。参数名是 cfg_type。与 BaseInfo.ashx、Bill.ashx 的同名 Call 不是一个接口 |
| `GetTreeAgent` | [骨架](17-公共-流程配置与树.md#gettreeagent) · [02](02-公共数据.md#gettreeagent) |
| `GetTreeAgentCN` | [骨架](36-公共补充.md#commonashx-gettreeagentcn) |
| `GetTreeAgentUser` | [骨架](17-公共-流程配置与树.md#gettreeagentuser) |
| `GetTreeUser` | [02](02-公共数据.md#gettreeuser)。与 WadeButtAction.ashx 的同名 Call 不是一个接口 |
| `GetUnReadPageMessCount` | [骨架](43-首页与待办.md#commonashx-getunreadpagemesscount) |
| `GetUrgencyList` | [08](08-流程审批.md#geturgencylist) |
| `GetWayMode` | [骨架](36-公共补充.md#commonashx-getwaymode) |
| `GetWebConfigValue` | [骨架](17-公共-流程配置与树.md#getwebconfigvalue) |
| `LoadCountry` | [骨架](18-公共-字典与列表列.md#commonashx-loadcountry) |
| `LoadCtrlProc` | [骨架](18-公共-字典与列表列.md#commonashx-loadctrlproc) |
| `LoadCtrlProcByCaseType` | [骨架](36-公共补充.md#commonashx-loadctrlprocbycasetype) |
| `LoadCustomerGroupTree` | [骨架](18-公共-字典与列表列.md#commonashx-loadcustomergrouptree) |
| `LoadDeptTree` | [02](02-公共数据.md#loaddepttree) |
| `LoadFeeStage` | [骨架](36-公共补充.md#commonashx-loadfeestage) |
| `LoadFileTypeByCaseType` | [骨架](18-公共-字典与列表列.md#commonashx-loadfiletypebycasetype) · [02](02-公共数据.md#loadfiletypebycasetype) |
| `LoadListColumn` | [骨架](18-公共-字典与列表列.md#commonashx-loadlistcolumn) |
| `LoadMailType` | [09](09-期限监控.md#3-从列表创建发文) |
| `LoadOAProblem` | [骨架](18-公共-字典与列表列.md#commonashx-loadoaproblem) |
| `LoadProcStatusNew` | [骨架](18-公共-字典与列表列.md#commonashx-loadprocstatusnew) |
| `LoadSearchCase` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。来文详情改绑案件时按我方文号关键词联想搜索 |
| `LoadSentenceResult` | [骨架](18-公共-字典与列表列.md#commonashx-loadsentenceresult) |
| `LoadTradeLaw` | [骨架](18-公共-字典与列表列.md#commonashx-loadtradelaw) |
| `LoadTreeIndustryCls` | [骨架](18-公共-字典与列表列.md#commonashx-loadtreeindustrycls) |
| `LoadTreeSalesUser` | [骨架](18-公共-字典与列表列.md#commonashx-loadtreesalesuser) |
| `LoadUserRank` | [骨架](18-公共-字典与列表列.md#commonashx-loaduserrank) |
| `GetProcessByTypeAP` | [46](46-运行期补充接口契约.md#getprocessbytypeapcommonashx)。待办中心提案流程列表 |
| `GetQueryOutConfig` | [45](45-高级导出与模板协议.md#22-getqueryoutconfig读取模板列表--栏位明细)。高级导出模板列表与栏位明细 |
| `LoadTechnical` | [46](46-运行期补充接口契约.md#loadtechnicalcommonashx)。费用高级查询技术领域树 |
| `ShowUserInfo` | [46](46-运行期补充接口契约.md#showuserinfocommonashx)。办理人悬停浮窗部门与联系方式 |
| `UpdateQueryOutConfig` | [45](45-高级导出与模板协议.md#23-updatequeryoutconfig新建--删除模板)。新建（`ud_type=add`）或删除（`ud_type=del`）导出模板 |
| `UpdateQueryOutConfigNew` | [45](45-高级导出与模板协议.md#24-updatequeryoutconfignew更新已有模板)。更新已有导出模板（`ud_type=up`） |

<a id="customerashx"></a>

### Customer.ashx

42 个。

| Call | 文档 |
|---|---|
| `AllowShowCustomer` | [11](11-客户要求.md#allowshowcustomer)。响应正文未保存 |
| `CheckAbutmentCustomer` | [骨架](43-首页与待办.md#customerashx-checkabutmentcustomer) |
| `ContactInit` | [骨架](19-客户-资料与合同.md#contactinit) |
| `ContractDraftList` | [骨架](19-客户-资料与合同.md#contractdraftlist) |
| `ContractFinished` | [骨架](19-客户-资料与合同.md#contractfinished) |
| `GetAllFileList` | [骨架](19-客户-资料与合同.md#getallfilelist) |
| `GetApplicantList` | [骨架](19-客户-资料与合同.md#getapplicantlist) |
| `GetApplicantType` | [骨架](19-客户-资料与合同.md#getapplicanttype) |
| `GetApplyContractFinishedList` | [骨架](19-客户-资料与合同.md#getapplycontractfinishedlist) |
| `GetApplyContractList` | [骨架](19-客户-资料与合同.md#getapplycontractlist) |
| `GetConTotalRecieveAmount` | [骨架](19-客户-资料与合同.md#getcontotalrecieveamount) |
| `GetContractCaseList` | [骨架](19-客户-资料与合同.md#getcontractcaselist) |
| `GetContractFlow` | [骨架](19-客户-资料与合同.md#getcontractflow) |
| `GetContractFlowProcessed` | [骨架](19-客户-资料与合同.md#getcontractflowprocessed) |
| `GetContractInvoiceList` | [骨架](19-客户-资料与合同.md#getcontractinvoicelist) |
| `GetCtrProcInitData` | [骨架](19-客户-资料与合同.md#getctrprocinitdata) |
| `GetCtrProcListList` | [骨架](19-客户-资料与合同.md#getctrproclistlist) |
| `GetCusCaseTypelistAll` | [骨架](19-客户-资料与合同.md#getcuscasetypelistall) |
| `GetCusContractlistAll` | [骨架](19-客户-资料与合同.md#getcuscontractlistall) |
| `GetCustomerBackInfo` | [骨架](19-客户-资料与合同.md#getcustomerbackinfo) |
| `GetCustomerBlackList` | [骨架](19-客户-资料与合同.md#getcustomerblacklist) |
| `GetCustomerContact` | [11](11-客户要求.md#getcustomercontact)。与邮件页 Mail.ashx 的同名 Call 不是一个接口 |
| `GetCustomerDemand` | [11](11-客户要求.md#getcustomerdemand)。客户级要求，不发文。响应正文未保存 |
| `GetCustomerInfo` | [11](11-客户要求.md#getcustomerinfo)。响应正文未保存 |
| `GetCustomerInit` | [骨架](19-客户-资料与合同.md#getcustomerinit) |
| `GetCustomerlist` | [骨架](19-客户-资料与合同.md#getcustomerlist) · [11](11-客户要求.md#getcustomerlist) |
| `GetCustomerVisit` | [骨架](19-客户-资料与合同.md#getcustomervisit) |
| `GetDemandInfo` | [11](11-客户要求.md#getdemandinfo)。这次抓包没有这条请求 |
| `GetInventorList` | [骨架](20-客户-跟进.md#customerashx-getinventorlist) |
| `GetLocalAgency` | [骨架](35-案件客户与专利费用.md#customerashx-getlocalagency) |
| `GetOfficeClassification` | [骨架](35-案件客户与专利费用.md#customerashx-getofficeclassification) |
| `GetPostrecordList` | [骨架](20-客户-跟进.md#customerashx-getpostrecordlist) |
| `GetRelationship` | [骨架](20-客户-跟进.md#customerashx-getrelationship) |
| `GetRemidList` | [骨架](20-客户-跟进.md#customerashx-getremidlist) |
| `GetRequestList` | [骨架](20-客户-跟进.md#customerashx-getrequestlist) |
| `GetResearchGroupInfo` | [骨架](42-案件页读取.md#customerashx-getresearchgroupinfo) |
| `GetTrControl` | [骨架](20-客户-跟进.md#customerashx-gettrcontrol) |
| `GetUrgemaillist` | [骨架](20-客户-跟进.md#customerashx-geturgemaillist) |
| `InitContractStatus` | [骨架](20-客户-跟进.md#customerashx-initcontractstatus) |
| `InitFollowStatus` | [骨架](20-客户-跟进.md#customerashx-initfollowstatus) |
| `LoadFollowList` | [骨架](20-客户-跟进.md#customerashx-loadfollowlist) |
| `SkipFAQ` | [骨架](41-发文页读取.md#customerashx-skipfaq) |

<a id="mailashx"></a>

### Mail.ashx

27 个。

| Call | 文档 |
|---|---|
| `AutoMailListInfo` | [09](09-期限监控.md#邮件页其余读取)。邮件地址联想。元素字段名脚本没有点出 |
| `EndEmailFlowd` | [08](08-流程审批.md#endemailflowd)。参数已由 mail.js 核对，这次没有调用 |
| `GetCaseAgentContact` | [09](09-期限监控.md#联系人与规则) |
| `GetCaseContact` | [09](09-期限监控.md#联系人与规则)。与 PatentAction.ashx 的同名 Call 不是一个接口 |
| `GetCustomerContact` | [09](09-期限监控.md#联系人与规则)。与 Customer.ashx 的同名 Call 不是一个接口 |
| `GetCustomerflow` | [09](09-期限监控.md#邮件页其余读取) |
| `Getforeignpic` | [09](09-期限监控.md#邮件页其余读取) |
| `GetImapMailList` | [骨架](38-发文列表.md#mailashx-getimapmaillist) |
| `GetMailCase` | [09](09-期限监控.md#getmailcase-getmailfile) |
| `Getmaildo` | [骨架](38-发文列表.md#mailashx-getmaildo) |
| `Getmaildraft` | [骨架](38-发文列表.md#mailashx-getmaildraft) |
| `GetMailFile` | [09](09-期限监控.md#getmailcase-getmailfile) |
| `GetMailFlowNode` | [骨架](38-发文列表.md#mailashx-getmailflownode) |
| `GetMailInfo` | [09](09-期限监控.md#getmailinfo) |
| `Getmaillist` | [骨架](38-发文列表.md#mailashx-getmaillist) |
| `GetMailRule` | [09](09-期限监控.md#联系人与规则) |
| `GetPicsContact` | [09](09-期限监控.md#联系人与规则) |
| `GetReceiveMailBaseData` | [骨架](38-发文列表.md#mailashx-getreceivemailbasedata) |
| `GetReceiveMailList` | [骨架](38-发文列表.md#mailashx-getreceivemaillist) |
| `GetRecentContact` | [09](09-期限监控.md#联系人与规则)。第二段样本 RecentContact 共 10 条 |
| `GetSalesContact` | [09](09-期限监控.md#联系人与规则) |
| `GetSignature` | [10](10-邮件签名.md#getsignature)。发文页下拉。个人设置是 Login.ashx。第二段样本 Signature 为 null |
| `GetSJHCMailRule` | [09](09-期限监控.md#邮件页其余读取)。第二段样本 SJHCMailRule 共 12 条 |
| `MailinfoInit` | [09](09-期限监控.md#mailinfoinit)。第二段样本 mailsettinglist 共 29 条，fee_ids 为 null |
| `MailSubmit` | [08](08-流程审批.md#mailsubmit)。成功看 ClientInfo.Result=true |
| `SaveMailInfo` | [07](07-发文与邮件.md#savemailinfo)。成功只看 ClientInfo.Status |
| `SaveMailRalteCaseFile` | [07](07-发文与邮件.md#savemailraltecasefile)。空 file_ids 时 Status=true、Result=false，页面仍继续 |

<a id="billashx"></a>

### Bill.ashx

23 个。

| Call | 文档 |
|---|---|
| `FeeSearchInit` | [骨架](33-账单请款.md#billashx-feesearchinit) |
| `GetAccountList` | [骨架](33-账单请款.md#billashx-getaccountlist)。与 FilingApiAction.ashx 的同名 Call 不是一个接口 |
| `GetAllBillFileList` | [骨架](33-账单请款.md#billashx-getallbillfilelist) |
| `GetAllOfficeFileList` | [骨架](33-账单请款.md#billashx-getallofficefilelist) |
| `GetAllRequestFileList` | [骨架](33-账单请款.md#billashx-getallrequestfilelist) |
| `GetBillInDetail` | [骨架](33-账单请款.md#billashx-getbillindetail) |
| `GetBillInDraft` | [骨架](33-账单请款.md#billashx-getbillindraft) |
| `GetBillOutDetail` | [骨架](33-账单请款.md#billashx-getbilloutdetail) |
| `GetBillOutDraft` | [骨架](33-账单请款.md#billashx-getbilloutdraft) |
| `GetBillSearchInit` | [骨架](33-账单请款.md#billashx-getbillsearchinit) |
| `GetCliamList` | [骨架](34-账单官费到款.md#billashx-getcliamlist) |
| `GetFeeListInitData` | [骨架](34-账单官费到款.md#billashx-getfeelistinitdata) |
| `GetManageList` | [骨架](28-账单与发票.md#billashx-getmanagelist) |
| `GetNodesByDept` | [骨架](34-账单官费到款.md#billashx-getnodesbydept) |
| `GetOfficeDetail` | [骨架](34-账单官费到款.md#billashx-getofficedetail) |
| `GetOfficeInit` | [骨架](34-账单官费到款.md#billashx-getofficeinit) |
| `GetOfficeList` | [骨架](34-账单官费到款.md#billashx-getofficelist) |
| `GetPaymentPlanList` | [骨架](28-账单与发票.md#billashx-getpaymentplanlist) |
| `GetPublishConfig` | [骨架](34-账单官费到款.md#billashx-getpublishconfig)。与 Common.ashx、BaseInfo.ashx 的同名 Call 不是一个接口 |
| `GetRequestCustomerList` | [骨架](34-账单官费到款.md#billashx-getrequestcustomerlist) |
| `GetRequestDraft` | [骨架](34-账单官费到款.md#billashx-getrequestdraft) |
| `GetRequsetBaseInfo` | [骨架](34-账单官费到款.md#billashx-getrequsetbaseinfo) |
| `InitPaymentPlanBase` | [骨架](28-账单与发票.md#billashx-initpaymentplanbase) |

<a id="patentactionashx"></a>

### PatentAction.ashx

22 个。

| Call | 文档 |
|---|---|
| `ApplyDraftList` | [骨架](21-专利动作.md#patentactionashx-applydraftlist) |
| `ApplyEntrustList` | [骨架](21-专利动作.md#patentactionashx-applyentrustlist) |
| `GetApplyFlowNode` | [骨架](21-专利动作.md#patentactionashx-getapplyflownode) |
| `GetApplyTags` | [骨架](21-专利动作.md#patentactionashx-getapplytags) |
| `GetCaseApplicant` | [骨架](41-发文页读取.md#patentactionashx-getcaseapplicant) |
| `GetCaseContact` | [骨架](21-专利动作.md#patentactionashx-getcasecontact) |
| `GetCaseInventor` | [骨架](21-专利动作.md#patentactionashx-getcaseinventor) |
| `GetCasePriority` | [骨架](21-专利动作.md#patentactionashx-getcasepriority) |
| `GetCustomerCaseAgency` | [骨架](21-专利动作.md#patentactionashx-getcustomercaseagency) |
| `GetDemandBuCaseid` | [骨架](21-专利动作.md#patentactionashx-getdemandbucaseid) · [09](09-期限监控.md#4-进入邮件页) |
| `GetFamilyOtherRelatedList` | [骨架](21-专利动作.md#patentactionashx-getfamilyotherrelatedlist) |
| `GetFieldColumn` | [骨架](21-专利动作.md#patentactionashx-getfieldcolumn) · [09](09-期限监控.md#1-打开列表) |
| `GetFileList` | [骨架](21-专利动作.md#patentactionashx-getfilelist) |
| `GetGoodsType` | [骨架](21-专利动作.md#patentactionashx-getgoodstype) |
| `GetIdsBaseInfo` | [骨架](21-专利动作.md#patentactionashx-getidsbaseinfo) |
| `GetImagePath` | [骨架](21-专利动作.md#patentactionashx-getimagepath) |
| `GetInnerTradeCase` | [骨架](21-专利动作.md#patentactionashx-getinnertradecase) |
| `GetOtherRelatedList` | [骨架](21-专利动作.md#patentactionashx-getotherrelatedlist) |
| `GetPatentData` | [骨架](21-专利动作.md#patentactionashx-getpatentdata) |
| `GetQuoteTradeList` | [骨架](21-专利动作.md#patentactionashx-getquotetradelist) |
| `GetTAdvanceList` | [骨架](21-专利动作.md#patentactionashx-gettadvancelist) |
| `LoadAutoFeeType` | [骨架](35-案件客户与专利费用.md#patentactionashx-loadautofeetype) |

<a id="reportashx"></a>

### Report.ashx

27 个。

| Call | 文档 |
|---|---|
| `CustomizedInit` | [骨架](40-报表.md#reportashx-customizedinit) |
| `FeeSearch` | [44-费用查询.md](44-费用查询.md) |
| `FeeSearchTotalAmount` | [44-费用查询.md](44-费用查询.md) |
| `FlowMonitorInfo` | [09](09-期限监控.md#2-getlimitmonitorcaselist)。type=flow 时列表 Call 改成这个，响应未核对 |
| `GetBjshBatchMailReportConfig` | [骨架](40-报表.md#reportashx-getbjshbatchmailreportconfig) |
| `GetCommonReportList` | [骨架](40-报表.md#reportashx-getcommonreportlist) |
| `GetCtrlproc` | [骨架](40-报表.md#reportashx-getctrlproc) |
| `GetCustomizedInfo` | [骨架](40-报表.md#reportashx-getcustomizedinfo) |
| `GetCustomzedReportList` | [骨架](40-报表.md#reportashx-getcustomzedreportlist) |
| `GetDecimalNum` | [骨架](40-报表.md#reportashx-getdecimalnum) |
| `GetFlowNode` | [骨架](40-报表.md#reportashx-getflownode) |
| `GetLimitMonitorCaseList` | [骨架](27-期限监控列表.md#reportashx-getlimitmonitorcaselist) · [09](09-期限监控.md#2-getlimitmonitorcaselist) |
| `GetPointInfo` | [骨架](40-报表.md#reportashx-getpointinfo) |
| `GetPointTags` | [骨架](27-期限监控列表.md#reportashx-getpointtags) |
| `LimitMonitorGetCtrlproc` | [骨架](27-期限监控列表.md#reportashx-limitmonitorgetctrlproc) · [09](09-期限监控.md#1-打开列表) |
| `LimitMonitorGetCtrlprocNew` | [09](09-期限监控.md#4-进入邮件页)。第二段样本 CtrlProc 共 432 条 |
| `LimitMonitorGetFeeType` | [骨架](27-期限监控列表.md#reportashx-limitmonitorgetfeetype) · [09](09-期限监控.md#1-打开列表) |
| `LimitMonitorGetIdsCtrlproc` | [骨架](27-期限监控列表.md#reportashx-limitmonitorgetidsctrlproc) |
| `LimitMonitorInit` | [骨架](27-期限监控列表.md#reportashx-limitmonitorinit) · [09](09-期限监控.md#1-打开列表) |
| `PointSearch` | [骨架](40-报表.md#reportashx-pointsearch) |
| `ProjectFeeSearch` | [骨架](40-报表.md#reportashx-projectfeesearch) |
| `ReportBaseData` | [骨架](40-报表.md#reportashx-reportbasedata) |
| `ExcelFeeListByChecked` | [45](45-高级导出与模板协议.md#32-excelfeelistbychecked导出勾选费用)。按勾选 `fee_ids` 服务端生成费用 Excel |
| `ExcelFeeListByCond` | [45](45-高级导出与模板协议.md#31-excelfeelistbycond导出清单)。按当前查询条件服务端生成全量费用 Excel |
| `ExcelFeeListCountByCond` | [45](45-高级导出与模板协议.md#33-excelfeelistcountbycond导出汇总数据)。按案件汇总官费/代理费/第三方费导出 Excel |
| `GetCustomerTreeData` | [46](46-运行期补充接口契约.md#getcustomertreedatareportashx)。费用查询客户选择二级弹窗（`ShowIhgSelect`）检索 |
| `GetTreeApplicant` | [46](46-运行期补充接口契约.md#gettreeapplicantreportashx)。费用查询按已选客户联动加载申请人树 |

<a id="baseinfoashx"></a>

### BaseInfo.ashx

21 个。

| Call | 文档 |
|---|---|
| `DeleteTemp` | [06](06-文件操作.md#deletetemp)。2026-11-01 抓包已核对 |
| `DownLoad` | [06](06-文件操作.md#下载)。2026-10-26 抓包已核对：`file_guid` 非空即成功，包内条目名等于 `file_name` |
| `DownLoadFiles` | [06](06-文件操作.md#下载)。没有重新执行 |
| `DownLoadZip` | [06](06-文件操作.md#下载)。没有重新执行 |
| `GetBaseData` | [骨架](31-基础信息补充.md#baseinfoashx-getbasedata) |
| `GetBaseInfo` | [骨架](31-基础信息补充.md#baseinfoashx-getbaseinfo) |
| `GetCaseInfo` | [13](13-案件查询.md#3-点行时的-getcaseinfo)。只返回三个字段，不是案件详情 |
| `GetCustomField` | [骨架](22-基础信息.md#baseinfoashx-getcustomfield) |
| `GetDeptBranch` | [骨架](22-基础信息.md#baseinfoashx-getdeptbranch) · [02](02-公共数据.md#getdeptbranch) |
| `GetFileTempNameList` | [骨架](22-基础信息.md#baseinfoashx-getfiletempnamelist) · [06](06-文件操作.md#getfiletempnamelist) |
| `GetFileTempZipNameList` | [骨架](22-基础信息.md#baseinfoashx-getfiletempzipnamelist) · [06](06-文件操作.md#getfiletempnamelist) |
| `GetHideApplyType` | [骨架](22-基础信息.md#baseinfoashx-gethideapplytype) |
| `GetMenuPermit` | [骨架](43-首页与待办.md#baseinfoashx-getmenupermit) |
| `GetProjectMenu` | [骨架](31-基础信息补充.md#baseinfoashx-getprojectmenu) |
| `GetProjectTypeDic` | [骨架](22-基础信息.md#baseinfoashx-getprojecttypedic) |
| `GetPublishConfig` | [骨架](22-基础信息.md#baseinfoashx-getpublishconfig) · [47](47-来文管理.md#1-初始化字典热加载与角标计数)。参数是成对的 type 和 key |
| `GetSet` | [骨架](43-首页与待办.md#baseinfoashx-getset) |
| `GetStageByProjectTypeID` | [骨架](22-基础信息.md#baseinfoashx-getstagebyprojecttypeid) |
| `GetUserDetail` | [骨架](31-基础信息补充.md#baseinfoashx-getuserdetail) |
| `SaveFileTepmName` | [06](06-文件操作.md#savefiletepmname)。Call 名里的 Tepm 是页面原文，2026-11-01 抓包已核对 |
| `GetProducts` | [46](46-运行期补充接口契约.md#getproductsbaseinfoashx)。费用高级查询产品类别树 |

<a id="noticeashx"></a>

### Notice.ashx

34 个。

| Call | 文档 |
|---|---|
| `ChangeNolaiuto` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。切换无需导入状态（`value=1/0`） |
| `CheckImportNotice` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。导入前检查重复通知书或费减异常 |
| `GetAgency` | [骨架](25-官文.md#noticeashx-getagency) · [47](47-来文管理.md#1-初始化字典热加载与角标计数) |
| `GetApplyType` | [骨架](25-官文.md#noticeashx-getapplytype) · [47](47-来文管理.md#1-初始化字典热加载与角标计数) |
| `GetCasechargedept` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。来文详情选定案件后联动读取承办部门（`DeptInfo.dept_name`） |
| `GetDirectionType` | [骨架](25-官文.md#noticeashx-getdirectiontype) · [47](47-来文管理.md#1-初始化字典热加载与角标计数) |
| `GethandExcelList` | [骨架](25-官文.md#noticeashx-gethandexcellist) · [47](47-来文管理.md#21-页签与接口路由总表) |
| `GetHandHisList` | [47](47-来文管理.md#21-页签与接口路由总表)。异常处理记录页签检索 |
| `GetHandNoticeList` | [骨架](25-官文.md#noticeashx-gethandnoticelist) · [47](47-来文管理.md#21-页签与接口路由总表) |
| `GetImportNoticeList` | [47](47-来文管理.md#21-页签与接口路由总表)。导入来文「已完成 `status=1`」页签检索 |
| `GetMailNoticeList` | [骨架](37-登录邮箱与官文通知.md#noticeashx-getmailnoticelist) |
| `GetNolaiuto` | [47](47-来文管理.md#21-页签与接口路由总表)。无需导入来文页签检索 |
| `GetNolaiutoCount` | [骨架](25-官文.md#noticeashx-getnolaiutocount) · [47](47-来文管理.md#1-初始化字典热加载与角标计数) |
| `GetNoticeCaseType` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。来文详情选定案件后联动读取案件类型（`CaseTypeInfo.case_type_id`） |
| `GetNoticeDetail` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。读取来文详情 `NoticeInfo` |
| `GetNoticeduibi` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。来文详情「对比文件」子表（`TableRows[]`） |
| `GetNoticefee` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。来文详情「官费信息」子表（`TableRows[]`） |
| `GetNoticehebo` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。来文详情「核驳信息」子表（`TableRows[]`） |
| `ImportCloseCase` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。结案案件只导文件不建新任务 |
| `ImportNotice` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。导入来文到系统 |
| `LimitMailCustomer` | [09](09-期限监控.md#3-从列表创建发文)。Result=false 仍可成功。NeedConfirmFillAgency 要停 |
| `MailCustomer` | [07](07-发文与邮件.md#mailcustomer) · [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。成功只看 objid |
| `MailCustomerForProgressing` | [09](09-期限监控.md#3-从列表创建发文)。特定租户才会改用这个 Call |
| `MailCustomerNew` | [07](07-发文与邮件.md#mailcustomer)。不提交 mailtype，打开草稿页 |
| `RecoveryProcessstatus` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。恢复未处理状态 |
| `RecoveryStatusAnalyse` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。恢复未处理并返还递交助手重新分析 |
| `ReMatchNotice` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。重新匹配案件 |
| `ReportNoticeExcel` | [47](47-来文管理.md#5-四大服务端-excel-导出接口ihgadvexport-协议)。导出导入来文清单 |
| `SaveNoticeDetail` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。保存手工修正后的来文详情 |
| `SearchNotice` | [骨架](25-官文.md#noticeashx-searchnotice) · [47](47-来文管理.md#22-导入来文searchnotice--getimportnoticelist请求参数与静态枚举) |
| `UpdateCaseName` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。批量更新来文案件名称 |
| `UpdateHandExcel` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。更新电子申请清单为已处理 |
| `UpdateProcessstatus` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。更新来文处理状态为已完成 |
| `UploadNoticeExcel` | [47](47-来文管理.md#3-noticeashx-详情业务写操作与清单上传)。上传电子申请清单 Excel 参与对比 |

<a id="loginashx"></a>

### Login.ashx

10 个。

| Call | 文档 |
|---|---|
| `DeletSignatureset` | [10](10-邮件签名.md#保存和删除)。Call 的拼写是 Delet。未调用 |
| `GetAgentSignature` | [骨架](37-登录邮箱与官文通知.md#loginashx-getagentsignature) |
| `GetBankList` | [骨架](37-登录邮箱与官文通知.md#loginashx-getbanklist) |
| `GetCompanyInfo` | [骨架](41-发文页读取.md#loginashx-getcompanyinfo) |
| `Getmailset` | [10](10-邮件签名.md#getmailset)。第二段抓包有 2 次。页面仍只读 mailsetinfo[0].Signature |
| `GetMailSettingList` | [骨架](37-登录邮箱与官文通知.md#loginashx-getmailsettinglist) |
| `GetMailSignatureSettingList` | [10](10-邮件签名.md#getmailsignaturesettinglist)。第二段抓包 TableRows 为 null，TableRowsCount 为字符串 0 |
| `GetSignatureset` | [10](10-邮件签名.md#getsignatureset)。响应正文未保存 |
| `SaveSignatureset` | [10](10-邮件签名.md#保存和删除)。未调用 |
| `GetUserModel` | [46](46-运行期补充接口契约.md#getusermodel)。会话心跳与当前登录操作人身份探测（`Result=false` 仍可已登录，掉线可能返回短 HTML） |

<a id="eflowashx"></a>

### Eflow.ashx

6 个。

| Call | 文档 |
|---|---|
| `Geteflowcheck` | [骨架](26-核稿.md#eflowashx-geteflowcheck) |
| `GeteflowInList` | [骨架](26-核稿.md#eflowashx-geteflowinlist) |
| `Geteflowwrite` | [骨架](26-核稿.md#eflowashx-geteflowwrite) |
| `GetTsEflowcheck` | [骨架](26-核稿.md#eflowashx-gettseflowcheck) |
| `GetTsEflowFinishList` | [骨架](26-核稿.md#eflowashx-gettseflowfinishlist) |
| `GetTsEflowwrite` | [骨架](26-核稿.md#eflowashx-gettseflowwrite) |

<a id="filingactionashx"></a>

### FilingAction.ashx

23 个。

| Call | 文档 |
|---|---|
| `GetApplicantFeeReduce` | [骨架](41-发文页读取.md#filingactionashx-getapplicantfeereduce) |
| `GetAttachFiles` | [骨架](41-发文页读取.md#filingactionashx-getattachfiles) |
| `GetAttached` | [骨架](41-发文页读取.md#filingactionashx-getattached) |
| `GetCaseByFiling` | [骨架](41-发文页读取.md#filingactionashx-getcasebyfiling) |
| `GetCaseConMail` | [骨架](41-发文页读取.md#filingactionashx-getcaseconmail)。数据在 `TableRowsS`，`TableRows` 为 null |
| `GetCaseExpandInfo` | [骨架](41-发文页读取.md#filingactionashx-getcaseexpandinfo) |
| `GetConvertStatus` | [骨架](41-发文页读取.md#filingactionashx-getconvertstatus) |
| `GetConvertedFile` | [骨架](41-发文页读取.md#filingactionashx-getconvertedfile) |
| `GetFilingFlowNode` | [骨架](23-递交.md#filingactionashx-getfilingflownode) |
| `GetFilingInfo` | [骨架](41-发文页读取.md#filingactionashx-getfilinginfo)。顶层键随 `Code` 变 |
| `GetFilingInfoBase` | [骨架](41-发文页读取.md#filingactionashx-getfilinginfobase) |
| `GetFilingTypeInfo` | [骨架](41-发文页读取.md#filingactionashx-getfilingtypeinfo)。业务键名随 `type_code` 变 |
| `GetFinished` | [骨架](23-递交.md#filingactionashx-getfinished) |
| `GetGeneralEntrustFileList` | [骨架](41-发文页读取.md#filingactionashx-getgeneralentrustfilelist) |
| `GetHasPriority` | [骨架](41-发文页读取.md#filingactionashx-gethaspriority) |
| `GetProcess` | [骨架](23-递交.md#filingactionashx-getprocess) |
| `GetProcessDraft` | [骨架](23-递交.md#filingactionashx-getprocessdraft) |
| `GetProcessing` | [骨架](23-递交.md#filingactionashx-getprocessing) |
| `GetRecFileList` | [骨架](41-发文页读取.md#filingactionashx-getrecfilelist) |
| `GetRespInfoCaseList` | [骨架](23-递交.md#filingactionashx-getrespinfocaselist) |
| `GetRespInfoList` | [骨架](41-发文页读取.md#filingactionashx-getrespinfolist) |
| `GetSelecteFile` | [骨架](41-发文页读取.md#filingactionashx-getselectefile) |
| `InitFilingContact` | [骨架](41-发文页读取.md#filingactionashx-initfilingcontact) |

<a id="batchashx"></a>

### Batch.ashx

5 个。

| Call | 文档 |
|---|---|
| `GetBatchList` | [骨架](32-批处理.md#batchashx-getbatchlist) |
| `GetContractAgencyFeeList` | [骨架](32-批处理.md#batchashx-getcontractagencyfeelist) |
| `GetInitBatchControl` | [骨架](32-批处理.md#batchashx-getinitbatchcontrol) |
| `GetUploadAllFile` | [骨架](32-批处理.md#batchashx-getuploadallfile) |
| `GetUploadAllFileLog` | [骨架](32-批处理.md#batchashx-getuploadallfilelog) |

<a id="crmactionashx"></a>

### CRMAction.ashx

6 个。

| Call | 文档 |
|---|---|
| `GetContractEditFeeAuth` | [骨架](29-合同CRM.md#crmactionashx-getcontracteditfeeauth) |
| `GetContractInfo` | [骨架](29-合同CRM.md#crmactionashx-getcontractinfo) |
| `GetContractVoidEditAuth` | [骨架](29-合同CRM.md#crmactionashx-getcontractvoideditauth) |
| `GetHeadUserId` | [骨架](42-案件页读取.md#crmactionashx-getheaduserid) |
| `GetPerFlag` | [骨架](29-合同CRM.md#crmactionashx-getperflag) |
| `LoadFileType` | [骨架](29-合同CRM.md#crmactionashx-loadfiletype) |

<a id="wadebuttactionashx"></a>

### WadeButtAction.ashx

5 个。

| Call | 文档 |
|---|---|
| `GetCustomerConfigList` | [骨架](30-外联配置.md#wadebuttactionashx-getcustomerconfiglist) |
| `GetTreeUser` | [骨架](30-外联配置.md#wadebuttactionashx-gettreeuser) |
| `LoadAPIURL` | [骨架](30-外联配置.md#wadebuttactionashx-loadapiurl) |
| `LoadCustomerConfigNOVPN` | [骨架](30-外联配置.md#wadebuttactionashx-loadcustomerconfignovpn) |
| `LoadCustomerConfigVPN` | [骨架](30-外联配置.md#wadebuttactionashx-loadcustomerconfigvpn) |

<a id="udactionashx"></a>

### UDAction.ashx

4 个。

| Call | 文档 |
|---|---|
| `GetFinish` | [骨架](24-数据更新.md#udactionashx-getfinish) |
| `GetProcessing` | [骨架](24-数据更新.md#udactionashx-getprocessing) |
| `GetProcessList` | [骨架](24-数据更新.md#udactionashx-getprocesslist) |
| `GetUTypeConfig` | [骨架](24-数据更新.md#udactionashx-getutypeconfig) |

<a id="filingapiactionashx"></a>

### FilingApiAction.ashx

25 个。

| Call | 文档 |
|---|---|
| `CheckUserStatus` | [47](47-来文管理.md#41-cpc-账号登录态校验)。检查分支机构 CPC 账号登录状态（需扫码返回 401） |
| `DeleteOaInfoByFids` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。按 `fids` 删除待下载通知书记录 |
| `DownloadAndAnalyseCert` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。触发下载并解析专利电子证书 |
| `ExportExcelTwoTzsList` | [47](47-来文管理.md#5-四大服务端-excel-导出接口ihgadvexport-协议)。导出「来文二次下载」核对清单 |
| `ExportExcelTzsList` | [47](47-来文管理.md#5-四大服务端-excel-导出接口ihgadvexport-协议)。导出「来文下载」清单 |
| `GetAccountList` | [骨架](23-递交.md#filingapiactionashx-getaccountlist) |
| `GetAnalyseCertStatus` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。轮询电子证书下载解析状态 |
| `GetCertList` | [47](47-来文管理.md#23-其余页签检索参数与静态枚举)。查询专利电子证书下载列表 |
| `GetCertListExport` | [47](47-来文管理.md#5-四大服务端-excel-导出接口ihgadvexport-协议)。导出「专利电子证书下载」清单 |
| `GetCertListStatus` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。轮询获取专利电子证书列表状态 |
| `GetCheckInfo` | [骨架](41-发文页读取.md#filingapiactionashx-getcheckinfo) |
| `GetCPCBusineeType` | [骨架](41-发文页读取.md#filingapiactionashx-getcpcbusineetype) |
| `GetCpcCertList` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。触发从 CPC 拉取电子证书列表 |
| `GetCpcNoticeAccount` | [骨架](23-递交.md#filingapiactionashx-getcpcnoticeaccount) · [47](47-来文管理.md#1-初始化字典热加载与角标计数) |
| `GetCPCTzsDate` | [47](47-来文管理.md#1-初始化字典热加载与角标计数)。读取来文下载默认起始时间 |
| `GetCpcTzsUser` | [47](47-来文管理.md#41-cpc-账号登录态校验)。批量检查 CPC 账号在线时长与扫码过期状态 |
| `GetFileListByAppNo` | [47](47-来文管理.md#43-案件已有官文列表)。按申请号读取该案已入库官文列表（对应原站 `NoHandFileList.aspx`） |
| `GetReaplyTzsStatus` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。二次下载后按 `fids` 回查单行状态（原站拼写 `Reaply`） |
| `GetReplayTzsList` | [47](47-来文管理.md#23-其余页签检索参数与静态枚举)。查询来文二次下载云端列表 |
| `GetSubmitList` | [骨架](23-递交.md#filingapiactionashx-getsubmitlist) |
| `GetTzsList` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。触发从 CPC 拉取通知书列表 |
| `GetTzsListStatus` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。轮询 CPC 通知书列表拉取状态 |
| `GetUnProcessTzsList` | [47](47-来文管理.md#23-其余页签检索参数与静态枚举)。查询来文下载列表 |
| `ProcessTzsList` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。触发分析下载官文通知书 |
| `ProcessTzsListStatus` | [47](47-来文管理.md#42-异步列表拉取解析下载与删除)。轮询官文通知书分析下载状态 |

<a id="filingtradeactionashx"></a>

### FilingTradeAction.ashx

3 个。

| Call | 文档 |
|---|---|
| `GetAllProvinceCityCode` | [骨架](23-递交.md#filingtradeactionashx-getallprovincecitycode) |
| `GetFinished` | [骨架](23-递交.md#filingtradeactionashx-getfinished) |
| `GetProcessDraft` | [骨架](23-递交.md#filingtradeactionashx-getprocessdraft) |

<a id="mailactionashx"></a>

### MailAction.ashx

3 个。

| Call | 文档 |
|---|---|
| `gettype` | [骨架](39-外部邮件.md#mailactionashx-gettype) |
| `GetUserMailList` | [骨架](39-外部邮件.md#mailactionashx-getusermaillist) |
| `ReceiveIMAP` | [骨架](39-外部邮件.md#mailactionashx-receiveimap) |

<a id="agencyepeflowaspx"></a>

### AgencyEpEflow.aspx

2 个。

| Call | 文档 |
|---|---|
| `Geteflowcheck` | [骨架](26-核稿.md#agencyepeflowaspx-geteflowcheck)。打到页面自身，响应是 HTML。与 Eflow.ashx 的同名 Call 不是一个接口 |
| `（无 Call）` | [骨架](26-核稿.md#agencyepeflowaspx-未带-call)。打到页面自身，响应是 HTML |

<a id="ajaxserversundefined"></a>

### AjaxServers/undefined

1 个。

| Call | 文档 |
|---|---|
| `Genetic_Registered` | [骨架](41-发文页读取.md#undefined-genetic_registered)。前端把入口拼成 `/AjaxServers/undefined`，HTTP 404 |

<a id="batcheflowlist"></a>

### BatchEflowList

1 个。

| Call | 文档 |
|---|---|
| `undefined/api/DataPush/BatchEflowList` | [骨架](26-核稿.md#batcheflowlist-undefinedapidatapushbatcheflowlist)。前端把路径拼错，HTTP 404 |

<a id="cfinvoiceashx"></a>

### CFInvoice.ashx

1 个。

| Call | 文档 |
|---|---|
| `GetBiologyList` | [骨架](28-账单与发票.md#cfinvoiceashx-getbiologylist) |

<a id="controllerashx"></a>

### controller.ashx

1 个。

| Call | 文档 |
|---|---|
| `config` | [骨架](37-登录邮箱与官文通知.md#controllerashx-config)。GET /ueditor/controller.ashx?action=config，编辑器配置，不是业务发文接口 |

<a id="customerashx-lower"></a>

### customer.ashx

1 个。

| Call | 文档 |
|---|---|
| `GetBrachDept` | [骨架](19-客户-资料与合同.md#customerashx-getbrachdept)。路径是小写 customer.ashx，响应键 BrachDeptinfo |

<a id="filehandlernewashx"></a>

### FileHandlerNew.ashx

1 个。

| Call | 文档 |
|---|---|
| `（guid 下载，无 Call）` | [06](06-文件操作.md#下载)。批量打包，`FileHandlerNew.ashx?guid=` |

<a id="filingusactionashx"></a>

### FilingUSAction.ashx

1 个。

| Call | 文档 |
|---|---|
| `IsUSFilingAvaliable` | [骨架](23-递交.md#filingusactionashx-isusfilingavaliable) |

<a id="ruleashx"></a>

### Rule.ashx

1 个。

| Call | 文档 |
|---|---|
| `LoadCustomerMailType` | [09](09-期限监控.md#邮件页其余读取) |

<a id="tnoticeashx"></a>

### TNotice.ashx

1 个。

| Call | 文档 |
|---|---|
| `SearchUnImportNotices` | [骨架](25-官文.md#tnoticeashx-searchunimportnotices) |

<a id="uploadfileaspx"></a>

### UploadFile.aspx

1 个。

| Call | 文档 |
|---|---|
| `CommUpload` | [06](06-文件操作.md#上传)。页面入口已核对，未上传 |

<a id="agencyactionashx"></a>

### AgencyAction.ashx

1 个。

| Call | 文档 |
|---|---|
| `AgencySearchCase` | [46](46-运行期补充接口契约.md#agencysearchcase)。按客户文号批量反查案件主键（实体编码 XML `Element`） |

<a id="filehandlerashx"></a>

### FileHandler.ashx

1 个。

| Call | 文档 |
|---|---|
| `（guid 取件，无 Call）` | [46](46-运行期补充接口契约.md#5-统一文件取件入口filehandlerashx) · [45](45-高级导出与模板协议.md#41-同步导出响应常规数据量)。打包 ZIP 与高级导出 Excel 统一取件入口，`FileHandler.ashx?guid=` |

<a id="uploadfileashx"></a>

### UploadFile.ashx

4 个。

| Call | 文档 |
|---|---|
| `GetUploadProcessDetailList` | [47](47-来文管理.md#6-cpc--国防官文压缩包上传与进度追踪)。按 `record_id` 与处理状态查询单批次官文上传明细 |
| `GetUploadProcessList` | [47](47-来文管理.md#6-cpc--国防官文压缩包上传与进度追踪)。查询官文压缩包上传解析进度列表 |
| `UploadCPCFileNew` | [47](47-来文管理.md#6-cpc--国防官文压缩包上传与进度追踪)。提交普通 CPC 官文压缩包解压分析 |
| `UploadCPCFileNewGF` | [47](47-来文管理.md#6-cpc--国防官文压缩包上传与进度追踪)。提交国防专利官文压缩包解压分析 |

<a id="formsmultiuploaduploadmethodashx"></a>

### Forms/MultiUPload/UploadMethod.ashx

1 个。

| Call | 文档 |
|---|---|
| `（GUID 分片上传，无 Call）` | [47](47-来文管理.md#6-cpc--国防官文压缩包上传与进度追踪)。接收 `multipart/form-data` `.zip` 上传，按 `?GUID=` 暂存 |
