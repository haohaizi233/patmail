


var JClient = {};
JClient.UI = {};
JClient.Object = {};

// 固定几个页面不需要加载的转圈
JClient.WithoutLoading = [
    "/Ai/MailLayout.aspx",
    "/Ai/Agent/"
]

//Loading...." + GetResource('S140808090901468', '请稍等') + "....
JClient.InitLoading = function () {
    var loading = $("<div class='jclient-ui-loading' style='display:none;'>&nbsp;&nbsp;</div>");
    if ($('div.jclient-ui-loading').length == 0) {
        $("body").append(loading);

    }
    var timer;
    var self = this;

    var loadThreadCount = 0;
    var endLoading = function () {
        if (self.timer) {
            clearTimeout(self.timer);
            self.timer = null;
        }
        $(this).hide();
        //        loadThreadCount--;
        //        if (loadThreadCount <= 0) {           
        //            $(this).hide();
        //        }
    }
    var startLoading = function () {
        if (shouldSkipLoading()) {
            // 部分页面不显示加载动画
            return;
        }

        if (!self.timer) {
            var ld = $(this);
            self.timer = setTimeout(function () {
                if (ld.css("display") == "none") {
                    var left = (document.documentElement.clientWidth - ld.outerWidth()) / 2;
                    if (left <= 0)
                        left = 250;
                    var top = (document.documentElement.clientHeight - ld.outerHeight()) / 2;
                    if (top <= 0)
                        top = 300;
                    ld.css("left", left);
                    ld.css("top", top);
                    ld.show();
                }
                //loadThreadCount++;

            }, 200);
        }
       // self.PopupColDialog();
    }
    //loading.ajaxSuccess(endLoading);
    loading.ajaxStop(endLoading);
    loading.ajaxError(endLoading);
    //loading.ajaxComplete(endLoading);
    loading.ajaxStart(startLoading);
}

function shouldSkipLoading() {
    return JClient.WithoutLoading.some(function (item) {
        return location.href.includes(item);
    });
}

$(function () {

    JClient.InitLoading();
});
// Loading....>>||

JClient.UI.Sheet = function (divId) {
    this.Id = divId;
    this.Panel = $("#" + divId);
    if (divId == "TradeMarkList_mch") { //判断是否为商标冲突检索
        Table_Page_PageSize = "<select style='height:25px; width:80px;'><option value='10'>10</option><option value='50'>50</option></option></select>";
    }
    this.Handler = this.Panel.attr("handler");
    JClient.Object[this.Panel.attr("id")] = this;
    this.AllowSelect = this.Panel.attr("allowselect");
    //this.SelectAll = this.Panel.attr("selectall");
    this.SelectClick = this.Panel.attr("boxchange");
    this.AllowPaging = this.Panel.attr("allowpaging");
    this.PK = this.Panel.attr("pk");
    this.PKNAME = this.Panel.attr("pkname");
    this.PKID = this.Panel.attr("pkid");
    this.css = this.Panel.attr("css");
    var search_bar = this.Panel.attr("showsearchbar");
    if (search_bar) {
        this.ShowSearchBar = search_bar == "true" ? "true" : GetResource(this.Panel.attr("slid"), search_bar);
    }
    this.SearchKey = "";
    this.AutoRowNum = this.Panel.attr("rownum");
    this.UpdateCall = this.Panel.attr("update");
    this.DelCall = this.Panel.attr("delete");
    this.RowCounts = 0; //返回的数据总数
    if (this.Panel.attr("rowselect")) {
        this.RowSelect = eval(this.Panel.attr("rowselect"));
    }
    if (this.ShowSearchBar) {
        this.SearchBar = this.defaultSearchBar();
        this.SearchBar.appendTo(this.Panel);
    }

    if (this.Panel.attr("btnnew")) {
        var btntext = "";
        var btntextobj = null;
        if (this.Panel.attr("btntext")) {
            btntext = this.Panel.attr("btntext");
            btntext = GetResource(this.Panel.attr("btntextlid"), btntext);
            if (btntext.split('|').length > 0) {
                btntextobj = btntext.split('|');
            }
        }
        if (btntextobj) {
            for (var i = 0; i < btntextobj.length; i++) {
                this.BtnNew = this.defaultBtnNew(btntextobj[i]);
                this.BtnNew.bind("click", eval(this.Panel.attr("btnnew").split('|')[i]))
                this.SearchBar.append(this.BtnNew);
            }

        }
        else {

            this.BtnNew = this.defaultBtnNew(btntext);
            this.BtnNew.bind("click", eval(this.Panel.attr("btnnew")))
            if (this.ShowSearchBar) {
                this.SearchBar.append(this.BtnNew);
            }
            else {
                var div = $("<div class='searchtxt'></div>");
                div.append(this.BtnNew);
                div.appendTo(this.Panel);
            }
        }
    }

    // 自定义a标签，样式依赖class ，默认查询传 btn-search 就是 defaultBtnNew的逻辑
    //示例 btns='[{"text":"","title":"复制","event":"AgencyFeeConfig.ToolbarCopyRule","class":"tbcopy"}]
    if (this.Panel.attr("btns")) {
        var btns = JSON.parse(this.Panel.attr("btns"));
        for (var i = 0; i < btns.length; i++) {
            // this.btn = this.defaultBtnNew(btns[i].text);
            if (!btns[i].class) btns[i].class = 'btn-search';
            this.btn = $("<a class="+btns[i].class+" href='javascript:void(0)' style='margin-left: 5px;color:#fff;'>" + btns[i].text + "</a>");
            this.btn.bind("click", eval(btns[i].event));
            if (btns[i].title) {
            this.btn.attr("title", btns[i].title);
            }
            if (btns[i].lid) {
            this.btn.attr("lid", btns[i].lid);
            }
            var className = btns[i].class;
            if (!className) className = 'searchtxt';
            if (this.ShowSearchBar) {
                this.SearchBar.append(this.btn);
            } else {
                var div = $("<div class='" + className + "'></div>");
                div.append(this.btn);
                div.appendTo(this.Panel);
            }
        }
    }

    if (this.css == undefined || this.css == "")
        this.css = "taskShow_title";
    if (this.PK == undefined || this.PK == "")
        this.PK = "id";

    this.Cols = this.Panel.find("div[type='Cols']");
    this.SheetCols = [];
    //alert(this.Cols.children().length);
    var self = this;
    this.Cols.children().each(function (i) {
        var c = $(this);
        self.SheetCols.push(new JClient.UI.SheetCol(c, self));
    });

    this.ColumnsCount = this.SheetCols.length;
    if (this.AllowSelect == "true") {
        this.ColumnsCount = this.SheetCols.length + 1;
        this.BoxClick = eval(this.Panel.attr('boxclick'));
    }
    if (this.AutoRowNum == "true") {
        this.ColumnsCount = this.ColumnsCount + 1;
    }
    this.SelectTr = null;
    this.DataEmptyRow = null;
    this.DataAddNewRow = null;
    this.SelectCbx = null;
    //自定义列
    this.CustCol = this.Panel.attr("custCol") || "";
    this.CustCol = this.CustCol.toLowerCase() != 'false';
    // this.CustCol = this.Panel.attr("custCol");

   ////获取选中的列
   // var elemts = [];
   // for (var i = 0; i < this.SheetCols.length; i++) {
   //     var icos=this.SheetCols[i];
   //     if(icos.ColSel==false){
   //         elemts.push(icos.Key);
   //     }

   // }
   

    this.DataTable = this.defaultMyTable();
   //绑定特有的属性
    //this.elemts = this.Panel.attr("elemts");
    this.DataTable.appendTo(this.Panel);
    this.drag = this.Panel.attr("drag");

    if (this.drag) {
        var fn = this.Panel.attr("dragfn");
        if (fn) { fn = eval(fn) } else { fn = null; }
        this.DataTable.colResizable({
            liveDrag: true,
            gripInnerHtml: "<hr size=28  class='line' color=\"#999999\">",// "<div class='grip'></div>",
            draggingClass: "dragging",
            defaultMinWidth: 40, //默认没列最小宽度
            onResize: fn
        });
    }

    this.SheetPage = new JClient.UI.SheetPage(self);
    if (this.Panel.attr("pageSize") != undefined && this.Panel.attr("pageSize") != "")
        this.SheetPage.PageSize = this.Panel.attr("pageSize");

    this.Page = $("<tfoot><tr  ><td colspan='" + this.ColumnsCount + "'></td></tr></tfoot>").appendTo(this.DataTable);
    this.SheetPage.init(this.Page.find("td:first"));
}

JClient.UI.Sheet.prototype.hide = function () {
    this.Panel.hide();
}

JClient.UI.Sheet.prototype.show = function () {
    this.Panel.show();
}


JClient.UI.Sheet.prototype.Search = function (params) {
    
    if (params != null && params != undefined) {
        this.SheetPage.SearchCloumns = {}; //清空原来的参数
        this.SheetPage.PageIndex = 1;
        for (var key in params) {
            this.SheetPage.SearchCloumns[key] = params[key];
        }
    }

    this.loadMySheetData();
}


///取数据
JClient.UI.Sheet.prototype.loadMySheetData = function () {

    var self = this;
    var data = this.SheetPage.getSearchPrams();
    this.AllCols = this.AllCols || this.getDefaultAllCols();
    var newTheadCols = this.getNewHeaderCols();
    var colsel = ";";
    for (var i = 0; i < newTheadCols.length; i++) {
        colsel += newTheadCols[i].name+";";
    }
    data.colsel = colsel;

    // 通过接口获取数据
    if (data && data.CallType && data.CallType == "API") {
        Ajax.ApiRequest(data.Call, data, Success);
    } else if (data && data.CallType && data.CallType == "DockingAPI") {
        Ajax.Request(self.Handler, data, SuccessAPI);
    } else if (data && data.CallType && data.CallType == "APICALLBACK") {
        Ajax.ApiRequest(data.Call, data, Success, data.sync, data.CallBack);
    } else {
        Ajax.Request(self.Handler, data, Success);
    }


    function Success(_RMeta) {
        try {
            if (self.CustCol) {
                self.rebuildTableBySelectedCols(_RMeta);
            } else {
                self.structMySheetData(_RMeta);
                self.LoadDataFinished(_RMeta);
            }

        } catch (e) { console.error(e); }
    }
    //代企对接API返回数据修改
    function SuccessAPI(_RMeta) {
        try {
            var resultAPI = JSON.parse(_RMeta.Docking);
            if (self.CustCol) {
                self.rebuildTableBySelectedCols(resultAPI);
            } else {
                self.structMySheetData(resultAPI);
                self.LoadDataFinished(resultAPI);
            }

        } catch (e) { console.error(e); }
    }

    //    $.ajax({
    //        url: self.Handler,
    //        data: data,
    //        type: 'POST',
    //        dataType: 'json',
    //        success: function (_RMeta) {
    //            try {
    //                self.structMySheetData(_RMeta);
    //                self.LoadDataFinished(_RMeta);

    //            } catch (e) { }
    //        },
    //        fail: function () {

    //        }
    //    });
}

JClient.UI.Sheet.prototype.LoadDataFinished = function (data) {


}

JClient.UI.Sheet.prototype.NoData = function () {

}

JClient.UI.Sheet.prototype.CheckColumns = function () {
    return false;
}

///显示数据
JClient.UI.Sheet.prototype.structMySheetData = function (_RMeta) {
    var tbody = this.DataTable.find(">tbody");

    if (this.SelectCbx != null) {
        this.SelectCbx.attr("checked", false);
    }

    tbody.find(">tr").remove();
    var rows = _RMeta.TableRows;
    this.SheetPage.CurPageRows = rows;
    if (this.AllowPaging != "false") {
        this.SheetPage.MaxCount = _RMeta.TableRowsCount;
    }
    else {/*如果不分页,记录一个行数*/
        this.SheetPage.MaxCount = rows ? rows.length : 0;
    }
    this.RowCounts = _RMeta.TableRowsCount;
    if (rows != null) {

        for (var i = 0; i < rows.length; i++) {
            var d = rows[i];
            var tr = $("<tr>").addClass("tb").appendTo(tbody);
            var id = "";
            var _pk_name = "";
            var _pk_id = "";
            if (d[this.PK] != undefined)
                id = d[this.PK];
            tr.attr("id", id);
            tr.data("row", d);
            tr.data("Sheet", this);
            if (d[this.PKNAME] != undefined)
                _pk_name = d[this.PKNAME];
            if (d[this.PKID] != undefined)
                _pk_id = d[this.PKID];
            if (this.RowSelect) {
                var self = this;
                tr.bind("click", function () { self.SelectRow = this; self.RowSelect(this); });
            }
            if (this.AllowSelect == "true") {
                //var seltd = '';
                //if (this.SelectClick != null) {
                //    seltd = "<td style='text-align:center;width:20px;'><input type='checkbox' onchange=" + this.SelectClick(id) + " selectId='" + id + "' class='check' /></td>"
                //}
                //else {
                //    seltd = "<td style='text-align:center;width:20px;'><input type='checkbox' selectId='" + id + "' class='check' /></td>";
                //}
                var tdbox = $("<td style='text-align:center;width:20px;'><input type='checkbox' value='" + id + "'  selectId='" + id + "' selectName = '" + HTMLDecodeToEmpty(_pk_name) + "' selectPKId ='" + _pk_id + "' class='check' /></td>").appendTo(tr);
                if (this.BoxClick) {
                    var self = this;
                    tdbox.find('input').bind('change', function (event) { self.BoxClick(this); });
                }
            }
            if (this.AutoRowNum == "true") {

                $("<td class='td_30'>" + (i + 1) + "</td>").appendTo(tr);
            }

            for (var j = 0; j < this.SheetCols.length; j++) {
                var c = this.SheetCols[j];
                try {
                    var text = c.getText(d);
                    var error = false;
                    if (this.CheckColumns() == true) {
                        if (c.Edit == "true" && c.EditControl == "select") {
                            var controlName = c.EditControl;
                            var ctrl = c.Panel.find(controlName);
                            if (ctrl.length == 1) {
                                var len = ctrl.find("option[title='" + text + "']");
                                if (len.length == 0) {
                                    error = true;
                                }
                            }
                        }
                    }

                    var tdname = '';
                    if (c.TdName != undefined) {
                        tdname = " name='" + d[c.TdName] + "'";
                    }

                    var new_td = $("<td  " + c.Class + "  " + tdname + " colName='" + c.Key + "' ></td>").html(text).appendTo(tr);
                    if (error) {
                        new_td.addClass("col-td-dataerror");
                    }
                } catch (e) {
                    $("<td  " + c.Class + "  " + tdname + ">").html("").appendTo(tr);
                }
            }
        }
    }
    if (rows == undefined || rows.length == 0) {
        this.DataEmptyRow.show();

        tbody.append(this.DataEmptyRow);
        this.NoData();
        if (this.RowSelect) {
            this.SelectRow = null;
            this.RowSelect();
        }
    }
    else {
        if (this.AllowSelect == "true") {
            this.DataTable.find("thead>tr>td:first").show();
        }
        this.DataEmptyRow.hide();
        if (this.RowSelect) {
            this.DataTable.find(">tbody>tr:eq(0)").click();
        }
    }

    if (this.AllowPaging != "false") {
        this.SheetPage.pageRender();
        //tbody.append(this.Page);
        this.Page.insertAfter(tbody);
    }
}

JClient.UI.Sheet.prototype.defaultSearchBar = function () {
    var placeholder = this.ShowSearchBar ? (this.ShowSearchBar != "true" ? "placeholder='" + this.ShowSearchBar + "'" : "") : "";
    var bar_txt = $("<input id='" + this.Id + "_TxtSheetSearchKey' " + placeholder + " type='text'  class='input_search searchInput'  style='width: 220px; padding-left: 19px;' />");
    var bar_a = $("<a href='javascript:void(0)' class='btn-search' style='color:#fff;background-color:#2587E8;border-radius:30px;' >" + GetResource('S140808093939448', '查询') + "</a>");
    var self = this;
    bar_txt.bind("keypress", function (evt) {
        var ev = evt || window.event;
        if (ev.keyCode == 13) {
            self.SearchKey = $("#" + self.Id + "_TxtSheetSearchKey").val(); self.SheetPage.PageIndex = 1; self.loadMySheetData();
        }
    });
    bar_a.bind("click", function () { self.SearchKey = $("#" + self.Id + "_TxtSheetSearchKey").val(); self.SheetPage.PageIndex = 1; self.loadMySheetData(); });
    var bar = $("<div class='searchtxt'></div>");
    bar.append(bar_txt);
    bar.append(bar_a);
    return bar;
}

JClient.UI.Sheet.prototype.defaultBtnNew = function (_btntext) {
    if (!_btntext) {
        _btntext = GetResource('S140821210615724', '新增');
    }
    var btn = $("<a class='btn-search' href='javascript:void(0)' style='margin-left: 5px;color:#fff;'>" + _btntext + "</a>");
    return btn;
}


JClient.UI.Sheet.prototype.clearSearchKey = function () {
    if (this.ShowSearchBar) {
        $("#" + this.Id + "_TxtSheetSearchKey").val("");
        this.SearchKey = "";
    }
}

///重新排序
JClient.UI.Sheet.prototype.Reordering = function (Key, td) {
    var data = this.SheetPage.getSearchPrams();
    if (!data || !data.Call) {
        return;
    }
    $_td = $(td);
    var order_flag = $_td.attr('orderby');
    if (order_flag && order_flag.toUpperCase() == 'ASC') {
        order_flag = "DESC";
    }
    else {
        order_flag = "ASC";
    }
    this.SetOrdbyCss($_td, order_flag);
    $_td.attr('orderby', order_flag).siblings().attr('orderby', '');
    data["order_by"] = Key + "  " + order_flag;
    this.SheetPage.PageIndex = 1;
    this.loadMySheetData();

}


JClient.UI.Sheet.prototype.SetOrdbyCss = function (td, orderby) {
    var a = td.find('a');
    if (a.length > 0) {
        if (orderby == "DESC") {
            a.removeClass().addClass('sortdown');
        }
        else {
            a.removeClass().addClass('sortup');
        }
    }
    else {
        var a = $('<a href="javascript:void(0)"   class="sortup" style="text-decoration: none;"></a>');
        if (orderby == "DESC") {
            a.addClass('sortdown');
        }
        else {
            a.addClass('sortup');
        }
        a.appendTo(td);
    }
    td.siblings().find('a').removeClass();
}

//初使化Table
JClient.UI.Sheet.prototype.defaultMyTable = function () {
    

    var table = $("<table id='table_" + this.Id + "' class='" + this.css + "' ></table>");
    var th = $("<thead></thead>").appendTo(table);
    var tr = $("<tr></tr>");
    var self = this;
    this.DataTable = table;

    if (this.AllowSelect == "true") {
        var c_td = $("<td style='width:20px;'><input type='checkbox' /></td>").appendTo(tr);
        var $_box = c_td.find("input[type='checkbox']");
        self.SelectCbx = $_box;
        $_box.bind("change", function () {
            self.selectAll();
        });
        table.on("change", "input.check", function () {
            if (!this.checked && self.SelectCbx.get(0).checked) {
                self.SelectCbx.get(0).checked = false;
            }
        });
    }
    if (this.AutoRowNum == "true") {
        $("<td class='td_30'>" + GetResource('S140808093333235', '序号') + "</td>").appendTo(tr);
    }


    for (var i = 0; i < this.SheetCols.length; i++) {
        var td = $("<td  " + this.SheetCols[i].Class + "  colName='" + this.SheetCols[i].Key + "' ></td>");
        var td_text = this.SheetCols[i].Title;
        if (this.CustCol && this.SheetCols[i].ColSel) {
            continue;
        }
        if (this.SheetCols[i].OrderBy == 'true') {
            //注意这里是循环绑定匿名函数,使用一个包裹函数解决闭包产生的之引用问题
            (function (j) { td.bind('click', function () { self.Reordering(self.SheetCols[j].Key, this) }); })(i);
            td_text = "<span class='order_td'>" + td_text + "</span>";
        }
        td.html(td_text);
        td.appendTo(tr);
    }
    tr.appendTo(th);

    var tb = $("<tbody></tbody>");
    tr = $("<tr></tr>").appendTo(tb);
    var empty_td = $("<td colspan='" + this.ColumnsCount + "'></td>");
    empty_td.html(GetResource('S140823181820892', '无数据')).appendTo(tr);
    tb.appendTo(table);
    this.DataEmptyRow = tr;
    return table;
}

JClient.UI.Sheet.prototype.selectAll = function () {
    var tbody = this.DataTable.find("tbody");
    var check = this.SelectCbx.attr("checked");
    tbody.find("input.check").each(function () {
        // 当选择框为不可用时,全选不对其选择
        if (!this.disabled) {
            this.checked = check == "checked";
            $(this).trigger("change");
        }
    });
}

JClient.UI.Sheet.prototype.selectAllSec = function (check) {
    var tbody = this.DataTable.find("tbody");
    tbody.find("input.check").each(function () {
        $(this).attr("checked", check);
    });
}

//获取选择的主键value
JClient.UI.Sheet.prototype.getSelectedRows = function () {
    var tbody = this.DataTable.find("tbody");
    var arr = [];
    tbody.find("input.check").each(function () {
        if ($(this).attr("checked") == "checked" || $(this).attr("checked") == true) {
            var row = $(this).closest('tr').data('row');
            arr.push(row);
        }
    });
    return arr;
}


//获取选择的主键value
JClient.UI.Sheet.prototype.getSelectedIds = function () {
    var tbody = this.DataTable.find("tbody");
    var ids = "";
    tbody.find("input.check").each(function () {
        if ($(this).attr("checked") == "checked" || $(this).attr("checked") == true)
            ids += $(this).attr("selectId") + ';';
    });
    if (ids.length > 0) {
        ids = ids.substring(0, ids.length - 1);
    }
    return ids;
}
//获取选择的主键text
JClient.UI.Sheet.prototype.getSelectedNames = function () {
    var tbody = this.DataTable.find("tbody");
    var ids = "";
    tbody.find("input.check").each(function () {

        if ($(this).attr("checked") == "checked" || $(this).attr("checked") == true)
            ids += $(this).attr("selectName") + ';';
    });
    if (ids.length > 0) {
        ids = ids.substring(0, ids.length - 1);
    }
    return ids;
}

//获取选择的主键text
JClient.UI.Sheet.prototype.getSelectedPKId = function () {
    var tbody = this.DataTable.find("tbody");
    var ids = "";
    tbody.find("input.check").each(function () {

        if ($(this).attr("checked") == "checked" || $(this).attr("checked") == true)
            ids += $(this).attr("selectPKId") + ';';
    });
    if (ids.length > 0) {
        ids = ids.substring(0, ids.length - 1);
    }
    return ids;
}
//Add Start...
JClient.UI.Sheet.prototype.NeedToAddNewRow = function () {
    var DataNewRow = this.DataAddNewRow;

    if (this.DataEmptyRow != null)
        this.DataEmptyRow.hide();

    if (DataNewRow == null) {
        //        var tr = $("<tr data='addrow'></tr>").insertBefore(this.Page);
        //        tr.attr("id", "-1");

        //        if (this.AllowSelect == "true")
        //            $("<td></td>").appendTo(tr);
        //        for (var j = 0; j < this.SheetCols.length; j++) {
        //            var c = this.SheetCols[j];
        //            var td = $("<td></td>").appendTo(tr);

        //            c.AddFor(td);
        //        }

        var row = "<tr id ='NEW' data='addrow' >";
        if (this.AllowSelect == "true") {
            row += "<td></td>";
        }
        if (this.AutoRowNum == "true") {
            row += "<td class='td_30'>" + (this.SheetPage.MaxCount + 1).toString() + "</td>";
        }
        row = $(row).appendTo(this.DataTable.find("tbody")); // this.DataTable.find("tbody").append(row).find('tr:last'); //$(row).insertBefore(this.Page);
        for (var j = 0; j < this.SheetCols.length; j++) {
            var c = this.SheetCols[j];
            var td = $("<td " + this.SheetCols[j].Class + "></td>");
            c.AddFor(td);
            td.attr("colName", c.Key);
            //td.addClass(this.SheetCols[j].Class);
            row.append(td);
        }
        this.DataAddNewRow = row[0].outerHTML;
        return row;
    }
    else {
        var tbody = this.DataTable.find("tbody");
        var row = tbody.find("tr[data='addrow']")
        if (row.length == 0)
            //DataNewRow.insertBefore(this.Page);
            row = $(DataNewRow).appendTo(tbody); //tbody.append(DataNewRow);
        row.show();
        return row;
    }

    //return this.DataAddNewRow;
}

JClient.UI.Sheet.prototype.CancelAddRowFinish = function () {
    if (this.DataAddNewRow != null)
        this.DataAddNewRow.hide();
}

JClient.UI.Sheet.prototype.ApproveAddRowFinish = function () {
    var row = this.DataAddNewRow;
    var id = row.attr("id");
    var self = this;
    var data = {};
    data[this.PK] = id;
    data["_PK"] = this.PK;
    data["call"] = "addrow";

    var start = 0;
    if (this.AllowSelect == "true")
        start = 1;

    var colTds = [];

    row.children().each(function (i) {
        if (i < start)
            return;
        var td = $(this);
        var c = self.SheetCols[i - start];

        if (c.Type == "Col") {
            var value = c.getValue(td);
            var _key = "$u_" + c.Key;
            data[_key] = value;
            data[c.Key] = value;
        }
    });

    if (this.CheckValidates(data) == false)
        return;

    var returnValue = false;

    Ajax.Request(self.Handler, data, Success, false);

    function Success(_RMeta) {
        if (_RMeta.ClientInfo.Result) {
            returnValue = true;
            self.CancelAddRowFinish();
            self.loadMySheetData();
        }
        else {
            returnValue = false;
        }
    }

    //    $.ajax({
    //        url: self.Handler,
    //        data: data,
    //        type: 'POST',
    //        dataType: 'json',
    //        async: false,
    //        success: function (_RMeta) {
    //            if (_RMeta.ClientInfo.Status) {
    //                returnValue = true;
    //                self.CancelAddRowFinish();
    //                self.loadMySheetData();
    //            }
    //            else {
    //                returnValue = false;
    //            }
    //        },
    //        fail: function () {
    //            returnValue = false;
    //        }
    //    });

    return returnValue;
}
//Add End...

JClient.UI.Sheet.prototype.NeedToEditRow = function (obj) {
    var row = $(obj).closest("tr"); //.parent();
    var id = row.attr("id");
    var self = this;
    var start = 0;
    if (this.AllowSelect == "true" || self.AutoRowNum == "true")
        start = 1;
    start = this.AllowSelect == "true" && self.AutoRowNum == "true" ? 2 : start;

    row.children().each(function (i) {
        if (i < start)
            return;
        var td = $(this);
        var c = self.SheetCols[i - start];

        if (c.Edit == "true") {//c.Type == "Col" &&
            c.EditFor(td);
        }
    });
}

/*编辑的时候点击取消,回滚数据*/
JClient.UI.Sheet.prototype.CancelEditRow = function (obj) {
    var row = $(obj).closest("tr"); //.parent();
    var id = row.attr("id");
    if (id == 'NEW') {
        row.remove();
        var length = this.DataTable.find("tbody").find('tr').length;
        if (length == 1) {/*无数据时显示空行*/
            this.DataEmptyRow.show();
        }
        return;
    }
    var self = this;
    var start = 0;
    if (this.AllowSelect == "true" || self.AutoRowNum == "true")
        start = 1;
    start = this.AllowSelect == "true" && self.AutoRowNum == "true" ? 2 : start;

    row.children().each(function (i) {
        if (i < start)
            return;
        var td = $(this);
        var c = self.SheetCols[i - start];
        if (c.Edit == "true") {//c.Type == "Col" &&
            var value = td.attr('title');
            td.text(value);
        }
    });
}

JClient.UI.Sheet.prototype.CheckValidates = function (data) {
    return true;
}

JClient.UI.Sheet.prototype.ApproveEditRowFinish = function (obj) {
    var row = $(obj).closest('tr');  //parents("td:first").parent();
    var id = row.attr("id");
    var self = this;
    var data = {};
    data[this.PK] = id;
    data["_PK"] = this.PK;
    data["call"] = this.UpdateCall ? this.UpdateCall : "updaterow";
    if (arguments.length > 1) {/*接收一个自定义参数对象,方便用户扩展保存方法*/
        for (var column in arguments[1]) {
            data[column] = arguments[1][column];
        }
    }
    var content = "";
    var start = 0;
    if (this.AllowSelect == "true" || self.AutoRowNum == "true")
        start = 1;
    start = this.AllowSelect == "true" && self.AutoRowNum == "true" ? 2 : start;

    var colTds = [];
    var i_c = [];

    row.children().each(function (i) {
        if (i < start)
            return;
        var td = $(this);
        var c = self.SheetCols[i - start];

        if (c.Edit == "true") {//c.Type == "Col" &&
            var value = c.getValue(td);
            var _key = "$u_" + c.Key;
            data[_key] = value;
            data[c.Key] = value;
            colTds.push(td);
            i_c.push(c);
            try {
                if (value != td.attr("title")) {
                    content += c.Title + ": " + td.attr("title") + "->" + value + "; ";
                }
            } catch (e) { }
        }

    });

    data["Content"] = content;

    if (this.CheckValidates(data) == false)
        return;

    var returnValue = false;

    Ajax.Request(self.Handler, data, Success, true);

    function Success(_RMeta) {
        if (_RMeta.ClientInfo.Result) {
            returnValue = true;
            for (var x = 0; x < colTds.length; x++) {
                i_c[x].ApproveEditFinish(colTds[x]);
            }
            if (id == "NEW") {/*如果是新增的情况下,将后台返回的ID赋值给当前行的id*/
                row.attr('id', _RMeta.id);
                row.attr('data', null);
            }
            var td = row.find('td:last');
            td.find("[data='edit']").show();
            td.find("[data='ok']").hide();
            row.data("row", data);
        }
        else {
            returnValue = false;

            Box.Alert(GRESX.HINTS.TITLE, _RMeta.ClientInfo.Message, null, { icon: 'hits.gif', width: '250' });
        }
    }


    //    $.ajax({
    //        url: self.Handler,
    //        data: data,
    //        type: 'POST',
    //        dataType: 'json',
    //        async: false,
    //        success: function (_RMeta) {
    //            //alert(_RMeta);
    //            //debugger;
    //            if (_RMeta.ClientInfo.Status) {
    //                returnValue = true;
    //                for (var x = 0; x < colTds.length; x++) {
    //                    i_c[x].ApproveEditFinish(colTds[x]);
    //                }
    //            }
    //            else {
    //                returnValue = false;
    //            }
    //        },
    //        fail: function () {
    //            returnValue = false;
    //        }
    //    });

    return returnValue;
}

JClient.UI.Sheet.prototype.CancelEditRowFinish = function (obj) {
    var row = $(obj).parents("td:first").parent();
    var id = row.attr("id");
    var self = this;

    var start = 0;
    if (this.AllowSelect == "true")
        start = 1;

    row.children().each(function (i) {
        if (i < start)
            return;
        var td = $(this);
        var c = self.SheetCols[i - start];

        if (c.Edit == "true") {//c.Type == "Col" &&
            c.CancelEditFor(td);
        }
    });

    return true;
}


JClient.UI.Sheet.prototype.ChangeStatusRow = function (id, key) {
    var tbody = this.DataTable.find("tbody");
    var row = tbody.find("tr[id='" + id + "']");
    var data = {};
    data[this.PK] = id;
    data["_PK"] = this.PK;
    data["call"] = "ChangeStatusRow";
    data["$u_" + key] = "";
    var self = this;

    var rValue = false;

    function Success(_RMeta) {
        if (_RMeta.ClientInfo.Result) {
            self.loadMySheetData();
            rValue = true;
        }
        else {
            rValue = false;
        }
    }

    Ajax.Request(self.Handler, data, Success, false);

    //    $.ajax({
    //        url: self.Handler,
    //        data: data,
    //        type: 'POST',
    //        dataType: 'json',
    //        async: false,
    //        success: function (_RMeta) {
    //            if (_RMeta.ClientInfo.Status) {
    //                self.loadMySheetData();
    //                rValue = true;
    //            }
    //            else {
    //                rValue = false;
    //            }
    //        },
    //        fail: function () {

    //        }
    //    });

    return rValue;
}

JClient.UI.Sheet.prototype.DeleteRow = function (id) {
    //debugger;
    var tbody = this.DataTable.find("tbody");
    var row = tbody.find("tr[id='" + id + "']");
    var data = {};
    data["id"] = id;
    data["call"] = this.DelCall ? this.DelCall : "DeleteRow";
    var self = this;
    var rValue = false;
    if (arguments.length > 1) {/*接收一个自定义参数对象,方便用户扩展保存方法*/
        for (var column in arguments[1]) {
            data[column] = arguments[1][column];
        }
    }
    function Success(_RMeta) {
        if (_RMeta.ClientInfo.Result) {
            row.remove();
            self.SheetPage.MaxCount = self.SheetPage.MaxCount - 1; /*如果不分页也记录一个总行数*/
            if (self.AllowPaging != "false") {
                //self.SheetPage.MaxCount = self.SheetPage.MaxCount - 1;
                self.SheetPage.pageRender();
            }
            rValue = true;
        }
        else {
            rValue = false;
            Box.Tips(GRESX.HINTS.TITLE, 2, _RMeta.ClientInfo.Message, null, { icon: 'fail.gif' });
        }
    }
    
    Ajax.Request(self.Handler, data, Success, true);


    //    $.ajax({
    //        url: self.Handler,
    //        data: data,
    //        type: 'POST',
    //        dataType: 'json',
    //        async: false,
    //        success: function (_RMeta) {
    //            if (_RMeta.ClientInfo.Status) {
    //                row.remove();
    //                self.SheetPage.MaxCount = self.SheetPage.MaxCount - 1;
    //                self.SheetPage.pageRender();
    //                rValue = true;
    //            }
    //            else {
    //                rValue = false;
    //            }
    //        },
    //        fail: function () {

    //        }
    //    });

    return rValue;
}

JClient.UI.Sheet.prototype.LoadTableDataFinished = function (params, callback) {
    if (callback != null && typeof (callback) != 'undefined') {
        callback(params);
    }
}

JClient.UI.SheetCol = function (panel, sheet) {
    this.Panel = panel;
    this.Panel.hide();
    this.Key = this.Panel.attr("key");
    this.Title = GetResource(this.Panel.attr('lid'), this.Panel.attr("title"));
    this.Type = this.Panel.attr("type"); //Col、ColTemplate、ColMethod
    var css = this.Panel.attr("class");
    this.Class = css ? " class='" + css + "'" : "";
    this.Edit = this.Panel.attr("edit");
    this.EditControl = this.Panel.attr("editControl");
    this.Sheet = sheet;
    this.TdName = this.Panel.attr("tdname");
    this.show = this.Panel.attr('showtype');
    this.OrderBy = this.Panel.attr('orderby');
    //是否是默认不显示的列
    this.ColSel = this.Panel.attr('col-sel') == undefined ? false : true;
}

//特殊符号的替换(JS)
JClient.UI.SheetCol.prototype.JSEncode = function (str) {
    var s = "";
    if (str && str.length > 0) {
        s = str.replace(/&/g, "&amp;");
        s = s.replace(/</g, "&lt;");
        s = s.replace(/>/g, "&gt;");
        s = s.replace(/ /g, "&nbsp;");
        s = s.replace(/\'/g, "\\&#39;");
        s = s.replace(/\"/g, "\\&quot;");
    }
    return s;

}

//特殊符号替换(html)
JClient.UI.SheetCol.prototype.ReplaceHtml = function (str) {
    var s = "";
    if (str && str.length > 0) {
        s = str.replace(/&/g, "&amp;");
        s = s.replace(/</g, "&lt;");
        s = s.replace(/>/g, "&gt;");
        s = s.replace(/ /g, "&nbsp;");
        s = s.replace(/\'/g, "&#39;");
        s = s.replace(/\"/g, "&quot;");
    }
    return s;
}

//特殊字符换成空字符
JClient.UI.SheetCol.prototype.SpeciaToEmpty = function (str) {
    var s = "";
    if (str.length == 0) return "";
    s = str.replace(/&/g, "").replace(/</g, "").replace(/>/g, "").replace(/\'/g, "").replace(/\"/g, "").replace(/'/g, "").replace(/[\r\n]/g, "").replace(/'/g, "");
    return s;
}

JClient.UI.SheetCol.prototype.getText = function (row) {
    var rValue = "";
    this.rowData = row;
    try {
        switch (this.Type) {            
            case "Col": rValue = row[this.Key] != null ? row[this.Key].toString() : ""; break;
            case "ColTemplate":

                var html = this.Panel.html().replace(/[\r\n]/g, "");
                for (var key in row) {
                    var reg = new RegExp("({" + key + "})|(%7B" + key + "%7D)", "gi");
                    var value = row[key];
                    //  value = String(value).replace(/[\r\n]/g, "").replace(/'/g, ""); //转成string后去掉回车，解决换行符问题

                    value = typeof value == 'string' ? this.SpeciaToEmpty(value) : value;
                    html = html.replace(reg, value);
                }
                try {
                    var method_reg = new RegExp("\\^.+\\(.*\\)\\$", "gi");
                    var array = method_reg.exec(html);

                    if (array != null && array.length) {
                        for (var i = 0; i < array.length; i++) {
                            var method = array[i];
                            var str = eval(method.replace("^", "").replace("$", ""));
                            html = html.replace(method, str);
                        }
                    }
                } catch (e) { }

                rValue = "<span>" + html + "</span>"; break;
            case "ColMethod":
                var html = this.Panel.html().replace(/[\r\n]/g,"");
                for (var key in row) {
                    var reg = new RegExp("({" + key + "})|(%7B" + key + "%7D)", "gi");
                    var value = typeof row[key] == 'string' ? this.JSEncode(row[key]) : row[key];
                    html = html.replace(reg, value);
                }
                rValue = eval(html.replace(/[\r\n]/g, ""));
                break;
            case "NewColTemplate":

                var html = this.Panel.html().replace(/[\r\n]/g, "");
                for (var key in row) {
                    var reg = new RegExp("({" + key + "})|(%7B" + key + "%7D)", "gi");
                    var value = row[key];
                    //  value = String(value).replace(/[\r\n]/g, "").replace(/'/g, ""); //转成string后去掉回车，解决换行符问题

                    value = typeof value == 'string' ? value : value;
                    html = html.replace(reg, value);
                }
                try {
                    var method_reg = new RegExp("\\^.+\\(.*\\)\\$", "gi");
                    var array = method_reg.exec(html);

                    if (array != null && array.length) {
                        for (var i = 0; i < array.length; i++) {
                            var method = array[i];
                            var str = eval(method.replace("^", "").replace("$", ""));
                            html = html.replace(method, str);
                        }
                    }
                } catch (e) { }

                rValue = "<span>" + html + "</span>";
                break;
        }
    }
    catch (e) {
        var test = e;
    }

    return rValue;
}

JClient.UI.SheetCol.prototype.getValue = function (td) {
    var input = td.find(".col-td-edit");

    if (this.EditControl == undefined || this.EditControl == "")
        return input.val();
    else {
        switch (this.EditControl.toLowerCase()) {
            case "select":
                return input.find("option:selected").attr("value");
            case "input":
                var type = input.attr("type");
                if (type == "checkbox" || type == "radiobox") {
                    return input.get(0).checked;
                }
                else if (type == "text")
                    if (input.attr("objid")) {
                        return input.attr("objid");
                    }
                    else {
                        return input.val();
                    }
                else
                    return input.val();

            default: return input.val();
        }
    }

    return input.val();
}

JClient.UI.SheetCol.prototype.AddFor = function (td) {
    if (this.Type == "Col") {//this.EditFor(td);
        if (this.Edit == 'true') {
            this.EditFor(td);
        }
    }
    else {
        var text = this.getText([]);
        td.html(text);
        td.find("[data='edit']").hide();
        td.find("[data='ok']").show();
    }
}

JClient.UI.SheetCol.prototype.EditFor = function (td) {
    if (this.EditControl == undefined || this.EditControl == "") {
        var input = td.find("input");
        if (input.length == 0) {
            var html = td.text();
            td.attr("title", html);
            td.html("");
            input = $("<input class='col-td-edit' >").appendTo(td);
            input.val(html);
        }
    }
    else {
        var controlName = this.EditControl;

        var ctrl = this.Panel.find(controlName);
        if (ctrl.length == 1) {
            var html = td.html();
            td.attr("title", html);
            td.html("");
            var c = ctrl.clone();
            c.appendTo(td)
            c.addClass("col-td-edit");
            this.setControlValue(c, html);

            return;
        }

        var input = td.find(controlName);
        if (input.length == 0) {
            var html = td.html();
            td.attr("title", html);
            td.html("");
            input = $("<" + controlName + " class='col-td-edit'>").appendTo(td);
            input.val(html);
        }
    }
}

JClient.UI.SheetCol.prototype.setControlValue = function (control, value) {
    switch (this.EditControl.toLowerCase()) {
        case "select":
            control.find("option[title='" + value + "']").attr("selected", true);
            control.addClass("select");
            break;
        case "input":
            var type = control.attr("type");
            if (type == "checkbox" || type == "radiobox") {
                if (value == "true" || value == true || value == "checked")
                    control.attr("checked", value);
            }
            else if (type == "text")
                control.val(value);
            else
                control.val(value);
            break;
        default: control.val(value);
    }
}

JClient.UI.SheetCol.prototype.getTdControlText = function (td) {
    var input = td.find(".col-td-edit");

    if (this.EditControl == undefined || this.EditControl == "")
        return input.val();
    else {
        switch (this.EditControl.toLowerCase()) {
            case "select":
                if (this.show == 't') {
                    td.attr('sl_value', input.val());
                    return input.find("option:selected").text();
                }
                else {
                    return input.find("option:selected").val();
                }
            case "input":
                var type = input.attr("type");
                if (type == "checkbox" || type == "radiobox") {
                    return input.get(0).checked;
                }
                else if (type == "text")
                    return input.val();
                else
                    return input.val();

            default: return input.val();
        }
    }

    return input.val();
}


JClient.UI.SheetCol.prototype.CancelEditFor = function (td) {
    var input = td.find(".col-td-edit");
    if (input.length == 1) {
        var html = td.attr("title");
        td.html(html);
    }
}

JClient.UI.SheetCol.prototype.ApproveEditFinish = function (td) {
    //var input = td.find(".col-td-edit");
    var html = this.getTdControlText(td); //.toString();
    html = html ? html.toString() : "";
    td.html(html).attr("title", html).removeClass("col-td-dataerror");
}

var Table_Page_Message = String.format(GetResource('S170803174610562', '显示范围：{0} 到 {1} ， 共 {2} 条记录'), "<span >{Start}</span>", "<span >{End}</span>", "<span >{MaxCount}</span>");
var Table_Page_First = "|<&nbsp;";
var Table_Page_Prev = "<&nbsp;";
var Table_Page_Next = ">&nbsp;";
var Table_Page_Last = ">|&nbsp;";
var Table_Page_PageSize = "<select style='height:25px; width:80px;'><option value='10'>10</option><option value='20'>20</option><option value='30'>30</option><option value='50'>50</option><option value='100'>100</option><option value='50000'>" + GetResource('S140529114255450', '显示全部') + "</option></select>";
var Table_Page_PageIndex = "<div class='pageindexpanel'>" + GetResource('S160116110727195', '页') + " <input class='pageindex'></input>&nbsp;/&nbsp;<span class='pagecount'></span></div>";

JClient.UI.SheetPage = function (sheet) {
    this.PageSize = 10; //每页多少笔
    this.PageIndex = 1; //总当前页
    this.PageCount = 1; //总页数
    this.MaxCount = 0; //总笔数
    this.CurPageRows = null; //当前页集合
    this.SearchCloumns = {};
    this.Sheet = sheet;
}

JClient.UI.SheetPage.prototype.getSearchPrams = function () {
    var data = this.SearchCloumns;
    data["pageSize"] = this.PageSize;
    data["pageIndex"] = this.PageIndex;
    data["_PK"] = this.Sheet.PK;
    data["searchKey"] = this.Sheet.SearchKey ? this.Sheet.SearchKey.trim() : "";
    if (this.SearchCloumns.otherParam && !data["searchKey"]) {
        data["searchKey"] = this.SearchCloumns.otherParam
    }
    return data;
}

JClient.UI.SheetPage.prototype.init = function (panel) {
    this.Panel = panel;
    this.Sheet.Page.hide();
    this.Title = $("<div class='pageleft'  style='padding-top:16px;'></div>").html(Table_Page_Message).appendTo(this.Panel);
    this.PageGo = {
        PageFirst: $("<a href='javascript:void(0)' class='pagefirst' title='" + GetResource('S140808093740748', '转到第一页') + "'></a>").html(Table_Page_First),
        PagePrev: $("<a  href='javascript:void(0)' class='pageprev' title='" + GetResource('S140808093750810', '转到上一页') + "'></a>").html(Table_Page_Prev),
        PageList: $("<div class='pagelist'></div>"),
        PageNext: $("<a  href='javascript:void(0)' class='pagenext' title='" + GetResource('S140808093759078', '转到下一页') + "'></a>").html(Table_Page_Next),
        PageLast: $("<a  href='javascript:void(0)' class='pagelast' title='" + GetResource('S140808093808032', '转到最后一页') + "'></a>").html(Table_Page_Last)
    };

    this.PageList = [1, 2, 3, 4, 5];

    //  $("<div class='pageseparator'></div>").appendTo(this.Panel);  // 分隔符
    this.PageGoPanel = $("<div class='pageleft' ></div>").appendTo(this.Panel);
    this.PageGoPanel.append(this.PageGo.PageFirst).append(this.PageGo.PagePrev).append(this.PageGo.PageList).append(this.PageGo.PageNext).append(this.PageGo.PageLast);

    //  $("<div class='pageseparator'></div>").appendTo(this.Panel);  // 分隔符
    /* 自定义Page样式 START>> */
    this.PageSelect = $(Table_Page_PageSize); //变更第页记录 PageSize
    var _pageselect = $("<div class='pageselect'></div>").appendTo(this.Panel);
    this.PageSelect.appendTo(_pageselect);
    // $("<div class='pageseparator'></div>").appendTo(this.Panel);
    this.PageInputPanel = $(Table_Page_PageIndex).appendTo(this.Panel);

    /* EBD || */

}

JClient.UI.SheetPage.prototype.pageRender = function () {
    var self = this;
    this.Sheet.Page.show();
    var i = Math.round(this.MaxCount / this.PageSize);
    var j = this.MaxCount / this.PageSize;

    if (i < j) {
        this.PageCount = i + 1;
    }
    else
        this.PageCount = i;

    if (this.PageCount == 0)
        this.PageCount = 1;

    var title = Table_Page_Message;

    title = RegString("MaxCount", title, this.MaxCount);
    title = RegString("PageSize", title, this.PageSize);
    title = RegString("PageIndex", title, this.PageIndex);
    title = RegString("PageCount", title, this.PageCount);

    //title = RegString("Start", title, (this.PageIndex - 1) * this.PageSize + 1);
    title = RegString("Start", title, (this.MaxCount == 0) ? 0 : ((this.PageIndex - 1) * this.PageSize + 1));
    title = RegString("End", title, (this.PageIndex - 1) * this.PageSize + ((this.CurPageRows == null) ? 0 : this.CurPageRows.length));


    this.Title.html(title);

    this.PageInputPanel.find(".pagecount").html(this.PageCount);
    var _input = this.PageInputPanel.find(".pageindex").val(this.PageIndex);
    _input.unbind("keydown").keydown(function (e) {
        var key = (e.keyCode || e.which || e.charCode);
        if (key == 13) {
            var value = $(this).val();
            value = parseInt(value);

            if (isNaN(value) || value == undefined || value == 'undefined' || value == null) {
                $(this).val(self.PageIndex);
                return false;
            }

            if (value > self.PageCount) {
                value = self.PageCount;
            }
            else if (value <= 0) {
                value = 1;
            }
            self.goPageIndex(value);
            return false;
        }
    });

    if (this.PageSelect.find("option[value='" + this.PageSize + "']").length == 0) {
        $("<option value='" + this.PageSize + "'>" + this.PageSize + "</option>").prependTo(this.PageSelect);
    }
    this.PageSelect.val(this.PageSize);

    this.PageSelect.unbind("change").change(function () {
        var value = $(this).val();
        self.PageSize = value;
        self.goPageIndex(1);
    });
    /*处理相关事件*/
    if (this.PageIndex > 1) {
        this.PageGo.PageFirst.removeAttr("disabled").addClass('enable_page_btn');
        this.PageGo.PageFirst.unbind("click").bind("click", function () {
            self.goPageIndex(1);
        });
        this.PageGo.PagePrev.removeAttr("disabled").addClass('enable_page_btn');
        this.PageGo.PagePrev.unbind("click").bind("click", function () {
            self.goPageIndex(self.PageIndex - 1);
        });
    }
    else {
        this.PageGo.PageFirst.unbind("click").attr("disabled", true).removeClass('enable_page_btn');
        this.PageGo.PagePrev.unbind("click").attr("disabled", true).removeClass('enable_page_btn');
    }

    if (this.PageIndex < this.PageCount) {
        this.PageGo.PageLast.removeAttr("disabled").addClass('enable_page_btn');
        this.PageGo.PageLast.unbind("click").bind("click", function () {
            self.goPageIndex(self.PageCount);
        });
        this.PageGo.PageNext.removeAttr("disabled").addClass('enable_page_btn');
        this.PageGo.PageNext.unbind("click").bind("click", function () {
            self.goPageIndex(self.PageIndex + 1);
        });
    }
    else {
        this.PageGo.PageLast.unbind("click").attr("disabled", true).removeClass('enable_page_btn');
        this.PageGo.PageNext.unbind("click").attr("disabled", true).removeClass('enable_page_btn');
    }
    this.excutePageList();
}

//处理上一页与下一页之间的数字   
JClient.UI.SheetPage.prototype.excutePageList = function () {
    var me = this;
    this.PageGo.PageList.html("");

    if (this.PageIndex < this.PageList[0]) {
        if (this.PageIndex - this.PageList.length >= 0) {

            var x = this.PageIndex;
            var y = this.PageList.length - 1;

            while (x > 0 && y >= 0) {
                this.PageList[y] = x;
                x = x - 1;
                y = y - 1;
            }
        }
        else {
            for (var i = 0; i < this.PageList.length; i++)
                this.PageList[i] = i + 1;
        }
    }
    else if (this.PageIndex > this.PageList[this.PageList.length - 1]) {
        if (this.PageCount - this.PageIndex >= this.PageList.length) {
            var x = this.PageIndex;
            var y = 0;

            while (y < this.PageList.length) {
                this.PageList[y] = x;
                x = x + 1;
                y = y + 1;
            }
        }
        else {
            for (var i = 0; i < this.PageList.length; i++)
                this.PageList[i] = (this.PageCount - this.PageList.length + i + 1);
        }
    }

    for (var i = 0; i < this.PageList.length; i++) {
        if (this.PageList[i] > this.PageCount)
            break;
        else if (this.PageList[i] == 0)
            continue;

        var span = $("<span>" + this.PageList[i] + "</span>");
        if (this.PageList[i] == this.PageIndex)
            span.addClass("cur");
        else
            span.click(function () {
                me.goPageIndex(parseInt($(this).html()));
            });
        this.PageGo.PageList.append(span);
    }
}

//跳转到某一页
JClient.UI.SheetPage.prototype.goPageIndex = function (index) {
    this.PageIndex = index;
    this.Sheet.loadMySheetData();
}

function RegString(key, _str, value) {
    var reg = new RegExp("({" + key + "})|(%7B" + key + "%7D)", "g");
    return _str.replace(reg, value);
}

///重新排序
JClient.UI.SheetPage.prototype.NewReordering = function (Key, type, pageindex) {
    var data = this.getSearchPrams();
    if (!data || !data.Call) {
        return;
    }
    data["order_by"] = Key + "  " + type;
    this.PageIndex = pageindex;
    this.Sheet.loadMySheetData();
}


/* 以上为List 
////////////////////////////////////////////////// */
JClient.UI.CreateSheets = function () {
    $("body").find("div[type='Sheet']").each(function (i) {
        try {
            var sheet = $(this);
            var ui = eval("new JClient.UI.Sheet('" + sheet.attr("id") + "');");
            return ui;
        }
        catch (e) {
            return null;
        }
    });
}

JClient.UI.Create = function (dom$) {
    try {
        var name = dom$.attr("type");
        var ui = eval("new JClient.UI." + name + "();");
        ui.Init(dom$);
        return ui;
    }
    catch (e) {
        return null;
    }
}


// Control 单个控件基础类
JClient.UI.Control = function () {

    //初始化
    this.Init = function (panel) {
        this.Panel = panel;
        this.Key = panel.attr("key");
        this.Type = panel.attr("type");
        this.Name = panel.attr("title");
        this.Value = panel.attr("value");
        this.Panel.attr("JClient", "true");

        this.Title = $("<div>").addClass("control-title").html(this.Name + "：").appendTo(this.Panel);
        this.Label = $("<div>").addClass("control-label").html(this.Value).appendTo(this.Panel);
        this.PromptPanel = panel.find("[type='Prompt']").addClass("control-prompt").hide();
        this.Panel.append(this.PromptPanel);
        this.SetUI();

        if (this.Panel.attr("id") != undefined)
            JClient.Object[this.Panel.attr("id")] = this;
    }

    this.SetUI = function () {
        this.Panel.addClass("jclient-ui-input");
        this.Input = this.Panel.find("input").addClass("control-input").appendTo(this.Panel);
    }

    this.SetShowView = function (setvalue) {
        this.SetShowViewToControls();
        if (this.Value != this.GetValue() && (setvalue == undefined || setvalue == true)) {
            this.Label.addClass("control-label-change")
        }
        else {
            this.Label.removeClass("control-label-change")
        }
        if (setvalue == undefined || setvalue == true) {
            this.SetLabelValue();
        }

        this.PromptPanel.hide();
    }

    this.SetShowViewToControls = function () {
        this.Input.hide();
        this.Label.show();
    }

    this.SetLabelValue = function () {
        this.Label.html(this.GetValue());
    }

    this.SetInputValue = function () {
        this.Input.val(this.Value);
    }

    this.SetValue = function () {
        var value = this.GetValue();
        if (value != this.Value) {
            this.Value = value;
        }
    }

    this.GetValue = function () {
        return this.Input.val();
    }

    this.GetText = function () {
        return this.Input.val();
    }

    this.SetEditView = function () {
        this.SetEditViewToControls();
        this.SetInputValue();
        this.PromptPanel.show();
    }

    this.SetEditViewToControls = function () {
        this.Input.show();
        this.Label.hide();
    }

    this.ClearToEmpty = function () {
        this.Input.val("");
        this.Value = "";
        this.Label.html("");
        this.Text = "";
        this.Panel.attr("text", "").attr("value", "");
        this.Rows = [];
    }
}


//RadioBox
JClient.UI.RadioBox = function () {
    JClient.UI.Control.call(this);

    this.ContentMinWidth = 500;
    this.TabHeight = 27;
    this.Columns = [];
    this.Rows = [];
    this.ValueKey = [];
    var me = this;

    //初始化部分UI
    this.SetUI = function () {

        this.Handler = this.Panel.attr("handler");

        var cWidth = this.Panel.attr("ContentMinWidth");
        if (cWidth != null && cWidth != undefined)
            this.ContentMinWidth = cWidth;

        this.NoDataPrompt = this.Panel.find("[type='NoDataPrompt']");
        if (!this.NoDataPrompt.length) {
            this.NoDataPrompt = $("<span>" + GetResource('S140808093355956', '无可显示数据') + "</span>");
        }

        this.Text = this.Panel.attr("text");
        this.Text = this.Text == undefined ? "" : this.Text;

        if (this.Name == undefined || this.Name == "")
            this.Title.hide();

        this.Label.hide();

        this.Panel.addClass("jclient-ui-textbox");

        this.Panel.find("[type='BoxColumn']").each(function () {
            var title = $(this).attr("title");
            var key = $(this).attr("key");
            var className = $(this).attr("class");
            me.Columns.push({ key: key, title: title, className: className });
            if ($(this).attr("isValue") == "true")
                me.ValueKey.push(key);
        });

        if (this.ValueKey.length == 0 && this.Columns.length > 0)
            this.ValueKey.push(this.Columns[0].key);



        this.Input = $("<input>").addClass("input-box").addClass("data-search").val(this.Text).appendTo(this.Panel);
        this.Input.attr("readonly", true).css("cursor", "pointer");


        this.Input.click(function () {
            me.ShowPanel();
        });

        this.TabClose.click(function () {
            me.HidePanel();
        });

        this.SearchText.keyup(function (e) {
            if (e.keyCode == 13) {
                me.SearchButton.click();
            }
        });

        this.SearchButton.click(function () {
            me.Search();
        });

        this.ContentTable.click(function (e) {
            if (e.target.tagName == "A" && $(e.target).attr("type") == "SelectButton") {
                me.Select($(e.target).attr("id"));
            }
        });

        //表头
        this.TableHeader.empty();
        for (var i = 0; i < me.Columns.length; i++) {
            var c = me.Columns[i];
            $("<td>").html(c.title).attr("class", c.className).appendTo(this.TableHeader);
        }
        $("<td>").html(GetResource('S140808093901478', '选择')).attr("class", "oper").appendTo(this.TableHeader);
        $("<td>").append(this.NoDataPrompt).attr("colspan", me.Columns.length + 1).appendTo(this.TableNoData);

        this.SetPanelTitle();
        this.OtherPanel();
        this.TabPane.appendTo($("body"));
        this.ContentPanel.appendTo($("body"));
    }


    this.TabPane = $("<div>").addClass("jclient-ui-radiobox-tab").hide(); //.appendTo(this.Panel);

    this.TabClose = $("<div>").addClass("jclient-ui-radiobox-tab-close").html("x").attr("title", GetResource('S140808093929901', '关闭')).appendTo(this.TabPane);

    this.ContentPanel = $("<div>").addClass("jclient-ui-radiobox-content").hide(); //.appendTo(this.Panel);
    this.ContentTopPanel = $("<div>").addClass("jclient-ui-radiobox-content-top").appendTo(this.ContentPanel);

    this.SearchBar = $("<div>").addClass("searchbar").appendTo(this.ContentPanel);
    this.SearchText = $("<input>").addClass("search_input").appendTo(this.SearchBar);
    this.SearchButton = $("<input>").attr("type", "button").addClass("btn_input_s").val(GetResource('S140808093939448', '查询')).appendTo(this.SearchBar);


    this.ContentTableDiv = $("<div>").addClass("jclient-ui-radiobox-content-tablepanel").appendTo(this.ContentPanel);
    this.ContentTable = $("<table>").attr("cellpadding", "0").attr("cellspacing", "0").addClass("second_list").appendTo(this.ContentTableDiv);
    this.TableHeader = $("<tr>").addClass("h").appendTo(this.ContentTable);
    this.TableNoData = $("<tr>").addClass("td").appendTo(this.ContentTable);

    this.Left = -1;
    this.Top = -1;
    this.Width = -1;
    this.Height = -1;

    this.SetPanelTitle = function () {

        var me = this;
        this.TabTitle = $("<div>").addClass("jclient-ui-radiobox-tab-title").appendTo(this.TabPane);
        this.ClearButton = $("<div>").addClass("jclient-ui-radiobox-tab-clear").html(GetResource('S140808093958652', '清空')).appendTo(this.TabPane);
        this.ClearButton.click(function () {
            me.Select("");
        });
    }

    this.OtherPanel = function () {
    }

    this.SetPanelTitleText = function (text) {
        this.TabTitle.attr('title', text);
        if (text.length > 40)
            text = text.substr(0, 39);
        this.TabTitle.html(text + "...");

        if (this.TabTitle.html() == "")
            this.ClearButton.hide();
        else
            this.ClearButton.show();
    }

    this.BeforeShowPanel = function () {
    }
    //显示展示框
    this.ShowPanel = function () {
        this.BeforeShowPanel();
        //确定窗口的位置
        //if (this.Left < 0) {
        var offset = this.Input.offset();
        this.Left = offset.left;
        this.Top = offset.top + this.Input.outerHeight();
        this.Width = this.Input.outerWidth();
        this.Height = this.TabHeight;
        this.TabPane.css({
            top: this.Top,
            left: this.Left,
            width: this.Width,
            height: this.Height + 2
        });
        this.ContentPanel.css({
            top: this.Top + this.Height,
            left: this.Left,
            width: Math.max(this.Width, this.ContentMinWidth)
        });


        // }

        //将其它同类型的窗口关掉
        if (JClient.UI.RadioBox.ShowedRadioBoxs == undefined)
            JClient.UI.RadioBox.ShowedRadioBoxs = [];
        var array = JClient.UI.RadioBox.ShowedRadioBoxs;
        for (var i = 0; i < array.length; i++) {
            array[i].HidePanel();
        }
        JClient.UI.RadioBox.ShowedRadioBoxs = [];
        JClient.UI.RadioBox.ShowedRadioBoxs.push(this);

        //调整一下位置，方便显示出全部内容
        $("body").scrollTop(this.Top - 30);

        this.SetPanelTitleText(this.Input.val());


        this.TabPane.show();
        this.ContentPanel.show();
        this.SearchText.focus();
        if (this.Rows.length == 0) {
            this.Search();
        }
    }

    this.HidePanel = function () {
        this.TabPane.hide();
        this.ContentPanel.hide();
        this.Input.blur();
    }

    this.SelectFinished = function () {

    }

    //为联动查询提供扩展方法
    this.InputParams = function (data) {

    }




    //查询
    this.Search = function () {
        var data = {};
        data["key"] = this.SearchText.val();
        me.InputParams(data);

        Ajax.Request(this.Handler, data, Success);

        function Success(data) {
            if (typeof data == "string") {
                try {
                    data = eval("(" + data + ")");
                }
                catch (e) {
                    data = false;
                }
            }
            if (data == null || data == 'null') {
                me.ContentTable.find("tr.tb").remove();
                return;
            }
            if (data.length == undefined && data == false) {

                Box.Alert(GRESX.HINTS.TITLE, GetResource('S140808094020991', '查询失败！'), null, { icon: 'fail.png', width: '250', height: '60' });
            }
            else {
                me.SetSearchData(data);
            }
        }

        //        $.ajax({
        //            url: this.Handler,
        //            type: "POST",
        //            data: data,
        //            success: function (data) {

        //                if (typeof data == "string") {
        //                    try {
        //                        data = eval("(" + data + ")");
        //                    }
        //                    catch (e) {
        //                        data = false;
        //                    }
        //                }
        //                if (data == null || data == 'null') {
        //                    me.ContentTable.find("tr.tb").remove();
        //                    return;
        //                }
        //                if (data.length == undefined && data == false) {

        //                    Box.Alert(GRESX.HINTS.TITLE, GetResource('S140808094020991', '查询失败！'), null, { icon: 'fail.png', width: '250', height: '60' });
        //                }
        //                else {
        //                    me.SetSearchData(data);
        //                }
        //            },
        //            fail: function () {

        //                Box.Alert(GRESX.HINTS.TITLE, GetResource('S140808094020991', '查询失败！'), null, { icon: 'fail.png', width: '250', height: '60' });
        //            }
        //        });
    }

    //设置查询到的数据
    this.SetSearchData = function (rows) {
        if (rows.rows != undefined)
            rows = rows.rows;
        this.Rows = rows;
        this.ContentTable.find("tr.tb").remove();
        if (this.Rows.length == undefined || this.Rows.length <= 0) {
            this.TableNoData.show();
        }
        else {
            this.TableNoData.hide();
            for (var i = 0; i < this.Rows.length; i++) {
                if (i > 20)
                    break;
                var d = this.Rows[i];
                var tr = $("<tr>").addClass("tb").appendTo(this.ContentTable);
                for (var j = 0; j < me.Columns.length; j++) {
                    var c = me.Columns[j];
                    try {
                        var t = d[c.key];
                        if (t.length > 30)
                            t = t.substr(0, 29) + '...';
                        $("<td title=" + d[c.key] + ">").html(t).appendTo(tr);
                    } catch (e) { $("<td>").html("").appendTo(tr); }
                }
                $("<td>").appendTo(tr).append(
                    $("<a>").html(GetResource('S140808093901478', '选择')).attr("type", "SelectButton").attr("id", d[me.Key]).attr("href", "javascript:void(0);"));
            }
        }

    }

    //设置选择到的数据
    this.Select = function (id) {
        for (var i = 0; i < this.Rows.length; i++) {
            var d = this.Rows[i];
            if (d[me.Key] == id) {
                var text = "";
                for (var x = 0; x < this.ValueKey.length; x++) {
                    if (text == "")
                        text = d[this.ValueKey[x]];
                    else
                        text += "_" + d[this.ValueKey[x]];
                }

                this.Text = text;
                this.Value = id;
                this.Input.val(this.Text);
                var v = this.Panel.attr("value");
                if (v != undefined)
                    this.Panel.attr("value", this.Value);
                var t = this.Panel.attr("text");
                if (t != undefined)
                    this.Panel.attr("text", this.Text);

                this.HidePanel();
                if (id != '') {
                    this.SelectFinished();
                }
                return;
            }
        }

        this.Text = "";
        this.Value = "";
        this.Input.val("");
        this.Panel.attr("value", this.Value);
        this.Panel.attr("text", this.Text);
        this.HidePanel();
        if (id != '') {
            this.SelectFinished();
        }

    }

    this.GetValue = function () {
        return this.Value;
    }
    this.SetLabelValue = function () {
        this.Label.html(this.Text);
    }

    this.SetEditView = function () {
        this.SetEditViewToControls();
        this.Input.val(this.Text);
    }

    this.SetEditViewWithValue = function (text) {
        this.SetEditViewToControls();
        this.Input.val(text);
        this.Text = text;
    }

    this.SetShowViewToControls = function () {
        this.Input.hide();
        this.Label.show();
        this.HidePanel();
    }

    // 控件已创建，后赋值
    this.SetShowValueAndTextAfterCreated = function (text, value) {
        this.Text = text;
        this.Value = value;
        this.Input.val(this.Text);
        var v = this.Panel.attr("value");
        if (v != undefined)
            this.Panel.attr("value", this.Value);
        var t = this.Panel.attr("text");
        if (t != undefined)
            this.Panel.attr("text", this.Text);
    }
}

//-------------------以下为 CheckBox ------------------------
JClient.UI.CheckBox = function () {

    JClient.UI.RadioBox.call(this);

    this.SelectObjs = [];

    this.SetPanelTitle = function () {
        this.TabTitle = $("<div>").addClass("jclient-ui-radiobox-tab-title").appendTo(this.TabPane);

        var ids = this.Value.split(',');
        var texts = this.Text.split(',');
        this.SelectObjs = [];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (id != "") {
                var text = texts.length <= i ? "" : texts[i];
                this.SelectObjs.push({
                    id: id,
                    text: text
                });
            }
        }

        this.SetPanelTitleText = function (text) {
            if (text.length > 20)
                text = text.substr(0, 19);
            this.TabTitle.html(text + "...");
        }
    }

    this.OtherPanel = function () {
        this.ContentTableDiv.addClass("jclient-ui-checkbox-content-tablepanel");
        this.SelectTableDiv = $("<div>").addClass("jclient-ui-checkbox-select-tablepanel").insertAfter(this.ContentTableDiv);
        this.SelectTable = $("<table>").attr("cellpadding", "0").attr("cellspacing", "0").addClass("second_list").appendTo(this.SelectTableDiv);
        this.SelectTableHeader = $("<tr>").addClass("h").appendTo(this.SelectTable);
        this.SelectTd = $("<td>").appendTo(this.SelectTableHeader);
        //放已选择的数据
        this.SelectTableContent = $("<tr>").addClass("td").appendTo(this.SelectTable);
        this.SelectObjectsTd = $("<td>").appendTo(this.SelectTableContent);

        var title = $("<div>").addClass("jclient-ui-radiobox-tab-title").html(GetResource('S140808094104812', '选择的值') + "：").appendTo(this.SelectTd);
        this.ClearButton = $("<div>").addClass("jclient-ui-radiobox-tab-clear").html(GetResource('S140808093958652', '清空')).appendTo(this.SelectTd);

        this.Bottom = $("<div>").addClass("jclient-ui-checkbox-bottom").appendTo(this.ContentPanel);
        this.OkButton = $("<input>").attr("type", "button").addClass("btn_input_s").val(GetResource('S140808093304465', '確定')).appendTo(this.Bottom);
        this.CancelButton = $("<input>").attr("type", "button").addClass("btn_input_s").val(GetResource('S140808093322163', '取消')).appendTo(this.Bottom);

        var me = this;
        this.SelectTable.click(function (e) {
            if (e.target.tagName == "SPAN" && $(e.target).attr("type") == "SelectButton") {
                me.Remove($(e.target).attr("tid"));
                $(e.target).parent().remove();
            }
        });
        this.ClearButton.click(function () {
            me.SelectObjectsTd.find("div").remove();
            me.SelectObjs = [];
        });

        this.CancelButton.click(function () {
            me.HidePanel();
        });

        this.OkButton.click(function () {
            me.SetValue();
            me.BeforeClosed();
        });
    }

    this.BeforeClosed = function () {
        this.SelectFinished();
    }

    this.BeforeShowPanel = function () {
        this.SelectObjectsTd.find("div").remove();
        for (var i = 0; i < this.SelectObjs.length; i++) {
            var item = this.SelectObjs[i];
            var div = this.BuildShowDiv(item.id, item.text);
            div.appendTo(this.SelectObjectsTd);
        }
    }

    this.Select = function (id) {

        var hasExist = false;
        for (var i = 0; i < this.SelectObjs.length; i++) {
            if (this.SelectObjs[i].id == id) {
                hasExist = true;
                break;
            }
        }
        if (hasExist)
            return;

        for (var i = 0; i < this.Rows.length; i++) {
            var d = this.Rows[i];
            if (d.id == id) {

                this.SelectObjs.push({
                    id: d.id,
                    text: d[this.ValueKey[0]]
                });

                var div = this.BuildShowDiv(d.id, d[this.ValueKey[0]]);
                div.appendTo(this.SelectObjectsTd);

                return;
            }
        }
    }

    this.Remove = function (id) {
        for (var i = 0; i < this.SelectObjs.length; i++) {
            if (this.SelectObjs[i].id == id) {
                this.SelectObjs.splice(i, 1);
                return;
            }
        }
    }

    this.BuildShowTR = function (id, text) {
        var tr = $("<tr>").addClass("tb");
        var td = $("<td>").appendTo(tr);

        var span = $("<span>").html(text).appendTo(td);
        var deleteA = $("<a>").attr("tid", id).attr("type", "SelectButton").html(GetResource('S140808094153296', '删除')).appendTo(td);
        return tr;
    }

    this.BuildShowDiv = function (id, text) {
        var div = $("<div>").addClass("select-item");
        var span = $("<span>").html(text).appendTo(div);
        var deleteA = $("<span>").attr("tid", id).attr("type", "SelectButton").appendTo(div);
        return div;
    }

    this.SetValue = function () {
        var id = "";
        var text = "";
        for (var i = 0; i < this.SelectObjs.length; i++) {
            if (i > 0) {
                id += ",";
                text += ",";
            }
            id += this.SelectObjs[i].id;
            text += this.SelectObjs[i].text;
        }
        this.Text = text;
        this.Value = id;
        this.Input.val(text);

        var v = this.Panel.attr("value");
        if (v != undefined)
            this.Panel.attr("value", this.Value);
        var t = this.Panel.attr("text");
        if (t != undefined)
            this.Panel.attr("text", this.Text);

        this.HidePanel();
    }

    //控件已创建，后赋值
    this.SetShowValueAndTextAfterCreated = function (text, value) {
        this.Text = text;
        this.Value = value;
        this.Input.val(this.Text);
        var v = this.Panel.attr("value");
        if (v != undefined)
            this.Panel.attr("value", this.Value);
        var t = this.Panel.attr("text");
        if (t != undefined)
            this.Panel.attr("text", this.Text);

        this.SetPanelTitle();
    }
}

//给控件赋值
JClient.UI.PushControlValue = function (key, control, data) {
    var type = control.get(0).tagName;
    switch (type) {
        case "INPUT": data[key] = control.val(); break;
        case "SELECT": data[key] = control.val();
            var s = control.find("option:selected");
            if (s.length == 1)
                data[key + "_name"] = s.text();
            break;
        case "LABEL": data[key] = control.html(); break;
        case "DIV":
            var v = "";
            var cbxs = control.find("input[type='checkbox']");
            var rbxs = control.find("input[type='radio']");
            if (cbxs.length > 0) {
                cbxs.each(function (i) {
                    if ($(this).attr("checked") == "true" || $(this).attr("checked") == true || $(this).attr("checked") == "checked") {
                        if (v == "")
                            v = $(this).val();
                        else
                            v += "," + $(this).val();
                    }
                });

                data[key] = v;
            }
            else if (rbxs.length > 0) {
                rbxs.each(function (i) {
                    if ($(this).attr("checked") == "true" || $(this).attr("checked") == true || $(this).attr("checked") == "checked") {
                        if (v == "")
                            v = $(this).val();
                        else
                            v += "," + $(this).val();
                    }
                });

                data[key] = v;
            }
            else if (control.attr("JClient") != undefined) {
                data[key] = control.attr("value");
                if (control.attr("text") != undefined)
                    data[key + "_name"] = control.attr("text");
            }
            else
                data[key] = control.html();

            break;
        case "TEXTAREA": data[key] = control.val(); break;
        case "SPAN":
            if (control.attr("JClient") != undefined) {
                data[key] = control.attr("value");
                if (control.attr("text") != undefined)
                    data[key + "_name"] = control.attr("text");
            }
            else
                data[key] = control.html();
    }

}

//判断是否必填
JClient.UI.CantBeNull = function (DOM_ids, _iframeID) {

    var rValue = true;
    var ids = DOM_ids.split(',');
    for (var i = 0; i < ids.length; i++) {
        var control = $("#" + ids[i]);
        if (control.length == 0) { //弹窗口中元素
            if (_iframeID) {
                var _obj = lhgdialog.list[_iframeID].content;
                control = _obj.$("#" + ids[i]);
            }
        }
        if (control.length == 1 && $.trim(JClient.UI.GetControlValue(control)) == "") {
            control.focus();
            var type = control.get(0).tagName;
            if (type == "SELECT") {
                if (control.get(0).id == "contact_user") {
                    control.addClass("v_NotNull");
                }
                else {
                    $("#div" + ids[i]).addClass("v_NotNull");
                    control.addClass("v_NotNull");
                }
                //control.addClass("v_NotNull");
              
            } else {
                control.addClass("v_NotNull");
            }
            rValue = false;
        }
        else {
            if (control.length != 0) {
                var type = control.get(0).tagName;
                if (type == "SELECT") {
                    $("#div" + ids[i]).removeClass("v_NotNull");
                }
                control.removeClass("v_NotNull");
            }
        }
    }
    if (!rValue) {
        //try {
        //    lhgdialog.list[_iframeID].content.Box.Alert(GRESX.HINTS.TITLE, GetResource('S140813140849000', '红框处栏位必须填写'), null, { icon: 'hits.gif', width: '250', height: '60' });
        //}
        //catch (e) {
        //    Box.Alert(GRESX.HINTS.TITLE, GetResource('S140813140849000', '红框处栏位必须填写'), null, { icon: 'hits.gif', width: '250', height: '60' });
        //}
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S140813140849000', '红框处栏位必须填写'), null, { icon: 'hits.gif', width: '250', height: '60' });
    }

    return rValue;
}

/**
 * 特殊必填校验（公共方法，可复用）
 * 处理 CantBeNull 判不了的特殊必填：
 *   1. 下拉型：选中项文本含"请选择"或值为空 → 视为未选择（如监控年费，请选择值非空字符串）
 *   2. 表格行型：表格内每行的指定控件必填（如发票明细每行服务名称）
 *   3. 勾选必选型：每个列出的勾选框（当前可见的）必须勾选（如新增案件的其它勾选项）
 * 开关和参数都来自 i_publish_config，客户可自行开关（配置为空 = 规则未开启，不拦截）。
 *
 * 配置格式（cfg_value，多条规则用 | 分隔）：
 *   *控件ID                   下拉型   例：*a_apply_case_list__is_feemonitor
 *   #表格ID:列控件前缀       表格行型  例：#InvoiceDetailList:sn_（扫每行 id 以 sn_ 开头的输入框，objid/值空即拦）
 *   !勾选框ID1;ID2;...     勾选必选型  例：!id1;id2;id3（列出的每个勾选框都必须勾选，隐藏的跳过）
 *
 * 用法：if (!JClient.UI.CantBeNullSpecial('PatentUncoil', 'is_feemonitor_must')) return false;
 *       （可选第三参 msg 自定义弹窗文案，如 CantBeNullSpecial('PatentUncoil','is_other_must','其他栏目存在必填勾选栏位，未勾选')）
 *
 * @param {string} cfgType 配置类型
 * @param {string} cfgKey  配置键
 * @param {string} msg     可选，校验失败时弹窗文案（不传用默认文案）
 * @returns {boolean} true=通过，false=未通过（已红框+弹窗）
 */
JClient.UI.CantBeNullSpecial = function (cfgType, cfgKey, msg) {
    var cfgValue = GetPublishConfigValueFn(cfgType, cfgKey);
    if (!cfgValue || cfgValue.length == 0) {
        return true;                         // 配置为空 = 规则未开启，不拦截
    }
    var result = true;
    var rules = cfgValue.split('|');
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.charAt(0) == '*') {
            // ---- 下拉型：选中项文本含"请选择"或值为空 → 视为未选择 ----
            var $ctrl = $("#" + rule.substring(1));
            if ($ctrl.length == 0) { continue; }
            var selectedText = $ctrl.find("option:selected").text().trim();
            var placeholderText = GetResource('S140814203438556', '请选择');
            if ($ctrl.val() == '' || selectedText.indexOf(placeholderText) > -1) {
                $ctrl.addClass("v_NotNull");
                result = false;
            } else {
                $ctrl.removeClass("v_NotNull");
            }
        } else if (rule.charAt(0) == '#') {
            // ---- 表格行型：表格内每行的指定控件必填 ----
            // 配置格式：#表格ID:列控件前缀（如 #InvoiceDetailList:sn_ 扫每行 id 以 sn_ 开头的输入框）
            var parts = rule.substring(1).split(':');
            var $rows = $("#" + parts[0]).find("tbody>tr");
            var prefix = parts[1];
            var foundCell = false;   // 是否至少有一行存在目标控件
            $rows.each(function () {
                var $cell = $(this).find("input[id^='" + prefix + "']");
                if ($cell.length == 0) { return; }
                foundCell = true;
                var objid = $cell.attr("objid");
                if (!objid || objid == "" || $.trim($cell.val()) == "") {
                    $cell.addClass("v_NotNull");
                    result = false;
                } else {
                    $cell.removeClass("v_NotNull");
                }
            });
            // 一行都没有目标控件（如未添加任何明细）→ 视为未填写，并把占位行标红
            if (!foundCell) {
                result = false;
                var $emptyCell = $("#" + parts[0]).find("tbody tr:first td");
                if ($emptyCell.length > 0) {
                    $emptyCell.css("outline", "1px solid red").css("outline-offset", "-1px");
                }
            }
        } else if (rule.charAt(0) == '!') {
            // ---- 勾选必选型：每个列出的勾选框（当前可见的）必须勾选 ----
            // 配置格式：!勾选框ID1;勾选框ID2;...（如 !a_apply_case_list__is_essence_exam;a_apply_case_list__is_ahead_pub）
            // 说明：不在DOM的、被申请类型隐藏(不可见)的跳过，只校验当前渲染出来的勾选框
            var cboxIds = rule.substring(1).split(';');
            for (var j = 0; j < cboxIds.length; j++) {
                var $cb = $("#" + cboxIds[j]);
                if ($cb.length == 0) { continue; }       // 不在 DOM → 跳过
                if (!$cb.is(':visible')) { continue; }   // 申请类型隐藏的 → 跳过（只校验当前渲染的）
                if (!$cb.is(':checked')) {
                    $cb.addClass("v_NotNull");
                    result = false;
                } else {
                    $cb.removeClass("v_NotNull");
                }
            }
        }
    }
    if (!result) {
        Box.Alert(GRESX.HINTS.TITLE, msg || GetResource('S230426151046335', '存在必填栏位没有填写！'), null, { icon: 'hits.gif', width: '250', height: '60' });
    }
    return result;
};

/**
 * 特殊必填栏位显示红*号（与 CantBeNullSpecial 配套）
 * 规则配置开启时给对应字段标签左边加红*，配置为空则不加。
 * 解析规则（cfg_value 用 | 分隔多条）：
 *   *控件ID       下拉型：标签 = 控件的父td的前一个td里的span
 *   !勾选框ID1;ID2;...   勾选必选型：勾选框后面的文字span变红
 *
 * 用法：JClient.UI.AddRedStarSpecial('PatentUncoil', 'is_feemonitor_must');
 */
JClient.UI.AddRedStarSpecial = function (cfgType, cfgKey) {
    var cfgValue = GetPublishConfigValueFn(cfgType, cfgKey);
    if (!cfgValue || cfgValue.length == 0) { return; }
    var rules = cfgValue.split('|');
    for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (rule.charAt(0) == '*') {
            // 下拉型：复用 AddRedStar（内部找 父td.prev() 的标签span）
            AddRedStar(rule.substring(1));
        } else if (rule.charAt(0) == '!') {
            // 勾选必选型：勾选框后面的文字span变红（如"同时提实审"）
            var cboxIds = rule.substring(1).split(';');
            for (var j = 0; j < cboxIds.length; j++) {
                $("#" + cboxIds[j]).next("span").css("color", "red");
            }
            // 给所在区块的标题加红*（如"其它"）：取第一个勾选框的容器td的前一个td里的标签span
            // 约定：! 规则下的勾选框都在同一个容器td内
            var $firstCb = $("#" + cboxIds[0]);
            if ($firstCb.length > 0) {
                var $headerLabel = $firstCb.closest("td").prev().find("span");
                if ($headerLabel.length > 0 && $headerLabel.before().text().indexOf('*') == -1) {
                    $headerLabel.before('<span style="color: red;margin-right:2px">*</span>');
                }
            }
        }
    }
};

/**
 * 判断对象是否有空值(一般情况下，使用 JClient.UI.CantBeNull)
 * @param {} DOM_Ojbs 输入对象，用逗号分开，如:“#id, .Class, input[name='password']”
 * @param {} _iframeID 
 * @returns {}
 * Add by luken 2017-11-23
 */
JClient.UI.HasNull = function (DOM_Ojbs, _iframeID) {
    var rValue = true;
    var ids = DOM_Ojbs.split(',');
    for (var i = 0; i < ids.length; i++) {
        var control = $(ids[i]);
        if (control.length == 0) { //弹窗口中元素
            var _obj = lhgdialog.list[_iframeID].content;
            control = _obj.$(ids[i]);
        }
        if (control.length == 1 && $.trim(JClient.UI.GetControlValue(control)) == "") {
            //control.focus(); //聚焦，日期格式会出错
            control.addClass("v_NotNull");
            rValue = false;
        }
        else {
            if (control.length != 0) {
                control.removeClass("v_NotNull");
            }
        }
    }
    if (!rValue) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S140813140849000', '红框处栏位必须填写'), null, { icon: 'hits.gif', width: '250', height: '60' });
    }

    return rValue;
}

JClient.UI.GetControlValue = function (control) {
    var value = "";
    var type = control.get(0).tagName;
    switch (type) {
        case "INPUT": value = control.val(); break;
        case "SELECT": value = control.val(); break;
        case "LABEL": value = control.html(); break;
        case "DIV":
            var v = "";
            var cbxs = control.find("input[type='checkbox']");
            var rbxs = control.find("input[type='radio']");
            if (cbxs.length > 0) {
                cbxs.each(function (i) {
                    if ($(this).attr("checked") == "true" || $(this).attr("checked") == true || $(this).attr("checked") == "checked") {
                        if (v == "")
                            v = $(this).val();
                        else
                            v += "," + $(this).val();
                    }
                });

                value = v;
            }
            else if (rbxs.length > 0) {
                rbxs.each(function (i) {
                    if ($(this).attr("checked") == "true" || $(this).attr("checked") == true || $(this).attr("checked") == "checked") {
                        if (v == "")
                            v = $(this).val();
                        else
                            v += "," + $(this).val();
                    }
                });

                value = v;
            }
            else if (control.attr("JClient") != undefined) {
                value = control.attr("value");
            }
            else
                value = control.html();

            break;
        case "TEXTAREA": value = control.val(); break;
        case "SPAN":
            if (control.attr("JClient") != undefined) {
                value = control.attr("value");
            }
            else
                value = control.html();
            break;
    }

    return value;
}



JClient.UI.Sheet.prototype.reRenderRow = function (data, $tr) {
    var prev_data = $tr.data("row");
    data.sn = data.sn ? data.sn : prev_data.sn;
    $tr.data("row", data);
    for (var j = 0; j < this.SheetCols.length; j++) {
        var c = this.SheetCols[j];
        try {
            var $td = $tr.find("td[colName='" + c.Key + "']");
            if ($td.length == 0) continue;
            var text = c.getText(data);
            $td.html(text);
        } catch (e) {
        }
    }
}

//#region 自定义显示列

//是否允许选择隐藏列 hide
JClient.AllowSelectHiddenColumn = false;

//初使化TableHead
JClient.UI.Sheet.prototype.rebuildThead = function (newCols) {
    var table = this.DataTable;
    var $thead = table.find(">thead");
    var tr = $thead.find('tr');
    tr.empty();
    var self = this;

    var $td_popup_sp = $('<span class="td_popup_sp" style="margin-left:-15px;">&nbsp;</span>');
    var lastVisibleTd = null;
    if (this.AllowSelect == "true") {
        var c_td = $("<td style='width:40px;'><input type='checkbox' /></td>").appendTo(tr);
        var $_box = c_td.find("input[type='checkbox']");
        self.SelectCbx = $_box;
        $_box.unbind("change").bind("change", function () {
            self.selectAll();
        });
        table.unbind("change");
        table.on("change", "input.check", function () {
            if (!this.checked && self.SelectCbx.get(0).checked) {
                self.SelectCbx.get(0).checked = false;
            }
        });
        $td_popup_sp.css('margin-top', '0px');
        lastVisibleTd = c_td;
    }

    if (this.AutoRowNum == "true") {
        var r_td = $("<td class='td_30'>" + GetResource('S140808093333235', '序号') + "</td>");
        r_td.appendTo(tr);
        if (lastVisibleTd == null) {
            lastVisibleTd = r_td;
            r_td.removeClass('td_30').addClass('td_60');
        }
    }

    for (var i = 0; i < newCols.length; i++) {
        var Class = newCols[i].Class ? newCols[i].Class : '';
        var td = $("<td  " + Class + "  colName='" + newCols[i].name + "' ></td>");
        var td_text = newCols[i].text;
        if (newCols[i].order_by) {
            var $spOrder = $("<span class='order_td'>" + td_text + "</span>");
            //注意这里是循环绑定匿名函数,使用一个包裹函数解决闭包产生的之引用问题
            (function (j) { td.bind('click', function () { self.Reordering(newCols[j].name, this) }); })(i);
            //td_text = "<span class='order_td'>" + td_text + "</span>";
            td.append($spOrder);
        } else {
            td.html(td_text);
        }
        if (i == 0 && lastVisibleTd == null) {
            lastVisibleTd = td;
            var $tmptb = $('<table><td id="__tmp_my_td" ' + Class + '><td></table>');
            $(document.body).append($tmptb);
            if ($('#__tmp_my_td').width() < 60) {
                td.addClass('td_60');
            }
            $tmptb.remove();
        }
        td.appendTo(tr);
    }

    if (lastVisibleTd) {
        var _title = GetResource('S180113143643926', '自定义表格显示列')
        $td_popup_sp.on("click", function () {
            self.PopupColDialog();
        });
        lastVisibleTd.css('position', 'relative');
        lastVisibleTd.prepend($td_popup_sp);
        $td_popup_sp.attr('title', _title);
    }
    //$thead;.empty().append(tr);
    //return $thead;
}

JClient.UI.Sheet.prototype.getDefaultAllCols = function () {
    var arrAll = [];
    for (var j = 0; j < this.SheetCols.length; j++) {
        var c = this.SheetCols[j];
        arrAll.push({ name: c.Key, text: c.Title, Class: c.Class, order_by: c.OrderBy, col_select: c.ColSel });
    }
    return arrAll;
}

JClient.UI.Sheet.prototype.getNewHeaderCols = function () {
    this.HiddenColCount = 0;
    this.GetUserSelectedColNames();
    var colNames = this.UserSelectedColNames;
    var allCols = this.AllCols;
    if (colNames && colNames.length > 0) {
        var arr = [];
        for (var j = 0; j < colNames.length; j++) {
            var ccc = JClient.UI.FilterItemArr(allCols, 'name', colNames[j]);
            if (ccc) {
                arr.push(ccc);
            } else {
                console.error('cant find name[' + colNames[j] + '], in table [' + this.Id + ']')
            }
        }
        //渲染隐藏列
        for (var i = 0; i < allCols.length; i++) {
            var cc = allCols[i];
            if (cc.is_hidden && colNames.indexOf(cc.name) < 0) {
                arr.push(cc);
                this.HiddenColCount++;
            }
        }

        return arr;
    } else {
        var arr = [];
        for (var j = 0; j < allCols.length; j++) {
            var cc = allCols[j];
            //默认不显示这种供选择的列
            if (!cc.col_select) {
                arr.push(cc);
                if (cc.is_hidden) {
                    this.HiddenColCount++;
                }
            }
        }
        return arr;
    }
}

JClient.UI.FilterItemArr = function (arr, field_name, val) {
    if (arr) {
        for (var i = 0; i < arr.length; i++) {
            var item = arr[i];
            if (item[field_name] == val) {
                return item;
            }
        }
    }
    return null;
}

///显示数据
JClient.UI.Sheet.prototype.rebuildTableBySelectedCols = function (_RMeta) {
    this.AllCols = this.AllCols || this.getDefaultAllCols();

    if (this.AllCols.length > 0 && this.AllCols[0].is_hidden == undefined) {
        var tmp_wrap_id = '___' + this.Id + '_' + 'tmp_sp_wrap';
        var $tmp_wrap = $('#' + tmp_wrap_id);
        if ($tmp_wrap.length == 0) {
            $(document.body).append('<div id="' + tmp_wrap_id + '">');
            $tmp_wrap = $('#' + tmp_wrap_id);
        }
        for (var i = 0; i < this.AllCols.length; i++) {
            var cc = this.AllCols[i];
            var $sp = $('<span ' + cc.Class + '>' + i + '</span>');
            if (cc.css) {
                $sp.addClass(cc.css);
            }
            $tmp_wrap.append($sp);
            //cc.is_hidden = $sp.hasClass('hide');
            cc.is_hidden = $sp.is(':hidden');
        }
        $tmp_wrap.remove();
    }

    var newTheadCols = this.getNewHeaderCols();

    //var myFilter = function (arr, field_name, val) {
    //    if (arr) {
    //        for (var i = 0; i < arr.length; i++) {
    //            var item = arr[i];
    //            if (item[field_name] == val) {
    //                return item;
    //            }
    //        }
    //    }
    //    return null;
    //}

    var col_head_count = this.DataTable.find('>thead td').length;
    this.rebuildCount = this.rebuildCount ? this.rebuildCount : 0;
    if (this.rebuildCount == 0) {
        this.rebuildThead(newTheadCols);
        this.rebuildCount++;
        this.ColumnsCount = newTheadCols.length;
        col_head_count = this.DataTable.find('>thead td').length;
        this.DataEmptyRow.find('td').attr("colspan", col_head_count - this.HiddenColCount);
        this.DataTable.find('>tfoot td').attr("colspan", col_head_count - this.HiddenColCount);
    }

    var tbody = this.DataTable.find(">tbody");

    if (tbody.length == 0) {
        tbody = $('<tbody>');
        this.DataTable.append(tbody);
    }

    if (this.SelectCbx != null) {
        this.SelectCbx.attr("checked", false);
    }

    tbody.empty();
    var rows = null;
    if (!_RMeta) {
        this.RowCounts = this.SheetPage.CurPageRows ? this.SheetPage.CurPageRows[0].TableRowsCount : 0;
        _RMeta = {
            TableRows: this.SheetPage.CurPageRows,
            TableRowsCount: this.RowCounts
        };
    }
    this.RowCounts = _RMeta.TableRowsCount;
    rows = _RMeta.TableRows;
    this.SheetPage.CurPageRows = rows;
    if (this.AllowPaging != "false") {
        this.SheetPage.MaxCount = _RMeta.TableRowsCount;
    } else {/*如果不分页,记录一个行数*/
        this.SheetPage.MaxCount = rows ? rows.length : 0;
    }

    if (rows != null) {
        for (var i = 0; i < rows.length; i++) {
            var d = rows[i];
            var tr = $("<tr>").addClass("tb").appendTo(tbody);
            var id = "";
            var _pk_name = "";
            var _pk_id = "";
            if (d[this.PK] != undefined)
                id = d[this.PK];
            tr.attr("id", id);
            tr.data("row", d);
            tr.data("Sheet", this);
            if (d[this.PKNAME] != undefined)
                _pk_name = d[this.PKNAME];
            if (d[this.PKID] != undefined)
                _pk_id = d[this.PKID];
            if (this.RowSelect) {
                var self = this;
                tr.bind("click", function () { self.SelectRow = this; self.RowSelect(this); });
            }
            if (this.AllowSelect == "true") {
                //var seltd = '';
                //if (this.SelectClick != null) {
                //    seltd = "<td style='text-align:center;width:20px;'><input type='checkbox' onchange=" + this.SelectClick(id) + " selectId='" + id + "' class='check' /></td>"
                //}
                //else {
                //    seltd = "<td style='text-align:center;width:20px;'><input type='checkbox' selectId='" + id + "' class='check' /></td>";
                //}
                var tdbox = $("<td style='text-align:center;width:20px;'><input type='checkbox' value='" + id + "'  selectId='" + id + "' selectName = '" + HTMLDecodeToEmpty(_pk_name) + "' selectPKId ='" + _pk_id + "' class='check' /></td>").appendTo(tr);
                if (this.BoxClick) {
                    var self = this;
                    tdbox.find('input').bind('change', function (event) { self.BoxClick(this); });
                }
            }
            if (this.AutoRowNum == "true") {

                $("<td class='td_30'>" + (i + 1) + "</td>").appendTo(tr);
            }

            for (var j = 0; j < newTheadCols.length; j++) {
                var vaa = newTheadCols[j];
                var c = JClient.UI.FilterItemArr(this.SheetCols, 'Key', vaa.name);
                if (!c) {

                    var $vtd = $("<td></td>");
                    if (vaa.Class) {
                        $vtd = $("<td  " + vaa.Class + " ></td>");
                    } else if (vaa.css) {
                        $vtd.addClass(vaa.css);
                    }
                    $vtd.append(d[vaa.name]);
                    $vtd.attr('colName', vaa.name);
                    tr.append($vtd);
                    continue;
                }
                try {
                    var text = c.getText(d);
                    var error = false;
                    if (this.CheckColumns() == true) {
                        if (c.Edit == "true" && c.EditControl == "select") {
                            var controlName = c.EditControl;
                            var ctrl = c.Panel.find(controlName);
                            if (ctrl.length == 1) {
                                var len = ctrl.find("option[title='" + text + "']");
                                if (len.length == 0) {
                                    error = true;
                                }
                            }
                        }
                    }

                    var tdname = '';
                    if (c.TdName != undefined) {
                        tdname = " name='" + d[c.TdName] + "'";
                    }

                    var new_td = $("<td  " + c.Class + "  " + tdname + " colName='" + c.Key + "' ></td>").html(text).appendTo(tr);
                    if (error) {
                        new_td.addClass("col-td-dataerror");
                    }
                } catch (e) {
                    $("<td  " + c.Class + "  " + tdname + ">").html("").appendTo(tr);
                }
            }
        }
    }
    if (rows == undefined || rows.length == 0) {
        this.DataEmptyRow.show();
        tbody.append(this.DataEmptyRow);
        this.DataEmptyRow.find('td').attr("colspan", col_head_count - this.HiddenColCount);
        this.DataTable.find('>tfoot td').attr("colspan", col_head_count - this.HiddenColCount);
        this.NoData();
        if (this.RowSelect) {
            this.SelectRow = null;
            this.RowSelect();
        }
    }
    else {
        if (this.AllowSelect == "true") {
            this.DataTable.find("thead>tr>td:first").show();
        }
        this.DataEmptyRow.hide();
        if (this.RowSelect) {
            this.DataTable.find(">tbody>tr:eq(0)").click();
        }
    }

    if (this.AllowPaging != "false") {
        this.SheetPage.pageRender();
        //tbody.append(this.Page);
        this.Page.insertAfter(tbody);
    }

    this.drag = this.Panel.attr("drag");
    if (this.drag) {
        $('.JCLRgrips').remove();
        var fn = this.Panel.attr("dragfn");
        if (fn) { fn = eval(fn) } else { fn = null; }
        this.DataTable.colResizable({
            liveDrag: true,
            gripInnerHtml: "<hr size=28  class='line' color=\"#999999\">",// "<div class='grip'></div>",
            draggingClass: "dragging",
            onResize: fn
        });
    }

    this.LoadDataFinished(_RMeta);

}

JClient.UI.Sheet.prototype.GetCurPageSimple = function () {
    var gurl = GUrl ? GUrl : "";
    var curPage = location.href.substr(0, location.href.indexOf('?')).replace(GUrl, '');
    return curPage;
}

JClient.UI.Sheet.prototype.GetUserSelectedColNames = function () {
    if (this.UserSelectedColNames)
        return this.UserSelectedColNames;

    var divId = this.Id;
    var um = top.window._UserModel;
    if (!um) return;
    var curPage = this.GetCurPageSimple();
    um.UserFavCols = um.UserFavCols || [];
    var item = JClient.UI.FilterItemArr(um.UserFavCols, 'page', curPage);
    if (item) {
        item.tables = item.tables || [];
        for (var jj = 0; jj < item.tables.length; jj++) {
            var subc = item.tables[jj];
            if (subc.id == divId) {
                //#region 看是否有 新加的 字段
                if (subc.hide_cols) {
                    for (var kk = 0; kk < this.AllCols.length; kk++) {
                        var tmpCol = this.AllCols[kk];
                        var tmpColname = tmpCol.name;
                        //新字段
                        if (!tmpCol.is_hidden && !tmpCol.col_select && subc.cols.indexOf(tmpColname) < 0 && subc.hide_cols.indexOf(tmpColname) < 0) {
                            subc.cols.push(tmpColname);
                        }
                    }
                }
                //#endregion

                //#region 删除废弃的字段
                if (subc.cols) {
                    var del_cols = [];
                    for (var kk = 0; kk < subc.cols.length; kk++) {
                        var tmpColname = subc.cols[kk];
                        var ccc = JClient.UI.FilterItemArr(this.AllCols, 'name', tmpColname);
                        if ((ccc && ccc.is_hidden) || !ccc) {
                            del_cols.push(tmpColname);
                        }
                    }
                    for (var kk = 0; kk < del_cols.length; kk++) {
                        subc.cols.remove(del_cols[kk]);
                    }
                }
                //#endregion

                this.UserSelectedCol_PageItem = item;
                this.UserSelectedCol_Obj = subc;
                this.UserSelectedColNames = subc.cols;
                return this.UserSelectedColNames;
            }
        }
    } else {
        item = { page: curPage, tables: [] };
        //um.UserFavCols.push(item);
    }

    var newColObj = { id: divId, cols: [] };
    item.tables.push(newColObj);
    this.UserSelectedCol_Obj = newColObj;
    this.UserSelectedCol_PageItem = item;
    this.UserSelectedColNames = [];
    return this.UserSelectedColNames;
}

//保存到数据库
JClient.UI.Sheet.prototype.SaveUserSelectedColNames = function (selArr, hideArr) {
    this.UserSelectedColNames = selArr;
    this.UserSelectedCol_Obj.cols = this.UserSelectedColNames;
    this.UserSelectedCol_Obj.hide_cols = hideArr;
    var um = top.window._UserModel;
    if (!um) return;
    var curPage = this.GetCurPageSimple();
    var item = JClient.UI.FilterItemArr(um.UserFavCols, 'page', curPage);
    if (!item) {
        um.UserFavCols.push(this.UserSelectedCol_PageItem);
    }
    var onsucc = function (_RMeta) {
        if (!_RMeta.ClientInfo.Result) {
            Box.Alert(GRESX.HINTS.TITLE, _RMeta.ClientInfo.Message, null, { icon: 'hits.gif', width: '250' });
        }
    }
    Ajax.Request("Common.ashx", { Call: 'SaveUserFavCols', fav_cols: JSON.stringify(um.UserFavCols) }, onsucc);
}

JClient.UI.Sheet.prototype.ClearUserSelectedColNames = function () {
    var um = top.window._UserModel;
    if (!um) return;
    var curPage = this.GetCurPageSimple();
    var item = JClient.UI.FilterItemArr(um.UserFavCols, 'page', curPage);
    if (item) {
        item.tables.remove(this.UserSelectedCol_Obj);
        this.UserSelectedColNames = null;
        this.UserSelectedCol_Obj = null;
        var onsucc = function (_RMeta) {
            if (!_RMeta.ClientInfo.Result) {
                Box.Alert(GRESX.HINTS.TITLE, _RMeta.ClientInfo.Message, null, { icon: 'hits.gif', width: '250' });
            }
        }
        Ajax.Request("Common.ashx", { Call: 'SaveUserFavCols', fav_cols: JSON.stringify(um.UserFavCols) }, onsucc);
    }
}

JClient.UI.Sheet.prototype.PopupColDialog = function () {
    var theSheet = this;
    this.GetUserSelectedColNames();
    var $div = $('<div>');
    //var elments = [];//存储选中的字段
    var $lbl_arr = [];
    var $lbl_uncheck_arr = [];

    for (var i = 0; i < this.AllCols.length; i++) {
        var icol = this.AllCols[i];
        if (!JClient.AllowSelectHiddenColumn && icol.is_hidden) {
            continue;
        }
        var $lbl = $('<label>');
        var $chk = $('<input type="checkbox" name="__popup_sheet_cols" />');
        $chk.val(icol.name);
        $lbl.append($chk).append(icol.text);
        var cidx = this.UserSelectedColNames.indexOf(icol.name);
        var checked = cidx >= 0 || (this.UserSelectedColNames.length == 0 && !icol.col_select);
        //if (icol.col_select == false) {
        //    elments.push({key: this.AllCols[i].name});

        //}
        if (checked) {
            $chk.attr('checked', 'checked');
            $lbl_arr.push({ cc: $lbl, idx: cidx });
        } else {
            $lbl_uncheck_arr.push($lbl);
        }
    }
    if (this.UserSelectedColNames.length > 0) {
        var mycompare_asc = function (property) {
            return function (a, b) {
                var value1 = a[property];
                var value2 = b[property];
                return value1 - value2;
            }
        }
        $lbl_arr.sort(mycompare_asc('idx'));
    }
    for (var i = 0; i < $lbl_arr.length; i++) {
        $div.append($lbl_arr[i].cc);
    }
    for (var i = 0; i < $lbl_uncheck_arr.length; i++) {
        $div.append($lbl_uncheck_arr[i]);
    }
    
    var url = "url:" + GUrl + "/IhgForms/IhgColSelect.aspx";
    if (GetPublishConfig("tableSelect", "isNew")) {
        url = "url:" + GUrl + "/IhgForms/IhgColSelectNew.aspx";
    }
    var theDialog = $.dialog;
    var lhDia = null;
    if (!theDialog) {
        theDialog = frameElement.api.opener.$.dialog;
        lhDia = frameElement.api.opener.lhgdialog;
    } else {
        lhDia = lhgdialog;
    }

    theDialog({
        title: '自定义显示列', content: url, lock: true, width: 500,
        height: 500, max: false, min: false, resize: false,
        parent: document, focus: true, id: '_popup_col_dialog',
        init: function () {
            try {
                var _object = lhDia.list['_popup_col_dialog'].content;
                _object.PopupCol.div_html = $div.html();
                _object.PopupCol.InitData();
            }
            catch (e) {
            }
        },
        close: function () {
            try {
                var _object = lhDia.list['_popup_col_dialog'].content;
                var action_code = _object.PopupCol.action;
                if (action_code == 'ok') {
                    var $cnt = _object.PopupCol.$content;
                    var $cnt1 = _object.PopupCol.$content1;
                    if (GetPublishConfig("tableSelect", "isNew")) {
                        var $chkArr = $cnt.find("li");
                        var arr = [];
                        var hideArr = [];
                        $chkArr.each(function () {
                            var self = $(this);
                            arr.push(self.attr("name"));
                        });
                        var $chkArr1 = $cnt1.find("input[type='checkbox'][name='__popup_sheet_cols']");
                        $chkArr1.each(function () {
                            var self = $(this);
                            if (!self.attr("checked")) {
                                hideArr.push(self.val());
                            }
                        });
                    }
                    else {
                        var $chkArr = $cnt.find("input[type='checkbox'][name='__popup_sheet_cols']");
                        var arr = [];
                        var hideArr = [];
                        $chkArr.each(function () {
                            var self = $(this);
                            if (self.attr("checked")) {
                                arr.push(self.val());
                            } else {
                                hideArr.push(self.val());
                            }
                        });
                    }
                    
                    theSheet.SaveUserSelectedColNames(arr, hideArr);
                    theSheet.rebuildCount = 0;
                    theSheet.rebuildTableBySelectedCols();
                } else if (action_code == "restore") {
                    theSheet.ClearUserSelectedColNames();
                    theSheet.rebuildCount = 0;
                    theSheet.rebuildTableBySelectedCols();
                }
            } catch (e) {
                console.error(e)
                return true;
            }
        },
        zIndex:99999
    });
}


//获取选择的列的text
JClient.UI.Sheet.prototype.getSelectedColText = function (colname, distinct) {
    var tbody = this.DataTable.find("tbody");
    var text = "";
    tbody.find("input.check").each(function () {
        if ($(this).attr("checked") == "checked" || $(this).attr("checked") == true) {
            var tr = $(this).parent().parent();
            var tmp = tr.find("td[colname='" + colname + "']").text();
            if (distinct == true && text.indexOf(tmp) > -1) {
                return true;
            }
            text += tmp + ',';
        }
    });
    if (text.length > 0) {
        text = text.substring(0, text.length - 1);
    }
    return text;
}
//#endregion

//#regin 超凡
// 加载List 数据
JClient.UI.Sheet.prototype.CurrentData = {};  // 保存本地的数据，非远程
JClient.UI.Sheet.prototype.LoadListData = function (_RMeta) {
    if (_RMeta instanceof Array) {
        var newData = {};
        newData.TableRows = _RMeta;
        newData.TableRowsCount = _RMeta.length;
        this.CurrentData = newData;
        CFloadMySheetData(this);
    }
}

///取数据
var CFloadMySheetData = function (e) {
    var self = e;
    var data = e.SheetPage.getSearchPrams();

    if (self.Handler) { // 远程取数据
        Ajax.Request(self.Handler, data, Success);
    } else { // 非远程的数据，假分页
        var pageindex = parseInt(data.pageIndex);
        var pagesize = parseInt(data.pageSize);
        if (self.CurrentData.TableRows) {
            var tmpList = self.CurrentData.TableRows.concat();
            tmpList = tmpList.slice(pagesize * (pageindex - 1), pagesize * pageindex);
            Success({ "TableRowsCount": self.CurrentData.TableRowsCount, "TableRows": tmpList });
        }
    }

    function Success(_RMeta) {
        if (_RMeta.ClientInfo != null && _RMeta.ClientInfo.Message != null) {
            Box.Alert(GRESX.HINTS.TITLE, _RMeta.ClientInfo.Message, null, { icon: 'hits.gif' });
            return;
        }
        try {
            self.LoadDataBefore(_RMeta);
            self.structMySheetData(_RMeta);
            self.LoadDataFinished(_RMeta);

            if (self.goPageCallBack)
                self.goPageCallBack(self.DataTable.find(".pageleft")[0].innerHTML);
            $("table.nobgtable").colResizable({ liveDrag: true, draggingClass: "dragging", headerOnly: true });

            self.LoadTableFinished(_RMeta);
        } catch (e) { }
    }
}

JClient.UI.Sheet.prototype.LoadDataBefore = function (_RMeta) {
}

JClient.UI.Sheet.prototype.LoadTableFinished = function (data) {
}

//#endregin


