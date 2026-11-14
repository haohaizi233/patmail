# 旧申请人检查点与指定缔约方AST拒绝（2026-11-14）

## 两类现象

用户回报13件立即异常，剩余一件执行几步后异常。此次10时UTC应用Trace确认：唯一新执行链先完成创建检查点恢复，再完成applicant/step2与representative/step3，在parties/step4以PROTOCOL_UNSUPPORTED、errorStage=ast、not_observed停止。其指定国写入POST未发出，之后恢复尝试读取列表但未完成。不能将13个未重发的旧检查点与这次新AST拒绝都解释为HTTP失败；也不能假定13件的材料/记录均一致。

用户最新download仍为HAR JSON，含28个entry。离线重建其application文档，回放申请人与代理机构响应后，共58个inline script。旧jsfAction将它们全部拼成definitions，执行提取产生conditional_control/mutable_binding/mutation/unsupported_call；但真正refreshDesignationUI赋值定义仅158字符，单独分析为一个静态请求且没有拒绝原因。另一个1011字符脚本只引用此函数，不是第二份定义。

## 指定国修复

新增selectRemoteDefinition，仅面向既有5个remote名称：selectOffice、processFile、refreshOptionsUI、refreshDesignUI、refreshDesignationUI。以Babel查找唯一顶层普通函数声明或普通函数赋值，排除无关页面初始化。重复定义、直接/成员/解构重写、嵌套条件定义均拒绝；函数体继续由原执行提取器验证，动态必需字段、多请求和条件控制不变。没有运行页面脚本，也没有通用反混淆或任意全局副作用分析。

预算：至多256脚本、总2Mi字符；候选脚本至多262144字符，扫描30000节点/深度100/100ms。只解析含目标名称的候选，不解释无关初始化的运行结果。真实HAR重建后唯一159字符定义（含分号）可正确提取1个请求，且请求表单在该文档存在；没有向原站发该请求。

## 旧申请人只读恢复

新增applicant恢复：只接受原数字reference、有效planKey、uncertain状态和对应索引边界。按Draft(s)精确编号重开，确认记录数恰为index+1及指定行；只点击该行Edit读取，不设置字段。逐项比较姓名、地址、邮编、城市、地区、国家、邮箱、法人选项、国籍/住所/营业所/惯常居所/ACP；只支持既有CN/SG映射，精确空白规范化，不猜测拼写或国家。随后Cancel关闭编辑，重新确认数量与编号；全部匹配才completed。

字段不符、多记录、缺字段、缺Cancel或关闭未确认均unknown；从不点击saveAppBtn，也不添加替代记录。消费端仅接受同编号application、正确记录数量的completed回执，拒绝retry授权。只读核对可在下次显式运行再次进行；其他写入恢复预算不放宽。

原第14件的parties恢复预算可能已经因前次失败核对而耗尽，不会自动清除此历史限制。由于本次Trace证明其指定国写入未发出，可由用户针对这一步使用“本步未执行，允许重试”，再继续；不可选择“本步已完成”跳过指定国，也不可另建草稿。

## 验证

先以58脚本污染的remote fixture复现旧拒绝，再验证唯一目标解析及重写拒绝。申请人恢复覆盖完全匹配、姓名/邮箱/资格国家不符、额外记录、缺Cancel；断言只有列表/打开/编辑/取消请求，没有saveAppBtn。消费端覆盖retry及缺记录数证明的拒绝。用户HAR在独立忽略目录回放，私人正文/字段值未写入仓库或报告。

最终验证：1807/1807完整测试通过，失败0、跳过0；变更文件ESLint、构建（含类型检查）、补丁检查通过；隔离草稿UI回归通过；独立真实HAR回放1/1通过。生产草稿未被此调试自动填写或重复保存，新版本仍需现场验证字段核对与后续指定国步骤。
