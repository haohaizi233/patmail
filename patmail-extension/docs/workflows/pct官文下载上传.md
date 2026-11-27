# pct官文下载上传

本工作流用于在 **大客户系统** 与 **中小客户系统** 同时在线的前提下，自动完成 PCT 官文的核对清单导出并集、清理 `PCT/` 待下载记录、全量二次分析下载以及两轮导入系统。

原站请求、响应及扩展消息字段见 [PCT 官文下载上传工作流接口](../../../API/49-PCT官文下载上传工作流接口.md)。

## 1. 前置预准备

```mermaid
flowchart TD
  start["打开 PCT 官文下载上传"] --> check["后台并行检查大客户与中小客户 EASY 会话"]
  check --> online{"两站均已登录？"}
  online -->|否| login["打开未就绪系统的原站登录页"]
  login --> check
  online -->|是| init["分别读取来文字典、CPC 账号和结案配置"]
  init --> select["按账号名称合并选项<br/>保留各站独立的收文账号 ID"]
  select --> action{"选择执行方式"}
  action -->|只导出核对清单| read["执行第一步，生成并集 XLSX"]
  action -->|执行全流程| write{"写开关已开启？"}
  write -->|否| blocked["提示开启写开关"]
  write -->|是| saved{"原账号组合有未完成批次？"}
  saved -->|有| resume["确认续办，沿用已保存的账号和条件"]
  saved -->|无| begin["确认当前账号和条件，保存新批次"]
  resume & begin --> run["第一步后启动双系统步骤 4、5、6"]
  class start,check,init,select,begin,resume,run pmStep
  class online,action,write,saved pmDecision
  class read pmSuccess
  class login,blocked pmStop
```

- **双系统同时在线**：浏览器中需同时打开并登录 **大客户** 与 **中小客户** 的 EASY 页面。工作流会在后台静默检测两套系统的登录状态；若任一系统未打开、未登录或会话过期，页面会给出对应系统的一键打开登录指引。
- **写开关开启**：由于步骤 4、5、6 会执行删除待下载官文、二次下载分析及导入系统等写操作，执行全流程前需在「系统设置」开启写开关（仅导出第一步未导入并集清单时，只读即可使用）。
- **分支机构 CPC 账号**：若勾选了带 `_` 的分支机构收文账号，请确保已在原站「来文管理」完成 CPC 扫码登录，否则接口返回 401 时会中止当前账号并提示扫码。

## 2. 执行步骤说明

### 第一步 导出未导入清单

```mermaid
flowchart TD
  start["按已选收文账号开始导出"] --> large["大客户按本站账号逐个导出"]
  start --> sme["中小客户按本站账号逐个导出"]
  large & sme --> export["ExportExcelTwoTzsList 生成单账号清单"]
  export --> result{"原站导出回执"}
  result -->|同步取件| inline["FileHandler 读取文件<br/>把字节交给工作流内联解析"]
  result -->|无数据| empty["该账号计为 0 条"]
  result -->|异步排队或取件失败| stop["停止生成并集，按提示核对或调整范围"]
  inline --> filter["按是否导入系统筛出未导入行"]
  filter & empty --> ready{"两站所有账号均已处理？"}
  ready -->|否| export
  ready -->|是| merge["按发文序列号合并去重<br/>缺序列号时使用申请号、来文名称和发文日"]
  merge --> file["生成一份并集 XLSX<br/>页面最多预览 200 行"]
  class start,large,sme,export,inline,filter,merge pmStep
  class result,ready pmDecision
  class empty pmWarning
  class file pmSuccess
  class stop pmStop
```

### 双系统步骤 4、5 删除与二次分析

```mermaid
flowchart TD
  start["第一步已处理，开始双系统管道"] --> parallel["两站各自执行下列步骤<br/>按每页 200 条读取，写入每批最多 50 条"]
  parallel --> step4["步骤 4 · GetUnProcessTzsList<br/>按账号查待下载记录"]
  step4 --> candidate{"存在申请号以 PCT/ 开头且有 fid 的行？"}
  candidate -->|有| remove["按 fid 去重<br/>DeleteOaInfoByFids 分批删除"]
  candidate -->|无| step5
  remove --> step5["步骤 5 · GetReplayTzsList<br/>按账号读已导入和未导入的记录"]
  step5 --> hasRows{"本站是否查到可分析的 fid？"}
  hasRows -->|有| analyze["按账号和 fid 去重<br/>ProcessTzsList 提交分析批次"]
  hasRows -->|无| step6
  analyze --> poll{"ProcessTzsListStatus 的回执"}
  poll -->|处理中且轮询有余量| poll
  poll -->|完成| sync["尝试 GetReaplyTzsStatus 回查行状态"]
  poll -->|上限后原站仍在处理| background["记录原站已受理<br/>尝试回查，逐行结果可能仍在更新"]
  poll -->|业务失败或需要登录| stop["停止该系统的后续步骤"]
  sync & background --> more{"还有分析批次？"}
  more -->|有| analyze
  more -->|无| step6["进入步骤 6 两轮导入"]
  remove -->|失败或回执待核对| stop
  class start,parallel,step4,remove,step5,analyze,sync pmStep
  class candidate,hasRows,poll,more pmDecision
  class background pmWarning
  class step6 pmSuccess
  class stop pmStop
```

### 步骤 6 两轮导入

```mermaid
flowchart TD
  start["本站进入步骤 6，从第 1 轮开始"] --> step6["SearchNotice 分页查询<br/>status=0，仅取未处理记录"]
  step6 --> valid["筛除无 oa_id 的行<br/>跳过无我方文号的非本系统行"]
  valid --> eligible{"本轮有有效的导入目标？"}
  eligible -->|无| round
  eligible -->|有| branch{"结案行命中只导文件规则？"}
  branch -->|是| closed["ImportCloseCase 分批导入文件"]
  branch -->|否| normal["其余有效行先 CheckImportNotice<br/>再执行 ImportNotice"]
  closed -->|还有普通导入目标| normal
  closed -->|无剩余目标| round
  normal --> round{"当前轮已结束"}
  round -->|第 1 轮结束| next["进入第 2 轮"]
  next --> step6
  round -->|第 2 轮结束| finish["本站管道结束"]
  closed & normal -->|失败或回执待核对| stop["停止该系统的后续步骤"]
  class start,step6,valid,closed,normal,next pmStep
  class eligible,branch,round pmDecision
  class finish pmSuccess
  class stop pmStop
```

1. **第一步 · 导出「来文二次下载」未导入并集清单**
   - 大客户与中小客户系统并行工作，按用户勾选的收文账号依次导出「来文二次下载」核对清单 Excel（不刷屏下载原始单账号文件）。
   - 自动解析每个清单，筛选「是否导入系统」为**未导入**的记录，将两系统结果按发文序列号（无序列号时按申请号+来文名称+发文日）去重取并集，最终自动下载一份合并后的 `.xlsx` 清单并在页面预览。
2. **双系统并行处理（大客户 ∥ 中小客户）**
   - 两个系统互不阻塞并行推进，单系统内部依次遍历所有勾选的收文账号：
   - **步骤 4 · 来文下载删 `PCT/`**：按「来文下载」查询条件全量拉取列表，筛选申请号以 `PCT/` 开头的记录并批量删除，避免旧待下载记录阻塞。
   - **步骤 5 · 来文二次下载全量分析**：按「来文二次下载」查询条件全量拉取列表，提交已导入和未导入记录进行分析。轮询到上限时原站可能仍在后台处理，逐行结果以回查状态为准。
   - **步骤 6 · 导入来文两轮全选导入**：按「导入来文」查询条件（强制未处理）拉取记录，自动跳过无我方文号的非本系统行。第 1 轮处理后重新查询，对本次仍满足条件的有效行执行第 2 轮。

## 3. 参数说明

- **收文账号（多选）**：将原站下拉框升级为复选框列表，自动合并大小客户系统的 CPC 账号，执行时依次遍历所有勾选项。
- **「来文二次下载」与「来文下载」查询条件**：支持申请类型（默认 `PCT国际阶段`）、发文日期起止（可选同步）、申请号、发明创造名称、来文名称、发文序号、下载状态等。
- **「导入来文」查询条件**：支持官方发文日、下载日期、来文分析日期、申请号、我方文号（含模糊查询）、申请类型、来文类型及全部高级筛选条件；大客户字典选项在发往中小客户时会自动按名称匹配对应的中小客户字典项。

## 4. 刷新恢复与安全续办

```mermaid
flowchart TD
  reopen["刷新工作台，两套原 EASY 账号重新就绪"] --> read["读取上次批次、双通道阶段与计数"]
  read --> saved{"批次状态"}
  saved -->|已完成| done["保留完成结果，允许新建批次"]
  saved -->|未完成| paused["原先执行中的阶段显示已暂停"]
  paused --> confirm["用户确认续办，沿用原批次 ID 和条件"]
  confirm --> available{"上次清单下载已进入派发阶段？"}
  available -->|否| export["按原条件执行清单导出"]
  available -->|是| fetch["重新查询本站业务目标"]
  export --> fetch
  fetch --> outcome{"本站 WAL 中的目标状态"}
  outcome -->|本批已确认| skip["跳过已确认目标"]
  outcome -->|无待核对写入且目标尚未确认| write["先写 WAL 意图，再向 EASY 派发"]
  outcome -->|上次写入回执不明确| stop["停止派发，先在对应 EASY 核对"]
  write -->|回执符合要求| record["记录回执和阶段计数"]
  write -->|回执不明确| stop
  skip & record --> next["继续处理剩余目标"]
  class reopen,read,confirm,export,fetch,write,next pmStep
  class saved,available,outcome pmDecision
  class done,skip,record pmSuccess
  class paused pmWarning
  class stop pmStop
```
