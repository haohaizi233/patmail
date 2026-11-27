import type { PermitPool } from '../utils/permit-pool'
import { documentedCallAllowed } from './documented-call'
import { fileSearchTimeoutMs } from './file-search-params'
import { trustedOrigin } from './config'
import { apiError, type ApiResult } from './types'

export type EasyOperation =
  | 'session' | 'fileSearch' | 'historyQuery' | 'historySave' | 'historyDelete'
  | 'basicData' | 'flowDirection' | 'fileTypeTree' | 'fieldColumn' | 'listColumn' | 'mailType'
  | 'deptTree' | 'treeUser' | 'treeAgent' | 'fileTempList' | 'fileTempSave' | 'fileTempDelete' | 'deptBranch' | 'applyTags' | 'limitInit' | 'limitCtrlProc'
  | 'mailCustomer' | 'mailInfoInit' | 'getMailInfo' | 'getMailFile' | 'getMailCase'
  | 'getMailRule' | 'getCustomerContact' | 'getRecentContact' | 'getCaseContact' | 'getSalesContact' | 'getPicsContact' | 'getCaseAgentContact' | 'getSignature' | 'getMailSet' | 'mailSignatureList' | 'signatureSet' | 'caseDemand' | 'customerPageDemand' | 'customerPageContact' | 'saveMailInfo' | 'saveMailRelatedFiles'
  | 'getFlowInfo' | 'getFlowHistory' | 'getUrgencyList' | 'getFlowSubmit' | 'getFlowLastStatus' | 'caseBusFlow' | 'showUserInfo'
  | 'limitMonitor' | 'limitMailCustomer' | 'mailSubmit' | 'mailProcess' | 'processAP' | 'processEF' | 'getIsNewCpc'
  | 'agencySearchCase' | 'agencyCaseInfo' | 'patentCaseData' | 'icSearch' | 'customerList'
  | 'hagueApplicants' | 'haguePriorities' | 'caseManageInfo' | 'caseCustomField' | 'caseInventor' | 'caseRecordContact' | 'casePageDemand' | 'getFileName' | 'fileDownload'
  | 'filingSearch' | 'filingFlowNode' | 'contractInit'
  | 'feeSearch' | 'feeSearchAmount' | 'caseFeeList'
  | 'feeSearchInit' | 'feeCustomerTree' | 'feeApplicantTree' | 'feeAgencyList' | 'feeContactInit' | 'feeProducts' | 'feeTechnical'
  | 'feeExportConfig' | 'feeExportConfigSave' | 'feeExportConfigUpdate'
  | 'feeExportByCond' | 'feeExportByChecked' | 'feeExportCountByCond'
  | 'noticeApplyType' | 'noticeAgency' | 'noticeDirectionType' | 'noticeCountry'
  | 'noticeCpcAccount' | 'noticeCpcTzsDate' | 'noticeNolaiutoCount'
  | 'noticeCheckUserStatus' | 'noticeCpcTzsUser' | 'noticeReplayTzsStatus'
  | 'noticeDetail' | 'noticeDetailFee' | 'noticeDetailHebo' | 'noticeDetailDuibi' | 'noticeDetailFileTypes'
  | 'noticeCaseChargeDept' | 'noticeCaseType' | 'noticeSearchCase' | 'noticeAppNoFiles'
  | 'noticeCheckImport' | 'noticeUploadProcess'
  | 'noticeSearch' | 'noticeImportList' | 'noticeUnProcessTzsList' | 'noticeCertList' | 'noticeReplayTzsList'
  | 'noticeHandList' | 'noticeHandHisList' | 'noticeNolaiutoList' | 'noticeHandExcelList'
  | 'noticeGetTzsListStatus' | 'noticeProcessTzsListStatus' | 'noticeGetCertListStatus' | 'noticeGetAnalyseCertStatus'
  | 'noticeExportReport' | 'noticeExportTzs' | 'noticeExportCert' | 'noticeExportReplay'
  | 'noticeImport' | 'noticeImportCloseCase' | 'noticeRecoveryProcess' | 'noticeReMatch'
  | 'noticeUpdateProcess' | 'noticeChangeNolaiuto' | 'noticeUpdateCaseName' | 'noticeSaveDetail'
  | 'noticeRecoveryStatusAnalyse' | 'noticeUpdateHandExcel' | 'noticeDeleteOaByFids'
  | 'noticeGetTzsList' | 'noticeProcessTzsList' | 'noticeGetCpcCertList' | 'noticeDownloadAnalyseCert'
  | 'noticeUploadExcel' | 'noticeUploadCpcChunk' | 'noticeUploadCpcNew' | 'noticeUploadCpcNewGf'
  | 'noticePublishConfig' | 'noticeUploadProcessDetail'
  | 'getProcList' | 'getProcInfo' | 'checkCtrlProc' | 'verificateFiling'
  | 'getCpcBusinessType' | 'insertNewFiling' | 'saveCpcType' | 'saveFilingType' | 'saveFeeReduceRspInfo'
  | 'checkFilingResult' | 'checkSplitPdf' | 'checkFirstInventor' | 'convertSubmit' | 'getConvertStatus' | 'getConvertedFile'
  | 'getPicProcessCount' | 'filingSubmit'

export interface TransportOptions {
  fetcher?: typeof fetch
  timeoutMs?: number
}

const ROUTES: Record<EasyOperation, { path: string; call: string }> = {
  session: { path: '/AjaxServers/Login.ashx', call: 'GetUserModel' },
  fileSearch: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetSearchFiles' },
  historyQuery: { path: '/AjaxServers/CaseInfo.ashx', call: 'SearchQueryHisList' },
  historySave: { path: '/AjaxServers/CaseInfo.ashx', call: 'SearchQueryHisSave' },
  historyDelete: { path: '/AjaxServers/CaseInfo.ashx', call: 'SearchQueryHisDelete' },
  basicData: { path: '/AjaxServers/CaseInfo.ashx', call: 'IPGetBasicData' },
  flowDirection: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetFlowdirection' },
  fileTypeTree: { path: '/AjaxServers/Common.ashx', call: 'LoadFileTypeByCaseType' },
  noticeDetailFileTypes: { path: '/AjaxServers/Common.ashx', call: 'LoadFileTypeByTypeID' },
  fieldColumn: { path: '/AjaxServers/PatentAction.ashx', call: 'GetFieldColumn' },
  listColumn: { path: '/AjaxServers/Common.ashx', call: 'LoadListColumn' },
  mailType: { path: '/AjaxServers/Common.ashx', call: 'LoadMailType' },
  deptTree: { path: '/AjaxServers/Common.ashx', call: 'LoadDeptTree' },
  treeUser: { path: '/AjaxServers/Common.ashx', call: 'GetTreeUser' },
  treeAgent: { path: '/AjaxServers/Common.ashx', call: 'GetTreeAgent' },
  fileTempList: { path: '/AjaxServers/BaseInfo.ashx', call: 'GetFileTempNameList' },
  fileTempSave: { path: '/AjaxServers/BaseInfo.ashx', call: 'SaveFileTepmName' },
  fileTempDelete: { path: '/AjaxServers/BaseInfo.ashx', call: 'DeleteTemp' },
  deptBranch: { path: '/AjaxServers/BaseInfo.ashx', call: 'GetDeptBranch' },
  applyTags: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetApplyTags' },
  limitInit: { path: '/AjaxServers/Report.ashx', call: 'LimitMonitorInit' },
  limitCtrlProc: { path: '/AjaxServers/Report.ashx', call: 'LimitMonitorGetCtrlproc' },
  mailCustomer: { path: '/AjaxServers/Notice.ashx', call: 'MailCustomer' },
  mailInfoInit: { path: '/AjaxServers/Mail.ashx', call: 'MailinfoInit' },
  getMailInfo: { path: '/AjaxServers/Mail.ashx', call: 'GetMailInfo' },
  getMailFile: { path: '/AjaxServers/Mail.ashx', call: 'GetMailFile' },
  getMailCase: { path: '/AjaxServers/Mail.ashx', call: 'GetMailCase' },
  getMailRule: { path: '/AjaxServers/Mail.ashx', call: 'GetMailRule' },
  getCustomerContact: { path: '/AjaxServers/Mail.ashx', call: 'GetCustomerContact' },
  getRecentContact: { path: '/AjaxServers/Mail.ashx', call: 'GetRecentContact' },
  getCaseContact: { path: '/AjaxServers/Mail.ashx', call: 'GetCaseContact' },
  getSalesContact: { path: '/AjaxServers/Mail.ashx', call: 'GetSalesContact' },
  getPicsContact: { path: '/AjaxServers/Mail.ashx', call: 'GetPicsContact' },
  getCaseAgentContact: { path: '/AjaxServers/Mail.ashx', call: 'GetCaseAgentContact' },
  caseDemand: { path: '/AjaxServers/PatentAction.ashx', call: 'GetDemandBuCaseid' },
  customerPageDemand: { path: '/AjaxServers/Customer.ashx', call: 'GetCustomerDemand' },
  customerPageContact: { path: '/AjaxServers/Customer.ashx', call: 'GetCustomerContact' },
  getSignature: { path: '/AjaxServers/Mail.ashx', call: 'GetSignature' },
  getMailSet: { path: '/AjaxServers/Login.ashx', call: 'Getmailset' },
  mailSignatureList: { path: '/AjaxServers/Login.ashx', call: 'GetMailSignatureSettingList' },
  signatureSet: { path: '/AjaxServers/Login.ashx', call: 'GetSignatureset' },
  saveMailInfo: { path: '/AjaxServers/Mail.ashx', call: 'SaveMailInfo' },
  saveMailRelatedFiles: { path: '/AjaxServers/Mail.ashx', call: 'SaveMailRalteCaseFile' },
  getFlowInfo: { path: '/AjaxServers/Common.ashx', call: 'GetFlowInfo' },
  getFlowHistory: { path: '/AjaxServers/Common.ashx', call: 'GetFlowHistory' },
  showUserInfo: { path: '/AjaxServers/Common.ashx', call: 'ShowUserInfo' },
  getUrgencyList: { path: '/AjaxServers/Common.ashx', call: 'GetUrgencyList' },
  getFlowSubmit: { path: '/AjaxServers/Common.ashx', call: 'GetFlowSubmit' },
  getFlowLastStatus: { path: '/AjaxServers/Common.ashx', call: 'GetFlowLastStatus' },
  caseBusFlow: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetCaseBusFlow' },
  limitMonitor: { path: '/AjaxServers/Report.ashx', call: 'GetLimitMonitorCaseList' },
  limitMailCustomer: { path: '/AjaxServers/Notice.ashx', call: 'LimitMailCustomer' },
  mailSubmit: { path: '/AjaxServers/Mail.ashx', call: 'MailSubmit' },
  mailProcess: { path: '/AjaxServers/Common.ashx', call: 'GetProcessByTypeCO' },
  processAP: { path: '/AjaxServers/Common.ashx', call: 'GetProcessByTypeAP' },
  processEF: { path: '/AjaxServers/Common.ashx', call: 'GetProcessByTypeEF' },
  getIsNewCpc: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetIsNewCPC' },
  agencySearchCase: { path: '/AjaxServers/AgencyAction.ashx', call: 'AgencySearchCase' },
  agencyCaseInfo: { path: '/AjaxServers/AgencyAction.ashx', call: 'GetCaseInfo' },
  hagueApplicants: { path: '/AjaxServers/PatentAction.ashx', call: 'GetCaseApplicant' },
  haguePriorities: { path: '/AjaxServers/PatentAction.ashx', call: 'GetCasePriority' },
  caseManageInfo: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetCaseInfo' },
  caseCustomField: { path: '/AjaxServers/BaseInfo.ashx', call: 'GetCustomField' },
  caseInventor: { path: '/AjaxServers/PatentAction.ashx', call: 'GetCaseInventor' },
  caseRecordContact: { path: '/AjaxServers/PatentAction.ashx', call: 'GetCaseContact' },
  casePageDemand: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetCaseDemand' },
  patentCaseData: { path: '/AjaxServers/PatentAction.ashx', call: 'GetPatentData' },
  icSearch: { path: '/AjaxServers/CaseInfo.ashx', call: 'ICSearchList' },
  customerList: { path: '/AjaxServers/Customer.ashx', call: 'GetCustomerlist' },
  getFileName: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetFileName' },
  fileDownload: { path: '/AjaxServers/BaseInfo.ashx', call: 'DownLoad' },
  filingSearch: { path: '/AjaxServers/FilingAction.ashx', call: 'GetFinished' },
  filingFlowNode: { path: '/AjaxServers/FilingAction.ashx', call: 'GetFilingFlowNode' },
  contractInit: { path: '/AjaxServers/Customer.ashx', call: 'InitContractStatus' },
  feeSearch: { path: '/AjaxServers/Report.ashx', call: 'FeeSearch' },
  caseFeeList: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetFeeListByCase' },
  feeSearchAmount: { path: '/AjaxServers/Report.ashx', call: 'FeeSearchTotalAmount' },
  feeSearchInit: { path: '/AjaxServers/Bill.ashx', call: 'FeeSearchInit' },
  feeCustomerTree: { path: '/AjaxServers/Report.ashx', call: 'GetCustomerTreeData' },
  feeApplicantTree: { path: '/AjaxServers/Report.ashx', call: 'GetTreeApplicant' },
  feeAgencyList: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetAencyList' },
  feeContactInit: { path: '/AjaxServers/Customer.ashx', call: 'ContactInit' },
  feeProducts: { path: '/AjaxServers/BaseInfo.ashx', call: 'GetProducts' },
  feeTechnical: { path: '/AjaxServers/Common.ashx', call: 'LoadTechnical' },
  feeExportConfig: { path: '/AjaxServers/Common.ashx', call: 'GetQueryOutConfig' },
  feeExportConfigSave: { path: '/AjaxServers/Common.ashx', call: 'UpdateQueryOutConfig' },
  feeExportConfigUpdate: { path: '/AjaxServers/Common.ashx', call: 'UpdateQueryOutConfigNew' },
  feeExportByCond: { path: '/AjaxServers/Report.ashx', call: 'ExcelFeeListByCond' },
  feeExportByChecked: { path: '/AjaxServers/Report.ashx', call: 'ExcelFeeListByChecked' },
  feeExportCountByCond: { path: '/AjaxServers/Report.ashx', call: 'ExcelFeeListCountByCond' },
  noticeApplyType: { path: '/AjaxServers/Notice.ashx', call: 'GetApplyType' },
  noticeAgency: { path: '/AjaxServers/Notice.ashx', call: 'GetAgency' },
  noticeDirectionType: { path: '/AjaxServers/Notice.ashx', call: 'GetDirectionType' },
  noticeCountry: { path: '/AjaxServers/Common.ashx', call: 'LoadCountry' },
  noticeCpcAccount: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCpcNoticeAccount' },
  noticeCpcTzsDate: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCPCTzsDate' },
  noticeNolaiutoCount: { path: '/AjaxServers/Notice.ashx', call: 'GetNolaiutoCount' },
  noticeCheckUserStatus: { path: '/AjaxServers/FilingApiAction.ashx', call: 'CheckUserStatus' },
  noticeCpcTzsUser: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCpcTzsUser' },
  noticeReplayTzsStatus: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetReaplyTzsStatus' },
  noticeDetail: { path: '/AjaxServers/Notice.ashx', call: 'GetNoticeDetail' },
  noticeDetailFee: { path: '/AjaxServers/Notice.ashx', call: 'GetNoticefee' },
  noticeDetailHebo: { path: '/AjaxServers/Notice.ashx', call: 'GetNoticehebo' },
  noticeDetailDuibi: { path: '/AjaxServers/Notice.ashx', call: 'GetNoticeduibi' },
  noticeCaseChargeDept: { path: '/AjaxServers/Notice.ashx', call: 'GetCasechargedept' },
  noticeCaseType: { path: '/AjaxServers/Notice.ashx', call: 'GetNoticeCaseType' },
  noticeSearchCase: { path: '/AjaxServers/Common.ashx', call: 'LoadSearchCase' },
  noticeAppNoFiles: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetFileListByAppNo' },
  noticeCheckImport: { path: '/AjaxServers/Notice.ashx', call: 'CheckImportNotice' },
  noticeUploadProcess: { path: '/AjaxServers/UploadFile.ashx', call: 'GetUploadProcessList' },
  noticeSearch: { path: '/AjaxServers/Notice.ashx', call: 'SearchNotice' },
  noticeImportList: { path: '/AjaxServers/Notice.ashx', call: 'GetImportNoticeList' },
  noticeUnProcessTzsList: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetUnProcessTzsList' },
  noticeCertList: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCertList' },
  noticeReplayTzsList: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetReplayTzsList' },
  noticeHandList: { path: '/AjaxServers/Notice.ashx', call: 'GetHandNoticeList' },
  noticeHandHisList: { path: '/AjaxServers/Notice.ashx', call: 'GetHandHisList' },
  noticeNolaiutoList: { path: '/AjaxServers/Notice.ashx', call: 'GetNolaiuto' },
  noticeHandExcelList: { path: '/AjaxServers/Notice.ashx', call: 'GethandExcelList' },
  noticeGetTzsListStatus: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetTzsListStatus' },
  noticeProcessTzsListStatus: { path: '/AjaxServers/FilingApiAction.ashx', call: 'ProcessTzsListStatus' },
  noticeGetCertListStatus: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCertListStatus' },
  noticeGetAnalyseCertStatus: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetAnalyseCertStatus' },
  noticeExportReport: { path: '/AjaxServers/Notice.ashx', call: 'ReportNoticeExcel' },
  noticeExportTzs: { path: '/AjaxServers/FilingApiAction.ashx', call: 'ExportExcelTzsList' },
  noticeExportCert: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCertListExport' },
  noticeExportReplay: { path: '/AjaxServers/FilingApiAction.ashx', call: 'ExportExcelTwoTzsList' },
  noticeImport: { path: '/AjaxServers/Notice.ashx', call: 'ImportNotice' },
  noticeImportCloseCase: { path: '/AjaxServers/Notice.ashx', call: 'ImportCloseCase' },
  noticeRecoveryProcess: { path: '/AjaxServers/Notice.ashx', call: 'RecoveryProcessstatus' },
  noticeReMatch: { path: '/AjaxServers/Notice.ashx', call: 'ReMatchNotice' },
  noticeUpdateProcess: { path: '/AjaxServers/Notice.ashx', call: 'UpdateProcessstatus' },
  noticeChangeNolaiuto: { path: '/AjaxServers/Notice.ashx', call: 'ChangeNolaiuto' },
  noticeUpdateCaseName: { path: '/AjaxServers/Notice.ashx', call: 'UpdateCaseName' },
  noticeSaveDetail: { path: '/AjaxServers/Notice.ashx', call: 'SaveNoticeDetail' },
  noticeRecoveryStatusAnalyse: { path: '/AjaxServers/Notice.ashx', call: 'RecoveryStatusAnalyse' },
  noticeUpdateHandExcel: { path: '/AjaxServers/Notice.ashx', call: 'UpdateHandExcel' },
  noticeDeleteOaByFids: { path: '/AjaxServers/FilingApiAction.ashx', call: 'DeleteOaInfoByFids' },
  noticeGetTzsList: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetTzsList' },
  noticeProcessTzsList: { path: '/AjaxServers/FilingApiAction.ashx', call: 'ProcessTzsList' },
  noticeGetCpcCertList: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCpcCertList' },
  noticeDownloadAnalyseCert: { path: '/AjaxServers/FilingApiAction.ashx', call: 'DownloadAndAnalyseCert' },
  noticeUploadExcel: { path: '/AjaxServers/Notice.ashx', call: 'UploadNoticeExcel' },
  noticeUploadCpcChunk: { path: '/Forms/MultiUPload/UploadMethod.ashx', call: '' },
  noticeUploadCpcNew: { path: '/AjaxServers/UploadFile.ashx', call: 'UploadCPCFileNew' },
  noticeUploadCpcNewGf: { path: '/AjaxServers/UploadFile.ashx', call: 'UploadCPCFileNewGF' },
  noticePublishConfig: { path: '/AjaxServers/BaseInfo.ashx', call: 'GetPublishConfig' },
  noticeUploadProcessDetail: { path: '/AjaxServers/UploadFile.ashx', call: 'GetUploadProcessDetailList' },
  getProcList: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetProcList' },
  getProcInfo: { path: '/AjaxServers/CaseInfo.ashx', call: 'GetProcInfo' },
  checkCtrlProc: { path: '/AjaxServers/CaseInfo.ashx', call: 'CheckCtrlProc' },
  verificateFiling: { path: '/AjaxServers/CaseInfo.ashx', call: 'VerificateFiling' },
  getCpcBusinessType: { path: '/AjaxServers/FilingApiAction.ashx', call: 'GetCPCBusineeType' },
  insertNewFiling: { path: '/AjaxServers/FilingApiAction.ashx', call: 'InsertNewFiling' },
  saveCpcType: { path: '/AjaxServers/FilingApiAction.ashx', call: 'SaveCPCType' },
  saveFilingType: { path: '/AjaxServers/FilingAction.ashx', call: 'SaveFilingType' },
  saveFeeReduceRspInfo: { path: '/AjaxServers/FilingAction.ashx', call: 'SaveFeeReduceRspInfo' },
  checkFilingResult: { path: '/AjaxServers/FilingAction.ashx', call: 'CheckResult' },
  checkSplitPdf: { path: '/AjaxServers/FilingAction.ashx', call: 'CheckSplitPDF' },
  checkFirstInventor: { path: '/AjaxServers/FilingAction.ashx', call: 'CheckFirstInventor' },
  convertSubmit: { path: '/AjaxServers/FilingAction.ashx', call: 'ConvertSubmit' },
  getConvertStatus: { path: '/AjaxServers/FilingAction.ashx', call: 'GetConvertStatus' },
  getConvertedFile: { path: '/AjaxServers/FilingAction.ashx', call: 'GetConvertedFile' },
  getPicProcessCount: { path: '/AjaxServers/Common.ashx', call: 'GetPicProcessCount' },
  filingSubmit: { path: '/AjaxServers/FilingAction.ashx', call: 'FilingSubmit' }
}

function loginRedirect(response: Response, origin: string): boolean {
  if (!response.url) return false
  try {
    const finalUrl = new URL(response.url)
    return finalUrl.origin === origin && /\blogin(?:\.aspx)?$/i.test(finalUrl.pathname)
  } catch {
    return false
  }
}

function looksLikeLoginHtml(body: string): boolean {
  return /<\s*(?:!doctype\s+html|html|form)\b/i.test(body.slice(0, 300)) &&
    /login|登录|type\s*=\s*["']?password/i.test(body.slice(0, 3000))
}

/** 无有效会话时，GetUserModel 返回短 HTML「出错了!」，不是登录页，也不是业务 JSON。 */
function looksLikeLoggedOutHtml(body: string): boolean {
  return looksLikeLoginHtml(body) || (body.length <= 500 && /出错了/.test(body) && !/<html[\s>]/i.test(body))
}

/** 网关、超时、连不上。这种失败可以再点提交；写请求结果没确认时仍不能当成已经成功。 */
export function transientEasyFailure(message: string): boolean {
  return /网关异常|服务暂不可用|请求超时|无法连接 EASY/.test(message)
}

/** 发文提交这一串在原站高峰期常要 20 到 30 秒，先建单、后读联系人和流程、再保存和提交。下载打包一次上百个 PDF 也要等服务端压包；GetFileName 一批 100 个文件名在慢站实测单批要几分钟，15 秒会把它掐成「下载停了」。 */
const SLOW_OPERATIONS = new Set<EasyOperation>([
  'limitMailCustomer', 'mailProcess', 'processAP', 'processEF', 'agencySearchCase', 'icSearch', 'caseBusFlow', 'casePageDemand', 'caseInventor', 'caseRecordContact', 'customerList',
  'getMailInfo', 'getMailCase', 'getMailRule', 'getCustomerContact', 'getRecentContact', 'getCaseContact', 'getSalesContact', 'getPicsContact', 'getCaseAgentContact',
  'getFlowInfo', 'getFlowSubmit', 'getUrgencyList', 'getFlowLastStatus', 'saveMailInfo', 'mailSubmit', 'fileDownload', 'getFileName',
  'treeUser', 'noticeApplyType', 'noticeAgency', 'noticeDirectionType', 'noticeCountry', 'noticeCpcAccount', 'noticeCpcTzsDate', 'noticeNolaiutoCount',
  'noticeDetailFee', 'noticeDetailHebo', 'noticeDetailDuibi', 'noticeCaseChargeDept', 'noticeCaseType', 'noticeSearchCase', 'noticeAppNoFiles',
  'noticeSearch', 'noticeImportList', 'noticeUnProcessTzsList', 'noticeCertList', 'noticeReplayTzsList',
  'noticeHandList', 'noticeHandHisList', 'noticeNolaiutoList', 'noticeHandExcelList',
  'noticeGetTzsList', 'noticeProcessTzsList', 'noticeGetCpcCertList', 'noticeDownloadAnalyseCert',
  'noticeGetTzsListStatus', 'noticeProcessTzsListStatus', 'noticeGetCertListStatus', 'noticeGetAnalyseCertStatus',
  'noticeImport', 'noticeImportCloseCase', 'noticeReMatch', 'noticeUpdateCaseName',
  'noticeUploadExcel', 'noticeUploadCpcChunk', 'noticeUploadCpcNew', 'noticeUploadCpcNewGf',
  'noticePublishConfig', 'noticeUploadProcessDetail',
  'getProcList', 'getCpcBusinessType', 'convertSubmit', 'getConvertStatus', 'getConvertedFile', 'getPicProcessCount', 'filingSubmit'
])

const NON_RETRYABLE_OPERATIONS = new Set<EasyOperation>([
  'mailCustomer', 'saveMailInfo', 'saveMailRelatedFiles', 'historySave', 'historyDelete',
  'fileTempSave', 'fileTempDelete', 'limitMailCustomer', 'mailSubmit', 'fileDownload',
  'feeExportConfigSave', 'feeExportConfigUpdate', 'feeExportByCond', 'feeExportByChecked', 'feeExportCountByCond',
  'noticeExportReport', 'noticeExportTzs', 'noticeExportCert', 'noticeExportReplay',
  'noticeImport', 'noticeImportCloseCase', 'noticeRecoveryProcess', 'noticeReMatch',
  'noticeUpdateProcess', 'noticeChangeNolaiuto', 'noticeUpdateCaseName', 'noticeSaveDetail',
  'noticeRecoveryStatusAnalyse', 'noticeUpdateHandExcel', 'noticeDeleteOaByFids',
  'noticeGetTzsList', 'noticeProcessTzsList', 'noticeGetCpcCertList', 'noticeDownloadAnalyseCert',
  'noticeUploadExcel', 'noticeUploadCpcChunk', 'noticeUploadCpcNew', 'noticeUploadCpcNewGf',
  'insertNewFiling', 'saveCpcType', 'saveFilingType', 'saveFeeReduceRspInfo', 'convertSubmit', 'filingSubmit'
])

const SEARCH_TIMEOUT_OPERATIONS = new Set<EasyOperation>([
  'fileSearch', 'limitMonitor', 'filingSearch', 'feeSearch', 'feeSearchAmount',
  'feeExportByCond', 'feeExportByChecked', 'feeExportCountByCond',
  'noticeSearch', 'noticeImportList', 'noticeUnProcessTzsList', 'noticeCertList', 'noticeReplayTzsList',
  'noticeHandList', 'noticeHandHisList', 'noticeNolaiutoList', 'noticeHandExcelList',
  'noticeExportReport', 'noticeExportTzs', 'noticeExportCert', 'noticeExportReplay'
])

/** 发文已经创建、后面的读取失败时，再点提交应沿用这封，而不是再创建一封。 */
export function retryCreatedDraft(message: string): string {
  if (!transientEasyFailure(message) || message.includes('再点')) return message
  return `${message}再点「提交到 EASY」会沿用这封发文，不会重新创建。`
}

export class EasyTransport {
  private readonly origin: string | null
  private readonly fetcher: typeof fetch
  private readonly timeoutMs: number

  constructor(pageOrigin: string, options: TransportOptions = {}) {
    this.origin = trustedOrigin(pageOrigin)
    // 浏览器原生 fetch 是 WebIDL 方法，作为类字段调用会丢失 Window 接收者。
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 15_000
  }

  /** 只读请求遇到网关 502/503 时再试。写请求不重试，避免一次 502 后面又创建出第二封；打包下载也不重试，免得在原站留两份临时包。 */
  async post(operation: EasyOperation, params: URLSearchParams, signal?: AbortSignal, timeoutMs?: number, onBytes?: (received: number) => void, networkPool?: PermitPool): Promise<ApiResult<unknown>> {
    const retryable = !NON_RETRYABLE_OPERATIONS.has(operation)
    let result = await this.postOnce(operation, params, signal, timeoutMs, onBytes, networkPool)
    for (let attempt = 1; retryable && !result.ok && (result.error.status === 502 || result.error.status === 503) && attempt < 3; attempt += 1) {
      if (signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
      await new Promise(resolve => setTimeout(resolve, 200 * attempt))
      if (signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
      result = await this.postOnce(operation, params, signal, timeoutMs, onBytes, networkPool)
    }
    return result
  }

  /** 提交 multipart/form-data（仅限白名单上传入口），用于清单 Excel 上传与 CPC 压缩包分片上传。 */
  async postMultipart(
    operation: 'noticeUploadExcel' | 'noticeUploadCpcChunk',
    formData: FormData,
    query?: Record<string, string>,
    signal?: AbortSignal,
    timeoutMs?: number
  ): Promise<ApiResult<unknown>> {
    if (!this.origin) return apiError('INVALID_ORIGIN', '当前页面不属于受信任的 EASY 站点。')
    const route = ROUTES[operation]
    if (!route) return apiError('INVALID_QUERY', '业务请求类型无效。')
    if (signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
    const search = new URLSearchParams()
    if (route.call) search.set('Call', route.call)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v.trim()) search.set(k, v.trim())
      }
    }
    const qs = search.toString()
    const fullPath = qs ? `${route.path}?${qs}` : route.path
    return this.dispatchPost(
      fullPath,
      { 'X-Requested-With': 'XMLHttpRequest' },
      formData,
      this.waitMs(operation, timeoutMs),
      signal,
      undefined,
      undefined,
      operation === 'noticeUploadCpcChunk'
    )
  }

  /** 文件查询、期限监控和递交查询在这套原网站上经常超过 15 秒。测试传入的短超时仍然生效。文件查询可以按页面选择拉长。
 * 发文提交这一串（建单、联系人、规则、保存、提交流程）在原站高峰期实测 20 到 30 秒才回，全部放宽到 60 秒， 15 秒会把还 能成功的请求掐成「结果无法确认」。 */
  private waitMs(operation: EasyOperation, timeoutMs?: number): number {
    if (this.timeoutMs < 15_000) return this.timeoutMs
    if (SEARCH_TIMEOUT_OPERATIONS.has(operation)) return fileSearchTimeoutMs(timeoutMs)
    // 原站先准备完整压缩包再返回GUID；与原站Ajax一样不设总时长，不能在5分钟主动掐断。
    if (operation === 'fileDownload') return 0
    // 命名一批 40 个实测单批可超过一分钟；与原站 jQuery 一样不设总时长，不能在固定时限主动掐断，显式取消仍然生效。
    if (operation === 'getFileName') return 0
    // 会话检测在命名、批量拉页打满连接时也要排队；15 秒掐断会把“检测慢”报成“掉登录”，给 30 秒余量。
    if (operation === 'session') return 30_000
    if (SLOW_OPERATIONS.has(operation)) return 60_000
    return this.timeoutMs
  }

  /** Handler、Call、方法和目标 Origin 由内部白名单固定，页面消息不能提供 URL。 */
  private async postOnce(operation: EasyOperation, params: URLSearchParams, signal?: AbortSignal, timeoutMs?: number, onBytes?: (received: number) => void, networkPool?: PermitPool): Promise<ApiResult<unknown>> {
    if (!this.origin) return apiError('INVALID_ORIGIN', '当前页面不属于受信任的 EASY 站点。')
    const route = ROUTES[operation]
    if (!route || params.getAll('Call').length !== 1 || params.get('Call') !== route.call) {
      return apiError('INVALID_QUERY', '业务请求类型无效。')
    }
    if (signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
    return this.sendForm(route.path, params, this.waitMs(operation, timeoutMs), signal, onBytes, networkPool)
  }

  /** DownLoad 打包后取压缩包的地址（原站把隐藏 iframe 指到这里，浏览器负责落盘）。 */
  fileDownloadUrl(fileGuid: string, fileSize: number | null): string | null {
    if (!this.origin) return null
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileGuid)) return null
    const query = new URLSearchParams({ guid: fileGuid })
    if (fileSize !== null) query.set('file_size', String(fileSize))
    return `${this.origin}/AjaxServers/FileHandler.ashx?${query.toString()}`
  }

  /** 用当前页面的登录会话调用文档里的只读接口。入口和 Call 由调用方先校验。 */
  async postDocumented(handler: string, params: URLSearchParams, signal?: AbortSignal): Promise<ApiResult<unknown>> {
    if (!this.origin) return apiError('INVALID_ORIGIN', '当前页面不属于受信任的 EASY 站点。')
    const call = params.get('Call') ?? ''
    if (params.getAll('Call').length !== 1) return apiError('INVALID_QUERY', 'Call 无效。')
    const allowed = documentedCallAllowed(handler, call)
    if (!allowed.ok) return apiError('INVALID_QUERY', allowed.reason)
    let result = await this.sendForm(`/AjaxServers/${handler}`, params, 15_000, signal)
    for (let attempt = 1; !result.ok && (result.error.status === 502 || result.error.status === 503) && attempt < 3; attempt += 1) {
      if (signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
      await new Promise(resolve => setTimeout(resolve, 200 * attempt))
      if (signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
      result = await this.sendForm(`/AjaxServers/${handler}`, params, 15_000, signal)
    }
    return result
  }

  /** Handler 和 Call 已由上层收口。Cookie 只随当前页面发出，不读出来。 */
  private sendForm(path: string, params: URLSearchParams, timeoutMs: number, signal?: AbortSignal, onBytes?: (received: number) => void, networkPool?: PermitPool): Promise<ApiResult<unknown>> {
    return this.dispatchPost(
      path,
      {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      params.toString(),
      timeoutMs,
      signal,
      onBytes,
      networkPool,
      false
    )
  }

  private async dispatchPost(
    path: string,
    headers: Record<string, string>,
    bodyPayload: BodyInit,
    timeoutMs: number,
    signal?: AbortSignal,
    onBytes?: (received: number) => void,
    networkPool?: PermitPool,
    allowEmptyJson = false
  ): Promise<ApiResult<unknown>> {
    if (!this.origin) return apiError('INVALID_ORIGIN', '当前页面不属于受信任的 EASY 站点。')
    let release: (() => void) | undefined
    if (networkPool) {
      try { release = await networkPool.acquire(signal) } catch { return apiError('REQUEST_ABORTED', '请求已取消。') }
      if (signal?.aborted) { release?.(); return apiError('REQUEST_ABORTED', '请求已取消。') }
    }
    const controller = new AbortController()
    let timedOut = false
    const onExternalAbort = () => controller.abort()
    signal?.addEventListener('abort', onExternalAbort, { once: true })
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs) : undefined
    try {
      const response = await this.fetcher(this.origin + path, {
        method: 'POST',
        credentials: 'include',
        redirect: 'follow',
        headers,
        body: bodyPayload,
        signal: controller.signal
      })
      if (response.status === 401 || response.status === 403 || loginRedirect(response, this.origin)) {
        return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效，请在原网站重新登录。', response.status)
      }
      if (!response.ok) {
        return apiError('HTTP_ERROR', response.status === 502 ? 'EASY 网关异常。' :
          response.status === 503 ? 'EASY 服务暂不可用。' : 'EASY 返回 HTTP 错误。', response.status)
      }
      let text = ''
      if (onBytes && response.body) {
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let received = 0
        try {
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            received += chunk.value.byteLength
            text += decoder.decode(chunk.value, { stream: true })
            onBytes(received)
          }
          text += decoder.decode()
        } finally { reader.releaseLock() }
      } else text = await response.text()
      // The body has arrived. Release before parsing, validation, and caller cleanup.
      release?.(); release = undefined
      const body = text.trim()
      if (!body && allowEmptyJson) {
        return { ok: true, data: {} }
      }
      if (body.startsWith('<')) {
        return apiError(looksLikeLoggedOutHtml(body) ? 'SESSION_EXPIRED' : 'UNEXPECTED_HTML',
          looksLikeLoggedOutHtml(body) ? 'EASY 登录状态已失效，请在原网站重新登录。' : 'EASY 返回了非业务 HTML。')
      }
      try {
        return { ok: true, data: JSON.parse(body) as unknown }
      } catch {
        return apiError('INVALID_RESPONSE', 'EASY 响应不是有效 JSON。')
      }
    } catch {
      if (timedOut) return apiError('REQUEST_TIMEOUT', '请求超时，请重试。')
      if (signal?.aborted || controller.signal.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
      return apiError('NETWORK_ERROR', '无法连接 EASY，请检查网络。')
    } finally {
      release?.()
      clearTimeout(timer)
      signal?.removeEventListener('abort', onExternalAbort)
    }
  }
}
