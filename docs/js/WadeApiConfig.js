/**
 * 唯德接口配置
 * 用于代理机构和企业版直接的数据交互接口
 **/

WadeAPI = {
    // 接口token
    TOKEN: "5D4DDE35-1624-4302-9EEA-D4DE09997437",

    //#region 测试接口
    Ping: "/api/DataPush/ApiPing",
    //#endregion

    //#region 公共方法
    GetFlowInfo: "/api/DataPush/GetFlowInfo",
    AutoSearchUser: "/api/DataPush/AutoSearchUser",
    GetFlowSubmit: "/api/DataPush/GetFlowSubmit",
    GetUnFinishAddsign: "/api/DataPush/GetUnFinishAddsign",
    GetApendNextNode: "/api/DataPush/GetApendNextNode",
    GetPublishConfig: "/api/DataPush/GetPublishConfig",
    GetRoleCode: "/api/DataPush/GetRoleCode",
    //#endregion

    //#region 委案对接接口地址
    // 委案待处理流程信息
    GetAppointCaseList: "/api/DataPush/GetAppointCaseList",
    GetAppointCaseListNew: "/api/DataPush/GetAppointCaseListNew",
    // 获取委案IPEASY包
    GetIPEasyPack: "/api/DataPush/GetIPEasyPack",
    // 委案流程信息保存
    FlowSave: "/api/DataPush/FlowSave",
    // 委案流程提交
    FlowSubmit: "/api/DataPush/FlowSubmit",
    // 委案流程完成
    GetApplyFinished: "/api/DataPush/GetApplyFinished",
    // 未委案数量
    GetEntrustCaseCount: "/api/DataPush/GetEntrustCaseCount",
    // 统计委案数量（已经在委案的和已委案完成的）
    GetEntrustTotalCount: "/api/DataPush/GetEntrustTotalCount",
    // 委案商标数据到企业
    UpdateTradeCaseInfo:"/api/DataPush/updateTradeCaseInfo",
    //#endregion

    //#region 核稿对接接口地址
    //查询核稿案件
    CaseVolumeSearch: "/api/DataPush/CaseVolumeSearch",
    //查询核稿案件处理事项
    GetCtrlProcCN: "/api/DataPush/GetCtrlProcCN",
    // 核稿包推送
    EflowImport: "/api/DataPush/EflowImport",
    // 核稿流程状态
    GetEflowStatus: "/api/DataPush/GetEflowStatus",
    // 核稿流程列表
    BatchEflowList: "/api/DataPush/BatchEflowList",
    // 删除核稿流程
    DelEflow: "/api/DataPush/DelEflow",
    // 删除核稿文件
    EflowDelFile: "/api/DataPush/EflowDelFile",
    // 核稿流程提交
    BatchEflowSubmit: "/api/DataPush/BatchEflowSubmit",
    // 获取文件类型
    LoadFileType: "/api/DataPush/LoadFileType",
    // 更新文件描述
    UpdateFileDesc: "/api/DataPush/UpdateFileDesc",
    // 获取委案数量
    GetEntrustCaseCount: "/api/DataPush/GetEntrustCaseCount",
    GetAppointCaseListDetail: "/api/DataPush/GetAppointCaseListDetail",
    // 待核稿列表
    Geteflowcheck: "/api/DataPush/Geteflowcheck",
    // 待核稿同步
    SyncAgency: "/api/DataPush/SyncAgency",
    SyncAgencyFile: "/api/DataPush/SyncAgencyFile",
    UpdateSyncAgencyFile: "/api/DataPush/UpdateSyncAgencyFile",
    // 核稿退回企业同步 同步状态
    UpdateEflowSyncStatus: "/DataPush/UpdateEflowSyncStatus",
    // 核稿文件
    GetEflowFileAll: "/api/DataPush/GetEflowFileAll",
    // 核稿提交
    EflowSubmit: "/api/DataPush/EflowSubmit",
    // 核稿文件删除
    DelFileById: "/api/DataPush/DelFileById",
    // 核稿文件下载
    DownloadFile: "/api/DataPush/DownloadFile",
    // 文件上传
    IPFileUpload: "/api/DataPush/UploadFile",
    IPFileUploadZT: "/api/DataPush/UploadFileZT",
    LoadFileTypeByTypeID: "/api/DataPush/LoadFileTypeByTypeID",
    GetFileTypeName: "/api/DataPush/GetFileTypeName",
    EflowFinishList: "/api/DataPush/EflowFinishList",
    EflowFileUpload: "/api/DataPush/EflowFileUpload",
    EflowlistProcessing: "/api/DataPush/EflowlistProcessing",
    GetEFlowInfoAndFile: "/api/DataPush/GetEFlowInfoAndFile",
    CheckNodeFilePower: "/api/DataPush/CheckNodeFilePower",
    ViewonLine: "/api/DataPush/viewOnLine",
    //#endregion

    //#region 账款对接接口EflowImport
    GetFeeList: "/api/DataPush/GetFeeList",
    GetFeeInfo: "/api/DataPush/GetFeeInfo",
    GetCtrlProcByCaseId: "/api/DataPush/GetCtrlProcByCaseId",
    GetAgencyCase: "/api/DataPush/GetAgencyCase",
    SaveFeeInfo: "/api/DataPush/SaveFeeInfo",
    ExistFeeType: "/api/DataPush/ExistFeeType",
    UpdateBillCurrencyRate: "/api/DataPush/UpdateBillCurrencyRate",
    GetRequestDetail: "/api/DataPush/GetRequestDetail",
    DeleteRequestFee: "/api/DataPush/DeleteRequestFee",
    RefreshRequestList: "/api/DataPush/RefreshRequestList",
    GetRequestProcess: "/api/DataPush/GetRequestProcess",
    GetRequestProcessing: "/api/DataPush/GetRequestProcessing",
    GetRequestDraft: "/api/DataPush/GetRequestDraft",
    GetRequestFinished: "/api/DataPush/GetRequestFinished",
    GetRequestInfo: "/api/DataPush/GetRequestInfo",
    DelRequestDraft: "/api/DataPush/DelRequestDraft",
    GetFileList: "/api/DataPush/GetFileList",
    SaveRequestDetail: "/api/DataPush/SaveRequestDetail",
    AcFlowSave: "/api/DataPush/AcFlowSave",
    AcFlowSubmit: "/api/DataPush/AcFlowSubmit",
    ExistsRequestNo: "/api/DataPush/ExistsRequestNo", 
    UploadFileList: "/api/DataPush/UploadFileList",
    //#endregion

    //#region 信息对比接口地址
    // 获取单个企业案件信息
    GetEnterPriseCaseInfoById: "/api/DataPush/GetEnterPriseCaseInfoById",
    UpdateUDFlow: "/api/DataPush/UpdateUDFlow",
    GetEnterPriseCaseList: "/api/DataPush/GetEnterPriseCaseList",
    BatchUpdateUDFlow: "/api/DataPush/BatchUpdateUDFlow",
    GetUDFlowDraft: "/api/DataPush/GetUDFlowDraft",//获取信息协管草稿
    GetUDFlowEnterprise: "/api/DataPush/GetUDFlowEnterprise",// 获取信息协管待办理
    GetUDFlowProcessing: "/api/DataPush/GetUDFlowProcessing",// 获取信息协管处理中
    GetUDFlowFinish: "/api/DataPush/GetUDFlowFinish",// 获取信息协管已完成
    DelUDDraft: "/api/DataPush/DelUDDraft",// 删除信息协管草稿

    //#endregion

    //#region  文件交互接口
    // cpc通知书接口
    GetCPCList: "/api/DataPush/GetCPCList",
    GetCPCFinishOrDraftList: "/api/DataPush/GetCPCFinishOrDraftList",
    GetCPCNoticeDetail: "/api/DataPush/GetCPCNoticeDetail",
    GetCPCFileList: "/api/DataPush/GetCPCFileList",
    // 待导入文件详情
    SearchIPR: "/api/DataPush/SearchIPR",
    GetNoticeDetail: "/api/DataPush/GetNoticeDetail",
    DeleteNoticeFee: "/api/DataPush/DeleteNoticeFee",
    LoadSearchCase: "/api/DataPush/LoadSearchCase",
    SaveNoticeInfo: "/api/DataPush/SaveNoticeInfo",

    GetNoticefee: "/api/DataPush/GetNoticefee",
    GetNoticehebo: "/api/DataPush/GetNoticehebo",
    GetNoticeduibi: "/api/DataPush/GetNoticeduibi",
    GetFileRule: "/api/DataPush/GetFileRule",
    GetAllAgent: "/api/DataPush/GetAllAgent",
    PostFile: "/api/DataPush/PostFile2",

    GetNoticeFeeType: "/api/DataPush/GetNoticeFeeType",
    SaveNoticeFee: "/api/DataPush/SaveNoticeFee",
    GetUserRoleCode: "/api/DataPush/GetUserRoleCode",
    DeleteForm: "/api/DataPush/DeleteForm",
    UploadPoAInfoWithPostData: "/api/DataPush/UploadPoAInfoWithPostData",
    DelFM: "/api/DataPush/DelFM",
    DelFile: "/api/DataPush/DelFile",
    UpdateFileStatus: "/api/DataPush/UpdateFileStatus",
    GetUrl: "/api/DataPush/GetUrl",
    GetUserId: "/api/DataPush/GetUserId",
    GetFlowHistory: "/api/DataPush/GetFlowHistory", 
    ShowUserInfo: "/api/DataPush/ShowUserInfo",
    //#endregion

    //#region 待办接口
    GetProcess: "/api/DataPush/GetProcess",
    GetProcessByType: "/api/DataPush/GetProcessByType",
    GetProcessByTypeUsr: "/api/DataPush/GetProcessByTypeUsr",
    GetFormByType: "/api/DataPush/GetFormByType",
    //#endregion

    //#regin 核稿相关-新
    GetCaseProc: "/api/DataPush/GetCaseProcInfoListByCaseVolume",
    BatchGetEFlowInfoAndFile: "/api/DataPush/BatchGetEFlowInfoAndFile",
    //#endregin
};


