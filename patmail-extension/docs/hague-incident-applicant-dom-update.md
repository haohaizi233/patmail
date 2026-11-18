# 申请人保存后的DOM_TARGET_MISSING（2026-11-14）

## 输入与定位

用户提供的Desktop/download为约3MB的HAR JSON（log.entries），并非目录。结合本机10时UTC的观察日志，本轮7次recovery.decision=completed后均进入applicant/stepIndex=2，随后均为DOM_TARGET_MISSING。HTTP200、XML有效、jsfError=false、validationFailed=false；没有AST协议拒绝。

HAR最后一条独立链的时间范围从10:01:48.269 UTC开始：application HTML→showApplicantForm→类型radio→nationality→domicile→establishment→residence→saveAppBtn。所有POST响应均有正文，可在不运行脚本、不连接浏览器和不发送网络请求的情况下回放。

7个saveAppBtn响应均附带Designationform:j_idt779更新。最后一条链离线复原显示：原模型没有Designationform表单；响应中ApplicantForm正常替换，canonical editApp记录数由0变1；唯一缺失目标为Designationform:j_idt779，其内容是div.ui-outputpanel、559字节、含只读提示文本，无链接/表单控件/脚本。原HTTP模型对所有缺失目标统一抛错，导致已经保存的申请人步骤被标uncertain。

HAR中的人名、地址、输入值、Cookie、ViewState和完整正文均未复制到报告、fixture或提交内容中。仅原始用户文件在内存中读取。临时真实HAR回放代码/结果在忽略目录test-results，仓库中的单元fixture为人工构造。

## 修复

HagueHttpContext.read接收本次实际提交的form id。只有ApplicantForm提交响应，且Designationform尚未挂载时，才允许将Designationform命名空间下的只读ui-outputpanel视为非活动区域更新：必须只有一个同ID的div根，禁止交互控件、a、script、iframe、SVG/MathML等活动内容，禁止事件属性/srcdoc。不把孤立面板插入其他表单，不缓存它覆盖未来的新视图。

其他缺失目标仍DOM_TARGET_MISSING，包括活动ApplicantForm、已存在Designationform但缺失子节点、未知表单、根ID不符及含活动内容的面板。XML/业务校验仍保留，未将HTTP200或忽略一个面板当成保存成功。诊断新增inactiveUpdateCount；unknownComponentCount仍表示无法处理的真正缺失。

## 验证与业务状态

旧代码的正例先复现DOM_TARGET_MISSING；修复后通过，同时7种负例仍拒绝。用户原HAR最后一条完整独立链由真实HagueHttpContext处理7个响应后成功，canonical申请人记录为1；没有浏览器或真实网络请求。

完整1797/1797测试通过，失败0、跳过0；变更文件ESLint、pnpm build（含类型检查）及补丁检查通过。另有独立的用户HAR真实响应回放1/1通过，结果与合成fixture分开。

本轮已保存的申请人不要再次添加。旧uncertain检查点不会被静默清除；应在原站核对对应申请人后，使用“本步已完成，继续下一步”。未对真实草稿自动写入、删除或重建；新版本加载后后续步骤的实站表现尚待验证。
