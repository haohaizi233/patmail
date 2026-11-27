import type { TreeOption } from '../query/option-tree'

export interface PatentOptionItem {
  value: string
  label: string
}

export interface PatentSearchQuery {
  pageIndex: number
  pageSize: number
  is_proc?: boolean
  is_fuzzy_query_case_volume?: boolean
  is_fuzzy_query_app_no?: boolean
  is_fuzzy_query_pct_app_no?: boolean
  is_point_app_no?: boolean
  is_remove_symbol?: boolean
  select_and?: boolean
  is_first?: boolean
  colsel?: string
  fields: Record<string, string>
  displayValues?: Record<string, string>
  checks?: Record<string, boolean>
}

export interface PatentInitData {
  caseTypeId: string
  countries: TreeOption[]
  applyTypes: TreeOption[]
  bussTypes: TreeOption[]
  caseStatuses: TreeOption[]
  ctrlProcs: TreeOption[]
  procStatuses: TreeOption[]
  caseDirections: TreeOption[]
  customerStatuses: TreeOption[]
  applyTags: TreeOption[]
  reviewStages: TreeOption[]
  technicals: TreeOption[]
  products: TreeOption[]
  branchDepts: TreeOption[]
  depts: TreeOption[]
  users: TreeOption[]
  agencies: TreeOption[]
  caseCoefficients: PatentOptionItem[]
  customerFroms: PatentOptionItem[]
  fromStages: TreeOption[]
  generationStatuses: PatentOptionItem[]
  protectionCenters: PatentOptionItem[]
  applicantTypes: PatentOptionItem[]
  sourceTypes: PatentOptionItem[]
  customerClasses: PatentOptionItem[]
  businessCoops: PatentOptionItem[]
  relateTypes: TreeOption[]
  savedColumns: string[]
  fieldColumns: Record<string, string>
  warnings: string[]
}

export interface PatentSearchRow {
  caseId: string
  procId: string
  caseTypeId: string
  caseVolume: string
  caseVolumeCustomer: string
  caseName: string
  applyName: string
  applicants: string
  picCase: string
  foreignPicCase: string
  appNo: string
  appDate: string
  applyType: string
  caseStatus: string
  countryName: string
  pctAppNo: string
  pctAppDate: string
  ctrlProc: string
  picProc: string
  procStatus: string
  legalDueDate: string
  cusDueDate: string
  intDueDate: string
  procNote: string
  stateIntoDate: string
  mentor: string
  translate: string
  proofread: string
  backInventorDate: string
  translateCount: string
  raw: Record<string, string>
}

export interface PatentSearchResult {
  rows: PatentSearchRow[]
  total: number
  pageIndex: number
  pageSize: number
  totalPages: number
}
