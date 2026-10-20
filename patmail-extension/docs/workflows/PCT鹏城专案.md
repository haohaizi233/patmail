# PCT鹏城专案工作流

内置标识：`pct-pengcheng`，页面名称为“PCT鹏城专案”。入口是“发文任务 → 按工作流发文 → PCT鹏城专案”。它与 PCT 提醒共用读表、案件核对、期限发文和审核提交通道，主要差异在于技术负责人主送、IPR 和商务抄送，以及缺人时的提交口径。

返回 [工作流索引](README.md)。普通 IPR 主送的完整路径见 [PCT提醒](PCT提醒.md)。

## 1. 完整执行总览

```mermaid
flowchart TD
  A[选择PCT鹏城专案] --> B[加载专案工作流与lead收件模式]
  B --> C[热加载发文类型与发件邮箱等选项]
  C --> D[读入表格中的文号事项IPR和技术负责人]
  D --> E[去掉姓名末尾拼音括号并按客户顺延补人]
  E --> F[核对案件与事项及原站发文状态]
  F --> G[展示核对表并按条件处理空行]
  G --> H[勾选允许发文的事项]
  H --> I[选择按姓名提交或规则联系人兜底]
  I --> J[核对客户类型收件人和抄送分组]
  J --> K[检查账本并决定新建或沿用草稿]
  K --> L[LimitMailCustomer创建本封发文]
  L --> M[技术负责人匹配当前发文联系人邮箱]
  M --> N[IPR与商务进入抄送]
  N --> O[SaveMailInfo保存并勾选本封完成事项]
  O --> P[核验默认审核人资格与流程版本]
  P --> Q[MailSubmit提交审核]
  Q --> R[按事项显示成功失败异常及实际地址]
  R --> S[原站人工审核]
  class A pmStep
  class Q,R,S pmSuccess
```

## 2. 输入、来源和输出

| 字段或对象 | 读取来源 | 专案如何使用 |
| --- | --- | --- |
| 我方文号 | 工作表 | 首选案件检索键；与处理事项共同定位原表行 |
| 客户文号 | 工作表 | 补查案件，并决定贵方案号／我方案号类型 |
| 客户名称 | 工作表 | 客户关联、联系人继承、合并范围 |
| 技术负责人 | 专案配置的列，默认技术负责人 | `lead` 模式的主送候选；匹配前清理末尾拼音 |
| 客户联系人(IPR) | 工作表 | 专案的抄送候选；不等同于主送技术负责人 |
| 第一客户联系人 | 工作表 | 保留业务信息；不能直接冒充技术负责人 |
| 处理事项 | 工作表 | 区分同文号的不同提醒和期限事项 |
| 联系人邮箱 | 当前 EASY 发文联系人 | 实际写入地址的依据；表格邮箱列不承担这个职责 |
| 商务 | 发文页业务人员 | 加入抄送，保存前要求可用商务邮箱 |
| 审核人 | 发文映射默认审核人 GUID | 必须在下一节点唯一匹配，不回退当前登录人 |
| 输出 | 原站与本机记录 | 邮件编号、保存后的地址、每个事项结果、审核状态 |

## 3. 技术负责人读取与姓名清理

```mermaid
flowchart TD
  A[读取工作表表头] --> B{我方文号和处理事项存在}
  B -->|否| X[提示缺少必需表头]
  B -->|是| C{专案技术负责人列存在}
  C -->|否| D[提示缺列 技术负责人保持空值]
  C -->|是| E[读取技术负责人原值]
  E --> F[清理末尾仅含拉丁拼音的括号]
  F --> G[例如王某拼音括号还原为王某]
  G --> H[按选定客户连续块或跨行模式补空行]
  D --> H
  H --> I[补上的姓名标记补]
  I --> J[核对开始后锁定补人模式]
  J --> K[展示技术负责人IPR和其他核对字段]
  class A pmStep
  class B,C pmDecision
  class K pmSuccess
  class D,I pmWarning
  class X pmStop
```

姓名示例：`张三(zhangsan)` 或 `张三（zhangsan）` 会去掉末尾拼音括号，得到 `张三`。并非任意括号内容都删除。多个姓名、重复邮箱和角色选择由后续联系人规划进一步处理。“技术负责人”和 IPR 属于不同列，不能靠抄送 IPR 的存在推导主送已齐全。

## 4. 提醒类别与发文类型决策

```mermaid
flowchart TD
  A[当前专案工作表行] --> B{事项类别}
  B -->|提醒申请PCT| C{客户文号非空}
  C -->|是| D[使用配置的贵方案号提醒类型]
  C -->|否| E[使用配置的我方案号提醒类型]
  D --> F[以有效ID或完整名称在类型树中匹配]
  E --> F
  B -->|PCT进国家| G{客户文号非空}
  G -->|是| H[提醒PCT申请进入国家案件 贵方案号]
  G -->|否| I[提醒PCT申请进入国家案件 我方案号]
  B -->|涉外外观| J[提醒涉外外观申请 贵方案号]
  H --> F
  I --> F
  J --> F
  F --> K{唯一有效类型ID}
  K -->|否| X[留空提示 提交前阻塞]
  K -->|是| L[记录到表格任务行]
  L --> M[按文号加处理事项再次核对所选行]
  class A pmStep
  class B,C,G,K pmDecision
  class L,M pmSuccess
  class X pmStop
```

普通提醒的默认名称同 PCT 提醒；进国家也按有无客户文号分贵方案号、我方案号。类型匹配失败不会自行生成一个编号。专案不因收件方式为 `lead` 而改变事项内部编号或使用另一个创建接口。

## 5. 状态核对、空行和勾选资格

```mermaid
flowchart TD
  A[传表后自动核对] --> B[按我方文号查案件]
  B --> C{找到可用案件}
  C -->|否且有客户文号| D[按客户文号补查]
  C -->|是| E[读取事项与发文流程]
  D --> E
  E --> F{状态判断}
  F -->|还没提交审核| G[允许勾选]
  F -->|正在审核| H[不可重复勾选]
  F -->|事项完成不用发| I[不参与本轮]
  F -->|没查成| J[允许重查]
  F -->|库里没有或多记录异常| K[展示原因并人工核对]
  F -->|已发文但未管制完成日| L{开关允许重新发文}
  L -->|否| I
  L -->|是| M[允许选择 提交前逐行警示]
  G --> N[检查技术负责人是否空缺]
  M --> N
  N --> O[展示可提交事项与收件口径选择]
  class A pmStep
  class C,F,L pmDecision
  class G,M,O pmSuccess
  class J,K pmWarning
  class H,I pmStop
```

空人名是否触发双提交按钮，在 `lead` 模式主要检查技术负责人。仲裁仍属于共用的表格核对机制，其结果能否改变最终主送，需要继续看专案的 `lead` 收件规则，不能把普通 PCT 的“仲裁 IPR 等于主送”直接套过来。

## 6. 专案的提交口径

```mermaid
flowchart TD
  A[选择提交按钮] --> B{提交模式}
  B -->|按姓名或信任AI| C{技术负责人有效}
  C -->|是| D[按技术负责人解析主送]
  C -->|否且允许空行兜底| E[采用发文规则客户联系人]
  C -->|否且未启用兜底| X[阻塞 缺技术负责人]
  B -->|直接全选| F{原表技术负责人有值且非仲裁行}
  F -->|是 包含顺延补值| D
  F -->|否 空行或仲裁写回行| E
  D --> G[IPR作为抄送候选]
  G --> H[发文页商务追加抄送]
  E --> I[GetMailRule读取type为to的客户联系人]
  I --> J{存在有效客户邮箱}
  J -->|是| K[客户联系人主送 商务抄送]
  J -->|否但有商务| L[业务主送与抄送 提示认真核对]
  J -->|都没有| X
  H --> M[检查地址计划]
  K --> M
  L --> M
  M --> N[允许下一步保存]
  class A pmStep
  class B,C,F,J pmDecision
  class N pmSuccess
  class L pmWarning
  class X pmStop
```

在共用执行器中，已由仲裁写成“不用发”的行仍可形成跳过结论，“只发业务”可形成专门的地址计划；“直接全选”不沿用这些仲裁结论。对正常有技术负责人姓名的专案行，主送始终走 `lead` 分支，IPR 属于抄送。额外抄送还要逐个匹配当前发文联系人。

## 7. 主送和抄送的实际邮箱解析

```mermaid
flowchart TD
  A[已创建或沿用发文] --> B[GetMailInfo读取客户ID和原字段]
  B --> C[加载该封完整发文联系人]
  C --> D{联系人数据完整且有商务邮箱}
  D -->|否| X[保留已创建草稿与原因]
  D -->|是| E[主送从空集合重新规划]
  E --> F[清理技术负责人的拼音与补仲标记]
  F --> G[按清理后的姓名查当前发文联系人]
  G --> H{主送邮箱唯一且可格式化}
  H -->|否| X
  H -->|是| I[技术负责人进入主送并按邮箱去重]
  I --> J[IPR按姓名与角色匹配到抄送]
  J --> K{IPR及额外抄送均可确定}
  K -->|否| X
  K -->|是| L[加入全部有效商务联系人]
  L --> M[移除预填通知邮箱]
  M --> N{主送可用且商务全在抄送}
  N -->|否| X
  N -->|是| O[形成实际to与cc载荷]
  class A pmStep
  class D,H,K,N pmDecision
  class O pmSuccess
  class X pmStop
```

地址写成原站所需的 `姓名(邮箱);` 形式。只读到同名多个不同邮箱时会阻塞主送匹配。IPR 采用它自己的角色匹配逻辑，商务则来自发文页 `sales` 分组。原站创建时预填的档案杂值不作为本轮主送、抄送继承；密送单独处理。

## 8. 按勾选事项构建信封

```mermaid
flowchart TD
  A[取得本次勾选procIds] --> B[验证内部ID与当前列表成员关系]
  B --> C[按我方文号优先 客户文号补充匹配]
  C --> D[同文号优先按处理事项精确匹配]
  D --> E{发文类型唯一}
  E -->|否| X[整次规划返回错误]
  E -->|是| F[确定客户与lead模式主送抄送集合]
  F --> G[姓名去来源标记 分隔符归一 排序去重]
  G --> H[按客户类型模式和联系人集合分组]
  H --> I{合并组}
  I -->|同一组| J[procIds去重并为一封]
  I -->|不同组| K[分别创建信封]
  J --> L[mailstyle为1 事项ID用分号连接]
  K --> L
  L --> M[只包含本次勾选 不自动带其他事项]
  class A pmStep
  class E,I pmDecision
  class M pmSuccess
  class X pmStop
```

例如，同一客户的 A、B 两件，技术负责人和 IPR 相同、类型相同，可以并成一封；若 B 的技术负责人不同，应拆成两封。类型不同也应拆封。页面进度按事项计数，因此一封对应的多个 `procId` 会分别得到执行结果。

## 9. 每封的读写时序

```mermaid
sequenceDiagram
  participant W as 工作台
  participant B as 后台与页面通道
  participant E as EASY
  W->>B: lead模式单封计划及当前操作账号
  B->>B: 检查写开关与账本 并读取发文映射默认审核人
  alt 尚未创建
    B->>E: LimitMailCustomer
    E-->>B: 有效objid或失败原因
  else 可恢复草稿
    B->>B: 继续使用mailId
  end
  B->>E: GetMailInfo与发文联系人
  opt 规则联系人兜底
    B->>E: GetMailRule
  end
  B->>B: 规划技术负责人主送与IPR商务抄送
  B->>E: 读取密送与GetMailCase完成事项
  B->>E: SaveMailInfo
  E-->>B: 保存确认
  B->>E: GetFlowInfo
  B->>E: GetFlowSubmit
  B->>B: 选择起始节点指向的审核节点
  B->>B: 按GUID唯一匹配配置的默认审核人
  B->>E: GetUrgencyList与GetFlowLastStatus
  B->>B: 核对版本与提交参数
  B->>E: MailSubmit
  E-->>B: submitted或created或unknown
  B-->>W: 按procId回传状态和保存后的实际地址
```

保存时保留草稿中的主题、正文及有效发件邮箱；缺邮箱时可用默认发件人编号补入。完成事项读取该封发文案件后写入。提交参数 `finishdate=false`，不会调用结束审核接口。

## 10. 流程提交的阻塞条件

审核人统一读取当前账号的“发文映射 → 默认审核人”，操作账号仅用于会话和权限校验，两者可以不同。未配置有效默认审核人时在创建前阻止提交；已建草稿若配置人员不能在下一节点按 GUID 唯一匹配，则保留草稿并显示原因，绝不改选当前登录人或其他候选人。后台转发时以该账号保存的最新配置覆盖页面传来的审核人编号。


```mermaid
flowchart TD
  A[地址保存已确认] --> B{起始节点和下一节点完整}
  B -->|否| X[created 保留mailId]
  B -->|是| C{下一节点为结束并行或全员审核}
  C -->|是| X
  C -->|否| D{配置的默认审核人在该节点唯一匹配}
  D -->|否| X
  D -->|是| E{存在唯一默认缓急}
  E -->|否| X
  E -->|是| F[读取最后流程状态]
  F --> G{状态版本一致}
  G -->|否或无法比较| X
  G -->|是| H[组装并发出MailSubmit]
  H --> I{响应}
  I -->|明确接受| J[submitted]
  I -->|明确拒绝| X
  I -->|超时或字段不明| K[unknown]
  J --> L[回到原站等待人工审核]
  class A pmStep
  class B,C,D,E,G,I pmDecision
  class J,L pmSuccess
  class X pmWarning
  class K pmStop
```

## 11. 恢复、重试与状态转移

```mermaid
flowchart TD
  A[本次勾选进入恢复判断] --> B{该事项账本状态}
  B -->|unknown| X[先核对原站 防止重复创建或提交]
  B -->|created并有邮件ID| C[复用草稿]
  B -->|submitted| D{原站最新流程状态}
  D -->|审核中或仍需保留已提交记忆| E[跳过]
  D -->|明确开放或结束| F[按新一轮计划清理旧邮件ID]
  B -->|没有记录| F
  F --> G[创建发文]
  C --> H[读取草稿 再匹配联系人 再校验流程]
  G --> H
  H --> I{执行结果}
  I -->|只保存或后续受阻| J[记created和mailId]
  I -->|提交已确认| K[记submitted]
  I -->|创建或提交未确认| L[记unknown]
  class A pmStep
  class B,D,I pmDecision
  class K pmSuccess
  class C,E,J pmWarning
  class X,L pmStop
```

有邮件编号不等于已经提交。缺联系人、缓急或版本不匹配时，记录 `created`，恢复沿用原草稿。没有确认结果的请求不自动重放。账本按事项内部编号关联，多件合一封时多个事项可能指向同一 `mailId`。

## 12. 并发和进度输出

```mermaid
flowchart TD
  A[按信封组成待执行队列] --> B[以配置的1至4个执行槽调度]
  B --> C[每个槽独立顺序执行一封]
  C --> D{结果类别}
  D -->|提交成功| E[成功计入本封全部事项]
  D -->|地址或流程单封问题| F[失败异常记录到该封]
  D -->|结果未确认| G[unknown记录到该事项]
  D -->|登录失效或写开关关闭| H[停后续调度]
  E --> I[显示时间日志与实际to和cc]
  F --> I
  G --> I
  I --> J{尚有可调度信封}
  J -->|是| B
  J -->|否| K[显示成功失败异常和跳过件数]
  H --> K
  K --> L[成功行取消勾选 其他行保留原因]
  class A pmStep
  class D,J pmDecision
  class E,L pmSuccess
  class F pmWarning
  class G,H pmStop
```

单封失败不自动阻断其他专案；未知结果只阻止对应事项的盲目重试。会话级故障会停止新封调度，已启动封仍可能返回。进度百分比表示本轮队列执行进度，最终结果须看每封业务状态。

## 13. 排错对照

| 问题 | 检查位置 | 当前结果 |
| --- | --- | --- |
| 没有技术负责人列 | 工作流列映射与表头 | 提示缺列；不能凭 IPR 推断主送 |
| 同名多个邮箱 | 当前发文联系人 | 主送匹配阻塞，草稿留存 |
| 技术负责人有值但 IPR 对不上 | 发文页角色与姓名 | 不能静默丢弃所需抄送 |
| 发文页没有商务 | 联系人完整性与sales组 | 保存前阻塞 |
| 没有发件邮箱 | 草稿mailset与默认发件人 | 有有效默认值才补入 |
| 提交给默认审核人失败 | 下一节点审核人列表 | 保留草稿和具体原因 |
| 重复点击提交 | 事项账本与原站状态 | submitted跳过、created复用、unknown先核对 |

实现依据：`src/workflow/catalog.ts` 中 `defaultPengchengWorkflow` 和 `recipientModeOf`；`src/customer/pct-sheet.ts`、`pct-recipients.ts` 的 `lead` 分支；`limit-mail-submit.ts` 的信封分组、写地址和提交；页面 `WorkflowMailEntry.vue`、`LimitMonitorQuery.vue`。
