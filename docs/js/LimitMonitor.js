var Limit = {};
var QueryHistory = {};
Limit._file_ids = "";
Limit.CaseStatus = [];
Limit.BussType = [];
var language = top.window.GLanguage;
var LimitMonitorList = {};
var _is_feemonitor = false;
Limit.return_type = "";
//判断是否首次进入查询页面
Limit.is_first = true;
Limit.isSecrecy = false;
Limit.reply_cus_date = null;
Limit.finish_revise_date = null;
Limit.reply_agengcy = null;
Limit.agengcy_revise = null;
Limit.fieldColumn = []
$(document).ready(function () {

 //获取链接上的参数方便跳转页面
 Limit.return_type = GetParaValue(document.location.href, 'type');
    layui.use('table', function () {
        LimitMonitorList.table = layui.table;
        Limit.GetColorConfig();
        Limit.InitPage();
        Limit.ChangeCaseType($("#case_type"));
        //Limit.AppFeeSeach();
        Limit.is_first = false;
        //Limit.ClickTrChangeColor();
        Ajax.Request('CaseInfo.ashx', { Call: 'GetApplyTags' }, function (_Meta) {
            if (_Meta.ApplyTags) {
                var dataapplytags = [];
                for (var i = 0; i < _Meta.ApplyTags.length; i++) {
                    dataapplytags.push({ 'id': _Meta.ApplyTags[i].id, 'name': _Meta.ApplyTags[i].name, 'TreeType': '' });
                }
                $('#apply_tags_id_returnfee').TreeUser({ tree_id: $("#apply_tags_id_returnfee").attr("tree_id"), SelectType: "checkbox", data: dataapplytags, width: 287, height: 210, onCheck: null });
                $('#apply_tags_id_Errorfee').TreeUser({ tree_id: $("#apply_tags_id_Errorfee").attr("tree_id"), SelectType: "checkbox", data: dataapplytags, width: 287, height: 210, onCheck: null });
                $('#apply_tags_id_fee').TreeUser({ tree_id: $("#apply_tags_id_fee").attr("tree_id"), SelectType: "checkbox", data: dataapplytags, width: 287, height: 210, onCheck: null });
                $('#apply_tags_id_other').TreeUser({ tree_id: $("#apply_tags_id_other").attr("tree_id"), SelectType: "checkbox", data: dataapplytags, width: 287, height: 210, onCheck: null });
            }
        });
       
    });
    //选择自定义栏位后，点击空白页触发方法
    $(document).bind("click", function (e) {
        if ($(".layui-table-tool-panel").length == 1 && $(e.target).closest(".layui-table-tool-panel").length == 0) {
            if (!$("#a_lmSearch").is(":hidden")) {
                $("#a_lmSearch").click();
            } else if (!$("#btn_Search_error").is(":hidden")) {
                $("#btn_Search_error").click();
            } else if (!$("#btnSearch").is(":hidden")) {
                $("#btnSearch").click();
            } else if (!$("#btn_Search").is(":hidden")) {
                $("#btn_Search").click();
            }

        }
    })
    //$('#fawenrq_start').val(Limit.AddDate(-90));
    //$("#fawenrq_end").val(Limit.AddDate(1));


    if (GetPublishConfig('ZBSD', 'is_show_column')) {
        if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
            $(".ZBSD").show();
        } else {
            $(".ZBSD").hide();
        }
    }
});


Limit.InitPage = function () {
    if (GetPublishConfig("procinfo", "is_finish_dates")) {
        $("#a_finish_date").show();
    }
    if (GetPublishConfig("KLFD", "202504")) {
        $(".KLFD").show();
        $("#a_urge_first_handler").show();
        $("#btn_urge_first_handler").show();
    } else {
        $("#a_urge_first_handler").hide();
        $("#btn_urge_first_handler").hide();
    }
    Limit.PaiTeEn = GetPublishConfig('PaiTeEn', 'SheWai');
    if (Limit.PaiTeEn) {
        $(".PAITEEN").show();
        $(".pte_hide").hide();
        $("#a_legal_date").show();
        $(".jx_date").text(GetPublishConfigValueFn('jx_columns', 'jx_date'));
        
    } else {
        $(".PAITEEN").hide();
        $(".pte_hide").show();
        $("#a_legal_date").hide();
    }
    $(".flowStyle").hide();
    var language = top.window.GLanguage;
    $('#div_selectTab .tabbtn li').click(function () {
        Limit.TabSelect("#div_selectTab .tabbtn li", "#div_selectTab .tbcontent", "current", this);
    });

    if (PageAuth.indexOf("btn_a_finish_date") == -1) {
        $("#a_finish_date").remove();
    }
   
    //超凡定制
    if (GetPublishConfig('CHAOFAN', 'is_show_cloum')) {
        $("#CHAOFAN").show()
    }

    if (GetPublishConfig('Common', 'isSecrecy')) {
        Limit.isSecrecy = true;
        $('#a_mailcm').remove();
        $("#a_Urge").remove();
        $("#btnUrge").remove();
        $("#Export_Word_Template").remove();
        $("#a_finish_date").remove();
        $("#a_lmUpdateRemark").remove();
        $("#a_urge_first_handler").remove();
    }
       
    //品原定制
    if (GetPublishConfig('PYDZ', 'qixianjiankong')) {
        $(".PYDZ").show();
    }
    if (GetPublishConfig('ZITENT', 'is_show_cloum')) {
        $(".ZITENT_ALL").show();
    }
    if (GetPublishConfig('SHEWAI', 'DATE')) {
        var successcolumns = function (data) {
            if (data.customfield) {
                for (var i = 0; i < data.customfield.length; i++) {
                    var row = data.customfield[i];
                    $("." + row.columns).text(row.value);
                    switch (row.columns) {
                        case "reply_cus_date":
                            {
                                Limit.reply_cus_date = row.value;
                                break;
                            }
                        case "finish_revise_date":
                            {
                                Limit.finish_revise_date = row.value;
                                break;
                            }
                        case "reply_agengcy":
                            {
                                Limit.reply_agengcy = row.value;
                                break;
                            }
                        case "agengcy_revise":
                            {
                                Limit.agengcy_revise = row.value;
                                break;
                            }
                        default:
                            break;
                    }
                }
            }
        }
        Ajax.Request("BaseInfo.ashx", { Call: "GetCustomFieldNew" }, successcolumns, true);
    }
    $("#select_all,#select_all1").bind("change", function () {
        if (this.checked) {
            $(".date_sel").nextAll().show('slow');
            var nowd = new Date();
            var year = nowd.getFullYear();
            var month = nowd.getMonth() + 1;
            var day = nowd.getDate();
            if (month < 10) {
                month = "0" + month.toString();
            }
            if (day < 10) {
                day = "0" + day;
            }
            $(".date_sel").val(year.toString() + '-' + month + '-' + day);

            $("#select1_3")[0].checked = false;
            $("#select1_5")[0].checked = false;
            $("#select1_7")[0].checked = false;
            $("#select2_3")[0].checked = false;
            $("#select2_5")[0].checked = false;
            $("#select2_7")[0].checked = false;
        }
        else {
            $(".date_sel").val("");
        }
    });

    $("#pte_update_time1").bind("click", function () {
        $(".date1_1").val($("#pte_update_time_start1").val());
        $(".date1_2").val($("#pte_update_time_end1").val());
    });

    $("#pte_update_time2").bind("click", function () {
        $(".date2_1").val($("#pte_update_time_start2").val());
        $(".date2_2").val($("#pte_update_time_end2").val());
    });

    $("#select1_3,#select2_3").bind("change", function () {
        if (this.checked) {
            $(".date_sel").nextAll().show('slow');
            var nowd = new Date();
            var year_1 = nowd.getFullYear();
            var month_1 = nowd.getMonth() + 1;
            var day_1 = nowd.getDate();

            nowd.setDate(nowd.getDate() + 3);
            var year_2 = nowd.getFullYear();
            var month_2 = nowd.getMonth() + 1;
            var day_2 = nowd.getDate();

            if (month_1 < 10) {
                month_1 = "0" + month_1.toString();
            }
            if (month_2 < 10) {
                month_2 = "0" + month_2.toString();
            }

            if (day_1 < 10) {
                day_1 = "0" + day_1;
            }
            if (day_2 < 10) {
                day_2 = "0" + day_2;
            }

            $(".date1_1").val(year_1.toString() + '-' + month_1 + '-' + day_1);
            $(".date1_2").val(year_2.toString() + '-' + month_2 + '-' + day_2);
            $(".date2_1").val(year_1.toString() + '-' + month_1 + '-' + day_1);
            $(".date2_2").val(year_2.toString() + '-' + month_2 + '-' + day_2);

            $("#select_all")[0].checked = false;
            $("#select1_5")[0].checked = false;
            $("#select1_7")[0].checked = false;
            $("#select_all1")[0].checked = false;
            $("#select2_5")[0].checked = false;
            $("#select2_7")[0].checked = false;
        }
        else {
            $(".date_sel").val("");
        }
    });
    $("#select1_5,#select2_5").bind("change", function () {
        if (this.checked) {
            $(".date_sel").nextAll().show('slow');
            var nowd = new Date();
            var year_1 = nowd.getFullYear();
            var month_1 = nowd.getMonth() + 1;
            var day_1 = nowd.getDate();

            nowd.setDate(nowd.getDate() + 5);
            var year_2 = nowd.getFullYear();
            var month_2 = nowd.getMonth() + 1;
            var day_2 = nowd.getDate();

            if (month_1 < 10) {
                month_1 = "0" + month_1.toString();
            }
            if (month_2 < 10) {
                month_2 = "0" + month_2.toString();
            }

            if (day_1 < 10) {
                day_1 = "0" + day_1;
            }
            if (day_2 < 10) {
                day_2 = "0" + day_2;
            }

            $(".date1_1").val(year_1.toString() + '-' + month_1 + '-' + day_1);
            $(".date1_2").val(year_2.toString() + '-' + month_2 + '-' + day_2);
            $(".date2_1").val(year_1.toString() + '-' + month_1 + '-' + day_1);
            $(".date2_2").val(year_2.toString() + '-' + month_2 + '-' + day_2);

            $("#select1_3")[0].checked = false;
            $("#select_all")[0].checked = false;
            $("#select1_7")[0].checked = false;
            $("#select2_3")[0].checked = false;
            $("#select_all1")[0].checked = false;
            $("#select2_7")[0].checked = false;
        }
        else {
            $(".date_sel").val("");
        }
    });
    $("#select1_7,#select2_7").bind("change", function () {
        if (this.checked) {
            $(".date_sel").nextAll().show('slow');
            var nowd = new Date();
            var year_1 = nowd.getFullYear();
            var month_1 = nowd.getMonth() + 1;
            var day_1 = nowd.getDate();

            nowd.setDate(nowd.getDate() + 7);
            var year_2 = nowd.getFullYear();
            var month_2 = nowd.getMonth() + 1;
            var day_2 = nowd.getDate();

            if (month_1 < 10) {
                month_1 = "0" + month_1.toString();
            }
            if (month_2 < 10) {
                month_2 = "0" + month_2.toString();
            }

            if (day_1 < 10) {
                day_1 = "0" + day_1;
            }
            if (day_2 < 10) {
                day_2 = "0" + day_2;
            }

            $(".date1_1").val(year_1.toString() + '-' + month_1 + '-' + day_1);
            $(".date1_2").val(year_2.toString() + '-' + month_2 + '-' + day_2);
            $(".date2_1").val(year_1.toString() + '-' + month_1 + '-' + day_1);
            $(".date2_2").val(year_2.toString() + '-' + month_2 + '-' + day_2);

            $("#select1_3")[0].checked = false;
            $("#select1_5")[0].checked = false;
            $("#select_all")[0].checked = false;
            $("#select2_3")[0].checked = false;
            $("#select2_5")[0].checked = false;
            $("#select_all1")[0].checked = false;
        }
        else {
            $(".date_sel").val("");
        }
    });

    function callBack(_Meta) {
        if (_Meta.fieldColumn) {
            Limit.fieldColumn = _Meta.fieldColumn;
            for (var i = 0; i < _Meta.fieldColumn.length; i++) {
                if (_Meta.fieldColumn[i].column_name) {
                    $("#table_element").find(".field_column td span").eq(i).html(_Meta.fieldColumn[i].column_name);
                    $("#table_element1").find(".field_column td span").eq(i).html(_Meta.fieldColumn[i].column_name);
                    $("#dtable_element1").find(".field_column td span").eq(i).html(_Meta.fieldColumn[i].column_name);
                    $("#tbconditions").find(".field_column td span").eq(i).html(_Meta.fieldColumn[i].column_name);
                }
            }
        }
    }
    Ajax.Request('PatentAction.ashx', { Call: 'GetFieldColumn' }, callBack, true);
    Limit.is_complete_show_img = GetPublishConfig('TradeSearch', 'is_complete_show_img');

    function Success(_Meta) {
        Limit.CaseStatus = _Meta.case_status;
        Limit.BussType = _Meta.BussType;
        $.BindSelectData("case_type", _Meta.CaseType);


        $("#pay_due_date_from").val($.getLastMonthYestdy(3));
        $("#pay_due_date_to").val($.getLastMonthYestdy(-3));

        //默认节点内部期限为当天
        var nowDate = new Date();
        nowDate = dtFormat(nowDate, 'yyyy-MM-dd');
        $("#f_nodeIntDueDate_s").val(nowDate);
        $("#f_nodeIntDueDate_e").val(nowDate);


        var _flowType = ['<option value="">请选择</option>'];
        for (var i = 0; i < _Meta.flow_type.length; i++) {
            var row = _Meta.flow_type[i];
            if (row.value === "BI")
                continue;
            if (row.value === "BO")
                continue;
            if (row.value === "CL")
                continue;
            _flowType.push("<option value='" + row.value + "' >" + row["text_" + language] + "</option>");
        }
        $("#f_flow_type").html(_flowType.join(""));

        if (_Meta.HaveCaseType && _Meta.HaveCaseType[0].cfg_value != '') {
            if (_Meta.HaveCaseType[0].cfg_value.indexOf('P') >= 0) //无专利模块
            {
                $("#lipay,#lisuspend,#liabandon,#lirecall,#lipriority,#lierrorfee").hide();
            }
            if (_Meta.HaveCaseType[0].cfg_value.indexOf('T') >= 0) //无商标模块
            {
                $("#litrademark").hide();
            }
        }

        if (_Meta.CountryInfo) {
            var CountryInfo = [];
            for (var i = 0; i < _Meta.CountryInfo.length; i++) {
                CountryInfo.push({ 'id': _Meta.CountryInfo[i].value, 'name': _Meta.CountryInfo[i]['text_' + language], 'TreeType': '' });
            }
            $("#country").TreeUser({ tree_id: "tree_country", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });
            $("#country_id").TreeUser({ tree_id: "tree_country_id", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });
            $("#country_errorfee").TreeUser({ tree_id: "error_fee", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });
            $("#Trademark_country_id").TreeUser({ tree_id: "Trademark_country", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });
            $("#fee_customer_country").TreeUser({ tree_id: "fee_customer_country_tree", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });
            $("#Trademark_customer_country").TreeUser({ tree_id: "Trademark_customer_country_tree", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });
            $("#errfee_customer_country").TreeUser({ tree_id: "errfee_customer_country_tree", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });
            $("#customer_country").TreeUser({ tree_id: "customer_country_tree", SelectType: "checkbox", data: CountryInfo, showIcon: false, width: 600, search: true, height: 400 });

        }
        /*var html = ["<option value='' >ALL</option>"];
        for (var i = 0; i < _Meta.CountryInfo.length; i++) {
            var row = _Meta.CountryInfo[i];
            html.push("<option value='" + row.value + "'>" + row["text_" + language] + "</option>");
        }
        $("#country_id").html(html.join(""));*/
        var slt = [""];
        for (var i = 0; i < _Meta.CaseType.length; i++) {
            var row = _Meta.CaseType[i];
            slt.push("<option value='" + row.value + "' >" + row["text_" + language] + "</option>");
        }
        $("#case_type_id").html(slt.join(""));

        if (_Meta.payType) {
            var _opt = [""];
            _opt.push("<option value='' >ALL</option>");
            for (var i = 0; i < _Meta.payType.length; i++) {
                var row = _Meta.payType[i];
                _opt.push("<option value='" + row.value + "' >" + row["text_" + language] + "</option>");
            }
            $("#pay_type").html(_opt.join(""));
        }

        //客户状态
        var CustomerType = [];
        //var cthtml = ["<option value='' >" + GetResource('S140814203438556', '请选择') + "</option>"];
        if (_Meta.CustomerStatus) {
            for (var i = 0; i < _Meta.CustomerStatus.length; i++) {
                var row = _Meta.CustomerStatus[i];
                //cthtml.push("<option value='" + row.value + "'>" + row["text_" + language] + "</option>");
                CustomerType.push({ 'id': row.value, 'name': row.text_zh_cn, 'TreeType': '' })
            }
        }
        $("#customer_status").TreeUser({ tree_id: "tree_customer_status", SelectType: "checkbox", data: CustomerType, showIcon: false, width: 160, search: false, height: 150 });
        $("#customer_status_id").TreeUser({ tree_id: "tree_customer_status_id", SelectType: "checkbox", data: CustomerType, showIcon: false, width: 160, search: false, height: 150 });
        $("#Trademark_customer_status").TreeUser({ tree_id: "tree_Trademark_customer_status", SelectType: "checkbox", data: CustomerType, showIcon: false, width: 160, search: false, height: 150 });
        //$("#customer_status,#customer_status_id,#Trademark_customer_status").html(cthtml.join(""));
        /*案件流向*/
        if (_Meta.Case_direction) {
            var _case_direction = [];
            for (var i = 0; i < _Meta.Case_direction.length; i++) {
                _case_direction.push({ 'id': _Meta.Case_direction[i].value, 'name': _Meta.Case_direction[i]['text_' + language], 'TreeType': '' });
            }
            $("#flow_direction").TreeUser({ tree_id: "tree_flow_direction", SelectType: "checkbox", data: _case_direction, showIcon: false, width: 160, search: false, height: 70 });
            $("#flow_direction_other").TreeUser({ tree_id: "tree_flow_direction_other", SelectType: "checkbox", data: _case_direction, showIcon: false, width: 160, search: false, height: 70 });
            //var _Case_direction = ' <option value="">ALL</option>';
            //for (var i = 0; i < _Meta.Case_direction.length; i++) {
            //    var row = _Meta.Case_direction[i];
            //    _Case_direction += "<option value='" + row.value + "'   >" + row['text_' + language] + "</option>";
            //}
            //$("#flow_direction,#flow_direction_other").append(_Case_direction);
        }
        /*处理事项类型*/
        var procType = ["<option value='' >" + GetResource('S201205114723687', '请选择事项类型') + "</option>"];
        if (_Meta.procType) {
            for (var i = 0; i < _Meta.procType.length; i++) {
                var row = _Meta.procType[i];
                procType.push("<option value='" + row.dictionary_id + "'>" + row["text_" + language] + "</option>");
            }
        }
        $("#proc_type").append(procType.join(" "));
        $("#proc_type").bind("change", function () { Limit.BindCtrlproc(); });

        if (_Meta.ProcStatus) {
            var dataProcStatus = [];
            for (var i = 0; i < _Meta.ProcStatus.length; i++) {
                dataProcStatus.push({ 'id': _Meta.ProcStatus[i].value, 'name': _Meta.ProcStatus[i]["text_" + language], 'TreeType': '' });
            }
            $('#fee_proc_status').TreeUser({ tree_id: $("#fee_proc_status").attr("tree_id"), SelectType: "checkbox", data: dataProcStatus, width: 260, height: 210, onCheck: null });
            $('#Trademark_proc_status').TreeUser({ tree_id: $("#Trademark_proc_status").attr("tree_id"), SelectType: "checkbox", data: dataProcStatus, width: 260, height: 210, onCheck: null });
            $("#other_proc_status").TreeUser({ tree_id: $("#other_proc_status").attr("tree_id"), SelectType: "checkbox", data: dataProcStatus, width: 260, height: 210, onCheck: null });
        }

        var BranchList = GetDeptBranch();
        var BranchValue = [];
        var branch_dept_ids = [];
        var branch_dept_names = [];
        for (var i = 0; i < BranchList.length; i++) {
            BranchValue.push({ 'id': BranchList[i].dept_id, 'name': BranchList[i].dept_name, 'TreeType': '' });
            branch_dept_ids.push(BranchList[i].dept_id);
            branch_dept_names.push(BranchList[i].dept_name)
        }
        $('#branch_dept_id').TreeUser({ tree_id: "branch_dept_tree", SelectType: "checkbox", data: BranchValue, width: 220, height: 210, onCheck: null, fullpath: true, search: false, showIcon: false });
        $('#branch_dept_id2').TreeUser({ tree_id: "branch_dept_tree2", SelectType: "checkbox", data: BranchValue, width: 220, height: 210, onCheck: null, fullpath: true, search: false, showIcon: false });
        $("#Trademark_branch_dept_id").TreeUser({ tree_id: "Trademark_branch_dept_tree", SelectType: "checkbox", data: BranchValue, width: 220, height: 210, onCheck: null, fullpath: true, search: false, shwoIcon: false });
        //$("#branch_dept_id").attr("objid", branch_dept_ids.join(",")).val(branch_dept_names.join(","));
        // $("#branch_dept_id2").attr("objid", branch_dept_ids.join(",")).val(branch_dept_names.join(","));

        $('#p_case_info__charge_dept_id').TreeUser({ tree_id: "charge_dept_tree", SelectType: "checkbox", data: LoadDeptTree(), width: 260, height: 210, onCheck: function () { Limit.GetBranchDept(); }, fullpath: true, charge: true });
        $('#pic_dept_id').TreeUser({ tree_id: "pic_dept_tree", SelectType: "checkbox", data: LoadDeptTree(), width: 260, height: 210, onCheck: function () { Limit.GetBranchDept(); }, fullpath: true, charge: true });

        //案件业务员
        $("#fee_sales").TreeUser({ tree_id: $("#fee_sales").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#sales").TreeUser({ tree_id: $("#sales").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#Trademark_sales").TreeUser({ tree_id: $("#Trademark_sales").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        //案件业务助理
        $("#Trademark_sales_help").TreeUser({ tree_id: $("#Trademark_sales_help").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#fee_sales_help").TreeUser({ tree_id: $("#fee_sales_help").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#sales_help").TreeUser({ tree_id: $("#sales_help").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        //案件流程人员

        $("#fee_p_case_info_flow_user_id").TreeUser({ tree_id: $("#fee_p_case_info_flow_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#Trademark_p_case_info_flow_user_id").TreeUser({ tree_id: $("#Trademark_p_case_info_flow_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#p_case_info_flow_user_id").TreeUser({ tree_id: $("#p_case_info_flow_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });






        $("#sales_errorfee").TreeUser({ tree_id: "error_sale", data: LoadTreeUser(), SelectType: "radio", height: 300, width: 320 });
        $("#revise_user_id").TreeUser({ tree_id: $("#revise_user_id").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#revise_user").TreeUser({ tree_id: $("#revise_user").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        $("#Trademark_revise_user").TreeUser({ tree_id: $("#Trademark_revise_user").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320 });
        Limit.apply_type = _Meta.apply_type;

        Limit.BindApplyType();

        Limit.BindCtrlproc();
        Limit.BindCtrlprocFee();
        Limit.BindFeeType();
        Limit.SearchList();
        Limit.BindApplySubject();
    }
    Ajax.Request('Report.ashx', { Call: 'LimitMonitorInit' }, Success, true);
    //SelectMonitorChanged();
    //SelectAppMonitorChanged();
    $("#proc_pic_user").TreeUser({ tree_id: $("#proc_pic_user").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#case_pic_user").TreeUser({ tree_id: $("#case_pic_user").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#Trademark_proc_pic_user").TreeUser({ tree_id: $("#Trademark_proc_pic_user").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#proc_pic_user_other").TreeUser({ tree_id: $("#proc_pic_user_other").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#user_assistant").TreeUser({ tree_id: $("#user_assistant").attr("tree_id"), data: LoadTreeUser(), SelectType: "checkbox", height: 300, width: 320, pcheck: true });
    $("#fee_agency_id").attr("placeholder", GetResource('S170715173843891', '输入内容查询代理机构')).autoSearchText({ id: 'agency_id', width: '99%', minwidth: '450px', itemHeight: 300, minChar: 1, datafn: LoadAutoAgency });
    $("#other_agency_id").attr("placeholder", GetResource('S170715173843891', '输入内容查询代理机构')).autoSearchText({ id: 'other_agency_id', width: '99%', minwidth: '450px', itemHeight: 300, minChar: 1, datafn: LoadAutoAgency });
    $("#errfee_agency_id").attr("placeholder", GetResource('S170715173843891', '输入内容查询代理机构')).autoSearchText({ id: 'errfee_agency_id', width: '99%', minwidth: '450px', itemHeight: 300, minChar: 1, datafn: LoadAutoAgency });
    $("#Trademark_agency_id").attr("placeholder", GetResource('S170715173843891', '输入内容查询代理机构')).autoSearchText({ id: 'Trademark_agency_id', width: '99%', minwidth: '450px', itemHeight: 300, minChar: 1, datafn: LoadAutoAgency });

    $("#case_type").bind("change", Limit.BindCtrlproc);
    $("#case_type").bind("change", Limit.BindApplySubject);
    $("#tree_country").mouseout(Limit.BindCtrlproc);
    $("#tree_country").mouseout(Limit.BindApplySubject);

    $("#btn_reset").bind("click", Limit.Reset);
    $("#btn_reset1").bind("click", Limit.Reset);
    $("#btn_reset2").bind("click", Limit.Reset);
    $("#btn_reset1_error").bind("click", Limit.Reset);

    $("#a_lmSearch").bind("click", Limit.SearchList);
    $("#a_lmUpdateRemark").bind("click", Limit.btnUpdateProcRemark);
    $("#a_lmExport").bind("click", Limit.ExportCaseList);
    $("#a_Urge,#btnUrge").bind("click", Limit.ShowLimitMonitorUrge);
    $("#a_urge_first_handler,#btn_urge_first_handler").bind("click", Limit.UrgeFirstHandler);


    $("#btn_Search_error").bind("click", Limit.ErrorFeeSeach);
    $("#btn_Export_error").bind("click", Limit.ErrorFeeExport);


    $("#btn_Search_returnfee").bind("click", Limit.ReturnFeeSeach);
    $("#btn_Export_returnfee").bind("click", Limit.AddUpdateFeeinfo);
    $("#btn_Export_changefee").bind("click", Limit.ChangeFeeinfo);

    $("#btn_Search_appfee").bind("click", Limit.AppFeeSeach);
    $("#btn_Export_appfee").bind("click", Limit.AppFeeExport);
    $("#btn_update_appfee").bind("click", Limit.changeAppFeeStatus);


    $("#tree_country_id").mouseout(Limit.BindApplyType);
    $("#tree_country_id").mouseout(Limit.BindCtrlprocFee);
    $("#tree_country_id").mouseout(Limit.BindFeeType);
    $("#case_type_id").bind("change", Limit.BindApplyType);
    $("#case_type_id").bind("change", Limit.BindCtrlprocFee);
    $("#case_type_id").bind("change", Limit.BindFeeType);
    $("#a_mailcm").bind("click", Limit.ShowMailCustomer); //发文客户
    $("#a_finish_date").bind("click", Limit.UpdateFinishDate); //批量更新完成日
    $("#Export_Word_Template").bind("click", Limit.WordExport); 
    $("#a_legal_date").bind("click", Limit.UpdateLegalDate); //批量更新官方期限

    $("#customer_id").attr("placeholder", GetResource('S141230193356697', '输入内容查询客户')).autoSearchText({ id: 'customer_id', width: '95%', minwidth: '450px', itemHeight: 300, minChar: 1, datafn: LoadAutoCustomer });


    $("#btnSearch").bind("click", Limit.SearchFee);
    $("#btnExport").bind("click", Limit.ExportFee);
    $("#btn_Search").bind("click", Limit.TrademarkSearch);
    $("#btn_Export").bind("click", Limit.TrademarkExport);
    $('input[ctrl_type=ctrl_date]').bind("change", function () {
        var obj_name = this.id.replace("_isnull", "");
        if (obj_name.indexOf("_other") == -1) {
            if (this.checked) {
                $("#" + obj_name + "_from").val("").attr("disabled", "disabled")
                $("#" + obj_name + "_to").val("").attr("disabled", "disabled")
            }
            else {
                $("#" + obj_name + "_from").val("").removeAttr("disabled")
                $("#" + obj_name + "_to").val("").removeAttr("disabled")
            }
        }
        else {
            var other_obj_name = obj_name.replace("_other", "");
            if (this.checked) {
                $("#" + other_obj_name + "_s").val("").attr("disabled", "disabled")
                $("#" + other_obj_name + "_e").val("").attr("disabled", "disabled")
            }
            else {
                $("#" + other_obj_name + "_s").val("").removeAttr("disabled")
                $("#" + other_obj_name + "_e").val("").removeAttr("disabled")
            }

        }
    });


   

    $("#history_query").bind("change", function () {
        $("#is_out_save")[0].checked = false;
        QueryHistory.Refresh(true);
    });
    $("#is_query_save").bind("change", function () {
        if (this.checked) {
            $("#history_query").val('');
            $("#query_save_title").show();
        }
        else {
            $("#query_save_title").hide().val("");
            if ($("#history_query").val() == "" && !$("#is_query_save")[0].checked)
                $("#is_out_save")[0].checked = false;
        }
    });
    $("#is_out_save").bind("change", function () {
        if (this.checked && $("#history_query").val() == "") {
            $("#is_query_save")[0].checked = true;
            $("#query_save_title").show();
        }
    });
    QueryHistory.Refresh(false);

    if (GetPublishConfig("CF", "cf_customized")) {
        $("#liflow").show();
    }

    $("#f_flow_type").bind("change", Limit.BindFlowNode);

    document.onkeypress = Limit.EnterPress;
    document.onkeydown = Limit.EnterPress;

    //数据加载完成以后在切换页签
    if (Limit.return_type =="returnfee") {
        Limit.TabSelect("#div_selectTab .tabbtn li", "#div_selectTab .tbcontent", "current", document.getElementById("lireturnfee"));

    }

   

}

//流程节点绑定
Limit.BindFlowNode = function () {
    var language = top.window.GLanguage;
    var flow_type = $("#f_flow_type").val();
    $("#f_flow_node").attr("objid", "");
    $("#f_flow_node").val("");
    if (flow_type === "") {
        $("#f_flow_node").TreeUser({ tree_id: "node_id", SelectType: "checkbox", data: null, showIcon: false, width: 300, search: true, height: 350 });
        $("#f_flow_node").attr("disabled", true);
        return;
    }
    function Success(_Meta) {
        var node_list = new Array();
        //node_list.push({ "id": "9BBB6A0E-FDE3-4FD6-AAB8-03CD54087035", "name": "启动流程" });
        for (var i = 0; i < _Meta.flow_node.length; i++) {
            var row = _Meta.flow_node[i];
            if (row.node_id != "5A0F9ABF-0816-4FBB-A682-212FDDBE5224") {
                var obj = { "id": row.node_id, "name": row["node_name_" + language] };
                node_list.push(obj);
            }
        }
        //node_list.push({ "id": "5A0F9ABF-0816-4FBB-A682-212FDDBE5224", "name": "结束" });
        $("#f_flow_node").attr("disabled", false);
        $("#f_flow_node").TreeUser({ tree_id: "node_id", SelectType: "checkbox", data: node_list, showIcon: false, width: 300, search: true, height: 350 });
    }
    Ajax.Request('Report.ashx', { Call: 'GetFlowNodeCF', flow_type: flow_type }, Success, true);
}

Limit.GetColorConfig = function () {
    function Success(_Meta) {
        if (_Meta.color_config) {
            var _li = "";
            for (var i = 0; i < _Meta.color_config.length; i++) {
                var row = _Meta.color_config[i];
                switch (row.name) {
                    case 'int_due_date1':
                        Limit.int_due_days1 = row.days;
                        Limit.int_due_color1 = row.color;
                        break;
                    case 'int_due_date2':
                        Limit.int_due_days2 = row.days;
                        Limit.int_due_color2 = row.color;
                        break;
                    case 'cus_due_date1':
                        Limit.cus_due_days1 = row.days;
                        Limit.cus_due_color1 = row.color;
                        break;
                    case 'cus_due_date2':
                        Limit.cus_due_days2 = row.days;
                        Limit.cus_due_color2 = row.color;
                        break;
                    case 'legal_due_date1':
                        Limit.legal_due_days1 = row.days;
                        Limit.legal_due_color1 = row.color;
                        break;
                    case 'legal_due_date2':
                        Limit.legal_due_days2 = row.days;
                        Limit.legal_due_color2 = row.color;
                        break;
                }
                if (row.days == 0) {
                    _li += '<li><input type="checkbox" name="due_date" id = "' + row.days + '-' + row.type + '"/><span style="background-color:' + row.color + '">'
                        + '<span>' + row.text + '已逾期</span ></span></li>';
                } else {
                    _li += '<li><input type="checkbox" name="due_date" id="' + row.days + '-' + row.type + '"/><span style="background-color:' + row.color + '">'
                        + '<span>' + row.text + row.days + '天内</span ></span></li>';
                }
            }
            $("#color_config").append(_li);
        }
    }
    Ajax.Request("CaseInfo.ashx", { Call: 'GetColorConfig' }, Success);
}

Limit.ChangeCaseType = function (obj) {
    var value = $(obj).val();
    var CsOption = new Array();
    var BTOption = new Array();
    var TBTOption = new Array();
    var PBTOption = new Array();
    if (Limit.CaseStatus) {
        for (var i = 0; i < Limit.CaseStatus.length; i++) {
            var row = Limit.CaseStatus[i];
            if ((row.status_class == "ALL" || row.status_class == "CASE") && row.case_type_id == value) {
                var obj = {};
                obj.id = row.value;
                obj.name = row["text_" + language];
                CsOption.push(obj);
            }
        }
    }
    if (Limit.BussType) {
        for (var i = 0; i < Limit.BussType.length; i++) {
            var row = Limit.BussType[i];
            if (row.case_type_id == value) {
                var obj = {};
                obj.id = row.business_type_id;
                obj.name = row["bussType"];
                BTOption.push(obj)
            }
            if (row.case_type_id == "0E8A4B7F-E407-4EFF-9562-3809BF484207") {
                var obj = {};
                obj.id = row.business_type_id;
                obj.name = row["bussType"];
                TBTOption.push(obj)
            }
            if (row.case_type_id == "31D1A147-2931-43B5-94AE-B72B1525BA8A") {
                var obj = {};
                obj.id = row.business_type_id;
                obj.name = row["bussType"];
                PBTOption.push(obj)
            }
        }

    }

    $("#case_status").TreeUser({ tree_id: "ctrl_case_status", SelectType: "checkbox", data: CsOption, showIcon: false, width: 300, search: true, height: 350 });
    $("#business_type_other").TreeUser({ tree_id: "business_type_other_tree", data: BTOption, SelectType: "checkbox", height: 300, width: 320 });
    $("#business_type").TreeUser({ tree_id: "business_type_tree", data: BTOption, SelectType: "checkbox", height: 300, width: 320 });
    $("#Trademark_business_type").TreeUser({ tree_id: "t_business_type_tree", data: TBTOption, SelectType: "checkbox", height: 300, width: 320 });
    $("#error_business_type").TreeUser({ tree_id: "e_business_type_tree", data: PBTOption, SelectType: "checkbox", height: 300, width: 320 })
}


Limit.BindApplyType = function () {
    var language = top.window.GLanguage;
    var case_type = $("#case_type_id").val();
    var country = $("#country_id").attr("objid");
    var ApplyType = [];
    //var slt = ["<option value='' >ALL</option>"];
    var country_arr = country.split(",");
    for (var i = 0; i < Limit.apply_type.length; i++) {
        var row = Limit.apply_type[i];
        if ((row.country_id == 'ALL' || ($.inArray(row.country_id, country_arr) != -1)) && row.case_type_id == case_type) {
            // slt.push("<option value='" + row.value + "' >" + row["text_" + language] + "</option>");
            ApplyType.push({ 'id': row.value, 'name': row.text_zh_cn, 'TreeType': '' })
        }
    }
    //$("#apply_type").html(slt.join(""));
    $("#apply_type").TreeUser({ tree_id: "apply_types_tree", SelectType: "checkbox", data: ApplyType, showIcon: false, width: 300, search: true, height: 350 });
}




Limit.ShowMailCustomer = function () {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });
    /*var sheet = "";
    switch (_type) {
        case 'all':
            sheet = JClient.Object.CaseList_all;
            sheet = sheet ? sheet : (new JClient.UI.Sheet("CaseList_all"));
            break;
        case 'pay':
            sheet = JClient.Object.CaseList_pay;
            sheet = sheet ? sheet : (new JClient.UI.Sheet("CaseList_pay"));
            break;
        case 'suspend':
            sheet = JClient.Object.CaseList_suspend;
            sheet = sheet ? sheet : (new JClient.UI.Sheet("CaseList_suspend"));
            break;
        case 'abandon':
            sheet = JClient.Object.CaseList_abandon;
            sheet = sheet ? sheet : (new JClient.UI.Sheet("CaseList_abandon"));
            break;
        case 'recall':
            sheet = JClient.Object.CaseList_recall;
            sheet = sheet ? sheet : (new JClient.UI.Sheet("CaseList_recall"));
            break;
        case 'priority':
            sheet = JClient.Object.CaseList_priority;
            sheet = sheet ? sheet : (new JClient.UI.Sheet("CaseList_priority"));
            break;

    }*/

    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            break;
        case 'pay':
            table_id = "CaseList_pay";
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            break;
        case 'recall':
            table_id = "CaseList_recall";
            break;
        case 'priority':
            table_id = "CaseList_priority";
            break;
        case 'fee':
            table_id = "CaseList_fee";
            break;
        case 'flow':
            table_id = "CaseList_flow";
            break;
    }
    var _file_ids = LimitMonitorList.table.getCheckColumnData(table_id, 'proc_id');
    if (_file_ids != "") {

        $.dialog({
            title: GetResource('S150104154726261', '选择发文模式'), id: "MailCustomer", max: false, min: false, width: 400, height: 450,
            content: 'url:Ihgforms/Patent/LimitMonitor.aspx',
            lock: true,
            max: false,
            min: false,
            resize: false,
            init: function () {
                var context = lhgdialog.list['MailCustomer'].content;
                if (context != null && context.Limit != null) {
                    context.Limit.NoticeMailOnReady();
                    context.Limit._file_ids = _file_ids;
                    context.Limit._file_names = "";
                }
            }
        });
    } else {
        Box.Alert(GRESX.HINTS.TITLE, GetResource("S140814203438556", "请选择"), null, { icon: 'hits.gif' });
    }
}


//批量更新官方期限
Limit.UpdateLegalDate = function () {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });
    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            break;
        case 'pay':
            table_id = "CaseList_pay";
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            break;
        case 'recall':
            table_id = "CaseList_recall";
            break;
        case 'priority':
            table_id = "CaseList_priority";
            break;
        case 'fee':
            table_id = "CaseList_fee";
            break;
        case 'flow':
            table_id = "CaseList_flow";
            break;
    }
    var proc_ids = LimitMonitorList.table.getCheckColumnData(table_id, 'proc_id');
    if (!proc_ids) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715173806891', '请先选择需要修改官方期限的项!'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    for (var i = 0; i < proc_ids.split(";").length; i++) {
        var proc_id = proc_ids.split(";")[i];
    }
    $.dialog({
        id: "Legal_Date", title: GetResource('S170715173807288', '批量修改期限'),
        content: "url:" + GUrl + "/IhgForms/Bill/BatchResetNoticeDate3.aspx",
        lock: true, fixed: true, width: 720, height: 250,
        resize: false, max: false, min: false,
        init: function () {
            var newApi = lhgdialog.list["Legal_Date"].content;
            if (newApi != null && newApi.IhgBatchResetNoticeDate != null) {
                newApi.IhgBatchResetNoticeDate.proc_id = proc_ids;
                newApi.IhgBatchResetNoticeDate.call_back =
                    newApi.IhgBatchResetNoticeDate.InitPage();
            }
        },
        close: function () {
            var newApi = lhgdialog.list["Legal_Date"].content;
            if (newApi.IhgBatchResetNoticeDate.is_close) {
                Limit.SearchList();
            }
        }
    });


}


//批量更新完成日
Limit.UpdateFinishDate = function () {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });
    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            break;
        case 'pay':
            table_id = "CaseList_pay";
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            break;
        case 'recall':
            table_id = "CaseList_recall";
            break;
        case 'priority':
            table_id = "CaseList_priority";
            break;
        case 'fee':
            table_id = "CaseList_fee";
            break;
        case 'flow':
            table_id = "CaseList_flow";
            break;
    }
    var proc_ids = LimitMonitorList.table.getCheckColumnData(table_id, 'proc_id');
    if (!proc_ids) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715173806891', '请先选择需要添加完成日的项!'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    for (var i = 0; i < proc_ids.split(";").length; i++) {
        var proc_id = proc_ids.split(";")[i];
    }
    $.dialog({
        id: "Finish_Date", title: GetResource('S170715173807288', '批量管完成日'),
        content: "url:" + GUrl + "/IhgForms/Bill/BatchResetNoticeDate2.aspx",
        lock: true, fixed: true, width: 720, height: 250,
        resize: false, max: false, min: false,
        init: function () {
            var newApi = lhgdialog.list["Finish_Date"].content;
            if (newApi != null && newApi.IhgBatchResetNoticeDate != null) {
                newApi.IhgBatchResetNoticeDate.proc_id = proc_ids;
                newApi.IhgBatchResetNoticeDate.call_back =
                    newApi.IhgBatchResetNoticeDate.InitPage();
            }
        },
        close: function () {
            var newApi = lhgdialog.list["Finish_Date"].content;
            if (newApi.IhgBatchResetNoticeDate.is_close) {
                Limit.SearchList();
            }
        }
    });


}


Limit.BindApplySubject = function () {
    var language = top.window.GLanguage;

    var ApplyType = [];
    var case_type = $("#case_type").val();
    var country = $("#country").attr("objid");
    //var slt = ["<option value='' >ALL</option>"];
    var country_arr = country.split(",");
    for (var i = 0; i < Limit.apply_type.length; i++) {
        var row = Limit.apply_type[i];
        if ((row.country_id == 'ALL' || ($.inArray(row.country_id, country_arr) != -1)) && row.case_type_id == case_type) {
            //slt.push("<option value='" + row.value + "' >" + row["text_" + language] + "</option>");
            ApplyType.push({ 'id': row.value, 'name': row.text_zh_cn, 'TreeType': '' })
        }
    }
    $("#apply_subject").TreeUser({ tree_id: "apply_type_tree", SelectType: "checkbox", data: ApplyType, showIcon: false, width: 300, search: true, height: 350 });

    // $("#apply_subject").html(slt.join(""));
}



Limit.TabSelect = function (tab, con, addClass, obj) {

    var $_self = $(obj);
    var $_nav = $(tab);
    $_nav.removeClass(addClass);
    $_self.addClass(addClass);
    var $_index = $_nav.index($_self);
    var $_con = $(con);
    $_con.hide();
    $_con.eq($_index).show();

  

    if (obj.id == "lifee") {
        $("#dAppFee").hide();
        $("#dFee").show();
        $("#dOther").hide();
        $("#dTrademark").hide();
        $("#dErrorfee").hide();
        $(".flowStyle").hide();
        $("#dreturnfee").hide();
        Limit.SearchFee();
        $(".PYDZ").hide();
        $(".ZITENT_ALL").hide();
        QueryHistory.Refresh();
    }
    else if (obj.id == "litrademark") {
        $("#dAppFee").hide();
        $("#dTrademark").show();
        $("#dFee").hide();
        $("#dOther").hide();
        $("#dErrorfee").hide();
        $(".flowStyle").hide();
        $("#dreturnfee").hide();
        $(".PYDZ").hide();
        $(".ZITENT_ALL").hide();
        if (filterPubBool(['tradeInfo', 'showRegDate'])) {
            $("#lbl_authorize_date2").show();
            $("#lbl_authorize_date").hide();
        } else {
            $("#lbl_authorize_date").show();
            $("#lbl_authorize_date2").hide();
        }
        Limit.TrademarkSearch();
        QueryHistory.Refresh();
    }
    else if (obj.id == 'lierrorfee') {
        $("#dAppFee").hide();
        $("#dErrorfee").show();
        $("#dFee").hide();
        $("#dOther").hide();
        $("#dTrademark").hide();
        $(".flowStyle").hide();
        $("#dreturnfee").hide();
        $(".PYDZ").hide();
        $(".ZITENT_ALL").hide();
        Limit.ErrorFeeSeach();
        QueryHistory.Refresh();
    } else if (obj.id == "liflow") {
        $("#dAppFee").hide();
        $("#p_t,#ctrl_proc,.hzinfo").show();
        $("#dOther").show();
        $("#dFee").hide();
        $(".flowStyle").show();
        $("#legal_due_date_s").val('');
        $("#legal_due_date_e").val('');
        $("#dTrademark").hide();
        $("#dErrorfee").hide();
        $("#dreturnfee").hide();
        $(".PYDZ").hide();
        $(".ZITENT_ALL").hide();
        
        //判断 菜单权限 配置
        function Success(_Meta) {
            Limit.ProcPageAuth = _Meta.CurPageAuth;
            if (Limit.ProcPageAuth.indexOf('S') > -1) {
                $("#btnStopFlow").show();//2020-07-02 切换到流程监控页面时，展示 【终止流程】 按钮
            }
        }
        Ajax.Request('Common.ashx', { Call: 'GetPageAuthByParm', url: 'Forms/Report/LimitMonitor.aspx' }, Success);
        Limit.SearchList();
        QueryHistory.Refresh();
    }
    else if (obj.id == "lireturnfee") {
        $("#dAppFee").hide();
        $("#dreturnfee").show();
        $("#dErrorfee").hide();
        $("#dFee").hide();
        $("#dOther").hide();
        $("#dTrademark").hide();
        $(".flowStyle").hide();
        $(".PYDZ").hide();
        $(".ZITENT_ALL").hide();
        Limit.ReturnFeeSeach();
        QueryHistory.Refresh();
    }
    else if (obj.id == "liAppfee") {
        $("#dAppFee").show();
        $("#dreturnfee").hide();
        $("#dErrorfee").hide();
        $("#dFee").hide();
        $("#dOther").hide();
        $("#dTrademark").hide();
        $(".flowStyle").hide();
        $(".PYDZ").hide();
        $(".ZITENT_ALL").hide();
        Limit.AppFeeSeach();
        QueryHistory.Refresh();
    }
    else {
        $("#dAppFee").hide();
        $("#dErrorfee").hide();
        $("#dreturnfee").hide();
        $("#dFee").hide();
        $("#dTrademark").hide();
        $("#dOther").show();
        $(".flowStyle").hide();
        $(".flowStyle").hide();


        if (obj.id == "liall") {
            $("#tr_ctrl_proc").show();
        }
        else {
            $("#tr_ctrl_proc").hide();
        }

        if (GetPublishConfig("ZITENT","is_show_cloum") && obj.id === "liall") {
            $(".ZITENT_ALL").show();
        } else {
            $(".ZITENT_ALL").hide();
        }

        //品原定制
        if (GetPublishConfig('PYDZ', 'qixianjiankong') && obj.id == "liall") {
            $(".PYDZ").show();
        }
        else {
            $(".PYDZ").hide();
        }

        Limit.SearchList();
        QueryHistory.Refresh();
    }
}

//绑定处理事项选择框
Limit.BindCtrlproc = function () {
    //改变事项和案件类型的时候，清空当前处理事项勾选
     $("#ctrl_proc").attr("objid", "").val("");
    function Success(_Meta) {
        $("#ctrl_proc").TreeUser({ tree_id: "ctrl_proc_id", SelectType: "checkbox", data: _Meta.CtrlProc, showIcon: false, width: 300, search: true, height: 350 });

    }
    Ajax.Request('Report.ashx', { Call: 'LimitMonitorGetCtrlproc', case_type: $("#case_type").val(), country: $("#country").attr("objid"), proc_type: $("#proc_type").val() }, Success, true);

}

Limit.BindCtrlprocFee = function () {
    function Success(_Meta) {
        $("#search_type").TreeUser({ tree_id: "ctrl_proc_idfee", SelectType: "checkbox", data: _Meta.CtrlProc, showIcon: false, width: 300, search: true, height: 350 });

    }
    Ajax.Request('Report.ashx', { Call: 'LimitMonitorGetCtrlproc', case_type: $("#case_type_id").val(), country: $("#country_id").attr("objid") }, Success, true);

}

Limit.BindFeeType = function () {
    function Success(_Meta) {
        $("#fee_name").TreeUser({ tree_id: "fee_type_id", SelectType: "checkbox", data: _Meta.FeeType, showIcon: false, width: 300, search: true, height: 350 });

    }
    Ajax.Request('Report.ashx', { Call: 'LimitMonitorGetFeeType', case_type: $("#case_type_id").val(), country: $("#country_id").attr("objid") }, Success, true);
}

//查询列表
Limit.SearchList = function () {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });
    var _data = {};
    _data.select_and = $("#select_and")[0].checked ? "true" : "false";
    _data.Call = 'GetLimitMonitorCaseList';
    _data.is_first = Limit.is_first;
    _data.case_type = $("#case_type").val();
    _data.country = $("#country").attr("objid");
    _data.case_volume = $("#case_volume_other").val();
    _data.case_volume_customer = $("#case_volume_customer_all").val();
    _data.is_fuzzy_query_case_volume_other = $("#is_fuzzy_query_case_volume_other")[0].checked ? true : false;
    _data.is_fuzzy_query_app_no_other = $("#is_fuzzy_query_app_no_other")[0].checked ? true : false;
    _data.is_point_app_no_other = $("#is_point_app_no_other")[0].checked ? true : false;
    _data.applicant = $("#applicant_other").val();
    _data.app_no = $("#app_no_other").val();
    if (Limit.PaiTeEn) {
        _data.int_due_date_s = $("#pt_int_due_date_s").val();
        _data.int_due_date_e = $("#pt_int_due_date_e").val();
        _data.legal_due_date_s = $("#pt_legal_due_date_s").val();
        _data.legal_due_date_e = $("#pt_legal_due_date_e").val();
        _data.cus_due_date_s = $("#pt_cus_due_date_s").val();
        _data.cus_due_date_e = $("#pt_cus_due_date_e").val();
    } else {
        _data.int_due_date_s = $("#int_due_date_s").val();
        _data.int_due_date_e = $("#int_due_date_e").val();
        _data.legal_due_date_s = $("#legal_due_date_s").val();
        _data.legal_due_date_e = $("#legal_due_date_e").val();
        _data.cus_due_date_s = $("#cus_due_date_s").val();
        _data.cus_due_date_e = $("#cus_due_date_e").val();
    }

    _data.int_due_date_isnull = ($("#int_due_date_other_isnull")[0].checked ? "on" : "");
    _data.NKG_date = ($("#NKG_date")[0].checked ? "on" : "");
    _data.legal_due_date_isnull = ($("#legal_due_date_other_isnull")[0].checked ? "on" : "");
    _data.ctrl_proc = $("#ctrl_proc").attr("objid");
    _data.customer_name = $("#customer_name").val();
    _data.customer_code = $("#customer_codes").val();
    _data.introducer = $("#introducer").val();
    _data.doc_date_s = $("#doc_date_s").val();
    _data.doc_date_e = $("#doc_date_e").val();
    _data.charge_date_from = $("#charge_date_from").val();
    _data.charge_date_end = $("#charge_date_end").val();
    _data.doc_date_isnull = ($("#doc_date_other_isnull")[0].checked ? "on" : "");

    _data.smallduc_date_from = $("#smallduc_date_from").val();
    _data.smallduc_date_to = $("#smallduc_date_to").val();
    _data.smallduc_date_isnull = ($("#smallduc_date_isnull")[0].checked ? "on" : "");


    _data.cus_due_date_isnull = ($("#cus_due_date_other_isnull")[0].checked ? "on" : "");
    _data.type = _type;

    _data.apply_subject = $("#apply_subject").attr("objid");

    _data.inventor = $("#inventor").val();
    _data.flow_direction = $("#flow_direction_other").attr("objid");
    _data.proc_pic_user = $("#proc_pic_user_other").attr("objid");
    _data.case_pic_user = $("#case_pic_user").attr("objid");
    _data.branch_dept = $("#branch_dept_id2").attr("objid");
    _data.app_date_from = $("#app_date_from2").val();
    _data.app_date_to = $("#app_date_to2").val();

    _data.app_date_isnull = ($("#app_date_isnull2")[0].checked ? "on" : "");
    _data.month_day_from = $("#month_day_from").val();
    _data.month_day_to = $("#month_day_to").val();


    _data.case_status_id = $("#case_status").attr("objid");
    _data.dept_id = $("#p_case_info__charge_dept_id").attr("objid");
    _data.back_date_start = $("#back_date_start").val();
    _data.back_date_end = $("#back_date_end").val();
    _data.back_inventor_date_start = $("#back_inventor_date_start").val();
    _data.back_inventor_date_end = $("#back_inventor_date_end").val();
    _data.customer_status_id = $("#customer_status").attr("objid");
    _data.revise_user_id = $("#revise_user_id").attr("objid");
    _data.proc_type = $("#proc_type").val();
    _data.proc_note = $("#proc_note").val();
    _data.sales = $("#sales").attr("objid");
    _data.sales_help = $("#sales_help").attr("objid");
    _data.flow_user_id = $("#p_case_info_flow_user_id").attr("objid");
    _data.create_proc_date_start = $("#create_proc_date_start").val();
    _data.create_proc_date_end = $("#create_proc_date_end").val();
    _data.other_agency_id = $("#other_agency_id").attr("objid");
    _data.customer_country = $("#customer_country").attr("objid");
    _data.proc_status = $("#other_proc_status").attr("objid");
    _data.business_type_other = $("#business_type_other").attr("objid");
    _data.apply_tags_id = $("#apply_tags_id_other").attr("objid");
    _data.is_finishdate = $("#is_finishdate").val();
    _data.upload_date_from = $("#upload_date_from").val();
    _data.upload_date_end = $("#upload_date_end").val();
    _data.pic_dept_id = $("#pic_dept_id").attr("objid");
    _data.user_assistant = $("#user_assistant").attr("objid");
    _data.pat_cus_fullname = $("#pat_cus_fullname").val();
    _data.agent_to_reply_start = $("#agent_to_reply_start").val();
    _data.reply_to_agent_start = $("#reply_to_agent_start").val();
    _data.remind_to_agent_start = $("#remind_to_agent_start").val();
    _data.last_deli_deadline_start = $("#last_deli_deadline_start").val();
    _data.book_deli_deadline_start = $("#book_deli_deadline_start").val();
    _data.reply_cus_date_start = $("#reply_cus_date_start").val();
    _data.cus_receipt_start = $("#cus_receipt_start").val();
    _data.finish_revise_date_start = $("#finish_revise_date_start").val();
    _data.cus_entrust_start = $("#cus_entrust_start").val();
    _data.prompt_cus_start = $("#prompt_cus_start").val();
    _data.reply_agengcy_start = $("#reply_agengcy_start").val();
    _data.agengcy_receipt_start = $("#agengcy_receipt_start").val();
    _data.agengcy_revise_start = $("#agengcy_revise_start").val();
    _data.prompt_agengcy_start = $("#prompt_agengcy_start").val();
    _data.third_party_revise_start = $("#third_party_revise_start").val();
    _data.revise_third_party_start = $("#revise_third_party_start").val();
    _data.receipt_third_party_start = $("#receipt_third_party_start").val();
    _data.agent_to_reply_end = $("#agent_to_reply_end").val();
    _data.reply_to_agent_end = $("#reply_to_agent_end").val();
    _data.remind_to_agent_end = $("#remind_to_agent_end").val();
    if (GetPublishConfig("KLFD", "202504")) {
        _data.deli_deadline_start = $("#deli_deadline_start_klfd").val();
        _data.deli_deadline_end = $("#deli_deadline_end_klfd").val();
    }
    _data.last_deli_deadline_end = $("#last_deli_deadline_end").val();
    _data.book_deli_deadline_end = $("#book_deli_deadline_end").val();
    _data.reply_cus_date_end = $("#reply_cus_date_end").val();
    _data.cus_receipt_end = $("#cus_receipt_end").val();
    _data.finish_revise_date_end = $("#finish_revise_date_end").val();
    _data.cus_entrust_end = $("#cus_entrust_end").val();
    _data.prompt_cus_end = $("#prompt_cus_end").val();
    _data.reply_agengcy_end = $("#reply_agengcy_end").val();
    _data.agengcy_receipt_end = $("#agengcy_receipt_end").val();
    _data.agengcy_revise_end = $("#agengcy_revise_end").val();
    _data.prompt_agengcy_end = $("#prompt_agengcy_end").val();
    _data.third_party_revise_end = $("#third_party_revise_end").val();
    _data.revise_third_party_end = $("#revise_third_party_end").val();
    _data.receipt_third_party_end = $("#receipt_third_party_end").val();
    _data.column1 = $("#column_1").val();
    _data.column2 = $("#column_2").val();
    _data.column3 = $("#column_3").val();
    _data.column4 = $("#column_4").val();
    _data.column5 = $("#column_5").val();
    if (GetPublishConfig("ZITENT", "is_show_cloum")) {
        _data.deli_deadline_start = $("#deli_deadline_start_klfd").val();
        _data.deli_deadline_end = $("#deli_deadline_end_klfd").val();
    }
    if (GetPublishConfig("ZITENT", "is_show_cloum") && _type === 'all') {
        _data.case_mail_date_isnull = ($("#case_mail_date_isnull")[0].checked ? "on" : "");
        _data.case_mail_date_start = $("#case_mail_date_from").val();
        _data.case_mail_date_end = $("#case_mail_date_to").val();
    }


    if (_data.type == "flow") {
        //流程节点备注
        _data.node_remark = $("#f_node_remark").val();
        //流程类型
        _data.flow_type = $("#f_flow_type").val();
        //流程节点
        _data.flow_node = $("#f_flow_node").attr("objid");
        //流程节点当前状态
        _data.nodeCurState = $("#f_nodeCurState").val();
        if (_data.nodeCurState == "1" && _data.flow_type == "") {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S140821215155106', '请选择流程类型！'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        //进入时间
        _data.create_time_s = $("#f_create_time_s").val();
        _data.create_time_e = $("#f_create_time_e").val();
        _data.create_time_isnull = ($("#f_create_time_other_isnull").is("checked") ? "on" : "");//
        //办理人员
        _data.audit_user = $("#f_audit_user").attr("objid");
        //办理时间
        _data.audit_time_s = $("#f_audit_time_s").val();
        _data.audit_time_e = $("#f_audit_time_e").val();
        _data.audit_time_isnull = ($("#f_audit_time_other_isnull").is("checked") ? "on" : "");//
        //节点内部期限
        _data.nodeIntDueDate_s = $("#f_nodeIntDueDate_s").val();
        _data.nodeIntDueDate_e = $("#f_nodeIntDueDate_e").val();
        _data.nodeIntDueDate_isnull = ($("#f_nodeIntDueDate_other_isnull").is("checked") ? "on" : "");//
        //节点客户期限
        _data.nodeCusDueDate_s = $("#f_nodeCusDueDate_s").val();
        _data.nodeCusDueDate_e = $("#f_nodeCusDueDate_e").val();
        _data.nodeCusDueDate_isnull = ($("#f_nodeCusDueDate_other_isnull").is("checked") ? "on" : "");//
        //是否费减
        _data.is_fee_reduce = $("#f_is_fee_reduce").val();
        //费减状态
        _data.fee_reduce_state = $("#f_fee_reduce_state").val();
        //是否项目制客户
        _data.is_item_cus = $("#f_is_item_cus").val();
        _data.Call = "FlowMonitorInfo";
    }
    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            LimitMonitorList.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                { type: 'checkbox' },
                {
                    field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                        return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                            + "<a title='编辑' class='tbedit' onclick='Limit.OpenCaseProc(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
                    }
                },
                {
                    field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                        return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
                    }
                },
                {
                    field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100
                        
                   
                },
                { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
                { field: 'pic', title: GetResource('S140823161417467', '处理人'), sort: true, minWidth: 100 },
                { field: 'review_stage', title: GetResource('S150203143844255', '案件阶段'), sort: true, minWidth: 80 },
                { field: 'doc_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
                { field: 'int_due_date', title: GetResource('S140823161428652', '内部期限'), sort: true, minWidth: 100 },
                { field: 'smallduc_date', title: GetResource('S180417221952195', '最早期限'), minWidth: 100, sort: true },
                { field: 'cus_due_date', title: GetResource('S140821164259916', '客户期限'), sort: true, minWidth: 100 },
                { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 100 },
                { field: 'foreign_pic', title: GetResource('S150912180248839', '事项对外处理人'), sort: true, minWidth: 110, hide: true},
                { field: 'foreign_pic_case', title: GetResource('S170715174324145', '案件对外处理人'), sort: true, minWidth: 100 },

                { field: 'distance_legal_due_date', title: GetResource('S180625171054190', '距官方期限天数'), minWidth: 120, hide: true },
                { field: 'distance_cus_due_date', title: GetResource('S180625171110600', '距客户期限天数'), minWidth: 120, hide: true },
                { field: 'distance_int_due_date', title: GetResource('S180625171054190', '距内部期限天数'), minWidth: 120, hide: true },
                { field: 'legal_due_date_countdown', title: GetResource('S230317134630981', '官方期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'cus_due_date_countdown', title: GetResource('S230317134614682', '客户期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'int_due_date_countdown', title: GetResource('S230317134623793', '内部期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
                { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100, hide: true },
                { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100, hide: true },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100, hide: true },
                { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'applicant_name_en', title: GetResource('S241114205447085', '申请人英文'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'receipt_date', title: GetResource('S160113154334081', '收文日期'), sort: true, minWidth: 100, hide: true },
                { field: 'issue_no', title: GetResource('S141009101941489', '注册号'), sort: true, minWidth: 100, hide: true },
                { field: 'dept_name', title: GetResource('S170419160623634', '所属分部'), sort: true, minWidth: 100, hide: true },
                { field: 'agency_name', title: GetResource('S141106084922906', '代理机构'), sort: true, minWidth: 130, hide: true },
                { field: 'register_type_code', title: GetResource('S160308101917419', '商标类别'), sort: true, minWidth: 100, hide: true },
                { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), style: 'text-align:left', sort: true, minWidth: 115, hide: true },
                { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 115, hide: true },
                { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100, hide: true },
                { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 110 },
                { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 80 },
                { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
                { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
                { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
                { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
                { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 100, hide: true },
                { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 100, hide: true },
                { field: 'first_doc_date', title: GetResource('S140823161500382', '初稿日'), sort: true, minWidth: 100, hide: true },
                { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
                { field: 'contact_ipr', title: GetResource('S201009085840139', '客户联系人(IPR)'), sort: true, minWidth: 100, hide: true },
                { field: 'img_url', title: GetResource('S190118110903654', '商标图样'), sort: true, minWidth: 120, templet: function (d) { return Limit.loadImg(d) }, hide: true },
                { field: 'apply_type', title: GetResource('S140821164234972', '申请类型'), sort: true, minWidth: 120 , hide: true },
                { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
                { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
                { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
                { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
                { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
                { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },


                
                { field: 'deli_deadline', title: GetResource('S221219120246247', GetPublishConfigValueFn('jx_columns', 'jx_date')), sort: true, minWidth: 120, hide: true },
                { field: 'hearing_the_case', title: GetResource('S201203205828800', '是否预审'), sort: true, minWidth: 80, hide: true },
                { field: 'is_speed_checkd', title: GetResource('S171103173735807', '是否优先审查'), sort: true, minWidth: 80, hide: true },
                { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
                { field: 'create_time', title: GetResource('S150226092116115', '开卷日期'), sort: true, minWidth: 100, hide: true },
                { field: 'case_mail_date', title: GetResource('S140905175829100', '送合作所日'), sort: true, minWidth: 100 },
                { field: 'pat_cus_fullname', title: GetResource('S150226092116115', '客户全称'), sort: true, minWidth: 100, hide: true },
                { field: 'agent_to_reply', title: GetResource('S150226092116115', '代理人回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'reply_to_agent', title: GetResource('S150226092116115', '回复代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'remind_to_agent', title: GetResource('S150226092116115', '提醒代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'last_deli_deadline', title: GetResource('S150226092116115', '最终绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'book_deli_deadline', title: GetResource('S150226092116115', '书面绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_receipt', title: GetResource('S150226092116115', '客户确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_entrust', title: GetResource('S150226092116115', '客户委托日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_cus', title: GetResource('S150226092116115', '提示客户日'), sort: true, minWidth: 100, hide: true },
                { field: 'agengcy_receipt', title: GetResource('S150226092116115', '外所确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_agengcy', title: GetResource('S150226092116115', '提示外所日'), sort: true, minWidth: 100, hide: true },
                { field: 'third_party_revise', title: GetResource('S150226092116115', '第三方回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'revise_third_party', title: GetResource('S150226092116115', '回复第三方日'), sort: true, minWidth: 100, hide: true },
                { field: 'receipt_third_party', title: GetResource('S150226092116115', '第三方确收日'), sort: true, minWidth: 100, hide: true }
         
            ]];

            if (GetPublishConfig('SHEWAI', 'DATE')) {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: Limit.reply_cus_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: Limit.finish_revise_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: Limit.reply_agengcy, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: Limit.agengcy_revise, sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            else {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: GetResource('S201228165440862', '回复客户日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: GetResource('S201228165440862', '客户回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: GetResource('S201228165440862', '回复外所日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: GetResource('S201228165440862', '外所回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            if (GetPublishConfig("ZITENT", "is_show_cloum")) {
                LimitMonitorList.CaseCols[0].push({ field: 'cus_finish_doc_date', title: GetResource('S220217174536021', '客户定稿日'), sort: true, minWidth: 100 });
                LimitMonitorList.CaseCols[0].push({ field: 'cus_filing_date', title: GetResource('S230321155440696', '客户要求递交日'), sort: true, minWidth: 100 });
               
                LimitMonitorList.CaseCols[0].push({ field: 'script_deli_deadline', title: GetResource('S220520140519735', '一稿交付绝限'), sort: true, minWidth: 100 });
                LimitMonitorList.CaseCols[0].push({ field: 'cus_handle_doc_date', title: GetResource('S220217174601122', '实际处理日'), sort: true, minWidth: 100 });
                LimitMonitorList.CaseCols[0].push({ field: 'verification_type', title: GetResource('S230321155440696', '核查类型'), sort: true, minWidth: 100 });
                LimitMonitorList.CaseCols[0].push({ field: 'is_featuring', title: GetResource('S210719113653023', '是否统包'), sort: true, minWidth: 100 });
            }
            if (Limit.isSecrecy) {
                LimitMonitorList.CaseCols[0].splice(2, 1);
            }

            if (GetPublishConfig("ZBSD", "is_show_column")) {
                if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
                    LimitMonitorList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
                }

            }
            if (GetPublishConfig("KLFD", "202507")) {
                LimitMonitorList.CaseCols[0].push({ field: 'proc_fd_case_volume', title: GetResource('S240425163338014', '事项我方文号'), sort: true, minWidth: 100 });
                LimitMonitorList.CaseCols[0].push({ field: 'proc_fd_app_no', title: GetResource('S240425163125783','事项申请号'), sort: true, minWidth: 100 });
                LimitMonitorList.CaseCols[0].push({ field: 'proc_fd_customer_case_volume', title: GetResource('S240425163345101','事项客户文号'), sort: true, minWidth: 100 });
            }

            // 派特恩定制
            if (!Limit.PaiTeEn) {
                for (var i = 0; i < LimitMonitorList.CaseCols[0].length; i++) {
                    if (LimitMonitorList.CaseCols[0][i].field == 'agent_to_reply'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'remind_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'last_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'book_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_cus_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'finish_revise_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_entrust'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_cus'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'third_party_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'revise_third_party'
                        || LimitMonitorList.CaseCols[0][i].field == 'pat_cus_fullname'
                        || LimitMonitorList.CaseCols[0][i].field == 'receipt_third_party') {
                        LimitMonitorList.CaseCols[0].splice(i, 1);
                        i--;
                    }
                }
            }
            
            break;
        case 'pay':
            table_id = "CaseList_pay";
            LimitMonitorList.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                { type: 'checkbox' },
                {
                    field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                        return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                            + "<a title='编辑' class='tbedit' onclick='Limit.OpenCaseProc(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
                    }
                },
                {
                    field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                        return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
                    }
                },
                {
                    field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100
                        
                    
                },
                { field: 'app_date', title: GetResource('S140822170743359', '申请日'), sort: true, minWidth: 100 },
                { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
                { field: 'pic', title: GetResource('S140823161417467', '处理人'), sort: true, minWidth: 100 },
                { field: 'review_stage', title: GetResource('S150203143844255', '案件阶段'), sort: true, minWidth: 100 },
                { field: 'doc_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
                { field: 'int_due_date', title: GetResource('S140823161428652', '内部期限'), sort: true, minWidth: 100 },
                { field: 'cus_due_date', title: GetResource('S140821164259916', '客户期限'), sort: true, minWidth: 100 },
                { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 100 },
                { field: 'distance_legal_due_date', title: GetResource('S180625171054190', '距官方期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_cus_due_date', title: GetResource('S180625171110600', '距客户期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_int_due_date', title: GetResource('S180625171054190', '距内部期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'legal_due_date_countdown', title: GetResource('S230317134630981', '官方期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'cus_due_date_countdown', title: GetResource('S230317134614682', '客户期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'int_due_date_countdown', title: GetResource('S230317134623793', '内部期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
                { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100, hide: true },
                { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100, hide: true },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100, hide: true },
                { field: 'apply_type', title: GetResource('S140821164234972', '申请类型'), sort: true, minWidth: 120, hide: true },
                { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), style: 'text-align:left', sort: true, minWidth: 110, hide: true },
                { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 110, hide: true },
                { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100, hide: true },
                { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 100 },
                { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 100 },
                { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'applicant_name_en', title: GetResource('S241114205447085', '申请人英文'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
                { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
                { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
                { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
                { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 110, hide: true },
                { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 120, hide: true },
                { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
                { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
                { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
                { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
                { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
                { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
                { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
                { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },
                { field: 'pat_cus_fullname', title: GetResource('S150226092116115', '客户全称'), sort: true, minWidth: 100, hide: true },
                { field: 'agent_to_reply', title: GetResource('S150226092116115', '代理人回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'reply_to_agent', title: GetResource('S150226092116115', '回复代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'remind_to_agent', title: GetResource('S150226092116115', '提醒代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'last_deli_deadline', title: GetResource('S150226092116115', '最终绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'book_deli_deadline', title: GetResource('S150226092116115', '书面绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_receipt', title: GetResource('S150226092116115', '客户确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_entrust', title: GetResource('S150226092116115', '客户委托日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_cus', title: GetResource('S150226092116115', '提示客户日'), sort: true, minWidth: 100, hide: true },
                { field: 'agengcy_receipt', title: GetResource('S150226092116115', '外所确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_agengcy', title: GetResource('S150226092116115', '提示外所日'), sort: true, minWidth: 100, hide: true },
                { field: 'third_party_revise', title: GetResource('S150226092116115', '第三方回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'revise_third_party', title: GetResource('S150226092116115', '回复第三方日'), sort: true, minWidth: 100, hide: true },
                { field: 'receipt_third_party', title: GetResource('S150226092116115', '第三方确收日'), sort: true, minWidth: 100, hide: true }
            ]];
            if (GetPublishConfig('SHEWAI', 'DATE')) {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: Limit.reply_cus_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: Limit.finish_revise_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: Limit.reply_agengcy, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: Limit.agengcy_revise, sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            else {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: GetResource('S201228165440862', '回复客户日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: GetResource('S201228165440862', '客户回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: GetResource('S201228165440862', '回复外所日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: GetResource('S201228165440862', '外所回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            if (Limit.isSecrecy) {
                LimitMonitorList.CaseCols[0].splice(2, 1);
            }
            if (GetPublishConfig("ZBSD", "is_show_column")) {
                if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
                    LimitMonitorList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
                }

            }
            // 派特恩定制
            if (!Limit.PaiTeEn) {
                for (var i = 0; i < LimitMonitorList.CaseCols[0].length; i++) {
                    if (LimitMonitorList.CaseCols[0][i].field == 'agent_to_reply'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'remind_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'last_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'book_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_cus_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'finish_revise_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_entrust'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_cus'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'third_party_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'revise_third_party'
                        || LimitMonitorList.CaseCols[0][i].field == 'pat_cus_fullname'
                        || LimitMonitorList.CaseCols[0][i].field == 'receipt_third_party') {
                        LimitMonitorList.CaseCols[0].splice(i, 1);
                        i--;
                    }
                }
            }
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            LimitMonitorList.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                { type: 'checkbox' },
                {
                    field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                        return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                            + "<a title='编辑' class='tbedit' onclick='Limit.OpenCaseProc(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
                    }
                },
                {
                    field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                        return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
                    }
                },
                {
                    field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100
                       
                   
                },
                { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
                { field: 'pic', title: GetResource('S140823161417467', '处理人'), sort: true, minWidth: 100 },
                { field: 'review_stage', title: GetResource('S150203143844255', '案件阶段'), sort: true, minWidth: 80 },
                { field: 'doc_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
                { field: 'int_due_date', title: GetResource('S140823161428652', '内部期限'), sort: true, minWidth: 100 },
                { field: 'cus_due_date', title: GetResource('S140821164259916', '客户期限'), sort: true, minWidth: 100 },
                { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 100 },
                { field: 'distance_legal_due_date', title: GetResource('S180625171054190', '距官方期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_cus_due_date', title: GetResource('S180625171110600', '距客户期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_int_due_date', title: GetResource('S180625171054190', '距内部期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'legal_due_date_countdown', title: GetResource('S230317134630981', '官方期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'cus_due_date_countdown', title: GetResource('S230317134614682', '客户期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'int_due_date_countdown', title: GetResource('S230317134623793', '内部期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
                { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100, hide: true },
                { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100, hide: true },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100, hide: true },
                { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), style: 'text-align:left', sort: true, minWidth: 115, hide: true },
                { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 110, hide: true },
                { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100, hide: true },
                { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 100 },
                { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 100 },
                { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'applicant_name_en', title: GetResource('S241114205447085', '申请人英文'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
                { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
                { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
                { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
                { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 100, hide: true },
                { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 100, hide: true },
                { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
                { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
                { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
                { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
                { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
                { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
                { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
                { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },
                { field: 'pat_cus_fullname', title: GetResource('S150226092116115', '客户全称'), sort: true, minWidth: 100, hide: true },
                { field: 'agent_to_reply', title: GetResource('S150226092116115', '代理人回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'reply_to_agent', title: GetResource('S150226092116115', '回复代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'remind_to_agent', title: GetResource('S150226092116115', '提醒代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'last_deli_deadline', title: GetResource('S150226092116115', '最终绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'book_deli_deadline', title: GetResource('S150226092116115', '书面绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_receipt', title: GetResource('S150226092116115', '客户确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_entrust', title: GetResource('S150226092116115', '客户委托日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_cus', title: GetResource('S150226092116115', '提示客户日'), sort: true, minWidth: 100, hide: true },
                { field: 'agengcy_receipt', title: GetResource('S150226092116115', '外所确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_agengcy', title: GetResource('S150226092116115', '提示外所日'), sort: true, minWidth: 100, hide: true },
                { field: 'third_party_revise', title: GetResource('S150226092116115', '第三方回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'revise_third_party', title: GetResource('S150226092116115', '回复第三方日'), sort: true, minWidth: 100, hide: true },
                { field: 'receipt_third_party', title: GetResource('S150226092116115', '第三方确收日'), sort: true, minWidth: 100, hide: true }
            ]];
            if (GetPublishConfig('SHEWAI', 'DATE')) {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: Limit.reply_cus_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: Limit.finish_revise_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: Limit.reply_agengcy, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: Limit.agengcy_revise, sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            else {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: GetResource('S201228165440862', '回复客户日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: GetResource('S201228165440862', '客户回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: GetResource('S201228165440862', '回复外所日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: GetResource('S201228165440862', '外所回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            if (Limit.isSecrecy) {
                LimitMonitorList.CaseCols[0].splice(2, 1);
            }
            if (GetPublishConfig("ZBSD", "is_show_column")) {
                if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
                    LimitMonitorList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
                }

            }
            // 派特恩定制
            if (!Limit.PaiTeEn) {
                for (var i = 0; i < LimitMonitorList.CaseCols[0].length; i++) {
                    if (LimitMonitorList.CaseCols[0][i].field == 'agent_to_reply'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'remind_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'last_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'book_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_cus_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'finish_revise_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_entrust'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_cus'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'third_party_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'revise_third_party'
                        || LimitMonitorList.CaseCols[0][i].field == 'pat_cus_fullname'
                        || LimitMonitorList.CaseCols[0][i].field == 'receipt_third_party') {
                        LimitMonitorList.CaseCols[0].splice(i, 1);
                        i--;
                    }
                }
            }
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            LimitMonitorList.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                { type: 'checkbox' },
                {
                    field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                        return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                            + "<a title='编辑' class='tbedit' onclick='Limit.OpenCaseProc(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
                    }
                },
                {
                    field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                        return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
                    }
                },
                { field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100 },
                { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
                { field: 'pic', title: GetResource('S140823161417467', '处理人'), sort: true, minWidth: 100 },
                { field: 'review_stage', title: GetResource('S150203143844255', '案件阶段'), sort: true, minWidth: 100 },
                { field: 'doc_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
                { field: 'int_due_date', title: GetResource('S140823161428652', '内部期限'), sort: true, minWidth: 100 },
                { field: 'cus_due_date', title: GetResource('S140821164259916', '客户期限'), sort: true, minWidth: 100 },
                { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 100 },
                { field: 'distance_legal_due_date', title: GetResource('S180625171054190', '距官方期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_cus_due_date', title: GetResource('S180625171110600', '距客户期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_int_due_date', title: GetResource('S180625171054190', '距内部期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'legal_due_date_countdown', title: GetResource('S230317134630981', '官方期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'cus_due_date_countdown', title: GetResource('S230317134614682', '客户期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'int_due_date_countdown', title: GetResource('S230317134623793', '内部期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
                { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100, hide: true },
                { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100, hide: true },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100, hide: true },
                { field: 'app_date', title: GetResource('S140822170832920', '申请日'), sort: true, minWidth: 100, hide: true },
                { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), style: 'text-align:left', sort: true, minWidth: 110, hide: true },
                { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 110, hide: true },
                { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100, hide: true },
                { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 95 },
                { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 95 },
                { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 95, style: 'text-align:left', hide: true },
                { field: 'applicant_name_en', title: GetResource('S241114205447085', '申请人英文'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 110, hide: true },
                { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
                { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
                { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
                { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
                { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 110, hide: true },
                { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 100, hide: true },
                { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
                { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
                { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
                { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
                { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
                { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
                { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
                { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },
                { field: 'pat_cus_fullname', title: GetResource('S150226092116115', '客户全称'), sort: true, minWidth: 100, hide: true },
                { field: 'agent_to_reply', title: GetResource('S150226092116115', '代理人回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'reply_to_agent', title: GetResource('S150226092116115', '回复代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'remind_to_agent', title: GetResource('S150226092116115', '提醒代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'last_deli_deadline', title: GetResource('S150226092116115', '最终绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'book_deli_deadline', title: GetResource('S150226092116115', '书面绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_receipt', title: GetResource('S150226092116115', '客户确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_entrust', title: GetResource('S150226092116115', '客户委托日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_cus', title: GetResource('S150226092116115', '提示客户日'), sort: true, minWidth: 100, hide: true },
                { field: 'agengcy_receipt', title: GetResource('S150226092116115', '外所确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_agengcy', title: GetResource('S150226092116115', '提示外所日'), sort: true, minWidth: 100, hide: true },
                { field: 'third_party_revise', title: GetResource('S150226092116115', '第三方回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'revise_third_party', title: GetResource('S150226092116115', '回复第三方日'), sort: true, minWidth: 100, hide: true },
                { field: 'receipt_third_party', title: GetResource('S150226092116115', '第三方确收日'), sort: true, minWidth: 100, hide: true }
            ]];
            if (GetPublishConfig('SHEWAI', 'DATE')) {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: Limit.reply_cus_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: Limit.finish_revise_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: Limit.reply_agengcy, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: Limit.agengcy_revise, sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            else {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: GetResource('S201228165440862', '回复客户日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: GetResource('S201228165440862', '客户回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: GetResource('S201228165440862', '回复外所日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: GetResource('S201228165440862', '外所回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            if (Limit.isSecrecy) {
                LimitMonitorList.CaseCols[0].splice(2, 1);
            }
            if (GetPublishConfig("ZBSD", "is_show_column")) {
                if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
                    LimitMonitorList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
                }

            }
            // 派特恩定制
            if (!Limit.PaiTeEn) {
                for (var i = 0; i < LimitMonitorList.CaseCols[0].length; i++) {
                    if (LimitMonitorList.CaseCols[0][i].field == 'agent_to_reply'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'remind_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'last_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'book_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_cus_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'finish_revise_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_entrust'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_cus'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'third_party_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'revise_third_party'
                        || LimitMonitorList.CaseCols[0][i].field == 'pat_cus_fullname'
                        || LimitMonitorList.CaseCols[0][i].field == 'receipt_third_party') {
                        LimitMonitorList.CaseCols[0].splice(i, 1);
                        i--;
                    }
                }
            }
            break;
        case 'recall':
            table_id = "CaseList_recall";
            LimitMonitorList.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                { type: 'checkbox' },
                {
                    field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                        return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                            + "<a title='编辑' class='tbedit' onclick='Limit.OpenCaseProc(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
                    }
                },
                {
                    field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                        return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
                    }
                },
                {
                    field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100
                   
                },
                { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
                { field: 'pic', title: GetResource('S140823161417467', '处理人'), sort: true, minWidth: 100 },
                { field: 'review_stage', title: GetResource('S150203143844255', '案件阶段'), sort: true, minWidth: 100 },
                { field: 'doc_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
                { field: 'int_due_date', title: GetResource('S140823161428652', '内部期限'), sort: true, minWidth: 100 },
                { field: 'cus_due_date', title: GetResource('S140821164259916', '客户期限'), sort: true, minWidth: 100 },
                { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 120 },
                { field: 'distance_legal_due_date', title: GetResource('S180625171054190', '距官方期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_cus_due_date', title: GetResource('S180625171110600', '距客户期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_int_due_date', title: GetResource('S180625171054190', '距内部期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'legal_due_date_countdown', title: GetResource('S230317134630981', '官方期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'cus_due_date_countdown', title: GetResource('S230317134614682', '客户期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'int_due_date_countdown', title: GetResource('S230317134623793', '内部期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
                { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100, hide: true },
                { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100, hide: true },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100, hide: true },
                { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), style: 'text-align:left', sort: true, minWidth: 110, hide: true },
                { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 110, hide: true },
                { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100, hide: true },
                { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 100 },
                { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 100 },
                { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
                { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
                { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
                { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
                { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 100, hide: true },
                { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 100, hide: true },
                { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
                { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
                { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
                { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
                { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
                { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
                { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
                { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },
                { field: 'pat_cus_fullname', title: GetResource('S150226092116115', '客户全称'), sort: true, minWidth: 100, hide: true },
                { field: 'agent_to_reply', title: GetResource('S150226092116115', '代理人回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'reply_to_agent', title: GetResource('S150226092116115', '回复代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'remind_to_agent', title: GetResource('S150226092116115', '提醒代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'last_deli_deadline', title: GetResource('S150226092116115', '最终绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'book_deli_deadline', title: GetResource('S150226092116115', '书面绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_receipt', title: GetResource('S150226092116115', '客户确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_entrust', title: GetResource('S150226092116115', '客户委托日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_cus', title: GetResource('S150226092116115', '提示客户日'), sort: true, minWidth: 100, hide: true },
                { field: 'agengcy_receipt', title: GetResource('S150226092116115', '外所确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_agengcy', title: GetResource('S150226092116115', '提示外所日'), sort: true, minWidth: 100, hide: true },
                { field: 'third_party_revise', title: GetResource('S150226092116115', '第三方回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'revise_third_party', title: GetResource('S150226092116115', '回复第三方日'), sort: true, minWidth: 100, hide: true },
                { field: 'receipt_third_party', title: GetResource('S150226092116115', '第三方确收日'), sort: true, minWidth: 100, hide: true }
            ]];
            if (GetPublishConfig('SHEWAI', 'DATE')) {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: Limit.reply_cus_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: Limit.finish_revise_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: Limit.reply_agengcy, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: Limit.agengcy_revise, sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            else {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: GetResource('S201228165440862', '回复客户日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: GetResource('S201228165440862', '客户回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: GetResource('S201228165440862', '回复外所日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: GetResource('S201228165440862', '外所回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            if (Limit.isSecrecy) {
                LimitMonitorList.CaseCols[0].splice(2, 1);
            }
            if (GetPublishConfig("ZBSD", "is_show_column")) {
                if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
                    LimitMonitorList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
                }

            }
            // 派特恩定制
            if (!Limit.PaiTeEn) {
                for (var i = 0; i < LimitMonitorList.CaseCols[0].length; i++) {
                    if (LimitMonitorList.CaseCols[0][i].field == 'agent_to_reply'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'remind_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'last_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'book_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_cus_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'finish_revise_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_entrust'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_cus'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'third_party_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'revise_third_party'
                        || LimitMonitorList.CaseCols[0][i].field == 'pat_cus_fullname'
                        || LimitMonitorList.CaseCols[0][i].field == 'receipt_third_party') {
                        LimitMonitorList.CaseCols[0].splice(i, 1);
                        i--;
                    }
                }
            }
            break;
        case 'priority':
            table_id = "CaseList_priority";
            LimitMonitorList.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                { type: 'checkbox' },
                {
                    field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                        return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                            + "<a title='编辑' class='tbedit' onclick='Limit.OpenCaseProc(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
                    }
                },
                {
                    field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                        return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
                    }
                },
                {
                    field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100
                    
                   
                },
                { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
                { field: 'pic', title: GetResource('S140823161417467', '处理人'), sort: true, minWidth: 100 },
                { field: 'review_stage', title: GetResource('S150203143844255', '案件阶段'), sort: true, minWidth: 100 },
                { field: 'doc_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
                { field: 'int_due_date', title: GetResource('S140823161428652', '内部期限'), sort: true, minWidth: 100 },
                { field: 'cus_due_date', title: GetResource('S140821164259916', '客户期限'), sort: true, minWidth: 100 },
                { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 120 },
                { field: 'distance_legal_due_date', title: GetResource('S180625171054190', '距官方期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_cus_due_date', title: GetResource('S180625171110600', '距客户期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'distance_int_due_date', title: GetResource('S180625171054190', '距内部期限天数'), sort: true, minWidth: 120, hide: true },
                { field: 'legal_due_date_countdown', title: GetResource('S230317134630981', '官方期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'cus_due_date_countdown', title: GetResource('S230317134614682', '客户期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'int_due_date_countdown', title: GetResource('S230317134623793', '内部期限倒计时'), sort: true, minWidth: 120, hide: true },
                { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
                { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100, hide: true },
                { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100, hide: true },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100, hide: true },
                { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), style: 'text-align:left', sort: true, minWidth: 100, hide: true },
                { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 100, hide: true },
                { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100, hide: true },
                { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 100 },
                { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 100 },
                { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
                { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 100, hide: true },
                { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
                { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
                { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
                { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
                { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 100, hide: true },
                { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 100, hide: true },
                { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
                { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
                { field: 'img_url', title: GetResource('S190118110903654', '商标图样'), sort: true, minWidth: 120, templet: function (d) { return Limit.loadImg(d) }, hide: true },
                { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
                { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
                { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
                { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
                { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
                { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true },
                { field: 'pat_cus_fullname', title: GetResource('S150226092116115', '客户全称'), sort: true, minWidth: 100, hide: true },
                { field: 'agent_to_reply', title: GetResource('S150226092116115', '代理人回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'reply_to_agent', title: GetResource('S150226092116115', '回复代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'remind_to_agent', title: GetResource('S150226092116115', '提醒代理人日'), sort: true, minWidth: 100, hide: true },
                { field: 'last_deli_deadline', title: GetResource('S150226092116115', '最终绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'book_deli_deadline', title: GetResource('S150226092116115', '书面绝限日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_receipt', title: GetResource('S150226092116115', '客户确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'cus_entrust', title: GetResource('S150226092116115', '客户委托日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_cus', title: GetResource('S150226092116115', '提示客户日'), sort: true, minWidth: 100, hide: true },
                { field: 'agengcy_receipt', title: GetResource('S150226092116115', '外所确收日'), sort: true, minWidth: 100, hide: true },
                { field: 'prompt_agengcy', title: GetResource('S150226092116115', '提示外所日'), sort: true, minWidth: 100, hide: true },
                { field: 'third_party_revise', title: GetResource('S150226092116115', '第三方回复日'), sort: true, minWidth: 100, hide: true },
                { field: 'revise_third_party', title: GetResource('S150226092116115', '回复第三方日'), sort: true, minWidth: 100, hide: true },
                { field: 'receipt_third_party', title: GetResource('S150226092116115', '第三方确收日'), sort: true, minWidth: 100, hide: true }
            ]];
            if (GetPublishConfig('SHEWAI', 'DATE')) {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: Limit.reply_cus_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: Limit.finish_revise_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: Limit.reply_agengcy, sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: Limit.agengcy_revise, sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            else {
                LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: GetResource('S201228165440862', '回复客户日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: GetResource('S201228165440862', '客户回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: GetResource('S201228165440862', '回复外所日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
                LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: GetResource('S201228165440862', '外所回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
            }
            if (Limit.isSecrecy) {
                LimitMonitorList.CaseCols[0].splice(2, 1);
            }
            if (GetPublishConfig("ZBSD", "is_show_column")) {
                if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
                    LimitMonitorList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
                }

            }
            // 派特恩定制
            if (!Limit.PaiTeEn) {
                for (var i = 0; i < LimitMonitorList.CaseCols[0].length; i++) {
                    if (LimitMonitorList.CaseCols[0][i].field == 'agent_to_reply'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'remind_to_agent'
                        || LimitMonitorList.CaseCols[0][i].field == 'last_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'book_deli_deadline'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_cus_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'finish_revise_date'
                        || LimitMonitorList.CaseCols[0][i].field == 'cus_entrust'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_cus'
                        || LimitMonitorList.CaseCols[0][i].field == 'reply_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_receipt'
                        || LimitMonitorList.CaseCols[0][i].field == 'agengcy_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'prompt_agengcy'
                        || LimitMonitorList.CaseCols[0][i].field == 'third_party_revise'
                        || LimitMonitorList.CaseCols[0][i].field == 'revise_third_party'
                        || LimitMonitorList.CaseCols[0][i].field == 'pat_cus_fullname'
                        || LimitMonitorList.CaseCols[0][i].field == 'receipt_third_party') {
                        LimitMonitorList.CaseCols[0].splice(i, 1);
                        i--;
                    }
                }
            }
            break;
        case 'flow':
            table_id = "CaseList_flow";
            LimitMonitorList.CaseCols = [[
                { type: 'numbers', fixed: 'left' },
                { type: 'checkbox' },
                {
                    field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                        return LimitFlowClick(row.case_id, row.case_volume, row.case_name, row.case_type_id);
                    }
                },
                { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, style: 'text-align:left', minWidth: 80 },
                { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, style: 'text-align:left', minWidth: 80 },
                { field: 'processName', title: GetResource('S140822170832920', '流程类型'), sort: true, minWidth: 110 },
                { field: 'node_name_zh_cn', title: GetResource('S140822170832920', '流程节点'), sort: true, minWidth: 110 },
                { field: 'entry_time_ss', title: GetResource('S140814204116996', '进入时间'), sort: true, minWidth: 100 },
                { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 80 },
                { field: 'in_base_date', title: GetResource('S140823161428652', '节点内部期限'), sort: true, minWidth: 80 },
                { field: 'cus_base_date', title: GetResource('none', '节点客户期限'), sort: true, minWidth: 80 },
                { field: 'node_state', title: GetResource('S150203143844255', '当前状态'), sort: true, minWidth: 80 },
                { field: 'audit_cn_name', title: GetResource('S140814204116996', '办理人员'), sort: true, minWidth: 80 },
                { field: 'audit_time_ss', title: GetResource('S140814204116996', '办理时间'), sort: true, minWidth: 100 },
                { field: 'is_fee_reduce', title: GetResource('S141107200224536', '是否费减'), sort: true, minWidth: 80 },
                { field: 'fee_reduce_state', title: GetResource('S140822171057018', '费减状态'), sort: true, style: 'text-align:left', minWidth: 80 },
                { field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 110 },
                { field: 'proc_status', title: GetResource('S141107200224536', '处理事项状态'), sort: true, minWidth: 80 },
                { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
                { field: 'remark_infos', title: GetResource('S140808093432700', '流程节点备注'), sort: true, style: 'text-align:left', minWidth: 120 },
                { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
                { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
                { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
                { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
                { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
                { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true }

            ]];
            if (GetPublishConfig("ZBSD", "is_show_column")) {
                if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
                    LimitMonitorList.CaseCols[0].push({ field: 'user_assistant_name', title: GetResource('S250523201311872', '案件处理人助理'), sort: true, minWidth: 100 });
                }

            }
            break;

    }
    

  
    Ajax.LoadLayuiTable(LimitMonitorList, table_id, 'Report.ashx', LimitMonitorList.CaseCols, _data, function (data) {
        $("div.layui-form-checkbox").css("margin-top", "5px");//使复选框居中
        var length = 0;
        if (data.TableRows) {
            length = data.TableRows.length;
            for (var i = 0; i < length; i++) {
                var row = data.TableRows[i];
                var int_due_date = row.int_due_date;
                var cus_due_date = row.cus_due_date;
                var legal_due_date = row.legal_due_date;
                var tr = $("#" + table_id).next().find(".layui-table-main tr[data-index=" + i + "]");
                var case_name_td = tr.find("td[data-field='case_name']");
                var customer_name_td = tr.find("td[data-field='customer_name']");
                case_name_td.attr("title", $.NoSpace(case_name_td.text()));
                customer_name_td.attr("title", $.NoSpace(customer_name_td.text()));
                tr.attr("onclick", "Limit.ClickTrChangeColor('" + table_id + "',this)");
                tr.attr("id", row.proc_id);
                if (int_due_date != '') {
                    if ($.DateDiff(int_due_date, $.curDateTime(false)) <= Math.min(Limit.int_due_days2, Limit.int_due_days1)) {
                        tr.find("td[data-field='int_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.min(Limit.int_due_days2, Limit.int_due_days1) == Limit.int_due_days2 ? Limit.int_due_color2 : Limit.int_due_color1));
                    }
                    else if ($.DateDiff(int_due_date, $.curDateTime(false)) <= Math.max(Limit.int_due_days2, Limit.int_due_days1)) {
                        tr.find("td[data-field='int_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.max(Limit.int_due_days2, Limit.int_due_days1) == Limit.int_due_days1 ? Limit.int_due_color1 : Limit.int_due_color2))
                    }

                }
                if (cus_due_date != '') {
                    if ($.DateDiff(cus_due_date, $.curDateTime(false)) <= Math.min(Limit.cus_due_days2, Limit.cus_due_days1)) {
                        tr.find("td[data-field='cus_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.min(Limit.cus_due_days2, Limit.cus_due_days1) == Limit.cus_due_days2 ? Limit.cus_due_color2 : Limit.cus_due_color1));
                    }
                    else if ($.DateDiff(cus_due_date, $.curDateTime(false)) <= Math.max(Limit.cus_due_days1, Limit.cus_due_days2)) {
                        tr.find("td[data-field='cus_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.max(Limit.cus_due_days1, Limit.cus_due_days2) == Limit.cus_due_days1 ? Limit.cus_due_color1 : Limit.cus_due_color2));
                    }

                }

                if (legal_due_date != '') {
                    if ($.DateDiff(legal_due_date, $.curDateTime(false)) <= Math.min(Limit.legal_due_days2, Limit.legal_due_days1)) {
                        tr.find("td[data-field='legal_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.min(Limit.legal_due_days2, Limit.legal_due_days1) ? Limit.legal_due_color2 : Limit.legal_due_color1));
                    }
                    else if ($.DateDiff(legal_due_date, $.curDateTime(false)) <= Math.max(Limit.legal_due_days1, Limit.legal_due_days2)) {
                        tr.find("td[data-field='legal_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.max(Limit.legal_due_days1, Limit.legal_due_days2) ? Limit.legal_due_color1 : Limit.legal_due_color2));
                    }
                }

            }
            if (Limit.is_complete_show_img) {
                if (_type == "all" || _type == "priority") {
                    $("#" + _type).find(".layui-table-main").find(".Trade_img").parent().css("height", "120px");
                    $("#" + _type).find(".layui-table-fixed").find(".layui-table-body").css("display", "none");
                }
            }
        }


    });

    //Limit.ClickTrChangeColor();
    Limit.SearchClick();
}

LimitFlowClick = function (case_id, case_volume, case_name, case_type_id) {
    if (!$.trim(case_volume)) {
        case_volume = '无';
    }
    return "<a  href='javascript:void(0);' onclick=\"Limit.OpenCase('" + case_id + "','" + case_volume + "','" + case_name + "','" + case_type_id + "');\" >" + case_volume + "</a>";
}

Limit.OpenCase = function (objid, case_volume, case_name, case_type_id) {
    if (objid.indexOf("AP") != -1) {
        var index = objid.lastIndexOf("_");
        objid = objid.substring(0, index);
        //提案
        var url = "Forms/Patent/" + ApplyCaseType[case_type_id] + "?objid=" + objid + "&isOutCase=0";
        top.window.AddBusinessTab('f_' + objid, case_name, url);
    } else {
        var url = "Forms/Patent/" + CaseTypeURL[case_type_id]["ICURL"] + "?objid=" + objid + '&Type=IC&caseType_id=' + case_type_id;
        top.window.AddBusinessTab('IC' + objid, GetResource('S140822114641256', '案件') + "-" + case_volume, url);
    }
}
var ApplyCaseType = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': 'ApplyPatent.aspx', 'ABD40742-04F9-455F-BC41-080E9D896F80': 'ApplyCopyRight.aspx'
    , '0E8A4B7F-E407-4EFF-9562-3809BF484207': 'ApplyTradeMark.aspx'
}
var CaseTypeURL = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': GetResource('S140830213111063', '专利'), 'code': 'P', 'ICURL': 'CaseManage.aspx', 'IPURL': "CaseInfo.aspx", "PROCURL": "CaseProcInfo.aspx" },
    'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': GetResource('S140830213213510', '版权'), 'code': 'C', 'ICURL': 'CopyRightManage.aspx', 'IPURL': "CopyRightInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': GetResource('S140830213251949', '商标'), 'code': 'T', 'ICURL': 'TradeMarkManage.aspx', 'IPURL': "TradeMarkInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': GetResource('S140822171042104', '其他'), 'code': 'O', 'ICURL': 'CaseOther.aspx', 'IPURL': "CaseOther.aspx" },
    '882D9F78-7656-468E-BE98-68FE5E334A9B': { 'lid': 'S170314103618093', 'Default': GetResource('S170314103618093', '科技服务'), 'code': 'S', 'ICURL': 'TechServiceManage.aspx', 'IPURL': "TechServiceManage.aspx", "PROCURL": "IhgTechServiceProc.aspx" },
    '7A74BEB6-13DE-444B-892F-6E339D4067A2': { 'lid': 'S180120160453969', 'Default': GetResource('S180120160453969', '法律案件'), 'code': 'F', 'ICURL': 'LawCaseManage.aspx', 'IPURL': 'LawCaseInfo.aspx' },
    '849F2D30-DDAA-4718-AD1E-1951DE67913D': { 'lid': 'S170725104526779', 'Default': GetResource('S170725104526779', '调查案'), 'code': 'R', 'ICURL': 'TortCaseManage.aspx', 'IPURL': "TortCaseInfo.aspx", 'INURL': 'CaseInfo.aspx' },
}
//2020-07-02 added by chervy
var LimitFlowTypes = {
    "RQ": "请款流程", "BI": "收款流程", "BO": "销账流程", "CL": "认领流程",
    "PM": "付款流程", "EX": "快递流程", "RB": "涉外账单流程"
};

//商标期限监控
Limit.TrademarkSearch = function () {
    var _data = {};
    _data.Call = 'GetLimitTrademarkList';
    _data.Trademark_customer_id = $("#Trademark_customer_id").val();
    _data.Trademark_country_id = $("#Trademark_country_id").attr("objid");
    _data.Trademark_customer_code = $("#Trademark_customer_code").val();
    _data.Trademark_branch_dept_id = $("#Trademark_branch_dept_id").attr("objid");
    _data.Trademark_case_volume = $("#Trademark_case_volume").val();
    _data.Trademark_is_fuzzy_query_case_volume = $("#Trademark_is_fuzzy_query_case_volume")[0].checked ? true : false;
    _data.Trademark_is_fuzzy_query_app_no = $("#is_fuzzy_query_Trademark_app_no")[0].checked ? true : false;
    _data.Trademark_applicant = $("#Trademark_applicant").val();
    _data.Trademark_case_volume_customer = $("#Trademark_case_volume_customer").val();
    _data.Trademark_app_no = $("#Trademark_app_no").val();
    _data.Trademark_app_date_from = $("#Trademark_app_date_from").val();
    _data.Trademark_app_date_to = $("#Trademark_app_date_to").val();
    _data.Trademark_expire_date_from = $("#Trademark_expire_date_from").val();
    _data.Trademark_expire_date_end = $("#Trademark_expire_date_end").val();
    _data.Trademark_authorize_date_start = $("#Trademark_authorize_date_start").val();
    _data.Trademark_authorize_date_end = $("#Trademark_authorize_date_end").val();
    _data.charge_date_from = $("#charge_date_from3").val();
    _data.charge_date_end = $("#charge_date_end3").val();
    _data.Trademark_app_date_isnull = ($("#Trademark_app_date_isnull")[0].checked ? "on" : "");
    _data.Trademark_proc_pic_user = $("#Trademark_proc_pic_user").attr("objid");
    _data.Trademark_revise_user = $("#Trademark_revise_user").attr("objid");
    _data.Trademark_customer_status = $("#Trademark_customer_status").val();
    _data.Trademark_sales = $("#Trademark_sales").attr("objid");
    _data.Trademark_sales_help = $("#Trademark_sales_help").attr("objid");
    _data.Trademark_flow_user_id = $("#Trademark_p_case_info_flow_user_id").attr("objid");
    _data.Trademark_agency_id = $("#Trademark_agency_id").attr("objid")
    _data.customer_country = $("#Trademark_customer_country").attr("objid");
    _data.proc_status = $("#Trademark_proc_status").attr("objid");
    _data.Trademark_business_type = $("#Trademark_business_type").attr("objid");
    _data.column1 = $("#Trademark_column1").val();
    _data.column2 = $("#Trademark_column2").val();
    _data.column3 = $("#Trademark_column3").val();
    _data.column4 = $("#Trademark_column4").val();
    _data.column5 = $("#Trademark_column5").val();

    /*sheet = JClient.Object.CaseList_trademark;
    sheet = sheet ? sheet : (new JClient.UI.Sheet("CaseList_trademark"));
    sheet.Search(_data);

    sheet.LoadDataFinished = function (_Meta) {
        var $_row = $("#table_CaseList_trademark").find('>tbody>tr');

        $_row.each(function () {
            var $tr = $(this);
            var td = $tr.find(">td[colname=case_name]");
            td.attr("title", $.NoSpace(td.text()));
            var td2 = $tr.find(">td[colname=customer_name]");
            td2.attr("title", $.NoSpace(td2.text()));
            var legal_due_date = $tr.find(">td[colname=legal_due_date]").text();
            var cus_due_date = $tr.find(">td[colname=cus_due_date]").text();
            var int_due_date = $tr.find(">td[colname=int_due_date]").text();

            if (int_due_date != '') {
                if ($.DateDiff(int_due_date, $.curDateTime(false)) <= Math.min(Limit.int_due_days2, Limit.int_due_days1)) {
                    $tr.children('td[colname="int_due_date"]').attr("style", "font-weight:bold;color:" + (Math.min(Limit.int_due_days2, Limit.int_due_days1) == Limit.int_due_days2 ? Limit.int_due_color2 : Limit.int_due_color1));
                }
                else if ($.DateDiff(int_due_date, $.curDateTime(false)) <= Math.max(Limit.int_due_days2, Limit.int_due_days1)) {
                    $tr.children('td[colname="int_due_date"]').attr("style", "font-weight:bold;color:" + (Math.max(Limit.int_due_days2, Limit.int_due_days1) == Limit.int_due_days1 ? Limit.int_due_color1 : Limit.int_due_color2))
                }

            }
            if (cus_due_date != '') {
                if ($.DateDiff(cus_due_date, $.curDateTime(false)) <= Math.min(Limit.cus_due_days2, Limit.cus_due_days1)) {
                    $tr.children('td[colname="cus_due_date"]').attr("style", "font-weight:bold;color:" + (Math.min(Limit.cus_due_days2, Limit.cus_due_days1) == Limit.cus_due_days2 ? Limit.cus_due_color2 : Limit.cus_due_color1));
                }
                else if ($.DateDiff(cus_due_date, $.curDateTime(false)) <= Math.max(Limit.cus_due_days1, Limit.cus_due_days2)) {
                    $tr.children('td[colname="cus_due_date"]').attr("style", "font-weight:bold;color:" + (Math.max(Limit.cus_due_days1, Limit.cus_due_days2) == Limit.cus_due_days1 ? Limit.cus_due_color1 : Limit.cus_due_color2));
                }

            }

            if (legal_due_date != '') {
                if ($.DateDiff(legal_due_date, $.curDateTime(false)) <= Math.min(Limit.legal_due_days2, Limit.legal_due_days1)) {
                    $tr.children('td[colname="legal_due_date"]').attr("style", "font-weight:bold;color:" + (Math.min(Limit.legal_due_days2, Limit.legal_due_days1) ? Limit.legal_due_color2 : Limit.legal_due_color1));
                }
                else if ($.DateDiff(legal_due_date, $.curDateTime(false)) <= Math.max(Limit.legal_due_days1, Limit.legal_due_days2)) {
                    $tr.children('td[colname="legal_due_date"]').attr("style", "font-weight:bold;color:" + (Math.max(Limit.legal_due_days1, Limit.legal_due_days2) ? Limit.legal_due_color1 : Limit.legal_due_color2));
                }
            }


        });

    }*/

    LimitMonitorList.CaseCols = [[
        { type: 'numbers', fixed: 'left' },
        { type: 'checkbox' },
        {
            field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                    + "<a title='编辑' class='tbedit' onclick='Limit.OpenCaseProc(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
            }
        },
        {
            field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
            }
        },
        { field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100 },
        { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
        { field: 'pic', title: GetResource('S140823161417467', '处理人'), sort: true, minWidth: 100 },
        { field: 'review_stage', title: GetResource('S150203143844255', '案件阶段'), sort: true, minWidth: 100 },
        { field: 'doc_date', title: GetResource('S150806213511698', '官方发文日'), sort: true, minWidth: 100 },
        { field: 'int_due_date', title: GetResource('S140823161428652', '内部期限'), sort: true, minWidth: 100 },
        { field: 'cus_due_date', title: GetResource('S140821164259916', '客户期限'), sort: true, minWidth: 100 },
        { field: 'legal_due_date', title: GetResource('S140929103018129', '官方期限'), sort: true, minWidth: 100 },
        { field: 'distance_legal_due_date', title: GetResource('S180625171054190', '距官方期限天数'), sort: true, minWidth: 120, hide: true },
        { field: 'distance_cus_due_date', title: GetResource('S180625171110600', '距客户期限天数'), sort: true, minWidth: 120, hide: true },
        { field: 'distance_int_due_date', title: GetResource('S180625171054190', '距内部期限天数'), sort: true, minWidth: 120, hide: true },
        { field: 'legal_due_date_countdown', title: GetResource('S230317134630981', '官方期限倒计时'), sort: true, minWidth: 120, hide: true },
        { field: 'cus_due_date_countdown', title: GetResource('S230317134614682', '客户期限倒计时'), sort: true, minWidth: 120, hide: true },
        { field: 'int_due_date_countdown', title: GetResource('S230317134623793', '内部期限倒计时'), sort: true, minWidth: 120, hide: true },
        { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
        { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100, hide: true },
        { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100, hide: true },
        { field: 'case_volume_customer', title: GetResource('S140901115322880', '客户文号'), sort: true, minWidth: 100, hide: true },
        { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100, hide: true },
        { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), style: 'text-align:left', sort: true, minWidth: 110, hide: true },
        { field: 'proc_status', title: GetResource('S160116143456059', '处理事项状态'), sort: true, minWidth: 100, hide: true },
        { field: 'case_status', title: GetResource('S140822171057018', '案件状态'), sort: true, minWidth: 100, hide: true },
        { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 100 },
        { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 100 },
        { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
        { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 100, hide: true },
        { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
        { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
        { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
        { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 100, hide: true },
        { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 100, hide: true },
        { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
        { field: 'issue_no', title: GetResource('S141009101941489', '注册号'), sort: true, minWidth: 80, hide: true },
        { field: 'register_type_code', title: GetResource('S160308101917419', '商标类别'), sort: true, minWidth: 100, hide: true },
        { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
        { field: 'img_url', title: GetResource('S190118110903654', '商标图样'), sort: true, minWidth: 120, templet: function (d)
        { return Limit.loadImg(d) }, hide: true
        },
        { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
        { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
        { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
        { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
        { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true }


    ]];


   
    Ajax.LoadLayuiTable(LimitMonitorList, "CaseList_trademark", 'Report.ashx', LimitMonitorList.CaseCols, _data, function (data) {
        $("div.layui-form-checkbox").css("margin-top", "5px");//使复选框居中
        var length = 0;
        if (data.TableRows) {
            length = data.TableRows.length;
            for (var i = 0; i < length; i++) {
                var row = data.TableRows[i];
                var int_due_date = row.int_due_date;
                var cus_due_date = row.cus_due_date;
                var legal_due_date = row.legal_due_date;
                var tr = $("#CaseList_trademark").next().find(".layui-table-main tr[data-index=" + i + "]");
                var case_name_td = tr.find("td[data-field='case_name']");
                var customer_name_td = tr.find("td[data-field='customer_name']");
                case_name_td.attr("title", $.NoSpace(case_name_td.text()));
                customer_name_td.attr("title", $.NoSpace(customer_name_td.text()));
                tr.attr("id", row.proc_id);
                tr.attr("onclick", "Limit.ClickTrChangeColor('CaseList_trademark',this)");
                if (int_due_date != '') {
                    if ($.DateDiff(int_due_date, $.curDateTime(false)) <= Math.min(Limit.int_due_days2, Limit.int_due_days1)) {
                        tr.find("td[data-field='int_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.min(Limit.int_due_days2, Limit.int_due_days1) == Limit.int_due_days2 ? Limit.int_due_color2 : Limit.int_due_color1));
                    }
                    else if ($.DateDiff(int_due_date, $.curDateTime(false)) <= Math.max(Limit.int_due_days2, Limit.int_due_days1)) {
                        tr.find("td[data-field='int_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.max(Limit.int_due_days2, Limit.int_due_days1) == Limit.int_due_days1 ? Limit.int_due_color1 : Limit.int_due_color2))
                    }

                }
                if (cus_due_date != '') {
                    if ($.DateDiff(cus_due_date, $.curDateTime(false)) <= Math.min(Limit.cus_due_days2, Limit.cus_due_days1)) {
                        tr.find("td[data-field='cus_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.min(Limit.cus_due_days2, Limit.cus_due_days1) == Limit.cus_due_days2 ? Limit.cus_due_color2 : Limit.cus_due_color1));
                    }
                    else if ($.DateDiff(cus_due_date, $.curDateTime(false)) <= Math.max(Limit.cus_due_days1, Limit.cus_due_days2)) {
                        tr.find("td[data-field='cus_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.max(Limit.cus_due_days1, Limit.cus_due_days2) == Limit.cus_due_days1 ? Limit.cus_due_color1 : Limit.cus_due_color2));
                    }

                }

                if (legal_due_date != '') {
                    if ($.DateDiff(legal_due_date, $.curDateTime(false)) <= Math.min(Limit.legal_due_days2, Limit.legal_due_days1)) {
                        tr.find("td[data-field='legal_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.min(Limit.legal_due_days2, Limit.legal_due_days1) ? Limit.legal_due_color2 : Limit.legal_due_color1));
                    }
                    else if ($.DateDiff(legal_due_date, $.curDateTime(false)) <= Math.max(Limit.legal_due_days1, Limit.legal_due_days2)) {
                        tr.find("td[data-field='legal_due_date']").attr("style", "font-weight:bold;color:#ffffff;background-color:" + (Math.max(Limit.legal_due_days1, Limit.legal_due_days2) ? Limit.legal_due_color1 : Limit.legal_due_color2));
                    }
                }

                if (Limit.is_complete_show_img) {
                    $("#trademark").find(".layui-table-main").find(".Trade_img").parent().css("height", "120px");
                    $("#trademark").find(".layui-table-fixed").find(".layui-table-body").css("display", "none");
                }
            }
        }

    });

    //Limit.ClickTrChangeColor();
}
//商标期限监控导出
Limit.TrademarkExport = function () {
    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.belong_key = "LimitMonitor";
    ajax_config.height = 420;
    ajax_config.width = 850;
    ajax_config.handler = "Report.ashx";
    ajax_config.Call = "GetExportTrademarkList";
    var param = {};
    param.Trademark_customer_id = $("#Trademark_customer_id").val();
    param.Trademark_country_id = $("#Trademark_country_id").attr("objid");
    param.Trademark_customer_code = $("#Trademark_customer_code").val();
    param.Trademark_branch_dept_id = $("#Trademark_branch_dept_id").attr("objid");
    param.Trademark_case_volume = $("#Trademark_case_volume").val();
    param.Trademark_is_fuzzy_query_case_volume = $("#Trademark_is_fuzzy_query_case_volume")[0].checked ? true : false;
    param.Trademark_is_fuzzy_query_app_no = $("#is_fuzzy_query_Trademark_app_no")[0].checked ? true : false;
    param.Trademark_applicant = $("#Trademark_applicant").val();
    param.Trademark_case_volume_customer = $("#Trademark_case_volume_customer").val();
    param.Trademark_app_no = $("#Trademark_app_no").val();
    param.Trademark_app_date_from = $("#Trademark_app_date_from").val();
    param.Trademark_app_date_to = $("#Trademark_app_date_to").val();
    param.Trademark_app_date_isnull = ($("#Trademark_app_date_isnull")[0].checked ? "on" : "");
    param.Trademark_proc_pic_user = $("#Trademark_proc_pic_user").attr("objid");
    param.Trademark_revise_user = $("#Trademark_revise_user").attr("objid");
    param.Trademark_customer_status = $("#Trademark_customer_status").val();
    param.Trademark_sales = $("#Trademark_sales").attr("objid");
    param.Trademark_sales_help = $("#Trademark_sales_help").attr("objid");
    param.Trademark_flow_user_id = $("#Trademark_p_case_info_flow_user_id").attr("objid");
    param.Trademark_agency_id = $("Trademark_agency_id").attr("objid");
    param.customer_country = $("#Trademark_customer_country").attr("objid");
    param.proc_status = $("#Trademark_proc_status").attr("objid");
    param.Trademark_business_type = $("#Trademark_business_type").attr("objid");
    param.Trademark_expire_date_from = $("#Trademark_expire_date_from").val();
    param.Trademark_expire_date_end = $("#Trademark_expire_date_end").val();
    param.Trademark_authorize_date_start = $("#Trademark_authorize_date_start").val();
    param.Trademark_authorize_date_end = $("#Trademark_authorize_date_end").val();
    param.column1 = $("#Trademark_column1").val();
    param.column2 = $("#Trademark_column2").val();
    param.column3 = $("#Trademark_column3").val();
    param.column4 = $("#Trademark_column4").val();
    param.column5 = $("#Trademark_column5").val();

    var order_by = "";
    $("#CaseList_trademark").next().find(".layui-table-header").find("th").each(function () {
        var sort = $(this).find("span[class='layui-table-sort layui-inline']").attr("lay-sort");
        var column = $(this).attr("data-sort");
        if (column == 'cus_due_date') {
            column = 'pi.cus_due_date';
        } else if (column == 'back_date') {
            column = 'pi.back_date';
        } else if (column == 'proc_note') {
            column = 'pi.proc_note';
        }
        if (sort) {
            order_by = column + "  " + sort;
        }
    });

    param.order_by = order_by;

    var obj_columns = [];
    var columns1 = [];//案件信息
    var columns2 = [];//著录项目
    var columns3 = [];//处理事项
    var columns4 = [];//文件信息

    columns1.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    columns1.push({ value: "case_volume_customer", text: GetResource('S140901115322880', '客户文号') });
    columns1.push({ value: "case_name", text: GetResource('S140814204116996', '案件名称') });
    columns1.push({ value: "case_status", text: GetResource('S140822171057018', '案件状态') });
    columns1.push({ value: "flow_direction", text: GetResource('S140901115438618', '案件流向') });
    columns1.push({ value: "review_stage", text: GetResource('S150203143844255', '案件阶段') });
    columns1.push({ value: "customer_name", text: GetResource('S140821182822919', '客户名称') });
    columns1.push({ value: "apply_type", text: GetResource('S140821164234972', '申请类型') });
    columns1.push({ value: "business_type", text: GetResource('S140901115419492', '业务类型') });
    columns1.push({ value: "sales", text: GetResource('S140821194410109', '业务人员') });
    columns1.push({ value: "cn_help_name", text: GetResource('S180919151921374', '案件当前业务助理') });
    columns1.push({ value: "first_doc_date", text: GetResource('S140823161500382', '初稿日') });
    columns1.push({ value: "finish_doc_date", text: GetResource('S140823161540771', '定稿日') });
    columns1.push({ value: "back_date", text: GetResource('S150808153434141', '返稿日') });
    columns1.push({ value: "officefee_amount", text: GetResource('S180528105128324', '官费总计') });
    columns1.push({ value: "allocate_date", text: GetResource('S150411143920931', '配案日期'), is_default: false });

    columns1.push({ value: "foreign_pic", text: GetResource('S170715174324145', '案件对外处理人'), is_default: false });
    // columns1.push({ value: "yearfeeamount", text: GetResource('S170109151538385', '年费金额') });

    columns1.push({ value: "app_no", text: GetResource('S140822170832920', '申请号') });
    columns1.push({ value: "app_date", text: GetResource('S140822170743359', '申请日') });
    columns1.push({ value: "issue_no", text: GetResource('S141009101941489', '注册号') });
    columns1.push({ value: "authorize_date", text: (filterPubBool(['tradeInfo', 'showRegDate']) ? GetResource('S141009102019085', '注册日') : GetResource('S140930154518982', '获批日')) });
    columns1.push({ value: "expire_date", text: GetResource('S141009102119489', '终止日') });
    columns1.push({ value: "register_type_code", text: GetResource('S160308101917419', '商标类别') });
    columns1.push({ value: "dept_name", text: GetResource('S170419160623634', '所属分部') });

    columns1.push({ value: "introducer", text: GetResource('S180421100702035', '外部案源人') });
    columns1.push({ value: "country", text: GetResource('S141110202500269', '申请国家(地区)') });
    columns1.push({ value: "dept_full_name1", text: GetResource('S170715174321473', '业务人员部门'), is_default: false });
    columns1.push({ value: "contact_one", text: GetResource('S170515165852633', '第一客户联系人') });
    columns1.push({ value: "customer_no", text: GetResource('S141009095540608', '客户编号') });
    columns1.push({ value: "customer_status", text: GetResource('S160318091131220', '客户状态') });
    columns1.push({ value: "customer_code", text: GetResource('S140825201856133', '客户代码') });
    if (Limit.fieldColumn) {
        for (var i = 0; i < Limit.fieldColumn.length; i++) {
            columns1.push({ value: Limit.fieldColumn[i].column_id, text: Limit.fieldColumn[i].column_name, is_default: false });
        }
    }
    
    if (GetPublishConfig("CustomerInfo", "export_info")) {
        if (PageAuth.indexOf("Ec") > -1) {
            columns1.push({ value: "contact_one_mobile", text: GetResource('S170515165900778', '第一客户联系人电话') });
            columns1.push({ value: 'customer_mail', text: GetResource('S200506151824686', '客户邮箱') });
        }
    } else {
        columns1.push({ value: "contact_one_mobile", text: GetResource('S170515165900778', '第一客户联系人电话') });
        columns1.push({ value: 'customer_mail', text: GetResource('S200506151824686', '客户邮箱') });
    }


    columns2.push({ value: "applicant_name", text: GetResource('S140814212259786', '申请人') });


    //派特恩定制
    if (Limit.PaiTeEn) {
        columns2.push({ value: "applicant_name_en", text: GetResource('S241114205447085', '申请人英文') });
    }

    columns2.push({ value: "agency", text: GetResource('S141106084922906', '代理机构') });

    columns3.push({ value: "ctrl_proc", text: GetResource('S140821164247623', '处理事项') });
    columns3.push({ value: "pic", text: GetResource('S170107163446740', '处理事项处理人') });
    columns3.push({ value: "smallduc_date", text: GetResource('S180417221952195', '最早期限') });
    columns3.push({ value: "int_due_date", text: GetResource('S140823161428652', '内部期限') });
    columns3.push({ value: "legal_due_date", text: GetResource('S140929103018129', '官方期限') });
    columns3.push({ value: "cus_due_date", text: GetResource('S140821164259916', '客户期限') });
    columns3.push({ value: "proc_note", text: GetResource('S141015142024952', '处理事项备注') });
    columns3.push({ value: "proc_status", text: GetResource('S160116143456059', '处理事项状态') });
    columns3.push({ value: "proc_foreign_pic", text: GetResource('S170920123426822', '处理事项对外处理人'), is_default: false });
    columns3.push({ value: "cp_create_time", text: GetResource('S150311194419937', '处理事项创建日期'), is_default: false });
    columns3.push({ value: "next_ctrl_proc", text: GetResource('S180417192250471', '下一处理事项'), is_default: false });
    columns3.push({ value: "next_int_due_date", text: GetResource('S180417192231080', '下一处理事项内部期限'), is_default: false });
    columns3.push({ value: "next_cus_due_date", text: GetResource('S180417192216413', '下一处理事项客户期限'), is_default: false });
    columns3.push({ value: "next_legal_due_date", text: GetResource('S180417192200127', '下一处理事项官方期限'), is_default: false });
    columns3.push({ value: "proc_revise_user", text: GetResource('S170715174331171', '处理事项核稿人'), is_default: false });
    columns3.push({ value: "back_date", text: GetResource('S150808153434141', '返稿日(IPR)'), is_default: false });
    columns3.push({ value: "back_inventor_date", text: GetResource('S181219100902484', '返发明人日'), is_default: false });

    columns4.push({ value: "doc_date", text: GetResource('S150806213511698', '官方发文日') });
    columns4.push({ value: "receipt_date", text: GetResource('S160113154334081', '收文日期') });


    obj_columns.push({ group: GetResource('S140923212003271', '案件信息'), data: columns1 });
    obj_columns.push({ group: GetResource('S140903220206444', '著录项目'), data: columns2 });
    obj_columns.push({ group: GetResource('S140821164247623', '处理事项'), data: columns3 });
    obj_columns.push({ group: GetResource('S170725175623129', '文件信息'), data: columns4 });

    Export(ajax_config, param, obj_columns);
}

//年费异常案件
Limit.ErrorFeeSeach = function () {
    var _data = {};
    _data.Call = 'GetLimitErrorFeeList';
    _data.country = $("#country_errorfee").attr("objid");
    _data.case_volume = $("#case_volume_errorfee").val();
    _data.is_fuzzy_query_case_volume = $("#is_fuzzy_query_case_volume_errorfee")[0].checked ? true : false;
    _data.is_fuzzy_query_app_no = $("#is_fuzzy_query_app_no_errorfee")[0].checked ? true : false;
    _data.is_point_app_no_errorfee = $("#is_point_app_no_errorfee")[0].checked ? true : false;
    _data.applicant = $("#applicant_errorfee").val();
    _data.app_no = $("#app_no_errorfee").val();
    _data.charge_date_from = $("#charge_date_from4").val();
    _data.charge_date_end = $("#charge_date_end4").val();
    _data.sales = $("#sales_errorfee").attr("objid");
    _data.is_feemonitor = $("#is_feemonitor").val();
    _data.errfee_month_day_from = $("#errfee_month_day_from").val();
    _data.errfee_month_day_to = $("#errfee_month_day_to").val();
    _data.errfee_agency_id = $("#errfee_agency_id").attr("objid");
    _data.customer_country = $("#errfee_customer_country").attr("objid");
    _data.error_business_type = $("#error_business_type").attr("objid");
    _data.apply_tags_id = $("#apply_tags_id_Errorfee").attr("objid");
    _data.column1 = $("#errfee_column1").val();
    _data.column2 = $("#errfee_column2").val();
    _data.column3 = $("#errfee_column3").val();
    _data.column4 = $("#errfee_column4").val();
    _data.column5 = $("#errfee_column5").val();
    
    LimitMonitorList.CaseCols = [[
        { type: 'numbers', fixed: 'left' },
        {
            field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
            }
        },
        {
            field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100
              
        },
        { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
        { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 100 },
        { field: 'case_sales_name', title: GetResource('S151120094028472', '案件业务员'), sort: true, minWidth: 100 },
        { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100 },
        { field: 'app_date', title: GetResource('S140822170743359', '申请日'), sort: true, minWidth: 100 },
        { field: 'applicant_name', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left' },
        { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
        { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
        { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
        { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
        { field: 'column_1', title: Limit.GetFieldColName("column_1"), sort: true, minWidth: 110, hide: true },
        { field: 'column_2', title: Limit.GetFieldColName("column_2"), sort: true, minWidth: 110, hide: true },
        { field: 'column_3', title: Limit.GetFieldColName("column_3"), sort: true, minWidth: 110, hide: true },
        { field: 'column_4', title: Limit.GetFieldColName("column_4"), sort: true, minWidth: 110, hide: true },
        { field: 'column_5', title: Limit.GetFieldColName("column_5"), sort: true, minWidth: 110, hide: true }
    ]];

    for (var i = 1; i < LimitMonitorList.CaseCols[0].length; i++) {
        if ((LimitMonitorList.CaseCols[0][i].title).indexOf('自定义栏位') > -1) {
            for (var j = 0; j < Limit.fieldColumn.length; j++) {
                if (Limit.fieldColumn[j].column_id == LimitMonitorList.CaseCols[0][i].field) {
                    LimitMonitorList.CaseCols[0][i].title = Limit.fieldColumn[j].column_name;
                }
            }
        }
    }
  
    Ajax.LoadLayuiTable(LimitMonitorList, "CaseList_errorfee", 'Report.ashx', LimitMonitorList.CaseCols, _data);

}
Limit.ErrorFeeExport = function () {
    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.belong_key = "LimitMonitor";
    ajax_config.height = 250;
    ajax_config.width = 850;
    ajax_config.handler = "Report.ashx";
    ajax_config.Call = "GetLimitErrorFeeListExprot";
    var param = {};
    param.country = $("#country_errorfee").attr("objid");
    param.case_volume = $("#case_volume_errorfee").val();
    param.is_fuzzy_query_case_volume = $("#is_fuzzy_query_case_volume_errorfee")[0].checked ? true : false;
    param.is_fuzzy_query_app_no = $("#is_fuzzy_query_app_no_errorfee")[0].checked ? true : false;
    param.is_point_app_no_errorfee = $("#is_point_app_no_errorfee")[0].checked ? true : false;
    param.applicant = $("#applicant_errorfee").val();
    param.app_no = $("#app_no_errorfee").val();
    param.sales = $("#sales_errorfee").attr("objid");
    param.is_feemonitor = $("#is_feemonitor").val();

    param.errfee_month_day_from = $("#errfee_month_day_from").val();
    param.errfee_month_day_to = $("#errfee_month_day_to").val();
    param.errfee_agency_id = $("#errfee_agency_id").attr("objid");
    param.customer_country = $("#errfee_customer_country").attr("objid");
    param.error_business_type = $("#error_business_type").attr("objid");
    param.apply_tags_id = $("#apply_tags_id_Errorfee").attr("objid");
    param.column1 = $("#errfee_column1").val();
    param.column2 = $("#errfee_column2").val();
    param.column3 = $("#errfee_column3").val();
    param.column4 = $("#errfee_column4").val();
    param.column5 = $("#errfee_column5").val();

    var obj_columns = [];
    var columns1 = [];//案件信息

    columns1.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    columns1.push({ value: "customer_name", text: GetResource('S140821182822919', '客户名称') });
    columns1.push({ value: "customer_no", text: GetResource('S141009095540608', '客户编号') });
    columns1.push({ value: "case_name", text: GetResource('S140814204116996', '案件名称') });
    columns1.push({ value: "sales", text: GetResource('S151120094028472', '案件业务员') });
    columns1.push({ value: "app_no", text: GetResource('S140822170832920', '申请号') });
    columns1.push({ value: "app_date", text: GetResource('S140822170743359', '申请日') });
    columns1.push({ value: "applicant_name", text: GetResource('S140814212259786', '申请人') });
    columns1.push({ value: 'customer_mail', text: GetResource('S200506151824686', '客户邮箱') });
    columns1.push({ value: "apply_tags", text: GetResource('S160803103154175', '专利标签'), is_default: false });
    columns1.push({ value: "dept_full_name1", text: GetResource('S170715174321473', '业务人员部门'), is_default: false });
    if (Limit.fieldColumn) {
        for (var i = 0; i < Limit.fieldColumn.length; i++) {
            columns1.push({ value: Limit.fieldColumn[i].column_id, text: Limit.fieldColumn[i].column_name, is_default: false });
        }
    }

    obj_columns.push({ group: GetResource('S140923212003271', '案件信息'), data: columns1 });

    Export(ajax_config, param, obj_columns);
}


Limit.SetFeeColor = function (rows) {
    if (!Limit.TermConfig.Fee) {
        return;
    }
    if (!rows || rows.length == 0) {
        return;
    }
    var now = $.curDateTime();
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        for (var j = 0; j < Limit.TermConfig.Proc.length; j++) {
            var con = Limit.TermConfig.Fee[j];
            var column = con.date_column;
            if (row[column]) {
                //设定的期限  - 设定的间隔时间  >  当前时间  
                var due = new Date(row[column]);
                var day_gap = parseInt(con.day_gap);
                if ($.ComparisonDate(now, $.addDate(due, day_gap))) {
                    $("#" + row.fee_id).css({ "background-color": con.color_code, "color": "#ffffff" });
                    break;
                }
            }
        }
    }
}

//导出列表
Limit.ExportCaseList = function () {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    })
    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.belong_key = "LimitMonitor";
    ajax_config.height = 420;
    ajax_config.width = 850;
    ajax_config.handler = "Report.ashx";
    ajax_config.Call = "GetExportCaseList";
    var param = {};
    param.select_and = $("#select_and")[0].checked ? "true" : "false";
    param.case_type = $("#case_type").val();
    param.country = $("#country").attr("objid");
    param.user_assistant = $("#user_assistant").attr("objid");
    param.case_volume = $("#case_volume_other").val();
    param.case_volume_customer = $("#case_volume_customer_all").val();
    param.is_fuzzy_query_case_volume_other = $("#is_fuzzy_query_case_volume_other")[0].checked ? true : false;
    param.is_fuzzy_query_app_no_other = $("#is_fuzzy_query_app_no_other")[0].checked ? true : false;
    param.is_point_app_no_other = $("#is_point_app_no_other")[0].checked ? true : false;
    param.applicant = $("#applicant_other").val();
    param.app_no = $("#app_no_other").val();

    if (Limit.PaiTeEn) {
        param.int_due_date_s = $("#pt_int_due_date_s").val();
        param.int_due_date_e = $("#pt_int_due_date_e").val();
        param.legal_due_date_s = $("#pt_legal_due_date_s").val();
        param.legal_due_date_e = $("#pt_legal_due_date_e").val();
        param.cus_due_date_s = $("#pt_cus_due_date_s").val();
        param.cus_due_date_e = $("#pt_cus_due_date_e").val();
    } else {
        param.int_due_date_s = $("#int_due_date_s").val();
        param.int_due_date_e = $("#int_due_date_e").val();
        param.legal_due_date_s = $("#legal_due_date_s").val();
        param.legal_due_date_e = $("#legal_due_date_e").val();
        param.cus_due_date_s = $("#cus_due_date_s").val();
        param.cus_due_date_e = $("#cus_due_date_e").val();
    }

    param.int_due_date_isnull = ($("#int_due_date_other_isnull")[0].checked ? "on" : "");
    param.charge_date_from = $("#charge_date_from").val();
    param.charge_date_end = $("#charge_date_end").val();


    param.deli_deadline_isnull = ($("#deli_deadline_isnull")[0].checked ? "on" : "");
    param.deli_deadline_start = $("#deli_deadline_start").val();
    param.deli_deadline_end = $("#deli_deadline_end").val();

    if (GetPublishConfig("KLFD","202504")) {
        param.deli_deadline_start = $("#deli_deadline_start_klfd").val();
        param.deli_deadline_end = $("#deli_deadline_end_klfd").val();
    }

    param.NKG_date = ($("#NKG_date")[0].checked ? "on" : "");
    param.legal_due_date_isnull = ($("#legal_due_date_other_isnull")[0].checked ? "on" : "");
    param.ctrl_proc = $("#ctrl_proc").attr("objid");
    param.customer_name = $("#customer_name").val();
    param.customer_code = $("#customer_codes").val();
    param.introducer = $("#introducer").val();
    param.doc_date_s = $("#doc_date_s").val();
    param.doc_date_e = $("#doc_date_e").val();
    param.doc_date_isnull = ($("#doc_date_other_isnull")[0].checked ? "on" : "");
    param.smallduc_date_from = $("#smallduc_date_from").val();
    param.smallduc_date_to = $("#smallduc_date_to").val();
    param.smallduc_date_isnull = ($("#smallduc_date_isnull")[0].checked ? "on" : "");

    param.cus_due_date_isnull = ($("#cus_due_date_other_isnull")[0].checked ? "on" : "");
    param.type = _type;

    param.PageAuth = PageAuth;

    //param.apply_subject = $("#apply_subject").val();
    param.apply_subject = $("#apply_subject").attr("objid");

    param.flow_direction = $("#flow_direction_other").attr("objid");
    param.proc_pic_user = $("#proc_pic_user_other").attr("objid");
    param.case_pic_user = $("#case_pic_user").attr("objid");
    param.branch_dept = $("#branch_dept_id2").attr("objid");
    param.month_day_from = $("#month_day_from").val();
    param.month_day_to = $("#month_day_to").val();
    param.app_date_from = $("#app_date_from2").val();
    param.app_date_to = $("#app_date_to2").val();
    param.app_date_isnull = ($("#app_date_isnull2")[0].checked ? "on" : "");
    param.customer_status_id = $("#customer_status").attr("objid");
    param.case_status_id = $("#case_status").attr("objid");
    param.dept_id = $("#p_case_info__charge_dept_id").attr("objid");
    param.back_date_start = $("#back_date_start").val();
    param.back_date_end = $("#back_date_end").val();
    param.back_inventor_date_start = $("#back_inventor_date_start").val();
    param.back_inventor_date_end = $("#back_inventor_date_end").val();
    param.revise_user_id = $("#revise_user_id").attr("objid");
    param.proc_type = $("#proc_type").val();
    param.proc_note = $("#proc_note").val();
    param.sales = $("#sales").attr("objid");
    param.sales_help = $("#sales_help").attr("objid");
    param.flow_user_id = $("#p_case_info_flow_user_id").attr("objid");
    param.create_proc_date_start = $("#create_proc_date_start").val();
    param.create_proc_date_end = $("#create_proc_date_end").val();
    param.other_agency_id = $("#other_agency_id").attr("objid");
    param.customer_country = $("#customer_country").attr("objid");
    param.inventor = $("#inventor").val();
    param.proc_status = $("#other_proc_status").attr("objid");
    param.business_type_other = $("#business_type_other").attr("objid");
    param.apply_tags_id = $("#apply_tags_id_other").attr("objid");
    param.is_finishdate = $("#is_finishdate").val();
    param.upload_date_from = $("#upload_date_from").val();
    param.upload_date_end = $("#upload_date_end").val();
    param.pic_dept_id = $("#pic_dept_id").attr("objid");

    param.pat_cus_fullname = $("#pat_cus_fullname").val();
    param.agent_to_reply_start = $("#agent_to_reply_start").val();
    param.reply_to_agent_start = $("#reply_to_agent_start").val();
    param.remind_to_agent_start = $("#remind_to_agent_start").val();
    param.last_deli_deadline_start = $("#last_deli_deadline_start").val();
    param.book_deli_deadline_start = $("#book_deli_deadline_start").val();
    param.reply_cus_date_start = $("#reply_cus_date_start").val();
    param.cus_receipt_start = $("#cus_receipt_start").val();
    param.finish_revise_date_start = $("#finish_revise_date_start").val();
    param.cus_entrust_start = $("#cus_entrust_start").val();
    param.prompt_cus_start = $("#prompt_cus_start").val();
    param.reply_agengcy_start = $("#reply_agengcy_start").val();
    param.agengcy_receipt_start = $("#agengcy_receipt_start").val();
    param.agengcy_revise_start = $("#agengcy_revise_start").val();
    param.prompt_agengcy_start = $("#prompt_agengcy_start").val();
    param.third_party_revise_start = $("#third_party_revise_start").val();
    param.revise_third_party_start = $("#revise_third_party_start").val();
    param.receipt_third_party_start = $("#receipt_third_party_start").val();
    param.agent_to_reply_end = $("#agent_to_reply_end").val();
    param.reply_to_agent_end = $("#reply_to_agent_end").val();
    param.remind_to_agent_end = $("#remind_to_agent_end").val();
    param.last_deli_deadline_end = $("#last_deli_deadline_end").val();
    param.book_deli_deadline_end = $("#book_deli_deadline_end").val();
    param.reply_cus_date_end = $("#reply_cus_date_end").val();
    param.cus_receipt_end = $("#cus_receipt_end").val();
    param.finish_revise_date_end = $("#finish_revise_date_end").val();
    param.cus_entrust_end = $("#cus_entrust_end").val();
    param.prompt_cus_end = $("#prompt_cus_end").val();
    param.reply_agengcy_end = $("#reply_agengcy_end").val();
    param.agengcy_receipt_end = $("#agengcy_receipt_end").val();
    param.agengcy_revise_end = $("#agengcy_revise_end").val();
    param.prompt_agengcy_end = $("#prompt_agengcy_end").val();
    param.third_party_revise_end = $("#third_party_revise_end").val();
    param.revise_third_party_end = $("#revise_third_party_end").val();
    param.receipt_third_party_end = $("#receipt_third_party_end").val();
    param.contact_name = $("#contact_name").val();
    param.column1 = $("#column1").val();
    param.column2 = $("#column2").val();
    param.column3 = $("#column3").val();
    param.column4 = $("#column4").val();
    param.column5 = $("#column5").val();
    var order_by = "";
    $(".layui-table-header").find("th").each(function () {
        var sort = $(this).find("span[class='layui-table-sort layui-inline']").attr("lay-sort");
        var column = $(this).attr("data-sort");
        if (column == 'cus_due_date') {
            column = 'pi.cus_due_date';
        } else if (column == 'back_date') {
            column = 'pi.back_date';
        } else if (column == 'proc_note') {
            column = 'pi.proc_note';
        }
        if (sort) {
            order_by = column + "  " + sort;
        }
    });

    param.order_by = order_by;

    var obj_columns = [];
    var columns1 = [];//案件信息
    var columns2 = [];//著录项目
    var columns3 = [];//处理事项
    var columns4 = [];//文件信息
    var columns5 = [];//扩展信息

    columns1.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    columns1.push({ value: "case_volume_customer", text: GetResource('S140901115322880', '客户文号') });
    columns1.push({ value: "case_name", text: GetResource('S140814204116996', '案件名称') });
    columns1.push({ value: "case_status", text: GetResource('S140822171057018', '案件状态') });
    columns1.push({ value: "flow_direction", text: GetResource('S140901115438618', '案件流向') });
    columns1.push({ value: "review_stage", text: GetResource('S150203143844255', '案件阶段') });
    columns1.push({ value: "customer_name", text: GetResource('S140821182822919', '客户名称') });
    columns1.push({ value: "apply_type", text: GetResource('S140821164234972', '申请类型') });
    columns1.push({ value: "business_type", text: GetResource('S140901115419492', '业务类型') });
    columns1.push({ value: "sales", text: GetResource('S140821194410109', '业务人员') });
    columns1.push({ value: "cn_help_name", text: GetResource('S180919151921374', '案件当前业务助理') });
    columns1.push({ value: "dept_full_name", text: GetResource('S140901140456599', '承办部门') });
    columns1.push({ value: "first_doc_date", text: GetResource('S140823161500382', '初稿日') });
    columns1.push({ value: "finish_doc_date", text: GetResource('S140823161540771', '定稿日') });
    columns1.push({ value: "back_date", text: GetResource('S150808153434141', '返稿日') });
    columns1.push({ value: "officefee_amount", text: GetResource('S180528105128324', '官费总计') });
    columns1.push({ value: "allocate_date", text: GetResource('S150411143920931', '配案日期'), is_default: false });
    columns1.push({ value: "apply_tags", text: GetResource('S160803103154175', '专利标签'), is_default: false });

    if (GetPublishConfig("ZBSD", "is_show_column")) {
        if (top.window._UserModel.RoleCode.indexOf('ZBSDZLKZS') > -1) {
            columns1.push({ value: "user_assistant_name", text: GetResource('S250523201311872', '案件处理人助理') });
        }

    }
    if (Limit.fieldColumn) {
        for (var i = 0; i < Limit.fieldColumn.length; i++) {
            columns1.push({ value: Limit.fieldColumn[i].column_id, text: Limit.fieldColumn[i].column_name, is_default: false });
        }
    }
    if (_type == "pay") {
        columns1.push({ value: "yearfeeamount", text: GetResource('S170109151538385', '年费金额') });
    }
    columns1.push({ value: "app_no", text: GetResource('S140822170832920', '申请号') });
    columns1.push({ value: "app_date", text: GetResource('S140822170743359', '申请日') });
    columns1.push({ value: "issue_no", text: GetResource('S141009101941489', '注册号') });
    columns1.push({ value: "expire_date", text: GetResource('S140822171014773', '届满日') });
    columns1.push({ value: "register_type_code", text: GetResource('S160308101917419', '商标类别') });
    columns1.push({ value: "dept_name", text: GetResource('S170419160623634', '所属分部') });
    columns1.push({ value: "introducer", text: GetResource('S180421100702035', '外部案源人') });
    columns1.push({ value: "country", text: GetResource('S141110202500269', '申请国家(地区)') });
    columns1.push({ value: "foreign_pic_case", text: GetResource('S170715174324145', '案件对外处理人'), is_default: false });
    columns1.push({ value: "dept_full_name1", text: GetResource('S170715174321473', '业务人员部门'), is_default: false });
    columns1.push({ value: "case_pic", text: GetResource('S160411145409233', '案件处理人'), is_default: false });
    columns1.push({ value: "inventor_id", text: GetResource('S140825203153404', '发明人'), is_default: false });
    columns1.push({ value: "issue_no", text: GetResource('S140822171117625', '公告号'), is_default: false });
    columns1.push({ value: "issue_date", text: GetResource('S140822171028423', '公告日'), is_default: false });
    columns1.push({ value: "case_authorize_date", text: GetResource('S161018101046269', '授权日'), is_default: false });
    columns1.push({ value: "flow_user_id", text: GetResource('S141108114215375', '流程人员'), is_default: false });
    columns1.push({ value: "contact_one", text: GetResource('S170515165852633', '第一客户联系人') });
    columns1.push({ value: "customer_no", text: GetResource('S141009095540608', '客户编号') });
    columns1.push({ value: "customer_status", text: GetResource('S160318091131220', '客户状态') });
    columns1.push({ value: "customer_code", text: GetResource('S140825201856133', '客户代码') });
    if (GetPublishConfig("CustomerInfo", "export_info")) {
        if (PageAuth.indexOf("Ec") > -1) {

            columns1.push({ value: "contact_one_mobile", text: GetResource('S170515165900778', '第一客户联系人电话') });
            columns1.push({ value: 'customer_mail', text: GetResource('S200506151824686', '客户邮箱') });

        }
    } else {
        columns1.push({ value: "contact_one_mobile", text: GetResource('S170515165900778', '第一客户联系人电话') });
        columns1.push({ value: 'customer_mail', text: GetResource('S200506151824686', '客户邮箱') });
    }
    //派特恩定制
    if (Limit.PaiTeEn) {
        columns1.push({ value: 'pat_cus_fullname', text: GetResource('S140827094619190', '客户全称'), is_default: false });
    }
    columns1.push({ value: "contact_ipr", text: GetResource('S201009085840139', '客户联系人(IPR)'), is_default: false });
    columns1.push({ value: "create_time", text: GetResource('S150226092116115', '开卷日期'), is_default: false });
    columns2.push({ value: "applicant_name", text: GetResource('S140814212259786', '申请人') });
    columns2.push({ value: "applicant_name_en", text: GetResource('S241114205447085', '申请人英文') });
    columns2.push({ value: "agency", text: GetResource('S141106084922906', '代理机构') });
    columns2.push({ value: "contact_name", text: GetResource('S241226102529353', '全部联系人') });
    if (GetPublishConfig("ProcId", "is_show_choose")) {
        columns3.push({ value: 'proc_id', text: GetResource('S210830152740634', '处理事项ID') });
    }
    columns3.push({ value: "ctrl_proc", text: GetResource('S140821164247623', '处理事项') });
    columns3.push({ value: "pic", text: GetResource('S170107163446740', '处理事项处理人') });
    columns3.push({ value: "smallduc_date", text: GetResource('S180417221952195', '最早期限') });
    columns3.push({ value: "int_due_date", text: GetResource('S140823161428652', '内部期限') });
    columns3.push({ value: "legal_due_date", text: GetResource('S140929103018129', '官方期限') });
    columns3.push({ value: "cus_due_date", text: GetResource('S140821164259916', '客户期限') });
    columns3.push({ value: "proc_note", text: GetResource('S141015142024952', '处理事项备注') });
    columns3.push({ value: "proc_status", text: GetResource('S160116143456059', '处理事项状态') });

    // 派特恩定制
    if (Limit.PaiTeEn) {
        columns3.push({ value: 'agent_to_reply', text: GetResource('S220217174455766', '代理人回复'), is_default: false  });
        columns3.push({ value: 'reply_to_agent', text: GetResource('S220217174455766', '回复代理人'), is_default: false  });
        columns3.push({ value: 'remind_to_agent', text: GetResource('S220217174455766', '提醒代理人'), is_default: false  });
        columns3.push({ value: 'last_deli_deadline', text: GetResource('S220217174455766', '最终绝限日'), is_default: false  });
        columns3.push({ value: 'book_deli_deadline', text: GetResource('S220217174455766', '书面绝限日'), is_default: false });
        columns3.push({ value: 'cus_receipt', text: GetResource('S220217174455766', '客户确收日'), is_default: false });
        columns3.push({ value: 'cus_entrust', text: GetResource('S220217174455766', '客户委托日'), is_default: false  });
        columns3.push({ value: 'prompt_cus', text: GetResource('S220217174455766', '提示客户日'), is_default: false });
        columns3.push({ value: 'agengcy_receipt', text: GetResource('S220217174455766', '外所确收日'), is_default: false });
        columns3.push({ value: 'prompt_agengcy', text: GetResource('S220217174455766', '提示外所日'), is_default: false });
        columns3.push({ value: 'third_party_revise', text: GetResource('S220217174455766', '第三方回复日'), is_default: false  });
        columns3.push({ value: 'revise_third_party', text: GetResource('S220217174455766', '回复第三方日'), is_default: false  });
        columns3.push({ value: 'receipt_third_party', text: GetResource('S220217174455766', '第三方确收日'), is_default: false });
    }
    if (GetPublishConfig('SHEWAI', 'DATE')) {
        columns3.push({ value: 'reply_cus_date', text: Limit.reply_cus_date });
        columns3.push({ value: 'finish_revise_date', text: Limit.finish_revise_date });
        columns3.push({ value: 'reply_agengcy', text: Limit.reply_agengcy });
        columns3.push({ value: 'agengcy_revise', text: Limit.agengcy_revise });
    }
    else {
        columns3.push({ value: 'reply_cus_date', text: GetResource('S220217174455766', '回复客户日') });
        columns3.push({ value: 'finish_revise_date', text: GetResource('S220217174455766', '客户回复日') });
        columns3.push({ value: 'reply_agengcy', text: GetResource('S220217174455766', '回复外所日') });
        columns3.push({ value: 'agengcy_revise', text: GetResource('S220217174455766', '外所回复日') });
    }
    columns3.push({ value: 'case_mail_date', text: GetResource('S140905175829100', '送合作所日') ,is_default: false });
    columns3.push({ value: "cp_create_time", text: GetResource('S150311194419937', '处理事项创建日期'), is_default: false });
    columns3.push({ value: "next_ctrl_proc", text: GetResource('S180417192250471', '下一处理事项'), is_default: false });
    columns3.push({ value: "next_int_due_date", text: GetResource('S180417192231080', '下一处理事项内部期限'), is_default: false });
    columns3.push({ value: "next_cus_due_date", text: GetResource('S180417192216413', '下一处理事项客户期限'), is_default: false });
    columns3.push({ value: "next_legal_due_date", text: GetResource('S180417192200127', '下一处理事项官方期限'), is_default: false });
    columns3.push({ value: "proc_revise_user", text: GetResource('S170715174331171', '处理事项核稿人'), is_default: false });
    columns3.push({ value: "proc_foreign_pic", text: GetResource('S170920123426822', '处理事项对外处理人'), is_default: false });
    columns3.push({ value: "back_date", text: GetResource('S150808153434141', '返稿日(IPR)'), is_default: false });
    columns3.push({ value: "back_inventor_date", text: GetResource('S181219100902484', '返发明人日'), is_default: false });
    if (GetPublishConfig('ZITENT', 'is_show_cloum')) {
        columns3.push({
            value: "deli_deadline", text: GetResource('S221219120246247', GetPublishConfigValueFn('jx_columns', 'jx_date')) });
        columns1.push({ value: 'is_featuring', text: GetResource('S210719113653023', '是否统包') });
    }

    columns4.push({ value: "doc_date", text: GetResource('S150806213511698', '官方发文日') });
    columns4.push({ value: "receipt_date", text: GetResource('S160113154334081', '收文日期') });

    columns5.push({ value: "product_name", text: GetResource('S160709095542937', '产品类别'), is_default: false });
    if (_type == "pay") {
        columns5.push({ value: "trade_img", text: GetResource('S170109151538385', '摘要附图') });
    }
    if (GetPublishConfig('KLFD', '202507') && ($('#div_selectTab .tabbtn li.current').attr('id'))=== 'liall') {
        columns3.push({ value: 'proc_id', text: GetResource('S210830152740634','处理事项ID'), is_default: false })
        columns3.push({ value: 'proc_fd_case_volume', text: GetResource('S240425163338014','事项我方文号'), is_default: false })
        columns3.push({ value: 'proc_fd_app_no', text: GetResource('S240425163125783','事项申请号'), is_default: false })
        columns3.push({ value: 'proc_fd_customer_case_volume', text: GetResource('S240425163345101','事项客户文号'), is_default: false })
    }
    obj_columns.push({ group: GetResource('S140923212003271', '案件信息'), data: columns1 });
    obj_columns.push({ group: GetResource('S140903220206444', '著录项目'), data: columns2 });
    obj_columns.push({ group: GetResource('S140821164247623', '处理事项'), data: columns3 });
    obj_columns.push({ group: GetResource('S170725175623129', '文件信息'), data: columns4 });
    obj_columns.push({ group: GetResource('S140822152557243', '扩展信息'), data: columns5 });

    Export(ajax_config, param, obj_columns);
}


Limit.SearchFee = function () {
    var param = {};
    param.select_and = $("#select_and_1")[0].checked ? "true" : "false";
    param.customer_id = $("#customer_id").attr("objid");
    param.country_id = $("#country_id").attr("objid");
    param.customer_code = $("#customer_code").val();
    param.receive_due_date_from = $("#receive_due_date_from").val();
    param.receive_due_date_to = $("#receive_due_date_to").val();
    param.receive_due_date_isnull = ($("#receive_due_date_isnull")[0].checked ? "on" : "");
    param.pay_due_date_from = $("#pay_due_date_from").val();
    param.pay_due_date_to = $("#pay_due_date_to").val();
    param.pay_due_date_isnull = ($("#pay_due_date_isnull")[0].checked ? "on" : "");
    param.app_date_from = $("#app_date_from").val();
    param.app_date_to = $("#app_date_to").val();
    param.app_date_isnull = ($("#app_date_isnull")[0].checked ? "on" : "");

    param.case_type_id = $("#case_type_id").val();
    param.apply_type_id = $("#apply_type").attr("objid");
    param.case_volume = $("#case_volume").val();
    param.is_fuzzy_query_case_volume = $("#is_fuzzy_query_case_volume")[0].checked ? true : false;
    param.is_fuzzy_query_app_no = $("#is_fuzzy_query_app_no")[0].checked ? true : false;
    param.is_point_app_no = $("#is_point_app_no")[0].checked ? true : false;
    param.applicant = $("#applicant").val();
    param.case_volume_customer = $("#case_volume_customer").val();
    param.app_no = $("#app_no").val();
    param.search_type = $("#search_type").attr("objid");
    param.notice_status = $("#notice_status").val();

    param.doc_date_to = $("#doc_date_to").val();
    param.doc_date_from = $("#doc_date_from").val();
    param.charge_date_end = $("#charge_date_end2").val();
    param.charge_date_from = $("#charge_date_from2").val();
    param.doc_date_isnull = ($("#doc_date_isnull")[0].checked ? "on" : "");
    param.finish_date_to = $("#finish_date_to").val();
    param.finish_date_from = $("#finish_date_from").val();
    param.finish_date_isnull = ($("#finish_date_isnull")[0].checked ? "on" : "");

    param.fee_search_type = $("#fee_search_type").val();
    param.fee_show_type = $("#fee_show_type").val();
    param.pay_type = $("#pay_type").val();
    param.flow_direction = $("#flow_direction").attr("objid");
    param.proc_pic_user = $("#proc_pic_user").attr("objid");
    param.is_contain = $("#is_contain").val();
    param.branch_dept = $("#branch_dept_id").attr("objid");
    param.fee_name = $("#fee_name").attr("objid");
    param.back_date_start = $("#back_date_start1").val();
    param.back_date_end = $("#back_date_end1").val();
    param.back_inventor_date_start = $("#back_inventor_date_start1").val();
    param.back_inventor_date_end = $("#back_inventor_date_end1").val();
    param.revise_user_id = $("#revise_user").attr("objid");
    param.customer_status_id = $("#customer_status_id").attr("objid");
    param.sales = $("#fee_sales").attr("objid");
    param.sales_help = $("#fee_sales_help").attr("objid");
    param.flow_user = $("#fee_p_case_info_flow_user_id").attr("objid");
    param.fee_agency_id = $("#fee_agency_id").attr("objid");
    param.customer_country = $("#fee_customer_country").attr("objid");
    param.business_type = $("#business_type").attr("objid");
    param.fee_inventor = $("#fee_inventor").val();
    param.proc_status = $("#fee_proc_status").attr("objid");
    param.apply_tags_id = $("#apply_tags_id_fee").attr("objid");

    param.pat_cus_fullname = $("#pat_cus_fullname1").val();
    param.agent_to_reply_start = $("#agent_to_reply_start1").val();
    param.reply_to_agent_start = $("#reply_to_agent_start1").val();
    param.remind_to_agent_start = $("#remind_to_agent_start1").val();
    param.last_deli_deadline_start = $("#last_deli_deadline_start1").val();
    param.book_deli_deadline_start = $("#book_deli_deadline_start1").val();
    param.reply_cus_date_start = $("#reply_cus_date_start1").val();
    param.cus_receipt_start = $("#cus_receipt_start1").val();
    param.finish_revise_date_start = $("#finish_revise_date_start1").val();
    param.cus_entrust_start = $("#cus_entrust_start1").val();
    param.prompt_cus_start = $("#prompt_cus_start1").val();
    param.reply_agengcy_start = $("#reply_agengcy_start1").val();
    param.agengcy_receipt_start = $("#agengcy_receipt_start1").val();
    param.agengcy_revise_start = $("#agengcy_revise_start1").val();
    param.prompt_agengcy_start = $("#prompt_agengcy_start1").val();
    param.third_party_revise_start = $("#third_party_revise_start1").val();
    param.revise_third_party_start = $("#revise_third_party_start1").val();
    param.receipt_third_party_start = $("#receipt_third_party_start1").val();
    param.agent_to_reply_end = $("#agent_to_reply_end1").val();
    param.reply_to_agent_end = $("#reply_to_agent_end1").val();
    param.remind_to_agent_end = $("#remind_to_agent_end1").val();
    param.last_deli_deadline_end = $("#last_deli_deadline_end1").val();
    param.book_deli_deadline_end = $("#book_deli_deadline_end1").val();
    param.reply_cus_date_end = $("#reply_cus_date_end1").val();
    param.cus_receipt_end = $("#cus_receipt_end1").val();
    param.finish_revise_date_end = $("#finish_revise_date_end1").val();
    param.cus_entrust_end = $("#cus_entrust_end1").val();
    param.prompt_cus_end = $("#prompt_cus_end1").val();
    param.reply_agengcy_end = $("#reply_agengcy_end1").val();
    param.agengcy_receipt_end = $("#agengcy_receipt_end1").val();
    param.agengcy_revise_end = $("#agengcy_revise_end1").val();
    param.prompt_agengcy_end = $("#prompt_agengcy_end1").val();
    param.third_party_revise_end = $("#third_party_revise_end1").val();
    param.revise_third_party_end = $("#revise_third_party_end1").val();
    param.receipt_third_party_end = $("#receipt_third_party_end1").val();
    param.column1 = $("#column1").val();
    param.column2 = $("#column2").val();
    param.column3 = $("#column3").val();
    param.column4 = $("#column4").val();
    param.column5 = $("#column5").val();
    param.Call = "SearchOfficeFee";

    LimitMonitorList.CaseCols = [[
        { type: 'numbers', fixed: 'left' },
        { type: 'checkbox' },
        {
            field: 'case_id', title: '操作', minWidth: 80, templet: function (row) {
                return "<a title='邮件催办' class='tbmail' onclick='Limit.SendEmail(&apos;" + row.proc_id + "&apos;)' href='javascript:void(0)' lid='S171027152508525'>&nbsp;</a>"
                    + "<a title='编辑' class='tbedit' onclick='Limit.AddFee(&apos;" + row.fee_class + "&apos;,&apos;" + row.fee_id + "&apos;,&apos;" + row.proc_id + "&apos;,&apos;" + row.fee_id + "&apos;)' href='javascript:void(0)' lid='S140813120839548'>&nbsp;</a>";
            }
        },
        {
            field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
            }
        },
        { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100 },
        {
            field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100
                
        },
        { field: 'ctrl_proc', title: GetResource('S140821164247623', '处理事项'), sort: true, minWidth: 100 },
        { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
        { field: 'customer_no', title: GetResource('S141009095540608', '客户编号'), sort: true, minWidth: 80 },
        { field: 'fee_type', title: GetResource('S141229120455510', '费用名称'), sort: true, style: 'text-align:left', minWidth: 95 },
        { field: 'currency_id', title: GetResource('S140928102300162', '币别'), sort: true, minWidth: 95 },
        { field: 'amount', title: GetResource('S140928102402531', '金额'), sort: true, minWidth: 95 },
        { field: 'app_date', title: GetResource('S140822170743359', '申请日'), sort: true, minWidth: 95 },
        { field: 'pay_due_date', title: GetResource('S140928145101185', '缴费期限'), sort: true, minWidth: 95 },
        { field: 'pay_type_text', title: GetResource('S160924103215309', '缴费类型'), sort: true, minWidth: 95 },
        { field: 'customer_status', title: GetResource('S160318091131220', '客户状态'), sort: true, minWidth: 80 },
        { field: 'revise_user', title: GetResource('S150423232337564', '核稿人'), sort: true, minWidth: 80 },
        { field: 'proc_note', title: GetResource('S141015142024952', '处理事项备注'), sort: true, style: 'text-align:left', minWidth: 110, hide: true },
        { field: 'applicant', title: GetResource('S140814212259786', '申请人'), sort: true, minWidth: 100, style: 'text-align:left', hide: true },
        { field: 'case_sales', title: GetResource('S190115180451251', '客户业务员'), sort: true, minWidth: 100, hide: true },
        { field: 'inventor', title: GetResource('S140825203153404', '发明人'), sort: true, minWidth: 100, hide: true },
        { field: 'case_pic', title: GetResource('S160411145409233', '案件处理人'), sort: true, minWidth: 100, hide: true },
        { field: 'cn_help_name', title: GetResource('S180919151921374', '案件当前业务助理'), sort: true, minWidth: 140, hide: true },
        { field: 'introducer', title: GetResource('S180421100702035', '外部案源人'), sort: true, minWidth: 140, hide: true },
        { field: 'back_date', title: GetResource('S150808153434141', '返稿日(IPR)'), sort: true, minWidth: 110, hide: true },
        { field: 'back_inventor_date', title: GetResource('S181219100902484', '返发明人日'), sort: true, minWidth: 110, hide: true },
        { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
        { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
        { field: 'img_url', title: GetResource('S190118110903654', '商标图样'), sort: true, minWidth: 120, templet: function (d) { return Limit.loadImg(d) }, hide: true },
        { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true },
        { field: 'column_1', title: GetResource('S190517140659625', '自定义栏位1'), sort: true, minWidth: 110, hide: true },
        { field: 'column_2', title: GetResource('S190517140711050', '自定义栏位2'), sort: true, minWidth: 110, hide: true },
        { field: 'column_3', title: GetResource('S190523092747201','自定义栏位3'), sort: true, minWidth: 110, hide: true },
        { field: 'column_4', title: GetResource('S190523092839250', '自定义栏位4'), sort: true, minWidth: 110, hide: true },
        { field: 'column_5', title: GetResource('S190523092848892', '自定义栏位5'), sort: true, minWidth: 110, hide: true },
        { field: 'pat_cus_fullname', title: GetResource('S150226092116115', '客户全称'), sort: true, minWidth: 100, hide: true },
        { field: 'agent_to_reply', title: GetResource('S150226092116115', '代理人回复日'), sort: true, minWidth: 100, hide: true },
        { field: 'reply_to_agent', title: GetResource('S150226092116115', '回复代理人日'), sort: true, minWidth: 100, hide: true },
        { field: 'remind_to_agent', title: GetResource('S150226092116115', '提醒代理人日'), sort: true, minWidth: 100, hide: true },
        { field: 'last_deli_deadline', title: GetResource('S150226092116115', '最终绝限日'), sort: true, minWidth: 100, hide: true },
        { field: 'book_deli_deadline', title: GetResource('S150226092116115', '书面绝限日'), sort: true, minWidth: 100, hide: true },
        { field: 'cus_receipt', title: GetResource('S150226092116115', '客户确收日'), sort: true, minWidth: 100, hide: true },
        { field: 'cus_entrust', title: GetResource('S150226092116115', '客户委托日'), sort: true, minWidth: 100, hide: true },
        { field: 'prompt_cus', title: GetResource('S150226092116115', '提示客户日'), sort: true, minWidth: 100, hide: true },
        { field: 'agengcy_receipt', title: GetResource('S150226092116115', '外所确收日'), sort: true, minWidth: 100, hide: true },
        { field: 'prompt_agengcy', title: GetResource('S150226092116115', '提示外所日'), sort: true, minWidth: 100, hide: true },
        { field: 'third_party_revise', title: GetResource('S150226092116115', '第三方回复日'), sort: true, minWidth: 100, hide: true },
        { field: 'revise_third_party', title: GetResource('S150226092116115', '回复第三方日'), sort: true, minWidth: 100, hide: true },
        { field: 'receipt_third_party', title: GetResource('S150226092116115', '第三方确收日'), sort: true, minWidth: 100, hide: true }
    ]];
    if (GetPublishConfig('SHEWAI', 'DATE')) {
        LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: Limit.reply_cus_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
        LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: Limit.finish_revise_date, sort: true, minWidth: 80, type_code: 'proc', hide: true });
        LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: Limit.reply_agengcy, sort: true, minWidth: 80, type_code: 'proc', hide: true });
        LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: Limit.agengcy_revise, sort: true, minWidth: 80, type_code: 'proc', hide: true });
    }
    else {
        LimitMonitorList.CaseCols[0].push({ field: 'reply_cus_date', title: GetResource('S201228165440862', '回复客户日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
        LimitMonitorList.CaseCols[0].push({ field: 'finish_revise_date', title: GetResource('S201228165440862', '客户回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
        LimitMonitorList.CaseCols[0].push({ field: 'reply_agengcy', title: GetResource('S201228165440862', '回复外所日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
        LimitMonitorList.CaseCols[0].push({ field: 'agengcy_revise', title: GetResource('S201228165440862', '外所回复日'), sort: true, minWidth: 80, type_code: 'proc', hide: true });
    }
    if (Limit.isSecrecy) {
        LimitMonitorList.CaseCols[0].splice(2, 1);
    }

    // 派特恩定制
    if (!Limit.PaiTeEn) {
        for (var i = 0; i < LimitMonitorList.CaseCols[0].length; i++) {
            if (LimitMonitorList.CaseCols[0][i].field == 'agent_to_reply'
                || LimitMonitorList.CaseCols[0][i].field == 'reply_to_agent'
                || LimitMonitorList.CaseCols[0][i].field == 'remind_to_agent'
                || LimitMonitorList.CaseCols[0][i].field == 'last_deli_deadline'
                || LimitMonitorList.CaseCols[0][i].field == 'book_deli_deadline'
                || LimitMonitorList.CaseCols[0][i].field == 'reply_cus_date'
                || LimitMonitorList.CaseCols[0][i].field == 'cus_receipt'
                || LimitMonitorList.CaseCols[0][i].field == 'finish_revise_date'
                || LimitMonitorList.CaseCols[0][i].field == 'cus_entrust'
                || LimitMonitorList.CaseCols[0][i].field == 'prompt_cus'
                || LimitMonitorList.CaseCols[0][i].field == 'reply_agengcy'
                || LimitMonitorList.CaseCols[0][i].field == 'agengcy_receipt'
                || LimitMonitorList.CaseCols[0][i].field == 'agengcy_revise'
                || LimitMonitorList.CaseCols[0][i].field == 'prompt_agengcy'
                || LimitMonitorList.CaseCols[0][i].field == 'third_party_revise'
                || LimitMonitorList.CaseCols[0][i].field == 'revise_third_party'
                || LimitMonitorList.CaseCols[0][i].field == 'pat_cus_fullname'
                || LimitMonitorList.CaseCols[0][i].field == 'receipt_third_party') {
                LimitMonitorList.CaseCols[0].splice(i, 1);
                i--;
            }
        }
    }



  
    Ajax.LoadLayuiTable(LimitMonitorList, "CaseList_fee", 'Report.ashx', LimitMonitorList.CaseCols, param, function (data) {
        var length = 0;
        if (data.TableRows) {
            length = data.TableRows.length;
            for (var i = 0; i < length; i++) {
                var row = data.TableRows[i];
                var tr = $("#fee .layui-table-main tr[data-index=" + i + "]");
                var case_name_td = tr.find("td[data-field='case_name']");
                var customer_name_td = tr.find("td[data-field='customer_name']");
                tr.attr("onclick", "Limit.ClickTrChangeColor('CaseList_fee',this)");
                case_name_td.attr("title", $.NoSpace(case_name_td.text()));
                customer_name_td.attr("title", $.NoSpace(customer_name_td.text()));
                tr.attr("id", row.proc_id);
                var legal_due_date = row.pay_due_date;
                if ($.DateDiff(legal_due_date, $.curDateTime(false)) <= 7) {
                    tr.find("td[data-field='app_no']>div").addClass('trRed');
                    tr.find("td[data-field='case_name']>div").addClass('trRed');
                    tr.find("td[data-field='ctrl_proc']>div").addClass('trRed');
                    tr.find("td[data-field='customer_name']>div").addClass('trRed');
                    tr.find("td[data-field='customer_no']>div").addClass('trRed');
                    tr.find("td[data-field='currency_id']>div").addClass('trRed');
                    tr.find("td[data-field='amount']>div").addClass('trRed');
                    tr.find("td[data-field='app_date']>div").addClass('trRed');
                    tr.find("td[data-field='pay_due_date']>div").addClass('trRed');
                    tr.find("td[data-field='pay_type_text']>div").addClass('trRed');
                    tr.find("td[data-field='customer_status']>div").addClass('trRed');
                    tr.find("td[data-field='revise_user']>div").addClass('trRed');
                    tr.find("td[data-field='proc_note']>div").addClass('trRed');
                    tr.find("td[data-field='applicant_name']>div").addClass('trRed');
                    tr.find("td[data-field='case_sales']>div").addClass('trRed');
                    tr.find("td[data-field='case_pic']>div").addClass('trRed');
                    tr.find("td[data-field='cn_help_name']>div").addClass('trRed');
                    tr.find("td[data-field='back_date']>div").addClass('trRed');
                    tr.find("td[data-field='back_inventor_date']>div").addClass('trRed');
                    tr.find("td[data-field='fee_type']>div").addClass('trRed');
                    // tr.addClass('trRed');
                }
            }
            if (Limit.is_complete_show_img) {
                $("#fee").find(".layui-table-main").find(".Trade_img").parent().css("height", "120px");
                $("#fee").find(".layui-table-fixed").find(".layui-table-body").css("display", "none");
            }
        }

    });

    //Limit.ClickTrChangeColor();
    Limit.SearchClick();
}

Limit.ExportFee = function () {
    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.height = 420;
    ajax_config.width = 850;
    ajax_config.belong_key = "LimitFee";
    ajax_config.handler = "Report.ashx";
    ajax_config.Call = "ExportOfficeFee";

    var param = {};
    param.select_and = $("#select_and_1")[0].checked ? "true" : "false";
    param.customer_id = $("#customer_id").attr("objid");
    param.country_id = $("#country_id").attr("objid");
    param.receive_due_date_from = $("#receive_due_date_from").val();
    param.receive_due_date_to = $("#receive_due_date_to").val();
    param.receive_due_date_isnull = ($("#receive_due_date_isnull")[0].checked ? "on" : "");
    param.pay_due_date_from = $("#pay_due_date_from").val();
    param.pay_due_date_to = $("#pay_due_date_to").val();
    param.pay_due_date_isnull = ($("#pay_due_date_isnull")[0].checked ? "on" : "");
    param.app_date_from = $("#app_date_from").val();
    param.app_date_to = $("#app_date_to").val();
    param.app_date_isnull = ($("#app_date_isnull")[0].checked ? "on" : "");

    param.case_type_id = $("#case_type_id").val();
    param.apply_type_id = $("#apply_type").attr("objid");
    param.case_volume = $("#case_volume").val();
    param.is_fuzzy_query_case_volume = $("#is_fuzzy_query_case_volume")[0].checked ? true : false;
    param.is_fuzzy_query_app_no = $("#is_fuzzy_query_app_no")[0].checked ? true : false;
    param.is_point_app_no = $("#is_point_app_no")[0].checked ? true : false;
    param.case_volume_customer = $("#case_volume_customer").val();
    param.applicant = $("#applicant").val();
    param.app_no = $("#app_no").val();
    param.search_type = $("#search_type").attr("objid");
    param.notice_status = $("#notice_status").val();
    param.doc_date_to = $("#doc_date_to").val();
    param.doc_date_from = $("#doc_date_from").val();
    param.doc_date_isnull = ($("#doc_date_isnull")[0].checked ? "on" : "");
    param.finish_date_to = $("#finish_date_to").val();
    param.finish_date_from = $("#finish_date_from").val();
    param.finish_date_isnull = ($("#finish_date_isnull")[0].checked ? "on" : "");

    param.fee_search_type = $("#fee_search_type").val();
    param.fee_show_type = $("#fee_show_type").val();
    param.pay_type = $("#pay_type").val();
    param.flow_direction = $("#flow_direction").attr("objid");
    param.proc_pic_user = $("#proc_pic_user").attr("objid");
    param.is_contain = $("#is_contain").val();
    param.customer_code = $("#customer_code").val();
    param.branch_dept = $("#branch_dept_id").attr("objid");
    param.fee_name = $("#fee_name").attr("objid");
    param.back_date_start = $("#back_date_start1").val();
    param.back_date_end = $("#back_date_end1").val();
    param.back_inventor_date_start = $("#back_inventor_date_start1").val();
    param.back_inventor_date_end1 = $("#back_inventor_date_end1").val();
    param.revise_user_id = $("#revise_user").attr("objid");
    param.customer_status_id = $("#customer_status_id").attr("objid");
    param.sales = $("#fee_sales").attr("objid");
    param.sales_help = $("#fee_sales_help").attr("objid");
    param.flow_user = $("#fee_p_case_info_flow_user_id").attr("objid");
    param.fee_agency_id = $("#fee_agency_id").attr("objid");
    param.customer_country = $("#fee_customer_country").attr("objid");
    param.proc_status = $("#fee_proc_status").attr("objid");
    param.business_type = $("#business_type").attr("objid");
    param.fee_inventor = $("#fee_inventor").val();
    param.apply_tags_id = $("#apply_tags_id_fee").attr("objid");

    param.pat_cus_fullname = $("#pat_cus_fullname1").val();
    param.agent_to_reply_start = $("#agent_to_reply_start1").val();
    param.reply_to_agent_start = $("#reply_to_agent_start1").val();
    param.remind_to_agent_start = $("#remind_to_agent_start1").val();
    param.last_deli_deadline_start = $("#last_deli_deadline_start1").val();
    param.book_deli_deadline_start = $("#book_deli_deadline_start1").val();
    param.reply_cus_date_start = $("#reply_cus_date_start1").val();
    param.cus_receipt_start = $("#cus_receipt_start1").val();
    param.finish_revise_date_start = $("#finish_revise_date_start1").val();
    param.cus_entrust_start = $("#cus_entrust_start1").val();
    param.prompt_cus_start = $("#prompt_cus_start1").val();
    param.reply_agengcy_start = $("#reply_agengcy_start1").val();
    param.agengcy_receipt_start = $("#agengcy_receipt_start1").val();
    param.agengcy_revise_start = $("#agengcy_revise_start1").val();
    param.prompt_agengcy_start = $("#prompt_agengcy_start1").val();
    param.third_party_revise_start = $("#third_party_revise_start1").val();
    param.revise_third_party_start = $("#revise_third_party_start1").val();
    param.receipt_third_party_start = $("#receipt_third_party_start1").val();
    param.agent_to_reply_end = $("#agent_to_reply_end1").val();
    param.reply_to_agent_end = $("#reply_to_agent_end1").val();
    param.remind_to_agent_end = $("#remind_to_agent_end1").val();
    param.last_deli_deadline_end = $("#last_deli_deadline_end1").val();
    param.book_deli_deadline_end = $("#book_deli_deadline_end1").val();
    param.reply_cus_date_end = $("#reply_cus_date_end1").val();
    param.cus_receipt_end = $("#cus_receipt_end1").val();
    param.finish_revise_date_end = $("#finish_revise_date_end1").val();
    param.cus_entrust_end = $("#cus_entrust_end1").val();
    param.prompt_cus_end = $("#prompt_cus_end1").val();
    param.reply_agengcy_end = $("#reply_agengcy_end1").val();
    param.agengcy_receipt_end = $("#agengcy_receipt_end1").val();
    param.agengcy_revise_end = $("#agengcy_revise_end1").val();
    param.prompt_agengcy_end = $("#prompt_agengcy_end1").val();
    param.third_party_revise_end = $("#third_party_revise_end1").val();
    param.revise_third_party_end = $("#revise_third_party_end1").val();
    param.receipt_third_party_end = $("#receipt_third_party_end1").val();
    param.column1 = $("#column1").val();
    param.column2 = $("#column2").val();
    param.column3 = $("#column3").val();
    param.column4 = $("#column4").val();
    param.column5 = $("#column5").val();

    var order_by = "";
    $("#CaseList_fee").next().find(".layui-table-header").find("th").each(function () {
        var sort = $(this).find("span[class='layui-table-sort layui-inline']").attr("lay-sort");
        var column = $(this).attr("data-sort");
        if (column == 'app_date') {
            column = 'ci.app_date';
        } else if (column == 'back_date') {
            column = 'pi.back_date';
        }
        if (sort) {
            order_by = column + "  " + sort;
        }
    });
    param.order_by = order_by;

    var obj_columns = [];
    var column4 = [];//案件信息 
    var column5 = [];//处理事项
    var column6 = [];//著录项目
    var column7 = [];
    column4.push({ value: "app_no", text: GetResource('S140822170832920', '申请号') });
    column4.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    column4.push({ value: "case_volume_customer", text: GetResource('S140901115322880', '客户文号') });
    column4.push({ value: "case_type", text: GetResource('S140830213547543', '案件类型') });
    column4.push({ value: "case_status", text: GetResource('S140822171057018', '案件状态') });
    column4.push({ value: "apply_type", text: GetResource('S140821164234972', '申请类型') });
    column4.push({ value: "app_date", text: GetResource('S140822170743359', '申请日') });
    column4.push({ value: "country_id", text: GetResource('S140901115346358', '国家(地区)') });
    column4.push({ value: "case_name", text: GetResource('S140814204116996', '案件名称') });
    column4.push({ value: "flow_direction", text: GetResource('S140901115438618', '案件流向') });
    column4.push({ value: "customer_name", text: GetResource('S140821182822919', '客户名称') });
    column4.push({ value: "fee_type", text: GetResource('S141229120455510', '费用名称') });
    column4.push({ value: "currency_id", text: GetResource('S140928102300162', '币别') });
    column4.push({ value: "amount", text: GetResource('S140928102402531', '金额') });
    column4.push({ value: "pay_due_date", text: GetResource('S140928145101185', '缴费期限') });
    column4.push({ value: "customer_no", text: GetResource('S141009095540608', '客户编号') });
    column4.push({ value: "case_sales", text: GetResource('S140821194410109', '业务人员') });
    column4.push({ value: 'customer_mail', text: GetResource('S200506151824686', '客户邮箱') });
    column4.push({ value: "dept_full_name1", text: GetResource('S170715174321473', '业务人员部门'), is_default: false });
    column4.push({ value: "apply_tags", text: GetResource('S160803103154175', '专利标签'), is_default: false });
    if (Limit.fieldColumn) {
        for (var i = 0; i < Limit.fieldColumn.length; i++) {
            column4.push({ value: Limit.fieldColumn[i].column_id, text: Limit.fieldColumn[i].column_name, is_default: false });
        }
    }
    //派特恩定制
    if (Limit.PaiTeEn) {
        column4.push({ value: 'pat_cus_fullname', text: GetResource('S140827094619190', '客户全称'), is_default: false });
    }
    column5.push({ value: "proc_note", text: GetResource('S141015142024952', '处理事项备注') });
    column5.push({ value: "review_stage", text: GetResource('S150203143844255', '案件阶段') });
    column5.push({ value: "ctrl_proc", text: GetResource('S140821164247623', '处理事项') });
    column5.push({ value: "proc_pic_user", text: GetResource('S170107163446740', '处理事项处理人') });
    column5.push({ value: "branch_dept_name", text: GetResource('S170419160623634', '所属分部') });
    column5.push({ value: "back_date", text: GetResource('S150808153434141', '返稿日') });
    column5.push({ value: "back_inventor_date", text: GetResource('S181219100902484', '返发明人日') });
    // 派特恩定制
    if (Limit.PaiTeEn) {
        column5.push({ value: 'agent_to_reply', text: GetResource('S220217174455766', '代理人回复'), is_default: false });
        column5.push({ value: 'reply_to_agent', text: GetResource('S220217174455766', '回复代理人'), is_default: false });
        column5.push({ value: 'remind_to_agent', text: GetResource('S220217174455766', '提醒代理人'), is_default: false });
        column5.push({ value: 'last_deli_deadline', text: GetResource('S220217174455766', '最终绝限日'), is_default: false });
        column5.push({ value: 'book_deli_deadline', text: GetResource('S220217174455766', '书面绝限日'), is_default: false });
        column5.push({ value: 'cus_receipt', text: GetResource('S220217174455766', '客户确收日'), is_default: false });
        column5.push({ value: 'cus_entrust', text: GetResource('S220217174455766', '客户委托日'), is_default: false });
        column5.push({ value: 'prompt_cus', text: GetResource('S220217174455766', '提示客户日'), is_default: false });
        column5.push({ value: 'agengcy_receipt', text: GetResource('S220217174455766', '外所确收日'), is_default: false });
        column5.push({ value: 'prompt_agengcy', text: GetResource('S220217174455766', '提示外所日'), is_default: false });
        column5.push({ value: 'third_party_revise', text: GetResource('S220217174455766', '第三方回复日'), is_default: false });
        column5.push({ value: 'revise_third_party', text: GetResource('S220217174455766', '回复第三方日'), is_default: false });
        column5.push({ value: 'receipt_third_party', text: GetResource('S220217174455766', '第三方确收日'), is_default: false });
    }

    if (GetPublishConfig('SHEWAI', 'DATE')) {
        column5.push({ value: 'reply_cus_date', text: Limit.reply_cus_date });
        column5.push({ value: 'finish_revise_date', text: Limit.finish_revise_date });
        column5.push({ value: 'reply_agengcy', text: Limit.reply_agengcy });
        column5.push({ value: 'agengcy_revise', text: Limit.agengcy_revise });
    }
    else {
        column5.push({ value: 'reply_cus_date', text: GetResource('S220217174455766', '回复客户日') });
        column5.push({ value: 'finish_revise_date', text: GetResource('S220217174455766', '客户回复日') });
        column5.push({ value: 'reply_agengcy', text: GetResource('S220217174455766', '回复外所日') });
        column5.push({ value: 'agengcy_revise', text: GetResource('S220217174455766', '外所回复日') });
    }
    column6.push({ value: "applicant", text: GetResource('S181219100902484', '申请人'), is_default: false });

    obj_columns.push({ group: GetResource('S140923212003271', '案件信息'), data: column4 });
    obj_columns.push({ group: GetResource('S140903220206444', '处理事项'), data: column5 });
    obj_columns.push({ group: GetResource('S140821164247623', '著录项目'), data: column6 });

    Export(ajax_config, param, obj_columns);
}


//Limit.StrucSendEmail = function (proc_id) {
//    return "<a  href='javascript:void(0);' title=" + GetResource('S171027152508525', '邮件催办') + " onclick=\"Limit.SendEmail('" + proc_id + "');\" class='tbmail'></a>";
//}

Limit.SendEmail = function (proc_id) {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });

    var Dialog = function () {
        var html = "<div><textarea class='input_auto td_200' style='height:40px;'></textarea></div>";
        $.dialog({
            title: GetResource('S200513174938946', '请输入催办备注'),
            content: html, lock: true, width: 250,
            min: false, resize: true, max: false,
            focus: true, id: 'printtrade'
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
                input = this.DOM.content[0].getElementsByTagName('textarea')[0];
                input.focus();
            }
        });
    }
    Dialog();

    function CallBack(input) {
        var remark = input.value.trim();
        var para = {};
        para.Call = "SendLimitMonitorEmail";
        para.proc_id = proc_id;
        para.type = _type;
        para.urge_type = "CP"
        para.remark = remark;

        function Success(data) {

            if (!data.ClientInfo.Result) {
                Box.Alert(GRESX.HINTS.TITLE, GetResource("S160809153113675", "催办失败"), null, { icon: 'fail.gif' });
            } else {
                Box.Tips(GRESX.HINTS.TITLE,
                    2,
                    GetResource("S180512183633392", "期限监控提醒邮件发送成功"),
                    null,
                    { icon: 'succ.gif', width: '200' });
            }
        }

        Ajax.Request("Common.ashx", para, Success);
    }

}

Limit.UrgeFirstHandler = function () {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });

    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            break;
        case 'pay':
            table_id = "CaseList_pay";
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            break;
        case 'recall':
            table_id = "CaseList_recall";
            break;
        case 'priority':
            table_id = "CaseList_priority";
            break;
        case 'fee':
            table_id = "CaseList_fee";
            break;
    }

    //批量选中的值proc_id
    var proc_ids = LimitMonitorList.table.getCheckColumnData(table_id, 'proc_id');

    if (proc_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170327180506700', '请选择要返稿催办的处理事项'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }


    $.dialog({
        title: GetResource('S170324110959087', '返稿催办-第一处理人'),
        content: "url:" + GUrl + "/IhgForms/Report/IhgUrgeFirstHandler.aspx",
        lock: true,
        width: 1800,
        height: 800,
        max: false,
        min: false,
        resize: true,
        parent: document,
        focus: true,
        id: 'LimitDraftUrgeFirst',
        init: function () {
            var content = lhgdialog.list["LimitDraftUrgeFirst"].content;
            if (content && content.IhgLimitUrge) {
                content.IhgLimitUrge.proc_ids = proc_ids
                content.IhgLimitUrge.type = _type
                content.IhgLimitUrge.Initalization()
            }
        },
        close: function () {
            var context = lhgdialog.list['LimitDraftUrgeFirst'].content;
            if (context != null) {
                // 弹框关闭，删除邮件内容
                Ajax.Request("Common.ashx", {
                    Call: "DelMailInfoALL",
                }, function (_data) {

                });
            }
        }
    });
}

//单击催办按钮
Limit.ShowLimitMonitorUrge = function () {
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });

    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            break;
        case 'pay':
            table_id = "CaseList_pay";
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            break;
        case 'recall':
            table_id = "CaseList_recall";
            break;
        case 'priority':
            table_id = "CaseList_priority";
            break;
        case 'fee':
            table_id = "CaseList_fee";
            break;
    }

    //批量选中的值proc_id
    var proc_ids = LimitMonitorList.table.getCheckColumnData(table_id, 'proc_id');

    if (proc_ids == '') {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170327180506700', '请选择要返稿催办的处理事项'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }

    $.dialog({
        title: GetResource('S170324110959087', '返稿催办'),
        content: "url:" + GUrl + "/IhgForms/Report/IhgLimitMonitorUrge.aspx",
        lock: true,
        width: 1035,
        height: 675,
        max: false,
        min: false,
        resize: true,
        parent: document,
        focus: true,
        id: 'LimitDraftUrge',
        init: function () {
            var content = lhgdialog.list["LimitDraftUrge"].content;
            if (content && content.IhgLimitUrge) {
                content.IhgLimitUrge.proc_ids = proc_ids
                content.IhgLimitUrge.type = _type
                content.IhgLimitUrge.Initalization()
            }
        }
    });
}
//修改处理事项
Limit.OpenCaseProc = function (_proc_id) {
    var case_id = '';
    var case_type_id = '';
    var country_id = '';
    var business_type_id = '';
    var apply_type_id = '';
    var register_type_code = '';
    //根据proc_id取加载处理事项需要的案子信息
    function GetCaseInfo(data) {
        if (data) {
            case_id = data.CaseInfo[0].case_id;
            case_type_id = data.CaseInfo[0].case_type_id;
            country_id = data.CaseInfo[0].country_id;
            business_type_id = data.CaseInfo[0].business_type_id;
            apply_type_id = data.CaseInfo[0].apply_type_id;
            register_type_code = data.CaseInfo[0].register_type_code;
        }
    }
    Ajax.Request("Report.ashx", { Call: "GetCaseInfo", proc_id: _proc_id }, GetCaseInfo, true);
    var title = _proc_id ? GetResource('S140821164247623', '处理事项') : GetResource('S140821164247623', '处理事项') + '-新增';
    var url = GUrl + '/IhgForms/Patent/' + CaseTypeURL[case_type_id]["PROCURL"];
    $.dialog({
        title: title, id: "caseprocinfo", max: false, min: false, lock: true, resize: true, width: 980, height: 660,
        init: function () {
            try {
                var _object = lhgdialog.list['caseprocinfo'].content;
                if (_object && _object.CaseProcInfo) {
                    _object.CaseProcInfo.case_type_id = case_type_id; // CaseManage.caseType_id; //案件类型
                    _object.CaseProcInfo.country_id = country_id; // CaseManage.country_id; //国家(地区)
                    _object.CaseProcInfo.business_type_id = business_type_id; //.business_type_id; //业务类型
                    _object.CaseProcInfo.apply_type_id = apply_type_id; // CaseManage.apply_type_id; //申请类型
                    _object.CaseProcInfo.case_id = case_id;
                    _object.CaseProcInfo.register_type_code = register_type_code;
                    if (_proc_id) {
                        _object.CaseProcInfo.Proc_id = _proc_id;
                    }
                    else {
                        _object.CaseProcInfo.NewProc();
                    }
                    _object.CaseProcInfo.Initalization();
                } 
            }
            catch (e) { }
        },
        content: 'url:' + url,
        close: function () { //CaseProcInfo.update
            var _object = lhgdialog.list['caseprocinfo'].content;
            if (_object && _object.CaseProcInfo && _object.CaseProcInfo.update) {
                var _type = "";
                $(".tbcontent").each(function () {
                    if ($(this).css('display') == 'block') {
                        _type = this.id;
                        return;
                    }
                })
                if (_type = "fee") {
                    Limit.SearchFee();
                }
                else {
                    Limit.SearchList();
                }

            }
        }
    });
}
Limit.WordExport = function () {


    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });
    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            break;
        case 'pay':
            table_id = "CaseList_pay";
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            break;
        case 'recall':
            table_id = "CaseList_recall";
            break;
        case 'priority':
            table_id = "CaseList_priority";
            break;
        case 'fee':
            table_id = "CaseList_fee";
            break;
        case 'flow':
            table_id = "CaseList_flow";
            break;
    }
    var proc_ids = LimitMonitorList.table.getCheckColumnData(table_id, 'proc_id');
    if (!proc_ids) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141025145102176', '请选择处理事项!'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    var proc_id = '';
    if (proc_ids.split(";").length > 0) {
        proc_id = proc_ids.split(";")[0];
    }


    function Info(_Meta) {
        if (_Meta.CaseInfo) {
            var _customer_id = _Meta.CaseInfo[0].customer_id;
            var _customer_name = _Meta.CaseInfo[0].customer_name;
            var _case_id = _Meta.CaseInfo[0].case_id;
            var _proc_id = _Meta.CaseInfo[0].proc_id;
            if (!_case_id) {
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S140930163446731', '请先选择案件'), null, { icon: 'hits.gif', width: '250', height: '60' });
                return;
            }
            $.dialog({
                title: GetResource('S150104154726261', '选择word模版'), id: "IhgWordTemplate", max: false, min: false, width: 800, height: 400,
                content: 'url:IhgForms/Bill/IhgWordTemplate.aspx',
                lock: false,
                max: false,
                min: false,
                resize: false,
                close: function () {
                    try {
                        var context = lhgdialog.list['IhgWordTemplate'].content;
                        if (context != null && context.IhgWordTemplate.word_id != null && context.IhgWordTemplate.word_id !== "") {
                            Limit.word_id = context.IhgWordTemplate.word_id;
                            Limit.expaortpdf = context.IhgWordTemplate.expaortpdf;
                            Limit.uploadattachment = context.IhgWordTemplate.uploadattachment;
                            Limit.exprotproc = context.IhgWordTemplate.exprotproc;//上传到案件中
                            Limit.exportcasetype = context.IhgWordTemplate.exportcasetype;
                            Limit.exportinputinfo = context.IhgWordTemplate.exportinputinfo;
                            var new_filename = context.IhgWordTemplate.new_filename;
                            function Success(_Meta) {
                                if (_Meta.ClientInfo.Result) {
                                    if (_Meta.file_list) {
                                        GetFile(_Meta.file_list[0].guid, 0, "pdf");
                                    }
                                    else {
                                        Box.Alert(GRESX.HINTS.TITLE, GetResource('S140823184840620', '文件下载失败！'), null, { icon: 'hits.gif' });
                                    }
                                } else {
                                       Box.Alert(GRESX.HINTS.TITLE, GetResource('S170717171551491', '模板文件不存在！'), null, { icon: 'hits.gif' });
                                }
                            }
                            Ajax.Request("Common.ashx", {
                                Call: "Limit_Print_Word_Template",
                                proc_ids: proc_ids,
                                proc_id: _proc_id,
                                case_id: '',
                                temp_id: Limit.word_id,
                                request_no: "",
                                objid: _case_id,
                                expaortpdf: Limit.expaortpdf,
                                uploadattachment: "",
                                exprotproc: "",
                                exportcasetype: Limit.exportcasetype ,
                                infotype: Limit.exportinputinfo,
                                new_filename: new_filename,
                                customer_id: _customer_id,
                                customer_name: _customer_name
                            }, Success);
                        }
                    } catch (e) {
                        return true;
                    }
                },
                init: function () {
                    var context = lhgdialog.list['IhgWordTemplate'].content;
                    if (context != null && context.IhgWordTemplate != null) {
                        context.IhgWordTemplate.WordOnReady("word");
                    }
                }
            });
        }
        else {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S150907102447382', '请选择费用,再列印'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
    }
    Ajax.Request("Common.ashx", { Call: "GetLimitCaseInfo", proc_id: proc_id }, Info);

}
//获取所有部门
Limit.GetBranchDept = function () {

    if ($("#p_case_info__charge_dept_id").attr("objid").length > 0) {
        var _data = {};
        _data.Call = 'GetBranchDept';
        _data.dept_id = $("#p_case_info__charge_dept_id").attr("objid");
        _data.apply_id = Limit.case_id;

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

//点击表格的行会变灰
Limit.ClickTrChangeColor = function (table_id, e) {
    $("#" + table_id).next().find("#" + e.id).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    /*$("#table_CaseList_all tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });
    $("#table_CaseList_pay tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });
    $("#table_CaseList_suspend tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });
    $("#table_CaseList_abandon tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });
    $("#table_CaseList_recall tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });
    $("#table_CaseList_priority tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });
    $("#table_CaseList_fee tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });
    $("#table_CaseList_trademark tbody").on("click", "tr", function () {
        $(this).css("background-color", "#D3D3D3").siblings().css("background-color", "");
    });*/
}
//重置按钮
Limit.Reset = function () {
    //全部清除数据
    $('#table_element').find('input,select,textarea').each(function () {
        var type = this.getAttribute("data_type");
        if (type && type == 'object') {
            $('#' + this.id).val('').attr("objid", "");
        }
        else {
            type = this.getAttribute("type");
            if (type && (type == 'radio' || type == 'checkbox')) {
            }
            else {

                $('#' + this.id).val('')


            }
        }
    });
    $('#table_element1').find('input,select,textarea').each(function () {
        var type = this.getAttribute("data_type");
        if (type && type == 'object') {
            $('#' + this.id).val('').attr("objid", "");
        }
        else {
            type = this.getAttribute("type");
            if (type && (type == 'radio' || type == 'checkbox')) {
            }
            else {

                $('#' + this.id).val('')


            }
        }
    });
    $('#tbconditions').find('input,select,textarea').each(function () {
        var type = this.getAttribute("data_type");
        if (type && type == 'object') {
            $('#' + this.id).val('').attr("objid", "");
        }
        else {
            type = this.getAttribute("type");
            if (type && (type == 'radio' || type == 'checkbox')) {
            }
            else {

                $('#' + this.id).val('')


            }
        }
    });
    $('#dtable_element1').find('input,select,textarea').each(function () {
        var type = this.getAttribute("data_type");
        if (type && type == 'object') {
            $('#' + this.id).val('').attr("objid", "");
        }
        else {
            type = this.getAttribute("type");
            if (type && (type == 'radio' || type == 'checkbox')) {
            }
            else {

                $('#' + this.id).val('')


            }
        }
    });
    // $('#table_element').find('input[type=text][id!="case_type"],select,textarea').val('').attr("objid", "");

}

QueryHistory.Refresh = function (is_load) {
    var cur_query_history = $("#history_query").val();
    function Success(_Meta) {
        var CtOption = "<option value=''>" + GetResource('S151204090620611', '选择历史查询条件') + "</option>";

        if (_Meta.Options) {
            for (var i = 0; i < _Meta.Options.length; i++) {
                CtOption += "<option value='" + _Meta.Options[i].query_id + "'>" + _Meta.Options[i].title + "</option>";
            }
        }
        $('#history_query').html(CtOption);

        if ($("#is_query_save")[0].checked) {
            $("#is_query_save")[0].checked = false;
            $("#query_save_title").hide().val('');
            $('#history_query').val(_Meta.Options[0].query_id);
        }
        else
            $('#history_query').val(cur_query_history);

        var del = GetResource('S140808094153296', '删除');
        if ($("#history_query").val() != "")
            $("#del_history_query").html("<a href='javascript:void(0);' title='" + del + "' onclick=\"QueryHistory.Delete('" + $("#history_query").val() + "');\" class='tbdelete'>&nbsp;</a>");
        else
            $("#del_history_query").html("<a href='javascript:void(0);' title='" + del + "'  class='tbdelete img_disabled'>&nbsp;</a>");

        if (_Meta.QueryXml != null && _Meta.QueryXml.length == 1) {
            QueryHistory.cur_query_id = cur_query_history;
            QueryHistory.cur_out_xml = _Meta.QueryXml[0].out_xml;
            if (is_load && cur_query_history != '') {
                var cur_xml = _Meta.QueryXml[0].query_xml;
                var $_table;
                if ($("#dOther").is(":visible")) {
                    $_table = $("#tbconditions")
                }
                else if ($("#dFee").is(":visible")) {
                    $_table = $("#table_element")
                }
                else if ($("#dTrademark").is(":visible")) {
                    $_table = $("#table_element1")
                }
                else {
                    return;
                }

                $_table.find('input[type=text],select,textarea').val('').attr("objid", "");
                $_table.find('input[type=checkbox]').attr("checked", false);
                $_table.find('input[type=checkbox]').removeAttr("value");
                $_table.find('input[type=checkbox]').removeAttr("objid");
                $_table.find('input[type=text],select,textarea,input[type=checkbox]').each(function () {
                    var find_obj = $($.parseXML(cur_xml)).find('xmlRoot > ' + this.id)[0];
                    var find_obj_text = $($.parseXML(cur_xml)).find('xmlRoot > ' + this.id + '_text')[0];
                    if (find_obj && find_obj.textContent != '') {
                        var type = this.attributes["data_type"];
                        if (type && type.value == 'object') {
                            this.attributes["objid"].value = find_obj.textContent;
                            if (find_obj_text)
                                $(this).val(find_obj_text.textContent);
                        }
                        else {
                            type = this.attributes["type"];
                            if (type && (type.value == 'radio' || type.value == 'checkbox')) {
                                this.value = find_obj.textContent;
                                $(this).prop("checked", "true");
                            }
                            else {
                                $(this).val(find_obj.textContent);
                            }
                        }
                    }
                });
            }
        }
    }
    Ajax.Request('CaseInfo.ashx', { Call: 'SearchQueryHisList', query_type: "LimitMonitor—" + $("#ulTab").find('li[class="current"]')[0].id, query_id: cur_query_history }, Success, true);
}

QueryHistory.Save = function (query_xml, out_xml) {
    var is_proc = false;
    var is_out_save = $("#is_out_save")[0].checked ? "true" : "false";
    var is_query_save = $("#is_query_save")[0].checked ? "true" : "false";
    var query_save_title = $("#query_save_title").val();
    var query_id = $("#history_query").val();
    if (is_out_save == "false" && is_query_save == "false")
        return;
    function Success(_Meta) {
        if (_Meta.Ret) {
            if (is_out_save == "true") {
                $("#is_out_save")[0].checked = false;
                QueryHistory.Refresh(false);
            }
            if (is_query_save == "true")
                QueryHistory.Refresh(false);
        }
    }
    Ajax.Request('CaseInfo.ashx', {
        Call: 'SearchQueryHisSave', is_proc: is_proc, is_out_save: is_out_save, is_query_save: is_query_save,
        query_save_title: query_save_title, query_id: query_id, query_xml: query_xml, out_xml: out_xml, query_type: "LimitMonitor—" + $("#ulTab").find('li[class="current"]')[0].id
    }, Success, true);
}

QueryHistory.Delete = function (query_id) {
    var call_back = function () {
        var is_out_save = $("#is_out_save")[0].checked ? "true" : "false";
        function Success(_Meta) {
            if (_Meta.Ret) {
                $("#history_query").val();
                QueryHistory.Refresh(false);
                if (is_out_save == "true")
                    $("#is_out_save")[0].checked = false;
            }
        }
        Ajax.Request('CaseInfo.ashx', {
            Call: 'SearchQueryHisDelete', query_id: query_id
        }, Success, true);
    }
    Box.Confirm(GRESX.HINTS.TITLE, GetResource('S151205165836026', '是否删除历史查询条件？'), call_back, { width: '260', height: '60', icon: 'question.gif' });
}



Limit.EnterPress = function (e) {
    var ev = e || window.event;
    if (ev.keyCode == 13) {
        Limit.SearchClick();
    }
}

Limit.SearchClick = function () {
    var Elements = '';
    var val = "";
    var reg = /&/g;
    var result = false;
    var reg1 = /</g;

    var e;
    if ($("#dOther").is(":visible")) {
        e = $("#tbconditions")
    }
    else if ($("#dFee").is(":visible")) {
        e = $("#table_element")
    }
    else if ($("#dTrademark").is(":visible")) {
        e = $("#table_element1")
    }
    else {
        return;
    }

    $(e).find('input,select,textarea').each(function () {
        var type = this.attributes["data_type"];
        if (type && type.value == 'object') {

            Elements += "&lt;" + this.id + "&gt;" + $(this).attr("objid") + "&lt;/" + this.id + "&gt;";
            val = $(this).val();
            if (val.indexOf("&") >= 0 || val.indexOf("<") >= 0) {
                val = val.replace(reg, "&amp;amp;");
                val = val.replace(reg1, "");
            }
            Elements += "&lt;" + this.id + "_text" + "&gt;" + val + "&lt;/" + this.id + "_text" + "&gt;";

            if (!result && this.attributes["objid"].value) {
                result = true;
            }
        }
        else {
            type = this.attributes["type"];
            if (type && (type.value == 'radio' || type.value == 'checkbox')) {
                if (this.checked) {
                    val = this.value;
                    if (val.indexOf("&") >= 0 || val.indexOf("<") >= 0) {
                        val = val.replace(reg, "&amp;amp;");
                        val = val.replace(reg1, "");
                    }
                    Elements += "&lt;" + this.id + "&gt;" + val + "&lt;/" + this.id + "&gt;";
                    result = true;
                }
            }
            else {
                val = $(this).val();
                if (val != null) {
                    if (val.indexOf("&") >= 0 || val.indexOf("<") >= 0) {
                        val = val.replace(reg, "&amp;amp;");
                        val = val.replace(reg1, "");
                    }

                }
                Elements += "&lt;" + this.id + "&gt;" + val + "&lt;/" + this.id + "&gt;";
                if (!result && $.trim(val)) {
                    result = true;
                }
            }
        }
    });
    if (result) {
        if ($("#is_query_save")[0].checked && $("#query_save_title").val() == '') { Box.Alert(GRESX.HINTS.TITLE, GetResource('S170715174319250', '记住条件时，请输入标题！'), null, { icon: 'hits.gif', width: '200', height: '60' }); return; }
        else {
            QueryHistory.Save(Elements, "");
        }
    }
    else {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S141027154511433', '请至少输入一个查询条件！'), null, { icon: 'hits.gif', width: '200', height: '60' }); return;
    }
}


function SelectMonitorChanged() {
    if ($("#is_feemonitor").val() == "1") {
        $("#monitor_type").show();
    }
    else {
        $("#monitor_type").hide();
    }
}
function SelectAppMonitorChanged() {
    if ($("#app_is_feemonitor").val() == "1") {
        $("#app_monitor_type").show();
    }
    else {
        $("#app_monitor_type").hide();
    }
}


Limit.loadImg = function (row) {
    var img_url = row.img_url ? row.img_url : '无';
    return "<img class='Trade_img' src='" + img_url + "' alt='' style='width: 150px; height: 120px;  background-size: 100% 100%;' />"
}



Limit.AddFee = function (fee_class, fee_id, _proc_id) {
    var case_id = '';
    var case_type_id = '';
    var country_id = '';
    var business_type_id = '';
    var apply_type_id = '';
    //根据proc_id取加载处理事项需要的案子信息
    function GetCaseInfo(data) {
        if (data) {
            case_id = data.CaseInfo[0].case_id;
            case_type_id = data.CaseInfo[0].case_type_id;
            country_id = data.CaseInfo[0].country_id;
            business_type_id = data.CaseInfo[0].business_type_id;
            apply_type_id = data.CaseInfo[0].apply_type_id;
        }
    }
    Ajax.Request("Report.ashx", { Call: "GetCaseInfo", proc_id: _proc_id }, GetCaseInfo, true);
    var title = fee_id ? GetResource('S140928141507289', '修改费用') : GetResource('S140928141454466', '新增费用');
    $.dialog({
        title: title,
        height: 700,
        width: 800,
        id: "editFee",
        max: false,
        min: false,
        lock: true,
        resize: true,
        content: 'url:' + GUrl + '/IhgForms/Patent/EditFee.aspx',
        init: function () {
            var content = lhgdialog.list["editFee"].content;
            if (content && content.EditFee) {
                content.EditFee.FeeClass = fee_class;
                content.EditFee.Proc_id = _proc_id;
                content.EditFee.case_id = case_id;
                content.EditFee.Fee_id = fee_id;
                content.EditFee.Case_type_id = case_type_id;
                content.EditFee.Business_type_id = business_type_id;
                content.EditFee.Country_id = country_id;
                content.EditFee.Apply_typer_id = apply_type_id;
                content.EditFee.Initalization();
            }
        },
        close: function () {

            var content = lhgdialog.list["editFee"].content;
            if (content && content.EditFee && content.EditFee.Status) {
                Limit.SearchFee();
            }
        }
    });

}


//费用异常列表
Limit.ReturnFeeSeach = function () {
    var _data = {};
    _data.Call = 'GetLimitReturnFeeList';
    _data.country = $("#country_errorfee").attr("objid");
    _data.case_volume = $("#case_volume_returnfee").val();
    _data.is_fuzzy_query_case_volume = $("#is_fuzzy_query_case_volume_returnfee")[0].checked ? true : false;
    _data.is_fuzzy_query_app_no = $("#is_fuzzy_query_app_no_returnfee")[0].checked ? true : false;
    _data.is_point_app_no_returnfee = $("#is_point_app_no_returnfee")[0].checked ? true : false;
    _data.app_no = $("#app_no_returnfee").val();
    _data.status = $("#status").val();
    _data.apply_tags_id = $("#apply_tags_id_returnfee").val();
    LimitMonitorList.CaseCols = [[
        { type: 'numbers', fixed: 'left' },
        { type: 'checkbox' },
        {
            field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
            }
        },
        {
            field: 'case_name', title: GetResource('S140814204116996', '案件名称'), sort: true, style: 'text-align:left', minWidth: 100, 
            
        },
        { field: 'customer_name', title: GetResource('S140821182822919', '客户名称'), style: 'text-align:left', sort: true, minWidth: 100 },
        { field: 'amount', title: GetResource('S140822170743359', '已存在金额'), sort: true, minWidth: 100 },
        { field: 'o_amount', title: GetResource('S140822170743359', '官方费用金额'), sort: true, minWidth: 100 },
        { field: 'fee_type_zh_cn', title: GetResource('S140822170743359', '已存在费用名称'), sort: true, minWidth: 100 },
        { field: 'o_fee_type_zh_cn', title: GetResource('S140822170743359', '官方费用名称'), sort: true, minWidth: 100 },
        { field: 'o_case_status_zh_cn', title: GetResource('S140822170743359', '官方费用状态'), sort: true, minWidth: 100 },
        { field: 'case_status_zh_cn', title: GetResource('S140822170743359', '现有费用状态'), sort: true, minWidth: 100 },
        { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100 },
        { field: 'app_date', title: GetResource('S140822170743359', '申请日'), sort: true, minWidth: 100 },
        { field: 'charge_date', title: GetResource('S150408212924417', '委案日期'), sort: true, minWidth: 120, hide: true },
        { field: 'case_remark', title: GetResource('S140905200748375', '案件备注'), sort: true, minwidth: 100, hide: true },
        { field: 'apply_tags', title: GetResource('S160803103154175', '专利标签'), sort: true, minWidth: 100, hide: true }
    ]];
    Ajax.LoadLayuiTable(LimitMonitorList, "CaseList_returnfee", 'CFInvoice.ashx', LimitMonitorList.CaseCols, _data, function (data) {
        $("div.layui-form-checkbox").css("margin-top", "5px");//使复选框居中
        var length = 0;
        if (data.TableRows) {
            length = data.TableRows.length;
            for (var i = 0; i < length; i++) {
                var row = data.TableRows[i];
                var tr = $("#CaseList_returnfee").next().find(".layui-table-main tr[data-index=" + i + "]");
                tr.attr("id", row.return_fee_id);
            }
        }
    });




}


//费用异常更新
Limit.AddUpdateFeeinfo = function () {

    var return_fee_ids = LimitMonitorList.table.getCheckColumnData("CaseList_returnfee", 'return_fee_id');

    if (return_fee_ids != "") {
        function Success(data) {

            if (data.ClientInfo.Result) {
                Box.Alert(GRESX.HINTS.TITLE, data.cuss + "成功." + data.fail+"个失败", null, { icon: 'succ.gif', width: '350', height: '60' });
                Limit.ReturnFeeSeach()
            }
            else {
                Box.Alert(GRESX.HINTS.TITLE, "更新失败", null, { icon: 'hits.gif', width: '350', height: '60' });
            }
        }
        Ajax.Request('CFInvoice.ashx', { Call: 'AddUpdateFeeinfo', return_fee_id: return_fee_ids }, Success, true);

    }
    else {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170327180506700', '请选择需要更新的费用选项'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;

    }
}

//标记已处理
Limit.ChangeFeeinfo = function () {

    var return_fee_ids = LimitMonitorList.table.getCheckColumnData("CaseList_returnfee", 'return_fee_id');

    if (return_fee_ids != "") {
        function Success(data) {

            if (data.ClientInfo.Result) {
                Box.Alert(GRESX.HINTS.TITLE, data.cuss + "成功." + data.fail + "个失败", null, { icon: 'succ.gif', width: '350', height: '60' });
                Limit.ReturnFeeSeach()
            }
            else {
                Box.Alert(GRESX.HINTS.TITLE, "更新失败", null, { icon: 'hits.gif', width: '350', height: '60' });
            }
        }
        Ajax.Request('CFInvoice.ashx', { Call: 'ChangeFeeinfo', return_fee_id: return_fee_ids }, Success, true);

    }
    else {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170327180506700', '请选择需要处理的费用选项'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;

    }
}



Limit.AppFeeSeach = function () {
    var _data = {};
    _data.Call = 'GetLimitAppFeeList';
    _data.case_volume = $("#case_volume_appfee").val();
    _data.is_fuzzy_query_case_volume = $("#is_fuzzy_query_case_volume_appfee")[0].checked ? true : false;
    _data.is_fuzzy_query_app_no = $("#is_fuzzy_query_app_no_appfee")[0].checked ? true : false;
    _data.is_point_app_no_returnfee = $("#is_point_app_no_appfee")[0].checked ? true : false;
    _data.app_no = $("#app_no_appfee").val();
    _data.fawenrq_start = $("#fawenrq_start").val();
    _data.fawenrq_end = $("#fawenrq_end").val();
    _data.app_fee_status = $("#app_fee_status").val();
    let is_first1 = this.is_first;
    LimitMonitorList.CaseCols = [[
        { type: 'numbers', fixed: 'left' },
        { type: 'checkbox' },
        {
            field: 'case_volume', title: GetResource('S140901115304706', '我方文号'), minWidth: 120, style: 'color:#407AA8', sort: true, templet: function (row) {
                return PublicStrucCaseName(row.case_id, row.case_volume, row.case_name, row.case_type_id);
            }
        },
        { field: 'fawenrq', title: GetResource('S170329170319323', '发文日期'), sort: true, minWidth: 100 },
        { field: 'app_no', title: GetResource('S140822170832920', '申请号'), sort: true, minWidth: 100 },
        { field: 'file_name', title: GetResource('S141211221229060', '文件名称'), sort: true, minWidth: 150 },
        { field: 'dept_name', title: GetResource('S140819090646893', '部门名称'), sort: true, minWidth: 100 },
        { field: 'is_FJ', title: GetResource('S151217170826863', '是否费减'), sort: true, minWidth: 110 },
        {
            field: 'InnerSQ', title: GetResource('S180620193328965', '系统申请费'), sort: true, minWidth: 110, templet: function (row) {
                let html = `<span style='color:red'>` + row.InnerSQ + `</span>`;
                if (row.InnerSQ != row.OfficeSQ)
                    return html
                return row.InnerSQ
            }
        },
        {
            field: 'OfficeSQ', title: GetResource('S180620193328965', '官方申请费'), sort: true, minWidth: 110, templet: function (row) {
                let html = `<span style='color:red'>` + row.OfficeSQ + `</span>`;
                if (row.InnerSQ != row.OfficeSQ)
                    return html
                return row.OfficeSQ
            }
        },
        {
            field: 'InnerQY', title: GetResource('S230719151832452', '系统权利要求附加费'), sort: true, minWidth: 155, templet: function (row) {
                let html = `<span style='color:red'>` + row.InnerQY + `</span>`;
                if (row.InnerQY != row.OfficeQY)
                    return html
                return row.InnerQY
            }
        },
        {
            field: 'OfficeQY', title: GetResource('S230719151850798', '官方权利要求附加费'), sort: true, minWidth: 155
            , templet: function (row) {
                let html = `<span style='color:red'>` + row.OfficeQY + `</span>`;
                if (row.InnerQY != row.OfficeQY)
                    return html
                return row.OfficeQY
            }
        },
        {
            field: 'InnerSF', title: GetResource('S230719151947680', '系统说明书附加费'), sort: true, minWidth: 150, templet: function (row) {
                let html = `<span style='color:red'>` + row.InnerSF + `</span>`;
                if (row.InnerSF != row.OfficeSF)
                    return html
                return row.InnerSF
            }
        },
        {
            field: 'OfficeSF', title: GetResource('S230719152014047', '官方说明书附加费'), sort: true, minWidth: 150, templet: function (row) {
                let html = `<span style='color:red'>` + row.OfficeSF + `</span>`;
                if (row.InnerSF != row.OfficeSF)
                    return html
                return row.OfficeSF
            }
        },
        {
            field: 'InnerYY', title: GetResource('S230719152102556', '系统优先权要求费'), sort: true, minWidth: 150, templet: function (row) {
                let html = `<span style='color:red'>` + row.InnerYY + `</span>`;
                if (row.InnerYY != row.OfficeYY)
                    return html
                return row.InnerYY
            }
        },
        {
            field: 'OfficeYY', title: GetResource('S230719152112020', '官方优先权要求费'), sort: true, minWidth: 150, templet: function (row) {
                let html = `<span style='color:red'>` + row.OfficeYY + `</span>`;
                if (row.InnerYY != row.OfficeYY)
                    return html
                return row.OfficeYY
            }
        },
        {
            field: 'InnerSS', title: GetResource('S230719152147981', '系统实质审查费'), sort: true, minWidth: 150, templet: function (row) {
                let html = `<span style='color:red'>` + row.InnerSS + `</span>`;
                if (row.InnerSS != row.OfficeSS)
                    return html
                return row.InnerSS
            }
        },
        {
            field: 'OfficeSS', title: GetResource('S230719152156172', '官方实质审查费'), sort: true, minWidth: 150, templet: function (row) {
                let html = `<span style='color:red'>` + row.OfficeSS + `</span>`;
                if (row.InnerSS != row.OfficeSS)
                    return html
                return row.OfficeSS
            }
        },
        {
            field: 'InnerFee', title: GetResource('S230803152346166', '系统总费用'), sort: true, minWidth: 120, templet: function (row) {
                let html = `<span style='color:red'>` + row.InnerFee + `</span>`;
                if (row.InnerSQ != row.officefee)
                    return html
                return row.InnerFee
            }
        },
        {
            field: 'officefee', title: GetResource('S230803152434143', '官方总费用'), sort: true, minWidth: 120, templet: function (row) {
                let html = `<span style='color:red'>` + row.officefee + `</span>`;
                if (row.InnerFee != row.officefee)
                    return html
                return row.officefee
            }
        }
    ]];
    Ajax.LoadLayuiTable(LimitMonitorList, "CaseList_appfee", 'CFInvoice.ashx', LimitMonitorList.CaseCols, _data, function (data) {
        if (data && data.TableRowsCount)
            $("#liAppfee a span").text("申请费异常列表(" + data.TableRowsCount + ")")
        if (is_first1 && data && data.TableRowsCount && data.TableRowsCount>0 ) {
            $("#liAppfee").show();
        }
    });
}
Limit.changeAppFeeStatus = function () {
    var oa_ids = LimitMonitorList.table.getCheckColumnData("CaseList_appfee", 'oa_id');

    if (!oa_ids) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S170327180506700', '请选择需要标记的费用选项'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;

    }
    Ajax.Request('CFInvoice.ashx', { Call: 'UpadteAppFeeStatus', id: oa_ids }, function () {
        Limit.AppFeeSeach();
    });
}
Limit.AppFeeExport = function () {
    var ajax_config = {}; //ajax配置信息
    ajax_config.open_url = "IhgAdvExport.aspx";
    ajax_config.belong_key = "LimitMonitor";
    ajax_config.height = 250;
    ajax_config.width = 850;
    ajax_config.handler = "CFInvoice.ashx";
    ajax_config.Call = "GetLimitAppFeeListExprot";
    var param = {};
    param.case_volume = $("#case_volume_appfee").val();
    param.is_fuzzy_query_case_volume = $("#is_fuzzy_query_case_volume_appfee")[0].checked ? true : false;
    param.is_fuzzy_query_app_no = $("#is_fuzzy_query_app_no_appfee")[0].checked ? true : false;
    param.is_point_app_no_returnfee = $("#is_point_app_no_appfee")[0].checked ? true : false;
    param.app_no = $("#app_no_appfee").val();
    param.fawenrq_start = $("#fawenrq_start").val();
    param.fawenrq_end = $("#fawenrq_end").val();
    param.app_fee_status = $("#app_fee_status").val();
    var obj_columns = [];
    var columns1 = [];//案件信息

    columns1.push({ value: "case_volume", text: GetResource('S140901115304706', '我方文号') });
    columns1.push({ value: 'fawenrq', text: GetResource('S170329170319323', '发文日期') });
    columns1.push({ value: 'app_no', text: GetResource('S140822170832920', '申请号') });
    columns1.push({ value: 'file_name', text: GetResource('S141211221229060', '文件名称') });
    columns1.push({ value: 'dept_name', text: GetResource('S140819090646893', '部门名称') });
    columns1.push({ value: 'is_FJ', text: GetResource('S151217170826863', '是否费减') });
    columns1.push({ value: 'InnerSQ', text: GetResource('S180620193328965', '系统申请费') });
    columns1.push({ value: 'OfficeSQ', text: GetResource('S180620193328965', '官方申请费') });
    columns1.push({ value: 'InnerQY', text: GetResource('S230719151832452', '系统权利要求附加费')});
    columns1.push({ value: 'OfficeQY', text: GetResource('S230719151850798', '官方权利要求附加费')})
    columns1.push({ value: 'InnerSF', text: GetResource('S230719151947680', '系统说明书附加费') })
    columns1.push({ value: 'OfficeSF', text: GetResource('S230719152014047', '官方说明书附加费') })
    columns1.push({ value: 'InnerYY', text: GetResource('S230719152102556', '系统优先权要求费') })
    columns1.push({ value: 'OfficeYY', text: GetResource('S230719152112020', '官方优先权要求费') })
    columns1.push({ value: 'InnerSS', text: GetResource('S230719152147981', '系统实质审查费') })
    columns1.push({ value: 'OfficeSS', text: GetResource('S230719152156172', '官方实质审查费') })
    columns1.push({ value: 'InnerFee', text: GetResource('S230719152147981', '系统通知书费') })
    columns1.push({ value: 'officefee', text: GetResource('S230719152156172', '官方通知书费') })


    obj_columns.push({ group: GetResource('S140923212003271', '信息'), data: columns1 });

    Export(ajax_config, param, obj_columns);
}
Limit.AddDate = function (days) {
    var today = new Date();
    var start = new Date(today.getTime() + days * 24 * 3600 * 1000);
    var end = new Date(today.getTime());
    var year = start.getFullYear();
    var month = start.getMonth() + 1;
    var date = start.getDate();
    var dateStr = year + "-" + month + "-" + date;
    return dateStr;
}


Limit.isSecrecyhide = function (row) {
    var name = row.case_name;
    if (Limit.isSecrecy) {
        if (row.isSecrecy == "1") {
            name = row.case_name;
        }
        else {
            name = "***";
        }
    }
    return name;
    
}

Limit.btnUpdateProcRemark = function () {
    //批量增加处理事项备注
    var _type = "";
    $(".tbcontent").each(function () {
        if ($(this).css('display') == 'block') {
            _type = this.id;
            return;
        }
    });
    var table_id = "";
    switch (_type) {
        case 'all':
            table_id = "CaseList_all";
            break;
        case 'pay':
            table_id = "CaseList_pay";
            break;
        case 'suspend':
            table_id = "CaseList_suspend";
            break;
        case 'abandon':
            table_id = "CaseList_abandon";
            break;
        case 'recall':
            table_id = "CaseList_recall";
            break;
        case 'priority':
            table_id = "CaseList_priority";
            break;
        case 'fee':
            table_id = "CaseList_fee";
            break;
        case 'flow':
            table_id = "CaseList_flow";
            break;
    }
    var proc_ids = LimitMonitorList.table.getCheckColumnData(table_id, 'proc_id');

    function fn(obj) {
        var proc_note = $(obj).val();
        function Success(_Meta) {
            if (_Meta.ClientInfo.Result) {
                Box.Tips(GRESX.HINTS.TITLE, 1, GetResource('S140812201746197', '数据保存成功'), null, { icon: 'succ.gif', width: '250', height: '60' });
                Limit.SearchList();
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "BatchAddProcNoces", proc_ids: proc_ids, proc_note: proc_note }, Success);
    }
    if (!proc_ids) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S180907141159386', '请先勾选需要添加处理事项备注的选项!'), null, { icon: 'hits.gif', width: '250', height: '60' });
        return;
    }
    //输入框
    var html = '<div style="padding-top:5px;"></div>'
    html += "<div style='padding-top:5px;'><textarea class='textarea' rows='4' cols='6' id='proc_note' style='width:220px;'></textarea></div>";
    $.dialog({
        title: GetResource('S200723141547164', '添加处理事项备注'),
        content: html, lock: true, width: 300, height: 60,
        min: false, resize: true, max: false,
        focus: true, id: 'printtrade'
        , button: [
            {
                name: Boxsetting.yes, callback: function () {
                    return fn && fn.call(this, input);

                }, focus: true
            },
            {
                name: Boxsetting.no, callback: null, focus: false
            }
        ]
        , init: function () {
            input = this.DOM.content[0].getElementsByTagName('textarea')[0];

            input.focus();


        }
    });
}



Limit.GetFieldColName = function (column_id) {
    var colname = "";

    for (var i = 0; i < Limit.fieldColumn.length; i++) {
       var  item = Limit.fieldColumn[i];
        if (item.column_id == column_id) {
            colname = item.column_name
        } 
    }
   
   
    return colname;
}