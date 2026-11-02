# 季华平台发明台账：附件分类与关联字段

核查日期：2026-11-02。来源：已加载的 `chunk-716fd620.bbe50f07.js` 与 `chunk-commons.a81cb228.js`，并以当前表单/最近提交缓存的字段类型交叉核对。主协议、证据边界及后续实现约束见[上传与台账更新](jihualab.md)。

## 如何使用

- 当前台账上传额外字段 `TABLE_NAME=PAT_PATENT_PARAMETER`。
- “普通上传”调用 `POST /prod-api/conow/file/upload`，携带 `file`、`TABLE_NAME`、`APPENDIX_TYPE`。组件附件列表上限 10。
- 表中有 `OFC_TYPE` 的材料使用 `POST /prod-api/conow/file/uploadAndOfc`，额外传该值。组件附件列表上限 1。
- 详情读取 `data.<关联字段>Obj[]`；保存时把其对象的 `ID` 组成数组，放进 JSON 请求根级 `<关联字段>`。保留同类已有 ID 及其他分类；后端全量替换/追加语义仍待验证。
- 这些是前端组件规则，不证明服务端的文件格式、大小或数量上限。官文识别回填是另一阶段，不等于台账已经保存。

## 页面可见的 39 种附件映射

同一“优先审查结果通知书”在编辑和详情区域重复渲染；以下按关联字段去重，采用编辑区域的 OFC 配置。文案按源代码保留，包括“授予发明权利权通知书”。

| 页面材料名称 | APPENDIX_TYPE | 根级关联字段 | OFC_TYPE / 上传方式 |
| --- | --- | --- | --- |
| 首次检索报告文件 | `FIRST_RESULT` | `firstResultAppendixList` | 普通上传 |
| 提案名称-技术交底书-修改版 | `MODIFY_TECHNICAL_DISCLOSURE` | `modifyTechnicalDisclosureAppendixList` | 普通上传 |
| 提案名称-检索报告-第二次或最终 | `FINAL_SEARCH_REPORT` | `finalSearchReportAppendixList` | 普通上传 |
| 最终检索报告文件 | `FINAL_RESULT` | `finalResultAppendixList` | 普通上传 |
| 快速预审承诺书 | `FAST_PROMISE` | `fastPromiseAppendixList` | 普通上传 |
| 专利申请快速预审受理/不受理通知书 | `FAST_ACPT_NOTICE` | `fastAcptNoticeAppendixList` | `FETCH_NOTICE` |
| 专利申请快速预审请求审查意见通知书 | `FAST_CHECK_REQ_NOTICE` | `fastCheckReqNoticeAppendixList` | 普通上传 |
| 专利申请快速预审请求通过/不通过通知书 | `FAST_CHECK_REQ_PASS` | `fastCheckReqPassAppendixList` | 普通上传 |
| 终版的技术交底书 | `FINAL_TECHNICAL_DISCLOSURE` | `finalTechnicalDisclosureAppendixList` | 普通上传 |
| 申请文件终稿文件 | `FINAL_APPLICATION_DOCUMENTS` | `finalApplicationDocumentsAppendixList` | 普通上传 |
| 提交到国知局的请求书 | `COMMIT_SASAC_REQUEST` | `commitSasacRequestAppendixList` | 普通上传 |
| 提交到国知局的申请文件 | `COMMIT_SASAC_APPLY` | `commitSasacApplyAppendixList` | 普通上传 |
| 专利申请受理通知书 | `ACPT_NOTICE` | `acptNoticeAppendixList` | `FETCH_PDF` |
| 费用减缴通知书 | `FEE_REDUCTION_APPROVAL_NOTICE` | `feeReductionApprovalNoticeAppendixList` | 普通上传 |
| 第一次补正通知书 | `FIRST_FIX` | `firstFixAppendixList` | 普通上传 |
| 专利请求书 | `PATENT_REQUEST` | `patentRequestAppendixList` | 普通上传 |
| 申请文件 | `APPLY_FILE` | `applyFileAppendixList` | 普通上传 |
| 发明专利申请初步审查合格通知书 | `FIRST_CHECK_PASS_NOTICE` | `firstCheckPassNoticeAppendixList` | 普通上传 |
| 发明专利申请公布通知书 | `SUB_EXAM_PHASE_NOTICE` | `subExamPhaseNoticeAppendixList` | `FETCH_PUBTIME` |
| 发明专利申请进入实质审查阶段通知书 | `EXA_STAGE_NOTICE` | `exaStageNoticeAppendixList` | `FETCH_ISSUETIME` |
| 审查意见通知书 | `REVIEW_NOTICE` | `reviewNoticeAppendixList` | 普通上传 |
| 意见陈述书 | `OPINION_STATEMENT` | `opinionStatementAppendixList` | 普通上传 |
| 权利要求或说明书替换页 | `CLAIM` | `claimAppendixList` | 普通上传 |
| 优先审查结果通知书 | `PRIORITY_REVIEW_RESULT_NOTICE` | `priorityReviewResultNoticeAppendixList` | `FETCH_REVIEWRESULT` |
| 专利申请优先审查请求书 | `PRIORITY_REVIEW_REQ` | `priorityReviewReqAppendixList` | 普通上传 |
| 优先审查代理委托书 | `PRIORITY_REVIEW_PROXY` | `priorityReviewProxyAppendixList` | 普通上传 |
| 优先审查证明文件说明 | `PRIORITY_REVIEW_PROOF` | `priorityReviewProofAppendixList` | 普通上传 |
| 事业单位法人证书 | `CORP_CERTIFICATE` | `corpCertificateAppendixList` | 普通上传 |
| 专利申请予以优先审查通知书 | `PRIORITY_REVIEW_NOTICE` | `priorityReviewNoticeAppendixList` | 普通上传 |
| 授予发明权利权通知书 | `GRANT_NOTICE` | `grantNoticeAppendixList` | 普通上传 |
| 办理登记手续通知书 | `REGISTRATION_NOTICE` | `registrationNoticeAppendixList` | 普通上传 |
| 发明专利证书 | `STATUS_RIGHT` | `statusRightAppendixList` | `FETCH_AUTHORTIME` |
| 驳回决定 | `REJECT_DECISION` | `rejectDecisionAppendixList` | `FETCH_REJECTTIME` |
| 驳回分析报告 | `REJECT_REPORT` | `rejectReportAppendixList` | 普通上传 |
| 视为撤回通知书 | `REGARD_AS_REVOKE` | `regardAsRevokeAppendixList` | 普通上传 |
| 手续合格通知书 | `COMPLIANCE_NOTICE` | `complianceNoticeAppendixList` | 普通上传 |
| 转让手续合格通知书 | `TRANSFER_PRO_QUALIFIED` | `transferProQualifiedAppendixList` | 普通上传 |
| 发票 | `EXP_INVOICE` | `expInvoiceAppendixList` | 普通上传 |
| 请款单 | `FUND_REQ` | `fundReqAppendixList` | 普通上传 |

## 另一个提交字段

`fastCheckReqFixAppendixList` 出现在源码的 `appendixKeys` 和运行态最近提交结构中，但未在该版本页面找到对应上传控件。它使发明页顶层附件关联字段总数为 **40**。当前不能仅凭字段名自造其 `APPENDIX_TYPE`、`OFC_TYPE` 或材料识别规则；适配应保留回读结果。

## 按业务状态处理的附件分组

页面先将全部附件对象转成 ID 数组，再根据字符串开关清理下列分组；被清理的字段设为 null，已有 ID 进入独立删除队列。详情中字符串状态与分组适用性必须先核实。

| 条件不成立时清理 | 对应关联字段 |
| --- | --- |
| `IS_FAST === "TRUE"` | fastPromiseAppendixList、fastAcptNoticeAppendixList、fastCheckReqFixAppendixList、fastCheckReqNoticeAppendixList、fastCheckReqPassAppendixList |
| `IS_HAVE_GER === "TRUE"` | acptNoticeAppendixList、feeReductionApprovalNoticeAppendixList、firstFixAppendixList、patentRequestAppendixList、applyFileAppendixList |
| `IS_REVIEW === "TRUE"` 或 `"READY"` | priorityReviewReqAppendixList、priorityReviewProxyAppendixList、priorityReviewProofAppendixList、corpCertificateAppendixList、priorityReviewNoticeAppendixList、priorityReviewResultNoticeAppendixList |

`fastCheckReqFixAppendixList` 即使没有当前可见控件，也属于第一个分组。不要因为当前页面未显示某上传入口就把它当成不存在的附件数据。

## 与 EASY 文件分类的关系

EASY 的文件描述、下载名称模板和本表不是同一套枚举。后续自动传文需要显式配置“源文件描述/用途 → 客户平台 APPENDIX_TYPE → 关联字段”；不能只凭文件名出现“通知书”就任选分类。源文件可能是 PDF、ZIP、Word HTML 或邮件，进入 OFC 前应核对实际内容格式。

本表主体对应发明台账；实用新型差异见下节。外观、PCT、软著尚未映射，不自动沿用本表。

## 实用新型页面差异（2026-11-02 补充）

来源为已加载的 `chunk-3022ef86.c2bb621e.js`，上传控件位于格式化证据约 2159–7243 行，`appendixKeys` 与更新逻辑约 9953–10000 行。这是静态页面契约，未证明服务端实传验收。

- 共有 30 个可见上传分类，字段与发明同名。发明表中以下 9 类没有实用新型上传控件：快速预审 4 类（FAST_PROMISE、FAST_ACPT_NOTICE、FAST_CHECK_REQ_NOTICE、FAST_CHECK_REQ_PASS）、终版的技术交底书、申请文件终稿文件、发明专利申请公布通知书、发明专利申请进入实质审查阶段通知书、转让手续合格通知书。
- OFC 只有 `ACPT_NOTICE → FETCH_PDF` 和 `PRIORITY_REVIEW_RESULT_NOTICE → FETCH_REVIEWRESULT`。`STATUS_RIGHT`、`REJECT_DECISION` 走普通上传，不携带 OFC_TYPE。
- 保存字段共 31 个：上述 30 个分类字段，加保留字段 `subExamPhaseNoticeAppendixList`；这个保留字段没有当前上传控件，适配只能保留回读数据，不能据此创建上传规则。
- 业务开关分组只有一般申请 5 个字段与优先审查 6 个字段，与上表对应规则相同；没有快速预审清理分组。

生产映射见 `patmail-extension/src/jihua/materials.ts`，工作台使用说明见 [季华实验室传文](../../patmail-extension/docs/jihua-upload.md)。
