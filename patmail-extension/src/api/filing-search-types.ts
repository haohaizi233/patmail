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
  appNo: string
  customerVolume: string
}

export interface FilingSearchResult {
  items: FilingSearchRow[]
  total: number
  pageIndex: number
  pageSize: number
  totalPages: number
}
