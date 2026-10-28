var QueryHistory = {}
QueryHistory.QueryType = null;
QueryHistory.TableIdName = null;
QueryHistory.ShowGt = 5;
QueryHistory.ShowLt = 23;


/**
 * 初始化
 * @param {} query_type  查询类型
 * @param {} table_id_name 查询条件的Table Id 名
 * @param {} table_show_gt 收缩进阶条件的gt
 * @param {} table_show_lt 收缩进阶条件的lt
 * @returns {} 
 */
QueryHistory.InitPage = function (query_type, table_id_name, table_show_gt, table_show_lt) {
    QueryHistory.QueryType = query_type;
    QueryHistory.TableIdName = table_id_name;
    if (table_show_gt) {
        QueryHistory.ShowGt = table_show_gt;
    }
    if (table_show_lt) {
        QueryHistory.ShowLt = table_show_lt;
    }
    QueryHistory.Refresh(false);
    QueryHistory.bind();
}

/**
 * 历史查询绑定事件
 * @returns {} 
 */
QueryHistory.bind = function () {

    $("#history_query").bind("change", function () {
        QueryHistory.MoreQueryInitShow();
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
}

QueryHistory.MoreQueryInitShow = function () {
    $('#' + QueryHistory.TableIdName).find('tr:gt('+ QueryHistory.ShowGt +'):lt('+ QueryHistory.ShowLt +')').show('slow');
    $('#' + QueryHistory.TableIdName).find('tr:gt('+ QueryHistory.ShowGt +'):lt('+ QueryHistory.ShowLt +')').find("input[type='text'],select").val('').attr("objid", '').removeAttr("disabled");
    $('#' + QueryHistory.TableIdName).find('tr:gt('+ QueryHistory.ShowGt +'):lt('+ QueryHistory.ShowLt +')').find("input[type='checkbox']").attr("checked", false);
}

//刷新查询历史
/**
 * @param {} is_load bool是否加载
 * @param {} query_type 查询类型
 * @returns {} 
 */
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

        var $_table = $('#' + QueryHistory.TableIdName);
        $_table.find('input[type=text],select,textarea').val('').attr("objid", "");
        $_table.find('input[type=checkbox]').attr("checked", false);
        $_table.find('input[type=checkbox]').removeAttr("value");
        $_table.find('input[type=checkbox]').removeAttr("objid");
        if (_Meta.QueryXml != null && _Meta.QueryXml.length == 1) {
            QueryHistory.cur_query_id = cur_query_history;
            QueryHistory.cur_out_xml = _Meta.QueryXml[0].out_xml;
            if (is_load && cur_query_history != '') {
                var file_temp = "";
                var cur_xml = _Meta.QueryXml[0].query_xml;
                $_table.find('input[type=text],select,textarea,input[type=checkbox]').each(function () {
                    var find_obj = $($.parseXML(cur_xml)).find('xmlRoot > ' + this.id)[0];
                    var find_obj_text = $($.parseXML(cur_xml)).find('xmlRoot > ' + this.id + '_text')[0];
                    if (find_obj && find_obj.textContent != '') {
                        var type = this.attributes["data_type"];
                        //文件查询
                        if (this.id == "filetemp") {
                            file_temp = "filetemp";
                        }

                        if (type && type.value == 'object') {
                            if (QueryHistory.QueryType == "FeeSearch" && this.id == "customer_id") {
                                FeeSearch.SelectCustId = safeParseJson(find_obj.textContent);
                                FeeSearch.SelectCustInfo = safeParseJson(find_obj_text.textContent);
                                $(this).val(safeParseJson(find_obj_text.textContent).map(item => item.text).join(';'));
                            }
                            else {
                                this.attributes["objid"].value = find_obj.textContent;
                                if (find_obj_text)
                                    $(this).val(find_obj_text.textContent);
                            }
                           
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
                if (file_temp.length > 0) {
                    $("#filetemp").trigger("change");
                }

                if ($("#is_proc")[0]) {
                    if (_Meta.QueryXml[0].is_proc == "1" && !$("#is_proc")[0].checked) {
                        $("#is_proc")[0].checked = true;
                        $("#tr_proc").nextAll().show();
                    }
                    else if (_Meta.QueryXml[0].is_proc == "0" && $("#is_proc")[0].checked) {
                        $("#is_proc")[0].checked = false;
                        $("#tr_proc").nextAll().hide();
                    }
                }
                
            }
        }
    }
    Ajax.Request('CaseInfo.ashx', { Call: 'SearchQueryHisList', query_type: QueryHistory.QueryType, query_id: cur_query_history }, Success, true);
}

function safeParseJson(str) {
    var s = (str || "").trim();
    // 只有以 { 或 [ 开头，才当 JSON 解析
    if (s.charAt(0) === "{" || s.charAt(0) === "[") {
        return JSON.parse(s);
    }
    // 否则当成普通文本返回
    return s;
}

/**
 * 通过Table Id 获取相关查询条件并保存
 * @returns {} 
 */
QueryHistory.SaveQueryCondition = function () {
    //获取元素，用于保存查询条件
    var Elements = '';
    $('#' + QueryHistory.TableIdName).find('input,select,textarea').each(function () {
        var type = this.attributes["data_type"];
        if (type && type.value == 'object') {
            if (QueryHistory.QueryType == "FeeSearch") {
                if (this.id == "customer_id") {
                    Elements += "&lt;" + this.id + "&gt;" + JSON.stringify(FeeSearch.SelectCustId) + "&lt;/" + this.id + "&gt;";
                    Elements += "&lt;" + this.id + "_text" + "&gt;" + JSON.stringify(FeeSearch.SelectCustInfo) + "&lt;/" + this.id + "_text" + "&gt;";
                }
                else {
                    Elements += "&lt;" + this.id + "&gt;" + this.attributes["objid"].value + "&lt;/" + this.id + "&gt;";
                    Elements += "&lt;" + this.id + "_text" + "&gt;" + $(this).val() + "&lt;/" + this.id + "_text" + "&gt;";
                }
            }
            else {
                Elements += "&lt;" + this.id + "&gt;" + this.attributes["objid"].value + "&lt;/" + this.id + "&gt;";
                Elements += "&lt;" + this.id + "_text" + "&gt;" + $(this).val() + "&lt;/" + this.id + "_text" + "&gt;";
            }
           
        } else {
            type = this.attributes["type"];
            if (type && (type.value == 'radio' || type.value == 'checkbox')) {
                if (this.checked) {
                    Elements += "&lt;" + this.id + "&gt;" + this.value + "&lt;/" + this.id + "&gt;";
                }
            } else {
                var $_self = $(this);
                Elements += "&lt;" + this.id + "&gt;" + $_self.val() + "&lt;/" + this.id + "&gt;";
            }
        }
    });
    QueryHistory.Save(Elements, "");
}
/**
 * 保存查询条件
 * @param {} query_xml 保存查询条件构成的XML
 * @param {} out_xml  保存导出的栏位构成的XML
 * @param {} query_type 查询类型
 * @returns {} 
 */
QueryHistory.Save = function (query_xml, out_xml) {

    var is_proc = false;
    if ($("#is_proc")[0]) {
        var is_proc = $("#is_proc")[0].checked ? true : false;
    }
    var is_out_save = false;
    if ($("#is_out_save")[0]) {
        is_out_save = $("#is_out_save")[0].checked ? "true" : "false";
    }
    var is_query_save = false;
    if ($("#is_query_save")[0]) {
        is_query_save = $("#is_query_save")[0].checked ? "true" : "false";
    }    
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
        query_save_title: query_save_title, query_id: query_id, query_xml: query_xml, out_xml: out_xml, query_type: QueryHistory.QueryType
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