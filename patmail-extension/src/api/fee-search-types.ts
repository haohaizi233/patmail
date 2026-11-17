export interface FeeSearchRow {
  feeId: string
  caseId: string
  procId: string
  sn: number
  caseVolume: string
  caseVolumeCustomer: string
  caseStatus: string
  applyType: string
  businessType: string
  noticeStatus: string
  requestStatus: string
  receiveStatus: string
  payStatus: string
  amount: number
  currency: string
  rate: number
  targetAmount: number
  targetCurrency: string
  reviewStage: string
  feeType: string
  appNo: string
  appDate: string
  requestNo: string
  paymentNo: string
  ctrlProc: string
  feeClassName: string
  feeClass: string
  createTime: string
  payDueDate: string
  caseName: string
  customerName: string
  applicant: string
  recieveAmount: string
  billNo: string
  invoiceNo: string
  requestDate: string
  payDate: string
  receiveDueDate: string
  receiveDate: string
  finishDate: string
  feeCustomer: string
  flowUser: string
  raw: Record<string, unknown>
}

export interface FeeSearchAmountSummary {
  pageAgentFee: number
  pageOfficialFee: number
  pageThirdPartyFee: number
  totalOriginalAgentFee?: number
  totalDiscountAgentFee?: number
  totalOfficialFee?: number
  totalThirdPartyFee?: number
}

export interface FeeSearchResult {
  total: number
  rows: FeeSearchRow[]
  summary: FeeSearchAmountSummary
}
