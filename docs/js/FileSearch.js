var FileManager = {};
FileManager.file_id = "";
FileManager.proc_id = "";
FileManager.FileReceiveInfo;
FileManager.ApplyType = []; /*2015-12-21 增加,用来联动处理事项*/
FileManager.BussesType = [];
FileManager.DownLoadFileName = [];
FileManager.isSecrecy = false;
FileManager.IsZBSD = false;
FileManager.isKLFD202507 = false;
FileManager.isZY = false;
FileManager.HKDZ2601 = false;
var FileList = {};
$(document).ready(function () {

    $('#table_element').find('tr:gt(13)').show();
    if (!GetPublishConfig('ZhongYi', '2023_0')) {
        $(".zy_2023_0").remove();
    }
    FileManager.HKDZ2601 = GetPublishConfig('HKDZ', '202601');
    if (GetPublishConfig('PaiTeEn', 'SheWai')) {
        $("#btn_CheckAllFile").show();
        $("#pte_post").text("发文日");
        $("#payment_review_user_id").TreeUser({ tree_id: $("#payment_review_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#pat_production_user_id").TreeUser({ tree_id: $("#pat_production_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#pat_patauditor_user_id").TreeUser({ tree_id: $("#pat_patauditor_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#pat_allocator_user_id").TreeUser({ tree_id: $("#pat_allocator_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
    }
    else
    {
        $(".PTE").hide();
        $("#btn_CheckAllFile").hide();
    }

    if (!GetPublishConfig('KLFD', '202507')) {
        $(".KLFD-202507").hide();
    }

    if (!FileManager.HKDZ2601) {
        $(".HKDZ2601").hide();
    }

    if (GetPublishConfig('Eflow', 'ZhongYiEflowFile')) {
        FileManager.isZY = true;
    }

    if(GetPublishConfig('ZBSD', 'update_file') && (PageAuth.indexOf("update_file") > -1 || PageAuth.indexOf("edit_file") > -1)) {
        $("#btn_update_file").show();
        FileManager.IsZBSD = true;
    } else {
        $("#btn_update_file").hide();
    }
    

    var language = top.window.GLanguage;
    $('#customername').autoSearchText({ id: 'customer_id', width: '287px', minwidth: '287px', itemHeight: 400, minChar: 1, datafn: LoadAutoCustomer });
    // $("#filetype").TreeUser({ tree_id: "Treefiletype", SelectType: "checkbox", data: LoadFileType(true), showIcon: false, height: 400, width: 420, pcheck: true });
    $("#upuser").TreeUser({ tree_id: "upuserTree", SelectType: "radio", data: LoadTreeUser(), width: '300', height: 300 });
    $("#sales").TreeUser({ tree_id: "salesTree", SelectType: "checkbox", data: LoadTreeUser(), width: '300', height: 300 });
    $("#pic_user").TreeUser({ tree_id: $("#pic_user").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#foreign_pic").TreeUser({ tree_id: $("#foreign_pic").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#user_assistant").TreeUser({ tree_id: $("#user_assistant").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#sales_help").TreeUser({ tree_id: $("#sales_help").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
    $("#customer_flow_user").TreeUser({ tree_id: "customer_flow_user_tree", SelectType: "checkbox", data: LoadTreeUser(), width: '300', height: 300 });
    $("#sale_dept_id").TreeUser({ tree_id: "sale_dept", data: LoadDeptTree(), SelectType: "checkbox", height: 300, width: 320 });
    $("#agency_user_id").TreeUser({ tree_id: "agency_user_idTree", SelectType: "radio", data: LoadTreeUser(), width: '300', height: 300 });
    $("#revise_user_id").TreeUser({ tree_id: $("#revise_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
    $("#btn_Search").bind("click", function () { FileManager.SearchFile(false) })
    $("#btn_update_file").bind("click", FileManager.ReplaceAllFile);
    $("#btn_Down").bind("click", FileManager.DownFile);
    $("#btn_Export").bind("click", FileManager.ExportExcel);
    $("#btn_ExportFile").bind("click", FileManager.ExportFileListByChecked);
    $("#btn_Reset").bind("click", FileManager.ReSet);
    $("#btn_EditAllFileReceive").bind("click", FileManager.ShowAllEditFileReceiveInfo);
    $("#btn_CheckAllFile").bind("click", FileManager.BatchCheckAllFile);
    $("#a_mailcm").bind("click", FileManager.ShowMailCustomer); //发文客户
    $("#btn_template").bind("click", FileManager.SelectTemplate);
    $("#btn_Ozip").bind("click", function () { FileManager.DownFile('Ozip'); });
    $("#btn_AuthorizeFile").bind("click", FileManager.AuthorizeFiles);
    $("#btn_SendSMS").bind("click", FileManager.SendSms);
    $("#filetips").bind("click", FileManager.FileSourceTips);
    $("#saveFile").bind("click", FileManager.SaveFile);
    $("#saveFileZip").bind("click", FileManager.saveFileZip);
    $("#del_filetemp").bind("click", FileManager.DelTemp);
    $("#del_zipfiletemp").bind("click", FileManager.DelZipTemp);

    $('#p_case_info__charge_dept_id').TreeUser({ tree_id: "charge_dept_tree", SelectType: "checkbox", data: LoadDeptTree(), width: 260, height: 210, onCheck: function () { FileManager.GetBranchDept(); }, fullpath: true, pcheck: true, only_leaf: false });

    /*var sheet = JClient.Object.FileList;
    sheet = sheet ? sheet : (new JClient.UI.Sheet("FileList"));*/
    //$('#table_element').find('tr:gt(11)').hide();
    $('#btn_more').on('click', function () {
        var $rows = $(this).closest('tr').nextAll('tr');

        // 如果后面还有可见行 → 说明当前是展开状态，执行隐藏
        if ($rows.filter(':visible').length > 0) {
            $rows.filter(':visible').hide().addClass('js-toggle-hide');
        }
        // 否则说明是收起状态 → 只恢复我们刚才标记的行
        else {
            $rows.filter('.js-toggle-hide').show().removeClass('js-toggle-hide');
        }
    });
    $("#is_accurate").bind('change', function () {
        if (this.checked) {
            $("#blur").show();
            $("#accurate").hide();
        }
        else {
            $("#accurate").show();
            $("#blur").hide();
        }
    });
    $("#is_accurate").attr("checked", true);
    $("#blur").show();
    $("#accurate").hide();
    $("#is_case").toggle(function () { $("tr[name='case']").show('slow'); $("#is_case>td>a").attr('class', 'img_show'); }, function () { $("tr[name='case']").hide('slow'); $("#is_case>td>a").attr('class', 'img_hide'); });
    $("#is_file").toggle(
        function () {
            $("tr[name='file']").show('slow');
            $("#is_file>td>a").attr('class', 'img_show');

            if (!GetPublishConfig('PaiTeEn', 'SheWai')) {
                $(".PTE").hide();
            }

            if (!GetPublishConfig('KLFD', '202504')) {
                $(".KLFD-202507").hide();
            }
            if (!FileManager.HKDZ2601) {
                $(".HKDZ2601").hide();
            }
        },
        function () {
            $("tr[name='file']").hide('slow');
            $("#is_file>td>a").attr('class', 'img_hide');
        }
    );

    $('input[ctrl_type=ctrl_date]').bind("change", function () {
        var obj_name = this.id.replace("_isnull", "");
        if (this.checked) {
            $("#" + obj_name + "_s").val("").attr("disabled", "disabled");
            $("#" + obj_name + "_e").val("").attr("disabled", "disabled");
        }
        else {
            $("#" + obj_name + "_s").val("").removeAttr("disabled");
            $("#" + obj_name + "_e").val("").removeAttr("disabled");
        }
    });


    if (GetPublishConfig("CustomerInfo", "zhizhuwang"))//获取是否有知助网,有则把授权文件 按钮放出
    {
        $("#btn_AuthorizeFile").show();
    }
    if (GetPublishConfig("JIAQUAN", "202305"))//获取是否有知助网,有则把授权文件 按钮放出
    {
        FileManager.JIAQUAN = true;
        $(".JIAQUAN").show();
    }
    if (GetPublishConfig("CZLS", "202401")) {
        $("#btn_BatchDel").show();
        $("#btn_BatchDel").bind("click", FileManager.BatchDel);
    }

    if (GetPublishConfig("Common", "isSecrecy")) {
        $("#a_mailcm").hide();
        $(".isSecrecy").remove();
    }

    if (GetPublishConfig("BJSH","202502")) {
        $("#btn_BatchUpdatePublishDate").show();
        $("#btn_BatchUpdatePublishDate").bind("click", FileManager.OpenUpdatePublishDateDialog);
    }



    if (GetPublishConfig('ZBSD', 'is_show_column')) {
        if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
            $(".ZBSD").show();
        } else {
            $(".ZBSD").hide();
        }
    }


    if (GetPublishConfig("ZTDZ", "20241118")) {
        $(".ZTDZ_1118").show();
        $("#case_flow_user").TreeUser({ tree_id: "case_flow_user_tree", SelectType: "checkbox", data: LoadTreeUser(), width: '300', height: 300 });
    }

    if (GetPublishConfig("XZDZ","202505")) {
        $(".XZDZ").show();
        $("#a_mailcm_new").bind("click", FileManager.ShowMailCustomerNew);
    }

    if (GetPublishConfig("KLFD", "202507")) {
        FileManager.isKLFD202507 = true;
    }

    function callBack(_Meta) {
        if (_Meta.fieldColumn) {
            FileManager.fieldColumn = _Meta.fieldColumn;
            for (var i = 0; i < _Meta.fieldColumn.length; i++) {
                if (_Meta.fieldColumn[i].column_name) {
                    $("#table_element").find(".field_column td span").eq(i).html(_Meta.fieldColumn[i].column_name);
                   
                }
            }
        }
    }
    Ajax.Request('PatentAction.ashx', { Call: 'GetFieldColumn' }, callBack, true);


    function Success(_Meta) {
        if (_Meta) {
            /*案件流向*/
            //if (_Meta.Case_direction) {
            //    var _Case_direction = ' <option value="">' + GetResource('S140814203438556', '请选择') + '</option>';
            //    for (var i = 0; i < _Meta.Case_direction.length; i++) {
            //        var row = _Meta.Case_direction[i];
            //        _Case_direction += "<option value='" + row.value + "'   >" + row['text_' + language] + "</option>";
            //    }
            //    $("#flow_direction").append(_Case_direction);

            //}
            if (_Meta.Case_direction) {
                var DirectionType = new Array();
                for (var i = 0; i < _Meta.Case_direction.length; i++) {
                    var row = _Meta.Case_direction[i];
                    var obj = { "id": row.value, "name": row["text_" + language] };
                    DirectionType.push(obj);
                }
            }

            $("#flow_direction").TreeUser({
                tree_id: $("#flow_direction").attr("tree_id"),
                SelectType: "checkbox",
                data: DirectionType,
                showIcon: false,
                search: false,
                width: 220,
                height: 100
            });
            /*文件处理状态*/
            if (_Meta.FileStatus) {
                var _file_status = '<option value="">' + GetResource('S140814203438556', '请选择') + '</option>';
                for (var i = 0; i < _Meta.FileStatus.length; i++) {
                    var row = _Meta.FileStatus[i];
                    _file_status += "<option value='" + row.value + "'   >" + row['text_' + language] + "</option>";
                }
                $("#selfile_status").append(_file_status);
            }
            /*处理事项状态*/
            if (_Meta.ProcStatus) {
                var procStatus = [];
                procStatus.push("<option value=''>--" + GetResource('S140814203438556', '请选择') + "--</option>");
                for (var i = 0; i < _Meta.ProcStatus.length; i++) {
                    var row = _Meta.ProcStatus[i];
                    procStatus.push("<option value='" + row.value + "' code='" + row.status_code + "' >" + row["text_" + language] + "</option>");
                }
                $("#proc_status").html(procStatus.join()).val('');
            }
            /*配置下载文件命名为后台获取*/
            if (_Meta.DownLoadFileName) {
                var downloadfilename = [];
                downloadfilename.push("<option value=''>--" + GetResource('S140814203438556', '请选择') + "--</option>");
                for (var i = 0; i < _Meta.DownLoadFileName.length; i++) {
                    var row = _Meta.DownLoadFileName[i];
                    FileManager.DownLoadFileName.push(row);
                    downloadfilename.push("<option value='" + row.value + "'  >" + row["text_" + language] + "</option>");
                }
                $("#selfilename1").html(downloadfilename.join()).val('');
                $("#selzipfilename1").html(downloadfilename.join()).val('');
            }
            var selfilePathString = " <option value=''>" + GetResource('S140814203438556', '请选择') + "</option>";
            selfilePathString += "<option value='case_name'>" + GetResource('S140814204116996', '案件名称') + "</option>";
            selfilePathString += "<option value='case_volume_customer'>" + GetResource('S140901115322880', '客户文号') + "</option>";
            selfilePathString += "<option value='case_volume'>" + GetResource('S140901115304706', '我方文号') + "</option>";
            selfilePathString += "<option value='app_no'>" + GetResource('S140822170832920', '申请号') + "</option>";
            selfilePathString += "<option value='file_desc'>" + GetResource('S140929102908220', '文件描述') + "</option>";
            selfilePathString += "<option value='post_date'>" + GetResource('S150806213511698', '官方发文日') + "</option>";
            selfilePathString += "<option value='apply_type'>" + GetResource('S140821164234972', '申请类型') + "</option>";
            selfilePathString += "<option value='apply_name'>" + GetResource('S140905195017714', '提案名称') + "</option>";
            selfilePathString += "<option value='upload_time'>" + GetResource('S140816152026549', '上传时间') + "</option>";
            selfilePathString += "<option value='file_type'>" + GetResource('S140903173153758', '文件类型') + "</option>";
            selfilePathString += "<option value='ctrl_proc_name'>" + GetResource('S140821164247623', '处理事项') + "</option>";
            selfilePathString += "<option value='customer_name'>" + GetResource('S140821182822919', '客户名称') + "</option>";
            selfilePathString += "<option value='inverters'>" + GetResource('S170511155357493', '第一发明人') + "</option>";
			selfilePathString += "<option value='applicants'>" + GetResource('S140814212259786', '申请人') + "</option>";
			selfilePathString += "<option value='file_name'>" + GetResource('S140912142011888', '附件名称') + "</option>";
			selfilePathString += "<option value='legal_due_date'>" + GetResource('S140929103018129', '官方期限') + "</option>";
			selfilePathString += "<option value='case_status'>" + GetResource('S140822171057018', '案件状态') + "</option>";
            selfilePathString += "<option value='first_applicant'>" + GetResource('S150810163725508', '第一申请人') + "</option>";


            $("#selfilePath").append(selfilePathString);
            var ofileTypestring = "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>"
                + "<option value='ALL_file'>" + GetResource('S200805161639268', '全部官方来文') + "</option>"
                + "<option value='CN_file'>" + GetResource('S200805161646062', '中国官方来文') + "</option>"
                + "<option value='US_file'>" + GetResource('S200805161653250', '美国官方来文') + "</option>"
                + "<option value='PCT_file'>" + GetResource('S200805161659499', 'PCT官方来文') + "</option>"
                + "<option value='OTHER_file'>" + GetResource('S200805161708423', '其他官方来文') + "</option>";

            $("#ofileType").append(ofileTypestring);

            /*文件来源 */
            var selfileclassData = [];
            var selfileclassValue = [];
            var selfileclassText = [];
            var str = GetResource('S170705162423998', '所有文件（不含官方来文zip及分析纸件通知书）');
            var str1 = GetResource('S160116152138437', '官方来文zip');
            var str2 = GetResource('S170705162457974', '分析纸件通知书(递交助手)');
            var str3 = GetResource('S170705162523207', '官方来文(CPC文件)');
            var str4 = GetResource('S170726151607683', '其他官方来文(非CPC文件)');
            var val = "general";
            var val1 = ".zip";
            var val2 = "paper";
            var val3 = "cpc";
            var val4 = "cpnoc";
            selfileclassText.push(str);
            selfileclassText.push(str1);
            selfileclassText.push(str2);
            selfileclassText.push(str3);
            selfileclassText.push(str4);
            selfileclassValue.push(val);
            selfileclassValue.push(val1);
            selfileclassValue.push(val2);
            selfileclassValue.push(val3);
            selfileclassValue.push(val4);
            for (var i = 0; i < selfileclassText.length; i++) {
                selfileclassData.push({ 'id': selfileclassValue[i], 'name': selfileclassText[i], 'TreeType': '' });
            }
            $('#selfileclass').TreeUser({ tree_id: "selfileclass_tree", SelectType: "checkbox", data: selfileclassData, width: 360, height: 160, onCheck: null, fullpath: true });
            $("#selfileclass").attr("objid", "general").val(str);

            /*所属分部*/
            var BranchList = GetDeptBranch();
            var BranchValue = [];
            var branch_dept_ids = [];
            var branch_dept_names = [];

            if (typeof (BranchList) != 'undefined') {
                for (var i = 0; i < BranchList.length; i++) {
                    BranchValue.push({ 'id': BranchList[i].dept_id, 'name': BranchList[i].dept_name, 'TreeType': '' });

                }
            }
            $('#branch_dept_id').TreeUser({ tree_id: "branch_dept_tree", SelectType: "checkbox", data: BranchValue, width: 220, height: 210, onCheck: null, fullpath: true, search: false, showIcon: false });
            // $('#branch_dept_id').attr("objid", branch_dept_ids.join(",")).val(branch_dept_names.join(","));
            //if (_Meta.CaseBranchDept) {
            //    var _CaseBranchDept = "<option value=''>ALL</option>";
            //    for (var i = 0; i < _Meta.CaseBranchDept.length; i++) {
            //        var row = _Meta.CaseBranchDept[i];
            //        _CaseBranchDept += "<option value='" + row.dept_id + "'   >" + row.dept_name + "</option>";
            //    }
            //    $("#branch_dept_id").append(_CaseBranchDept);
            //}

        }
    }
    Ajax.Request('CaseInfo.ashx', { Call: 'GetFlowdirection' }, Success);

    function GetCustomerStatus(_Meta) {

        var CustomerStatus = [];
        var CsOption = new Array();
        //var opt_customer_status = ' <option value="">' + GetResource('S140814203438556', '请选择') + '</option>';
        if (_Meta.customer_status) {
            for (var i = 0; i < _Meta.customer_status.length; i++) {
                var row = _Meta.customer_status[i];
                // opt_customer_status += "<option value='" + row.customer_status_id + "'   >" + row.customer_status + "</option>";

                CustomerStatus.push({ 'id': row.customer_status_id, 'name': row.customer_status, 'TreeType': '' })
            }
        }
        if (_Meta.CaseStatus) {
            FileManager.CaseStatus = _Meta.CaseStatus;
            for (var i = 0; i < FileManager.CaseStatus.length; i++) {
                var row = FileManager.CaseStatus[i];
                if ((row.status_class == "ALL" || row.status_class == "CASE") && row.case_type_id == $("#case_type").val()) {
                    var obj = {};
                    obj.id = row.case_status_id;
                    obj.name = row.case_status;
                    CsOption.push(obj);
                }
            }
        }
        var BTOption = new Array();
        FileManager.BussType = _Meta.BussType;
        for (var i = 0; i < FileManager.BussType.length; i++) {
            var row = FileManager.BussType[i];
            var obj = {};
            obj.id = row.business_type_id;
            obj.name = row.bussType;
            BTOption.push(obj);
        }
        $("#business_type").TreeUser({ tree_id: "business_type_tree", SelectType: "checkbox", data: BTOption, showIcon: false, width: 300, search: true, height: 350 })

        //$("#customer_status_id").append(opt_customer_status);
        $("#case_status").TreeUser({ tree_id: $("#case_status").attr("tree_id"), SelectType: "checkbox", data: CsOption, showIcon: false, width: 300, search: true, height: 350 });
        $("#customer_status_id").TreeUser({ tree_id: "customer_status_id_tree", SelectType: "checkbox", data: CustomerStatus, showIcon: false, width: 300, search: true, height: 350 });
    }
    Ajax.Request('CaseInfo.ashx', { Call: 'IPGetBasicData' }, GetCustomerStatus);

    function tempsuc(_Meta) {
        FileManager.LoadTempList(_Meta.TempNameList);
        FileManager.TempNameList = _Meta.TempNameList;
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'GetFileTempNameList' }, tempsuc);
    Ajax.Request('BaseInfo.ashx', { Call: 'GetFileTempZipNameList' }, function (_Meta) {
        var html = "<option value=''>" + GetResource('S200829225445828', '请选择压缩包名称模板') + "</option>";
        if (_Meta.TempNameList) {
            for (var i = 0; i < _Meta.TempNameList.length; i++) {
                var row = _Meta.TempNameList[i];
                html += "<option value='" + row["id"] + "'>" + row["temp_name"] + "</option>"
            }
            $("#zipfiletemp").html(html);
        }
        FileManager.TempZipNameList = _Meta.TempNameList;
    });

    FileManager.Initalization();
    FileManager.LoadAgency();

    QueryHistory.InitPage("FileSearch", "table_element");

    layui.use('table', function () {
        FileList.table = layui.table;
        FileList.form = layui.form;
        FileManager.SearchFile(true);
        FileList.form.on('checkbox(layTableAllChoose)', function (data) {            
            var child = $("#FileList").next().find('.layui-table').find('tbody input[type="checkbox"]');
            var tableData = layui.table.cache.searchID;
            if (data.elem.checked) {
                child.each(function (index, item) {
                    if (typeof ($(this).attr("disabled")) == "undefined") {
                        item.checked = data.elem.checked;
                        FileList.table.cache["FileList"][index].LAY_CHECKED = true;
                    } else {
                        item.checked = false;
                        FileList.table.cache["FileList"][index].LAY_CHECKED = false;
                    }
                });
            } else {
                child.each(function (index, item) {
                    item.checked = data.elem.checked;
                    FileList.table.cache["FileList"][index].LAY_CHECKED = false;
                });
            }
            FileList.form.render('checkbox');
        });
    });
});

function getSelectedPkids() {
    var checkboxes = document.querySelectorAll('input[name="layTableCheckbox"]:checked');
    var pkids = [];

    Array.prototype.forEach.call(checkboxes, function (checkbox) {
        var tr = checkbox.closest('tr');
        pkids.push(tr.getAttribute('pkid'));
    });

    return pkids;
}

FileManager.OpenUpdatePublishDateDialog = function () {
    var _file_ids = getSelectedPkids()
    if (_file_ids.length === 0) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S200511112239594', '请选择需要处理的文件！'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }
    var Dialog = function () {
        var html = `<div><span>发文日：</span><input type="text" class="Wdate" autocomplete="off" onfocus = "WdatePicker();" onkeyup='return $.CheckNumber(event, this);'/></div>`;
        $.dialog({
            title: GetResource('S250303171244679', '批量修改发文日'),
            content: html, lock: true, width: 250,
            min: false, resize: true, max: false,
            focus: true, id: 'UpdatePublishDate'
            , button: [
                {
                    name: Boxsetting.yes, callback: function () {
                        return CallBack && CallBack.call(this, input);
                    }, focus: true
                },
                {
                    name: Boxsetting.no, callback: null, focus: false
                }
            ]
            , init: function () {
                input = this.DOM.content[0].getElementsByTagName('input')[0];
                //input.focus();
            }
        });
    }
    Dialog();

    function CallBack(input) {
        var post_date = input.value.trim();
        var Success = function (_Meta) {
            if (!_Meta.ClientInfo.Result) {
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S160615113228391', '修改失败！'), null, { icon: 'fail.gif' });
            } else {
                Box.Tips(GRESX.HINTS.TITLE, 2, GetResource('S150506145242936', '修改成功！'), null, { icon: 'succ.gif', width: '150' });
                setInterval(FileManager.SearchFile(), 1000);
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "BatchUpdatePublishDate", file_ids: _file_ids.join(";"), post_date: post_date }, Success);
    }
}

FileManager.DelTemp = function () {
    var temp_id = $("#filetemp").val();
    function Success(_Meta) {
        if (_Meta && _Meta.ClientInfo.Result) {
            FileManager.LoadTempList(_Meta.TempNameList);
            FileManager.TempNameList = _Meta.TempNameList;
        } else {
            Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'fail.gif', width: '250', height: '60' });
        }
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'DeleteTemp', temp_id: temp_id }, Success);
}

FileManager.selectTemp = function () {
    var new_count = $("#tdfilename").find('select').length;
    for (var c = 0; c < new_count; c++) {
        if (c == 0) {
            $("#selfilename1").val("");
            $("#txtfilename1").val("").attr("style", "width: 120px;display: none;");
            continue;
        }
        $("#selfilename" + (c + 1)).remove();
        $("#txtfilename" + (c + 1)).remove();
        $(".img_show").remove();
    }
    var id = $("#filetemp").val();
    var new_filename = "";  //case_name;file_type;-;file_name
    var file_name_type = ""; //colname;colname;txt;colname
    if (FileManager.TempNameList) {
        for (var i = 0; i < FileManager.TempNameList.length; i++) {
            var row = FileManager.TempNameList[i];
            if (id == row["id"]) {
                new_filename = row["new_filename"];  //case_name;file_type;-;file_name
                file_name_type = row["file_name_type"]; //colname;colname;txt;colname
                break;
            }
        }
        var new_filenames = new_filename.split(";");
        var file_name_types = file_name_type.split(";");

        if (new_filenames.length > 0 && file_name_types.length > 0) {
            for (var j = 0; j < file_name_types.length; j++) {
                if (j == 0) {
                    if (file_name_types[j] == "colname") {
                        $("#selfilename1").val(new_filenames[j]);
                    } else if (file_name_types[j] == "txt") {  //固定字符fixtxt
                        $("#selfilename1").val("fixtxt");
                        $("#txtfilename1").val(new_filenames[j]).attr("style", "width: 120px;");
                    }
                } else {
                    if (FileManager.DownLoadFileName.length > 0) {
                        var option = [];
                        for (var t = 0; t < FileManager.DownLoadFileName.length; t++) {
                            var row = FileManager.DownLoadFileName[t];
                            option.push("<option value='" + row.value + "'  >" + row["text_" + top.window.GLanguage] + "</option>");
                        }

                    }
                    var _del = "<span title='删除' style='cursor:pointer;' class='img_show' onclick=\"FileManager.DelSubject(this,'selfilename" + (j + 1) + "','txtfilename" + (j + 1) + "')\">&nbsp;</span>";
                    var _sel = "<select id='selfilename" + (j + 1) + "' onchange=\" FileManager.filenameChange('selfilename" + (j + 1) + "','txtfilename" + (j + 1) + "')\"   class='select_auto' style='width: 120px; margin:4px;'> " +
                        "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>" + option.join("")
                        + "</select><input type='text' id='txtfilename" + (j + 1) + "' class='input_auto' style='width: 120px;display: none;' />";

                    $("#tdfilename").find("a[class='img_hide']").before(_del + _sel);

                    if (file_name_types[j] == "colname") {
                        $("#selfilename" + (j + 1)).val(new_filenames[j]);
                    } else if (file_name_types[j] == "txt") {  //固定字符fixtxt
                        $("#selfilename" + (j + 1)).val("fixtxt");
                        $("#txtfilename" + (j + 1)).attr("style", "width: 120px;").val(new_filenames[j]);
                    }
                }
            }
        }
    }
}

FileManager.selectZipTemp = function () {
    //if (FileManager.TempZipNameList) {
    //    for (var i = 0; i < FileManager.TempZipNameList.length; i++) {
    //        var row = FileManager.TempZipNameList[i];
    //        if ($("#zipfiletemp").val() == row["id"]) {
    //            $("#ziptempName").val(row["temp_name"]);
    //            $("#zip_name").val(row["new_filename"]);
    //            break;
    //        }
    //    }
    //    if (i == FileManager.TempZipNameList.length) {
    //        $("#ziptempName").val('');
    //        $("#zip_name").val('');
    //    }
    //}
    var new_count = $("#tdzipfilename").find('select').length;
    for (var c = 0; c < new_count; c++) {
        if (c == 0) {
            $("#selzipfilename1").val("");
            $("#txtzipfilename1").val("").attr("style", "width: 120px;display: none;");
            continue;
        }
        $("#selzipfilename" + (c + 1)).remove();
        $("#txtzipfilename" + (c + 1)).remove();
        $(".img_show").remove();
    }
    var id = $("#zipfiletemp").val();
    var new_filename = "";
    var file_name_type = "";
    if (FileManager.TempZipNameList) {
        for (var i = 0; i < FileManager.TempZipNameList.length; i++) {
            var row = FileManager.TempZipNameList[i];
            if (id == row["id"]) {
                new_filename = row["new_filename"]; 
                file_name_type = row["file_name_type"];
                break;
            }
        }
        var new_filenames = new_filename.split(";");
        var file_name_types = file_name_type.split(";");

        if (new_filenames.length > 0 && file_name_types.length > 0) {
            for (var j = 0; j < file_name_types.length; j++) {
                if (j == 0) {
                    if (file_name_types[j] == "colname") {
                        $("#selzipfilename1").val(new_filenames[j]);
                    } else if (file_name_types[j] == "txt") {  //固定字符fixtxt
                        $("#selzipfilename1").val("fixtxt");
                        $("#txtzipfilename1").val(new_filenames[j]).attr("style", "width: 120px;");
                    }
                } else {
                    if (FileManager.DownLoadFileName.length > 0) {
                        var option = [];
                        for (var t = 0; t < FileManager.DownLoadFileName.length; t++) {
                            var row = FileManager.DownLoadFileName[t];
                            option.push("<option value='" + row.value + "'  >" + row["text_" + top.window.GLanguage] + "</option>");
                        }

                    }
                    var _del = "<span title='删除'  style='cursor:pointer;' class='img_show' onclick=\"FileManager.DelSubject(this,'selzipfilename" + (j + 1) + "','txtzipfilename" + (j + 1) + "')\">&nbsp;</span>";
                    var _sel = "<select id='selzipfilename" + (j + 1) + "' onchange=\" FileManager.zipfilenameChange('selzipfilename" + (j + 1) + "','txtzipfilename" + (j + 1) + "')\"   class='select_auto' style='width: 120px; margin:4px;'> " +
                        "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>" + option.join("")
                        + "</select><input type='text' id='txtzipfilename" + (j + 1) + "' class='input_auto' style='width: 120px;display: none;' />";
                    $("#tdzipfilename").find("a[class='img_hide']").before(_del + _sel);

                    if (file_name_types[j] == "colname") {
                        $("#selzipfilename" + (j + 1)).val(new_filenames[j]);
                    } else if (file_name_types[j] == "txt") {
                        $("#selzipfilename" + (j + 1)).val("fixtxt");
                        $("#txtzipfilename" + (j + 1)).attr("style", "width: 120px;").val(new_filenames[j]);
                    }
                }
            }
        }
    }

}
FileManager.saveFileZip = function () {
    var fnlength = $("#tdzipfilename select[class='select_auto']").length;
    var _newfilename = "";
    var file_name_type = "";
    for (var j = 1; j <= fnlength; j++) {
        if ($("#selzipfilename" + j).val() == 'fixtxt') {
            _newfilename += $("#txtzipfilename" + j).val() + ";";
            file_name_type += "txt" + ";";
        } else {
            if ($("#selzipfilename" + j).val()) {
                _newfilename += $("#selzipfilename" + j).val() + ";";
                file_name_type += "colname" + ";";
            }
        }
    }
    if (_newfilename) {
        _newfilename = _newfilename.substr(0, _newfilename.length - 1);
        file_name_type = file_name_type.substr(0, file_name_type.length - 1)
    }
    if (_newfilename == "") {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S200813134828072', '请配置下载文件名称'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }
    var temp_name = $("#ziptempName").val();
    if (!temp_name) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S200813134828072', '请填写模板名称'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }

    //保存下载名称
    function Success(_Meta) {
        if (_Meta.ClientInfo.Result) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715173738678', '保存成功'), null, { icon: 'succ.gif', width: '250', height: '60' });
            FileManager.LoadZipTempList(_Meta.TempNameList);
            FileManager.TempZipNameList = _Meta.TempNameList;
        }
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'SaveFileTepmNameZip', new_filename: _newfilename, temp_name: temp_name, file_name_type: file_name_type }, Success);
}
FileManager.SaveFile = function () {
    var fnlength = $("#tdfilename select[class='select_auto']").length;
    var _newfilename = "";
    var file_name_type = "";
    for (var j = 1; j <= fnlength; j++) {
        if ($("#selfilename" + j).val() == 'fixtxt') {
            _newfilename += $("#txtfilename" + j).val() + ";";
            file_name_type += "txt" + ";";
        } else {
            if ($("#selfilename" + j).val()) {
                _newfilename += $("#selfilename" + j).val() + ";";
                file_name_type += "colname" + ";";
            }
        }

    }
    if (_newfilename) {
        _newfilename = _newfilename.substr(0, _newfilename.length - 1);
        file_name_type = file_name_type.substr(0, file_name_type.length - 1)
    }

    if (_newfilename == "") {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S200813134828072', '请配置下载文件名称'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }

    var temp_name = $("#tempName").val();

    if (!temp_name) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S200813134828072', '请填写模板名称'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }

    //保存下载名称
    function Success(_Meta) {
        if (_Meta.ClientInfo.Result) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715173738678', '保存成功'), null, { icon: 'succ.gif', width: '250', height: '60' });
            FileManager.LoadTempList(_Meta.TempNameList);
            FileManager.TempNameList = _Meta.TempNameList;
        }
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'SaveFileTepmName', new_filename: _newfilename, temp_name: temp_name, file_name_type: file_name_type }, Success);
}


FileManager.LoadTempList = function (TempNameList) {
    var html = "<option value=''>" + GetResource('S200829225445828', '请选择文件名称模板') + "</option>";
    if (TempNameList) {
        for (var i = 0; i < TempNameList.length; i++) {
            var row = TempNameList[i];
            html += "<option value='" + row["id"] + "'>" + row["temp_name"] + "</option>"
        }
        $("#filetemp").html(html);
    }
}
FileManager.LoadZipTempList = function (TempNameList) {
    var html = "<option value=''>" + GetResource('S200829225445828', '请选择压缩包名称模板') + "</option>";
    if (TempNameList) {
        for (var i = 0; i < TempNameList.length; i++) {
            var row = TempNameList[i];
            html += "<option value='" + row["id"] + "'>" + row["temp_name"] + "</option>"
        }
        $("#zipfiletemp").html(html);
    }
}

FileManager.FileSourceTips = function () {
    var tips = "<strong>1.所有文件：</strong>指除了递交助手分析的官文ZIP包和递交助手分析的纸件除外的所有系统里的文件；</br>"
        + "<strong>2.官方来文zip：</strong>指通过递交助手分析的官文ZIP包;</br>"
        + "<strong>3.分析纸件通知书：</strong>指通过递交助手纸件分析导入的文件;</br>"
        + "<strong>4.官方来文（CPC文件）：</strong>指通过递交助手官文分析导入的PDF文件（注：手动在系统上传的不包含在内）;</br>"
        + "<strong>5.其他官方来文：</strong>指通过系统专利来文导入的文件";
    Box.Alert(GRESX.HINTS.TITLE, tips, null, { icon: 'question.gif', width: '350', height: '80' });
}

FileManager.LoadAgency = function () {
    //var _language = top.window.GLanguage;
    //var Success = function (_Meta) {
    //    if (_Meta.Agency) {
    //        var options = "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>";
    //        for (var i = 0; i < _Meta.Agency.length; i++) {
    //            options += "<option   value='" + _Meta.Agency[i].agency_id + "'>" + _Meta.Agency[i].agency_name_cn + "</option>";
    //        }
    //        $('#agency_id').append(options);

    //    }
    //}
    //Ajax.Request('Notice.ashx', { Call: 'GetAgency' }, Success, true);
    $("#agency_id").TreeUser({ tree_id: "agency_tree", data: LoadTreeAgent(), SelectType: "radio", height: 350, width: 320 });
}

///案件名称栏位
FileManager.StrucCaseName = function (case_id, case_volume, case_type_id, proc_id) {
    if (!$.trim(case_volume)) {
        case_volume = GetResource('S140901201934117', '无');
    }
    return "<a  href='javascript:void(0);' onclick=\"FileManager.OpenCase('" + case_id + "','" + case_volume + "','" + case_type_id + "','" + proc_id + "');\" >" + case_volume + "</a>";
}

FileManager.OpenCase = function (case_id, case_volume, case_type_id, proc_id) {
    var id = '', url = '', title_name = '';
    if (top.window._UserModel.RoleCode.toUpperCase().indexOf("IC") >= 0 || top.window._UserModel.RoleCode.toUpperCase().indexOf("ADMIN") >= 0) {//管理员、程序有权限
        id = 'IC' + case_id;
        title_name = GetResource('S140822114641256', '案件') + "-" + case_volume;
        url = "Forms/Patent/" + CaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
    }
    else {
        id = 'IP' + proc_id;
        if (!proc_id) {
            id = 'IP' + case_id;
        }
        title_name = CaseTypeURL[case_type_id]['Default'] + '-' + case_volume;
        url = "Forms/Patent/" + CaseTypeURL[case_type_id]["IPURL"] + "?Type=IP&objid=" + case_id + "&proc_id=" + proc_id + '&caseType_id=' + case_type_id;
    }
    top.window.AddBusinessTab(id, title_name, url);
}

FileManager.ReSet = function () {
    // 重置后登记号默认隐藏
    $(".pub_no_field").hide();
    var $_table = $('#table_element').find('input,select,textarea').val('');
    $("#customername,#filetype,#selfileclass,#pic_user,#foreign_pic,#case_status").attr("objid", "");
    $_table.find('input[type=checkbox]').attr("checked", false);
    $("#is_essence_exam").attr("checked", false);
    $("#is_ahead_pub").attr("checked", false);
    $("#is_confidential_request").attr("checked", false);
    $("#is_fee_reduce").attr("checked", false);
    $("#is_speed_checkd").attr("checked", false);
    $("#is_request_das").attr("checked", false);
    $("#hearing_the_case").attr("checked", false);
    // 清除延迟审查勾选
    $("#is_examine_delay").attr("checked", false);
    $("#flow_direction_treea_cancel").click();
    $("#customer_country_treea_cancel").click();


}

//初始化一些基本数据
FileManager.Initalization = function () {
    function Success(_Meta) {
        FileManager.ApplyType = _Meta.ApplyType; /*2015-12-21*/
        FileManager.BussesType = _Meta.BussType;
        if (_Meta.CaseType) {
            var options = "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>";
            for (var i = 0; i < _Meta.CaseType.length; i++) {
                options += "<option value='" + _Meta.CaseType[i].case_type_id + "' type_code='" + _Meta.CaseType[i].case_type_code + "' >" + _Meta.CaseType[i].case_type + "</option>";
            }
            $('#case_type').append(options).find('option[type_code=' + _Meta.CaseType[0].case_type_code +']').attr('selected', true).trigger('change', this);
        }

        var country = [];
        var language = top.window.GLanguage;
        if (_Meta.Country) {

            for (var i = 0; i < _Meta.Country.length; i++) {
                country.push({ id: _Meta.Country[i].value, name: _Meta.Country[i]['text_' + language] })
            }

        }
        $("#country").TreeUser({ tree_id: "Treecountry", SelectType: "checkbox", data: country, onCheck: function (treeNode, e, treeId) { FileManager.BindCtrlproc() }, showIcon: false, height: 300, width: 250, pcheck: true });

        $("#customer_country").TreeUser({ tree_id: "customer_country_tree", SelectType: "checkbox", data: country, width: 260, height: 210, onCheck: null, fullpath: true });

        if (_Meta.ApplyTags) {
            var dataapplytags = [];
            for (var i = 0; i < _Meta.ApplyTags.length; i++) {
                dataapplytags.push({ 'id': _Meta.ApplyTags[i].id, 'name': _Meta.ApplyTags[i].name, 'TreeType': '' });
            }
            $('#apply_tags_id').TreeUser({ tree_id: $("#apply_tags_id").attr("tree_id"), SelectType: "checkbox", data: dataapplytags, width: 287, height: 210, onCheck: null });
        }
        

    }
    Ajax.Request('CaseInfo.ashx', { Call: 'IPGetBasicData' }, Success);
}
//选择项时候触发/*2015-12-21*/
FileManager.ChangeCaseType = function (obj) {
    $("#filetype").TreeUser({ tree_id: "Treefiletype", SelectType: "checkbox", data: FileManager.LoadFileType(1, $(obj).val()), showIcon: false, height: 400, width: 420, pcheck: true });
    var apply_type = new Array();


    var value = $(obj).val();

    var CsOption = new Array();
    if (FileManager.CaseStatus) {
        for (var i = 0; i < FileManager.CaseStatus.length; i++) {
            var row = FileManager.CaseStatus[i];
            if ((row.status_class == "ALL" || row.status_class == "CASE") && row.case_type_id == value) {
                var obj = {};
                obj.id = row.case_status_id;
                obj.name = row.case_status;
                CsOption.push(obj);
            }
        }
    }
    $("#case_status").TreeUser({ tree_id: $("#case_status").attr("tree_id"), SelectType: "checkbox", data: CsOption, showIcon: false, width: 300, search: true, height: 350 });
    //var ApOption = "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>";
    if (FileManager.ApplyType) {
        for (var i = 0; i < FileManager.ApplyType.length; i++) {
            var row = FileManager.ApplyType[i];
            if (row.case_type_id == value) {
                //ApOption += "<option value='" + row.apply_type_id + "'>" + row.apply_type + "</option>";
                var obj = { "id": row.apply_type_id, "name": row.apply_type };
                apply_type.push(obj);

            }
        }
    }
    
    //$('#apply_type').html(ApOption);

    $("#apply_type").TreeUser({ tree_id: $("#apply_type").attr("tree_id"), SelectType: "checkbox", data: apply_type, showIcon: false, width: 300, search: true, height: 350 });

    var BsOption = "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>";
    if (FileManager.BussesType) {
        for (var i = 0; i < FileManager.BussesType.length; i++) {
            var row = FileManager.BussesType[i];
            if (row.case_type_id == value) {
                BsOption += "<option value='" + row.business_type_id + "'>" + row.bussType + "</option>";
            }
        }
    }
    $('#business_type').html(BsOption);
    //登记号字段：仅版权案件类型显示
    if (value == "ABD40742-04F9-455F-BC41-080E9D896F80") {   // 版权
        $(".pub_no_field").show();
    } else {
        $(".pub_no_field").hide();
        $("#pub_no").val('');      // 隐藏时清空，避免数据残留
    }
    FileManager.BindCtrlproc();
}


//加载一个文件类型数据源
FileManager.LoadFileType = function (_official, _case_type) {
    var FileType = null;
    function Success(_Meta) {
        FileType = null;
        FileType = _Meta.FileType;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadFileTypeByCaseType', official: 1, case_type: _case_type, file_type: '' }, Success, true);
    return FileType;
}




FileManager.isSortAction = false;
//查询
FileManager.SearchFile = function (IsFirst) {

    var _data = {};
    _data.Call = 'GetSearchFiles';
    _data.customer = $("#customername").attr("objid");
    _data.filetype = $("#filetype").attr("objid");
    _data.update_s = $("#txtupdate_s").val();
    _data.update_e = $("#txtupdate_e").val();
    _data.update_isnull = ($("#txtupdate_isnull")[0].checked ? "on" : "");
    _data.post_s = $("#txtpost_s").val();
    _data.post_e = $("#txtpost_e").val();
    _data.post_isnull = ($("#txtpost_isnull")[0].checked ? "on" : "");
    _data.case_volume = $.trim($("#case_volume").val());
    _data.fileclass = $("#selfileclass").attr("objid");
    _data.applicant = $("#applicant").val();
    _data.case_volume_customer = $.trim($("#case_volume_customer").val());
    _data.app_no = $.trim($("#app_no").val()).replace(/\./g, '');
    _data.flow_direction = $("#flow_direction").attr("objid");
    _data.sales = $("#sales").attr("objid");
    _data.upuser = $("#upuser").attr("objid");
    _data.file_status = $("#selfile_status").val();
    _data.app_date_s = $("#app_date_s").val();
    _data.app_date_e = $("#app_date_e").val();
    _data.app_date_isnull = ($("#app_date_isnull")[0].checked ? "on" : "");
    _data.proc_receipt_date_s = $("#proc_receipt_date_s").val();
    _data.proc_receipt_date_e = $("#proc_receipt_date_e").val();
    _data.proc_receipt_date_isnull = ($("#proc_receipt_date_isnull")[0].checked ? "on" : "");
    _data.file_receipt_date_s = $("#file_receipt_date_s").val();
    _data.file_receipt_date_e = $("#file_receipt_date_e").val();
    _data.file_receipt_date_isnull = ($("#file_receipt_date_isnull")[0].checked ? "on" : "");
    _data.is_close = $("#is_close").val();
    _data.apply_type = $("#apply_type").attr("objid");    /*2015-12-21添加*/
    _data.country = $("#country").attr("objid");
    _data.i_ctrl_proc = $("#i_ctrl_proc").attr("objid");
    _data.agency_id = $("#agency_id").attr("objid");
    _data.proc_status = $("#proc_status").val();
    _data.finish_date_s = $("#finish_date_s").val();
    _data.finish_date_e = $("#finish_date_e").val();
    _data.finish_date_isnull = ($("#finish_date_isnull")[0].checked ? "on" : "");
    _data.case_type = $("#case_type").val();
    _data.file_name = $("#file_name").val();
    _data.file_name_batch = $("#file_name_batch").val();
    _data.branch_dept_id = $("#branch_dept_id").attr("objid");
    _data.customer_name_vague = $("#customer_name_vague").val();
    _data.app_area_name = $("#app_area_name").val();
    _data.customer_flow_user = $("#customer_flow_user").attr("objid");
    _data.case_flow_user = $("#case_flow_user").attr("objid");
    _data.sales_help = $("#sales_help").attr("objid");
    _data.introducer = $("#introducer").val();
    _data.customer_code = $("#customer_code").val();
    _data.dept_id = $("#p_case_info__charge_dept_id").attr("objid");
    _data.sale_dept_id = $("#sale_dept_id").attr("objid");
    _data.agency_user_id = $("#agency_user_id").attr("objid");
    _data.business_type_id = $("#business_type").attr("objid");
    _data.user_assistant = $("#user_assistant").attr("objid");

    _data.receive_name = $("#receive_name").val();
    _data.cus_receive_date_s = $("#cus_receive_date_s").val();
    _data.cus_receive_date_e = $("#cus_receive_date_e").val();
    _data.cus_receive_date_isnull = ($("#cus_receive_date_isnull")[0].checked ? "on" : "");
    _data.issue_no = $("#issue_no").val();
    _data.pub_no = $("#pub_no").val();
    _data.issue_date_s = $("#issue_date_s").val();
    _data.issue_date_e = $("#issue_date_e").val();
    _data.issue_date_isnull = ($("#issue_date_isnull")[0].checked ? "on" : "");
    _data.back_date_start = $("#back_date_start").val();
    _data.back_date_end = $("#back_date_end").val();
    _data.back_inventor_date_start = $("#back_inventor_date_start").val();
    _data.back_inventor_date_end = $("#back_inventor_date_end").val();
    _data.customer_status_id = $("#customer_status_id").attr("objid");
    _data.revise_user_id = $("#revise_user_id").attr("objid");
    _data.ofileType = $("#ofileType").val();
    _data.is_essence_exam = ($("#is_essence_exam")[0].checked ? "true" : "");
    _data.is_confidential_request = ($("#is_confidential_request")[0].checked ? "true" : "");
    _data.is_ahead_pub = ($("#is_ahead_pub")[0].checked ? "true" : "");
    _data.is_fee_reduce = ($("#is_fee_reduce")[0].checked ? "true" : "");
    _data.is_speed_checkd = ($("#is_speed_checkd")[0].checked ? "true" : "");
    _data.is_request_das = ($("#is_request_das")[0].checked ? "true" : "");
    _data.hearing_the_case = ($("#hearing_the_case")[0].checked ? "true" : "");
    // 新增：延迟审查导出参数
    _data.is_examine_delay = ($("#is_examine_delay")[0].checked ? "true" : "");
    _data.customer_country = $("#customer_country").attr("objid");
    _data.case_remark = $("#case_remark").val();
    _data.pic_user = $("#pic_user").attr("objid");
    //_data.pic_no_user = ($("#pic_no_user")[0].checked ? "true" : "");
    _data.foreign_pic = $("#foreign_pic").attr("objid");
    _data.case_status = $("#case_status").attr("objid");
    _data.case_name = $("#case_name").val();
    if (FileManager.JIAQUAN) {
        _data.is_vip = $("#is_vip").val();
        _data.specialtyid = $("#specialtyid").val();
    }
    //_data.case_status_isnull = ($("#case_status_isnull")[0].checked ? "true" : "");
    _data.case_status_notequals = ($("#case_status_notequals")[0].checked ? "true" : "");
    _data.apply_tags_id = $("#apply_tags_id").attr("objid");
    _data.proc_remark = $("#proc_remark").val();

    //派特恩查询条件
    _data.payment_review_user_id = $("#payment_review_user_id").attr("objid");
    _data.payment_review_time_s = $("#payment_review_time_s").val();
    _data.payment_review_time_e = $("#payment_review_time_e").val();
    _data.payment_review_time_isnull = ($("#payment_review_time_isnull")[0].checked ? "on" : "");
    _data.pat_production_user_id = $("#pat_production_user_id").attr("objid");
    _data.update_production_user_time_s = $("#update_production_user_time_s").val();
    _data.update_production_user_time_e = $("#update_production_user_time_e").val();
    _data.update_production_user_time_isnull = ($("#update_production_user_time_isnull")[0].checked ? "on" : "");
    _data.pat_patauditor_user_id = $("#pat_patauditor_user_id").attr("objid");
    _data.update_patauditor_user_time_s = $("#update_patauditor_user_time_s").val();
    _data.update_patauditor_user_time_e = $("#update_patauditor_user_time_e").val();
    _data.update_patauditor_user_time_isnull = ($("#update_patauditor_user_time_isnull")[0].checked ? "on" : "");
    _data.pat_allocator_user_id = $("#pat_allocator_user_id").attr("objid");
    _data.update_allocator_user_time_s = $("#update_allocator_user_time_s").val();
    _data.update_allocator_user_time_e = $("#update_allocator_user_time_e").val();
    _data.file_remark = $("#file_remark").val();
    _data.update_allocator_user_time_isnull = ($("#update_allocator_user_time_isnull")[0].checked ? "on" : "");

    _data.column1 = $("#column_1").val();
    _data.column2 = $("#column_2").val();
    _data.column3 = $("#column_3").val();
    _data.column4 = $("#column_4").val();
    _data.column5 = $("#column_5").val();
    _data.inventor_name = $("#inventor_name").val();
    _data.contact_name_zf = $("#contact_name_zf").val();
    _data.IsFirst = IsFirst;
    var order_by = "";
    var colname = "";
    $("#FileList")
        .next()
        .find(".layui-table-header th")
        .each(function () {
            var sort = $(this).find(".layui-table-sort").attr("lay-sort");  // asc / desc / undefined
            var col = $(this).attr("data-sort");

            // 只处理真正有排序的列
            if (sort === "asc" || sort === "desc") {
                order_by = sort;
                colname = col;
            }
        });

    if (order_by && colname) {
        // 拼成你要的形式，例如： "case_volume asc"
        _data.order_by_search = ` ${colname} ${order_by}`;
    }
    var is_not_null = false;
    $.each(_data, function (key, val) {
        if (key != "IsFirst" && key != "Call" && key != "case_type" && key != "fileclass") {
            if (val) {
                is_not_null = true;
            }
        }
    });
    if (!is_not_null && !IsFirst) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S160805100847490', '请输入查询条件！'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }
    if ($("#is_query_save")[0].checked && $("#query_save_title").val() == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715174319250', '记住条件时，请输入标题！'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }
    //保存查询条件
    QueryHistory.SaveQueryCondition();

    var now = new Date();
   
    if (GetPublishConfig('PaiTeEn', 'SheWai')) {
        FileList.CaseCols = [[
            { type: 'numbers', fixed: 'left' },
            { type: 'checkbox' },
            {
                field: 'case_id', title: '操作', minWidth: 120, templet: function (row) {

                    if (!GetPublishConfig("CZLS", "202401")) {
                        if (row.CheckFile == '0' && row.is_payment_review_new == '0') {
                            return "<a title='编辑' class='tbedit' onclick='FileManager.ShowEditFileReceiveInfo(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>"
                                + "<a title='下载' class='tbdownload' onclick='FileManager.getFileNameByConfig(&apos;" + row.file_no + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,&apos;FILE&apos;,&apos;" + row.file_id + "&apos;)' href='javascript:void(0)' lid='S140912142421099'>&nbsp;</a>"
                                + "<a href='javascript: void (0)' lid='S190904175542673' title='复核' onclick=\"FileManager.CheckFile('" + row.file_id + "',this)\" class='tbnew'>&nbsp;</a>";
                        }
                        else {
                            return "<a title='编辑' class='tbedit' onclick='FileManager.ShowEditFileReceiveInfo(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>"
                                + "<a title='下载' class='tbdownload' onclick='FileManager.getFileNameByConfig(&apos;" + row.file_no + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,&apos;FILE&apos;,&apos;" + row.file_id + "&apos;)' href='javascript:void(0)' lid='S140912142421099'>&nbsp;</a>";
                        }
                    } else {
                        if (row.CheckFile == '0' && row.is_payment_review_new == '0') {
                            return "<a title='编辑' class='tbedit' onclick='FileManager.ShowEditFileReceiveInfo(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>"
                                + "<a title='下载' class='tbdownload' onclick='FileManager.getFileNameByConfig(&apos;" + row.file_no + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,&apos;FILE&apos;,&apos;" + row.file_id + "&apos;)' href='javascript:void(0)' lid='S140912142421099'>&nbsp;</a>"
                                + " <a title = '删除' class='tbdelete' onclick = 'FileManager.SingleDel(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid = 'S140912142421099'>&nbsp;</a>"
                                + "<a href='javascript: void (0)' lid='S190904175542673' title='复核' onclick=\"FileManager.CheckFile('" + row.file_id + "',this)\" class='tbnew'>&nbsp;</a>";
                        }
                        else {
                            return "<a title='编辑' class='tbedit' onclick='FileManager.ShowEditFileReceiveInfo(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>"
                                + "<a title='下载' class='tbdownload' onclick='FileManager.getFileNameByConfig(&apos;" + row.file_no + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,&apos;FILE&apos;,&apos;" + row.file_id + "&apos;)' href='javascript:void(0)' lid='S140912142421099'>&nbsp;</a>"
                                + " <a title = '删除' class='tbdelete' onclick = 'FileManager.SingleDel(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid = 'S140912142421099'>&nbsp;</a>";
                        }
                    }
                }
            },
            {
                field: 'file_name', title: GetResource('S140912142011888', '附件名称'), minWidth: 120, style: 'color:#407AA8;text-align:left', sort: true, templet: function (row) {
                    return StrcutFileName(row.file_no, row.file_name, 'FILE', row.case_id, row.proc_id, row.file_desc_code);
                }
            },
            { field: 'file_status', title: GetResource('S141107200224536', '处理状态'), sort: true, minWidth: 100 },
            {
                field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                    return FileManager.StrucCaseName(row.case_id, row.case_volume, row.case_type_id, row.proc_id);
                }
            },
            { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100 },
            { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100 },
            { field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100 },
            { field: 'file_type', title: GetResource('S140903173153758', '文件类型'), sort: true, minWidth: 100 },
            { field: 'file_desc', title: GetResource('S140929102908220', '文件描述'), sort: true, style: 'text-align:left', minWidth: 100 },
            { field: 'post_date', title: GetResource('S150806213511698', '发文日'), sort: true, minWidth: 100 },
            { field: 'upload_time', title: GetResource('S140816152026549', '上传时间'), sort: true, minWidth: 80 },
            { field: 'applicants', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, hide: true },
            { field: 'ctrl_proc_name', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 120 },
            { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 115, hide: true },
            { field: 'apply_type', title: GetResource('S140821164234972', '申请类型'), sort: true, minWidth: 120 },
            { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), sort: true, style: 'text-align:left', minWidth: 100 },
            { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 100 },
            { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 80, hide: true },
            { field: 'flow_user_id', title: GetResource('S150423232337564', '案件流程人员'), sort: true, minWidth: 80, hide: true },
            { field: 'apply_name', title: GetResource('S140905195017714', '提案名称'), sort: true, minWidth: 100, hide: true },
            { field: 'customer_type', title: GetResource('S140827094619190', '客户等级'), sort: true, minWidth: 100, hide: true },
            { field: 'file_desc_en_us', title: GetResource('S181026163634784', '文件描述(英文)'), sort: true, style: 'text-align:left', minWidth: 118, hide: true },

            { field: 'secret_level_name', title: GetResource('S140821182822919', '等级'), sort: true, minWidth: 100, hide: true },
            { field: 'deadline', title: GetResource('S160615165601530', '授权截至天数'), sort: true, minWidth: 115, hide: true },
            { field: 'customer_code', title: GetResource('S140825201856133', '客户代码'), sort: true, minWidth: 100, hide: true },
            { field: 'charge_dept', title: GetResource('S140901140456599', '承办部门'), sort: true, minWidth: 100, hide: true },
            { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 100, hide: true },
            { field: 'brand_dept', title: GetResource('S170419160623634', '所属分部'), sort: true, minWidth: 100, hide: true },
            { field: 'sale_name', title: GetResource('S170419160623634', '业务人员'), sort: true, minWidth: 100, hide: true },
            { field: 'sales_help', title: GetResource('S180116142441143', '业务助理'), sort: true, minWidth: 100, hide: true },
            { field: 'case_remark', title: GetResource('S180116142441143', '案件备注'), sort: true, minWidth: 100, hide: true },
            { field: 'pic_user_name', title: GetResource('S180116142441143', '处理事项处理人'), sort: true, minWidth: 100, hide: true },
            { field: 'foreign_pic_user_name', title: GetResource('S180116142441143', '事项对外处理人'), sort: true, minWidth: 100, hide: true },
            { field: 'is_confidential_request', title: GetResource('S180116142441143', '请求保密审查'), sort: true, minWidth: 100, hide: true },
            { field: 'hearing_the_case', title: GetResource('S180116142441143', '是否预审案件'), sort: true, minWidth: 100, hide: true },
            { field: 'is_speed_checkd', title: GetResource('S160801162904094', '优先审查'), sort: true, minWidth: 100, hide: true },
            { field: 'sale_dept_name', title: GetResource('S140821194410109', '业务人员部门'), sort: true, minWidth: 115, hide: true },
            { field: 'pic_name', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
            { field: 'receive_name', title: GetResource('S150815095253582', '领取人'), sort: true, minWidth: 100, hide: true },
            { field: 'cus_receive_date', title: GetResource('S150815095208639', '客户领取日期'), sort: true, minWidth: 115, hide: true },
            { field: 'issue_date', title: GetResource('S140822171028423', '公告日'), sort: true, minWidth: 100, hide: true },
            { field: 'back_date', title: GetResource('S150808153434141', '公告日(IPR)'), sort: true, minWidth: 110, hide: true },
            { field: 'pub_no', title: GetResource('S140822170945008', '公开号'), sort: true, minWidth: 100, hide: true },
            { field: 'pub_date', title: GetResource('S140822170902592', '公开日'), sort: true, minWidth: 110, hide: true },
            { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 105, hide: true },
            { field: 'cus_country', title: GetResource('S220113154618911', '客户所属国(地区)'), sort: true, minWidth: 105, hide: true },
            { field: 'cus_dept_name', title: GetResource('S181219100902484', '客户所属分部'), sort: true, minWidth: 105, hide: true },
            { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 100 },
            { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100 },
            { field: 'from_stage', title: GetResource('S140901123355392', '起始阶段'), sort: true, minWidth: 80, hide: true },
            { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), sort: true, minWidth: 100, hide: true },
            { field: 'upuser', title: GetResource('S140816152113474', '上传者'), sort: true, minWidth: 100, hide: true },
            { field: 'app_date', title: GetResource('S140822170743359', '申请日'), sort: true, minWidth: 100, hide: true },
            { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
           
     

            { field: 'priority_name', title: GetResource('S240304205402337', '难度等级'), sort: true, minWidth: 100, hide: true },
            { field: 'update_allocator_user_time', title: GetResource('S240519211223440', '分配者时间'), sort: true, minWidth: 100, hide: true },
            { field: 'pat_allocator_user', title: GetResource('S240226114925652', '分配者'), sort: true, minWidth: 100, hide: true },
            { field: 'update_patauditor_user_time', title: GetResource('S240519211251767', '审核者时间'), sort: true, minWidth: 100, hide: true },
            { field: 'pat_patauditor_user', title: GetResource('S240516144803193', '审核者'), sort: true, minWidth: 100, hide: true },
            { field: 'update_production_user_time', title: GetResource('S240519211323265', '制作者时间'), sort: true, minWidth: 100, hide: true },
            { field: 'pat_production_user', title: GetResource('S191119161423418', '制作者'), sort: true, minWidth: 100, hide: true },
            { field: 'payment_review_time', title: GetResource('S240519211349807', '复核者时间'), sort: true, minWidth: 100, hide: true },
            { field: 'payment_review_user', title: GetResource('S240313094238014', '复核者'), sort: true, minWidth: 100, hide: true },
            { field: 'is_payment_review', title: GetResource('S240419173944483', '复核状态'), sort: true, minWidth: 100, hide: true },
            { field: 'file_remark', title: GetResource('S230724092526633', '文件备注'), sort: true, minWidth: 100, hide: true },
            { field: 'related_volume_sa', title: GetResource('S160803103154175', '是否同日申请'), sort: true, minWidth: 100, hide: true },
            { field: 'spec_pages', title: GetResource('S160803103154175', '说明书(包括附图和序列表)页数'), sort: true, minWidth: 100, hide: true },
            { field: 'column_1', title: FileManager.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
            { field: 'column_2', title: FileManager.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
            { field: 'column_3', title: FileManager.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
            { field: 'column_4', title: FileManager.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
            { field: 'column_5', title: FileManager.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },
            { field: 'fawenxlh', title: '通知书发文序列号', sort: true, minWidth: 120, hide: true }

        ]];
    } else {
        FileList.CaseCols = [[
            { type: 'numbers', fixed: 'left' },
            { type: 'checkbox' },
            {
                field: 'case_id', title: '操作', minWidth: 150, templet: function (row) {

                    if (!GetPublishConfig("CZLS", "202401")) {
                        return "<a title='编辑' class='tbedit' onclick='FileManager.ShowEditFileReceiveInfo(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>"
                            + "<a title='下载' class='tbdownload' onclick='FileManager.getFileNameByConfig(&apos;" + row.file_no + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,&apos;FILE&apos;,&apos;" + row.file_id + "&apos;)' href='javascript:void(0)' lid='S140912142421099'>&nbsp;</a>";
                    }
                    else if (FileManager.IsZBSD) {
                        return "<a title='编辑' class='tbedit' onclick='FileManager.ShowEditFileReceiveInfo(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>"
                            + "<a title='下载' class='tbdownload' onclick='FileManager.getFileNameByConfig(&apos;" + row.file_no + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,&apos;FILE&apos;,&apos;" + row.file_id + "&apos;)' href='javascript:void(0)' lid='S140912142421099'>&nbsp;</a>"
                            + " <a title = '删除' class='tbdelete' onclick = 'FileManager.SingleDel(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid = 'S140912142421099'>&nbsp;</a>"
                            + " <a title = '替换' class='tbreplace' onclick = 'FileManager.ReplaceFileNew(&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid = 'S140912142421099'>&nbsp;</a>";
                    }
                    else {
                        return "<a title='编辑' class='tbedit' onclick='FileManager.ShowEditFileReceiveInfo(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>"
                            + "<a title='下载' class='tbdownload' onclick='FileManager.getFileNameByConfig(&apos;" + row.file_no + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,&apos;FILE&apos;,&apos;" + row.file_id + "&apos;)' href='javascript:void(0)' lid='S140912142421099'>&nbsp;</a>"
                            + " <a title = '删除' class='tbdelete' onclick = 'FileManager.SingleDel(&apos;" + row.file_no + "&apos;,&apos;" + row.file_id + "&apos;,&apos;" + HTMLDecodeToEmpty(row.file_name) + "&apos;,)' href='javascript:void(0)' lid = 'S140912142421099'>&nbsp;</a>";
                    }
                }
            },
            {
                field: 'file_name', title: GetResource('S140912142011888', '附件名称'), minWidth: 120, style: 'color:#407AA8;text-align:left', sort: true, templet: function (row) {
                    return StrcutFileName(row.file_no, row.file_name, 'FILE', row.case_id, row.proc_id, row.file_desc_code);
                }
            },
            { field: 'file_status', title: GetResource('S141107200224536', '处理状态'), sort: true, minWidth: 100 },
            {
                field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                    return FileManager.StrucCaseName(row.case_id, row.case_volume, row.case_type_id, row.proc_id);
                }
            },
            { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100 },
            { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100 },
            { field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100 },
            { field: 'file_type', title: GetResource('S140903173153758', '文件类型'), sort: true, minWidth: 100 },
            { field: 'file_desc', title: GetResource('S140929102908220', '文件描述'), sort: true, style: 'text-align:left', minWidth: 100 },
            { field: 'post_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
            { field: 'upload_time', title: GetResource('S140816152026549', '上传时间'), sort: true, minWidth: 80 },
            { field: 'applicants', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, hide: true },
            { field: 'ctrl_proc_name', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 120 },
            { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 115, hide: true },
            { field: 'apply_type', title: GetResource('S140821164234972', '申请类型'), sort: true, minWidth: 120 },
            { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), sort: true, style: 'text-align:left', minWidth: 100 },
            { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 100 },
            { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 80, hide: true },
            { field: 'flow_user_id', title: GetResource('S150423232337564', '案件流程人员'), sort: true, minWidth: 80, hide: true },
            { field: 'apply_name', title: GetResource('S140905195017714', '提案名称'), sort: true, minWidth: 100, hide: true },
            { field: 'customer_type', title: GetResource('S140827094619190', '客户等级'), sort: true, minWidth: 100, hide: true },
            { field: 'file_desc_en_us', title: GetResource('S181026163634784', '文件描述(英文)'), sort: true, style: 'text-align:left', minWidth: 118, hide: true },

            { field: 'secret_level_name', title: GetResource('S140821182822919', '等级'), sort: true, minWidth: 100, hide: true },
            { field: 'deadline', title: GetResource('S160615165601530', '授权截至天数'), sort: true, minWidth: 115, hide: true },
            { field: 'customer_code', title: GetResource('S140825201856133', '客户代码'), sort: true, minWidth: 100, hide: true },
            { field: 'charge_dept', title: GetResource('S140901140456599', '承办部门'), sort: true, minWidth: 100, hide: true },
            { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 100, hide: true },
            { field: 'brand_dept', title: GetResource('S170419160623634', '所属分部'), sort: true, minWidth: 100, hide: true },
            { field: 'sale_name', title: GetResource('S170419160623634', '业务人员'), sort: true, minWidth: 100, hide: true },
            { field: 'sales_help', title: GetResource('S180116142441143', '业务助理'), sort: true, minWidth: 100, hide: true },
            { field: 'case_remark', title: GetResource('S180116142441143', '案件备注'), sort: true, minWidth: 100, hide: true },
            { field: 'pic_user_name', title: GetResource('S180116142441143', '处理事项处理人'), sort: true, minWidth: 100, hide: true },
            { field: 'foreign_pic_user_name', title: GetResource('S180116142441143', '事项对外处理人'), sort: true, minWidth: 100, hide: true },
            { field: 'is_confidential_request', title: GetResource('S180116142441143', '请求保密审查'), sort: true, minWidth: 100, hide: true },
            { field: 'hearing_the_case', title: GetResource('S180116142441143', '是否预审案件'), sort: true, minWidth: 100, hide: true },
            { field: 'is_speed_checkd', title: GetResource('S160801162904094', '优先审查'), sort: true, minWidth: 100, hide: true },
            { field: 'sale_dept_name', title: GetResource('S140821194410109', '业务人员部门'), sort: true, minWidth: 115, hide: true },
            { field: 'pic_name', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
            { field: 'receive_name', title: GetResource('S150815095253582', '领取人'), sort: true, minWidth: 100, hide: true },
            { field: 'cus_receive_date', title: GetResource('S150815095208639', '客户领取日期'), sort: true, minWidth: 115, hide: true },
            { field: 'issue_date', title: GetResource('S140822171028423', '公告日'), sort: true, minWidth: 100, hide: true },
            { field: 'back_date', title: GetResource('S150808153434141', '公告日(IPR)'), sort: true, minWidth: 110, hide: true },
            { field: 'pub_no', title: GetResource('S140822170945008', '公开号'), sort: true, minWidth: 100, hide: true },
            { field: 'pub_date', title: GetResource('S140822170902592', '公开日'), sort: true, minWidth: 110, hide: true },
            { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 105, hide: true },
            { field: 'cus_country', title: GetResource('S220113154618911', '客户所属国(地区)'), sort: true, minWidth: 105, hide: true },
            { field: 'cus_dept_name', title: GetResource('S181219100902484', '客户所属分部'), sort: true, minWidth: 105, hide: true },
            { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 100 },
            { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100 },
            { field: 'from_stage', title: GetResource('S140901123355392', '起始阶段'), sort: true, minWidth: 80, hide: true },
            { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), sort: true, minWidth: 100, hide: true },
            { field: 'upuser', title: GetResource('S140816152113474', '上传者'), sort: true, minWidth: 100, hide: true },
            { field: 'app_date', title: GetResource('S140822170743359', '申请日'), sort: true, minWidth: 100, hide: true },
            { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
            { field: 'file_remark', title: GetResource('S160803103154175', '文件备注'), sort: true, minWidth: 100, hide: true },
            { field: 'related_volume_sa', title: GetResource('S160803103154175', '是否同日申请'), sort: true, minWidth: 100, hide: true },
            { field: 'spec_pages', title: GetResource('S160803103154175', '说明书(包括附图和序列表)页数'), sort: true, minWidth: 100, hide: true },
            { field: 'bill_number', title: GetResource('S151012094216735', '收据号'), sort: true, minWidth: 100, hide: true },
            { field: 'column_1', title: FileManager.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
            { field: 'column_2', title: FileManager.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
            { field: 'column_3', title: FileManager.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
            { field: 'column_4', title: FileManager.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
            { field: 'column_5', title: FileManager.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },
            { field: 'fawenxlh', title: '通知书发文序列号', sort: true, minWidth: 120, hide: true }
        ]];
    }
    
    if (GetPublishConfig('ZhongYi', '2023_0')) {
        FileList.CaseCols[0].push({
            type: 'ColTemplate',
            field: 'favorite', title: GetResource('S170401173019385', '我的关注'), sort: true, minWidth: 80,
            templet: function (row) {
                if (row.favorite == "是") {
                    return "<a style='background: transparent url(../../images/UIimg/Favadd_hover.png) no-repeat left;  color:red'>&ensp;&ensp;&ensp;&ensp;</a>";
                }
                else {
                    return "";
                }
            },
            hide: true
        });
        FileList.CaseCols[0].push({ field: 'favorite_remark', title: GetResource('S231127095935474', '关注备注'), sort: true, minWidth: 80, hide: true });
    }

    if (FileManager.isZY) {
        FileList.CaseCols[0].push({ field: 'flow_name', title: GetResource('S140922133451105', '流程阶段'), sort: true, minWidth: 110, hide: true });
        FileList.CaseCols[0].push({ field: 'submit_user', title: GetResource('S260224153049547', '核稿审核人'), sort: true, minWidth: 110, hide: true });
        FileList.CaseCols[0].push({ field: 'submit_time', title: GetResource('S260224153532513', '核稿流程提交时间'), sort: true, minWidth: 110, hide: true });
    }

    if ($("#case_type").val() == "0E8A4B7F-E407-4EFF-9562-3809BF484207") {
        FileList.CaseCols[0].push({ field: 'issue_no', title: GetResource('S141009101941489', '注册号'), sort: true, minWidth: 80, hide: true });
        FileList.CaseCols[0].push({ field: 'register_type_code', title: GetResource('S160308101917419', '商标类别'), sort: true, minWidth: 100, hide: true });
    }


    if (GetPublishConfig("ZBSD", "is_show_column")) {
        if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
            FileList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
        }

    }

    if (FileManager.HKDZ2601) {
        FileList.CaseCols[0].push({ field: 'contact_name_zf', title: GetResource('S240411112136353', '专利负责人'), sort: true, minWidth: 100 });
    }

    if (GetPublishConfig('paiteen', 'SheWai') || GetPublishConfig('FileSearch', 'PiaoJu')) {
        FileList.CaseCols[0].push({ field: 'JiaoFeiR', title: GetResource('S230511140836243', '收据缴费抬头'), sort: true, minWidth: 100, hide: true });
        FileList.CaseCols[0].push({ field: 'PiaoJuJE', title: GetResource('S171219101843722', '收据金额'), sort: true, minWidth: 100, hide: true });
        FileList.CaseCols[0].push({ field: 'PiaoJuRQ', title: GetResource('S230511101434375', '收据开票日期'), sort: true, minWidth: 100, hide: true });
        FileList.CaseCols[0].push({ field: 'itemName', title: GetResource('S230511101434375', '收据费用明细'), sort: true, minWidth: 100, hide: true });
        FileList.CaseCols[0].push({ field: 'QPH', title: GetResource('S210105082735615', '取票码'), sort: true, minWidth: 100, hide: true });
        _data.is_pat = 1;

    }
    else {
        _data.is_pat = 0;
    }

    _data._doneCallback = function (res) {
        layui.use('table', function () {
            var table = layui.table;
            table.on('sort(FileList)', function (obj) {
                console.log('排序字段:', obj.field, '排序类型:', obj.type);
                FileManager.isSortAction = true;
            });
        });
    };

    Ajax.LoadLayuiTable(FileList, 'FileList', 'CaseInfo.ashx', FileList.CaseCols, _data, function (data) {
        // 恢复排序
        if (!FileManager.isSortAction && colname && order_by) {
            // 给表格设置排序
            $("#FileList")
                .next()
                .find(".layui-table-header th")
                .each(function () {

                    if ($(this).attr("data-sort") === colname) {
                        // 移除其它排序状态
                        $(this).siblings().find(".layui-table-sort").removeAttr("lay-sort");

                        // 设置当前列的排序方向
                        $(this)
                            .find(".layui-table-sort")
                            .attr("lay-sort", order_by);
                    }
                });
        }
        FileManager.isSortAction = false;
        //$("div.layui-form-checkbox").css("margin-top", "5px");//使复选框居中
        if (GetPublishConfig('PaiTeEn', 'SheWai')) {


            $('.layui-table  tbody tr').on('click', function (obj) {
                var index = $(this).attr('data-index');
                var tableBox = $(this).parents('.layui-table-box');
                //存在固定列
                tableDiv = tableBox.find(".layui-table-body.layui-table-main");
                var checkCell = tableDiv.find("tr[data-index=" + index + "]").find("td div.laytable-cell-checkbox div.layui-form-checkbox I");
                //选中背景色

                if (checkCell.length > 0) {
                    checkCell.click();
                }

                // 阻止事件冒泡
                e.stopPropagation();
            })

            $('.layui-table  tbody tr').on("click", "td div.laytable-cell-checkbox div.layui-form-checkbox", function (e) {
                if ($(this).is(":checked")) {
                    $(this).css("background-color", "#00FF7F");
                } else {
                    $(this).css("background-color", "#");
                }
                e.stopPropagation();
            })


        }

      

        var length = 0;
        var RoleCode = top.window._UserModel.RoleCode.split(";");
        if (data.TableRows) {
           
            length = data.TableRows.length;
            for (var i = 0; i < length; i++) {
                var row = data.TableRows[i];
                var int_due_date = row.int_due_date;
                var cus_due_date = row.cus_due_date;
                var legal_due_date = row.legal_due_date;
                var tr = $("#FileList").next().find(".layui-table-main tr[data-index=" + i + "]");
                var case_name_td = tr.find("td[data-field='case_name']");
                var customer_name_td = tr.find("td[data-field='customer_name']");
                case_name_td.attr("title", $.NoSpace(case_name_td.text()));
                customer_name_td.attr("title", $.NoSpace(customer_name_td.text()));
                tr.attr("id", row.file_no);
                tr.attr("pkname", row.file_name);
                tr.attr("pkid", row.file_id);
                var text = row.role_code;
                //var text = tr.find(">td[colname=role_code]").text();
                tr.find(">td>div>div>i").attr({ "onclick": 'FileManager.Selected(this)' });
                if (text) {
                    text += ",";
                    for (var j = 0; j < RoleCode.length; j++) {
                        if (text.indexOf(RoleCode[j] + ",") >= 0) {
                            break;
                        }
                        else if (j == RoleCode.length - 1) {
                            //tr.find(">td:eq(0)").html("");
                            tr.find("input[type='checkbox']").prop('disabled', true);
                            tr.find("input[type='checkbox']").next().addClass('layui-btn-disabled');
                        }
                    }
                } else {
                    //tr.find(">td:eq(0)").html("");
                    tr.find("input[type='checkbox']").prop('disabled', true);
                    tr.find("input[type='checkbox']").next().addClass('layui-btn-disabled');
                }
                var td = tr.find("td[data-field=file_name]");
                var td2 = tr.find("td[data-field=file_desc]");
                var td3 = tr.find("td[data-field=customer_name]");
                var td4 = tr.find("td[data-field=applicants]");
                var td5 = tr.find("td[data-field=deadline]");
                var td6 = tr.find("td[data-field=is_authorize]");
                td.attr("title", $.NoSpace(td.text()));
                td2.attr("title", $.NoSpace(td2.text()));
                td3.attr("title", $.NoSpace(td3.text()));
                td4.attr("title", $.NoSpace(td4.text()))
                if (td6.text()) {
                    if (td5.text()) {
                        var time = $.DateDiff(td5.text(), $.curDateTime()); //parseInt(days / (1000 * 60 * 60 * 24));                    
                        if (time < 3 && time >= 0) {
                            td5.attr("title", "授权截至日期为" + td5.text()).find("div").html("<span style='background:#FF872F;'>离过期还剩:" + time + "天" + "</span>");
                        }
                        else if (time < 0) {
                            td5.attr("title", "已过期" + td5.text()).find("div").html("<span style='background-color: rgb(114, 114, 114);'> 已过期:" + Math.abs(time) + "天" + "</span>");
                        }
                        else {
                            td5.attr("title", GetResource('S170715174313034', '授权截至日期为') + td5.text()).find("div").text(time + GetResource('S150713162807899', '天'));
                        }
                    } else {
                        td5.attr("title", GetResource('S170715174313970', '永久授权') + td5.text()).find("div").html(GetResource('S170715174313970', '永久授权'));
                    }
                }

            }
        }
    }, null, 50);

}

FileManager.Selected = function (obj) {
    var tr = $(obj).parent().parent().parent().parent();
    var divClass = $(obj).parent();
    var isChecked = divClass.attr("class");
    if (isChecked != "layui-unselect layui-form-checkbox layui-form-checked") {
        tr.attr("style", "background-color:#CCC");
    } else {
        tr.removeAttr("style");
    }
}
//批量删除

FileManager.ReplaceFileNew = function (file_id, suf) {
    suf = suf.substring(suf.lastIndexOf(".") + 1, suf.length);

    var seting = {
        file_type_ids: ""
        , post_date: false
        , remark: true
        , title: GetResource('S140816150823831', '上传附件')
        , file_desc_id: true
        , priority: true
        , is_zbsd: true
    }
    var data = { Call: "ReplaceCaseFileNew", file_id: file_id, suf: suf }
    CommDragUploadNotices(FileManager.SearchFile, data, seting);
}

FileManager.ReplaceAllFile = function () {
    var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    var _file_name = FileList.table.getCheckColumnData('FileList', 'file_name');

    var suf = FileManager.checkAndGetCommonExtension(_file_name);

    if (suf == null || suf == "") {
        Box.Alert(GRESX.HINTS.TITLE, "修改的文件后缀不一致,请重新选择.", null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    var seting = {
        file_type_ids: ""
        , post_date: false
        , remark: true
        , title: GetResource('S140816150823831', '上传附件')
        , file_desc_id: true
        , priority: true
        , is_zbsd: true
    }
    var data = { Call: "ReplaceAllCaseFile", file_id: _file_ids, suf: suf }
    CommDragUploadNotices(FileManager.SearchFile, data, seting);
}

FileManager.checkAndGetCommonExtension = function (fileNamesStr) {
    var files = fileNamesStr.split(';').map(file => file.trim()).filter(file => file !== '');

    if (files.length === 0) {
        return null;
    }
    
    var extensions = files.map(file => {
        var parts = file.split('.');
        return parts.length > 1  ? parts.pop().toLowerCase() : '';
    });
    
    var firstExt = extensions[0];
    var isConsistent = extensions.every(ext => ext === firstExt);

    extension = isConsistent ? firstExt : null;

    return extension;
}

FileManager.BatchDel = function (obj,ids) {
    var _file_ids = "";
    if (ids) {
        _file_ids = ids;
    } else {
        _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    }
    
    if (_file_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    if (_file_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    var Success = function (_Meta) {
        var msg = "与此文件相关的处理事项，以及处理事项下的其他文件都会被删除。确定要删除吗？"
        if (_Meta.ClientInfo.Message) {
            msg = _Meta.ClientInfo.Message.replace(/\r\n/g, "<br>") + msg;
        }
        Box.Confirm(GRESX.HINTS.TITLE, msg, function () {
            //根据代理费规则添加年费代理费
            var success = function (_data) {
                if (_data.ClientInfo.Result) {
                    Box.Alert(GRESX.HINTS.TITLE, GetResource('S140812201746197', '删除成功'), null, { icon: 'succ.gif', width: '250', height: '60' });
                    FileManager.SearchFile(false);
                }
            }
            Ajax.Request("CaseInfo.ashx", { Call: "BatchDelFile", file_ids: _file_ids }, success)
        }, { width: '360', height: '90', icon: 'question.gif' }, function () {
            //dofunction();
        });
    }

    Ajax.Request('CaseInfo.ashx', { Call: 'GetDelFileInfo', file_ids: _file_ids}, Success);

}

//批量下载
FileManager.DownFile = function (type) {

    var _file_nos = FileList.table.getCheckColumnData('FileList', 'file_no');
    var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    var _file_names = FileList.table.getCheckColumnData('FileList', 'file_name');
    var _zip_name = "";
    var _zipfnlength = $("#tdzipfilename select[class='select_auto']").length;
    var _zip_file_name_type = "";
    if (GetPublishConfig('ZhongYi', '2023_0')) {
        //_zip_name = $("#zip_name").val()
        for (var j = 1; j <= _zipfnlength; j++) {
            if ($("#selzipfilename" + j).val() == 'fixtxt') {
                _zip_name += $("#txtzipfilename" + j).val() + ";";
                _zip_file_name_type += "txt" + ";";
            } else {
                if ($("#selzipfilename" + j).val()) {
                    _zip_name += $("#selzipfilename" + j).val() + ";";
                    _zip_file_name_type += "colname" + ";";
                }
            }
        }
        if (_zip_name) {
            _zip_name = _zip_name.substr(0, _zip_name.length - 1);
            _zip_file_name_type = _zip_file_name_type.substr(0, _zip_file_name_type.length - 1)
        }
    }
    var _childpath = $("#selfilePath").val();
    if (_file_nos == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    var isApproval = true;
    if (GetPublishConfig('FileUpload', 'is_not_approval')) {
        //文件需要审批配置
        var success = function (_Meta) {
            if (_Meta.flag) {
                isApproval = _Meta.flag == "True" ? true : false;
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: _file_nos }, success, true);
    }
    if (!isApproval) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '账号保密等级不足或存在文件未通过审批，不可下载！'), null, { icon: 'hits.gif' });
        return;
    }

    var fnlength = $("#tdfilename select[class='select_auto']").length;
    var _newfilename = "";
    var file_name_type = "";
    for (var j = 1; j <= fnlength; j++) {
        if ($("#selfilename" + j).val() == 'fixtxt') {
            _newfilename += $("#txtfilename" + j).val() + ";";
            file_name_type += "txt" + ";";
        } else {
            if ($("#selfilename" + j).val()) {
                _newfilename += $("#selfilename" + j).val() + ";";
                file_name_type += "colname" + ";";
            }
        }

    }
    if (_newfilename) {
        _newfilename = _newfilename.substr(0, _newfilename.length - 1);
        file_name_type = file_name_type.substr(0, file_name_type.length - 1)
    }

    if (_newfilename) {
        _file_names = "";
        //获取下载文件名称
        function Success(_Meta) {
            _file_names = _Meta.file_names;
            _zip_name = _Meta.zip_names;
            if (!_file_names) { _file_names = "file" }
            _file_names = FileManager.Change_file_names(_file_names); //判断重名后更换名字
            if (_childpath) {
                _path = _Meta.child_path;
                if (_path) { _childpath = _path.substr(0, _path.length - 1) }
            }
            if (type == "Ozip") {
                DownLoad(_file_nos, _file_names, 'FILE', _zip_name, '', type, _childpath);
            } else {
                DownLoad(_file_nos, _file_names, 'FILE', _zip_name, '', '', _childpath);
            }
        }
        Ajax.Request('CaseInfo.ashx', {
            Call: 'GetFileName', file_ids: _file_ids, new_filename: _newfilename, childpath: _childpath,
            file_name_type: file_name_type, zip_name: _zip_name, zip_file_name_type: _zip_file_name_type
        }, Success);
    } else {
        Ajax.Request('CaseInfo.ashx', { Call: 'GetFileNameByConfig', file_ids: _file_ids, zip_name: _zip_name, zip_file_name_type: _zip_file_name_type }, function (_Meta) {
            _file_names = _Meta.file_names;
            _zip_name = _Meta.zip_names;
            if (!_file_names) { _file_names = "file" }
            _file_names = _file_names.replace(/^(\s|;)+|(\s|;)+$/g, '');
            // _file_names = FileManager.Change_file_names(_file_names); //判断重名后更换名字
            if (_childpath) {
                var $_row = $('#table_FileList').find('>tbody>tr');
                var _path = "";
                $_row.each(function () {
                    var tr = $(this);
                    var _name = "";
                    var chk = tr.find("input.check");
                    if (chk.attr("checked") == "checked" || chk.attr("checked") == true) {
                        if (tr.find(">td[colname='" + _childpath + "']").length >= 1) {
                            _name += tr.find(">td[colname='" + _childpath + "']").text();
                            if (!_name) {
                                _name = "空";
                            }
                        }
                        _name = _name.replace(/\|/g, "").replace(/\//g, "").replace(/\\/g, "").replace(/\:/g, "").replace(/\*/g, "").replace(/\?/g, "").replace(/\"/g, "").replace(/\</g, "").replace(/\>/g, "").replace(/\;/g, "");
                        _path += _name + ";";
                    }
                });
                if (_path) { _childpath = _path.substr(0, _path.length - 1) }
            }
            if (type == "Ozip") {
                DownLoad(_file_nos, _file_names, 'FILE', _zip_name, '', type, _childpath);
            } else {
                DownLoad(_file_nos, _file_names, 'FILE', _zip_name, '', '', _childpath);
            }
        });
        
    }


}
FileManager.getFileNameByConfig = function(_file_nos, _file_names, _file_type,id){
    Ajax.Request('CaseInfo.ashx', { Call: 'GetFileNameByConfig', file_ids: id }, function (_Meta) {
        if (_Meta.file_names) {
            _file_names = _Meta.file_names;
            _file_names = _file_names.replace(/^(\s|;)+|(\s|;)+$/g, '');
        }
        DownLoad(_file_nos, _file_names, _file_type);
    });
}

//导出Excel清单
FileManager.ExportExcel_old = function () {

    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.belong_key = "FileSearch";
    ajax_config.height = 730;
    ajax_config.width = 950;
    ajax_config.handler = "CaseInfo.ashx";
    ajax_config.Call = "GetSearchFileExport";
    var param = {};

    var order_by = "";
    var colname = "";
    $("#FileList").next().find(".layui-table-header").find("th").each(function () {
        var sort = $(this).find("span[class='layui-table-sort layui-inline']").attr("lay-sort");
        var col = $(this).attr("data-sort");
        if (sort) {
            order_by = sort;
            colname = col;
        }
    });
    param.orderby = order_by;
    param.colname = colname;

    //获取table的th的属性
    /*var td = [];
    td = $("#table_FileList>thead").find("td");
    for (var i = 0; i < td.length; i++) {
        if ($(td[i]).attr("orderby")) {
            param.colname = $(td[i]).attr("colname");
            param.orderby = $(td[i]).attr("orderBy");
        }
    }*/
    param.customer = $("#customername").attr("objid");
    param.filetype = $("#filetype").attr("objid");
    param.update_s = $("#txtupdate_s").val();
    param.update_e = $("#txtupdate_e").val();
    param.update_isnull = ($("#txtupdate_isnull")[0].checked ? "on" : "");
    param.post_s = $("#txtpost_s").val();
    param.post_e = $("#txtpost_e").val();
    param.post_isnull = ($("#txtpost_isnull")[0].checked ? "on" : "");
    param.case_volume = $("#case_volume").val();
    param.fileclass = $("#selfileclass").val();
    param.applicant = $("#applicant").val();
    param.case_volume_customer = $("#case_volume_customer").val();
    param.app_no = $("#app_no").val();
    param.flow_direction = $("#flow_direction").attr("objid");
    param.sales = $("#sales").attr("objid");
    param.upuser = $("#upuser").attr("objid");
    param.file_status = $("#selfile_status").val();
    param.app_date_s = $("#app_date_s").val();
    param.app_date_e = $("#app_date_e").val();
    param.app_date_isnull = ($("#app_date_isnull")[0].checked ? "on" : "");
    param.proc_receipt_date_s = $("#proc_receipt_date_s").val();
    param.proc_receipt_date_e = $("#proc_receipt_date_e").val();
    param.proc_receipt_date_isnull = ($("#proc_receipt_date_isnull")[0].checked ? "on" : "");
    param.file_receipt_date_s = $("#file_receipt_date_s").val();
    param.file_receipt_date_e = $("#file_receipt_date_e").val();
    param.file_receipt_date_isnull = ($("#file_receipt_date_isnull")[0].checked ? "on" : "");
    param.is_close = $("#is_close").val();
    param.apply_type = $("#apply_type").attr("objid");    /*2016-5-13修改导出条件*/
    param.country = $("#country").attr("objid");
    param.i_ctrl_proc = $("#i_ctrl_proc").attr("objid");
    param.agency_id = $("#agency_id").attr("objid");
    param.proc_status = $("#proc_status").val();
    param.finish_date_s = $("#finish_date_s").val();
    param.finish_date_e = $("#finish_date_e").val();
    param.finish_date_isnull = ($("#finish_date_isnull")[0].checked ? "on" : "");
    param.case_type = $("#case_type").val();
    param.file_name = $("#file_name").val();
    param.file_name_batch = $("#file_name_batch").val();
    param.branch_dept_id = $("#branch_dept_id").attr("objid");
    param.customer_name_vague = $("#customer_name_vague").val();
    param.app_area_name = $("#app_area_name").val();
    param.introducer = $("#introducer").val();
    param.customer_flow_user = $("#customer_flow_user").attr("objid");
    param.case_flow_user = $("#case_flow_user").attr("objid");
    param.sales_help = $("#sales_help").attr("objid");
    param.customer_status_id = $("#customer_status_id").attr("objid");
    param.customer_code = $("#customer_code").val();
    param.revise_user_id = $("#revise_user_id").attr("objid");
    param.is_pat = 0;
    var obj_columns = [];
    var columns = []; //默认不选择的栏位设置 is_default: false 

    columns.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    columns.push({ value: "case_name", text: GetResource('S140814204116996', '案件名称') });
    columns.push({ value: "apply_type", text: GetResource('S140821164234972', '申请类型') });
    columns.push({ value: "sales", text: GetResource('S140821194410109', '业务人员') });
    columns.push({ value: "business_type", text: GetResource('S140901115419492', '业务类型') });
    columns.push({ value: "case_type", text: GetResource('S140830213547543', '案件类型') });
    columns.push({ value: "case_status", text: GetResource('S140822171057018', '案件状态') });
    columns.push({ value: "country", text: GetResource('S140901115346358', '国家(地区)') });
    columns.push({ value: "case_volume_customer", text: GetResource('S140901115322880', '客户文号') });
    columns.push({ value: "app_no", text: GetResource('S140822170832920', '申请号') });
    columns.push({ value: "app_date", text: GetResource('S140822170743359', '申请日') });
    columns.push({ value: "pub_no", text: GetResource('S140822170945008', '公开号') });
    columns.push({ value: "pub_date", text: GetResource('S140822170902592', '公开日') });
    columns.push({ value: "issue_no", text: GetResource('S140822171117625', '公告号') });
    columns.push({ value: "issue_date", text: GetResource('S140822171028423', '公告日') });
    columns.push({ value: "priority_date", text: GetResource('S150311194328332', '第一优先权日') });
    columns.push({ value: "applicants", text: GetResource('S140814212259786', '申请人') });
    columns.push({ value: "inverters", text: GetResource('S140825203153404', '发明人') });
    columns.push({ value: "ctrl_proc", text: GetResource('S140821164247623', '处理事项') });
    columns.push({ value: "int_due_date", text: GetResource('S140823161428652', '内部期限') });
    columns.push({ value: "cus_due_date", text: GetResource('S140821164259916', '客户期限') });
    columns.push({ value: "legal_due_date", text: GetResource('S140929103018129', '官方期限') });
    columns.push({ value: "file_name", text: GetResource('S140912142011888', '附件名称') });
    columns.push({ value: "file_type", text: GetResource('S140903173153758', '文件类型') });
    columns.push({ value: "file_desc", text: GetResource('S140929102908220', '文件描述') });
    columns.push({ value: "doc_no", text: GetResource('S180224182112086', '发文序列号') });
    columns.push({ value: "doc_examiner", text: GetResource('S141222151826296', '审查员') });
    columns.push({ value: "doc_examiner_tel", text: GetResource('S140906150720414', '审查员电话 ') });
    columns.push({ value: "doc_office", text: GetResource('S140906150226338', '来文部门') });
    columns.push({ value: "fawenxlh", text: '通知书发文序列号', is_default: false });
    if (GetPublishConfig('PaiTeEn', 'SheWai')) {
        columns.push({ value: "post_date", text: GetResource('S150806213511698', '发文日') });
    } else {
        columns.push({ value: "post_date", text: GetResource('S150806213511698', '官方发文日') });
    }
    columns.push({ value: "upload_time", text: GetResource('S140816152026549', '上传时间') });
    columns.push({ value: "pic", text: GetResource('S160411145409233', '案件处理人') });
    columns.push({ value: "sales_help", text: GetResource('S180116142441143', '业务助理') });
    columns.push({ value: "introducer", text: GetResource('S180421100702035', '外部案源人') });
    columns.push({ value: "revise", text: GetResource('S170911151347295', '案件核稿人员') });
    columns.push({ value: "proc_pic", text: GetResource('S170107163446740', '处理事项处理人') });
    columns.push({ value: "proc_pic_dept", text: GetResource('S170911151429482', '处理事项处理人部门') });
    columns.push({ value: "remark", text: GetResource('S140905200748375', '案件备注') });
    columns.push({ value: "agency", text: GetResource("S141106084922906", "代理机构") });
    columns.push({ value: "charge_date", text: GetResource("S150408212924417", "委案日期") });
    columns.push({ value: "create_time", text: GetResource("S150226092116115", "开卷日期") });
    columns.push({ value: "is_fee_reduce", text: GetResource('S170715174316430', '是否请求费用减缓') });
    columns.push({ value: "is_ahead_pub", text: GetResource("S170329162611438", "是否提前公布") });
    columns.push({ value: "is_essence_exam", text: GetResource("S170329162417935", "是否同时提实审") });
    columns.push({ value: "apply_name", text: GetResource("S140905195017714", "提案名称") });
    columns.push({ value: "proc_note", text: GetResource("S141015142024952", "处理事项备注") });
    columns.push({ value: "review_stage", text: GetResource("S150203143844255", "案件阶段") });
    columns.push({ value: "dept_name", text: GetResource('S170419160623634', '所属分部') });
    columns.push({ value: "is_speed_checkd", text: GetResource('S171103173735807', '是否优先审查') });
    columns.push({ value: "app_addres", text: GetResource('S170715174221263', '第一申请人地址') });
    columns.push({ value: "proc_receipt_date", text: GetResource('S160113154334081', '事项收文日期'), is_default: false });
    if ($("#case_type").val() == "0E8A4B7F-E407-4EFF-9562-3809BF484207") {

        columns.push({ value: "register_type_code", text: GetResource('S160308101917419', '商标类别') });
        columns.push({ value: "authorize_date", text: GetResource('S140930154518982', '获批日') });
        columns.push({ value: "expire_date", text: GetResource('S141009102119489', '终止日') });
        columns.push({ value: "file_receipt_date", text: GetResource('S160113154334081', '文件收文日期') });
    }
    columns.push({ value: "app_area_name", text: GetResource('S180205191439877', '第一申请人行政区划') });
    columns.push({ value: 'new_application_pic', text: GetResource('S180517150321273', '新申请处理人'), is_default: false });
    columns.push({ value: "customer_name", text: GetResource('S140821182822919', '客户名称') });
    columns.push({ value: "cus_country", text: GetResource('S220113154618911', '客户所属国(地区)'), is_default: false });
    columns.push({ value: "cus_dept_name", text: GetResource('S181108151455914', '客户所属分部'), is_default: false });
    if (GetPublishConfig("CustomerInfo", "export_info")) {
        if (PageAuth.indexOf("Ec") > -1) {
            columns.push({ value: "customer_tel", text: GetResource('S171025185525200', '客户电话') });
        }
    } else {
        columns.push({ value: "customer_tel", text: GetResource('S171025185525200', '客户电话') });
    }

    if (GetPublishConfig("ZBSD", "is_show_column")) {
        if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
            columns.push({ value: "user_assistant_name", text: GetResource('S250523201311872', '案件处理人助理') });
        }

    }



    if ($("#is_query_save")[0].checked && $("#query_save_title").val() == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715174319250', '记住条件时，请输入标题！'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }
    //记录导出条件
    if (QueryHistory.cur_query_id == $("#history_query").val() && QueryHistory.cur_out_xml.length > 0) {
        for (var i = 0; i < columns.length; i++) {
            if ($($.parseXML(QueryHistory.cur_out_xml)).find('xmlRoot > ' + columns[i].value)[0])
                columns[i].is_default = true;
            else
                columns[i].is_default = false;
        }
    }

    obj_columns.push({ group: GetResource('S141027144850989', '导出栏位'), data: columns });

    Export(ajax_config, param, obj_columns);
}

FileManager.ExportExcel = function () {
    /*if ($("#branch_dept_id").attr("objid") == "") {
        Box.Alert(GRESX.HINTS.TITLE, GetResource("S180827220557414", "请选择所属分部"), null, { icon: 'hits.gif' });
        return;
    }*/
    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.belong_key = "FileSearch";
    ajax_config.height = 700;
    ajax_config.width = 900;
    ajax_config.handler = "CaseInfo.ashx";
    ajax_config.Call = "GetSearchFileExport";
    var param = {};
    //获取table的th的属性
    var order_by = "";
    var colname = "";
    $("#FileList").next().find(".layui-table-header").find("th").each(function () {
        var sort = $(this).find("span[class='layui-table-sort layui-inline']").attr("lay-sort");
        var col = $(this).attr("data-sort");
        if (sort) {
            order_by = sort;
            colname = col;
        }
    });
    param.orderby = order_by;
    param.colname = colname;
    /*var td = [];
    td = $("#table_FileList>thead").find("td");
    for (var i = 0; i < td.length; i++) {
        if ($(td[i]).attr("orderby")) {
            param.colname = $(td[i]).attr("colname");
            param.orderby = $(td[i]).attr("orderBy");
        }
    }*/
    param.customer = $("#customername").attr("objid");
    param.filetype = $("#filetype").attr("objid");
    param.update_s = $("#txtupdate_s").val();
    param.update_e = $("#txtupdate_e").val();
    param.update_isnull = ($("#txtupdate_isnull")[0].checked ? "on" : "");
    param.post_s = $("#txtpost_s").val();
    param.post_e = $("#txtpost_e").val();
    param.post_isnull = ($("#txtpost_isnull")[0].checked ? "on" : "");
    param.case_volume = $("#case_volume").val();
    param.fileclass = $("#selfileclass").attr("objid");
    param.applicant = $("#applicant").val();
    param.case_volume_customer = $("#case_volume_customer").val();
    param.app_no = $("#app_no").val().replace(/\./g, '');
    param.flow_direction = $("#flow_direction").attr("objid");
    param.sales = $("#sales").attr("objid");
    param.sales_help = $("#sales_help").attr("objid");
    param.upuser = $("#upuser").attr("objid");
    param.file_status = $("#selfile_status").val();
    param.app_date_s = $("#app_date_s").val();
    param.app_date_e = $("#app_date_e").val();
    param.app_date_isnull = ($("#app_date_isnull")[0].checked ? "on" : "");
    param.proc_receipt_date_s = $("#proc_receipt_date_s").val();
    param.proc_receipt_date_e = $("#proc_receipt_date_e").val();
    param.proc_receipt_date_isnull = ($("#proc_receipt_date_isnull")[0].checked ? "on" : "");
    param.file_receipt_date_s = $("#file_receipt_date_s").val();
    param.file_receipt_date_e = $("#file_receipt_date_e").val();
    param.introducer = $("#introducer").val();
    param.file_receipt_date_isnull = ($("#file_receipt_date_isnull")[0].checked ? "on" : "");
    param.is_close = $("#is_close").val();
    param.apply_type = $("#apply_type").attr("objid");    /*2016-5-13修改导出条件*/
    param.country = $("#country").attr("objid");
    param.i_ctrl_proc = $("#i_ctrl_proc").attr("objid");
    param.agency_id = $("#agency_id").attr("objid");
    param.proc_status = $("#proc_status").val();
    param.finish_date_s = $("#finish_date_s").val();
    param.finish_date_e = $("#finish_date_e").val();
    param.finish_date_isnull = ($("#finish_date_isnull")[0].checked ? "on" : "");
    param.case_type = $("#case_type").val();
    param.business_type_id = $("#business_type").attr("objid");
    param.user_assistant = $("#user_assistant").attr("objid");
    param.file_name = $("#file_name").val();
    param.file_name_batch = $("#file_name_batch").val();
    param.branch_dept_id = $("#branch_dept_id").attr("objid");
    param.customer_name_vague = $("#customer_name_vague").val();
    param.app_area_name = $("#app_area_name").val();
    param.customer_flow_user = $("#customer_flow_user").attr("objid");
    param.case_flow_user = $("#case_flow_user").attr("objid");
    param.dept_id = $("#p_case_info__charge_dept_id").attr("objid");
    param.sale_dept_id = $("#sale_dept_id").attr("objid");
    param.agency_user_id = $("#agency_user_id").attr("objid");

    param.PageAuth = PageAuth;
    param.receive_name = $("#receive_name").val();
    param.cus_receive_date_s = $("#cus_receive_date_s").val();
    param.cus_receive_date_e = $("#cus_receive_date_e").val();
    param.cus_receive_date_isnull = ($("#cus_receive_date_isnull")[0].checked ? "on" : "");
    param.issue_no = $("#issue_no").val();
    param.pub_no = $("#pub_no").val();
    param.issue_date_s = $("#issue_date_s").val();
    param.issue_date_e = $("#issue_date_e").val();
    param.issue_date_isnull = ($("#issue_date_isnull")[0].checked ? "on" : "");
    param.back_date_start = $("#back_date_start").val();
    param.back_date_end = $("#back_date_end").val();
    param.back_inventor_date_start = $("#back_inventor_date_start").val();
    param.back_inventor_date_end = $("#back_inventor_date_end").val();
    param.customer_status_id = $("#customer_status_id").attr("objid");
    param.revise_user_id = $("#revise_user_id").attr("objid");
    param.customer_code = $("#customer_code").val();
    param.ofileType = $("#ofileType").val();
    param.is_essence_exam = ($("#is_essence_exam")[0].checked ? "true" : "");
    param.is_confidential_request = ($("#is_confidential_request")[0].checked ? "true" : "");
    param.is_ahead_pub = ($("#is_ahead_pub")[0].checked ? "true" : "");
    param.is_fee_reduce = ($("#is_fee_reduce")[0].checked ? "true" : "");
    param.is_speed_checkd = ($("#is_speed_checkd")[0].checked ? "true" : "");
    param.is_request_das = ($("#is_request_das")[0].checked ? "true" : "");
    param.is_examine_delay = ($("#is_examine_delay")[0].checked ? "true" : "");
    param.hearing_the_case = ($("#hearing_the_case")[0].checked ? "true" : "");
    param.customer_country = $("#customer_country").attr("objid");
    param.from_stage = $("#from_stage").val();
    param.case_remark = $("#case_remark").val();
    param.pic_user = $("#pic_user").attr("objid");
    param.foreign_pic = $("#foreign_pic").attr("objid");
    param.case_status = $("#case_status").attr("objid");
    param.case_status_notequals = ($("#case_status_notequals")[0].checked ? "true" : "");
    param.apply_tags_id = $("#apply_tags_id").attr("objid");
    param.case_name = $("#case_name").val();
    param.proc_remark = $("#proc_remark").val();
    param.is_pat = 0;

    //派特恩查询条件
    param.payment_review_user_id = $("#payment_review_user_id").attr("objid");
    param.payment_review_time_s = $("#payment_review_time_s").val();
    param.payment_review_time_e = $("#payment_review_time_e").val();
    param.payment_review_time_isnull = ($("#payment_review_time_isnull")[0].checked ? "on" : "");
    param.pat_production_user_id = $("#pat_production_user_id").attr("objid");
    param.update_production_user_time_s = $("#update_production_user_time_s").val();
    param.update_production_user_time_e = $("#update_production_user_time_e").val();
    param.update_production_user_time_isnull = ($("#update_production_user_time_isnull")[0].checked ? "on" : "");
    param.pat_patauditor_user_id = $("#pat_patauditor_user_id").attr("objid");
    param.update_patauditor_user_time_s = $("#update_patauditor_user_time_s").val();
    param.update_patauditor_user_time_e = $("#update_patauditor_user_time_e").val();
    param.update_patauditor_user_time_isnull = ($("#update_patauditor_user_time_isnull")[0].checked ? "on" : "");
    param.pat_allocator_user_id = $("#pat_allocator_user_id").attr("objid");
    param.update_allocator_user_time_s = $("#update_allocator_user_time_s").val();
    param.update_allocator_user_time_e = $("#update_allocator_user_time_e").val();
    param.file_remark = $("#file_remark").val();
    param.update_allocator_user_time_isnull = ($("#update_allocator_user_time_isnull")[0].checked ? "on" : "");
    param.column1 = $("#column_1").val();
    param.column2 = $("#column_2").val();
    param.column3 = $("#column_3").val();
    param.column4 = $("#column_4").val();
    param.column5 = $("#column_5").val();
    param.inventor_name = $("#inventor_name").val();
    param.contact_name_zf = $("#contact_name_zf").val();

    //#region 导出栏位
    var obj_columns = []; //默认不选择的栏位设置 is_default: false  
    var columns1 = []; //案件信息
    var columns2 = []; //著录项目
    var columns3 = []; //扩展信息
    var columns4 = []; //处理事项
    var columns5 = []; //文件信息

    columns1.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    columns1.push({ value: "case_name", text: GetResource('S140814204116996', '案件名称') });
    columns1.push({ value: "apply_type", text: GetResource('S140821164234972', '申请类型') });
    columns1.push({ value: "sales", text: GetResource('S140821194410109', '业务人员'), is_default: false });
    columns1.push({ value: "sales_dept_name", text: GetResource('S160203134745618', '业务员部门'), is_default: false });
    columns1.push({ value: "business_type", text: GetResource('S140901115419492', '业务类型') });
    columns1.push({ value: "case_status", text: GetResource('S140822171057018', '案件状态') });
    columns1.push({ value: "case_volume_customer", text: GetResource('S140901115322880', '客户文号') });
    columns1.push({ value: "app_no", text: GetResource('S140822170832920', '申请号') });
    columns1.push({ value: "app_date", text: GetResource('S140822170743359', '申请日') });
    columns1.push({ value: "pub_no", text: GetResource('S140822170945008', '公开号') });
    columns1.push({ value: "pub_date", text: GetResource('S140822170902592', '公开日') });
    columns1.push({ value: "issue_no", text: GetResource('S140822171117625', '公告号') });
    columns1.push({ value: "issue_date", text: GetResource('S140822171028423', '公告日') });
    columns1.push({ value: "flow_direction", text: GetResource('S140901115438618', '案件流向') });

    columns1.push({ value: "pic", text: GetResource('S160411145409233', '案件处理人'), is_default: false });

    if (GetPublishConfig("ZBSD", "is_show_column")) {
        if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
            columns1.push({ value: "user_assistant_name", text: GetResource('S250523201311872', '案件处理人助理') });
        }

    }

    columns1.push({ value: "flow_user_id", text: GetResource('S160411145409233', '案件流程人员'), is_default: false });
    columns1.push({ value: "case_pic", text: GetResource('S170715174324145', '案件对外处理人'), is_default: false });
    columns1.push({ value: "proc_foreign_pic", text: GetResource('S170920123426822', '事项对外处理人'), is_default: false });
    columns1.push({ value: "revise", text: GetResource('S170911151347295', '案件核稿人员'), is_default: false });
    columns1.push({ value: "remark", text: GetResource('S140905200748375', '案件备注') });
    columns1.push({ value: "charge_date", text: GetResource("S150408212924417", "委案日期") });
    columns1.push({ value: "create_time", text: GetResource("S150226092116115", "开卷日期") });
    columns1.push({ value: "sales_email", text: GetResource('S180928164126540', '业务人员邮箱'), is_default: false });
    columns1.push({ value: "certificate_no", text: GetResource('S140822171134848', '证书号'), is_default: false });
    columns1.push({ value: "sales_help", text: GetResource('S180116142441143', '业务助理'), is_default: false });
    columns1.push({ value: 'hearing_the_case', text: GetResource('S181023162958161', '是否预审案件') });
    columns1.push({ value: 'related_volume_sa', text: GetResource('S181023162958162', '是否同日申请') });
    columns1.push({ value: "from_stage", text: GetResource('S140901123355392', '起始阶段'), is_default: false });
    columns1.push({ value: "apply_tags", text: GetResource('S160803103154175', '专利标签'), is_default: false });
    columns1.push({ value: 'customer_status', text: GetResource('S160318091131220', '客户状态') });
    columns1.push({ value: "cus_country", text: GetResource('S220113154618911', '客户所属国(地区)'), is_default: false });
    columns1.push({ value: "cus_dept_name", text: GetResource('S170715174221263', '客户所属分部'), is_default: false });
    columns1.push({ value: 'contact', text: GetResource('S170715174324924', '案件客户联系人'), is_default: false });
    columns1.push({ value: "customer_code", text: GetResource('S140825201856133', '客户代码') });
    columns1.push({ value: "customer_name", text: GetResource('S140821182822919', '客户名称') });
    columns1.push({ value: "customer_type", text: GetResource('S140827094619190', '客户等级'), is_default: false });
    columns1.push({ value: "product_name", text: GetResource('S160709095542937', '产品类别'), is_default: false });
    if (GetPublishConfig('ZhongYi', '2023_0')) {
        columns1.push({ value: 'favorite', text: GetResource('S170401173019385', '我的关注') });
        columns1.push({ value: 'favorite_remark', text: GetResource('S231127095935474', '关注备注') });
    }
    if (GetPublishConfig("CustomerInfo", "export_info")) {
        if (PageAuth.indexOf("Ec") > -1) {
            columns1.push({ value: 'contact_email', text: GetResource('S180319181114954', '案件客户联系人邮箱'), is_default: false });
            columns1.push({ value: "customer_tel", text: GetResource('S171025185525200', '客户电话') });
        }
    } else {
        columns1.push({ value: 'contact_email', text: GetResource('S180319181114954', '案件客户联系人邮箱'), is_default: false });
        columns1.push({ value: "customer_tel", text: GetResource('S171025185525200', '客户电话') });
    }
    if (FileManager.HKDZ2601) {
        columns1.push({ value: 'contact_name_zf', text: GetResource('S240411112136353', '专利负责人') });
    }
    if (FileManager.fieldColumn) {
        for (var i = 0; i < FileManager.fieldColumn.length; i++) {
            columns1.push({ value: FileManager.fieldColumn[i].column_id, text: FileManager.fieldColumn[i].column_name, is_default: false });
        }
    }
    columns2.push({ value: "case_type", text: GetResource('S140830213547543', '案件类型') });
    columns2.push({ value: "country", text: GetResource('S140901115346358', '国家(地区)') });
    columns2.push({ value: "priority_date", text: GetResource('S150311194328332', '第一优先权日') });
    columns2.push({ value: "priority_no", text: GetResource('S170706165553023', '第一优先权号') });
    columns2.push({ value: "applicants", text: GetResource('S140814212259786', '申请人'), is_default: false });
    columns2.push({ value: "applicants_en", text: GetResource('S140814212259786', '申请人(英文)'), is_default: false  });
    columns2.push({ value: "inverters", text: GetResource('S140825203153404', '发明人'), is_default: false });
    columns2.push({ value: "agency", text: GetResource("S141106084922906", "代理机构") });
    columns2.push({ value: "is_fee_reduce", text: GetResource('S170715174316430', '是否请求费用减缓') });
    columns2.push({ value: "is_confidential_request", text: GetResource('S170715174316430', '请求保密审查') });
    columns2.push({ value: "hearing_the_case", text: GetResource('S170715174316430', '是否预审案件') });
    columns2.push({ value: "is_ahead_pub", text: GetResource("S170329162611438", "是否提前公布") });
    columns2.push({ value: "is_essence_exam", text: GetResource("S170329162417935", "是否同时提实审") });
    columns2.push({ value: "apply_name", text: GetResource("S140905195017714", "提案名称") });
    columns2.push({ value: "is_speed_checkd", text: GetResource('S171103173735807', '是否优先审查') });
    columns2.push({ value: "app_area_name", text: GetResource('S180205191439877', '第一申请人行政区划') });
    columns2.push({ value: "app_addres", text: GetResource('S170715174221263', '第一申请人地址') });

    columns3.push({ value: "dept_name", text: GetResource('S170419160623634', '所属分部') });
    columns3.push({ value: 'new_application_pic', text: GetResource('S180517150321273', '新申请处理人'), is_default: false });
    columns3.push({ value: 'charge_dept', text: GetResource('S140901140456599', '承办部门'), is_default: false });
    columns3.push({ value: 'spec_pages', text: GetResource('S140901140456599', '说明书(包括附图和序列表)页数'), is_default: false });
    columns3.push({ value: "introducer", text: GetResource('S180421100702035', '外部案源人'), is_default: false });
    columns3.push({ value: "inside_introducer", text: GetResource('S180421101224552', '内部案源人'), is_default: false });
    if (FileManager.JIAQUAN) {
        param.is_vip = $("#is_vip").val();
        param.specialtyid = $("#specialtyid").val();
        columns3.push({ value: "specialtyid", text: GetResource('S230526093441148', '专业领域') });
        columns1.push({ value: "is_vip", text: GetResource('S230530111921803', '是否大客户') });
    }

    columns4.push({ value: "ctrl_proc", text: GetResource('S140821164247623', '处理事项') });
    columns4.push({ value: "int_due_date", text: GetResource('S140823161428652', '内部期限') });
    columns4.push({ value: "cus_due_date", text: GetResource('S140821164259916', '客户期限') });
    columns4.push({ value: "legal_due_date", text: GetResource('S140929103018129', '官方期限') });
    columns4.push({ value: "file_name", text: GetResource('S140912142011888', '附件名称') });
    columns4.push({ value: "file_type", text: GetResource('S140903173153758', '文件类型') });
    columns4.push({ value: "file_desc", text: GetResource('S140929102908220', '文件描述') });
    columns4.push({ value: "doc_no", text: GetResource('S140906150027560', '发文序列号') });
    columns4.push({ value: "proc_pic", text: GetResource('S170107163446740', '处理事项处理人'), is_default: false });
    columns4.push({ value: "contract_code", text: GetResource('S190514120205776', '案件合同号'), is_default: false });
    columns4.push({ value: "proc_pic_dept", text: GetResource('S170911151429482', '处理事项处理人部门') });
    columns4.push({ value: "proc_note", text: GetResource("S141015142024952", "处理事项备注") });
    columns4.push({ value: "review_stage", text: GetResource("S150203143844255", "案件阶段") });
    columns4.push({ value: "proc_pic_email", text: GetResource('S170715174328576', '处理事项处理人邮箱'), is_default: false });
    columns4.push({ value: "back_date", text: GetResource('S150808153434141', '返稿日') });
    columns4.push({ value: "back_inventor_date", text: GetResource('S181219100902484', '返发明人日') });
    columns4.push({ value: "proc_receipt_date", text: GetResource('S160113154334081', '事项收文日期'), is_default: false });
    columns4.push({ value: "proc_status", text: GetResource('S160116143456059', '处理事项状态'), is_default: false });
    columns4.push({ value: "finish_date", text: GetResource('S150603195810611', '处理事项完成日'), is_default: false });



    columns5.push({ value: "doc_examiner", text: GetResource('S141222151826296', '审查员'), is_default: false });
    columns5.push({ value: "doc_examiner_tel", text: GetResource('S140906150720414', '审查员电话 '), is_default: false  });
    columns5.push({ value: "doc_office", text: GetResource('S140906150226338', '来文部门'), is_default: false });
    columns5.push({ value: "fawenxlh", text: '通知书发文序列号', is_default: false });
    if (GetPublishConfig('PaiTeEn', 'SheWai') || GetPublishConfig('FileSearch', 'PiaoJu')) {
        columns5.push({ value: "post_date", text: GetResource('S150806213511698', '发文日') });
        columns5.push({ value: "JiaoFeiR", text: GetResource('S230511140836243', '收据缴费抬头'), is_default: false });
        columns5.push({ value: "PiaoJuJE", text: GetResource('S171219101843722', '收据金额'), is_default: false });
        columns5.push({ value: "PiaoJuRQ", text: GetResource('S230511101434375', '收据开票日期'), is_default: false });

        columns5.push({ value: "itemName", text: GetResource('S230511101434375', '收据费用明细'), is_default: false });
        columns5.push({ value: "QPH ", text: GetResource('S210105082735615', '取票码'), is_default: false });
        param.is_pat = 1;
    } else {
        columns5.push({ value: "post_date", text: GetResource('S150806213511698', '官方发文日') });
        param.is_pat = 0;
    }
    columns5.push({ value: "upload_user", text: GetResource('S140912142220979', '上传者') });
    columns5.push({ value: "upload_time", text: GetResource('S140816152026549', '上传时间') });
    columns5.push({ value: "receive_name", text: GetResource('S150815095253582', '领取人'), is_default: false  });
    columns5.push({ value: "cus_receive_date", text: GetResource('S150815095208639', '客户领取日期'), is_default: false  });
    columns5.push({ value: "file_receipt_date", text: GetResource('S160113154334081', '文件收文日期'), is_default: false  });
    columns5.push({ value: "bill_number", text: GetResource('S151012094216735', '收据号'), is_default: false  });
  
    

    columns5.push({ value: "pay_due_date", text: GetResource('S140929103018129', '缴费期限'), is_default: false });
    columns5.push({ value: "file_status", text: GetResource('S141107200224536', '处理状态'), is_default: false });
    columns5.push({ value: "file_remark", text: GetResource('S230724092526633', '文件备注'), is_default: false });

    columns5.push({ value: "priority_name", text: GetResource('S240304205402337', '难度等级'), is_default: false });
    columns5.push({ value: "update_allocator_user_time", text: GetResource('S240519211223440', '分配时间'), is_default: false });
    columns5.push({ value: "pat_allocator_user", text: GetResource('S240226114925652', '分配者'), is_default: false });
    columns5.push({ value: "update_patauditor_user_time", text: GetResource('S240519211251767', '审核时间'), is_default: false });
    columns5.push({ value: "pat_patauditor_user", text: GetResource('S240516144803193', '审核者'), is_default: false });
    columns5.push({ value: "update_production_user_time", text: GetResource('S240519211323265', '制作时间'), is_default: false });
    columns5.push({ value: "pat_production_user", text: GetResource('S191119161423418', '制作者'), is_default: false });
    columns5.push({ value: "payment_review_time", text: GetResource('S240519211349807', '复核时间'), is_default: false });
    columns5.push({ value: "payment_review_user", text: GetResource('S240313094238014', '复核者'), is_default: false });
    columns5.push({ value: "payment_review", text: GetResource('S240419173944483', '复核状态'), is_default: false });

    if ($("#case_type").val() == "0E8A4B7F-E407-4EFF-9562-3809BF484207") {
        columns3.push({ value: "issue_no", text: GetResource('S141009101941489', '注册号') });
        columns3.push({ value: "register_type_code", text: GetResource('S160308101917419', '商标类别') });
        columns3.push({ value: "authorize_date", text: GetResource('S140930154518982', '获批日') });
        columns3.push({ value: "expire_date", text: GetResource('S141009102119489', '终止日') });
    }

    if (FileManager.isZY) {
        columns5.push({ value: 'flow_name', text: GetResource('S140922133451105', '流程阶段'), is_default: false });
        columns5.push({ value: 'submit_user', text: GetResource('S260224153049547', '核稿审核人'), is_default: false });
        columns5.push({ value: 'submit_time', text: GetResource('S260224153532513', '核稿流程提交时间'), is_default: false });
    }
    //#endregion


    if ($("#is_query_save")[0].checked && $("#query_save_title").val() == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715174319250', '记住条件时，请输入标题！'), null, { icon: 'hits.gif', width: '200', height: '60' });
        return;
    }
    //记录导出条件
    if (QueryHistory.cur_query_id == $("#history_query").val() && QueryHistory.cur_out_xml.length > 0) {
        for (var i = 0; i < (columns1).length; i++) {
            if ($($.parseXML(QueryHistory.cur_out_xml)).find('xmlRoot > ' + columns1[i].value)[0])
                columns1[i].is_default = true;
            else
                columns1[i].is_default = false;
        }
        for (var i = 0; i < (columns2).length; i++) {
            if ($($.parseXML(QueryHistory.cur_out_xml)).find('xmlRoot > ' + columns2[i].value)[0])
                columns2[i].is_default = true;
            else
                columns2[i].is_default = false;
        }
        for (var i = 0; i < (columns3).length; i++) {
            if ($($.parseXML(QueryHistory.cur_out_xml)).find('xmlRoot > ' + columns3[i].value)[0])
                columns3[i].is_default = true;
            else
                columns3[i].is_default = false;
        }
        for (var i = 0; i < (columns4).length; i++) {
            if ($($.parseXML(QueryHistory.cur_out_xml)).find('xmlRoot > ' + columns4[i].value)[0])
                columns4[i].is_default = true;
            else
                columns4[i].is_default = false;
        }
        for (var i = 0; i < (columns5).length; i++) {
            if ($($.parseXML(QueryHistory.cur_out_xml)).find('xmlRoot > ' + columns5[i].value)[0])
                columns5[i].is_default = true;
            else
                columns5[i].is_default = false;
        }

    }

    obj_columns.push({ group: GetResource('S140923212003271', '案件信息'), data: columns1 });
    obj_columns.push({ group: GetResource('S140903220206444', '著录项目'), data: columns2 });
    obj_columns.push({ group: GetResource('S140822152557243', '扩展信息'), data: columns3 });
    obj_columns.push({ group: GetResource('S140821164247623', '处理事项'), data: columns4 });
    obj_columns.push({ group: GetResource('S170725175623129', '文件信息'), data: columns5 });


    Export(ajax_config, param, obj_columns);
}


FileManager.ExportFileListByChecked = function () {
    if (FileList.table.getCheckColumnData('FileList', 'file_id').length == 0) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S200511112239594', '请选择需要处理的文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.belong_key = "FileSearch";
    ajax_config.height = 500;
    ajax_config.width = 850;
    ajax_config.handler = "CaseInfo.ashx";
    ajax_config.Call = "ExportFileListByFileId";
    var param = {};
    //获取table的th的属性
    var order_by = "";
    var colname = "";
    $("#FileList").next().find(".layui-table-header").find("th").each(function () {
        var sort = $(this).find("span[class='layui-table-sort layui-inline']").attr("lay-sort");
        var col = $(this).attr("data-sort");
        if (sort) {
            order_by = sort;
            colname = col;
        }
    });
    param.orderby = order_by;
    param.colname = colname;
    param.PageAuth = PageAuth;
    param.file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');

    var obj_columns = []; //默认不选择的栏位设置 is_default: false  
    var columns1 = []; //案件信息
    var columns2 = []; //著录项目
    var columns3 = []; //扩展信息
    var columns4 = []; //处理事项
    var columns5 = []; //文件信息

    columns1.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    columns1.push({ value: "case_name", text: GetResource('S140814204116996', '案件名称') });
    columns1.push({ value: "apply_type", text: GetResource('S140821164234972', '申请类型') });
    columns1.push({ value: "sales", text: GetResource('S140821194410109', '业务人员'), is_default: false });
    columns1.push({ value: "sales_dept_name", text: GetResource('S160203134745618', '业务员部门'), is_default: false });
    columns1.push({ value: "business_type", text: GetResource('S140901115419492', '业务类型') });
    columns1.push({ value: "case_status", text: GetResource('S140822171057018', '案件状态') });
    columns1.push({ value: "case_volume_customer", text: GetResource('S140901115322880', '客户文号') });
    columns1.push({ value: "app_no", text: GetResource('S140822170832920', '申请号') });
    columns1.push({ value: "app_date", text: GetResource('S140822170743359', '申请日') });
    columns1.push({ value: "pub_no", text: GetResource('S140822170945008', '公开号') });
    columns1.push({ value: "pub_date", text: GetResource('S140822170902592', '公开日') });
    columns1.push({ value: "issue_no", text: GetResource('S140822171117625', '公告号') });
    columns1.push({ value: "issue_date", text: GetResource('S140822171028423', '公告日') });
    columns1.push({ value: "flow_direction", text: GetResource('S140901115438618', '案件流向') });
    columns1.push({ value: "pic", text: GetResource('S160411145409233', '案件处理人'), is_default: false });
    columns1.push({ value: "flow_user_id", text: GetResource('S160411145409233', '案件流程人员'), is_default: false });
    columns1.push({ value: "case_pic", text: GetResource('S170715174324145', '案件对外处理人'), is_default: false });
    columns1.push({ value: "proc_foreign_pic", text: GetResource('S170920123426822', '事项对外处理人'), is_default: false });
    columns1.push({ value: "revise", text: GetResource('S170911151347295', '案件核稿人员'), is_default: false });
    columns1.push({ value: "remark", text: GetResource('S140905200748375', '案件备注') });
    columns1.push({ value: "charge_date", text: GetResource("S150408212924417", "委案日期") });
    columns1.push({ value: "create_time", text: GetResource("S150226092116115", "开卷日期") });
    columns1.push({ value: "sales_email", text: GetResource('S180928164126540', '业务人员邮箱'), is_default: false });
    columns1.push({ value: "certificate_no", text: GetResource('S140822171134848', '证书号'), is_default: false });
    columns1.push({ value: "sales_help", text: GetResource('S180116142441143', '业务助理'), is_default: false });
    columns1.push({ value: 'hearing_the_case', text: GetResource('S181023162958161', '是否预审案件') });
    columns1.push({ value: "apply_tags", text: GetResource('S160803103154175', '专利标签'), is_default: false });
    columns1.push({ value: 'contact', text: GetResource('S170715174324924', '案件客户联系人'), is_default: false });
    columns1.push({ value: "customer_code", text: GetResource('S140825201856133', '客户代码') });
    columns1.push({ value: "customer_name", text: GetResource('S140821182822919', '客户名称') });

    if (GetPublishConfig("ZBSD", "is_show_column")) {
        if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
            columns1.push({ value: "user_assistant_name", text: GetResource('S250523201311872', '案件处理人助理') });
        }

    }

    if (GetPublishConfig('ZhongYi', '2023_0')) {
        columns1.push({ value: 'favorite', text: GetResource('S170401173019385', '我的关注') });
        columns1.push({ value: 'favorite_remark', text: GetResource('S231127095935474', '关注备注') });
    }
    if (GetPublishConfig("CustomerInfo", "export_info")) {
        if (PageAuth.indexOf("Ec") > -1) {
            columns1.push({ value: 'contact_email', text: GetResource('S180319181114954', '案件客户联系人邮箱'), is_default: false });
            columns1.push({ value: "customer_tel", text: GetResource('S171025185525200', '客户电话') });
        }
    } else {
        columns1.push({ value: 'contact_email', text: GetResource('S180319181114954', '案件客户联系人邮箱'), is_default: false });
        columns1.push({ value: "customer_tel", text: GetResource('S171025185525200', '客户电话') });
    }
    if (FileManager.HKDZ2601) {
        columns1.push({ value: 'contact_name_zf', text: GetResource('S240411112136353', '专利负责人') });
    }
    columns2.push({ value: "case_type", text: GetResource('S140830213547543', '案件类型') });
    columns2.push({ value: "country", text: GetResource('S140901115346358', '国家(地区)') });
    columns2.push({ value: "priority_date", text: GetResource('S150311194328332', '第一优先权日') });
    columns2.push({ value: "priority_no", text: GetResource('S170706165553023', '第一优先权号') });
    columns2.push({ value: "applicants", text: GetResource('S140814212259786', '申请人'), is_default: false });
    columns2.push({ value: "applicants_en", text: GetResource('S140814212259786', '申请人(英文)'), is_default: false });
    columns2.push({ value: "inverters", text: GetResource('S140825203153404', '发明人'), is_default: false });
    columns2.push({ value: "agency", text: GetResource("S141106084922906", "代理机构") });
    columns2.push({ value: "is_fee_reduce", text: GetResource('S170715174316430', '是否请求费用减缓') });
    columns2.push({ value: "is_confidential_request", text: GetResource('S170715174316430', '请求保密审查') });
    columns2.push({ value: "hearing_the_case", text: GetResource('S170715174316430', '是否预审案件') });
    columns2.push({ value: "is_ahead_pub", text: GetResource("S170329162611438", "是否提前公布") });
    columns2.push({ value: "is_essence_exam", text: GetResource("S170329162417935", "是否同时提实审") });
    columns2.push({ value: "apply_name", text: GetResource("S140905195017714", "提案名称") });
    columns2.push({ value: "is_speed_checkd", text: GetResource('S171103173735807', '是否优先审查') });
    columns2.push({ value: "app_area_name", text: GetResource('S180205191439877', '第一申请人行政区划') });
    columns2.push({ value: "app_addres", text: GetResource('S170715174221263', '第一申请人地址') });

    columns3.push({ value: "dept_name", text: GetResource('S170419160623634', '所属分部') });
    columns3.push({ value: 'new_application_pic', text: GetResource('S180517150321273', '新申请处理人'), is_default: false });
    columns3.push({ value: 'charge_dept', text: GetResource('S140901140456599', '承办部门'), is_default: false });
    columns3.push({ value: 'spec_pages', text: GetResource('S140901140456599', '说明书(包括附图和序列表)页数'), is_default: false });
    columns3.push({ value: 'introducer', text: GetResource('S180421100702035', '外部案源人'), is_default: false });
    columns3.push({ value: "inside_introducer", text: GetResource('S180421101224552', '内部案源人'), is_default: false });
    if (FileManager.JIAQUAN) {
        columns3.push({ value: "specialtyid", text: GetResource('S230526093441148', '专业领域') });
        columns1.push({ value: "is_vip", text: GetResource('S230530111921803', '是否大客户') });
    }

    columns4.push({ value: "ctrl_proc", text: GetResource('S140821164247623', '处理事项') });
    columns4.push({ value: "int_due_date", text: GetResource('S140823161428652', '内部期限') });
    columns4.push({ value: "cus_due_date", text: GetResource('S140821164259916', '客户期限') });
    columns4.push({ value: "legal_due_date", text: GetResource('S140929103018129', '官方期限') });
    columns4.push({ value: "file_name", text: GetResource('S140912142011888', '附件名称') });
    columns4.push({ value: "file_type", text: GetResource('S140903173153758', '文件类型') });
    columns4.push({ value: "file_desc", text: GetResource('S140929102908220', '文件描述') });
    columns4.push({ value: "doc_no", text: GetResource('S140906150027560', '发文序列号') });
    columns4.push({ value: "proc_pic", text: GetResource('S170107163446740', '处理事项处理人'), is_default: false });
    columns4.push({ value: "contract_code", text: GetResource('S190514120205776', '案件合同号'), is_default: false });
    columns4.push({ value: "proc_pic_dept", text: GetResource('S170911151429482', '处理事项处理人部门') });
    columns4.push({ value: "proc_note", text: GetResource("S141015142024952", "处理事项备注") });
    columns4.push({ value: "review_stage", text: GetResource("S150203143844255", "案件阶段") });
    columns4.push({ value: "proc_pic_email", text: GetResource('S170715174328576', '处理事项处理人邮箱'), is_default: false });
    columns4.push({ value: "back_date", text: GetResource('S150808153434141', '返稿日') });
    columns4.push({ value: "back_inventor_date", text: GetResource('S181219100902484', '返发明人日') });
    columns4.push({ value: "proc_receipt_date", text: GetResource('S160113154334081', '事项收文日期'), is_default: false });
    columns4.push({ value: "proc_status", text: GetResource('S160116143456059', '处理事项状态'), is_default: false });

    columns5.push({ value: "doc_examiner", text: GetResource('S141222151826296', '审查员') });
    columns5.push({ value: "doc_examiner_tel", text: GetResource('S140906150720414', '审查员电话 ') });
    columns5.push({ value: "doc_office", text: GetResource('S140906150226338', '来文部门') });
    columns5.push({ value: "fawenxlh", text: '通知书发文序列号', is_default: false });
    if (GetPublishConfig('PaiTeEn', 'SheWai')) {
        columns5.push({ value: "post_date", text: GetResource('S150806213511698', '发文日') });
    } else {
        columns5.push({ value: "post_date", text: GetResource('S150806213511698', '官方发文日') });
    }
    columns5.push({ value: "upload_time", text: GetResource('S140816152026549', '上传时间') });
    columns5.push({ value: "receive_name", text: GetResource('S150815095253582', '领取人') });
    columns5.push({ value: "cus_receive_date", text: GetResource('S150815095208639', '客户领取日期') });
    columns5.push({ value: "file_receipt_date", text: GetResource('S160113154334081', '文件收文日期') });
    columns5.push({ value: "bill_number", text: GetResource('S151012094216735', '收据号') });
    columns5.push({ value: "PiaoJuJE", text: GetResource('S171219101843722', '收据金额') });
    columns5.push({ value: "file_status", text: GetResource('S141107200224536', '处理状态'), is_default: false });
    columns5.push({ value: "file_remark", text: GetResource('S141107200224536', '文件备注'), is_default: false });

    if (FileManager.isZY) {
        columns5.push({ value: 'flow_name', text: GetResource('S140922133451105', '流程阶段'), is_default: false });
        columns5.push({ value: 'submit_user', text: GetResource('S260224153049547', '核稿审核人'), is_default: false });
        columns5.push({ value: 'submit_time', text: GetResource('S260224153532513', '核稿流程提交时间'), is_default: false });
    }


    if ($("#case_type").val() == "0E8A4B7F-E407-4EFF-9562-3809BF484207") {
        columns3.push({ value: "issue_no", text: GetResource('S141009101941489', '注册号') });
        columns3.push({ value: "register_type_code", text: GetResource('S160308101917419', '商标类别') });
        columns3.push({ value: "authorize_date", text: GetResource('S140930154518982', '获批日') });
        columns3.push({ value: "expire_date", text: GetResource('S141009102119489', '终止日') });
    }





    obj_columns.push({ group: GetResource('S140923212003271', '案件信息'), data: columns1 });
    obj_columns.push({ group: GetResource('S140903220206444', '著录项目'), data: columns2 });
    obj_columns.push({ group: GetResource('S140822152557243', '扩展信息'), data: columns3 });
    obj_columns.push({ group: GetResource('S140821164247623', '处理事项'), data: columns4 });
    obj_columns.push({ group: GetResource('S170725175623129', '文件信息'), data: columns5 });


    Export(ajax_config, param, obj_columns);
}

FileManager.AddFilename = function () {
    var count = $("#tdfilename").find('select').length - 1;
    if (FileManager.DownLoadFileName.length > 0) {
        var option = [];
        for (var i = 0; i < FileManager.DownLoadFileName.length; i++) {
            var row = FileManager.DownLoadFileName[i];
            option.push("<option value='" + row.value + "'  >" + row["text_" + top.window.GLanguage] + "</option>");
        }


    }
    var _del = "<span title='删除'  style='cursor:pointer;' class='img_show' onclick=\"FileManager.DelSubject(this,'selfilename" + (count + 1) + "','txtfilename" + (count + 1) + "')\">&nbsp;</span>";
    var _sel = "<select id='selfilename" + (count + 1) + "' onchange=\" FileManager.filenameChange('selfilename" + (count + 1) + "','txtfilename" + (count + 1) + "')\"   class='select_auto' style='width: 120px; margin:4px;'> " +
        "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>" + option.join("")
        + "</select><input type='text' id='txtfilename" + (count + 1) + "' class='input_auto' style='width: 120px;display: none;' />";

    $("#tdfilename").find("a[class='img_hide']").before(_del + _sel);
}

FileManager.DelSubject = function (_this, _obj01, _obj02) {
    $("#" + _obj01).remove();
    $("#" + _obj02).remove();
    $(_this).remove();
}
FileManager.filenameChange = function (_obj01, _obj02) {
    if ($("#" + _obj01).val() == "fixtxt") {
        $("#" + _obj02).show();
    }
    else {
        $("#" + _obj02).hide();
        $("#" + _obj02).val('');
    }

}

//罗思定制 单个删除文件（一并删除处理事项）
FileManager.SingleDel = function (file_no, file_id, file_name) {
    FileManager.BatchDel(null,file_id);
}

//文件处理信息维护
FileManager.ShowEditFileReceiveInfo = function (file_no, file_id, file_name) {
    $.dialog({
        title: file_name, id: "FileReceive", max: false, min: false, width: 960, height: 420,
        content: 'url:IhgForms/Patent/FileReceiveInfo.aspx?objid=' + file_id,
        lock: true,
        max: false,
        min: false,
        resize: false,
        init: function () {
            var context = lhgdialog.list['FileReceive'].content;
            if (context != null && context.FileManager != null) {
                context.FileManager.FileReceiveOnReady();
            }
        },
        close: function () {
            var context = lhgdialog.list['FileReceive'].content;
            if (context != null && context.FileManager.FileReceiveInfo) {
                var tr = $("#" + file_no);
                tr.find("td").eq(3).text(context.FileManager.FileReceiveInfo.file_status);

            }
        }
    });
}

//选择要生成模板
FileManager.SelectTemplate = function () {
    var sheet = JClient.Object.FileList;
    var _file_ids = sheet.getSelectedPKId();
    //var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    if (_file_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    $.dialog({
        title: GetResource('S170715174317183', '选择模板'), id: "selecttemplate", max: false, min: false, width: 660, height: 600,
        content: 'url:IhgForms/IhgTemplate.aspx',
        lock: true,
        max: false,
        min: false,
        resize: false,
        init: function () {

            var context = lhgdialog.list['selecttemplate'].content;
            if (context != null && context.templateList != null) {

                context.templateList.IhgTemplateOnReady();
                context.templateList.file_id = _file_ids;
            }
        }
    });
}



FileManager.ShowAllEditFileReceiveInfo = function () {

    /*var sheet = JClient.Object.FileList;
    var _file_ids = sheet.getSelectedPKId();
    var _file_no = sheet.getSelectedIds();*/
    var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    var _file_no = FileList.table.getCheckColumnData('FileList', 'file_no');

    if (_file_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    var width = 960;
    var height = 360;
    if (FileManager.isKLFD202507) {
        width = 1060
        height = 720
    }

    $.dialog({
        title: GetResource('S150815153851135', '批量修改处理状态'), id: "FileReceive", max: false, min: false, width: width, height: height,
        content: 'url:IhgForms/Patent/FileReceiveInfo.aspx',
        lock: true,
        max: false,
        min: false,
        resize: false,
        init: function () {
            var context = lhgdialog.list['FileReceive'].content;
            if (context != null && context.FileManager != null) {
                context.FileManager.file_id = _file_ids;
                context.FileManager.FileReceiveOnReady(true);
            }
        },
        close: function () {

            var context = lhgdialog.list['FileReceive'].content;
            if (context != null && context.FileManager.FileReceiveInfo) {

                for (var i = 0; i < _file_no.split(';').length; i++) {
                    var tr = $("#" + _file_no.split(';')[i]);
                    tr.find("td").eq(3).text(context.FileManager.FileReceiveInfo.file_status);
                }

                FileManager.SearchFile(false);
            }
        }
    });
}

FileManager.BatchCheckAllFile = function () {
    var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    var _file_no = FileList.table.getCheckColumnData('FileList', 'file_no');

    if (_file_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    function Success(_Meta) {
        if (_Meta) {
            if (_Meta.ClientInfo.Result) {             
                Box.Tips(GRESX.HINTS.TITLE, 2, GetResource('S240519132251792', '复核成功！'), null, { icon: 'hits.gif', width: '250', height: '60' });
            } else {
                Box.Tips(GRESX.HINTS.TITLE, 2, GetResource('S240519132251792', '复核成功！'), null, { icon: 'hits.gif', width: '250', height: '60' });
            }
        }
    }
    Ajax.Request('Common.ashx', { Call: 'BatchCheckFilePTE', file_ids: _file_ids }, Success);
}

FileManager.FileReceiveOnReady = function (isbatch) {
    FileManager.isSaveReceiveInfo = false;
    var items = [];
    var btn = {}
    btn.id = 'save';
    btn.type = 'button';
    btn.text = GetResource('S140808093304465', '确定');
    btn.title = GetResource('S140808093304465', '确定');
    btn.bodyStyle = 'save';
    btn.useable = 'T';
    btn.handler = function () { FileManager.SaveFileReceiveInfo(isbatch) };
    items.push(btn);
    items.push("-");

    btn = {};
    btn.id = "undo";
    btn.type = "button";
    btn.text = GetResource('S140808093322163', '取消');
    btn.title = GetResource('S140808093322163', '取消');
    btn.bodyStyle = "undo";
    btn.useable = "T";
    btn.handler = function () {
        var api = frameElement.api
        api.close();
    };
    items.push(btn);
    items.push("-");



    if (FileManager.isKLFD202507 && isbatch) {
        btn = {};
        btn.id = "saveinfo";
        btn.type = "button";
        btn.text = GetResource('S140808093322163', '保存');
        btn.title = GetResource('S140808093322163', '保存');
        btn.bodyStyle = "save";
        btn.useable = "F";
        btn.handler = function () {
            if ($("#file_status").val() == 'SN' && (!$("#remark").val() || !$("#cus_receive_date").val())) {
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S251129143252590', '客户领取日期或备注不能为空'), null, { icon: 'hits.gif', width: '250', height: '60' });
                return;
            }
            Box.Confirm(
                GRESX.HINTS.TITLE,
                GetResource('S251129145735442', '是否保存？'),
                function () {
                    FileManager.isSaveReceiveInfo = true;

                    setTimeout(function () {
                        Box.Alert(
                            GRESX.HINTS.TITLE,
                            GetResource('S170715173738678', '保存成功'),
                            null,
                            { icon: 'succ.gif', width: '150', height: '60' }
                        );
                    }, 100); // 关键：给 Confirm 释放层级的时间
                },
                { width: '250', height: '90', icon: 'question.gif' },
                function () { }
            );
            
        };
        items.push(btn);
        items.push("-");
    }

    toolbar = new Toolbar({
        renderTo: 'dTools',
        border: 'top',
        height: '35px',
        items: items
    });
    toolbar.render();
    $("#Add").bind("click", function () { FileManager.AddReceiveFileNew(); });
    if (!isbatch) {

        FileManager.file_id = GetParaValue(document.location.href, 'objid');
        $("#tr01,#tr02,#tr03").show();
        function Success(_Meta) {

            if (_Meta) {
                var language = top.window.GLanguage;
                if (_Meta.FileStatus) {
                    var _FileStatus = ' ';
                    for (var i = 0; i < _Meta.FileStatus.length; i++) {
                        var row = _Meta.FileStatus[i];
                        _FileStatus += "<option value='" + row.value + "'   >" + row['text_' + language] + "</option>";
                    }
                    $("#file_status").append(_FileStatus);
                }

                var rows = _Meta.FileReceiveInfo[0];

                $("#case_volume").val(rows.case_volume);
                $("#file_name").val(rows.file_name);
                $("#upload_time").val(rows.upload_time);
                $("#post_date").val(rows.post_date);
                $("#file_status").val(rows.file_status_id);
                $("#sales_date").val(rows.sales_date);
                $("#forward_date").val(rows.forward_date);
                $("#cus_receive_date").val(rows.cus_receive_date);
                $("#receive_name").val(rows.receive_name);
                $("#cus_receipt_date").val(rows.cus_receipt_date);
                $("#remark").val(rows.remark);
                FileManager.proc_id = rows.proc_id;
                if (_Meta.ReceiveFileList) {
                    var _list = [];
                    for (var i = 0; i < _Meta.ReceiveFileList.length; i++) {
                        _list.push("<a class='linkcss'  href='javascript:void(0)'  id=" + _Meta.ReceiveFileList[i].file_id + " title='下载' onclick=\"DownLoad('" + _Meta.ReceiveFileList[i].file_no + " ','" + _Meta.ReceiveFileList[i].file_name + "','FILE')\" >" + _Meta.ReceiveFileList[i].file_name + "</a>&nbsp;<a id='Delproxy' href='javascript:void(0)' onclick=\"FileManager.DelReceiveFileList(this,'" + _Meta.ReceiveFileList[i].file_id + "')\" title='删除' lid='S140808094153296' class='tbdelete'>&nbsp;</a>");
                    }
                    $("#filelist").html(_list.join("</br>"));
                }

            }
        }
        Ajax.Request('CaseInfo.ashx', { Call: 'GetFileReceiveInfo', file_id: FileManager.file_id }, Success);
    }
    else {
        $("#tr01,#tr02,#tr03").hide();
        function SuccessT(_Meta) {
            if (_Meta) {
                var language = top.window.GLanguage;
                if (_Meta.FileStatus) {
                    var _FileStatus = ' ';
                    for (var i = 0; i < _Meta.FileStatus.length; i++) {
                        var row = _Meta.FileStatus[i];
                        _FileStatus += "<option value='" + row.value + "'   >" + row['text_' + language] + "</option>";
                    }
                    $("#file_status").append(_FileStatus);
                }
            }
        }
        Ajax.Request('CaseInfo.ashx', { Call: 'GetFileReceiveInfo', file_id: "" }, SuccessT);
    }

    if (FileManager.isKLFD202507 && isbatch) {
        $("#FileListInfo").show();
        $("#file_status").bind('change', function () {
            FileManager.isSaveReceiveInfo = false
            var val = $(this).val();
            if (val === "SN") {
                toolbar.setDisabled("saveinfo", false);
            } else {
                toolbar.setDisabled("saveinfo", true);
            }
        })
        var FileListReceiveInfo = {};
        layui.use('table', function () {
            FileListReceiveInfo.table = layui.table

            FileListReceiveInfo.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                {
                    field: 'file_name', title: GetResource('S140912142011888', '附件名称'), minWidth: 120, style: 'color:#407AA8;text-align:left', sort: true, templet: function (row) {
                        return StrcutFileName(row.file_no, row.file_name, 'FILE', row.case_id, row.proc_id, row.file_desc_code);
                    }
                },
                { field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), sort: true, minWidth: 120 },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100 },
                { field: 'file_type', title: GetResource('S140903173153758', '文件类型'), sort: true, minWidth: 100 },
                { field: 'file_desc', title: GetResource('S140929102908220', '文件描述'), sort: true, minWidth: 130 },
                { field: 'file_status', title: GetResource('S141107200224536', '处理状态'), sort: true, minWidth: 100 },
                { field: 'cus_receive_date', title: GetResource('S150815095208639', '客户领取日期'), sort: true, minWidth: 100 },
                { field: 'ctrl_proc_name', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
            ]];
            var parm = {}
            parm.Call = "GetFileReceiveInfoList";
            parm.file_ids = FileManager.file_id;
            Ajax.LoadLayuiTable(FileListReceiveInfo, 'FileListReceiveInfo', 'CaseInfo.ashx', FileListReceiveInfo.CaseCols, parm,
                function (data) {
                }
            );
        })
    }
}

FileManager.AddReceiveFile = function () {
    var Api = frameElement.api;
    Api.opener.$.dialog({
        title: GetResource('S141013212203373', '添加文件'), content: "url:" + GUrl + "/Forms/UploadFile.aspx?model=CASE&Call=CommUpload&objid=" + FileManager.file_id + "&filedesc=03BA2976-40F6-4682-941F-F837062D409E&filetype=03BA2976-40F6-4682-941F-F837062D409E", lock: true, width: 880,
        height: 530, max: false, min: false, resize: false,
        parent: frameElement.api, focus: true, id: 'UploadFile',
        close: function () {
            try {

                var _obj = Api.opener.lhgdialog.list['UploadFile'].content;
                if (_obj && _obj.FileUpload.Status) {
                    var _data = {};
                    _data.Call = 'AddReceiveFile';
                    _data.file_id = FileManager.file_id;
                    _data.proc_id = FileManager.proc_id;
                    function success(_Meta) {
                        if (_Meta.ReceiveFileList) {
                            var _list = [];
                            for (var i = 0; i < _Meta.ReceiveFileList.length; i++) {
                                _list.push("<a class='linkcss'  href='javascript:void(0)'  id=" + _Meta.ReceiveFileList[i].file_id + " title='下载' onclick=\"DownLoad('" + _Meta.ReceiveFileList[i].file_no + " ','" + _Meta.ReceiveFileList[i].file_name + "','FILE')\" >" + _Meta.ReceiveFileList[i].file_name + "</a>&nbsp;<a id='Delproxy' href='javascript:void(0)' onclick=\"FileManager.DelReceiveFileList(this,'" + _Meta.ReceiveFileList[i].file_id + "')\" title='删除' lid='S140808094153296' class='tbdelete'>&nbsp;</a>");
                            }
                            $("#filelist").html(_list.join("</br>"));
                        }
                    }
                    Ajax.Request('CaseInfo.ashx', _data, success, true);
                }


            } catch (e) {

            }
            finally { Api.opener.$.dialog({ id: Api.iframe.name }); return true; }
        }

    });
}

//弹出附件上传窗口,附件上传弹出框
FileManager.AddReceiveFileNew = function () {
    var seting = {
        file_type_ids: null
        , Required: { post_date: false }
        , title: GetResource('S141013212203373', '添加文件')
    }
    var data = { objid: FileManager.file_id }
    CommDragUploadNotices(FileManager.AddReceiveFileCallBack, data, seting);
}
FileManager.AddReceiveFileCallBack = function () {
    var _data = {};
    _data.Call = 'AddReceiveFile';
    _data.file_id = FileManager.file_id;
    _data.proc_id = FileManager.proc_id;
    function success(_Meta) {
        if (_Meta.ReceiveFileList) {
            var _list = [];
            for (var i = 0; i < _Meta.ReceiveFileList.length; i++) {
                _list.push("<a class='linkcss'  href='javascript:void(0)'  id=" + _Meta.ReceiveFileList[i].file_id + " title='下载' onclick=\"DownLoad('" + _Meta.ReceiveFileList[i].file_no + " ','" + _Meta.ReceiveFileList[i].file_name + "','FILE')\" >" + _Meta.ReceiveFileList[i].file_name + "</a>&nbsp;<a id='Delproxy' href='javascript:void(0)' onclick=\"FileManager.DelReceiveFileList(this,'" + _Meta.ReceiveFileList[i].file_id + "')\" title='删除' lid='S140808094153296' class='tbdelete'>&nbsp;</a>");
            }
            $("#filelist").html(_list.join("</br>"));
        }
    }
    Ajax.Request('CaseInfo.ashx', _data, success, true);
}

FileManager.SaveFileReceiveInfo = function (isbatch) {
    var _data = {};
    _data.Call = 'SaveFileReceiveInfo';
    _data.file_id = FileManager.file_id;
    _data.file_status_id = $("#file_status").val();
    _data.sales_date = $("#sales_date").val();
    _data.forward_date = $("#forward_date").val();
    _data.cus_receive_date = $("#cus_receive_date").val();
    _data.receive_name = $("#receive_name").val();
    _data.cus_receipt_date = $("#cus_receipt_date").val();
    _data.remark = $("#remark").val();
    _data.fileids = "";
    _data.file_status = $("#file_status option:selected").text();
    _data.isbatch = isbatch;
    var _fileids = [];
    $("a[class='linkcss']").each(function () {
        _fileids.push(this.id);
    });
    _data.fileids = _fileids.join(";");
    FileManager.FileReceiveInfo = _data;
    function saveReceiveInfo () {
        function Success(_Meta) {
            if (_Meta) {
                if (_Meta.ClientInfo.Result) {
                    Box.Alert(GRESX.HINTS.TITLE, GetResource('S140812201746197', '数据保存成功'), null, { icon: 'succ.gif', width: '250', height: '60' });
                }
            }
        }
        Ajax.Request('CaseInfo.ashx', _data, Success);
    }
    if (FileManager.isKLFD202507 && isbatch) {
        if (_data.file_status_id == 'SN' && (!_data.cus_receive_date || !_data.remark || !FileManager.isSaveReceiveInfo)) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S140812201746197', '请填写《客户领取日期》以及《备注》并保存'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        Box.Confirm(GRESX.HINTS.TITLE, GetResource('S251129145607143', "是否需要更新数据？"), function () {
            saveReceiveInfo();
        }, { width: '250', height: '90', icon: 'question.gif' }, function () {});
    } else {
        saveReceiveInfo();
    }
}


FileManager.DelReceiveFileList = function (_this, _obj01) {
    $("#" + _obj01).remove();
    $(_this).remove();
}

//判断重名的然后在后面追加 
FileManager.Change_file_names = function (_file_names) {
    var file_names = _file_names.split(';');

    for (var i = 0; i < file_names.length; i++) {


        for (var j = i + 1; j < file_names.length; j++) {
            if (file_names[j] == file_names[i]) {

                file_names[j] = file_names[j].substring(0, file_names[j].lastIndexOf('.')) + j + file_names[j].substring(file_names[j].lastIndexOf('.'), file_names[j].length);
            }
        }

    }
    var ChangeNames = "";
    for (var i = 0; i < file_names.length; i++) {
        ChangeNames += file_names[i] + ";";
    }
    if (ChangeNames.length > 0) {
        ChangeNames = ChangeNames.substring(0, ChangeNames.length - 1);
    }
    return ChangeNames;
}



///*切换类型   2015-12-21*/
FileManager.BindCtrlproc = function () {
    function Success(_Meta) {
        $("#i_ctrl_proc").TreeUser({ tree_id: $("#i_ctrl_proc").attr("tree_id"), SelectType: "checkbox", data: _Meta.CtrlProc, showIcon: false, width: 300, search: true, height: 350 });

    }
    Ajax.Request('Report.ashx', { Call: 'LimitMonitorGetCtrlproc', case_type: $("#case_type").val(), country: $("#country").attr("objid") }, Success, true);

}
FileManager.NoticeMailOnReady = function () {
    if (FileManager.isKLFD202507) {
        $(".KLFD202507").show();
    }
    $("#mail_type").TreeUser({ tree_id: "mailtypeTree", SelectType: "radio", fullpath: true, fulltag: '--', data: LoadMailType(), showIcon: false, width: 400, search: true, height: 190 });
    $("#btnNoticeMail").bind("click", FileManager.MailCustomer);
}
FileManager.NoticeMailOnReadyNew = function () {
    $("#btnNoticeMailNew").bind("click", FileManager.MailCustomerNew);
}
//发文来文给客户
FileManager.ShowMailCustomer = function () {

    /*var sheet = JClient.Object.FileList;
    var _file_ids = sheet.getSelectedPKId();
    var _file_names = sheet.getSelectedNames();*/
    var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    var _file_names = FileList.table.getCheckColumnData('FileList', 'file_name');
    var _childpath = $("#selfilePath").val();
    if (!_file_ids) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150104155029098', '请选择要发文客户的来文'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    //中一定制  办登发文 没有代理费生成代理费
    if (GetPublishConfig('ZY', 'zhongyi')) {
        function Success(_Meta) {
            if (_Meta.ClientInfo.Result) {
                Box.Confirm(GRESX.HINTS.TITLE, GetResource('S200520155759936', '存在办登事项没有年费代理费，是否添加？'), function () {
                    //根据代理费规则添加年费代理费
                    var success = function (_data) {
                        if (_data.ClientInfo.Result) {
                            dofunction();
                        } else {
                            Box.Message(GRESX.HINTS.TITLE, _data.ClientInfo.Message, null, { icon: 'fail.gif', width: '250', height: '60' });
                        }
                    }
                    Ajax.Request("CaseInfo.ashx", { Call: "AddAnnualAFee", file_ids: _file_ids }, success)
                }, { width: '360', height: '90', icon: 'question.gif' }, function () {
                    dofunction();
                });
            } else {
                dofunction();
            }
        }
        Ajax.Request('CaseInfo.ashx', { Call: 'CheckFee', file_ids: _file_ids }, Success, true);
    } else {
        dofunction();
    }

    function dofunction() {
        var fnlength = $("#tdfilename select[class='select_auto']").length;
        var _newfilename = "";
        var file_name_type = "";
        var _path = "";
        for (var j = 1; j <= fnlength; j++) {
            if ($("#selfilename" + j).val() == 'fixtxt') {
                _newfilename += $("#txtfilename" + j).val() + ";";
                file_name_type += "txt" + ";";
            } else {
                if ($("#selfilename" + j).val()) {
                    _newfilename += $("#selfilename" + j).val() + ";";
                    file_name_type += "colname" + ";";
                }
            }
        }
        if (_newfilename) {
            _newfilename = _newfilename.substr(0, _newfilename.length - 1);
            file_name_type = file_name_type.substr(0, file_name_type.length - 1)
        }

        if (_newfilename) {
            _file_names = '';
            function Success(_Meta) {
                _file_names = _Meta.file_names;
                if (!_file_names) { _file_names = "file" }
                _file_names = FileManager.Change_file_names(_file_names); //判断重名后更换名字
                if (_childpath) {
                    _path = _Meta.child_path;
                    //var $_row = $('#table_FileList').find('>tbody>tr');
                    //$_row.each(function () {
                    //    var tr = $(this);
                    //    var _name = "";
                    //    var chk = tr.find("input.check");
                    //    if (chk.attr("checked") == "checked" || chk.attr("checked") == true) {
                    //        for (var i = 0; i < _newfilename.split(";").length; i++) {
                    //            if (tr.find(">td[colname='" + _newfilename.split(";")[i] + "']").length >= 1) {
                    //                _name += tr.find(">td[colname='" + _newfilename.split(";")[i] + "']").text();
                    //            } else {
                    //                _name += _newfilename.split(";")[i];
                    //            }
                    //        }
                    //        if (!_name) { _name = "file" }
                    //        _name = _name + $.trim(tr.find(">td[colname=file_name]").text().substr(tr.find(">td[colname=file_name]").text().lastIndexOf('.'), tr.find(">td[colname=file_name]").text().length));
                    //        _name = _name.replace(/\|/g, "").replace(/\//g, "").replace(/\\/g, "").replace(/\:/g, "").replace(/\*/g, "").replace(/\?/g, "").replace(/\"/g, "").replace(/\</g, "").replace(/\>/g, "");
                    //        _file_names += _name + ";";
                    //    }

                    //});
                    if (_path) { _childpath = _path.substr(0, _path.length - 1) }
                }
                domail();
            }
            Ajax.Request('CaseInfo.ashx', { Call: 'GetFileName', file_ids: _file_ids, new_filename: _newfilename, childpath: _childpath, file_name_type: file_name_type }, Success, true);
        }
        else {
            domail();
        }

        function domail() {
            $.dialog({
                title: GetResource('S150104154726261', '选择发文模式'), id: "MailCustomer", max: false, min: false, width: 400, height: 450,
                content: 'url:Ihgforms/Patent/FileSearchMail.aspx',
                lock: true,
                max: false,
                min: false,
                resize: false,
                init: function () {
                    var context = lhgdialog.list['MailCustomer'].content;
                    if (context != null && context.FileManager != null) {
                        context.FileManager.NoticeMailOnReady();
                        context.FileManager._file_ids = _file_ids;
                        context.FileManager._file_names = _file_names;
                    }
                }
            });
        }
       
    }

}

//发文来文给客户
FileManager.ShowMailCustomerNew = function () {
    var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    var _file_names = FileList.table.getCheckColumnData('FileList', 'file_name');
    var _childpath = $("#selfilePath").val();
    if (!_file_ids) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150104155029098', '请选择要发文客户的来文'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    dofunction();

    function dofunction() {
        var fnlength = $("#tdfilename select[class='select_auto']").length;
        var _newfilename = "";
        var file_name_type = "";
        var _path = "";
        for (var j = 1; j <= fnlength; j++) {
            if ($("#selfilename" + j).val() == 'fixtxt') {
                _newfilename += $("#txtfilename" + j).val() + ";";
                file_name_type += "txt" + ";";
            } else {
                if ($("#selfilename" + j).val()) {
                    _newfilename += $("#selfilename" + j).val() + ";";
                    file_name_type += "colname" + ";";
                }
            }
        }
        if (_newfilename) {
            _newfilename = _newfilename.substr(0, _newfilename.length - 1);
            file_name_type = file_name_type.substr(0, file_name_type.length - 1)
        }

        if (_newfilename) {
            _file_names = '';
            function Success(_Meta) {
                _file_names = _Meta.file_names;
                if (!_file_names) { _file_names = "file" }
                _file_names = FileManager.Change_file_names(_file_names); //判断重名后更换名字
                if (_childpath) {
                    _path = _Meta.child_path;
                    if (_path) { _childpath = _path.substr(0, _path.length - 1) }
                }

            }
            Ajax.Request('CaseInfo.ashx', { Call: 'GetFileName', file_ids: _file_ids, new_filename: _newfilename, childpath: _childpath, file_name_type: file_name_type }, Success, true);
        }

        $.dialog({
            title: GetResource('S150104154726261', '选择发文模式'), id: "MailCustomerNew", max: false, min: false, width: 400, height: 300,
            content: 'url:Ihgforms/Patent/FileSearchMailNew.aspx',
            lock: true,
            max: false,
            min: false,
            resize: false,
            init: function () {
                var context = lhgdialog.list['MailCustomerNew'].content;
                if (context != null && context.FileManager != null) {
                    context.FileManager.NoticeMailOnReadyNew();
                    context.FileManager._file_ids = _file_ids;
                    context.FileManager._file_names = _file_names;
                }
            }
        });
    }

}

//发文给客户
FileManager.MailCustomer = function () {
    var _data = {};
    _data._file_ids = FileManager._file_ids;
    _data._file_names = FileManager._file_names;
    _data.mailstyle = $.GetRadioValue("mailstyle");
    _data.mailtype = $("#mail_type").attr("objid");
    _data.Call = 'MailCustomer';

    if (!_data.mailtype) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150105093743459', '请选择发文模式'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    function Success(_Meta) {
        if (_Meta.objid) {
            url = "Forms/mail/maildraft.aspx";
            //Box.Message(GRESX.HINTS.TITLE, GetResource('S150105091407555', '发文内容已建立，在发文管理—>发文草稿中可以查看并提交客户'), function () { FileManager.isMail = true; setTimeout(function () { var api = frameElement.api; api.close(); }, 10) }, { icon: 'succ.gif', width: '450', height: '60' });
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160413142341164', '发文内容已建立，在发文管理—>发文草稿中可以查看并提交，是否立即跳转至发文页面'), function () {
                FileManager.isMail = true; setTimeout(function () { var api = frameElement.api; api.close(); }, 10);
                //加载发文信息
                var url = "Forms/mail/mail.aspx?objid=" + _Meta.objid;
                top.window.AddBusinessTab("f_" + _Meta.objid, GetResource('S140928090402949', '发文'), url);
            }, { width: '360', height: '90', icon: 'question.gif' }, function () {
                FileManager.isMail = true; setTimeout(function () { var api = frameElement.api; api.close(); }, 10)
            });
        }
    }
    Ajax.Request('Notice.ashx', _data, Success);

}

//发文给客户
FileManager.MailCustomerNew = function () {
    var _data = {};
    _data._file_ids = FileManager._file_ids;
    _data._file_names = FileManager._file_names;
    _data.mailstyle = $.GetRadioValue("mailstyle");
    _data.Call = 'MailCustomerNew';

    function Success(_Meta) {
        if (_Meta.objid) {
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160413142341164', '发文内容已建立，在发文管理—>发文草稿中可以查看并提交，是否立即跳转至发文草稿页面'), function () {
                FileManager.isMail = true; setTimeout(function () { var api = frameElement.api; api.close(); }, 10);
                //加载发文信息
                //var url = "Forms/mail/mail.aspx?objid=" + _Meta.objid;
                var url = "Forms/mail/maildraft.aspx";
                top.window.AddBusinessTab("", GetResource('S140918092038944', '草稿'), url);
            }, { width: '360', height: '90', icon: 'question.gif' }, function () {
                FileManager.isMail = true; setTimeout(function () { var api = frameElement.api; api.close(); }, 10)
            });
        }
    }
    Ajax.Request('Notice.ashx', _data, Success);

}

FileManager.ViewFile = function (file_no, file_name, case_id, proc_id, file_desc_code) {

    //var success = function (data) {

    //    if (data.ClientInfo.Result) {

    //        var opener = window;
    //        var _Api = this;
    //        _parent = null;
    //        if (frameElement.api) {
    //            _Api = frameElement.api;
    //            opener = _Api.opener;
    //            _parent = _Api;

    //        }
    //        //var url = GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + $.trim(data.guid) + '/' + $.trim(data.filename); //转向网页的地址; 

    //        //var name = '';                            //网页名称，可为空; 
    //        //var iWidth = 960;                          //弹出窗口的宽度; 
    //        //var iHeight = 700;                         //弹出窗口的高度; 
    //        ////获得窗口的垂直位置 
    //        //var iTop = (window.screen.availHeight - 30 - iHeight) / 2;
    //        ////获得窗口的水平位置 
    //        //var iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
    //        //window.open(url, name, 'height=' + iHeight + ',innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');
    //        var FileCode = ['200021', '200701', '200103', '200602'];
    //        var isbool = false;
    //        var w_width = 980;
    //        if (top.window._UserModel.RoleCode.indexOf('ic') > -1 || top.window._UserModel.RoleCode.indexOf('fa') > -1) {
    //            for (var i = 0; i < file_desc_code.length; i++) {
    //                if (file_desc_code == FileCode[i]) {
    //                    isbool = true;
    //                    w_width = 1280;
    //                }
    //            }
    //        }

    //        opener.$.dialog({
    //            title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height - 180,
    //            content: 'url:' + GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + data.guid + '/' + data.filename + "&case_id=" + case_id + '&isbool=' + isbool + '&proc_id=' + proc_id,
    //            lock: false,
    //            max: true,
    //            min: true,
    //            resize: true,
    //            parent: _parent,
    //            close: function () {

    //            },
    //            init: function () {

    //                var context = opener.lhgdialog.list['Preview_' + file_no].content;
    //                if (context != null && context.CaseFee != null) {
    //                    //  context.CaseFee.isbool = isbool;
    //                    //  context.CaseFee.proc_id = proc_id;
    //                    //context.$("#guid").val(data.guid);
    //                    //context.$("#file_name").val(data.filename);
    //                    //context.PreviewJs.file_no = file_no;
    //                    //context.PreviewJs.file_name = file_name;
    //                    //context.PreviewJs.LoadFlex();     
    //                    context.$("#downloadFile").bind("click", function () { DownLoad(file_no, file_name, 'FILE'); });
    //                }

    //            }
    //        });
    //    }
    //    else {
    //        if (data.file_type) {
    //            Box.img(GRESX.HINTS.TITLE, "../TempFile/SWFFile/" + data.guid + "/" + data.file_name);

    //        } else {
    //            Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '该文件类型不支持在线浏览器'), null, { icon: 'hits.gif' });
    //        }
    //    }
    //}
    //Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name }, success);

}

//文件授权
FileManager.AuthorizeFiles = function () {
    /*var sheet = JClient.Object.FileList;
    var _file_ids = sheet.getSelectedPKId();*/
    var _file_ids = FileList.table.getCheckColumnData('FileList', 'file_id');
    if (_file_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    //function fn(obj) {
    //    if (obj.checked== true) {
    //        var authority = '1';
    //    }
    //    else {
    //        var authority = '0';
    //    }

    //    function Success(_Meta) {
    //        if (_Meta.ClientInfo.Result) {
    //                      Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'succ.gif' });
    //                  }
    //                    else {
    //                        Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'fail.gif' });
    //                  }
    //    }
    //    Ajax.Request('BaseInfo.ashx', { Call: 'AuthorizeFiles', file_ids: _file_ids, authority: authority }, Success);
    //}
    //    var html = "<td class='tdtitle'>"
    //    html += " <span name='Dictionary' lid='S190410183947058'>是否授权知助网</span>：</td>"
    //    html += "<td> <label>是<input type='radio'  value= '1'  name='authority'checked='checked'/></label> "
    //    html += "<label>否<input type='radio' value= '0'  name ='authority' /> </label> </td>"
    //    $.dialog({
    //        title: "授权知助网",
    //        content: html, lock: true, width: 300, height: 60,
    //        min: false, resize: true, max: false,
    //        focus: true, id: 'authority'
    //     , button: [
    //            {
    //                name: Boxsetting.yes, callback: function () {
    //                    return fn && fn.call(this, input);

    //                }, focus: true
    //            },
    //           {
    //               name: Boxsetting.no, callback: null, focus: false
    //           }
    //     ]
    //     , init: function () {
    //         input = this.DOM.content[0].getElementsByTagName('input')[0];




    //     }
    //    });

    //}
    Box.InputNote(GRESX.HINTS.TITLE, "请输入授权截至日期：<input type='text' class='input_text' class='Wdate' onfocus='WdatePicker({lang: LoadDatePickerLang()});' onclick='WdatePicker({lang: LoadDatePickerLang()});' >", CallBack, 'input', null);
    function CallBack(_text) {
        var authority = 1; //1为授权
        //if (!_text) {
        //    authority = 1;
        //}
        function Success(_Meta) {
            if (_Meta.ClientInfo.Result) {
                Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'succ.gif' });
            }
            else {
                Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'fail.gif' });
            }
        }
        Ajax.Request('BaseInfo.ashx', { Call: 'AuthorizeFiles', file_ids: _file_ids, enddate: _text, authority: authority }, Success);
    }
}
//短信通知
FileManager.SendSms = function () {
    var sheet = JClient.Object.FileList;
    var _file_ids = sheet.getSelectedPKId();
    if (_file_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141003144113878', '请选择文件'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    var para = {};
    para.Call = "SendSms";
    para.file_ids = _file_ids;
    function Success(data) {
        if (data.ClientInfo.Result) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S160718183033794', '操作成功'), null, { icon: 'succ.gif' });
        } else {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S160718183940082', '操作失败'), null, { icon: 'fail.gif' });
        }
    }

    Ajax.Request("BaseInfo.ashx", para, Success);
}

//获取所属部门
FileManager.GetBranchDept = function () {

    if ($("#p_case_info__charge_dept_id").attr("objid").length > 0) {
        var _data = {};
        _data.Call = 'GetBranchDept';
        _data.dept_id = $("#p_case_info__charge_dept_id").attr("objid");
        _data.apply_id = FileManager.case_id;

        function success(_Meta) {

            if (_Meta.branch_dept_id && _Meta.branch_dept_id.length > 0) {
                if ($("#p_case_info__branch_dept_id").val() == "") {
                    $("#p_case_info__branch_dept_id").val(_Meta.branch_dept_id);
                }
                return;
            }


        }
        Ajax.Request('CaseInfo.ashx', _data, success, true);
    }
}

FileManager.DelZipTemp = function () {
    var temp_id = $("#zipfiletemp").val();
    function Success(_Meta) {
        if (_Meta && _Meta.ClientInfo.Result) {
            FileManager.LoadZipTempList(_Meta.TempNameList);
            FileManager.TempZipNameList = _Meta.TempNameList;
        } else {
            Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'fail.gif', width: '250', height: '60' });
        }
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'DeleteZipTemp', temp_id: temp_id }, Success);
}
FileManager.zipfilenameChange = function (_obj01, _obj02) {
    if ($("#" + _obj01).val() == "fixtxt") {
        $("#" + _obj02).show();
    }
    else {
        $("#" + _obj02).hide();
        $("#" + _obj02).val('');
    }

}
FileManager.AddZipFilename = function () {
    var count = $("#tdzipfilename").find('select').length - 1;
    if (FileManager.DownLoadFileName.length > 0) {
        var option = [];
        for (var i = 0; i < FileManager.DownLoadFileName.length; i++) {
            var row = FileManager.DownLoadFileName[i];
            option.push("<option value='" + row.value + "'  >" + row["text_" + top.window.GLanguage] + "</option>");
        }
    }
    var _del = "<span title='删除'  style='cursor:pointer;' class='img_show' onclick=\"FileManager.DelSubject(this,'selzipfilename" + (count + 1) + "','txtzipfilename" + (count + 1) + "')\">&nbsp;</span>";
    var _sel = "<select id='selzipfilename" + (count + 1) + "' onchange=\" FileManager.zipfilenameChange('selzipfilename" + (count + 1) + "','txtzipfilename" + (count + 1) + "')\"   class='select_auto' style='width: 120px; margin:4px;'> " +
        "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>" + option.join("")
        + "</select><input type='text' id='txtzipfilename" + (count + 1) + "' class='input_auto' style='width: 120px;display: none;' />";
    $("#tdzipfilename").find("a[class='img_hide']").before(_del + _sel);
}



FileManager.GetFieldColName = function (column_id) {
    var colname = "";

    for (var i = 0; i < FileManager.fieldColumn.length; i++) {
        var item = FileManager.fieldColumn[i];
        if (item.column_id == column_id) {
            colname = item.column_name
        }
    }


    return colname;
}

FileManager.CheckFile = function (file_id) {
    var edit_type = "payment_review";
    if (edit_type == "payment_review") {
        _title = GetResource('S240306150005379', '修改复核信息');
    }
    function Success(_Meta) {
        if (_Meta.FileInfo && _Meta.FileInfo.length > 0) {
            if (_Meta.FileInfo[0].flow_direction == "II") {
                Ajax.Request('Common.ashx', { Call: 'CheckFilePTE', file_id: file_id, fileremmak: "" }, function (_Meta) {
                    if (_Meta.ClientInfo.Result) {

                        Box.Tips(GRESX.HINTS.TITLE, 2, GetResource('S240519132251792', '复核成功！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    } else {
                        Box.Tips(GRESX.HINTS.TITLE, 2, GetResource('S240519132251792', '复核成功！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    }
                    FileManager.SearchFile();

                });

            } else {
                $.dialog({
                    title: _title,
                    height: 280,
                    width: 400,
                    id: "EditFeeStatus",
                    max: false,
                    min: false,
                    lock: true,
                    resize: true,
                    content: 'url:' + GUrl + '/IhgForms/Bill/EditFeeStatus.aspx',
                    init: function () {
                        var content = lhgdialog.list["EditFeeStatus"].content;
                        if (content && content.IhgFeeStatus) {
                            content.IhgFeeStatus.edit_type = edit_type;
                            content.IhgFeeStatus.review_file_id = file_id;
                            content.IhgFeeStatus.pat_production_user_id = _Meta.FileInfo[0].pat_production_user_id.toString();
                            content.IhgFeeStatus.pat_patauditor_user_id = _Meta.FileInfo[0].pat_patauditor_user_id.toString();
                            content.IhgFeeStatus.pat_allocator_user_id = _Meta.FileInfo[0].pat_allocator_user_id.toString();

                            content.IhgFeeStatus.Initalization();
                        }
                    },
                    close: function () {
                        try {
                            var content = lhgdialog.list["EditFeeStatus"].content;
                            if (content && content.IhgFeeStatus && content.IhgFeeStatus.Status) {
                                FileManager.SearchFile();
                            }
                            $.dialog({ id: Api.iframe.name });
                        } catch (e) {

                        }
                        finally { return true; }
                    }
                });

            }

        }
    }
    Ajax.Request("TNotice.ashx", { Call: "GetFilePointInfo", file_id: file_id }, Success);
}