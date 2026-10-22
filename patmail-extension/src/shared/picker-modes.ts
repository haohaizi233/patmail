/**
 * 原站 TreeUser 的单选 / 多选口径。
 *
 * 判定来源：
 * - `DOM/客户管理-文件管理`、`DOM/案件管理-期限监控` 两份页面快照里每个 TreeUser
 *   操作条有没有「全选」(`a_selectall`)：有「全选」的是 checkbox 多选，值逗号拼 GUID；
 *   没有的是单选（操作条只有「清除 / 确定」）。
 * - `_diff_tmp/FilingList.js` 里递交页的办理人、创建人、业务员显式 `SelectType: "radio"`。
 *
 * 原站绝大多数 TreeUser 都是多选，所以这里按「默认多选 + 少量单选例外」收口。
 * 例外之外的字段要改单/多，只需要动 SINGLE_PICKER_KEYS。
 */

/** 单选字段。其余走树形框 / 下拉字典的字段都按多选处理。 */
const SINGLE_PICKER_KEYS = new Set([
  // 递交管理页（FilingList.js 的 SelectType: "radio"）
  'audit_user_id',
  'create_user_id',
  'sales_user_id',
  // 文件管理页（TreeUser 操作条只有「清除 / 确定」，没有「全选」）
  'agency_id',
  'other_agency_id',
  'agency_user_id',
  'upuser',
  // 取值本身就是单个 ID / 状态位，不走多选
  'history',
  'case_type',
  'business_coop',
  'is_paper_notice',
  'audit_type',
  'is_close',
  'is_vip',
  'proc_type',
  'file_status',
  'ofileType',
  'selfilePath'
])

/** 字段是否按原站的 checkbox 多选呈现。 */
export function isMultiPickerKey(key: string): boolean {
  return !SINGLE_PICKER_KEYS.has(key)
}
