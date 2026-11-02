# 季华实验室代理机构管理平台：附件上传与台账更新

核查日期：2026-11-02（北京时间）。入口：`https://oa.jihualab.net`；本次页面：`/patentParameter/invention`，标题“代理机构管理平台”。

这是客户平台的协议记录，独立于 EASY 的 `/AjaxServers/*.ashx` 与 `Call` 分发机制，不计入 [EASY 接口索引](../README.md) 的接口数量。最初逆向核查没有自动上传、更新、删除或重放业务请求。后续已加入[季华实验室传文工作流](../../patmail-extension/docs/jihua-upload.md)，以隔离模拟平台测试验证实现；真实平台上传验收仍需单独核对。

## 证据与适用范围

| 标记 | 证据 | 能证明什么 |
| --- | --- | --- |
| P | 原生 CDP 读取当前页 Resource Timing | 当前页面曾请求哪些路径；不包含历史请求方法、正文、响应、HTTP 状态或业务成功结论 |
| S | 原生 CDP 读取浏览器已加载的 JS 源码 | 客户端方法、路径、组包、附件分类、条件分支和成功回调的实际实现 |
| R | 只读提取 Vue 表单、最近提交缓存和上传控件的结构 | 实际字段类型、最近一次客户端提交结构、当前上传控件默认实现；不等于服务端已接受该提交 |

项目 `log/cdp/status.json` 显示原监听器正常连接，但它只采集 PatMail/EASY。最近小时日志没有本平台请求；不能据此认定客户平台没有上传。发现入口后，使用独立原生 CDP 会话读取目标页面，未使用 Playwright 接管日常浏览器。

P 中出现的顺序为：台账列表 → 发明台账详情 → `/prod-api/conow/file/uploadAndOfc` → `/prod-api/conow/pat/parameter/patent/update` → 再次读取详情。它与 S 中的“先上传附件、再提交附件 ID 关联”流程相符。本次没有历史上传响应正文，不能把该顺序写成服务端成功验收证明。

### 源码版本

| 脚本 | 本次用途 |
| --- | --- |
| `app.b62575b4.js` | Axios、鉴权 getter、ID 数组工具 |
| `chunk-commons.a81cb228.js` | ConowFileUpload、ConowOfcUpload、附件预览 |
| `chunk-716fd620.bbe50f07.js` | 发明台账、附件字段、提交条件 |
| `chunk-3022ef86.c2bb621e.js` | 实用新型台账、共享 API adapter |

本机脱敏证据位于 `patmail-extension/test-results/vpn-reverse/`：`page-inspect.json`、`runtime-schema.json`、`uploader-defaults.json`、`upload-implementation.json`、`invention-contract.json` 及静态脚本副本。该目录不提交 Git。审查方法和关键字段保存在本文及[附件映射表](jihualab-attachments.md)，不依赖本机证据长期保留。平台升级后需重新核对脚本 hash 和规则。

## 鉴权与公共传输

- API 同源前缀为 `/prod-api`。JSON API 默认 `Content-Type: application/json;charset=utf-8`。
- Axios 和两类专利上传组件都通过应用 getter 构造 `Authorization: Bearer <当前会话令牌>`。源码中的 token cookie 键为 `Admin-Token`；本次只检查 getter 代码，没有读取或保存令牌值。登录/VPN环境应沿用用户已建立的会话，EASY 登录态不能替代客户平台授权。
- Axios 默认超时 30 秒。普通 GET 的 params 经客户端工具编码到 query string。POST/PUT 在默认开启的重复提交检查下，同一路径和序列化 body 相同且不足 1000ms 会在客户端拒绝；这不是后端幂等保证，也不是重试策略。
- Axios 读取 `body.code || 200`；401 提示重新登录，500 拒绝并显示错误，其他非 200 拒绝。网络错误、超时和 HTTP 异常分别显示连接异常、请求超时、状态异常。自动化不应只凭 HTTP 200 或沿用 `code` 缺失即成功的宽松判断。
- 专利附件由 Element UI 自己的 XHR 上传，不经过上述 Axios 实例。不能把 Axios 的 30 秒和 1 秒重复提交检查套到附件上传上。上传控件的当前默认实现只在 HTTP 2xx 时进入成功回调，然后由业务组件消费响应。
- 资源记录出现 `/captchaImage`、`/login/smsCode`、`/login`、`/getInfo`、`/getRouters`。这里只确认这些路径曾被访问，未重放登录或短信请求，也未验证完整登录契约。
- 后续适配补查 `app.b62575b4.js` 的 GetInfo 消费逻辑：`GET /prod-api/getInfo` 的 JSON 顶层 `user.userId` 是稳定用户编号；响应拦截器先要求 `code===200`。工作流用该编号的命名空间 SHA-256 作为本地任务账号隔离键，另在目标页内存比较当前令牌指纹以阻止旧连接跨登录使用。令牌及其指纹不会返回工作台或持久化。该身份结构来自静态源码，不等同于已重放真实登录接口。

## 接口总览

以下路径均相对于 `https://oa.jihualab.net/prod-api`。方法由 S 确认；上传 POST 另由 R 中的默认 XHR 实现确认。

| 方法 | 路径 | 用途 | 证据 |
| --- | --- | --- | --- |
| GET | `/conow/pat/parameter/INVENTION` | 发明台账列表 | P、S |
| GET | `/conow/pat/parameter/UTILITY` | 实用新型台账列表 | P、S |
| GET | `/conow/pat/parameter/{type}/{id}` | 单条台账详情；已核对 INVENTION/UTILITY 调用 | P、S |
| GET | `/system/dict/data/type/{dictType}` | 状态、类型等字典 | P、S |
| POST | `/conow/file/upload` | 普通专利附件上传 | S、R |
| POST | `/conow/file/uploadAndOfc` | 上传并识别官文 | P、S、R |
| POST | `/conow/pat/parameter/patent/update` | 保存台账字段和附件 ID 关联 | P、S、R |
| POST | `/conow/file/download` | 下载已有附件 | S |
| POST | `/conow/file/delete` | 删除附件；与台账更新是独立请求 | S |

P 仅证明路径被访问，不能单凭 P 确认 GET/POST、响应状态或业务语义。

## 台账定位与详情

### 列表查询

组件初始查询为 `pageNum=1&pageSize=10`，列表消费 `rows` 和 `total`，`total` 经 `parseInt` 使用。用户点搜索时先把 `pageNum` 重置为 1。

| 查询键 | 页面含义或格式 |
| --- | --- |
| `pageNum`、`pageSize` | 分页数字 |
| `TITLE` | 专利名称/曾用名/代理机构 |
| `PATENT_NUM` | **申请号文本**，页面 placeholder 为“请输入申请号” |
| `PATENT_NO` | **是否有申请号**，查询下拉值为字符串 `TRUE` / `FALSE`；不是申请号文本 |
| `HAVE_AUTHOR_TIME`、`HAVE_ACPT_NOTICE`、`HAVE_STATUS_RIGHT` | 有无授权日、受理通知书、专利证书筛选；控件值为字符串 `TRUE` / `FALSE`，不是 JSON boolean |
| `AUTHOR_TIME`、`APPLY_TIME`、`RECORD_DATE`、`REJECT_TIME` | 日期区间，值是 JSON **字符串** `{"min":"YYYY-MM-DD","max":"YYYY-MM-DD"}`；区间不完整时为 null |
| `IS_HAVE_FAST`、`IS_FAST` | 发明台账额外的预审筛选；控件值为字符串 `TRUE` / `FALSE` |
| `FAST_RESULT` | 预审结果筛选；当前控件可见 `PASS` / `FAIL` / `REJECT`，不代表后端全部状态枚举 |

需要特别区分同名字段：**查询中的 `PATENT_NO` 是有无申请号开关；`patentParameter.PATENT_NO` 是详情里的申请号值。** 查询实际申请号应填 `PATENT_NUM`。

### 详情和案件主键

页面把列表行的 `row.ID` 拼到 `/{type}/{id}`，不使用 EASY 文件 ID，也不把申请号直接拼进详情路径。`ID` 在服务端对应哪个数据库键尚未确认；不要根据样本长度或数值外观自行生成。

详情消费者期望：

```text
body.data.patentParameter             台账业务对象
body.data.<attachmentField>Obj[]      各类附件对象数组
```

运行态已确认 `patentParameter` 中有 `ID`、`PATENT_TYPE`、`PATENT_NO`、`PROPOSAL_NO`、`DELEGATE_NUMBER`、`PATENT_NAME`、`IS_FAST`、`IS_HAVE_GER`、`IS_REVIEW`、`UPDATE_TIME` 等字符串字段。已有附件对象包括 `ID`、`TABLE_NAME`、`TABLE_ID`、`APPENDIX_NAME`、`APPENDIX_SIZE`、`APPENDIX_URL`、`APPENDIX_TYPE` 等；本次样本这些字段是字符串，不能自行把大小、序号或标志转成数值/boolean。

后续适配应先用申请号或经确认的提案/委托编号查得唯一记录，再使用其 `ID`。`PROPOSAL_NO`、`DELEGATE_NUMBER` 与 EASY 的客户文号/本所文号尚无自动映射证据。零条或多条结果不能仅凭名称相似就自动选中。

## 普通专利附件上传

```http
POST /prod-api/conow/file/upload
Authorization: Bearer <当前平台会话>
Content-Type: multipart/form-data; boundary=<浏览器生成>
```

| multipart part | 来源 |
| --- | --- |
| `file` | 单个文件，保留文件名；当前 ElUpload 默认 `name=file` |
| `TABLE_NAME` | 当前专利台账为 `PAT_PATENT_PARAMETER` |
| `APPENDIX_TYPE` | 材料分类枚举，见[附件映射表](jihualab-attachments.md) |

`ConowFileUpload` 的列表上限为 10，允许多选；当前 XHR 对每个文件发一个上传请求，并不是一个请求上传 10 个文件。它未设置大小、扩展名或 MIME 白名单；不能因此推断服务端没有限制。

该组件直接把 `response.data` 当附件对象数组消费，补 `name=APPENDIX_NAME`、`url=APPENDIX_URL` 并追加到前端列表，没有像 OFC 组件那样显式检查 `code===200`。**自动化应独立验证业务成功状态、数组结构和每项 ID，不能复制这个宽松判断。** 完整服务端响应和失败样本仍待真实请求确认。

## 官文上传与识别

```http
POST /prod-api/conow/file/uploadAndOfc
Authorization: Bearer <当前平台会话>
Content-Type: multipart/form-data; boundary=<浏览器生成>
```

除普通上传的三个 part 外，增加 `OFC_TYPE`。文件 part、POST、FormData 的使用由当前 ElUpload 及其内部 Upload 的运行时代码确认；本次没有重新发起上传来验证服务端接收结果。

`ConowOfcUpload` 的前端列表上限为 1，未设置专属的大小/格式校验。平台另一个 `/file/uploadFile` 通用组件的 5MB 默认值不适用于这里。

客户端读取的相关响应字段如下；这是结构示例，不是已抓到的完整服务端响应或已验证的必填字段集合：

```json
{
  "code": 200,
  "data": {
    "appendixList": [
      { "ID": "<附件ID>", "APPENDIX_NAME": "<文件名>", "APPENDIX_URL": "<附件位置>" }
    ],
    "IS_OFC_SUCCESS": true
  }
}
```

业务组件严格检查数值 `code===200`，成功后先把 `data.appendixList` 追加到附件列表；只有 `IS_OFC_SUCCESS` 为真值才执行识别字段回填。非 200 分支读取 `msg` 显示错误，成功响应是否包含 `msg` 尚未验证。**识别失败与文件上传失败是两种状态：`IS_OFC_SUCCESS` 不成立时，客户端仍可能已经拿到并追加附件。** 该字段真实服务端类型及失败副作用尚未抓包验证。

| `OFC_TYPE` | 材料类型 | 回填逻辑 |
| --- | --- | --- |
| `FETCH_PDF` | 申请受理通知书 | `applyDay` → `APPLY_TIME`；`applyNum` 去点 → `PATENT_NO`；`inventionName` → `PATENT_NAME` |
| `FETCH_NOTICE` | 快速预审受理/不受理通知书 | `noticeContent` 为“通过”时设 `FAST_RESULT=PASS`，否则 FAIL；`area` → `PROTECTION` |
| `FETCH_PUBTIME` | 发明公布通知书 | `data` → `PUB_TIME` |
| `FETCH_ISSUETIME` | 进入实质审查通知书 | `data` → `ISSUE_TIME` |
| `FETCH_REVIEWRESULT` | 优先审查结果通知书 | `data` 为“予以优先审查”时设 `REVIEW_RESULT=AGREE`，否则 REJECT |
| `FETCH_AUTHORTIME` | 发明专利证书 | `data` → `AUTHOR_TIME` |
| `FETCH_REJECTTIME` | 驳回决定 | `data` → `REJECT_TIME` |

日期类回填把“年/月/日”替换为连字符日期。这是客户端行为，不代表后台一定识别成功。自动化应核对回填值与目标案件一致后再组装保存请求。

## 保存台账和附件关联

### 请求组装

`POST /conow/pat/parameter/patent/update` 使用 JSON。页面实际逻辑为：回读详情 → `form` → 对表单调用 validate → `patentParameter=form` → 设置 `patentParameter.MSG` → 将附件对象数组转换成顶层 ID 数组 → 提交 `JSON.stringify(body)`。

下面仅展示结构片段，**不是可直接重放的完整请求，也未证明后端接受只传这些字段**：

```json
{
  "patentParameter": { "ID": "<列表行ID>", "PATENT_TYPE": "INVENTION", "...": "<保留已回读字段>" },
  "acptNoticeAppendixList": ["<已有关联ID>", "<新上传附件ID>"],
  "reviewNoticeAppendixList": ["<保留已有关联ID>"],
  "...": "<按当前案件状态处理其余附件分类>"
}
```

S 和 R 均确认：附件关联使用**请求根级** `xxxAppendixList`，元素取附件对象的 `ID`；仅把 `xxxAppendixListObj` 放进 `patentParameter` 不等价。运行态最近提交缓存包含 `patentParameter` 外的 40 个顶层附件字段；[映射表](jihualab-attachments.md)区分 39 个有可见上传控件的字段与 1 个保留字段。

页面没有字段白名单，回读对象中的字典展示字段、附件 Obj、编辑状态也可能随 `form` 提交。当前采集组件未发现表单 rules 声明；不能据此声称后台没有必填或校验。`MSG` 来自页面操作参数，多数阶段没有显式传值，报销阶段有说明文字；不能把它当成必填传文指令或自造完整枚举。

### 会影响既有附件的条件

发明页组包时执行以下规则，使用的是字符串比较：

| 当前业务标记 | 处理 |
| --- | --- |
| `IS_FAST != "TRUE"` | 将快速预审的 5 个附件 ID 数组设为 null，并把其中原 ID 加入删除队列 |
| `IS_HAVE_GER != "TRUE"` | 将一般申请的 5 个附件 ID 数组设为 null，并排队删除 |
| `IS_REVIEW` 既非 `"TRUE"` 也非 `"READY"` | 将优先审查的 6 个附件 ID 数组设为 null，并排队删除 |

分组字段列在附件映射表。`null` 和空数组不能随意互换，字段缺省、空值、全量替换的后端语义尚未验证。后续适配应保留当前详情中的其他分类及字段，确认目标材料分组适用后合并新 ID，不能用一个只含新附件的通用空表单覆盖整个案件。

### 删除、回读和提交结果

页面把待删除 ID 单独发送：`POST /conow/file/delete`，JSON 为 `{"id":["<附件ID>"]}`。提交代码在发起 update 后就可能发起 delete，没有等待 update 成功，两者不是已证明的原子事务。自动传文不能直接复刻这条并发删除路径。

update 的 Promise 成功后页面再次读取详情。后续实现应区分至少三步：文件上传成功、台账关联提交成功、回读确认关联存在。超时后先回读当前案件和附件 ID；没有后端幂等契约时，不能盲目重传附件或重复提交/删除。

## 已有附件下载

`POST /conow/file/download`：

```json
{ "appendixName": "<APPENDIX_NAME>", "appendixUrl": "<APPENDIX_URL>" }
```

Axios 设置 `responseType: blob`。不能把附件存储 URL 当成上传成功或关联成功的充分证据。对正式自动化，建议以详情回读的附件 ID、分类、名称和实际文件结果共同核对。

## 后续自动传文的实现边界

1. 复用用户已授权的平台会话，在正确网络/VPN环境内访问同源 API。主机直接请求本次域名未能解析，而浏览器已有资源记录；不能假定进程外 HTTP 与浏览器网络环境相同。
2. 将 EASY 文件和平台案件分别建模：源 `fileId/fileNo`、客户平台 `record.ID`、目标 `APPENDIX_TYPE`、原始文件 hash 和上传返回附件 ID。申请号匹配后再使用平台 ID；不能混用两站主键。
3. 按材料分类选择普通上传或 OFC，校验实际文件格式。扩展名为 PDF 不证明内容为 PDF；源 ZIP、Word HTML、邮件等不能仅改后缀后送给官文识别接口。
4. 先记录上传返回的附件 ID，再合并最新详情中的同类 ID；保留其他附件及业务字段，处理 OCR 回填与状态开关，提交后回读确认。分段回执落本地任务记录，以便恢复时复用已上传附件，而不是从头重传。
5. 将“未上传”“已上传待关联”“关联待确认”“已回读确认”“识别待人工确认”分开。现有 1 秒客户端防连点不能充当幂等机制；服务端不支持 hash 幂等时需要本地去重记录与回读核对。

这些是基于现有契约的后续适配建议，本次没有实现自动传文或验证断网/超时恢复。

## 尚缺的服务端契约

- 两类上传的实际成功/失败响应、HTTP 及业务错误码、文件大小和格式限制；OFC 识别失败时的文件落盘及清理规则。
- 是否接受 ZIP、是否自动展开、每种材料类型是否只接受 PDF；当前页面没有足够证据。
- update 最小必填字段、字段白名单、空数组/null/缺省的更新语义、并发版本冲突、后端幂等键。
- 上传返回多项附件时的含义、同名重复上传策略、删除是否永久、未关联附件的保留期限。
- 实用新型逐材料完整映射、外观设计真实 type、PCT/软著的完整传文流程。已加载 adapter 有 SOFT 和多条 PCT 分阶段更新封装，但不能推广发明台账的 body 或类型到这些入口。
- 正式传文后是否还有单独递交、审核或通知步骤；本次只确认附件上传与台账更新，不能把它等同于所有业务流程完成。

补证时应被动观察用户正常操作，保存方法、字段名/类型、脱敏错误码和提交前后关联差异；不把令牌、Cookie、完整业务清单、文件正文或实际案件数据写进文档/长期调试日志。
