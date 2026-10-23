/** 递交管理列表 `FilingAction.ashx Call=GetFinished` 的结果。列名对齐 FILING_SEARCH_COLSEL。 */
export interface FilingSearchRow {
  filingId: string
  caseId: string
  procId: string
  caseVolume: string
  caseName: string
  customerName: string
  customerCode: string
  applyType: string
  ctrlProc: string
  intDueDate: string
  filingDate: string
  caseType: string
  branchDept: string
  createUser: string
  createTime: string
  flowStatus: string
  /** 案件流向，II/IO/OI/OO 这类代码，导出时翻成中文名。 */
  flowDirection: string
  appNo: string
  customerVolume: string
  /** 申请日。导出取不到时用申请事项的完成日（filingDate）。 */
  appDate: string
  /** 案件状态文字，原站列表行自带。 */
  caseStatus: string
}

export interface FilingSearchResult {
  items: FilingSearchRow[]
  total: number
  pageIndex: number
  pageSize: number
  totalPages: number
}
