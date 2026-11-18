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

export interface FeeOptionItem {
  value: string
  label: string
  parent?: string
  caseTypeId?: string
  countryId?: string
  selectable?: boolean
}

export interface FeeTypeItem {
  id: string
  name: string
  caseTypeId: string
  countryId: string
  applyTypeId: string
  feeClass: string
  caseTypeName: string
  applyTypeName: string
  countryName: string
  currencyName: string
}

export interface FeeInitData {
  caseTypes: FeeOptionItem[]
  directions: FeeOptionItem[]
  receiveStatuses: FeeOptionItem[]
  payTypes: FeeOptionItem[]
  feeTypes: FeeTypeItem[]
  applyTypes: FeeOptionItem[]
  bussTypes: FeeOptionItem[]
  caseStatuses: FeeOptionItem[]
  customerStatuses: FeeOptionItem[]
  reviewStages: FeeOptionItem[]
  currencies: FeeOptionItem[]
  sourceTypes: FeeOptionItem[]
  bankList: FeeOptionItem[]
  agencies: FeeOptionItem[]
  contactTypes: FeeOptionItem[]
  products: FeeOptionItem[]
  technicals: FeeOptionItem[]
  fieldColumns: Record<string, string>
}

export interface FeeCustomerItem {
  id: string
  name: string
  tel: string
  email: string
}

export interface FeeApplicantItem {
  value: string
  label: string
  parent?: string
  selectable?: boolean
}
