
/******默认加载一个多语言*****/
$(function () {
    SetPageLanguage();
    //GetDivIsShow("IC_Hide"); //关闭批量下载
    layui.use('layer', function () {
        var layer = layui.layer;
        $('[data-toggle="tooltip"]').off('mouseenter').off('mouseleave').on({
            mouseenter: function () {
                that = $(this);
                aTitle = that.attr("title");
                if (aTitle) {
                    that.attr("title", "");
                    table = layer.tips(aTitle, that, { tips: 1, time: 9999000, });
                    //当title位于最右边时，样式需要调整
                    /*let windowWidth = $(window).width();
                    let item = $(that).offset().left;
                    let aWidth = $('.layui-layer-content').innerWidth();
                    console.log(windowWidth + "阿" + item + 'a' + aWidth);
                    console.log(item + aWidth );
                    if (windowWidth < item + aWidth + 2) {
                        let left = "left:" + (aWidth - 20) + "px!important";
                        //判断是否位于较上方
                        if ($(that).offset().top - $('.layui-layer-content').innerHeight() < 2) {
                            $('.layui-layer-tips i.layui-layer-TipsB').css("cssText", left);
                        } else {
                            $('.layui-layer-tips i.layui-layer-TipsT').css("cssText", left);
                        }
                        let contentLeft = "left:" + $('.layui-layer-content').css("left").substring(1) + "!important";
                        $('.layui-layer-content').css("cssText", contentLeft);
                    }*/
                }
            },
            mouseleave: function () {
                if (aTitle) {
                    that.attr("title", aTitle);
                    layer.close(table);
                }
            }
        });
    })
    // 案件名称预览(针对于有上下角标的)
    CaseNameView();

    //if (GetPublishConfig("index", "is_New")) {
    //    $(document).ready(function () {
    //        $(".btn-search span").each(function () {
    //            if ("查询" == $(this).text()) {
    //                $(this).parent().css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //        $(".btn-search").each(function () {
    //            if ("查询" == $(this).text()) {
    //                $(this).css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //        $(".btn-style-img span").each(function () {
    //            if ("查询" == $(this).text()) {
    //                $(this).parent().css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //        $(".btn-style-img").each(function () {
    //            if ("查询" == $(this).text()) {
    //                $(this).css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //    })
    //}

    // 商标检索系统内嵌页面调用
    window.addEventListener('message', function (msg) {
        if (!msg || !msg.data || ("https://tm.wadeinfo.com" != msg.origin && "trademarkSearch" != msg.data.source && "ipbuddy" != msg.data.source)) {
            return;
        }
        var param = {};
        var guid = NewGuid();
        param.guid = guid;
        param.menu_id = msg.data.url;
        param.url = msg.data.url;
        param.html = "<iframe src='" + msg.data.url + "' width='100%' height='100%' frameborder='0'></iframe>";

        // 检索详情页
        if ('openDetail' == msg.data.type) {
            var regNo = GetParaValue(msg.data.url, "regNo") || '';
            var intCls = GetParaValue(msg.data.url, "intCls") || '';
            param.title = '商标详情-' + regNo + '-' + intCls;
            param.id = "tm_detail_" + regNo + '_' + intCls;
            top.tabPanel.addTab(param)
        }
        // 美国详情页
        else if ('openDetailUS' == msg.data.type) {
            param.title = '美国商标详情-' + GetParaValue(msg.data.url, "serialNumber") || '';
            param.id = "tm_detailus_" + GetParaValue(msg.data.url, "serialNumber") || guid;
            top.tabPanel.addTab(param)
        }
        // 商标检索页
        else if ('openSearch' == msg.data.type) {
            param.title = '商标检索';
            param.id = "tm_search";
            top.tabPanel.addTab(param)
        }
        // 异议决定书查询页
        else if ('openObjection' == msg.data.type) {
            param.title = '异议决定书查询-' + decodeURI(GetParaValue(msg.data.url, "word") || '');
            param.id = "tm_objection_" + guid;
            top.tabPanel.addTab(param)
        }
        // 评审文书查询页
        else if ('openReview' == msg.data.type) {
            param.title = '评审文书查询-' + decodeURI(GetParaValue(msg.data.url, "word") || '');
            param.id = "tm_review_" + guid;
            top.tabPanel.addTab(param)
        }
        // 异议决定书详情页
        else if ('openObjectionDetail' == msg.data.type) {
            param.title = '异议决定书详情-' + decodeURI(GetParaValue(msg.data.url, "docNo") || '');
            param.id = "tm_objection_detail_" + decodeURI(GetParaValue(msg.data.url, "docNo") || '').replace(/[^0-9a-zA-Z]/g, "");
            top.tabPanel.addTab(param)
        }
        // 评审文书详情页
        else if ('openReviewDetail' == msg.data.type) {
            param.title = '评审文书详情-' + decodeURI(GetParaValue(msg.data.url, "docNo") || '');
            param.id = "tm_review_detail_" + decodeURI(GetParaValue(msg.data.url, "docNo") || '').replace(/[^0-9a-zA-Z]/g, "");
            top.tabPanel.addTab(param)
        }
        // 商标对比页
        else if ('openComparison' == msg.data.type) {
            param.title = '商标对比-' + GetParaValue(msg.data.url, "regNo").replace(/,/g, "_");
            param.id = "tm_comparison_" + GetParaValue(msg.data.url, "regNo").replace(/,/g, "_");
            top.tabPanel.addTab(param)
        }
        // 商标图谱页
        else if ('openAtlas' == msg.data.type) {
            param.title = '商标图谱-' + decodeURI(GetParaValue(msg.data.url, "registrant") || '');
            param.id = "tm_atlas_" + guid;
            top.tabPanel.addTab(param)
        }
        // 切换国家（废弃）
        else if ('changeCountry' == msg.data.type) {
            param.title = msg.data.country + '商标检索';
            msg.data.country = '美国' == msg.data.country ? 'US' : 'CN';
            param.id = "tm_search_" + msg.data.country;
            top.tabPanel.addTab(param)
        }
        // 保存检索页面的lay-id
        else if ('saveLayId' == msg.data.type) {
            var layId = top.$(".tabpanel_mover").find(".active").attr("id");
            top.trademarkSearchLayId = layId;
        }
        // 返回检索页面
        else if ('toRoot' == msg.data.type) {
            var layId = top.trademarkSearchLayId;
            top.trademarkSearchId = -1;
            for (var i = 0; i < top.tabPanel.tabs.length; i++) {
                var tab = top.tabPanel.tabs[i];
                if (tab['id'] == layId) {
                    top.trademarkSearchId = i;
                }
            }
            if (top.trademarkSearchId && top.trademarkSearchId > -1 && top.trademarkSearchId < top.tabPanel.tabs.length) {
                top.tabPanel.onTabClick({}, top.trademarkSearchId, false);
            }
        }
        // IPBuddy
        else if ("ipbuddy:agent-workspace" == msg.data.type) {
            // 打开发文草稿页面
            if (msg.data.action == "open-email-draft") {
                top.MenuEvent2(this, 'b4dd5372-a96d-40a6-8576-277b90a7efcf');
            }
            // 打开案件
            else if (msg.data.action == "open-patent-case") {
                var caseId = GetParaValue(msg.data.url, "caseId") || '';
                var caseVolume = GetParaValue(msg.data.url, "caseVolume") || '';
                PublicOpenCase(caseId, caseVolume, "31D1A147-2931-43B5-94AE-B72B1525BA8A");
            }
            // 打开文件
            else if (msg.data.action == "open-file") {
                var fileNo = GetParaValue(msg.data.url, "fileNo") || '';
                var fileName = GetParaValue(msg.data.url, "fileName") || '';
                ViewFile(fileNo, fileName, '', '', '');
            }
            // 打开请款单页面
            else if (msg.data.action == "open-payment-request-detail") {
                var objid = GetParaValue(msg.data.url, "objid") || '';
                top.window.AddBusinessTab(objid, '请款单', "Forms/Bill/RequestDetail.aspx?objid=" + objid);
            }
        }
    });


    // 专利检索系统内嵌页面调用
    window.addEventListener('message', function (msg) {
        if (!msg || !msg.data || ('https://cs.wadeinfo.com:6012' != msg.origin && 'patentSearch' != msg.data.source)) {
            return;
        }
        var param = {};
        var guid = NewGuid();
        param.guid = guid;
        param.menu_id = msg.data.url;
        param.html = "<iframe src='" + msg.data.url + "' width='100%' height='100%' frameborder='0'></iframe>";
        // 详情页
        if ('openDetail' == msg.data.type) {
            var pn = GetParaValue(msg.data.url, 'PN') || GetParaValue(msg.data.url, 'pn') || ''
            param.title = '专利详情-' + pn
            param.id = 'patent_detail_' + pn
            top.tabPanel.addTab(param)
        }
        // 检索页
        else if ('openSearch' == msg.data.type) {
            param.title = '专利检索'
            param.id = 'patent_search'
            top.tabPanel.addTab(param)
        }
        // 批量检索页
        else if ('openBatchSearch' == msg.data.type) {
            param.title = '专利批量检索'
            param.id = 'patent_batch_search'
            top.tabPanel.addTab(param)
        }
        // 专利图谱页
        else if ('openAtlas' == msg.data.type) {
            param.title = '专利图谱-' + decodeURI(GetParaValue(msg.data.url, 'applicant') || '')
            param.id = 'patent_atlas'
            top.tabPanel.addTab(param)
        }
        // 导出历史记录页面
        else if ('openExportHistory' == msg.data.type) {
            param.title = '导出历史记录'
            param.id = 'patent_export_history'
            top.tabPanel.addTab(param)
        }
    });
})


//屏蔽退格键（防止意外返回上一页面）
document.onkeypress = forbidBackSpace;
document.onkeydown = forbidBackSpace;
function forbidBackSpace(e) {
    var ev = e || window.event;
    if (ev.keyCode == 8) {
        var obj = ev.target || ev.srcElement;

        // 新增：支持可编辑元素（contenteditable）的退格键
        if (obj.contentEditable === "true" || obj.isContentEditable) {
            return;
        }

        var t = obj.type || obj.getAttribute('type');
        var vReadOnly = obj.readOnly;
        var vDisabled = obj.disabled;
        vReadOnly = (vReadOnly == undefined) ? false : vReadOnly;
        vDisabled = (vDisabled == undefined) ? true : vDisabled;
        var flag1 = (t == "password" || t == "text" || t == "textarea" || t == "search") && (vReadOnly || vDisabled);
        var flag2 = t != "password" && t != "text" && t != "textarea" && t != "search";
        if (flag2 || flag1) {
            return false;
        };

    }
}

/*------------------------公共函数(一) 公共方法 ------------------------start*/
/*********Ajax访问后台公共方法*******/
/****_sync是否同步 true 同步，false或者不传参数为异步*****/
/*_ErrCallBack 出现异常时的回调函数，一般用作状态处理*/
var Ajax = {};
Ajax.Request = function (_Url, _Data, _CallBack, _sync, _ErrCallBack, cnfg) {

    _Url = GUrl + '/AjaxServers/' + _Url;


    if (!_Data["log_pagename"]) {
        _Data["log_pagename"] = GetPageName();
    }

    ///认证失效,重新登陆
    function ReloginFun(_Meta) {
        top.window.ReLoginDialog();
    }

    ///后台执行发生异常,弹出提示框
    function ExceFun(_Meta) {
        Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'fail.gif' });
    }

    var _config = {
        url: _Url, type: 'POST', data: _Data, async: _sync ? false : true, dataType: "json",
        success: function (_Meta, request) {
            if (_Meta.ClientInfo && _Meta.ClientInfo.Status) {
                if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                    _CallBack(_Meta);
                }
            }
            else {
                if (_ErrCallBack) {
                    _ErrCallBack(_Meta);
                }
                if (_Meta.ClientInfo.IsLogin) {
                    ExceFun(_Meta); return;
                }
                else {
                    ReloginFun(_Meta); return;
                }
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
        }
    }
    if (cnfg) {
        $.extend(_config, cnfg)
    }
    $.ajax(_config);
}

Ajax.ApiRequest = function (_Url, _Data, _CallBack, _sync, _ErrCallBack, cnfg) {
    if (!_Data["log_pagename"]) {
        _Data["log_pagename"] = GetPageName();
    }

    if (!_Data["token"] && WadeAPI) {
        var _token = $.md5(DateTo(new Date()) + WadeAPI.TOKEN);
        _Data["token"] = _token;
    }
    var _config = {
        url: _Url, type: 'POST', data: _Data, async: _sync ? false : true, dataType: "json",
        success: function (_Meta, request) {
            if (_Meta && _Meta.code == "401" && _Url.indexOf(WadeAPI.Ping) == -1) {
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "接口调用错误,请检查接口配置信息!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "接口调用错误,请检查接口配置信息!", null, { icon: 'hits.gif' });
            }
        },
        error: function (data) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "接口调用错误,请检查接口配置信息!", null, { icon: 'hits.gif' });
            }
        }
    }
    if (cnfg) {
        $.extend(_config, cnfg)
    }
    $.ajax(_config);
}

/**
 * 调用cpc客户端的api接口
 * @param {any} _Url
 * @param {any} _data
 * @param {any} _CallBack
 * @param {any} _sync
 * @param {any} _ErrCallBack
 * @param {any} cnfg
 */
Ajax.CpcApiRequest = function (_Url, _data, _CallBack, _sync, _ErrCallBack, cnfg) {
    var _config = {
        url: _Url
        , type: 'POST'
        , data: _data
        , async: _sync ? false : true
        , mimeType: "multipart/form-data"
        , contentType: false
        , processData: false
        , timeout: 0
        , xhrFields: { withCredentials: false }
        , success: function (_Meta, request) {
            if (_Meta && _Meta.code == "401" && _Url.indexOf(WadeAPI.Ping) == -1) {
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "接口调用错误,请检查接口配置信息!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
            }
        },
        error: function (data) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                if (!!data && !!data.responseText) {
                    var response = eval("(" + data.responseText + ")");
                    if (!!response.message) {
                        if (response.message.indexOf("list.xml") > 0) {
                            Box.Alert(GRESX.HINTS.TITLE, "PCT国际案件请先手动下载递交案卷包到客户端中导入!", null, { icon: 'hits.gif' });
                        } else {
                            Box.Alert(GRESX.HINTS.TITLE, response.message, null, { icon: 'hits.gif' });
                        }
                    } else {
                        Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
                    }
                } else {
                    Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
                }
            }
        }
    }
    if (cnfg) {
        $.extend(_config, cnfg)
    }
    $.ajax(_config);
}

Ajax.CpcApiRequestJson = function (_Url, _data, _CallBack, _sync, _ErrCallBack, cnfg) {
    var _config = {
        url: _Url
        , type: 'POST'
        , data: _data
        , async: _sync ? false : true
        , timeout: 0
        , headers: {
            "Content-Type": "application/json"
        }
        , xhrFields: { withCredentials: false }
        , success: function (_Meta, request) {
            if (_Meta && _Meta.code == "401" && _Url.indexOf(WadeAPI.Ping) == -1) {
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "接口调用错误,请检查接口配置信息!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
            }
        },
        error: function (data) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                if (!!data && !!data.responseText) {
                    var response = eval("(" + data.responseText + ")");
                    if (!!response.message) {
                        if (response.message.indexOf("list.xml") > 0) {
                            Box.Alert(GRESX.HINTS.TITLE, "PCT国际案件请先手动下载递交案卷包到客户端中导入!", null, { icon: 'hits.gif' });
                        } else {
                            Box.Alert(GRESX.HINTS.TITLE, response.message, null, { icon: 'hits.gif' });
                        }
                    } else {
                        Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
                    }
                } else {
                    Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
                }
            }
        }
    }
    if (cnfg) {
        $.extend(_config, cnfg)
    }
    $.ajax(_config);
}


Ajax.CpcApiRequestGet = function (_Url, _data, _CallBack, _sync, _ErrCallBack, cnfg) {
    var _config = {
        url: _Url
        , type: 'GET'
        , data: _data
        , async: _sync ? false : true
        , mimeType: "multipart/form-data"
        , contentType: false
        , processData: false
        , timeout: 0
        , xhrFields: { withCredentials: false }
        , success: function (_Meta, request) {
            if (_Meta && _Meta.code == "401" && _Url.indexOf(WadeAPI.Ping) == -1) {
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "接口调用错误,请检查接口配置信息!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
            }
        },
        error: function (data) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                if (!!data && !!data.responseText) {
                    var response = eval("(" + data.responseText + ")");
                    if (!!response.message) {
                        if (response.message.indexOf("list.xml") > 0) {
                            Box.Alert(GRESX.HINTS.TITLE, "PCT国际案件请先手动下载递交案卷包到客户端中导入!", null, { icon: 'hits.gif' });
                        } else {
                            Box.Alert(GRESX.HINTS.TITLE, response.message, null, { icon: 'hits.gif' });
                        }
                    } else {
                        Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
                    }
                } else {
                    Box.Alert(GRESX.HINTS.TITLE, "请先启动本地CPC客户端!", null, { icon: 'hits.gif' });
                }
            }
        }
    }
    if (cnfg) {
        $.extend(_config, cnfg)
    }
    $.ajax(_config);
}

/***********HTML中字段的多语言处理(一般纯文字，同时包含input类型的value值)********************/
function SetPageLanguage() {

    var spanlist = $('span[name=Dictionary]');
    for (var i = 0; i < spanlist.length; i++) {
        var _span = $(spanlist[i]);
        var _result = GetResource(_span.attr('lid'), '');
        if (_result != '') {
            _span.text(_result);
        }
    }

    var inputlist = $('input[name=Dictionary]');
    for (var i = 0; i < inputlist.length; i++) {
        var _input = $(inputlist[i]);
        var _result = GetResource(_input.attr('lid'), '');
        if (_result != '') {
            _input.val(_result);
        }
    }

}


/* 获取Url中参数，并将参数转化josn类型 */
function getParas(_Url) {
    var input = _Url || window.location.search.trim('[?]');
    if (input == "") return {};

    /*******去掉链接,只保留参数  TQ 2014-07-29******/
    input = input.substring(input.indexOf('?') + 1, input.length);

    var pairs = input.split("&");
    var params = {};
    for (var i = 0; i < pairs.length; i++) {
        var vs = pairs[i].split("=");
        params[vs[0]] = vs[1];
    }
    return params;
}

/*获取URL参数值 Hj*/
function GetParaValue(_Url, _Key) {
    var _String = _Url.substring(_Url.indexOf("?") + 1, _Url.length).split("&");
    var _Obj = {}
    for (i = 0; j = _String[i]; i++) {
        _Obj[j.substring(0, j.indexOf("=")).toLowerCase()] = j.substring(j.indexOf("=") + 1, j.length);
    }
    if (typeof (_Key) == "undefined") {
        return "";
    }
    var _value = _Obj[_Key.toLowerCase()];
    if (typeof (_value) == "undefined") {
        return "";
    } else {
        return _value.replace('#', '');
    }
}

/*****JS产生一个32位的GUID******/
function NewGuid() {
    var guid = "";
    for (var i = 1; i <= 32; i++) {
        var n = Math.floor(Math.random() * 16.0).toString(16);
        guid += n;
        if ((i == 8) || (i == 12) || (i == 16) || (i == 20))
            guid += "-";
    }
    return guid;
}
//从后台获取
function GetGUID() {
    var id = "";
    function Success(data) {
        id = data.NEWGUID;
        if (!id) {
            id = NewGuid();
        }
    }
    Ajax.Request("Common.ashx", { Call: "GetGUID" }, Success, true);
    return id;
}

/*客户端Cookie操作 Hj*/
var Cookies = {
    Set: function (_Name, _Value) {
        $.cookie(_Name, _Value, { expires: 7, path: '/' });
    },
    Get: function (_Name) {
        return $.cookie(_Name)
    }
}


/* 获取多语言 */
function GetResource(_key, _value) {

    var _result = "";
    var _language = top.window.GLanguage;
    if (_language == "zh_cn")
        return _value;
    var _resource = eval(_language)
    if (_resource) {
        _result = _resource[_key];
        if (_result == null || _result == "" || typeof (_result) == "undefined") {
            _result = _value;
        }
    }

    else {
        _result = _value;
    }
    return _result;
}

///绑定页签点击事件
///lidivid : li页签所在的外框div 的id
///showdivid :内容div选择器
///CallBack: 回调函数
///example BinTabClick('dTop', '#content div.tbcontent', Patent.TabChangeAfter);
BinTabClick = function (lidivid, showdivid, BeforeCall, AfterCall) {
    $('#' + lidivid + ' li').unbind().click(function () {
        TabChangClick(this, showdivid, 'current', BeforeCall, AfterCall);
    });
}

//重写一个li样式的切换
BinTabLiClick = function (lidivid, showdivid, Class, BeforeCall, AfterCall) {
    $('#' + lidivid + ' li').unbind().click(function () {
        TabChangClick(this, showdivid, Class, BeforeCall, AfterCall);
    });
}


//页签点击切换效果
TabChangClick = function (Sli, ShowDiv, Class, BeforeCall, AfterCall) {
    if ($(Sli).hasClass(Class)) {
        return;
    }
    if (BeforeCall && typeof (BeforeCall) == 'function') {
        if (BeforeCall(Sli) === false) {
            return;
        }
    }
    $(Sli).siblings('li').removeClass(Class);
    $(Sli).addClass(Class);
    if (ShowDiv) {
        var sd = $(ShowDiv);
        var index = $(Sli).index();
        sd.hide().eq(index > sd.length - 1 ? sd.length - 1 : index).show();

    }
    if (AfterCall && typeof (AfterCall) == 'function') {
        AfterCall(Sli);
    }

}


function StrWrap(Str, Words_Per_line) {
    if (!Str) { return ""; }
    if (!Words_Per_line || !isNaN(Words_Per_line)) {
        Words_Per_line = 30;
    }
    else {
        Words_Per_line = parseInt(Words_Per_line);
    }
    var out_str = Str.substring(0, Words_Per_line);
    for (var i = Words_Per_line; i < Str.length; i = i + Words_Per_line) {
        out_str += "<br />" + Str.substr(Words_Per_line + i + 1, Words_Per_line);
    }
    return out_str;
}

//
function TitleTips(obj, event, words_per_line) {
    if (!obj.title) { return false; }
    var title_show = $('#title_show');
    if (title_show.length == 0) {
        title_show = $('<div id="title_show" class="title_tips" ></div>').appendTo('body');
        title_show.mouseenter(function () { $(this).show() }).mouseleave(function () { $(this).hide(); });
    }
    else {
        title_show.removeAttr('style');
    }
    document.title_value = obj.title;
    title_show.html(obj.title.replace(/\n/g, '<br/>'));
    obj.title = '';
    event = event || window.event;                            //鼠标、键盘事件
    var top_down = 1;
    var left = Math.min(event.clientX, document.body.clientWidth - title_show.outerWidth()) + 10;
    var scroll = getScrollTop()
    var top = scroll + event.clientY + top_down;
    var height = document.body.scrollHeight;
    var self_height = title_show.outerHeight();
    if (height - 50 < top + self_height) {
        top = event.clientY + scroll - self_height - top_down;
    }
    title_show.css('display', 'block').css('left', left + 'px').css('top', (top) + 'px');
    $(obj).unbind('mouseout').bind('mouseout', function () { RemoveTips(this); })
}

function RemoveTips(obj) {
    var title_show = document.getElementById("title_show");
    if (title_show == null) return false;
    obj.title = document.title_value;
    title_show.style.display = "none";
}

function ShowUserInfo(obj, user_id, event) {
    if (user_id) {
        function Success(_Meta) {
            var text = "没有找到此用户的详细信息";
            if (_Meta && _Meta.User) {
                text = "姓名：" + _Meta.User["cn_name"] + "<br/>部门：" + _Meta.User["dept_full_name"] + "<br/>邮箱：" + _Meta.User["email"] + "<br/>电话：" + _Meta.User["tel"];
            }
            var title_show = $('#title_user');
            if (title_show.length == 0) {
                title_show = $('<div id="title_user" class="title_tips" ></div>').appendTo('body');
            }
            else {
                title_show.removeAttr('style');
            }
            title_show.html(text);
            event = event || window.event;                            //鼠标、键盘事件
            var top_down = 5;                                        //下移15px避免遮盖当前标签
            //最左值为当前鼠标位置 与 body宽度减去悬停效果DIV宽度的最小值，否则将右端导致遮盖
            var left = Math.min(event.clientX, document.body.clientWidth - title_show.outerWidth()) + 10;
            var scroll = getScrollTop()
            var top = scroll + event.clientY + top_down;
            var height = document.body.scrollHeight;
            var self_height = title_show.outerHeight();
            if (height - 50 < top + self_height) {
                top = event.clientY + scroll - self_height - top_down;
            }
            title_show.css('display', 'block').css('left', left + 'px').css('top', (top) + 'px');
            $(obj).unbind('mouseout').bind('mouseout', function () { RemoveUserInfo(); })
        }
        Ajax.Request("Common.ashx", { Call: 'ShowUserInfo', user_id: user_id }, Success, true);
    }
}

function RemoveUserInfo() {
    $('#title_user').hide();
}

function getScrollTop() {
    var scrollTop = 0;
    if (document.documentElement && document.documentElement.scrollTop) {
        scrollTop = document.documentElement.scrollTop;
    }
    else if (document.body) {
        scrollTop = document.body.scrollTop;
    }
    return scrollTop;
}

/*------------------------公共函数(一) 公共方法 ------------------------end*/


/*------------------------公共函数(二) jquery扩展方法 ------------------------start*/

/* 获取Ajax返回客户端请求结果 David */
//$.getJson = function (result) { return $.parseJSON(result.responseText); }

///* 验证Ajax返回客户端数据是否合法 David */
//$.checkSuccess = function (result) {
//    var _Meta = $.getJson(result);
//    if (!_Meta.ClientInfo.IsLogin) { document.location.href = _Meta.ClientInfo.Url; return null; }
//    if (!_Meta.ClientInfo.Status) { alert("访问异常"); return null; }
//    if (_Meta.ClientInfo.Url != null) {
//        document.location.href = _Meta.ClientInfo.Url;
//        return null;
//    }
//    return _Meta;
//}

//解析XML字符串,返回一个xml对象
var loadXML = function (xmlString) {
    var xmlDoc = null;
    //判断浏览器的类型
    //支持IE浏览器
    if (!window.DOMParser && window.ActiveXObject) {   //window.DOMParser 判断是否是非ie浏览器
        var xmlDomVersions = ['MSXML.2.DOMDocument.6.0', 'MSXML.2.DOMDocument.3.0', 'Microsoft.XMLDOM'];
        for (var i = 0; i < xmlDomVersions.length; i++) {
            try {
                xmlDoc = new ActiveXObject(xmlDomVersions[i]);
                xmlDoc.async = false;
                xmlDoc.loadXML(xmlString); //loadXML方法载入xml字符串
                break;
            } catch (e) {
            }
        }
    }
    //支持Mozilla浏览器
    else if (window.DOMParser && document.implementation && document.implementation.createDocument) {
        try {
            /* DOMParser 对象解析 XML 文本并返回一个 XML Document 对象。
            * 要使用 DOMParser，使用不带参数的构造函数来实例化它，然后调用其 parseFromString() 方法
            * parseFromString(text, contentType) 参数text:要解析的 XML 标记 参数contentType文本的内容类型
            * 可能是 "text/xml" 、"application/xml" 或 "application/xhtml+xml" 中的一个。注意，不支持 "text/html"。
            */
            domParser = new DOMParser();
            xmlDoc = domParser.parseFromString(xmlString, 'text/xml');
        } catch (e) {
        }
    }
    else {
        return null;
    }

    return xmlDoc;
}

/*格式化字符串连接信息 David*/
$.format = function () {
    if (arguments.length == 0) { return null; }
    var str = arguments[0];
    for (var i = 1; i < arguments.length; i++) {
        var re = new RegExp('\\{' + (i - 1) + '\\}', 'gm');
        str = str.replace(re, arguments[i]);
    }
    return str;
}


$.BetweenDate = function (int_due_date, cus_due_date) {
    if (int_due_date) {
        return int_due_date;
    }
    else if (cus_due_date) {
        return cus_due_date;
    }
    else {
        return "";
    }
}



/*為列表加上奇數行和偶數行樣式  表格*/
$.setRowStyle = function () {
    this.find("table.table_css").each(function () {
        $(this).find(">tbody>tr:odd").addClass("odd");
        $(this).find(">tbody>tr:even").addClass("even");
        $(this).find(">tbody>tr").mouseover(function () { $(this).addClass("hover") }).mouseout(function () { $(this).removeClass("hover") })
            .bind("click", function () { $(this).addClass("cur").siblings("tr").removeClass("cur").end().find("a").css({ "color": "#fff" }); });
        $(this).find(">tbody>tr>td>span.ellipsis").each(function () { $(this).attr("title", $(this).text()) });
    })
}

$.cookie = function (name, value, options) {
    if (typeof value != 'undefined') {
        options = options || {};
        if (value === null) {
            value = '';
            options.expires = -1;
        }
        var expires = '';
        if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
            var date;
            if (typeof options.expires == 'number') {
                date = new Date();
                date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
            } else {
                date = options.expires;
            }
            expires = '; expires=' + date.toUTCString();
        }
        var path = options.path ? '; path=' + options.path : '';
        var domain = options.domain ? '; domain=' + options.domain : '';
        var secure = options.secure ? '; secure' : '';
        document.cookie = [name, '=', encodeURIComponent(value), expires, path, domain, secure].join('');
    } else {
        var cookieValue = null;
        if (document.cookie && document.cookie != '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = jQuery.trim(cookies[i]);
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
};

/*客户端Cookie操作 David*/
$.Cookies = {
    Set: function (_Name, _Value) {
        $.cookie(_Name, _Value, { expires: 7, path: '/' });
    },
    Get: function (_Name) {
        return $.cookie(_Name)
    }
}

/*设置或改变多语言*/
function SettingLanguage(language) {
    var _data = { Call: 'ChangeLanguage', Language: language }
    var success = function (result) {
        top.document.location.reload();
    }
    Ajax.Request("Login.ashx", _data, success);
}

/*------------------------公共函数(二) jquery扩展方法 ------------------------end*/


/*------------------------公共常量定义(三) 多语言 ------------------------start*/

var CONST = {};

/*流程类型*/
CONST.FLOWTYPE = { APPLY: 'AP', DISTRI: 'DR', REVISE: 'RE', TRREVISE: 'TRE', UPDATE: 'UP', EFILE: 'EF', COUNSEL: 'CO', REQUEST: 'RQ', BILLIN: 'BI', BILLOUT: 'BO', OFFSET: 'HD', UD: "UD", ClAIM: 'CL', PAYMENT: 'PM', CW: "CW", ACCOUNT: "AC", Contract: "CT", BILL: "AS", REFUND: "TH", COMMUNICATECUSTOMER: "CC" }
CONST.CASETYPE = { APPLY: 'AP', CASE: 'CA', COUNSEL: 'CO' }
//AP	提案流程	Apply
//DR    配案流程    DISTRI
//RE	核稿流程	Revise
//UP	数据更新	Update
//EF	送件流程	EFile
//CO	发文流程	Counsel
//OT	其他流程	Other
//CL    认领流程    ClAIM
/*通用多语言词条*/
var GRESX = {};
GRESX.HINTS = { TITLE: GetResource("S140808093254228", "系统信息"), YES: GetResource('S140808093304465', '确定'), NO: GetResource('S140808093322163', '取消') }
GRESX.TABLE = {
    SERIAL: GetResource('S140808093333235', '序号'), NODATA: GetResource('S140808093355956', '无可显示数据'), OPERATE: GetResource('S140808093420998', '操作'),
    STATUS: GetResource('S140808093519552', '状态'), REMARK: GetResource('S140808093432700', '备注'),
    HINTS: GetResource('S140808093615244', '当前显示第{0}-{1}条记录，共{2}条记录')
}

/*------------------------公共常量定义(三) 多语言 ------------------------end*/

/*------------------------固定div ------------------------start*/
function Fixdiv(_obj) {

    var loaded = true;
    var top = $("#" + _obj).offset().top;
    function Add_Data() {
        var scrolla = $(window).scrollTop();
        var cha = parseInt(top) - parseInt(scrolla);

        if (loaded && cha <= 0) {
            $("#" + _obj).removeClass("FixedTitleClass2").addClass("FixedTitleClass1");
            loaded = false;
        }
        if (!loaded && cha >= 0) {
            $("#" + _obj).removeClass("FixedTitleClass1").addClass("FixedTitleClass2");
            loaded = true;
        }
    }
    $(window).scroll(Add_Data);

}
/*------------------------固定div ------------------------end*/

/*------------------------时间标准中国转换为yyyy-mm-dd ------------------------start*/

function DateTo(_day) {
    var dt = new Date(_day);
    var year = "" + (dt.getFullYear()); //获取年
    var month = "" + (dt.getMonth() + 1); //获取月
    var day = "" + dt.getDate(); //获取日
    if (month.length == 1) {
        month = "0" + month;
    }
    if (day.length == 1) {
        day = "0" + day;
    }
    return year + '-' + month + '-' + day;
}

/*------------------------时间标准中国转换为yyyy-mm-dd ------------------------end*/

/*获取当前日前，是否要加上时间*/

$.curDateTime = function (_istime) {
    var d = new Date();
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    var date = d.getDate();
    var day = d.getDay();
    var hours = d.getHours();
    var minutes = d.getMinutes();
    var seconds = d.getSeconds();
    var ms = d.getMilliseconds();
    var curDateTime = year;

    if (month > 9)
        curDateTime = curDateTime + "-" + month;
    else
        curDateTime = curDateTime + "-0" + month;
    if (date > 9)
        curDateTime = curDateTime + "-" + date;
    else
        curDateTime = curDateTime + "-0" + date;
    if (_istime) {
        if (hours > 9)
            curDateTime = curDateTime + " " + hours;
        else
            curDateTime = curDateTime + " 0" + hours;
        if (minutes > 9)
            curDateTime = curDateTime + ":" + minutes;
        else
            curDateTime = curDateTime + ":0" + minutes;
        if (seconds > 9)
            curDateTime = curDateTime + ":" + seconds;
        else
            curDateTime = curDateTime + ":0" + seconds;
    }
    return curDateTime;
}

//获取当前月第一天
$.getCurMonthFirstDay = function () {
    var d = new Date();
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    if (month > 9)
        return year + "-" + month + "-" + "01";
    else
        return year + "-0" + month + "-" + "01";


}


// 格式化日对象
function getNowDate() {
    var date = new Date();
    var sign2 = ":";
    var year = date.getFullYear() // 年
    var month = date.getMonth() + 1; // 月
    var day = date.getDate(); // 日
    var hour = date.getHours(); // 时
    var minutes = date.getMinutes(); // 分
    var seconds = date.getSeconds() //秒
    var weekArr = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期天'];
    var week = weekArr[date.getDay()];
    // 给一位数的数据前面加 “0”
    if (month >= 1 && month <= 9) {
        month = "0" + month;
    }
    if (day >= 0 && day <= 9) {
        day = "0" + day;
    }
    if (hour >= 0 && hour <= 9) {
        hour = "0" + hour;
    }
    if (minutes >= 0 && minutes <= 9) {
        minutes = "0" + minutes;
    }
    if (seconds >= 0 && seconds <= 9) {
        seconds = "0" + seconds;
    }
    return year + "-" + month + "-" + day + " " + hour + sign2 + minutes + sign2 + seconds;
}


//获取当前月的结束日期
function getMonthEndDate(nowMonth, nowYear) {
    var monthStartDate = new Date(nowYear, nowMonth, 1);
    var monthEndDate = new Date(nowYear, nowMonth + 1, 1);
    var days = (monthEndDate - monthStartDate) / (1000 * 60 * 60 * 24);
    var monthEndDate = new Date(nowYear, nowMonth, days);
    return DateTo(monthEndDate);
}

//获取当前指定的前几天的日期
$.getBeforeDate = function (n) {
    var n = n;
    var d = new Date();
    var year = d.getFullYear();
    var mon = d.getMonth() + 1;
    var day = d.getDate();
    if (day <= n) {
        if (mon > 1) {
            mon = mon - 1;
        }
        else {
            year = year - 1;
            mon = 12;
        }
    }
    d.setDate(d.getDate() - n);
    year = d.getFullYear();
    mon = d.getMonth() + 1;
    day = d.getDate();
    s = year + "-" + (mon < 10 ? ('0' + mon) : mon) + "-" + (day < 10 ? ('0' + day) : day);
    return s;
}

//获得上个月在昨天这一天的日期
$.getLastMonthYestdy = function (month) {

    var date = new Date();
    var daysInMonth = new Array([0], [31], [28], [31], [30], [31], [30], [31], [31], [30], [31], [30], [31]);
    var strYear = date.getFullYear();
    var strDay = date.getDate();
    var strMonth = date.getMonth() + 1;
    if (strYear % 4 == 0 && strYear % 100 != 0) {
        daysInMonth[2] = 29;
    }
    if (strMonth - month <= 0) {
        strYear -= 1;
        strMonth = strMonth + 12 - month;
    }
    else if (strMonth - month > 12) {
        strYear += 1;
        strMonth = strMonth - month - 12;
    }
    else {
        strMonth -= month;
    }
    if (strMonth <= 0) {
        strMonth = 1;
    }
    strDay = daysInMonth[strMonth] >= strDay ? strDay : daysInMonth[strMonth];
    if (strMonth < 10) {
        strMonth = "0" + strMonth;
    }
    if (strDay < 10) {
        strDay = "0" + strDay;
    }
    datastr = strYear + "-" + strMonth + "-" + strDay;
    return datastr;
}

//获取两个日期相差的天数
$.DateDiff = function (sDate1, sDate2) {    //sDate1和sDate2是2006-12-18格式
    var aDate, oDate1, oDate2, iDays
    aDate = sDate1.split("-")
    oDate1 = new Date(aDate[1] + '-' + aDate[2] + '-' + aDate[0])    //转换为12-18-2006格式
    aDate = sDate2.split("-")
    oDate2 = new Date(aDate[1] + '-' + aDate[2] + '-' + aDate[0])
    iDays = parseInt(Math.round(oDate1 - oDate2) / 1000 / 60 / 60 / 24)    //把相差的毫秒数转换为天数
    return iDays
}


//获取上个月第一天和最后一天
$.LastDate = function (type) {    //sDate1和sDate2是2006-12-18格式
    var nowdays = new Date();
    var year = nowdays.getFullYear();
    var month = nowdays.getMonth();
    if (month == 0) {
        month = 12;
        year = year - 1;

    }
    if (month < 10) {
        month = '0' + month;
    }

    var myDate = new Date(year, month, 0);

    if (type == "true") {
        var startDate = year + '-' + month + '-01'; //上个月第一天
        return startDate;
    }
    if (type == "false") {
        var endDate = year + '-' + month + '-' + myDate.getDate();//上个月最后一天
        return endDate;

    }


}





//清除字符串中空格
$.NoSpace = function (_str) {
    while (_str.indexOf(" ") != -1) {
        _str = _str.replace(" ", "");
    }
    return _str;
}

//对电子邮件的验证
$.CheckeMail = function (value) {
    var myreg = /^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/;
    if (!myreg.test(value)) {
        return false;
    }
    return true;
}
//对手机号码的验证
$.CheckeMobile = function (value) {
    var myreg = /^0?1[0-9][0-9]\d{8}$/;
    if (!myreg.test(value)) {
        return false;
    }
    return true;
}

//验证数字

function BindCheckNum(id) {
    if (!id) { return; }
    var arr = [];
    if (typeof id == 'string') {
        arr = id.split(';');
    }
    else if (id instanceof Array) {
        arr = id;
    }
    else {
        return false;
    }
    for (var i = 0; i < arr.length; i++) {
        $('#' + arr[i]).bind('keyup', function () { $.CheckNumberT(this); }).bind('change', function () { $.CheckNumberT(this); });
    }

}

//只能填數字控制
$.CheckNumberT = function (_this) {
    if (_this.value == ".") {
        _this.value = "";
        return false;
    }
    var arr = _this.value.split('.');
    if (arr.length > 2) {
        var tmp = arr[0] + '.';
        for (var i = 1; i < arr.length; i++) {
            tmp += arr[i]
        }
        _this.value = tmp;
    }
    var Sign = '';
    if (/^[\+,\-]/.test(_this.value)) {
        Sign = _this.value.substring(0, 1); /// +_this.value.replace(/[\+,\-]/g, '');
    }
    if (!/^\d\.\d$/.test(_this.value)) {
        // if (_value.indexOf(".") > -1) {
        _this.value = _this.value.replace(/[^(\d,\.)]/g, '');
        //        } else {
        //            _this.value = _this.value.replace(/[^(\d,\.)]/g, '');
        //        }
    }
    _this.value = Sign + _this.value;
    return false;
}

$.CheckNumber = function (event, _this) {
    if (_this.value == ".") {
        _this.value = "";
        return false;
    }
    var arr = _this.value.split('.');
    if (arr.length > 2) {
        var tmp = arr[0] + '.';
        for (var i = 1; i < arr.length; i++) {
            tmp += arr[i]
        }
        _this.value = tmp;
    }
    var Sign = '';
    if (/^[\+,\-]/.test(_this.value)) {
        Sign = _this.value.substring(0, 1); /// +_this.value.replace(/[\+,\-]/g, '');
    }
    if (!/^\d\.\d$/.test(_this.value)) {
        // if (_value.indexOf(".") > -1) {
        _this.value = _this.value.replace(/[^(\d,\.)]/g, '');
        //        } else {
        //            _this.value = _this.value.replace(/[^(\d,\.)]/g, '');
        //        }
    }
    _this.value = Sign + _this.value;
    return false;
}

//整数
$.CheckIntNumber = function (event, _this) {
    //var r = /^-?\d+$/;

    if ($(_this).val() == "") {
        return;
    }

    var Sign = '';
    if (/^[\+,\-]/.test($(_this).val())) {
        Sign = $(_this).val().substring(0, 1); /// +_this.value.replace(/[\+,\-]/g, '');
    }
    if (!/^\d+$/.test($(_this).val())) {
        $(_this).val($(_this).val().replace(/[^(\d)]/g, ''));
    }
    $(_this).val(Sign + $(_this).val());

}

//浮点求和异常处理
$.FloatAccAdd = function (arg1, arg2) {
    var r1, r2, m;
    try { r1 = arg1.toString().split(".")[1].length } catch (e) { r1 = 0 }
    try { r2 = arg2.toString().split(".")[1].length } catch (e) { r2 = 0 }
    m = Math.pow(10, Math.max(r1, r2))
    return (arg1 * m + arg2 * m) / m
}

//相乘
$.FloatAccMul = function (num1, num2) {
    var m = 0, r1, r2;
    var s1 = num1.toString();
    var s2 = num2.toString();
    try {
        m += s1.split('.')[1].length
    } catch (e) {

    }
    try {
        m += s2.split('.')[1].length
    } catch (e) {

    }
    r1 = Number(num1.toString().replace(".", ""));
    r2 = Number(num2.toString().replace(".", ""));
    return r1 * r2 / Math.pow(10, m);
}

//给金额添加千位符
function CheckNumberMoneySplit(_event, _this, _value) {

    if (_value == "." || _value == "0") {
        _this.value = "";
        return '';
    }
    _value = _value.replace(/,/g, '');
    if (!/^\d\.\d$/.test(_value)) {
        if (_value.indexOf(".") > -1) {
            _this.value = _value.replace(/[^(\d,\.)]/g, '');
        } else {
            _this.value = _value.replace(/[^(\d,\.)]/g, '');

        }
        return $.MoneySplit(_this.value);
    }
}

$.toThousands = function (num) {
    return num && (num
        .toString().indexOf('.') != -1 ? num.toString().replace(/(\d)(?=(\d{3})+\.)/g, function ($0, $1) {
            return $1 + ",";
        }) : num.toString().replace(/(\d)(?=(\d{3}))/g, function ($0, $1) {
            return $1 + ",";
        }));
}

$.MoneySplit = function (s) {
    var _f = "";
    if (s < 0) {
        s = Math.abs(s);
        _f = "-";
    }

    if (/[^0-9\.]/.test(s)) return "";
    s = s.toString();
    s = s.replace(/^(\d*)$/, "$1.");
    s = (s + "00").replace(/(\d*\.\d\d)\d*/, "$1");
    s = s.replace(".", ",");
    var re = /(\d)(\d{3},)/;
    while (re.test(s))
        s = s.replace(re, "$1,$2");
    s = s.replace(/,(\d\d)$/, ".$1");

    s = s.replace(".00", "");
    return _f + s.replace(/^\./, "0.")
}

//获得页面对应的菜单id
function GetMenuID() {
    var guid = GetParaValue(document.location.href, "guid");
    var tabpanel = top.window.tabPanel;
    if (tabpanel) {
        for (var i = 0; i < tabpanel.tabs.length; i++) {
            var tab = tabpanel.tabs[i];
            if (guid == tab.guid) {
                return tab.menu_id;
            }
        }
    }
    return "";
}

//返回Tab id
function GetTabID() {
    var guid = GetParaValue(document.location.href, "guid");
    var tabpanel = top.window.tabPanel;
    if (tabpanel) {
        for (var i = 0; i < tabpanel.tabs.length; i++) {
            var tab = tabpanel.tabs[i];
            if (guid == tab.guid) {
                return tab.id;
            }
        }
    }
    return "";
}
function CloseMyTab() {
    top.window.tabPanel.kill(GetTabID());
}

//新建草稿保存之后重新打开草稿页面（避免人员同时操作）统一增加一个2.2秒在执行。避免页面还没
function ColseDraft(id, title, url, tabid) {

    setTimeout(function () {

        top.window.AddBusinessTab(id, title, url);

        var tab = top.window.tabPanel.tabs[top.window.tabPanel.tabs.findIndex(function (value, index, arr) {
            return value.id === tabid;
        })];

        tab.preTabId = id;

        top.window.tabPanel.kill(tabid);

    }, 2200);

}

/*常用客户端组件取值，封装的原因是因为适应IE跟Firefox的兼容性*/
/*设置某区域内控件不可用*/
$.SetDisabled = function (_this) {
    $("#" + _this + " input").attr("disabled", "true");
    $("#" + _this + " textarea").attr("disabled", "true");
    $("#" + _this + " select").attr("disabled", "true");
    $("#" + _this + " input[type='checkbox']").attr("disabled", "true");
    $("#" + _this + " input[type='option']").attr("disabled", "true");
    $("#" + _this + " input[type='radio']").attr("disabled", "true");
}

/*设置某区域内控件可用*/
$.RemoveDisabled = function (_this) {
    $("#" + _this + " input").removeAttr("disabled");
    $("#" + _this + " textarea").removeAttr("disabled");
    $("#" + _this + " select").removeAttr("disabled");
    $("#" + _this + " input[type='checkbox']").removeAttr("disabled");
    $("#" + _this + " input[type='option']").removeAttr("disabled");
    $("#" + _this + " input[type='radio']").removeAttr("disabled");
}

/*设置控件值*/
$.SetValue = function (_ID, _Value) {
    $("#" + _ID).attr('value', _Value);
}
/*设置radio值*/
$.SetRadio = function (_Name, _Value) {
    $('input[type=radio][name=' + _Name + ']').each(function () {
        if ($(this).val() == _Value) {
            $(this).attr('checked', true);
        }
    });
}

/*取服务器端控件值*/
$.GetValue = function (_ID) {

    var _value = $("#" + _ID).val()
    if (_value == '' || _value == null) {
        _value = $("#" + _ID).text()
    }
    return _value;
}

/*获取Radio或者CheckBox组选中值*/
$.GetCRValue_flag = function (_Name, flag) {
    var arr = [];
    if (!flag) { flag = ''; }
    $("input[name='" + _Name + "']").each(function () {
        if ($(this).attr("checked")) {
            arr.push(this.value);
        }
    });
    _value = arr.join(flag);
    return _value;
}

/*获取Radio组选中值*/
$.GetRadioValue = function (_Name) {
    var _value = '';
    _value = $(":radio[name='" + _Name + "']:checked").val();
    if (_value == '' || typeof (_value) == "undefined") {
        $("input[type='radio'][name='" + _Name + "']").each(function () {
            if ($(this).attr("checked")) {
                _value = $(this).val();
                return false;
            }
        });
    }
    return _value;
}

/*获取CheckBox组选中值 flag 分割符*/
$.GetCheckGroupValue_flag = function (_Name, flag) {
    var _value = '';
    //    if (flag == null || typeof (flag) == 'undefined') {
    //        $("input[type='checkbox'][name='" + _Name + "']").each(function () {
    //            if ($(this).attr("checked")) {
    //                _value = _value + $(this).val();
    //            }
    //        });
    //        if (_value != '') {
    //            _value = _value.substring(0, _value.length);
    //        }
    //    }
    //    else {
    //        $("input[type='checkbox'][name='" + _Name + "']").each(function () {
    //            if ($(this).attr("checked")) {
    //                _value = _value + $(this).val() + flag;
    //            }
    //        });
    //        if (_value != '') {
    //            _value = _value.substring(0, _value.length - flag.length);
    //        }
    //    }
    //    return _value;
    var arr = [];
    if (!flag) { flag = ''; }
    $("input[type='checkbox'][name='" + _Name + "']").each(function () {
        if ($(this).is(":checked")) {
            arr.push(this.value);  //_value = _value + $(this).attr("id") + flag;
        }
    });
    _value = arr.join(flag);
    return _value;
}

/*获取CheckBox组选中值 flag 分割符*/
$.GetCheckGroupValue_flag2 = function (_Name, flag) {
    var _value = '';
    var arr = [];
    if (!flag) { flag = ''; }
    $("#divADD input[type='checkbox'][name='" + _Name + "']").each(function () {
        if ($(this).is(":checked")) {
            arr.push(this.value);  //_value = _value + $(this).attr("id") + flag;
        }
    });
    _value = arr.join(flag);
    return _value;
}

/*获取CheckBox组选中值 flag 分割符*/
$.GetCheckGroupValue_flag3 = function (_Name, flag) {
    var _value = '';
    var arr = [];
    if (!flag) { flag = ''; }
    $("#divEM input[type='checkbox'][name='" + _Name + "']").each(function () {
        if ($(this).is(":checked")) {
            arr.push(this.value);  //_value = _value + $(this).attr("id") + flag;
        }
    });
    _value = arr.join(flag);
    return _value;
}


/*获取CheckBox组选中id  flag 分割符*/
$.GetCheckGroupId_flag = function (_Name, flag) {
    var _value = '';
    //    if (flag == null || typeof (flag) == 'undefined') {
    //        $("input[type='checkbox'][name='" + _Name + "']").each(function () {
    //            if ($(this).attr("checked")) {
    //                _value = _value + $(this).attr("id");
    //            }
    //        });
    //        if (_value != '') {
    //            _value = _value.substring(0, _value.length);
    //        }
    //    }
    //    else {
    //        $("input[type='checkbox'][name='" + _Name + "']").each(function () {
    //            if ($(this).attr("checked")) {
    //                _value = _value + $(this).attr("id") + flag;
    //            }
    //        });
    //        if (_value != '') {
    //            _value = _value.substring(0, _value.length - flag.length);
    //        }
    //    }
    var arr = [];
    if (!flag) { flag = ''; }
    $("input[type='checkbox'][name='" + _Name + "']").each(function () {
        if ($(this).attr("checked")) {
            arr.push(this.id);  //_value = _value + $(this).attr("id") + flag;
        }
    });
    _value = arr.join(flag);
    return _value;
}

/*获取CheckBox组选中_tag flag 分割符*/
$.GetCheckGroupTag_flag = function (_Name, _tag, flag) {
    var _value = '';
    //    if (flag == null || typeof (flag) == 'undefined') {
    //        $("input[type='checkbox'][name='" + _Name + "']").each(function () {
    //            if ($(this).attr("checked")) {
    //                _value = _value + $(this).attr(_tag);
    //            }
    //        });
    //        if (_value != '') {
    //            _value = _value.substring(0, _value.length);
    //        }
    //    }
    //    else {
    //        $("input[type='checkbox'][name='" + _Name + "']").each(function () {
    //            if ($(this).attr("checked")) {
    //                _value = _value + $(this).attr(_tag) + flag;
    //            }
    //        });
    //        if (_value != '') {
    //            _value = _value.substring(0, _value.length - flag.length);
    //        }
    //    }
    var arr = [];
    if (!flag) { flag = ''; }
    $("input[type='checkbox'][name='" + _Name + "']").each(function () {
        var self = $(this);
        if (self.attr("checked")) {
            if (_tag == "filename") {
                arr.push(self.attr(_tag).replace(";", ""));
            } else {
                arr.push(self.attr(_tag));
            }
            //_value = _value + $(this).attr("id") + flag;
        }
    });
    _value = arr.join(flag);
    return _value;

}


//文件下载（ajax请求服务端准备文件，完成后由页面请求获得文件）
//要求文件名不能包含特殊字符（上传时检查，否则在此方法中替换）
//file_no:文件file_no
//file_name:文件名称
//model:系统模块
//zip_name:压缩包的名称
//zip_pwd：压缩包的密码
//type:Ozip，RQzip
//childpath:子文件目录
function DownLoad(file_no, file_name, model, zip_name, zip_pwd, type, childpath, cur_page_name) {
    if (cur_page_name != "FileApproval.aspx") {
        var isApproval = true;
        if (GetPublishConfig('FileUpload', 'is_not_approval')) {
            //文件需要审批配置
            var success = function (_Meta) {
                if (_Meta.flag) {
                    isApproval = _Meta.flag == "True" ? true : false;
                }
            }
            Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
        }
        if (!isApproval) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '账号保密等级不足或存在文件未通过审批，不可下载！'), null, { icon: 'hits.gif' });
            return;
        }
    }
    var success = function (data) {

        if (data.ClientInfo.Result) {
            if (data.error) {
                GetFile(data.file_guid, data.file_size);
            } else {
                Box.Confirm(GRESX.HINTS.TITLE, data.error_message, function () { GetFile(data.file_guid, data.file_size); }, { icon: 'hits.gif' });
            }
        }

        else {
            Box.Confirm(GRESX.HINTS.TITLE, data.error_message, function () { GetFile(data.file_guid, data.file_size); }, { icon: 'hits.gif' });
            // Box.Alert(GRESX.HINTS.TITLE, GetResource('S140823184840620', '文件下载失败！'), null, { icon: 'hits.gif' });
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: "DownLoad", file_no: file_no, file_name: file_name, zip_name: zip_name, zip_pwd: zip_pwd, down_type: type, model: model, childpath: childpath }, success);
}

//文件下载（ajax请求服务端准备文件，完成后由页面请求获得文件）
//要求文件名不能包含特殊字符（上传时检查，否则在此方法中替换）
//file_no:文件file_no
//file_name:文件名称
//zip_name:压缩包的名称
//model:系统模块
function DownLoadZip(file_no, file_name, model, zip_name) {
    var isApproval = true;
    if (GetPublishConfig('FileUpload', 'is_not_approval')) {
        //文件需要审批配置
        var success = function (_Meta) {
            if (_Meta.flag) {
                isApproval = _Meta.flag == "True" ? true : false;
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
    }
    if (!zip_name) {
        zip_name = "递交包";
    }
    if (!isApproval) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '账号保密等级不足或存在文件未通过审批，不可下载！'), null, { icon: 'hits.gif' });
        return;
    }
    var success = function (data) {
        if (data.ClientInfo.Result) {
            if (data.error) {
                GetFile(data.file_guid, data.file_size);
            } else {
                Box.Confirm(GRESX.HINTS.TITLE, data.error_message, function () { GetFile(data.file_guid, data.file_size); }, { icon: 'hits.gif' });
            }
        }
        else {
            Box.Confirm(GRESX.HINTS.TITLE, data.error_message, function () { GetFile(data.file_guid, data.file_size); }, { icon: 'hits.gif' });
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: "DownLoadZip", file_no: file_no, file_name: file_name, zip_name: zip_name, model: model }, success);
}

//js获取webconfig配置的值  _config web.config中的配置参数
$.GetWebConfigValue = function (_config) {
    var _value;
    function Success(_Meta) {
        _value = _Meta.value;
    }
    Ajax.Request('Common.ashx', { Call: 'GetWebConfigValue', config: _config }, Success, true);

    return _value;
}

//文件下载（ajax请求服务端准备文件，完成后由页面请求获得文件）
//要求文件名不能包含特殊字符（上传时检查，否则在此方法中替换）
function DownLoadFiles(file_no, file_name, zip_name, zip_pwd, type, model) {
    var isApproval = true;
    if (GetPublishConfig('FileUpload', 'is_not_approval')) {
        //文件需要审批配置
        var success = function (_Meta) {
            if (_Meta.flag) {
                isApproval = _Meta.flag == "True" ? true : false;
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
    }
    if (!isApproval) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '账号保密等级不足或存在文件未通过审批，不可下载！'), null, { icon: 'hits.gif' });
        return;
    }
    var success = function (data) {
        if (data.ClientInfo.Result) {

            GetFile(data.file_guid, data.file_size);
        }
        else {
            if (data.ClientInfo.Message) {
                Box.Confirm(GRESX.HINTS.TITLE, data.ClientInfo.Message, null, { icon: 'hits.gif' });
            } else {
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S140823184840620', '文件下载失败！'), null, { icon: 'hits.gif' });
            }
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: "DownLoadFiles", file_no: file_no, file_name: file_name, zip_name: zip_name, zip_pwd: zip_pwd, down_type: type, model: model }, success);
}

function ViewFilePF(file_no, file_name, model, case_id, proc_id, file_desc_code) {
    var success = function (data) {

        if (data.ClientInfo.Result) {
            $.dialog({
                title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no,
                width: 900,
                height: window.screen.height - 180,
                content: 'url:' + GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + data.guid + '/' + data.filename + "&case_id=" + case_id + '&isbool=' + isbool + '&proc_id=' + proc_id,
                lock: false,
                max: true,
                min: true,
                resize: true,
                parent: true,
                close: function () {

                },
                init: function () {
                    var context = window.lhgdialog.list['Preview_' + file_no].content;
                    if (context != null && context.PreviewJs != null) {
                        context.$("#downloadFile").bind("click", function () { DownLoad(file_no, file_name); });
                    }

                }
            });
        }
    }
    Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name, model: model }, success);
}


//预览附件
//file_no:文件file_no
//file_name:文件名称
//model :系统模块
function ViewFile(file_no, file_name, model, case_id, proc_id, file_desc_code, isDownLoad, cur_page_name) {
    var ViewUrl = GetPublishConfigValueFn('ViewAll', 'is_new_view');
    if (ViewUrl && file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
        && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".xls") < 0 && file_name.toLowerCase().indexOf(".eml") < 0) {
        ViewFileAll(file_no, file_name, ViewUrl);
    } else {
        if (cur_page_name != "FileApproval.aspx") {
            //审核页面不需要校验和转档页面不需要审批
            var isApproval = true;
            if (GetPublishConfig('FileUpload', 'is_not_approval')) {
                //文件需要审批配置
                var success = function (_Meta) {
                    if (_Meta.flag) {
                        isApproval = _Meta.flag == "True" ? true : false;
                    }
                }
                Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
            }
            if (!isApproval) {
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '账号保密等级不足或该文件未通过审批，不可预览！'), null, { icon: 'hits.gif' });
                return;
            }
        }
        if (GetPublishConfig('ViewPdf', 'is_new_view')) {
            ViewFilePDF(file_no, file_name, model, case_id, proc_id, file_desc_code, isDownLoad, cur_page_name)
        } else {
            if (file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
                && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".eml") < 0 && file_name.toLowerCase().indexOf(".xls") < 0) {
                Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', '该文件类型不支持在线预览，直接下载？'), function () { DownLoad(file_no, file_name, model, '', '', '', '', cur_page_name) }, { icon: 'hits.gif', width: '300' }, null);
                return;
            }
            file_name = file_name.replace("&", "").replace("%", "");
            var success = function (data) {

                if (data.ClientInfo.Result) {

                    var opener = window;
                    var _Api = this;
                    _parent = null;
                    if (frameElement && frameElement.api) {
                        _Api = frameElement.api;
                        opener = _Api.opener;
                        _parent = _Api;

                    }

                    //var url = GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + $.trim(data.guid) + '/' + $.trim(data.filename); //转向网页的地址;

                    //var name = '';                            //网页名称，可为空;
                    //var iWidth = 960;                          //弹出窗口的宽度;
                    //var iHeight = 700;                         //弹出窗口的高度;
                    ////获得窗口的垂直位置
                    //var iTop = (window.screen.availHeight - 30 - iHeight) / 2;
                    ////获得窗口的水平位置
                    //var iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
                    //window.open(url, name, 'height=' + iHeight + ',innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');
                    if (data.file_type == "pdf") {
                        var FileCode = ['200021', '200701', '200103', '200602'];
                        var isbool = false;
                        var w_width = 980;
                        if (top.window._UserModel.RoleCode.indexOf('ic') > -1 || top.window._UserModel.RoleCode.indexOf('fa') > -1) {
                            if (file_desc_code) {
                                for (var i = 0; i < file_desc_code.length; i++) {
                                    if (file_desc_code == FileCode[i]) {
                                        isbool = true;
                                        w_width = 1280;
                                    }
                                }
                            }
                        }
                        opener.$.dialog({
                            title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height - 180,
                            content: 'url:' + GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + data.guid + '/' + data.filename + "&case_id=" + case_id + '&isbool=' + isbool + '&proc_id=' + proc_id,
                            lock: false,
                            max: true,
                            min: true,
                            resize: true,
                            parent: _parent,
                            close: function () {
                                try {
                                    if (_parent) {
                                        opener.$.dialog({ id: _Api.iframe.name });
                                    }
                                } catch (e) {
                                }
                            },
                            init: function () {

                                var context = opener.lhgdialog.list['Preview_' + file_no].content;
                                if (context != null && context.PreviewJs != null) {
                                    if (isDownLoad == false) {
                                        //不能下载移除下载按钮
                                        context.$("#downloadFile").remove();
                                    }
                                    //context.$("#guid").val(data.guid);
                                    //context.$("#file_name").val(data.filename);
                                    //context.PreviewJs.file_no = file_no;
                                    //context.PreviewJs.file_name = file_name;
                                    //context.PreviewJs.LoadFlex();
                                    context.$("#downloadFile").bind("click", function () { DownLoad(file_no, file_name); });
                                }

                            }
                        });
                    } else if (data.file_type == "img") {
                        // 图片的预览
                        var myheight = window.screen.height - 240;
                        var imgId = "img_show_" + file_no;

                        opener.$.dialog({
                            title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
                            content: "<div id='div_img_" + file_no + "' style='text-align: center;width:960px;height:" + myheight + "px;overflow:auto;'><img id='" + imgId + "' src='./TempFile/SWFFile/" + data.guid + "/" + data.filename + "' /></div>",
                            lock: false,
                            max: true,
                            min: true,
                            resize: true,
                            parent: _parent,
                            init: image_zoom,

                            close: function () {
                                try {
                                    if (_parent) {
                                        opener.$.dialog({ id: _Api.iframe.name });
                                    }
                                } catch (e) {
                                }
                            }
                        });

                        // 图片缩放
                        //window.setTimeout(image_zoom, 1000);
                        function image_zoom() {
                            var panimage1, img = top.window.document.getElementById(imgId);
                            function doInit() {
                                var result = adjustLayout(960, 640, this.width, this.height);

                                jQuery(function ($) {
                                    panimage1 = new imagepanner({
                                        wrapper: $('#div_img_' + file_no, top.window.document), // jQuery selector to image container
                                        imgpos: [0, 0], // initial image position- x, y
                                        maxlevel: 4, // maximum zoom level
                                        controlzoom: 0.2
                                    })
                                });

                                panimage1.zoom(result.zoomFactor + '');
                                //判断 img对应是否存在
                                if (img) {
                                    $(img).css({
                                        left: result.x
                                    });
                                }

                            }

                            if (img) {
                                if (img.width) {
                                    doInit.call(img);
                                }
                                img.onload = function () {
                                    doInit();
                                };
                            }

                            function adjustLayout(containerWidth, containerHeight, imgWidth, imgHeight) {
                                var zoomFactor = 1, x = 0;

                                // 长宽 都超出div
                                if (imgWidth >= containerWidth && imgHeight >= containerHeight) {
                                    var zoomFactorHeight = containerHeight / imgHeight,
                                        zoomFactorWidth = containerWidth / imgWidth;
                                    zoomFactor = zoomFactorHeight < zoomFactorWidth ? zoomFactorHeight : zoomFactorWidth;
                                }

                                if (imgWidth <= containerWidth && imgHeight <= containerHeight) {
                                    x = (containerWidth - imgWidth) / 2;
                                }

                                if (imgWidth > containerWidth && imgHeight < containerHeight) {
                                    zoomFactor = containerWidth / imgWidth;
                                }
                                if (imgWidth <= containerWidth && imgHeight > containerHeight) {
                                    zoomFactor = containerHeight / imgHeight;
                                    x = (containerWidth - imgWidth * zoomFactor) / 2;
                                }
                                return {
                                    zoomFactor: zoomFactor,
                                    x: x
                                };
                            }
                        }
                    }
                    else if (data.file_type == "eml") {
                        opener.$.dialog({
                            title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
                            content: 'url:' + GUrl + '/Ihgforms/ViewFileEml.aspx?file_no=' + data.guid,
                            lock: false,
                            max: true,
                            min: true,
                            resize: true,
                            parent: _parent,
                            close: function () {
                                try {
                                    if (_parent) {
                                        opener.$.dialog({ id: _Api.iframe.name });
                                    }
                                } catch (e) {
                                }
                            },
                            init: function () {
                            }
                        });


                    }
                }
                else {
                    // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '该文件类型不支持在线浏览器'), null, { icon: 'hits.gif' });
                    Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', '该文件类型不支持在线预览，直接下载？'), function () {
                        if (isDownLoad == false) {
                            Box.Alert(GRESX.HINTS.TITLE, GetResource('S150120171030232', '没有下载权限！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                            return;
                        }
                        DownLoad(file_no, file_name, model)
                    }, { icon: 'hits.gif', width: '300' }, null);
                }
            }
            Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name, model: model }, success);
        }
    }
}

//预览附件
//file_no:文件file_no
//file_name:文件名称
//model :系统模块
function ViewFileNew(file_no, file_name, model, case_id, proc_id, file_desc_code) {
    if (GetPublishConfig('ViewPdf', 'is_new_view')) {
        ViewFilePDFNew(file_no, file_name, model, case_id, proc_id, file_desc_code)
    } else {
        //if (file_name.indexOf(".doc") > 0 || file_name.indexOf(".docx") > 0) {
        //    //DownLoad(file_no, file_name, model);

        //    return;
        //}
        if (file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
            && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".xls") < 0 && file_name.toLowerCase().indexOf(".eml") < 0) {
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', '该文件类型不支持在线预览，直接下载？'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
            return;
        }

        var success = function (data) {

            if (data.ClientInfo.Result) {

                var opener = window;
                var _Api = this;
                _parent = null;
                if (frameElement.api) {
                    _Api = frameElement.api;
                    opener = _Api.opener;
                    _parent = _Api;

                }
                //var url = GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + $.trim(data.guid) + '/' + $.trim(data.filename); //转向网页的地址;

                //var name = '';                            //网页名称，可为空;
                //var iWidth = 960;                          //弹出窗口的宽度;
                //var iHeight = 700;                         //弹出窗口的高度;
                ////获得窗口的垂直位置
                //var iTop = (window.screen.availHeight - 30 - iHeight) / 2;
                ////获得窗口的水平位置
                //var iLeft = (window.screen.availWidth - 10 - iWidth) / 2;
                //window.open(url, name, 'height=' + iHeight + ',innerHeight=' + iHeight + ',width=' + iWidth + ',innerWidth=' + iWidth + ',top=' + iTop + ',left=' + iLeft + ',status=no,toolbar=no,menubar=no,location=no,resizable=no,scrollbars=0,titlebar=no');
                if (data.file_type == "pdf") {
                    var FileCode = ['200021', '200701', '200103', '200602'];
                    var isbool = false;
                    var w_width = 980;
                    if (top.window._UserModel.RoleCode.indexOf('ic') > -1 || top.window._UserModel.RoleCode.indexOf('fa') > -1) {
                        if (file_desc_code) {
                            for (var i = 0; i < file_desc_code.length; i++) {
                                if (file_desc_code == FileCode[i]) {
                                    isbool = true;
                                    w_width = 1280;
                                }
                            }
                        }
                    }
                    opener.$.dialog({
                        title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height / 2 - 100,
                        content: 'url:' + GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + data.guid + '/' + data.filename + "&case_id=" + case_id + '&isbool=' + isbool + '&proc_id=' + proc_id,
                        lock: false,
                        max: true,
                        min: true,
                        resize: true,
                        parent: _parent,
                        close: function () {
                            try {
                                if (_parent) {
                                    opener.$.dialog({ id: _Api.iframe.name });
                                }
                            } catch (e) {
                            }
                        },
                        init: function () {

                            var context = opener.lhgdialog.list['Preview_' + file_no].content;
                            if (context != null && context.PreviewJs != null) {
                                //context.$("#guid").val(data.guid);
                                //context.$("#file_name").val(data.filename);
                                //context.PreviewJs.file_no = file_no;
                                //context.PreviewJs.file_name = file_name;
                                //context.PreviewJs.LoadFlex();
                                context.$("#downloadFile").bind("click", function () { DownLoad(file_no, file_name); });
                            }

                        }
                    });
                } else if (data.file_type == "img") {
                    // 图片的预览
                    var myheight = window.screen.height - 240;
                    var imgId = "img_show_" + file_no;

                    opener.$.dialog({
                        title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
                        content: "<div id='div_img_" + file_no + "' style='text-align: center;width:960px;height:" + myheight + "px;overflow:auto;'><img id='" + imgId + "' src='./TempFile/SWFFile/" + data.guid + "/" + data.filename + "' /></div>",
                        lock: false,
                        max: true,
                        min: true,
                        resize: true,
                        parent: _parent,
                        init: image_zoom,

                        close: function () {
                            try {
                                if (_parent) {
                                    opener.$.dialog({ id: _Api.iframe.name });
                                }
                            } catch (e) {
                            }
                        }
                    });

                    // 图片缩放
                    //window.setTimeout(image_zoom, 1000);
                    function image_zoom() {
                        var panimage1, img = top.window.document.getElementById(imgId);
                        function doInit() {
                            var result = adjustLayout(960, 640, this.width, this.height);

                            jQuery(function ($) {
                                panimage1 = new imagepanner({
                                    wrapper: $('#div_img_' + file_no, top.window.document), // jQuery selector to image container
                                    imgpos: [0, 0], // initial image position- x, y
                                    maxlevel: 4, // maximum zoom level
                                    controlzoom: 0.2
                                })
                            });

                            panimage1.zoom(result.zoomFactor + '');
                            //判断 img对应是否存在
                            if (img) {
                                $(img).css({
                                    left: result.x
                                });
                            }

                        }

                        if (img) {
                            if (img.width) {
                                doInit.call(img);
                            }
                            img.onload = function () {
                                doInit();
                            };
                        }

                        function adjustLayout(containerWidth, containerHeight, imgWidth, imgHeight) {
                            var zoomFactor = 1, x = 0;

                            // 长宽 都超出div
                            if (imgWidth >= containerWidth && imgHeight >= containerHeight) {
                                var zoomFactorHeight = containerHeight / imgHeight,
                                    zoomFactorWidth = containerWidth / imgWidth;
                                zoomFactor = zoomFactorHeight < zoomFactorWidth ? zoomFactorHeight : zoomFactorWidth;
                            }

                            if (imgWidth <= containerWidth && imgHeight <= containerHeight) {
                                x = (containerWidth - imgWidth) / 2;
                            }

                            if (imgWidth > containerWidth && imgHeight < containerHeight) {
                                zoomFactor = containerWidth / imgWidth;
                            }
                            if (imgWidth <= containerWidth && imgHeight > containerHeight) {
                                zoomFactor = containerHeight / imgHeight;
                                x = (containerWidth - imgWidth * zoomFactor) / 2;
                            }
                            return {
                                zoomFactor: zoomFactor,
                                x: x
                            };
                        }
                    }
                }
                else if (data.file_type == "eml") {
                    opener.$.dialog({
                        title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
                        content: 'url:' + GUrl + '/Ihgforms/ViewFileEml.aspx?file_no=' + data.guid,
                        lock: false,
                        max: true,
                        min: true,
                        resize: true,
                        parent: _parent,
                        close: function () {
                            try {
                                if (_parent) {
                                    opener.$.dialog({ id: _Api.iframe.name });
                                }
                            } catch (e) {
                            }
                        },
                        init: function () {
                        }
                    });


                }
            }
            else {
                // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '该文件类型不支持在线浏览器'), null, { icon: 'hits.gif' });
                Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160628140158820', '该文件类型不支持在线浏览器，直接下载？'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
            }
        }
        Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name, model: model }, success);
    }
}


function ViewEMailOnLine(attachment_id) {

    //if (file_name.indexOf(".doc") > 0 || file_name.indexOf(".docx") > 0) {
    //    //DownLoad(file_no, file_name, model);

    //    return;
    //}
    var success = function (data) {

        if (data.ClientInfo.Result) {

            var opener = window;
            var _Api = this;
            _parent = null;
            if (frameElement && frameElement.api) {
                _Api = frameElement.api;
                opener = _Api.opener;
                _parent = _Api;

            }
            if (data.file_type == "pdf") {
                var isbool = false;
                var w_width = 980;
                opener.$.dialog({
                    title: GetResource('S141203210137300', '预览') + "—" + data.filename, id: "Preview_" + data.guid, width: w_width, height: window.screen.height - 300,
                    content: 'url:' + GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + data.guid + '/' + data.filename,
                    lock: false,
                    max: true,
                    min: true,
                    resize: true,
                    parent: _parent,
                    close: function () {
                        try {
                            if (_parent) {
                                opener.$.dialog({ id: _Api.iframe.name });
                            }
                        } catch (e) {
                        }
                    },
                    init: function () {

                        var context = opener.lhgdialog.list['Preview_' + data.guid].content;
                        if (context != null && context.PreviewJs != null) {
                            context.$("#downloadFile").bind("click", function () {

                                var Success = function (_Meta) {
                                    if (!_Meta.ClientInfo.Result) {
                                        Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'fail.gif' });
                                        return;
                                    }
                                    if (top.window.GUrl) {
                                        var ifr = top.window.document.getElementById("iFile");
                                        ifr.src = "AjaxServers/FileHandler.ashx?attachment_id=" + attachment_id;
                                    }
                                }
                                Ajax.Request('MailAction.ashx', { Call: 'IsAttachmentExists', attachment_id: attachment_id }, Success, true);


                            });
                        }

                    }
                });
            } else if (data.file_type == "img") {
                // 图片的预览
                var myheight = window.screen.height - 240;
                var imgId = "img_show_" + data.filename;

                opener.$.dialog({
                    title: GetResource('S141203210137300', '预览') + "—" + data.filename, id: "Preview_" + data.guid, width: 980, height: myheight,
                    content: "<div id='div_img_" + data.guid + "' style='text-align: center;width:960px;height:" + myheight + "px;overflow:auto;'><img id='" + imgId + "' src='./TempFile/SWFFile/" + data.guid + "/" + data.filename + "' /></div>",
                    lock: false,
                    max: true,
                    min: true,
                    resize: true,
                    parent: _parent,
                    init: image_zoom,

                    close: function () {
                        try {
                            if (_parent) {
                                opener.$.dialog({ id: _Api.iframe.name });
                            }
                        } catch (e) {
                        }
                    }
                });

                // 图片缩放
                //window.setTimeout(image_zoom, 1000);
                function image_zoom() {
                    var panimage1, img = top.window.document.getElementById(imgId);
                    function doInit() {
                        var result = adjustLayout(960, 640, this.width, this.height);

                        jQuery(function ($) {
                            panimage1 = new imagepanner({
                                wrapper: $('#div_img_' + data.guid, top.window.document), // jQuery selector to image container
                                imgpos: [0, 0], // initial image position- x, y
                                maxlevel: 4, // maximum zoom level
                                controlzoom: 0.2
                            })
                        });

                        panimage1.zoom(result.zoomFactor + '');
                        //判断 img对应是否存在
                        if (img) {
                            $(img).css({
                                left: result.x
                            });
                        }

                    }

                    if (img) {
                        if (img.width) {
                            doInit.call(img);
                        }
                        img.onload = function () {
                            doInit();
                        };
                    }

                    function adjustLayout(containerWidth, containerHeight, imgWidth, imgHeight) {
                        var zoomFactor = 1, x = 0;

                        // 长宽 都超出div
                        if (imgWidth >= containerWidth && imgHeight >= containerHeight) {
                            var zoomFactorHeight = containerHeight / imgHeight,
                                zoomFactorWidth = containerWidth / imgWidth;
                            zoomFactor = zoomFactorHeight < zoomFactorWidth ? zoomFactorHeight : zoomFactorWidth;
                        }

                        if (imgWidth <= containerWidth && imgHeight <= containerHeight) {
                            x = (containerWidth - imgWidth) / 2;
                        }

                        if (imgWidth > containerWidth && imgHeight < containerHeight) {
                            zoomFactor = containerWidth / imgWidth;
                        }
                        if (imgWidth <= containerWidth && imgHeight > containerHeight) {
                            zoomFactor = containerHeight / imgHeight;
                            x = (containerWidth - imgWidth * zoomFactor) / 2;
                        }
                        return {
                            zoomFactor: zoomFactor,
                            x: x
                        };
                    }
                }
            }
        }
        else {
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160628140158820', '该文件类型不支持在线浏览器，直接下载？'), function () {

                var Success = function (_Meta) {
                    if (!_Meta.ClientInfo.Result) {
                        Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'fail.gif' });
                        return;
                    }
                    if (top.window.GUrl) {
                        var ifr = top.window.document.getElementById("iFile");
                        ifr.src = "AjaxServers/FileHandler.ashx?attachment_id=" + attachment_id;
                    }
                }
                Ajax.Request('MailAction.ashx', { Call: 'IsAttachmentExists', attachment_id: attachment_id }, Success, true);

            }, { icon: 'hits.gif', width: '300' }, null);
        }
    }
    Ajax.Request("Common.ashx", { Call: "ViewEMailOnLine", attachment_id: attachment_id }, success);
}



//预览附件
//file_no:文件file_no
//file_name:文件名称
//model :系统模块
function ViewFilePDF(file_no, file_name, model, case_id, proc_id, file_desc_code, isDownLoad, cur_page_name) {
    //if (file_name.indexOf(".doc") > 0 || file_name.indexOf(".docx") > 0) {
    //    //DownLoad(file_no, file_name, model);

    //    return;
    //}
    if (file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
        && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".eml") < 0 && file_name.toLowerCase().indexOf(".xls") < 0) {
        Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', '该文件类型不支持在线预览，直接下载？'), function () { DownLoad(file_no, file_name, model, '', '', '', '', cur_page_name) }, { icon: 'hits.gif', width: '300' }, null);
        return;
    }

    file_name = file_name.replace("&", "").replace("%", "");
    var success = function (data) {

        if (data.ClientInfo.Result) {

            var opener = window;
            var _Api = this;
            _parent = null;
            if (frameElement && frameElement.api) {
                _Api = frameElement.api;
                opener = _Api.opener;
                _parent = _Api;

            }

            if (data.file_type == "pdf") {
                var FileCode = ['200021', '200701', '200103', '200602'];
                var isbool = false;
                var w_width = 980;
                if (top.window._UserModel.RoleCode.indexOf('ic') > -1 || top.window._UserModel.RoleCode.indexOf('fa') > -1) {
                    if (file_desc_code) {
                        for (var i = 0; i < file_desc_code.length; i++) {
                            if (file_desc_code == FileCode[i]) {
                                isbool = true;
                                w_width = 1280;
                            }
                        }
                    }
                }
                opener.$.dialog({
                    title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height - 180,
                    content: 'url:' + GUrl + '/Ihgforms/ViewFilePDF.aspx?file=../TempFile/SWFFile/' + data.guid + '/' + data.filename + "&case_id=" + case_id + '&isbool=' + isbool + '&proc_id=' + proc_id,
                    lock: false,
                    max: true,
                    min: true,
                    resize: true,
                    parent: _parent,
                    close: function () {
                        try {
                            if (_parent) {
                                opener.$.dialog({ id: _Api.iframe.name });
                            }
                        } catch (e) {
                        }
                    },
                    init: function () {

                        var context = opener.lhgdialog.list['Preview_' + file_no].content;
                        if (context != null && context.PreviewJs != null) {
                            if (isDownLoad == false) {
                                //移除浏览器内置下载toolbar
                                context.src += '#toolbar=0';
                                //不能下载 移除下载源文件按钮
                                context.$("#downloadFile").remove();
                            }
                            //context.$("#guid").val(data.guid);
                            //context.$("#file_name").val(data.filename);
                            //context.PreviewJs.file_no = file_no;
                            //context.PreviewJs.file_name = file_name;
                            //context.PreviewJs.LoadFlex();
                            context.$("#downloadFile").bind("click", function () { DownLoad(file_no, file_name); });
                        }

                    }
                });
            } else if (data.file_type == "img") {
                // 图片的预览
                var myheight = window.screen.height - 240;
                var imgId = "img_show_" + file_no;

                opener.$.dialog({
                    title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
                    content: "<div id='div_img_" + file_no + "' style='text-align: center;width:960px;height:" + myheight + "px;overflow:auto;'><img id='" + imgId + "' src='./TempFile/SWFFile/" + data.guid + "/" + data.filename + "' /></div>",
                    lock: false,
                    max: true,
                    min: true,
                    resize: true,
                    parent: _parent,
                    init: image_zoom,

                    close: function () {
                        try {
                            if (_parent) {
                                opener.$.dialog({ id: _Api.iframe.name });
                            }
                        } catch (e) {
                        }
                    }
                });

                // 图片缩放
                //window.setTimeout(image_zoom, 1000);
                function image_zoom() {
                    var panimage1, img = top.window.document.getElementById(imgId);
                    function doInit() {
                        var result = adjustLayout(960, 640, this.width, this.height);

                        jQuery(function ($) {
                            panimage1 = new imagepanner({
                                wrapper: $('#div_img_' + file_no, top.window.document), // jQuery selector to image container
                                imgpos: [0, 0], // initial image position- x, y
                                maxlevel: 4, // maximum zoom level
                                controlzoom: 0.2
                            })
                        });

                        panimage1.zoom(result.zoomFactor + '');
                        //判断 img对应是否存在
                        if (img) {
                            $(img).css({
                                left: result.x
                            });
                        }

                    }

                    if (img) {
                        if (img.width) {
                            doInit.call(img);
                        }
                        img.onload = function () {
                            doInit();
                        };
                    }

                    function adjustLayout(containerWidth, containerHeight, imgWidth, imgHeight) {
                        var zoomFactor = 1, x = 0;

                        // 长宽 都超出div
                        if (imgWidth >= containerWidth && imgHeight >= containerHeight) {
                            var zoomFactorHeight = containerHeight / imgHeight,
                                zoomFactorWidth = containerWidth / imgWidth;
                            zoomFactor = zoomFactorHeight < zoomFactorWidth ? zoomFactorHeight : zoomFactorWidth;
                        }

                        if (imgWidth <= containerWidth && imgHeight <= containerHeight) {
                            x = (containerWidth - imgWidth) / 2;
                        }

                        if (imgWidth > containerWidth && imgHeight < containerHeight) {
                            zoomFactor = containerWidth / imgWidth;
                        }
                        if (imgWidth <= containerWidth && imgHeight > containerHeight) {
                            zoomFactor = containerHeight / imgHeight;
                            x = (containerWidth - imgWidth * zoomFactor) / 2;
                        }
                        return {
                            zoomFactor: zoomFactor,
                            x: x
                        };
                    }
                }
            }
            else if (data.file_type == "eml") {
                opener.$.dialog({
                    title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
                    content: 'url:' + GUrl + '/Ihgforms/ViewFileEml.aspx?file_no=' + data.guid,
                    lock: false,
                    max: true,
                    min: true,
                    resize: true,
                    parent: _parent,
                    close: function () {
                        try {
                            if (_parent) {
                                opener.$.dialog({ id: _Api.iframe.name });
                            }
                        } catch (e) {
                        }
                    },
                    init: function () {
                    }
                });


            }
        }
        else {
            // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '该文件类型不支持在线浏览器'), null, { icon: 'hits.gif' });
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', '该文件类型不支持在线预览，直接下载？'), function () {
                if (isDownLoad == false) {
                    Box.Alert(GRESX.HINTS.TITLE, GetResource('S150120171030232', '没有下载权限！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
                DownLoad(file_no, file_name, model)
            }, { icon: 'hits.gif', width: '300' }, null);
        }
    }
    Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name, model: model }, success);

}

//预览附件
//file_no:文件file_no
//file_name:文件名称
//model :系统模块
function ViewFilePDFNew(file_no, file_name, model, case_id, proc_id, file_desc_code) {
    //if (file_name.indexOf(".doc") > 0 || file_name.indexOf(".docx") > 0) {
    //    //DownLoad(file_no, file_name, model);

    //    return;
    //}
    if (file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
        && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".xls") < 0) {
        Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', '该文件类型不支持在线预览，直接下载？'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
        return;
    }
    file_name = file_name.replace("&", "");
    var success = function (data) {

        if (data.ClientInfo.Result) {

            var opener = window;
            var _Api = this;
            _parent = null;
            if (frameElement.api) {
                _Api = frameElement.api;
                opener = _Api.opener;
                _parent = _Api;

            }
            data.filename = data.filename.replace("&", "");
            if (data.file_type == "pdf") {
                var FileCode = ['200021', '200701', '200103', '200602'];
                var isbool = false;
                var w_width = 980;
                if (top.window._UserModel.RoleCode.indexOf('ic') > -1 || top.window._UserModel.RoleCode.indexOf('fa') > -1) {
                    if (file_desc_code) {
                        for (var i = 0; i < file_desc_code.length; i++) {
                            if (file_desc_code == FileCode[i]) {
                                isbool = true;
                                w_width = 1280;
                            }
                        }
                    }
                }
                opener.$.dialog({
                    title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height / 2,
                    content: 'url:' + GUrl + '/Ihgforms/ViewFilePDF.aspx?file=../TempFile/SWFFile/' + data.guid + '/' + data.filename + "&case_id=" + case_id + '&isbool=' + isbool + '&proc_id=' + proc_id,
                    lock: false,
                    max: true,
                    min: true,
                    resize: true,
                    parent: _parent,
                    close: function () {
                        try {
                            if (_parent) {
                                opener.$.dialog({ id: _Api.iframe.name });
                            }
                        } catch (e) {
                        }
                    },
                    init: function () {

                        var context = opener.lhgdialog.list['Preview_' + file_no].content;
                        if (context != null && context.PreviewJs != null) {
                            //context.$("#guid").val(data.guid);
                            //context.$("#file_name").val(data.filename);
                            //context.PreviewJs.file_no = file_no;
                            //context.PreviewJs.file_name = file_name;
                            //context.PreviewJs.LoadFlex();
                            context.$("#downloadFile").bind("click", function () { DownLoad(file_no, file_name); });
                        }

                    }
                });
            } else if (data.file_type == "img") {
                // 图片的预览
                var myheight = window.screen.height - 240;
                var imgId = "img_show_" + file_no;

                opener.$.dialog({
                    title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
                    content: "<div id='div_img_" + file_no + "' style='text-align: center;width:960px;height:" + myheight + "px;overflow:auto;'><img id='" + imgId + "' src='./TempFile/SWFFile/" + data.guid + "/" + data.filename + "' /></div>",
                    lock: false,
                    max: true,
                    min: true,
                    resize: true,
                    parent: _parent,
                    init: image_zoom,

                    close: function () {
                        try {
                            if (_parent) {
                                opener.$.dialog({ id: _Api.iframe.name });
                            }
                        } catch (e) {
                        }
                    }
                });

                // 图片缩放
                //window.setTimeout(image_zoom, 1000);
                function image_zoom() {
                    var panimage1, img = top.window.document.getElementById(imgId);
                    function doInit() {
                        var result = adjustLayout(960, 640, this.width, this.height);

                        jQuery(function ($) {
                            panimage1 = new imagepanner({
                                wrapper: $('#div_img_' + file_no, top.window.document), // jQuery selector to image container
                                imgpos: [0, 0], // initial image position- x, y
                                maxlevel: 4, // maximum zoom level
                                controlzoom: 0.2
                            })
                        });

                        panimage1.zoom(result.zoomFactor + '');
                        //判断 img对应是否存在
                        if (img) {
                            $(img).css({
                                left: result.x
                            });
                        }

                    }

                    if (img) {
                        if (img.width) {
                            doInit.call(img);
                        }
                        img.onload = function () {
                            doInit();
                        };
                    }

                    function adjustLayout(containerWidth, containerHeight, imgWidth, imgHeight) {
                        var zoomFactor = 1, x = 0;

                        // 长宽 都超出div
                        if (imgWidth >= containerWidth && imgHeight >= containerHeight) {
                            var zoomFactorHeight = containerHeight / imgHeight,
                                zoomFactorWidth = containerWidth / imgWidth;
                            zoomFactor = zoomFactorHeight < zoomFactorWidth ? zoomFactorHeight : zoomFactorWidth;
                        }

                        if (imgWidth <= containerWidth && imgHeight <= containerHeight) {
                            x = (containerWidth - imgWidth) / 2;
                        }

                        if (imgWidth > containerWidth && imgHeight < containerHeight) {
                            zoomFactor = containerWidth / imgWidth;
                        }
                        if (imgWidth <= containerWidth && imgHeight > containerHeight) {
                            zoomFactor = containerHeight / imgHeight;
                            x = (containerWidth - imgWidth * zoomFactor) / 2;
                        }
                        return {
                            zoomFactor: zoomFactor,
                            x: x
                        };
                    }
                }
            }
        } else if (data.file_type == "eml") {
            opener.$.dialog({
                title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
                content: 'url:' + GUrl + '/Ihgforms/ViewFileEml.aspx?file_no=' + data.guid,
                lock: false,
                max: true,
                min: true,
                resize: true,
                parent: _parent,
                close: function () {
                    try {
                        if (_parent) {
                            opener.$.dialog({ id: _Api.iframe.name });
                        }
                    } catch (e) {
                    }
                },
                init: function () {
                }
            });


        }
        else {
            // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', '该文件类型不支持在线浏览器'), null, { icon: 'hits.gif' });
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160628140158820', '该文件类型不支持在线浏览器，直接下载？'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
        }
    }
    Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name, model: model }, success);

}

function WordToPdf(file_no, file_name, model) {


}

//增加全平台文件预览功能
function ViewFileAll(file_no, file_name, ViewUrl) {
    var opener = window;
    var _Api = this;
    _parent = null;
    if (frameElement.api) {
        _Api = frameElement.api;
        opener = _Api.opener;
        _parent = _Api;
    }
    var LocalUrl = GetPublishConfigValueFn('ViewAll', 'LocalUrl');
    if (!LocalUrl) {
        LocalUrl = GUrl;
    }
    function success(Meta) {
        if (Meta.ClientInfo.Result) {
            var file_url = GUrl + "/TempFile/SWFFile/" + file_no + "/" + Meta.filename;
            var basestr = encodeURIComponent(Base64.encode(file_url));
            opener.$.dialog({
                title: GetResource('S141203210137300', '预览') + "—" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 200,
                content: 'url:' + GUrl + "/IhgForms/ViewFileAll.aspx?ViewUrl=" + ViewUrl + '&url=' + basestr,
                lock: false,
                max: true,
                min: true,
                resize: true,
                parent: _parent,
                close: function () {
                    try {
                        if (_parent) {
                            opener.$.dialog({ id: _Api.iframe.name });
                        }
                    } catch (e) {
                    }
                },
                init: function () {
                    var context = window.lhgdialog.list['Preview_' + file_no].content;
                    if (context != null && context.PreviewAll != null) {
                        context.$("#downloadFile").bind("click", function () { DownLoad(file_no, file_name); });
                    }
                }
            });
        }
    }
    Ajax.Request("Common.ashx", { Call: "ViewOnLineNew", file_no: file_no, file_name: file_name }, success);
}

function OpenViewImg(id, file_path) {
    var opener = window;
    var _Api = this;
    _parent = null;
    if (frameElement.api) {
        _Api = frameElement.api;
        opener = _Api.opener;
        _parent = _Api;

    }
    // 图片的预览
    var myheight = window.screen.height - 240;
    var imgId = "img_show_" + id;

    opener.$.dialog({
        title: GetResource('S141203210137300', '预览') + "—" + imgId, id: "Preview_" + id, width: 980, height: myheight,
        content: "<div id='div_img_" + id + "' style='text-align: center;width:960px;height:" + myheight + "px;overflow:auto;'><img id='" + imgId + "' src='" + file_path + "' /></div>",
        lock: false,
        max: true,
        min: true,
        resize: true,
        parent: _parent,
        init: image_zoom,
        close: function () {
            try {
                if (_parent) {
                    opener.$.dialog({ id: _Api.iframe.name });
                }
            } catch (e) {
            }
        }
    });

    // 图片缩放
    //window.setTimeout(image_zoom, 1000);
    function image_zoom() {
        var panimage1, img = window.parent.document.getElementById(imgId);
        function doInit() {
            var result = adjustLayout(960, 640, this.width, this.height);

            jQuery(function ($) {
                panimage1 = new imagepanner({
                    wrapper: $('#div_img_' + id, window.parent.document), // jQuery selector to image container
                    imgpos: [0, 0], // initial image position- x, y
                    maxlevel: 4, // maximum zoom level
                    controlzoom: 0.2
                })
            });

            panimage1.zoom(result.zoomFactor + '');
            $(img).css({
                left: result.x
            });
        }

        if (img.width) {
            doInit.call(img);
        }
        img.onload = function () {
            doInit();
        };
        function adjustLayout(containerWidth, containerHeight, imgWidth, imgHeight) {
            var zoomFactor = 1, x = 0;

            // 长宽 都超出div
            if (imgWidth >= containerWidth && imgHeight >= containerHeight) {
                var zoomFactorHeight = containerHeight / imgHeight,
                    zoomFactorWidth = containerWidth / imgWidth;
                zoomFactor = zoomFactorHeight < zoomFactorWidth ? zoomFactorHeight : zoomFactorWidth;
            }

            if (imgWidth <= containerWidth && imgHeight <= containerHeight) {
                x = (containerWidth - imgWidth) / 2;
            }

            if (imgWidth > containerWidth && imgHeight < containerHeight) {
                zoomFactor = containerWidth / imgWidth;
            }
            if (imgWidth <= containerWidth && imgHeight > containerHeight) {
                zoomFactor = containerHeight / imgHeight;
                x = (containerWidth - imgWidth * zoomFactor) / 2;
            }
            return {
                zoomFactor: zoomFactor,
                x: x
            };
        }
    }
}

//传输文件（包括生产excel等实体文件再进行导出的处理，file_size为非必填项）
function GetFileNew(guid, file_size, file_type) {
    if (top.window.GUrl) {
        var ifr = top.window.document.getElementById("iFile");
        ifr.src = "AjaxServers/FileHandlerNew.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    }
}


//传输文件（包括生产excel等实体文件再进行导出的处理，file_size为非必填项）
function GetFile(guid, file_size, file_type) {
    if (top.window.GUrl) {
        var ifr = top.window.document.getElementById("iFile");
        ifr.src = "AjaxServers/FileHandler.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    }
}

//传输文件（包括生产excel等实体文件再进行导出的处理，file_size为非必填项）
function GetFiles(guid, file_size, file_type) {
    if (top.window.GUrl) {
        var ifr = top.window.document.getElementById("iFile");
        ifr.src = "AjaxServers/FileHandler.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    }
}

//下载文件（新窗口）
function GetFileNewWindow(guid, file_size, file_type) {
    var src = top.window.GUrl + "/AjaxServers/FileHandler.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    window.open(src, "_blank");
}

//设定行选中的背景色
function SetClickTrCSS(_tr, _style) {
    if (_style) {
        $(_tr).attr("style", _style).siblings().attr("style", "");
    }
    else {
        $(_tr).attr("style", "background-color:#ccc ; ").siblings().attr("style", "");
    }
}

//隐藏或者显示某个元素
function ShowHideDiv(_this, _obj_id) {

    if ($("#" + _obj_id).is(":hidden")) {
        $("#" + _obj_id).show(200);
        $(_this).attr("class", "tbimg_hide");
    }
    else {
        $("#" + _obj_id).hide(200);
        $(_this).attr("class", "tbimg_show");
    }
}
//隐藏或者显示某个元素
function ShowHideDivClass(_this, _obj_id) {

    if ($("." + _obj_id).is(":hidden")) {
        $("." + _obj_id).show(200);
        $(_this).attr("class", "tbimg_hide");
    }
    else {
        $("." + _obj_id).hide(200);
        $(_this).attr("class", "tbimg_show");
    }
}

//隐藏或者显示某个元素 样式不一样
function ShowHide(_this, _obj_id, _obj_id2) {

    if ($("#" + _obj_id).is(":hidden")) {
        $(_this).attr("title", GetResource('S140929141518276', '点击隐藏'));
        $(_this).attr("class", "img_show");
    }
    else {
        $(_this).attr("title", GetResource('S140929141358903', '点击显示'));
        $(_this).attr("class", "img_hide");
    }
    $("#" + _obj_id).slideToggle(600);
    if (_obj_id2) {
        $("#" + _obj_id2).slideToggle(600);
    }
}

//绑定下拉框的公共方法
$.BindSelectData = function (_selectID, _data) {
    var _language = top.window.GLanguage;
    var _option = "";
    if (_data != null && _data.length > 0) {
        $("#" + _selectID + ">option").remove();
        for (var i = 0; i < _data.length; i++) {
            _option += "<option value='" + _data[i].value + "'>" + _data[i]["text_" + _language] + "</option>";
        }
        $("#" + _selectID).append(_option);
    }

}
//返回自动邮件地址提示函数
$.AutoMailParas = function () {
    return ['163.com', 'qq.com', '126.com', 'sina.com', 'sohu.com', 'yahoo.cn', 'gmail.com', 'hotmail.com', 'live.cn'];

}

//判断身份证号是否是15位或者18位
$.CheckIdCard = function (_text) {

    var v15 = /^\d\d\d\d\d\d\d\d\d\d\d\d\d\d\d$/;
    var v18 = /^\d\d\d\d\d\d\d\d\d\d\d\d\d\d\d\d\d[0-9X]$/
    if (_text.length == 15) {
        if (!_text.match(v15)) {
            return false;
        }
    } else if (_text.length == 18) {
        if (!_text.match(v18)) {
            return false;
        }
    } else {
        return false;
    }
    return true;
}
$.CheckIdCardNew = function (idcard) {
    var Errors = new Array("true", "身份证号码位数不对!", "身份证号码出生日期超出范围或含有非法字符!", "身份证号码校验错误!", "身份证地区非法!");
    var area = {
        11: "北京", 12: "天津", 13: "河北", 14: "山西", 15: "内蒙古", 21: "辽宁", 22: "吉林", 23: "黑龙江", 31: "上海", 32: "江苏", 33: "浙江",
        34: "安徽", 35: "福建", 36: "江西", 37: "山东", 41: "河南", 42: "湖北", 43: "湖南", 44: "广东", 45: "广西", 46: "海南", 50: "重庆", 51: "四川",
        52: "贵州", 53: "云南", 54: "西藏", 61: "陕西", 62: "甘肃", 63: "青海", 64: "宁夏", 65: "xinjiang", 71: "台湾", 81: "香港", 82: "澳门", 91: "国外"
    }
    var Y, JYM;
    var S, M;
    var idcard_array = new Array();
    idcard_array = idcard.split("");
    if (area[parseInt(idcard.substr(0, 2))] == null) return Errors[4];
    switch (idcard.length) {
        case 15:
            if ((parseInt(idcard.substr(6, 2)) + 1900) % 4 == 0 || ((parseInt(idcard.substr(6, 2)) + 1900) % 100 == 0 && (parseInt(idcard.substr(6, 2)) + 1900) % 4 == 0)) {
                ereg = /^[1-9][0-9]{5}[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|[1-2][0-9]))[0-9]{3}$/; //测试出生日期的合法性
            }
            else {
                ereg = /^[1-9][0-9]{5}[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|1[0-9]|2[0-8]))[0-9]{3}$/; //测试出生日期的合法性
            }
            if (ereg.test(idcard))
                return Errors[0];
            else
                return Errors[2];
            break;
        case 18:
            if (parseInt(idcard.substr(6, 4)) % 4 == 0 || (parseInt(idcard.substr(6, 4)) % 100 == 0 && parseInt(idcard.substr(6, 4)) % 4 == 0)) {
                ereg = /^[1-9][0-9]{5}19[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|[1-2][0-9]))[0-9]{3}[0-9Xx]$/; //闰年出生日期的合法性正则表达式
            }
            else {
                ereg = /^[1-9][0-9]{5}19[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|1[0-9]|2[0-8]))[0-9]{3}[0-9Xx]$/; //平年出生日期的合法性正则表达式
            }
            if (ereg.test(idcard)) {
                S = (parseInt(idcard_array[0]) + parseInt(idcard_array[10])) * 7 + (parseInt(idcard_array[1]) + parseInt(idcard_array[11])) * 9
                    + (parseInt(idcard_array[2]) + parseInt(idcard_array[12])) * 10 + (parseInt(idcard_array[3])
                        + parseInt(idcard_array[13])) * 5 + (parseInt(idcard_array[4]) + parseInt(idcard_array[14])) * 8
                    + (parseInt(idcard_array[5]) + parseInt(idcard_array[15])) * 4 + (parseInt(idcard_array[6]) + parseInt(idcard_array[16])) * 2
                    + parseInt(idcard_array[7]) * 1 + parseInt(idcard_array[8]) * 6 + parseInt(idcard_array[9]) * 3;
                Y = S % 11;
                M = "F";
                JYM = "10X98765432";
                M = JYM.substr(Y, 1);
                if (M == idcard_array[17])
                    return Errors[0];
                else
                    return Errors[3];
            }
            else
                return Errors[2];
            break;
        default:
            return Errors[1];
            break;
    }
}

$.CheckIdCardNew2 = function (idCard) {
    var Wi = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2, 1];    // 加权因子
    var ValideCode = [1, 0, 10, 9, 8, 7, 6, 5, 4, 3, 2];            // 身份证验证位值.10代表X
    /**
     * 判断身份证号码为18位时最后的验证位是否正确
     * @param a_idCard 身份证号码数组
     * @return
     */
    function isTrueValidateCodeBy18IdCard(a_idCard) {
        var sum = 0;                             // 声明加权求和变量
        if (a_idCard[17].toLowerCase() == 'x') {
            a_idCard[17] = 10;                    // 将最后位为x的验证码替换为10方便后续操作
        }
        for (var i = 0; i < 17; i++) {
            sum += Wi[i] * a_idCard[i];            // 加权求和
        }
        valCodePosition = sum % 11;                // 得到验证码所位置
        if (a_idCard[17] == ValideCode[valCodePosition]) {
            return true;
        } else {
            return false;
        }
    }
    /**
      * 验证18位数身份证号码中的生日是否是有效生日
      * @param idCard 18位书身份证字符串
      * @return
      */
    function isValidityBrithBy18IdCard(idCard18) {
        var year = idCard18.substring(6, 10);
        var month = idCard18.substring(10, 12);
        var day = idCard18.substring(12, 14);
        var temp_date = new Date(year, parseFloat(month) - 1, parseFloat(day));
        // 这里用getFullYear()获取年份，避免千年虫问题
        if (temp_date.getFullYear() != parseFloat(year)
            || temp_date.getMonth() != parseFloat(month) - 1
            || temp_date.getDate() != parseFloat(day)) {
            return false;
        } else {
            return true;
        }
    }
    /**
     * 验证15位数身份证号码中的生日是否是有效生日
     * @param idCard15 15位书身份证字符串
     * @return
     */
    function isValidityBrithBy15IdCard(idCard15) {
        var year = idCard15.substring(6, 8);
        var month = idCard15.substring(8, 10);
        var day = idCard15.substring(10, 12);
        var temp_date = new Date(year, parseFloat(month) - 1, parseFloat(day));
        // 对于老身份证中的你年龄则不需考虑千年虫问题而使用getYear()方法
        if (temp_date.getYear() != parseFloat(year)
            || temp_date.getMonth() != parseFloat(month) - 1
            || temp_date.getDate() != parseFloat(day)) {
            return false;
        } else {
            return true;
        }
    }
    //去掉字符串头尾空格
    function trim(str) {
        return str.replace(/(^\s*)|(\s*$)/g, "");
    }

    idCard = trim(idCard.replace(/ /g, ""));               //去掉字符串头尾空格
    if (idCard.length == 15) {
        return isValidityBrithBy15IdCard(idCard);       //进行15位身份证的验证
    } else if (idCard.length == 18) {
        var a_idCard = idCard.split("");                // 得到身份证数组
        if (isValidityBrithBy18IdCard(idCard) && isTrueValidateCodeBy18IdCard(a_idCard)) {   //进行18位身份证的基本验证和第18位的验证
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

//扩展javascript对象方法、属性
String.format = function () {
    var arr = arguments;
    return arr[0].replace(/\{(\d+)\}/g, function (m, n) {
        return arr[n - 1 + 2];
    });
}

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (elt) {
        var len = this.length >>> 0;
        var from = Number(arguments[1]) || 0;
        from = (from < 0) ? Math.ceil(from) : Math.floor(from);
        if (from < 0) {
            from += len;
        }
        for (; from < len; from++) {
            if (from in this && this[from] === elt) {
                return from;
            }
        }
        return -1;
    };
}

Array.prototype.remove = function (val) {
    if (val) {
        var index = this.indexOf(val);
        if (index > -1) {
            this.splice(index, 1);
        }
    }
};



if (!String.prototype.trim) {
    String.prototype.trim = function () {
        return this.replace(/(^\s*)|(\s*$)/g, "");
    }
}
if (!String.prototype.ltrim) {
    String.prototype.ltrim = function () {
        return this.replace(/(^\s*)/g, "");
    }
}
if (!String.prototype.rtrim) {
    String.prototype.rtrim = function () {
        return this.replace(/(\s*$)/g, "");
    }
}

String.prototype.replaceAll = function (reallyDo, replaceWith, ignoreCase) {
    if (!RegExp.prototype.isPrototypeOf(reallyDo)) {
        return this.replace(new RegExp(reallyDo, (ignoreCase ? "gi" : "g")), replaceWith);
    } else {
        return this.replace(reallyDo, replaceWith);
    }
}

//选择列表
//title：弹出窗标题， datalist：选择列表参数（ajax获取方法及表格栏位信息）
//，result：选择结果参数(结果数组或ajax获取方法) ，success：提交回调函数（返回结果数组）, basedata: 需要增加的基础数据, ihgWidth: 弹框宽度，ihgHeight ：弹框高度
function ShowIhgSelect(title, datalist, result, success, basedata, ihgWidth, ihgHeight) {

    if (!ihgWidth) {
        ihgWidth = 720
    }
    if (!ihgHeight) {
        ihgHeight = 500
    }

    var id = NewGuid();
    var opener = window;
    var _Api = this;
    if (frameElement.api) {
        _Api = frameElement.api;
        opener = _Api.opener;

    }
    opener.$.dialog({
        id: id, title: title,
        content: "url:" + GUrl + "/IhgForms/IhgSelect.aspx",
        lock: true, fixed: true, width: ihgWidth, height: ihgHeight,
        resize: false, max: false, min: false, parent: _Api,
        init: function () {
            var newApi = opener.lhgdialog.list[id].content;
            if (newApi != null && newApi.IhgSelect != null) {
                newApi.IhgSelect.DataList = datalist;
                newApi.IhgSelect.Result = result;
                newApi.IhgSelect.basedata = basedata;
                newApi.IhgSelect.Imax = datalist.Imax;
                newApi.IhgSelect.InitPage();
            }
        },
        close: function () {/*弹出框(特别是公共方法)的关闭方法最好使用try捕获异常返回true,避免因为不可知的js异常导致用户无法正常关闭窗口*/
            try {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi && newApi.IhgSelect.IsModify && newApi.IhgSelect.Return) {
                    success(newApi.IhgSelect.Return);
                }
            } catch (e) {
            }
            finally {
                if (frameElement.api) {
                    opener.$.dialog({ id: frameElement.api.iframe.name });
                }
                return true;
            }
        }
    });

}
//选择列表   这个页面是只有点击查询按钮 值才会变化
//title：弹出窗标题， datalist：选择列表参数（ajax获取方法及表格栏位信息）
//，result：选择结果参数(结果数组或ajax获取方法) ，success：提交回调函数（返回结果数组）, basedata: 需要增加的基础数据
function ShowIhgSelectOnlySearch(title, datalist, result, success, basedata) {

    var id = NewGuid();
    var opener = window;
    var _Api = this;
    if (frameElement.api) {
        _Api = frameElement.api;
        opener = _Api.opener;

    }
    opener.$.dialog({
        id: id, title: title,
        content: "url:" + GUrl + "/IhgForms/IhgSelectSearch.aspx",
        lock: true, fixed: true, width: 720, height: 500,
        resize: false, max: false, min: false, parent: _Api,
        init: function () {
            var newApi = opener.lhgdialog.list[id].content;
            if (newApi != null && newApi.IhgSelect != null) {
                newApi.IhgSelect.DataList = datalist;
                newApi.IhgSelect.Result = result;
                newApi.IhgSelect.basedata = basedata;
                newApi.IhgSelect.Imax = datalist.Imax;
                newApi.IhgSelect.InitPage();
            }
        },
        close: function () {/*弹出框(特别是公共方法)的关闭方法最好使用try捕获异常返回true,避免因为不可知的js异常导致用户无法正常关闭窗口*/
            try {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi && newApi.IhgSelect.IsModify && newApi.IhgSelect.Return) {
                    success(newApi.IhgSelect.Return);
                }
            } catch (e) {
            }
            finally {
                if (frameElement.api) {
                    opener.$.dialog({ id: frameElement.api.iframe.name });
                }
                return true;
            }
        }
    });

}

//编辑产品窗口
function ShowIhgSelectGoods(title, datalist, result, success) {
    var id = NewGuid();
    var opener = window;
    var _Api = this;
    if (frameElement.api) {
        _Api = frameElement.api;
        opener = _Api.opener;

    }
    opener.$.dialog({
        id: id, title: title,
        content: "url:" + GUrl + "/IhgForms/Patent/GJWGSJFL.aspx",
        lock: true, fixed: true, width: 920, height: 500,
        resize: false, max: false, min: false, parent: _Api,
        init: function () {
            var newApi = opener.lhgdialog.list[id].content;
            if (newApi != null && newApi.IhgSelect != null) {
                newApi.IhgSelect.DataList = datalist;
                newApi.IhgSelect.Result = result;
                newApi.IhgSelect.Imax = datalist.Imax;
                newApi.IhgSelect.InitPage();
            }
        },
        close: function () {/*弹出框(特别是公共方法)的关闭方法最好使用try捕获异常返回true,避免因为不可知的js异常导致用户无法正常关闭窗口*/
            try {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi && newApi.IhgSelect.IsModify && newApi.IhgSelect.Return) {
                    success(newApi.IhgSelect.Return);
                }
            } catch (e) {
            }
            finally {
                if (frameElement.api) {
                    opener.$.dialog({ id: frameElement.api.iframe.name });
                }
                return true;
            }

        }
    });

}


//选择列表
//title：弹出窗标题， datalist：选择列表参数（ajax获取方法及表格栏位信息），result：选择结果参数(结果数组或ajax获取方法)，success：提交回调函数（返回结果数组）
function ShowIhgSelect2(title, datalist, result, success) {

    var id = NewGuid();
    var opener = window;
    var _Api = this;
    if (frameElement.api) {
        _Api = frameElement.api;
        opener = _Api.opener;

    }
    opener.$.dialog({
        id: id, title: title,
        content: "url:" + GUrl + "/IhgForms/IhgSearchCase.aspx",
        lock: true, fixed: true, width: 1220, height: 500,
        resize: false, max: false, min: false, parent: _Api,
        init: function () {
            var newApi = opener.lhgdialog.list[id].content;
            if (newApi != null && newApi.IhgSelect != null) {
                newApi.IhgSelect.DataList = datalist;
                newApi.IhgSelect.Result = result;
                newApi.IhgSelect.Imax = datalist.Imax;
                newApi.IhgSelect.InitPage();
            }
        },
        close: function () {/*弹出框(特别是公共方法)的关闭方法最好使用try捕获异常返回true,避免因为不可知的js异常导致用户无法正常关闭窗口*/
            try {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi && newApi.IhgSelect.IsModify && newApi.IhgSelect.Return) {
                    success(newApi.IhgSelect.Return);
                }
            } catch (e) {
            }
            finally {
                if (frameElement.api) {
                    opener.$.dialog({ id: frameElement.api.iframe.name });
                }
                return true;
            }
        }
    });

}


//流程处理，obj_id：处理对象id， flow_type：流程类型，flow_sub_type：流程子类型， ajax_config：指定流程提交的处理方法及自定义传到后台的参数，call_bak：流程提交成功后前台回调函数，close_back（可选）：提交窗口关闭时触发
//call_bak 返回参数f_audit_type_id 包含noflow（无流程）、submit（提交成功）
function FlowSubmit(obj_id, flow_type, flow_sub_type, ajax_config, call_back, close_back) {

    var success = function (data) {
        switch (data.Result.status) {
            //无记录
            case -1:
                {
                    //无流程
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', '无流程，直接提交！'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //已完成
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', '流程已完成，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            //当前提交人不是流程列表里所配置的人
            case 99999:
                {
                    //英创嘉友定制 如果是管理员的话，对code不做处理 可以弹窗
                    if (GetPublishConfig("YCJY", "202511")){
                        if(top.window._UserModel.RoleCode.toUpperCase().indexOf("REPORT") >= 0){
                            break;
                        }else{
                            Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', '当前提交人不是流程里所配置的人，请勿同一个浏览器登录多个用户，请退出重新登录账号再试！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                            return;
                        }
                    }else{
                        Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', '当前提交人不是流程里所配置的人，请勿同一个浏览器登录多个用户，请退出重新登录账号再试！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                        return;
                    }
                }

            default:
                {
                    if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                        break;
                    }
                    //if (data.Result.cur_user_id != top.window._UserModel.user_id) {
                    if (data.Result.cur_user_id.indexOf(top.window._UserModel.user_id) == -1) {
                        Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', '您不是当前流程办理人员，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                        return;
                    }
                    break;
                }
        }

        var id = "ihg_" + obj_id;
        var opener = top.window;
        //        var _Api = this;
        //        if (frameElement.api) {
        //            _Api = frameElement.api;
        //            opener = _Api.opener;

        //        }
        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', '流程提交'),
            content: "url:" + GUrl + "/IhgForms/IhgFlow.aspx",
            lock: true, fixed: true, width: 720, height: 500,
            resize: false, max: false, min: false,
            init: function () {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgFlow != null) {
                    newApi.IhgFlow.ajax_config = ajax_config;
                    newApi.IhgFlow.flow_info = data.Result;
                    newApi.IhgFlow.call_back = call_back;
                    newApi.IhgFlow.audit_type_id = "submit";
                    newApi.IhgFlow.InitPage();
                }
            },
            // close_back 由调用方按需传入（如需在窗口关闭时回滚），不传则无副作用
            close: close_back || undefined
        });

    }
    Ajax.Request("Common.ashx", { Call: "GetFlowInfo", obj_id: obj_id, flow_type: flow_type, flow_sub_type: flow_sub_type }, success);
}



//流程处理，obj_id：处理对象id， flow_type：流程类型，flow_sub_type：流程子类型， ajax_config：指定流程提交的处理方法及自定义传到后台的参数，call_bak：流程提交成功后前台回调函数
//call_bak 返回参数f_audit_type_id 包含noflow（无流程）、submit（提交成功） call_pre 点击确认时的前置函数
function FlowSubmitPre(obj_id, flow_type, flow_sub_type, ajax_config, call_back,call_pre) {

    var success = function (data) {
        switch (data.Result.status) {
            //无记录
            case -1:
                {
                    //无流程
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', '无流程，直接提交！'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //已完成
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', '流程已完成，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            //当前提交人不是流程列表里所配置的人
            case 99999:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', '当前提交人不是流程里所配置的人，请勿同一个浏览器登录多个用户，请退出重新登录账号再试！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }

            default:
                {
                    if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                        break;
                    }
                    //if (data.Result.cur_user_id != top.window._UserModel.user_id) {
                    if (data.Result.cur_user_id.indexOf(top.window._UserModel.user_id) == -1) {
                        Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', '您不是当前流程办理人员，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                        return;
                    }
                    break;
                }
        }

        var id = "ihg_" + obj_id;
        var opener = top.window;
        //        var _Api = this;
        //        if (frameElement.api) {
        //            _Api = frameElement.api;
        //            opener = _Api.opener;

        //        }
        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', '流程提交'),
            content: "url:" + GUrl + "/IhgForms/IhgFlow.aspx",
            lock: true, fixed: true, width: 720, height: 500,
            resize: false, max: false, min: false,
            init: function () {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgFlow != null) {
                    newApi.IhgFlow.ajax_config = ajax_config;
                    newApi.IhgFlow.flow_info = data.Result;
                    newApi.IhgFlow.call_back = call_back;
                    newApi.IhgFlow.call_pre = call_pre;
                    newApi.IhgFlow.audit_type_id = "submit";
                    newApi.IhgFlow.InitPage();
                }
            }
        });

    }
    Ajax.Request("Common.ashx", { Call: "GetFlowInfo", obj_id: obj_id, flow_type: flow_type, flow_sub_type: flow_sub_type }, success);
}

//流程处理，obj_id：处理对象id， flow_type：流程类型，flow_sub_type：流程子类型， ajax_config：指定流程提交的处理方法及自定义传到后台的参数，call_bak：流程提交成功后前台回调函数
//call_bak 返回参数f_audit_type_id 包含noflow（无流程）、submit（提交成功）
function FlowSubmitHz(obj_id, flow_type, flow_sub_type, ajax_config, call_back) {

    var success = function (data) {
        switch (data.Result.status) {
            //无记录
            case -1:
                {
                    //无流程
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', '无流程，直接提交！'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //已完成
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', '流程已完成，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            //当前提交人不是流程列表里所配置的人
            case 99999:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', '当前提交人不是流程里所配置的人，请勿同一个浏览器登录多个用户，请退出重新登录账号再试！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }

            default:
                {
                    if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                        break;
                    }
                    //if (data.Result.cur_user_id != top.window._UserModel.user_id) {
                    if (data.Result.cur_user_id.indexOf(top.window._UserModel.user_id) == -1) {
                        Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', '您不是当前流程办理人员，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                        return;
                    }
                    break;
                }
        }

        var id = "ihg_" + obj_id;
        var opener = top.window;

        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', '流程提交'),
            content: "url:" + GUrl + "/IhgForms/IhgFlowHz.aspx",
            lock: true, fixed: true, width: 720, height: 500,
            resize: false, max: false, min: false,
            init: function () {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgFlow != null) {
                    newApi.IhgFlow.ajax_config = ajax_config;
                    newApi.IhgFlow.flow_info = data.Result;
                    newApi.IhgFlow.call_back = call_back;
                    newApi.IhgFlow.audit_type_id = "submit";
                    newApi.IhgFlow.InitPage();
                }
            }
        });

    }
    Ajax.Request("Common.ashx", { Call: "GetFlowInfo", obj_id: obj_id, flow_type: flow_type, flow_sub_type: flow_sub_type }, success);
}

function ApiFlowSubmit(obj_id, flow_type, flow_sub_type, ajax_config, call_back, param) {

    var success = function (data) {
        switch (data.Result.status) {
            //无记录
            case -1:
                {
                    //无流程
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', '无流程，直接提交！'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //已完成
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', '流程已完成，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            default:
                {
                    if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                        break;
                    }
                    //if (data.Result.cur_user_id != top.window._UserModel.user_id) {
                    if (data.Result.cur_user_id.indexOf(top.window._UserModel.user_id) == -1) {
                        if (data.Result.user_name.indexOf(ajax_config.user_name) == -1) {
                            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', '您不是当前流程办理人员，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                            return;
                        }
                    }
                    break;
                }
        }

        var id = "ihg_" + obj_id;
        var opener = top.window;
        //        var _Api = this;
        //        if (frameElement.api) {
        //            _Api = frameElement.api;
        //            opener = _Api.opener;

        //        }
        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', '流程提交'),
            content: "url:" + GUrl + "/IhgForms/ButtJoint/IhgFlow.aspx",
            lock: true, fixed: true, width: 720, height: 500,
            resize: false, max: false, min: false,
            init: function () {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgFlow != null) {
                    newApi.IhgFlow.ajax_config = ajax_config;
                    newApi.IhgFlow.flow_info = data.Result;
                    newApi.IhgFlow.call_back = call_back;
                    newApi.IhgFlow.audit_type_id = "submit";
                    newApi.IhgFlow.InitPage();
                }
            }
        });

    }

    param.obj_id = obj_id;
    param.flow_type = flow_type;
    param.flow_sub_type = flow_sub_type;

    Ajax.ApiRequest(param.url, param, success);
}


//退回
function FlowReject(obj_id, ajax_config, call_back) {

    var id = "ihg_" + obj_id;
    var opener = top.window;
    opener.$.dialog({
        id: id, title: GetResource('S140917194151172', '流程退回'),
        content: "url:" + GUrl + "/IhgForms/IhgFlowReject.aspx",
        lock: true, fixed: true, width: 720, height: 500,
        resize: false, max: false, min: false,
        init: function () {
            var newApi = opener.lhgdialog.list[id].content;
            if (newApi != null && newApi.IhgFlowReject != null) {
                newApi.IhgFlowReject.Audit = false;
                if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                    newApi.IhgFlowReject.Audit = true;
                }
                newApi.IhgFlowReject.ajax_config = ajax_config;
                newApi.IhgFlowReject.obj_id = obj_id;
                newApi.IhgFlowReject.call_back = call_back;
                newApi.IhgFlowReject.InitPage();
            }
        }
    });

}

//移交
function FlowHandover(obj_id, ajax_config, call_back) {

    var success = function (data) {
        if (!data.Result) {
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S170721085703595', '当前流程还未提交不能移交'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        if (data.Result.status == 5000) {
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S151021150346162', '流程已完成，不能移交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        else if (data.Result.status == 0) {
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S151021150505800', '流程在启动流程阶段，不能移交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        var id = "ihg_" + obj_id;
        var opener = top.window;
        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', '流程提交'),
            content: "url:" + GUrl + "/IhgForms/IhgFlow.aspx",
            lock: true, fixed: true, width: 720, height: 500,
            resize: false, max: false, min: false,
            init: function () {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgFlow != null) {
                    newApi.IhgFlow.ajax_config = ajax_config;
                    newApi.IhgFlow.flow_info = data.Result;
                    newApi.IhgFlow.call_back = call_back;
                    newApi.IhgFlow.audit_type_id = "handover";
                    newApi.IhgFlow.InitPage();
                }
            }
        });
    }
    Ajax.Request("Common.ashx", { Call: "GetFlowHandover", obj_id: obj_id }, success);
}

//流程撤回.参数说明{obj_id:处理对象id,ajax_config:自定义参数对象,包括需要请求方法,请求路径,请求参数等,参见eg,call_back:回调函数},
//eg:FlowWithdraw('123', {Call:"egCall",handler:"PatentAction.ashx",...}, call_back)
//obj_id为必须参数,其它参数均为可选项
function FlowWithdraw(obj_id, ajax_config, call_back) {
    function Finish(input) {
        var remark = input.value.trim();
        if (!remark) {
            //alert("撤回原因不能为空");
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S160929143440505', '撤回原因不能为空'), null, { icon: 'hits.gif', width: '150' });
            return false;
        }
        var handler = "Common.ashx";
        var data = {};
        data.Call = "CommFlowWithdraw";
        data.f_obj_id = obj_id;
        data.f_remark = remark;
        if (ajax_config) {
            if (ajax_config.handler) {
                handler = ajax_config.handler;
            }
            $.extend(data, ajax_config);
        }
        function Success(_Meta) {
            if (call_back && typeof call_back == "function") {
                call_back(_Meta);
                return;
            }
            if (_Meta.ClientInfo.Result) {
                Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S170721085739754', '流程已经成功撤回'), null, { icon: 'hits.gif', width: '250', height: '60' });
            }
            else {
                Box.Alert(GRESX.HINTS.TITLE, _Meta.ClientInfo.Message, null, { icon: 'hits.gif', width: '250', height: '60' });
            }

        }
        Ajax.Request(handler, data, Success);
        return true;
    }
    var html = "<div><textarea class='input_auto td_200' style='height:40px;'></textarea></div>";
    $.dialog({
        title: GetResource('S170721085753111', '请输入撤回原因'),
        content: html, lock: true, width: 250,
        min: false, resize: true, max: false,
        focus: true, id: 'printtrade'
        , button: [
            {
                name: Boxsetting.yes, callback: function () {
                    return Finish && Finish.call(this, input);
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

//获得流程办理历史，回调函数返回当前流程信息
// 方迪 KLFD/202601：「流程步骤内容描述」列（flow_step_remark）置于最后一列；仅当发布项 KLFD/202601 开启时显示；列宽加宽见 td_400
function GetFlowHistory(obj_id, table_id, call_back) {
    var isKFDL = false;
    if (GetPublishConfig("KLFD", "202506-2")) {
        isKFDL = true;
    }

    var showFlowStepRemark = GetPublishConfig("KLFD", "202601");

    var user_id = top.window._UserModel.user_id;
    var is_flow_user = false;
    var is_create_user = false;

    //按钮
    $("#btn_addremark").off("click").on("click", function () {
        AddFlowRemark(obj_id, table_id, null);
    });

    var success = function (data) {

        var html = "<thead><tr>"
            + "<td class='td_60'>" + GetResource('S140808093333235', '序号') + "</td>"
            + "<td class='td_150'>" + GetResource('S140922133451105', '流程阶段') + "</td>"
            + "<td class='td_150'>" + GetResource('S140903112755186', '办理人员') + "</td>"
            + "<td class='td_150'>" + GetResource('S140903112827119', '办理时间') + "</td>";

        var flow_activity = null;

        if (data.Result) {

            var language = top.window.GLanguage;
            var flow_type = data.Result[data.Result.length - 1].flow_type;

            // RE 类型表头
            if (flow_type == "RE") {
                html += "<td class='td_100'>" + GetResource('S141110155338289', '撰稿评分') + "</td>";
            }

            html += "<td class='td_100'>" + GetResource('S140903112944511', '办理结果') + "</td>"
                + "<td class='left'>" + GetResource('S140903112908615', '办理意见') + "</td>";

            // 方迪新增列
            if (isKFDL && flow_type == "UD") {
                html += "<td class='left'>审核流程备注</td>";
            }

            if (showFlowStepRemark) {
                html += "<td class='left td_400' style='min-width:400px'>流程步骤内容描述</td>";
            }

            html += "</tr></thead><tbody>";

            for (var i = 0, l = data.Result.length; i < l; i++) {

                $("#btn_addremark").show();

                var row = data.Result[i];

                var user_info = "";
                if (row.audit_cn_name && row.audit_user_id) {
                    user_info = "<a href='javascript:void(0);' onmouseover=\"ShowUserInfo(this,'" + row.audit_user_id + "',event)\">" + row.audit_cn_name + "</a>";
                }

                if (user_id == row.audit_user_id) {
                    is_flow_user = true;
                    if (row.node_code == "FIRST") {
                        is_create_user = true;
                    }
                }

                // 统一备注列（核心）
                var nodeRemarkTd = (isKFDL && flow_type == "UD")
                    ? "<td class='left'>" + (row.node_remark || "") + "</td>"
                    : "";

                var flowStepRemarkTd = showFlowStepRemark
                    ? "<td class='left td_400' style='min-width:400px;word-break:break-word'>" + (row.flow_step_remark || "") + "</td>"
                    : "";

                var tr = "<tr>"
                    + "<td>" + (i + 1) + "</td>"
                    + "<td>" + row["node_name_" + language] + "</td>"
                    + "<td>" + user_info + "</td>"
                    + "<td>" + row.audit_time + "</td>";

                // ===== 最后一条 =====
                if (i == l - 1) {

                    flow_activity = row;

                    if (flow_type == "RE") {
                        tr += "<td>" + row.score + "</td>";
                    }

                    if (flow_type == "AC" && row.node_code == "VOID") {
                        tr += "<td>" + GetResource('S170715173923293', '已作废') + "</td>";
                    } else {
                        tr += "<td>" + (row.node_code == "END" ? "" : GetResource('S140916144529101', '办理中')) + "</td>";
                    }

                    tr += "<td class='left'>" + row.remark + "</td>"
                        + nodeRemarkTd
                        + flowStepRemarkTd
                        + "</tr>";
                }
                else {

                    if (flow_type == "RE") {
                        tr += "<td>" + row.score + "</td>";
                    }

                    tr += "<td>" + row["audit_type_" + language] + "</td>"
                        + "<td class='left'>" + row.remark + "</td>"
                        + nodeRemarkTd
                        + flowStepRemarkTd
                        + "</tr>";
                }

                html += tr;
            }

            html += "</tbody>";
        }
        else {
            html += "<tbody><tr><td colspan='" + (6 + (showFlowStepRemark ? 1 : 0)) + "'>" + GRESX.TABLE.NODATA + "</td></tr></tbody>";
        }

        $("#" + table_id).html(html);

        if (call_back) {
            if (flow_activity) {
                flow_activity.is_flow_user = is_flow_user;
                flow_activity.is_create_user = is_create_user;
            }
            call_back(flow_activity, data.Result);
        }

        if (data.flow_activity &&
            data.flow_activity.audit_user_id &&
            data.flow_activity.audit_user_id.indexOf(user_id) > -1) {
            AddCurUserReadLog(obj_id);
        }
    }

    Ajax.Request("Common.ashx", { Call: "GetFlowHistory", obj_id: obj_id }, success);
}

//添加当前流程备注
function AddFlowRemark(obj_id, table_id, call_back) {
    function CallBack(input) {
        var remark = input.value.trim();
        if (!remark) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S220718094407088', '请输入当前流程备注'), null, { icon: 'hits.gif', width: '150' });
            return false;
        }
        function Success(data) {
            if (data.ClientInfo.Result) {
                Box.Tips(GRESX.HINTS.TITLE, 2, GetResource('S150109154056964', '添加成功！'), function () { GetFlowHistory(obj_id, table_id, call_back) }, { icon: 'succ.gif' }); return;
            } else {
                Box.Alert(GRESX.HINTS.TITLE, data.ClientInfo.Message, null, { icon: 'fail.gif' });
            }
        }
        Ajax.Request('Common.ashx', { Call: 'AddFlowRemark', obj_id: obj_id, remark: remark }, Success);

    }
    var Dialog = function () {
        var html = "<div><textarea class='input_auto td_200' style='height:40px;'></textarea></div>";
        $.dialog({
            title: GetResource('S220715164644885', '当前流程备注'),
            content: html, lock: true, width: 250,
            min: false, resize: true, max: false,
            focus: true, id: 'remark'
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

}
//打开相关用户页面
function ShowCaseUser(case_type, case_id) {
    var id = NewGuid();
    var opener = top.window;
    opener.$.dialog({
        id: id, title: GetResource('S140920102020224', '相关用户'),
        content: "url:" + GUrl + "/IhgForms/Patent/CaseUser.aspx",
        lock: true, fixed: true, width: 720, height: 600,
        resize: false, max: false, min: false,
        init: function () {
            var newApi = opener.lhgdialog.list[id].content;
            if (newApi != null && newApi.IhgCaseUser != null) {
                newApi.IhgCaseUser.case_type = case_type;
                newApi.IhgCaseUser.case_id = case_id;
                newApi.IhgCaseUser.InitPage();
            }
        }
    });

}

/*判断此对象是否为数组*/
function isArray(o) {
    return Object.prototype.toString.call(o) === '[object Array]';
}


//HTML转码,转换HTML标签,转换完成之后可以直接提交至后台
function HTMLEncode(html) {
    var temp = document.createElement("div");
    (temp.textContent != null) ? (temp.textContent = html) : (temp.innerText = html);
    var output = temp.innerHTML;
    temp = null;
    return output;
    //    var s = "";
    //    if (str.length == 0) return "";
    //    s = str.replace(/&/g, "&amp;");
    //    s = s.replace(/</g, "&lt;");
    //    s = s.replace(/>/g, "&gt;");
    //    s = s.replace(/ /g, "&nbsp;");
    //    s = s.replace(/\'/g, "&#39;");
    //    s = s.replace(/\"/g, "&quot;");
    //    return s;

}

///HTML解码,与上面的方法对应,解码经上面方法编码的方法
function HTMLDecode(text) {

    var temp = document.createElement("div");
    temp.innerHTML = text;
    var output = temp.innerText || temp.textContent;
    temp = null;
    return output;
    //    var s = "";
    //    if (str.length == 0) return "";
    //    s = str.replace(/&amp;/g, "&");
    //    s = s.replace(/&lt;/g, "<");
    //    s = s.replace(/&gt;/g, ">");
    //    s = s.replace(/&nbsp;/g, " ");
    //    s = s.replace(/&#39;/g, "\'");
    //    s = s.replace(/&quot;/g, "\"");
    //    return s;
}

function JSEncode(str) {
    var s = "";
    if (str.length == 0) return "";
    s = str.replace(/&/g, "&amp;");
    s = s.replace(/</g, "&lt;");
    s = s.replace(/>/g, "&gt;");
    s = s.replace(/ /g, "&nbsp;");
    s = s.replace(/\'/g, "\\&#39;");
    s = s.replace(/\"/g, "\\&quot;");
    return s;

}

function JSDecode(str) {
    var s = "";
    if (str.length == 0) return "";
    s = str.replace("&amp;", /&/g);
    s = str.replace("&lt;", /</g);
    s = str.replace("&gt;", />/g);
    s = str.replace("&nbsp;", / /g);
    s = str.replace("\\&#39;", /\'/g);
    s = str.replace("\\&quot;", /\"/g);
    return s;

}

///查询客户
var CustomerList = null;
var Customer_SearchKey = '';
function LoadAutoCustomer(_SearchKey) {
    function Success(_Meta) {

        Customer_SearchKey = _SearchKey;
        CustomerList = null;
        CustomerList = _Meta.customer;
    }
    Ajax.Request('PatentAction.ashx', { Call: 'LoadCustomer', Key: _SearchKey }, Success, true);


    return CustomerList;
}

function LoadAutoHisCustomer(_SearchKey) {
    function Success(_Meta) {

        Customer_SearchKey = _SearchKey;
        CustomerList = null;
        CustomerList = _Meta.customer;
    }
    Ajax.Request('PatentAction.ashx', { Call: 'LoadHisCustomer', Key: _SearchKey }, Success, true);


    return CustomerList;
}


///查询客户和代理机构
var CustomerOrAgencyList = null;
var Customer_Agency_SearchKey = '';
function LoadAutoCustomerOrAgencyList(_SearchKey) {
    function Success(_Meta) {

        Customer_Agency_SearchKey = _SearchKey;
        CustomerOrAgencyList = null;
        CustomerOrAgencyList = _Meta.customer;
    }
    Ajax.Request('PatentAction.ashx', { Call: 'LoadCustomerAgency', Key: _SearchKey }, Success, true);

    return CustomerOrAgencyList;
}

///查询代理机构
var AgencyList = null;
var Agency_SearchKey = '';
function LoadAutoAgency(_SearchKey) {
    function Success(_Meta) {

        Agency_SearchKey = _SearchKey;
        AgencyList = null;
        AgencyList = _Meta.agency;
    }
    Ajax.Request('CaseInfo.ashx', { Call: 'LoadAgency', Key: _SearchKey }, Success, true);


    return AgencyList;

}

//查询业务类型
var BusinessList = null;
var Business_SearchKey = '';
function LoadAutoBusinessType(_SearchKey) {
    var case_type = $('#p_case_info__case_type_id').attr('objid');
    if (typeof (case_type) == "undefined") {
        case_type = PatentUncoil.case_type_id;
    }
    function Success(_Meta) {

        Business_SearchKey = _SearchKey;
        BusinessList = null;
        BusinessList = _Meta.businesstype;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadBusinessType', Key: _SearchKey, Case_type: case_type }, Success, true);


    return BusinessList;
}

///查询国家
var CountryList = null;
var Country_SearchKey = '';
function LoadAutoCountry(_SearchKey) {
    function Success(_Meta) {

        Country_SearchKey = _SearchKey;
        CountryList = null;
        CountryList = _Meta.country;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCountry', Key: _SearchKey }, Success, true);
    return CountryList;

}

///查询国家
var CountryListPPH = null;
var Country_SearchKeyPPH = '';
function LoadAutoCountryPPH(_SearchKey) {
    function Success(_Meta) {

        Country_SearchKeyPPH = _SearchKey;
        CountryListPPH = null;
        CountryListPPH = _Meta.country;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCountryPPH', Key: _SearchKey }, Success, true);
    return CountryListPPH;

}

//查找模板类型
var TemplateList = null;
var Template_SearchKey = '';
function LoadAutoTemplate(_SearchKey) {
    function Success(_Meta) {
        Template_SearchKey = _SearchKey;
        TemplateList = null;
        TemplateList = _Meta.template;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadTemplate', Key: _SearchKey }, Success, true);
    return TemplateList;
}


///查询币别
var CurrencyList = null;
var Currency_SearchKey = '';
function LoadAutoCurrency(_SearchKey) {
    function Success(_Meta) {

        Currency_SearchKey = _SearchKey;
        CurrencyList = null;
        CurrencyList = _Meta.currency;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCurrency', Key: _SearchKey }, Success, true);
    return CurrencyList;

}


//查询产品类别
var ProductList = null;
var Product_SearchKey = '';
function LoadProducts(_SearchKey) {
    function Success(_Meta) {

        Product_SearchKey = _SearchKey;
        ProductList = null;
        ProductList = _Meta.product;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadProduct', Key: _SearchKey }, Success, true);
    return ProductList;
}

//查询提成案件明细分类
var CaseDetailList = null;
var CaseDetail_SearchKey = '';
function LoadCaseDetail(_SearchKey) {
    function Success(_Meta) {

        CaseDetail_SearchKey = _SearchKey;
        CaseDetailList = null;
        CaseDetailList = _Meta.casedetail;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCaseDetail', Key: _SearchKey }, Success, true);
    return CaseDetailList;
}

//查询提成案件明细分类
var BusinessClassList = null;
var BusinessClass_SearchKey = '';
function LoadBusinessClass(_SearchKey) {
    function Success(_Meta) {

        BusinessClass_SearchKey = _SearchKey;
        BusinessClassList = null;
        BusinessClassList = _Meta.businessclass;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadBusinessClass', Key: _SearchKey }, Success, true);
    return BusinessClassList;
}

//查询提成最低标准
var MinMoneyList = null;
var MinMoney_SearchKey = '';
function LoadMinMoney(_SearchKey) {
    function Success(_Meta) {

        MinMoney_SearchKey = _SearchKey;
        MinMoneyList = null;
        MinMoneyList = _Meta.minmoney;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadMinMoney', Key: _SearchKey }, Success, true);
    return MinMoneyList;
}

//查询技术领域
var TechnicalList = null;
var Technical_SearchKey = '';
function LoadTechnical(_SearchKey) {
    function Success(_Meta) {

        Technical_SearchKey = _SearchKey;
        TechnicalList = null;
        TechnicalList = _Meta.Technical;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadTechnical', Key: _SearchKey }, Success, true);
    return TechnicalList;
}

//查询OA涉及问题
var OAProblemList = null;
var OAProblem_SearchKey = '';
function LoadOAProblem(_SearchKey) {
    function Success(_Meta) {
        OAProblem_SearchKey = _SearchKey;
        OAProblemList = null;
        OAProblemList = _Meta.OAProblem;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadOAProblem', Key: _SearchKey }, Success, true);
    return OAProblemList;
}
var WritingTypeList = null;
var WritingType_SearchKey = '';
function LoadWritingType(_SearchKey) {
    function Success(_Meta) {
        WritingType_SearchKey = _SearchKey;
        WritingTypeList = null;
        WritingTypeList = _Meta.WritingTypeList;
    }
    Ajax.Request('CaseInfo.ashx', { Call: 'LoadWritingType', Key: _SearchKey }, Success, true);
    return WritingTypeList;
}
function LoadALLAutoCountry(_SearchKey) {
    function Success(_Meta) {

        Country_SearchKey = _SearchKey;
        CountryList = null;
        CountryList = _Meta.country;
        if (CountryList) {
            var _ALL = {};
            _ALL.id = "ALL";
            _ALL.name = "ALL";
            CountryList.unshift(_ALL);
        }
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCountry', Key: _SearchKey }, Success, true);
    return CountryList;

}

// 加载已有接口配置信息的客户
var CustomerListConfig = null;
function LoadAutoCustomerConfig(_SearchKey) {
    function Success(_Meta) {
        CustomerListConfig = _Meta.customer;
    }
    Ajax.Request('WadeButtAction.ashx', { Call: 'LoadCustomerConfig', Key: _SearchKey }, Success, true);

    return CustomerListConfig;
}
// 加载已有API接口配置信息的客户(有VPN)
function LoadAutoCustomerConfigVPN(_SearchKey) {
    function Success(_Meta) {
        CustomerListConfig = _Meta.customer;
    }
    Ajax.Request('WadeButtAction.ashx', { Call: 'LoadCustomerConfigVPN', Key: _SearchKey }, Success, true);

    return CustomerListConfig;
}

// 加载已有API接口配置信息的客户(没有VPN)
function LoadAutoCustomerConfigNOVPN(_SearchKey) {
    function Success(_Meta) {
        CustomerListConfig = _Meta.customer;
    }
    Ajax.Request('WadeButtAction.ashx', { Call: 'LoadCustomerConfigNOVPN', Key: _SearchKey }, Success, true);

    return CustomerListConfig;
}

var CustomerListEN = null;
var Customer_SearchKeyEN = '';
function LoadAutoCustomerEN(_SearchKey) {//是否需要英文名称 1为需要英文名,null 或者 0 为不需要英文名
    function Success(_Meta) {
        Customer_SearchKeyEN = _SearchKey;
        CustomerListEN = null;
        CustomerListEN = _Meta.customer;
    }
    Ajax.Request('PatentAction.ashx', { Call: 'LoadCustomer', Key: _SearchKey, en_name: 1 }, Success, true);


    return CustomerListEN;
}

var ApplicantCustomerListEN = null;
var ApplicantCustomer_SearchKeyEN = '';
function LoadAutoApplicantCustomerEN(_SearchKey) {//是否需要英文名称 1为需要英文名,null 或者 0 为不需要英文名
    function Success(_Meta) {
        ApplicantCustomer_SearchKeyEN = _SearchKey;
        ApplicantCustomerListEN = null;
        ApplicantCustomerListEN = _Meta.customer;
    }
    Ajax.Request('PatentAction.ashx', { Call: 'LoadCustomer', Key: _SearchKey, en_name: 1, customer_nature: 1 }, Success, true);


    return ApplicantCustomerListEN;
}

//加载客户树
function LoadTreeCustomer() {
    var _TreeCustomer = null;
    function success(_Meta) {
        _TreeCustomer = null
        _TreeCustomer = _Meta.customer;
    }
    Ajax.Request("PatentAction.ashx", { Call: "LoadAllCustomer" }, success, true);
    return _TreeCustomer;
}

function LoadFromStage() {
    var language = top.window.GLanguage;
    var FromStage = [];
    function success(_Meta) {
        for (var i = 0; i < _Meta.from_stage.length; i++) {
            FromStage.push({ 'id': _Meta.from_stage[i].value, 'name': _Meta.from_stage[i]['text_' + language], 'TreeType': '' });
        }
    }
    Ajax.Request("PatentAction.ashx", { Call: "LoadFromStage" }, success, true);
    return FromStage;
}

//加载产品类别
function LoadTreeProduct() {
    var _TreeProduct = null;
    function success(_Meta) {
        _TreeProduct = null;
        _TreeProduct = _Meta.Products;
    }
    Ajax.Request("BaseInfo.ashx", { Call: "GetProducts" }, success, true);
    return _TreeProduct;
}

////获取系统中记录的邮件
//var MailList = null;
//var MailList_SearchKey = '';
//function AutoMailListInfo(_SearchKey) {

//    function Success(_Meta) {

//        MailList_SearchKey = _SearchKey;
//        MailList = null;
//        MailList = _Meta.MailListInfo;
//    }
//    Ajax.Request('Common.ashx', { Call: 'AutoMailListInfo', Key: _SearchKey }, Success, true);


//    return MailList;

//}

// 全局缓存
var MailList = [];
var LastSearchKey = "";

// 防抖函数
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// 真正发送 Ajax 的函数（不直接调用）
function FetchMailList(_SearchKey) {
    Ajax.Request('Common.ashx', {
        Call: 'AutoMailListInfo',
        Key: _SearchKey
    }, function (_Meta) {
        MailList = _Meta.MailListInfo || [];
        LastSearchKey = _SearchKey;
    }, true);
}

// 包装成防抖后的 Ajax 函数
var FetchMailListDebounce = debounce(FetchMailList, 300);

// 插件调用的同步接口
function AutoMailListInfo(_SearchKey) {
    if (GetPublishConfig("KLFD", "202507")) {
        if (!_SearchKey) {
            return;
        }
    }
    // 如搜索内容变了 → 发防抖请求（不会立即卡顿）
    if (_SearchKey !== LastSearchKey) {
        FetchMailListDebounce(_SearchKey);
    }

    // 同步返回当前缓存，不会卡
    return MailList;
}

//获取系统中记录的邮件
var DescList = null;
var DescList_SearchKey = '';
function AutoDescListInfo(_SearchKey) {

    function Success(_Meta) {

        DescList = _SearchKey;
        DescList = null;
        DescList = _Meta.DescListInfo;
    }
    Ajax.Request('Common.ashx', { Call: 'AutoDescListInfo', Key: _SearchKey }, Success, true);


    return DescList;

}


var NoticeTypeList = null;
var NoticeType_SearchKey = '';
function LoadNoticeType(_SearchKey) {
    function Success(_Meta) {
        NoticeType_SearchKey = _SearchKey;
        NoticeTypeList = null;
        NoticeTypeList = _Meta.NoticeType;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadNoticeType', Key: _SearchKey }, Success, true);
    return NoticeTypeList;

}

//记录选择的内容作为该用户的行为分析
//选择的值
//_type 分析的类型，如客户 customer
function AutoSelectHis(_obj_id, _type) {
    if (_obj_id) {
        var _data = {};
        _data.Call = 'AutoSelectHis';
        _data.obj_id = _obj_id;
        _data.type = _type;
        function AutoSelectHisCallback(_Meta) {
        }
        Ajax.Request('Common.ashx', _data, AutoSelectHisCallback);
    }
}


//加载发文类型数据
function LoadMailType() {

    var MailType = null;
    function Success(_Meta) {

        MailType = null;
        MailType = _Meta.MailType;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadMailType' }, Success, true);

    return MailType;

}

//加载发文类型数据
function LoadCrmMailType() {

    var MailCrmType = null;
    function Success(_Meta) {

        MailCrmType = null;
        MailCrmType = _Meta.MailType;
    }
    Ajax.Request('Mail.ashx', { Call: 'CusMailInitData' }, Success, true);

    return MailCrmType;

}

//加载通知书类型数据
function LoadNotciceType() {

    var NoticeType = null;
    function Success(_Meta) {

        NoticeType = null;
        NoticeType = _Meta.NoticeType;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadOfficalNoticeType' }, Success, true);

    return NoticeType;

}

var FileTypeData = null;


//加载文件类型数据  _official 是否要加载递交官方该类型文件
function LoadFileType(_official) {

    if (FileTypeData) {
        return FileTypeData;
    }
    var FileType = null;
    function Success(_Meta) {
        FileType = null;
        FileType = _Meta.FileType;
        FileTypeData = _Meta.FileType;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadFileType', official: _official }, Success, true);
    return FileType;
}

var FileTypeByCaseType = {
    "31D1A147-2931-43B5-94AE-B72B1525BA8A": null
    , '0E8A4B7F-E407-4EFF-9562-3809BF484207': null
    , 'ABD40742-04F9-455F-BC41-080E9D896F80': null
    , '122136EA-F3E3-46C5-A529-EFC358AC764B': null
};

//加载文件类型数据 case_type  _official 是否要加载递交官方该类型文件
function LoadFileTypeByCaseType(case_type, _official, _file_type) {
    if (FileTypeByCaseType[case_type]) {
        return FileTypeByCaseType[case_type];
    }
    function Success(_Meta) {
        FileTypeByCaseType[case_type] = _Meta.FileType;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadFileTypeByCaseType', official: _official, case_type: case_type, file_type: _file_type }, Success, true);
    return FileTypeByCaseType[case_type];
}

// 加载文件类型和描述
function GetFileTypeAndDesc(case_type_id) {
    if (top.GetFileTypeAndDescData === undefined) {
        top.GetFileTypeAndDescData = {}
    }
    if (top.GetFileTypeAndDescData[case_type_id]) {
        var tempData = {}
        $.extend(true, tempData, top.GetFileTypeAndDescData[case_type_id]);
        return tempData;
    }

    function Success(_Meta) {
        top.GetFileTypeAndDescData[case_type_id] = _Meta
    }
    Ajax.Request('Common.ashx', { Call: 'GetFileTypeAndDesc', case_type_id: FileUpload.Seting.case_type_id }, Success, true);

    // 防止缓存数据被修改
    var tempData = {}
    $.extend(true, tempData, top.GetFileTypeAndDescData[case_type_id]);
    return tempData;
}

// 不同案件类型初始化基础数据缓存
function GetInitalizationDataByCaseType(case_type_id) {
    if (top.InitalizationDataByCaseType == undefined) {
        top.InitalizationDataByCaseType = {}
    }

    if (top.InitalizationDataByCaseType[case_type_id]) {
        // 自动过期机制(30分钟)
        if (top.InitalizationDataByCaseTypeCacheTime == undefined || Date.now() - top.InitalizationDataByCaseTypeCacheTime < 1800000) {
            return top.InitalizationDataByCaseType[case_type_id];
        }
    }

    function Success(_Meta) {
        top.InitalizationDataByCaseTypeCacheTime = Date.now();
        top.InitalizationDataByCaseType[case_type_id] = _Meta
    }
    Ajax.Request('PatentAction.ashx', { Call: 'Initalization', type_id: PatentUncoil.case_type_id }, Success, true);

    return top.InitalizationDataByCaseType[case_type_id];
}

/**
 * 根据类型获取文件类型描述id
 * @param {any} case_type_id
 * @param {any} type_ids
 */
function LoadFileTypeByTypeID(case_type_id, type_ids) {
    if (top.LoadFileTypeByTypeIDData === undefined) {
        top.LoadFileTypeByTypeIDData = {}
    }

    var cacheKey = case_type_id + '__' + type_ids;
    if (top.LoadFileTypeByTypeIDData[cacheKey]) {
        var tempData = {}
        $.extend(true, tempData, top.LoadFileTypeByTypeIDData[cacheKey]);
        return tempData;
    }

    function Success(_Meta) {
        top.LoadFileTypeByTypeIDData[cacheKey] = _Meta
    }
    Ajax.Request('Common.ashx', { Call: 'LoadFileTypeByTypeID', case_type_id: case_type_id, type_ids: type_ids }, Success, true);

    // 防止缓存数据被修改
    var tempData = {}
    $.extend(true, tempData, top.LoadFileTypeByTypeIDData[cacheKey]);
    return tempData;
}

//加载处理事项数据
function LoadCtrlProc() {

    var CtrlProc = null;
    function Success(_Meta) {
        CtrlProc = null;
        CtrlProc = _Meta.CtrlProc;

    }
    Ajax.Request('Common.ashx', { Call: 'LoadCtrlProc' }, Success, true);
    return CtrlProc;
}
//加载处理事项状态
function LoadProcStatusNew() {
    var LoadProcStatusNew = null;
    function Success(_Meta) {
        LoadProcStatusNew = null;
        LoadProcStatusNew = _Meta.LoadProcStatusNew;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadProcStatusNew' }, Success, true);
    return LoadProcStatusNew;
}
//加载处理事项案件状态
function LoadReviewStage() {
    var LoadReviewStage = null;
    function Success(_Meta) {
        LoadReviewStage = null;
        LoadReviewStage = _Meta.LoadReviewStage;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadReviewStage' }, Success, true);
    return LoadReviewStage;
}
//加载官方的处理事项
function LoadCtrlProc_Official() {
    var CtrlProc = null;
    function Success(_Meta) {
        CtrlProc = null;
        CtrlProc = _Meta.CtrlProc;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCtrlProc_Official' }, Success, true);
    return CtrlProc;
}

//加载部门组织结构 is_charge 是否只加载承办部门
var _TreeDeptModel = null;
function LoadDeptTree() {
    var TreeDeptModel = sessionStorage.getItem("TreeDeptModel")
    if (TreeDeptModel) {
        return _TreeDeptModel = JSON.parse(TreeDeptModel);
    } else {
        var DeptInfo = null;
        function Success(_Meta) {
            DeptInfo = null;
            DeptInfo = _Meta.DeptTree;
            sessionStorage.setItem("TreeDeptModel", JSON.stringify(_Meta.DeptTree));
        }
        Ajax.Request('Common.ashx', { Call: 'LoadDeptTree' }, Success, true);
        return DeptInfo;
    }
}

//根据类型不同加载不同的流程节点
function LoadNodeTree(flow_sub_type) {
    var _TreeNode = null;
    function success(_Meta) {
        _TreeNode = null;
        _TreeNode = _Meta.TreeNode;
    }
    Ajax.Request("Common.ashx", { Call: "GetTreeNode", flow_sub_type: flow_sub_type }, success, true);
    return _TreeNode;
}

//加载用户树
var TreeUserModel;
function LoadTreeUser() {
    var _TreeUserModel = null;
    if (!GetPublishConfig('ZBSD', 'is_show_column')) {
        _TreeUserModel = JSON.parse(sessionStorage.getItem("TreeUserModel"));
    }

    if (_TreeUserModel != null) {
        return _TreeUserModel;
    }
    else {
        var _TreeUser = null;
        function success(_Meta) {
            _TreeUser = null
            _TreeUser = _Meta.TreeUser;
            sessionStorage.setItem("TreeUserModel", JSON.stringify(_Meta.TreeUser));
        }
        Ajax.Request("Common.ashx", { Call: "GetTreeUser" }, success, true);
        TreeUserModel = _TreeUser;
        return _TreeUser
    }
}

//加载案件类型
var TreeCaseType;
function LoadTreeCaseType() {
    var _TreeCaseType = JSON.parse(sessionStorage.getItem("TreeCaseType"));
    if (_TreeCaseType != null) {
        return _TreeCaseType;
    }
    else {
        var _CaseTypeList = null;
        function success(_Meta) {
            _CaseTypeList = null
            _CaseTypeList = _Meta.CaseTypeList;
            sessionStorage.setItem("TreeCaseType", JSON.stringify(_Meta.CaseTypeList));
        }
        Ajax.Request("Common.ashx", { Call: "GetTreeCaseType" }, success, true);
        TreeCaseType = _CaseTypeList;
        return _CaseTypeList
    }
}

var TreeTabModel;
function LoadTreeTab() {

    if (TreeTabModel != null) {
        return TreeTabModel;
    }
    else {
        var _TreeTab = null;
        function success(_Meta) {
            _TreeTab = null
            _TreeTab = _Meta.TreeTab;
        }
        Ajax.Request("Common.ashx", { Call: "GetTabUser" }, success, true);
        TreeTabModel = _TreeTab;
        return _TreeTab
    }
}
// 加载内部人员
function LoadInnerTreeUser() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "GetInnerTreeUser" }, success, true);
    TreeUserModel = _TreeUser;
    return _TreeUser
}

//加载代理机构人员
function LoadTreeAgentUser() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "GetTreeAgentUser" }, success, true);
    return _TreeUser;
}

//加载代理机构
function LoadTreeAgent() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "GetTreeAgent" }, success, true);
    return _TreeUser;
}

//加载国家树
function LoadTreeCountry() {
    var _TreeCountry = null;
    function success(_Meta) {
        _TreeCountry = null
        _TreeCountry = _Meta.country;
    }
    Ajax.Request("Common.ashx", { Call: "LoadCountry" }, success, true);
    return _TreeCountry
}

//业务员用户
function LoadTreeSalesUser() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "LoadTreeSalesUser" }, success, true);
    return _TreeUser

}
//建档复核人
function LoadTreeFilesUser() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "LoadTreeFileUser" }, success, true);
    return _TreeUser

}
//加载角色树
function LoadRoleTree() {
    var _RoleTree = null;
    function success(_Meta) {
        _RoleTree = null
        _RoleTree = _Meta.RoleTree;
    }
    Ajax.Request("Common.ashx", { Call: "LoadRoleTree" }, success, true);
    return _RoleTree
}

var CaseList = null;
var Case_SearchKey = '';
//查询案件
function LoadSearchCase(_SearchKey) {

    //    if (Case_SearchKey != '' && _SearchKey.toUpperCase().indexOf(Case_SearchKey.toUpperCase()) >= 0) {
    //        if (CaseList != null) {

    //            var _newcase = new Array();
    //            for (var i = 0; i < CaseList.length; i++) {
    //                var item = CaseList[i].name.toString().toUpperCase();
    //                if (item.indexOf(_SearchKey.toUpperCase()) >= 0) {
    //                    var _data = { name: CaseList[i].name, id: CaseList[i].id };
    //                    _newcase.push(_data);
    //                }
    //            }
    //            Case_SearchKey = _SearchKey;
    //            CaseList = null;
    //            CaseList = _newcase;
    //        }
    //    }
    //    else {
    function Success(_Meta) {

        Case_SearchKey = _SearchKey;
        CaseList = null;
        CaseList = _Meta.CaseList;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadSearchCase', Key: _SearchKey }, Success, true)

    //    }
    return CaseList;

}

//查询商标案件
function LoadTradeSearchCase(_SearchKey) {
    function Success(_Meta) {

        Case_SearchKey = _SearchKey;
        CaseList = null;
        CaseList = _Meta.CaseList;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadTradeSearchCase', Key: _SearchKey }, Success, true)
    return CaseList;
}


//导出Excel
function Export(ajax_config, param, columns) {

    var id = "ihg_export";
    var open_url = "IhgExport.aspx";
    if (ajax_config.open_url && ajax_config.open_url.length > 0)
        open_url = ajax_config.open_url;
    var api = frameElement.api;
    if (api) {
        opener = api.opener;
        opener.$.dialog({
            id: id, title: GetResource('S141027143618214', '导出清单'),
            content: "url:" + GUrl + "/IhgForms/" + open_url,
            lock: true, fixed: true, width: 720,
            resize: false, max: false, min: false,
            parent: api,
            init: function () {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgExport != null) {
                    newApi.IhgExport.ajax_config = ajax_config;
                    newApi.IhgExport.param = param;
                    newApi.IhgExport.columns = columns;
                    newApi.IhgExport.InitPage();
                }
            }
        });
    }
    else {
        $.dialog({
            id: id, title: GetResource('S141027143618214', '导出清单'),
            content: "url:" + GUrl + "/IhgForms/" + open_url,
            lock: true, fixed: true, width: 720,
            resize: false, max: false, min: false,
            parent: api,
            init: function () {
                var newApi = lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgExport != null) {
                    newApi.IhgExport.ajax_config = ajax_config;
                    newApi.IhgExport.param = param;
                    newApi.IhgExport.columns = columns;
                    newApi.IhgExport.InitPage();
                }
            }
        });
    }
    //var opener = top.window;

}

///后台查找的数据存在 < > 时需要显示在前台需要处理掉
function ReplacSpeStr(Str) {
    if (Str) {
        Str = Str.replace(/</g, '&lt;');
        Str = Str.replace(/>/g, '&gt;');
    }
    return Str;
}

//var PageType = {
//    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'page': 'CaseManage.aspx', 'name': '专利' }, 'ABD40742-04F9-455F-BC41-080E9D896F80': { 'page': 'CaseInfo.aspx', 'name': '版权' }
//                       , '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'page': 'TradeMarkManage.aspx', 'name': '商标' }
//};

PublicStrucCaseName = function (case_id, case_volume, case_name, case_type_id) {

    if (!$.trim(case_volume)) {
        case_volume = '无';
    }
    return "<a  href='javascript:void(0);' onclick=\"PublicOpenCase('" + case_id + "','" + case_volume + "','" + case_type_id + "');\" >" + case_volume + "</a>";
}

function PublicOpenCase(case_id, case_volume, case_type_id) {
    var url = "", Type = "";
    if (top.window._UserModel.RoleCode.toUpperCase().indexOf("IC") >= 0 || top.window._UserModel.RoleCode.toUpperCase().indexOf("ADMIN") >= 0) {//管理员、程序有权限
        Type = "IC"
    } else {
        Type = "IP"
    }
    var success = function (data) {
        if (data.caseInfo) {
            if (GetPublishConfig('CaseManagePage', 'case_page') && data.caseInfo.business_type_id == "CD30AACB-1BDA-4B0D-963A-48B8FDBC1E65") {
                url = "Forms/Patent/" + PCTCaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
            } else if (data.caseInfo.flow_direction == "IO" && data.caseInfo.business_type_id != "CD30AACB-1BDA-4B0D-963A-48B8FDBC1E65" && GetPublishConfig('CaseManagePage', 'case_page')) {
                url = "Forms/Patent/" + FDCaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
                if (Type == "IP") {
                    url = "Forms/Patent/" + CaseTypeURL[case_type_id]["IPURL"] + "?Type=IP&objid=" + case_id + '&caseType_id=' + case_type_id;
                }
            }
            else {
                url = "Forms/Patent/" + CaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
                if (Type == "IP") {
                    url = "Forms/Patent/" + CaseTypeURL[case_type_id]["IPURL"] + "?Type=IP&objid=" + case_id + '&caseType_id=' + case_type_id;
                }
            }
            top.window.AddBusinessTab('IC' + case_id, GetResource('S140822114641256', '案件') + "-" + case_volume, url);
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: "GetCaseInfo", case_id: case_id }, success);

}

PublicStrucCaseNameByRole = function (case_id, case_volume, case_name, case_type_id, proc_id) {
    if (!$.trim(case_volume)) {
        case_volume = '无';
    }
    return "<a  href='javascript:void(0);' onclick=\"PublicOpenCaseByRole('" + case_id + "','" + case_volume + "','" + case_type_id + "','" + proc_id + "');\" >" + case_volume + "</a>";
}

function PublicOpenCaseByRole(case_id, case_volume, case_type_id, proc_id) {
    var id = '', url = '', title_name = '';
    if (case_type_id == "882D9F78-7656-468E-BE98-68FE5E334A9B") {
        url = "Forms/Patent/" + CaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
        top.window.AddBusinessTab(id, title_name, url);
    } else {
        if (top.window._UserModel.RoleCode.toUpperCase().indexOf("IC") >= 0 || top.window._UserModel.RoleCode.toUpperCase().indexOf("ADMIN") >= 0) {//管理员、程序有权限
            id = 'IC' + case_id;
            title_name = GetResource('S140822114641256', '案件') + "-" + case_volume;
            var success = function (data) {
                if (data.caseInfo) {
                    if (GetPublishConfig('CaseManagePage', 'case_page') && data.caseInfo.business_type_id == "CD30AACB-1BDA-4B0D-963A-48B8FDBC1E65") {
                        url = "Forms/Patent/" + PCTCaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
                    } else if (data.caseInfo.flow_direction == "IO" && data.caseInfo.business_type_id != "CD30AACB-1BDA-4B0D-963A-48B8FDBC1E65" && GetPublishConfig('CaseManagePage', 'case_page')) {
                        url = "Forms/Patent/" + FDCaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
                    }
                    else {
                        url = "Forms/Patent/" + CaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
                    }
                    top.window.AddBusinessTab(id, title_name, url);
                }
            }
            Ajax.Request("BaseInfo.ashx", { Call: "GetCaseInfo", case_id: case_id }, success);
        }
        else {
            id = 'IP' + proc_id;
            if (!proc_id) {
                id = 'IP' + case_id;
            }
            title_name = CaseTypeURL[case_type_id]['Default'] + '-' + case_volume;
            var success = function (data) {
                if (data.caseInfo) {
                    if (GetPublishConfig('CaseManagePage', 'case_page') && data.caseInfo.business_type_id == "CD30AACB-1BDA-4B0D-963A-48B8FDBC1E65") {
                        url = "Forms/Patent/" + PCTCaseTypeURL[case_type_id]["IPURL"] + "?Type=IP&objid=" + case_id + "&proc_id=" + proc_id + '&caseType_id=' + case_type_id;
                    }
                    else if (data.caseInfo.flow_direction == "IO" && data.caseInfo.business_type_id != "CD30AACB-1BDA-4B0D-963A-48B8FDBC1E65" && GetPublishConfig('CaseManagePage', 'case_page')) {
                        url = "Forms/Patent/" + FDCaseTypeURL[case_type_id]["IPURL"] + "?Type=IP&objid=" + case_id + "&proc_id=" + proc_id + '&caseType_id=' + case_type_id;
                    }
                    else {
                        url = "Forms/Patent/" + CaseTypeURL[case_type_id]["IPURL"] + "?Type=IP&objid=" + case_id + "&proc_id=" + proc_id + '&caseType_id=' + case_type_id;
                    }
                    top.window.AddBusinessTab(id, title_name, url);
                }
            }
            Ajax.Request("BaseInfo.ashx", { Call: "GetCaseInfo", case_id: case_id }, success);
            //url = "Forms/Patent/" + CaseTypeURL[case_type_id]["IPURL"] + "?Type=IP&objid=" + case_id + "&proc_id=" + proc_id + '&caseType_id=' + case_type_id;
            //top.window.AddBusinessTab(id, title_name, url);
        }
    }
}

//获得自定义控件html
function GetControlHtml(param) {
    var html = "";
    var name = param.table_name ? "name='" + param.table_name + "'" : "";
    var id = param.column_id ? param.column_id : NewGuid();
    if (param.control_name == "text") {
        html = "<input id='" + id + "' type='text' class='input_text' " + name + " />";
    }
    else if (param.control_name == "date") {
        html = "<input id='" + id + "' type='text' class='Wdate' onclick='WdatePicker();' onfocus='WdatePicker();' " + name + " />";
    }
    else if (param.control_name == "textarea") {
        html = "<textarea id='" + id + "' maxlength='4000' class='textarea' " + name + "></textarea>";
    }
    else if (param.control_name == "select") {
        var options = param.options.split(';');
        var slt = [];
        for (var i = 0; i < options.length; i++) {
            if (i == 0) {
                slt.push("<option value=''></option>");
            }
            if (options[i]) {
                slt.push("<option value='" + options[i] + "' >" + options[i] + "</option>");
            }
        }
        html = "<select id='" + id + "' class='input_select' " + name + ">" + slt.join("") + "</select>";
    }
    else if (param.control_name == "checkbox") {
        var options = param.options.split(';');
        var slt = [];
        for (var i = 0; i < options.length; i++) {
            if (options[i]) {
                slt.push("<label class='input_checkbox'><input name='" + id + "' type='checkbox' value='" + options[i] + "' />" + options[i] + "</label>");
            }
        }
        html = "<div " + name + ">" + slt.join("") + "</div>";;
    }

    return html;
}

//初始化自定义栏位
function InitCustomField(table_id, table_name, dis) {
    var tbody = $("#" + table_id).find("tbody");
    if (tbody.length > 0) {
        var success = function (data) {
            var html = [];
            if (data.custom_field_list) {
                for (var i = 0; i < data.custom_field_list.length; i++) {
                    var row = data.custom_field_list[i];
                    var title = row.title ? "<a class='a_tips' onmouseover='TitleTips(this, event);' title='" + row.title + "'>&nbsp</a>" : "";
                    html.push("<tr><td class='tdtitle'>" + row.column_name + ":" + title + " </td>");
                    var control_html = GetControlHtml(row);
                    html.push("<td>" + control_html + "</td></tr>");
                }
            }
            tbody.html(html.join(""));
            if (dis === true) {
                $.SetDisabled(table_id);
            }
        }
        Ajax.Request("BaseInfo.ashx", { Call: "GetCustomField", table_name: table_name }, success);
    }
}

//自定义栏位赋值
function EvalCustomField(table_id, table_name, obj_id, call_back) {
    var success = function (data) {
        var control_list = $("#" + table_id).find("[name='" + table_name + "']");
        for (var i = 0; i < control_list.length; i++) {
            var cl = control_list[i];
            var jcl = control_list.eq(i);
            if (jcl.is("div")) {
                var cb_value = "";
                var cbs = jcl.find("input[type='checkbox']");
                for (var j = 0; j < cbs.length; j++) {
                    if (j == 0 && data.Result && data.Result[cbs[j].name]) {
                        cb_value = ";" + data.Result[cbs[j].name] + ";";
                    }
                    if (cb_value.indexOf(";" + cbs[j].value + ";") > -1) {
                        cbs[j].checked = true;
                    }
                    else {
                        cbs[j].checked = false;
                    }
                }
            }
            else {
                if (data.Result && data.Result[cl.id]) {
                    jcl.val(data.Result[cl.id]);
                }
                else {
                    jcl.val("");
                }
            }
        }
        if (call_back) {
            call_back(data.Result);
        }
    }
    Ajax.Request("Common.ashx", { Call: "GetCustomField", table_name: table_name, obj_id: obj_id }, success);
}



//取得栏位值
function GetCustomField(table_id, table_name, obj_id) {
    var params = [];
    var control_list = $("#" + table_id).find("[name='" + table_name + "']");
    for (var i = 0; i < control_list.length; i++) {
        var param = { row_id: obj_id };
        var cl = control_list[i];
        var jcl = control_list.eq(i);
        if (jcl.is("div")) {
            var cb_value = [];
            var cbs = jcl.find("input[type='checkbox']");
            for (var j = 0; j < cbs.length; j++) {
                if (j == 0) {
                    param.column_id = cbs[j].name;
                }
                if (cbs[j].checked) {
                    cb_value.push(cbs[j].value);
                }
            }
            param.value = cb_value.join(";");
        }
        else {
            param.column_id = cl.id;
            param.value = $.trim(jcl.val());
        }
        params.push(param);
    }
    return JSON.stringify(params);
}


//JS对象拷贝
function getType(o) {
    var _t;
    return ((_t = typeof (o)) == "object" ? o == null && "null" || Object.prototype.toString.call(o).slice(8, -1) : _t).toLowerCase();
}
function extend(destination, source) {
    for (var p in source) {
        if (getType(source[p]) == "array" || getType(source[p]) == "object") {
            destination[p] = getType(source[p]) == "array" ? [] : {};
            arguments.callee(destination[p], source[p]);
        }
        else {
            destination[p] = source[p];
        }
    }
}

//var PatentCaseType = {
//    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': '专利', 'code': 'P', 'page': 'CaseManage.aspx' }
//                 , 'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': '版权', 'code': 'C', 'page': 'CaseManage.aspx' }
//                 , '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': '商标', 'code': 'T', 'page': 'TradeMarkManage.aspx' }
//                 , '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': '其他', 'code': 'O', 'page': 'CaseManage.aspx' }
//}

var CaseTypeURL = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': GetResource('S140830213111063', '专利'), 'code': 'P', 'ICURL': 'CaseManage.aspx', 'IPURL': "CaseInfo.aspx", "PROCURL": "CaseProcInfo.aspx" },
    'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': GetResource('S140830213213510', '版权'), 'code': 'C', 'ICURL': 'CopyRightManage.aspx', 'IPURL': "CopyRightInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': GetResource('S140830213251949', '商标'), 'code': 'T', 'ICURL': 'TradeMarkManage.aspx', 'IPURL': "TradeMarkInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': GetResource('S140822171042104', '其他'), 'code': 'O', 'ICURL': 'CaseOther.aspx', 'IPURL': "CaseOther.aspx" },
    '882D9F78-7656-468E-BE98-68FE5E334A9B': { 'lid': 'S170314103618093', 'Default': GetResource('S170314103618093', '科技服务'), 'code': 'S', 'ICURL': 'TechServiceManage.aspx', 'IPURL': "TechServiceManage.aspx", "PROCURL": "IhgTechServiceProc.aspx" },
    '7A74BEB6-13DE-444B-892F-6E339D4067A2': { 'lid': 'S180120160453969', 'Default': GetResource('S180120160453969', '法律案件'), 'code': 'F', 'ICURL': 'LawCaseManage.aspx', 'IPURL': 'LawCaseInfo.aspx' },
    '849F2D30-DDAA-4718-AD1E-1951DE67913D': { 'lid': 'S170725104526779', 'Default': GetResource('S170725104526779', '调查案'), 'code': 'R', 'ICURL': 'TortCaseManage.aspx', 'IPURL': "TortCaseInfo.aspx", 'INURL': 'CaseInfo.aspx' },
}

var FDCaseTypeURL = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': GetResource('S140830213111063', '专利'), 'code': 'P', 'ICURL': 'IOCaseManage.aspx', 'IPURL': "IOCaseInfo.aspx", "PROCURL": "CaseProcInfo.aspx" },
    'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': GetResource('S140830213213510', '版权'), 'code': 'C', 'ICURL': 'CopyRightManage.aspx', 'IPURL': "CopyRightInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': GetResource('S140830213251949', '商标'), 'code': 'T', 'ICURL': 'TradeMarkManage.aspx', 'IPURL': "TradeMarkInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': GetResource('S140822171042104', '其他'), 'code': 'O', 'ICURL': 'CaseOther.aspx', 'IPURL': "CaseOther.aspx" },
    '882D9F78-7656-468E-BE98-68FE5E334A9B': { 'lid': 'S170314103618093', 'Default': GetResource('S170314103618093', '科技服务'), 'code': 'S', 'ICURL': 'TechServiceManage.aspx', 'IPURL': "TechServiceManage.aspx", "PROCURL": "IhgTechServiceProc.aspx" },
    '7A74BEB6-13DE-444B-892F-6E339D4067A2': { 'lid': 'S180120160453969', 'Default': GetResource('S180120160453969', '法律案件'), 'code': 'F', 'ICURL': 'LawCaseManage.aspx', 'IPURL': 'LawCaseInfo.aspx' },
    '849F2D30-DDAA-4718-AD1E-1951DE67913D': { 'lid': 'S170725104526779', 'Default': GetResource('S170725104526779', '调查案'), 'code': 'R', 'ICURL': 'TortCaseManage.aspx', 'IPURL': "TortCaseInfo.aspx", 'INURL': 'CaseInfo.aspx' },
}

var PCTCaseTypeURL = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': GetResource('S140830213111063', '专利'), 'code': 'P', 'ICURL': 'PCTCaseManage.aspx', 'IPURL': "PCTCaseInfo.aspx", "PROCURL": "CaseProcInfo.aspx" },
    'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': GetResource('S140830213213510', '版权'), 'code': 'C', 'ICURL': 'CopyRightManage.aspx', 'IPURL': "CopyRightInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': GetResource('S140830213251949', '商标'), 'code': 'T', 'ICURL': 'TradeMarkManage.aspx', 'IPURL': "TradeMarkInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': GetResource('S140822171042104', '其他'), 'code': 'O', 'ICURL': 'CaseOther.aspx', 'IPURL': "CaseOther.aspx" },
    '882D9F78-7656-468E-BE98-68FE5E334A9B': { 'lid': 'S170314103618093', 'Default': GetResource('S170314103618093', '科技服务'), 'code': 'S', 'ICURL': 'TechServiceManage.aspx', 'IPURL': "TechServiceManage.aspx", "PROCURL": "IhgTechServiceProc.aspx" },
    '7A74BEB6-13DE-444B-892F-6E339D4067A2': { 'lid': 'S180120160453969', 'Default': GetResource('S180120160453969', '法律案件'), 'code': 'F', 'ICURL': 'LawCaseManage.aspx', 'IPURL': 'LawCaseInfo.aspx' },
    '849F2D30-DDAA-4718-AD1E-1951DE67913D': { 'lid': 'S170725104526779', 'Default': GetResource('S170725104526779', '调查案'), 'code': 'R', 'ICURL': 'TortCaseManage.aspx', 'IPURL': "TortCaseInfo.aspx", 'INURL': 'CaseInfo.aspx' },
}
/*重设弹出框的位置,当弹出框的高度会随着页面的加载变化时可调用此方法,已保证弹出窗体保持在页面的中央,此方法还处理了弹出窗体过大造成页面显示不全的问题
注意:是页面数据加载完成之后调用
*/
function ReSetDialogPosition() {
    var Api = frameElement.api
    var window_height = $(Api.opener.top.window).height() - 50;//这里计算的高度是整个浏览器可视区域的高度,注意要计算top.window
    var height = $(document).height();
    if (height > window_height) {
        height = window_height;
    }
    Api.size(Api.config.width, height);
    var top = ($(Api.opener.window).height() - height - 10) / 2;//而相对高度应该使用opener的页面高度
    if (top < 0) {
        top = 0;
    }
    frameElement.api.position(null, top);
}


///查询国家
var IndustryList = null;
var Industry_SearchKey = '';
function LoadAutoIndustry(_SearchKey) {
    function Success(_Meta) {

        Industry_SearchKey = _SearchKey;
        IndustryList = null;
        IndustryList = _Meta.industry;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadIndustry', Key: _SearchKey }, Success, true);
    return IndustryList;
}

function getTextByValue(data, val, valueFieldName, textFieldName) {
    var text = val;
    valueFieldName = valueFieldName ? valueFieldName : "value";
    textFieldName = textFieldName ? textFieldName : "text";
    if (data) {
        $.each(data, function (index, item) {
            if (item[valueFieldName] == val) {
                text = item[textFieldName];
                return false;
            }
        });
    }
    return text;
}

function getMultiTextByValues(data, vals, separator, valueFieldName, textFieldName) {
    var separator = separator ? separator : ';';
    if (data && vals) {
        var arr = vals.split(separator);
        var result_arr = [];
        for (var i = 0; i < arr.length; i++) {
            var text = getTextByValue(data, arr[i], valueFieldName, textFieldName);
            result_arr.push(text);
        }
        if (result_arr.length > 0)
            return result_arr.join(separator);
    }
    return vals;
}

//加载Word模版类型数据
function LoadMailWordType() {
    var MailType = new Array();
    function Success(_Meta) {
        for (var i = 0; i < _Meta.TableRows.length; i++) {
            var _self = _Meta.TableRows[i];
            var obj = {};
            obj.id = _self.Id;
            obj.name = _self.remark;
            MailType.push(obj);
        }
    }
    Ajax.Request('Common.ashx', { Call: 'template_list' }, Success, true);

    return MailType;
}

//打开指定页面，参数自定义
function PublicOpenPage(type, parm, text) {
    switch (type) {
        case 'rd': {
            if (text.indexOf('草稿') == -1 && parm.length > 0) {
                top.window.AddBusinessTab("f_" + parm, null, "Forms/Bill/RequestDetail.aspx?objid=" + parm);
            }
            break;
        }
        case 'bi': {
            if (text.indexOf('草稿') == -1 && parm.length > 0) {
                top.window.AddBusinessTab("f_" + parm, null, "Forms/Bill/BillIn.aspx?objid=" + parm);
            }
            break;
        }
        case 'bo': {
            if (text.indexOf('草稿') == -1 && parm.length > 0) {
                top.window.AddBusinessTab("f_" + parm, null, "Forms/Bill/BillOut.aspx?objid=" + parm);
            }
            break;
        }
        default:
            break;
    }
}

//获取几天前
function getDateDiff(dateStr) {
    var dateTimeStamp = Date.parse(dateStr.replace(/-/gi, "/"));
    var minute = 1000 * 60;
    var hour = minute * 60;
    var day = hour * 24;
    var halfamonth = day * 15;
    var month = day * 30;
    var now = new Date().getTime();
    var diffValue = now - dateTimeStamp;
    if (diffValue < 0) { return "刚刚"; }
    var monthC = diffValue / month;
    var weekC = diffValue / (7 * day);
    var dayC = diffValue / day;
    var hourC = diffValue / hour;
    var minC = diffValue / minute;
    if (monthC >= 1) {
        result = "" + parseInt(monthC) + "月前";
    }
    else if (weekC >= 1) {
        result = "" + parseInt(weekC) + "周前";
    }
    else if (dayC >= 1) {
        result = "" + parseInt(dayC) + "天前";
    }
    else if (hourC >= 1) {
        result = "" + parseInt(hourC) + "小时前";
    }
    else if (minC >= 1) {
        result = "" + parseInt(minC) + "分钟前";
    } else
        result = "刚刚";
    return result;
}


///查询商机
var NicheList = null;
var Niche_SearchKey = '';
function LoadNiche(_SearchKey) {
    function Success(_Meta) {

        Niche_SearchKey = _SearchKey;
        NicheList = null;
        NicheList = _Meta.Niche;
    }
    Ajax.Request('Customer.ashx', { Call: 'LoadNiche', Key: _SearchKey }, Success, true);

    return NicheList;
}


///查询营销
var MarketingList = null;
var MarketingSearchKey = '';
function LoadMarketingList(_SearchKey) {
    function Success(_Meta) {
        MarketingSearchKey = _SearchKey;
        MarketingList = null;
        MarketingList = _Meta.MarketingList;
    }
    Ajax.Request('Customer.ashx', { Call: 'LoadMarketingList', Key: _SearchKey }, Success, true);

    return MarketingList;
}


///查询线索
var LeadsList = null;
var LeadsSearchKey = '';
function LoadLeadsList(_SearchKey) {
    function Success(_Meta) {
        LeadsSearchKey = _SearchKey;
        LeadsList = null;
        LeadsList = _Meta.LeadsList;
    }
    Ajax.Request('Customer.ashx', { Call: 'LoadLeadsList', Key: _SearchKey }, Success, true);

    return LeadsList;
}


//协作用户
var teamworkUser = null;
function GetTeamWordUser(objid) {
    function Success(_Meta) {
        teamworkUser = _Meta.TeamWorkUser;
    }
    Ajax.Request('Customer.ashx', { Call: 'GetTeamworkRole', objid: objid }, Success, true);
    return teamworkUser;
}

function GetMonthDay(obj) {
    var now = new Date(obj.replace(/-/gi, "/"));
    return now.getMonth() + 1 + "-" + now.getDate();
}





Date.prototype.Format = function (fmt) {
    var o = {
        "M+": this.getMonth() + 1, //月份
        "d+": this.getDate(), //日
        "h+": this.getHours(), //小时
        "m+": this.getMinutes(), //分
        "s+": this.getSeconds(), //秒
        "q+": Math.floor((this.getMonth() + 3) / 3), //季度
        "S": this.getMilliseconds() //毫秒
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}

Date.prototype.getMonthFormatted = function () {
    var month = this.getMonth();
    return month < 10 ? '0' + month : '' + month; // 如果是1-9月，那么前面补0
}

//隐藏或者显示某个元素 样式不一样
function ShowHide(_this, _obj_id, _obj_id2) {
    if ($("#" + _obj_id).is(":hidden")) {
        $(_this).attr("title", GetResource('S140929141518276', '点击隐藏'));
        $(_this).attr("class", "img_show");
    }
    else {
        $(_this).attr("title", GetResource('S140929141358903', '点击显示'));
        $(_this).attr("class", "img_hide");
    }
    $("#" + _obj_id).slideToggle(600);
    if (_obj_id2) {
        $("#" + _obj_id2).slideToggle(600);
    }
}
//根据ID进行跳转
function SkipFAQ(id, menu_id, keyword) {
    var Success = function (_Meta) {
        if (_Meta.FAQPath) {
            var timestamp = new Date().getTime();
            var success = function (data) {
                ciphertext = data.ciphertext.replace("", "");
                keyword = keyword ? keyword : '';
                menu_id = menu_id ? menu_id : '';
                var url = _Meta.FAQPath + "/forms/FAQ/FaqList.aspx?faq_id=" + id + "&menu_id=" + menu_id + "&keyword=" + keyword + "&ciphertext=" + ciphertext;
                // top.window.AddBusinessTab("faq_id" + id, "FAQ-预览", url);
                window.open(url);
            }
            Ajax.Request('Common.ashx', { Call: 'GetCiphertextValue' }, success);
        } else {
            Box.Alert(GRESX.HINTS.TITLE, "请配置FAQ地址后再打开FAQ", null, { icon: 'fail.gif', width: '250', height: '60' });
        }
    }
    Ajax.Request('Customer.ashx', { Call: 'SkipFAQ' }, Success, true);
}

function GetFAQListByType(type_name, callback) {
    var Success = function (_Meta) {
        if (_Meta.FAQPath) {
            var apiUrl = _Meta.FAQPath + "/forms/FAQ/Faq.ashx";
            var _data = {};
            _data.Call = "GetFaqListJsonp";
            _data.type_name = type_name;
            _data.search = " ";
            $.ajax({ url: apiUrl, data: _data, dataType: "jsonp", jsonp: "callback", async: false, success: callback });
        } else {
            if (callback)
                callback();
        }
    }
    Ajax.Request('Customer.ashx', { Call: 'SkipFAQ' }, Success, true);
}
///获取页面路径(取最后的文件名)
function GetPageName() {
    var page = "";
    if (!!document.location) {
        page = document.location.href;
    } else {
        page = document.URL;
    }

    var index = page.indexOf("?");
    if (index > 0) {
        page = page.substring(0, page.indexOf("?"));
    };
    page = page.substring(page.lastIndexOf('/') + 1);
    return page;
}

///获取父页面路径,适用于共工弹出窗组件,想取得父页面路径时使用
function GetParentPageName() {
    //frameElement.api.config.parent.window.GetPageName()
    if (frameElement.api.config.parent != null && frameElement.api.config.parent.content) {
        return frameElement.api.config.parent.content.GetPageName();
    }
    else {
        return frameElement.api.opener.GetPageName();
    }
}



///日志记录公共模组
var CommLog = {
    AddReadLog: function (option) {
        if (!option || !option.objid || !option.model || !option.tablename) {
            //参数不全,直接忽略
            return false;
        }

        var page = GetPageName();
        option.log_pagename = page;
        option.Call = "AddUserReadLog";

        try {//直接catch起来,避免因为日志错误引起其它模块不能进行
            Ajax.Request("Common.ashx", option);
        } catch (e) { }
    }
}

//系统各模块代码
var SysModel = {
    "APPLY": GetResource("S140805212413578", "提案管理"),
    "CASE": GetResource("S140805212542670", "案件管理"),
    "EFLOW": GetResource("S170715174115494", "核稿管理"),
    "MAIL": GetResource("S170715174115868", "发文管理"),
    "FILING": GetResource("S170715174116243", "递交管理"),
    "CUSTOMER": GetResource("S170715174116596", "客户管理"),
    "AGENCY": GetResource("S170715174116970", "合作代理机构"),
    "CONTACT": GetResource("S140814205507198", "客户联系人"),
    "APPLICANT": GetResource("S170715174117371", "申请人管理"),
    "INVENTOR": GetResource("S170715174117737", "发明人管理"),
    "BILL": GetResource("S170715174118149", "账款管理"),
    "BATCH": GetResource("S160425115610591", "批处理"),
    "FILE": GetResource("S170715174118584", "文件管理"),
    "REPORT": GetResource("S170424114427294", "报表管理"),
    "SYSTEM": GetResource("S170601112528023", "系统管理"),
    "FLOW-AP": GetResource("S160929162237138", "提案流程"),
    'FLOW-DR': GetResource("S170715174119127", "配案流程"),
    'FLOW-RE': GetResource("S170715174119505", "核稿流程"),
    'FLOW-UD': GetResource("S170715174119914", "数据更新"),
    'FLOW-EF': GetResource("S170715174120274", "递交流程"),
    'FLOW-CO': GetResource("S170715174120623", "发文流程"),
    'FLOW-AC': GetResource("S170715174120991", "账款流程"),
    "TechService": GetResource("S170314103618093", "科技服务")
}

//1 = 新增, 2 = 修改, 3 = 删除, 4 = 上传, 5 = 下载, 6 = 打开 / 查看
//7=提交,8=退回,9=移交,10=加签,11=结案,12=启动/创建
var LogType = {
    1: GetResource('S140821210615724', '新增'),
    2: GetResource('S140813203214743', '修改'),
    3: GetResource('S140808094153296', '删除'),
    4: GetResource('S140920170156404', '上传'),
    5: GetResource('S140912142421099', '下载'),
    6: GetResource('S171009183324873', '打开/查看'),
    7: GetResource('S140816154013508', '提交'),
    8: GetResource('S140823113604887', '退回'),
    9: GetResource('S140915095232708', '移交'),
    //10: '加签',
    //11: '结案',
    //12: '启动流程',
    //13: "数据同步",
    14: GetResource('S161021112701576', '处理事项规则'),
    15: GetResource('S161020161045713', '通知书规则'),
    16: GetResource('S180227175542222', '人员管理'),
    17: GetResource('S180227175554118', '角色管理')
}


//模拟提交表单
function submitForm(action, method, target, params) {
    var form = $("<form></form>");
    form.css({ 'display': 'none' });
    form.attr('action', action);
    form.attr('method', method);
    form.attr('target', target);
    $('body').append(form);
    if (params && typeof (params) == "object") {
        $.each(params, function (key, val) {
            var input = $('<input type=\"hidden\"/>');
            input.attr('name', key);
            input.attr('value', val);
            form.append(input);
        });
    }
    form.submit();
    form.remove();
}

function decimal(num, v) {
    var vv = Math.pow(10, v);
    return Math.round(num * vv) / vv;
}



function StrcutFileName(file_no, file_name, model, case_id, proc_id, file_desc_code) {
    file_name = HTMLDecodeToEmpty(file_name);
    return "<a href='javascript:void(0);' onclick=\"ViewFile('" + file_no + "','" + file_name + "','" + model + "' ,'" + case_id + "','" + proc_id + "','" + file_desc_code + "')\" >" + file_name + "</a>";
}

//function Strcuthelpname(file_no, file_name, model, case_id, proc_id, file_desc_code) {
//    file_name = HTMLDecodeToEmpty(file_name);
//    return "<a href='javascript:void(0);' onclick=\"ViewFile('" + file_no + "','" + file_name + "','" + model + "' ,'" + case_id + "','" + proc_id + "','" + file_desc_code + "')\" >" + file_name + "</a>";
//}

//把转码的特殊字符直接去掉,替换成空字符串,解决特殊字符在连接中或者方法的参数中引起的异常问题
function HTMLDecodeToEmpty(str) {
    var s = "";
    if (str.length == 0) return "";
    //去除‘html’字符的特殊编码
    s = str.replace(/&amp;/g, "").replace(/&lt;/g, "").replace(/&gt;/g, "").replace(/&nbsp;/g, "").replace(/&#39;/g, "").replace(/&quot;/g, "");
    //去除‘字符串的’字符的特殊编码
    s = s.replace(/&/g, "").replace(/</g, "").replace(/>/g, "").replace(/'/g, "").replace(/"/g, "");
    return s;
}

//获取查询 or 新增 or 编辑中的所有框的值，并返回
//id为包含这些控件的最外层div的id
function GetBoxParame(id) {
    //返回的参数集，用于Ajax请求的参数
    var parame = {};

    //【目前支持的控件有】：
    //【4、7 返回值逗号分割，末尾无逗号】
    //1、普通文本框             必填属性：id="数据库列名" parame="id"  type="text"。
    //2、日期文本框             必填属性：id="数据库列名" parame="id"  type="text"。
    //3、下拉选择框             必填属性：id="数据库列名" parame="id"。
    //4、复选框                 必填属性：name="数据库列名" parame="name" type="checkbox"。
    //5、单选框                 必填属性：name="数据库列名" parame="name" type="radio"。
    //6、多行文本框             必填属性：id="数据库列名" parame="id"。
    //7、下拉多选框(单选、多选) 必填属性：id="数据库列名" objid="" parame="id" dataType="selectTree" type="text"。
    //8、自动查询框             必填属性：id="数据库列名" objid="" parame="id" dataType="autoSearch" type="text"。

    //id参数组控件
    var controls = $("#" + id + " [parame='id']").add("#" + id + " [parame='name']");;

    //需要去掉末尾逗号的对象组
    var strConverts = [];

    controls.each(function (index, value) {

        //当前控件
        var current = $(value);
        //参数名 可以是控件的id或name
        var parameName = "parame_";
        //控件名称
        var controlName = value.nodeName.toLowerCase();

        if (current.attr("parame") == "id") {

            parameName += value.id;
            if (controlName == "input") {
                if (current.attr("type") == "text") {
                    if (current.attr("dataType") == "selectTree" || current.attr("dataType") == "autoSearch") {
                        parame[parameName] = current.attr("objid");
                    }
                    else
                        parame[parameName] = current.val();
                } else {
                    parame[parameName] = current.val();
                }
            }
            else if (controlName == "select" || controlName == "textarea") {
                parame[parameName] = current.val();
            }
        }
        else if (current.attr("parame") == "name") {

            parameName += value.name;
            if (controlName == "input") {
                if (current.attr("type") == "checkbox" || current.attr("type") == "radio") {

                    //需要去掉末尾逗号，加到这个数组
                    if ($.inArray(parameName, strConverts) < 0)
                        strConverts.push(parameName);

                    if (parame[parameName] == undefined)
                        parame[parameName] = "";

                    if (current.is(":checked"))
                        parame[parameName] += current.val() + ",";
                }
            }
        }
    });

    //去掉某些值的末尾逗号
    $(strConverts).each(function (index, value) {
        if (parame[value].trim().length > 0)
            parame[value] = parame[value].substr(0, parame[value].length - 1);
    });

    return parame;
}

//设置文本框的值，目前为编辑时使用
//id为包含这些控件的最外层div的id,row为数据行
function SetBoxParame(id, row) {
    //【目前支持的控件有】：
    //【7、8 赋值方式，如id='pic'则 row里应有 row["pic"](objid),row["pic_name"](val)】
    //1、普通文本框             必填属性：id="数据库列名" parame="id"  type="text"。
    //2、日期文本框             必填属性：id="数据库列名" parame="id"  type="text"。
    //3、下拉选择框             必填属性：id="数据库列名" parame="id"。
    //4、复选框                 必填属性：name="数据库列名" parame="name" type="checkbox"。
    //5、单选框                 必填属性：name="数据库列名" parame="name" type="radio"。
    //6、多行文本框             必填属性：id="数据库列名" parame="id"。
    //7、下拉多选框(单选、多选) 必填属性：id="数据库列名" objid="" parame="id" dataType="selectTree" type="text"。
    //8、自动查询框             必填属性：id="数据库列名" objid="" parame="id" dataType="autoSearch" type="text"。

    //id和name参数组控件,同一name会有多个控件
    var controls = $("#" + id + " [parame='id']").add("#" + id + " [parame='name']");

    controls.each(function (index, value) {

        //当前控件
        var current = $(value);
        //参数名 可以是控件的id或name
        var parameName;

        if (current.attr("parame") == "id") {

            parameName = value.id;
            //控件名称
            var controlName = value.nodeName.toLowerCase();

            if (controlName == "input") {
                if (current.attr("type") == "text") {
                    if (current.attr("dataType") == "selectTree" || current.attr("dataType") == "autoSearch") {
                        current.attr("objid", row[parameName]);
                        var str = row[parameName + "_name"];
                        if (str)
                            current.val(str);
                    } else
                        current.val(row[parameName]);
                } else {
                    current.val(row[parameName]);
                }
            }
            else if (controlName == "select" || controlName == "textarea") {
                current.val(row[parameName] + "");
            }
        }
        else if (current.attr("parame") == "name") {

            parameName = value.name;
            if ($.trim(row[parameName]) != "") {

                var val = row[parameName].split(",");
                //可能就是选中一个，或者是分号分割
                if (val.length == 1) {
                    val = row[parameName].split(";");
                }

                //找到该值并且该控件的value与数据库相符，需要选中
                if ($.inArray(value.value, val) >= 0) {
                    if (current.attr("type") == "checkbox" || current.attr("type") == "radio")
                        current.attr("checked", "checked");
                }
            }
        }
    });
}

//点击取消按钮的时候清空各种框的值
//暂不支持复选框checkbox、单选框radio
function ClearBox(id) {
    //【目前支持的控件有】：
    //1、普通文本框             必填属性：id="数据库列名" parame="id"  type="text"。
    //2、日期文本框             必填属性：id="数据库列名" parame="id"  type="text"。
    //3、下拉选择框             必填属性：id="数据库列名" parame="id"。
    //4、多行文本框             必填属性：id="数据库列名" parame="id"。
    //5、下拉多选框(单选、多选) 必填属性：id="数据库列名" objid="" parame="id" dataType="selectTree" type="text"。
    //6、自动查询框             必填属性：id="数据库列名" objid="" parame="id" dataType="autoSearch" type="text"。

    //id参数组控件
    var controls = $("#" + id + " [parame='id']");

    controls.each(function (index, value) {

        //当前控件
        var current = $(value);
        //控件名称
        var controlName = value.nodeName.toLowerCase();

        if (controlName == "input" || controlName == "textarea") {
            current.val("");
            if (current.attr("dataType") == "selectTree" || current.attr("dataType") == "autoSearch") {
                current.attr("objid", "");
            }
        } else if (controlName == "select") {
            current.prop('selectedIndex', 0);
        }
    });
}

//--获取配置表信息
var is_GetPublishConfigLogin = false;
function GetPublishConfigLogin(type, key) {
    Success = function (_Meta) {
        if (_Meta.PublishConfig) {
            if (_Meta.PublishConfig.cfg_value) {
                if (_Meta.PublishConfig.cfg_value == "TRUE") {
                    is_GetPublishConfig = true;
                }
                else if (_Meta.PublishConfig.cfg_value == "1") {
                    is_GetPublishConfigLogin = true;
                } else {
                    is_GetPublishConfigLogin = false;
                }
            }
        } else {
            is_GetPublishConfigLogin = false;
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: 'GetPublishConfig', type: type, key: key }, Success, true);
    return is_GetPublishConfig;
}

function GetPublishConfig(cfg_type, cfg_key) {
    var is_GetPublishConfig = false;
    var cfg_value = "";
    var pcitem;
    if (top.PublishConfigs) {
        for (var i = 0; i < top.PublishConfigs.length; i++) {
            if (top.PublishConfigs[i]["cfg_type"] == cfg_type && top.PublishConfigs[i]["cfg_key"] == cfg_key) {
                pcitem = top.PublishConfigs[i];
                break;
            }
        }
    }
    if (pcitem) {
        cfg_value = pcitem["cfg_value"];
    }
    if (cfg_value.toUpperCase() == "TRUE") {
        is_GetPublishConfig = true;
    }
    else if (cfg_value == "1") {
        is_GetPublishConfig = true;
    }
    else if (cfg_value.length > 7) {
        is_GetPublishConfig = true;
    }
    return is_GetPublishConfig;
}

//获取配置表信息
var GetPublishConfigValue2 = "";
function GetPublishConfigValueFn(type, key) {
    GetPublishConfigValue2 = "";
    Success = function (_Meta) {
        if (_Meta.PublishConfig) {
            if (_Meta.PublishConfig.cfg_value) {
                GetPublishConfigValue2 = _Meta.PublishConfig.cfg_value;
            }
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: 'GetPublishConfig', type: type, key: key }, Success, true);
    return GetPublishConfigValue2;
}

//获取配置表信息
var GetPublishConfigValue = "";
function GetPublishConfigValue(type, key) {
    GetPublishConfigValue = "";
    Success = function (_Meta) {
        if (_Meta.PublishConfig) {
            if (_Meta.PublishConfig.cfg_value) {
                GetPublishConfigValue = _Meta.PublishConfig.cfg_value;
            }
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: 'GetPublishConfig', type: type, key: key }, Success, true);
    return GetPublishConfigValue;
}
//获取用户拥有的所属分部的权限
var BranchList = null;
function GetDeptBranch() {

    function Success(_Meta) {
        BranchList = _Meta.BranchList;
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'GetDeptBranch' }, Success, true);
    return BranchList;
}



//获取配置表对象信息 按分类
var publish_config = {};
function GetPublishConfigByType(type) {

    function Success(_Meta) {
        if (_Meta.publish_config && _Meta.publish_config.length > 0) {
            for (var i = 0; i < _Meta.publish_config.length; i++) {
                var cfg_key = _Meta.publish_config[i].cfg_key;
                (publish_config || {})["" + cfg_key + ""] = _Meta.publish_config[i].cfg_value;
            }

        }

    }
    Ajax.Request('Common.ashx', { Call: 'GetPublishConfig', cfg_type: type }, Success, true);
    return publish_config;
}


function smalltoBIG(num) {
    var strOutput = "";
    var strUnit = '仟佰拾亿仟佰拾万仟佰拾元角分';
    num += "00";
    var intPos = num.indexOf('.');
    if (intPos >= 0)
        num = num.substring(0, intPos) + num.substr(intPos + 1, 2);
    strUnit = strUnit.substr(strUnit.length - num.length);
    for (var i = 0; i < num.length; i++)
        strOutput += '零壹贰叁肆伍陆柒捌玖'.substr(num.substr(i, 1), 1) + strUnit.substr(i, 1);
    return strOutput.replace(/零角零分$/, '整').replace(/零[仟佰拾]/g, '零').replace(/零{2,}/g, '零').replace(/零([亿|万])/g, '$1').replace(/零+元/, '元').replace(/亿零{0,3}万/, '亿').replace(/^元/, "零元");
};

function getKindEditorLang() {
    var lang = top.window.GLanguage || 'zh_cn';
    lang = lang.toLowerCase();
    switch (lang) {
        case 'zh_tw':
            return 'zh_TW';
        case 'en_us':
            return 'en';
    }
    return 'zh_CN';
}
function getExplorer() {
    var explorer = window.navigator.userAgent;
    //ie
    //if (explorer.indexOf("MSIE") >= 0 || explorer.indexOf("Mozilla") >= 0) {
    //    return 'ie';
    //}
    if (window.ActiveXObject || "ActiveXObject" in window) {
        return 'ie';
    }
    //firefox
    else if (explorer.indexOf("Firefox") >= 0) {
        return 'Firefox';
    }
    //Chrome
    else if (explorer.indexOf("Chrome") >= 0) {
        return 'Chrome';
    }
    //Opera
    else if (explorer.indexOf("Opera") >= 0) {
        return 'Opera';
    }
    //Safari
    else if (explorer.indexOf("Safari") >= 0) {
        return 'Safari';
    }
}
// 企业代理机构对接使用
var CommDragUploadFile = function (CallBack, Data, Seting) {
    if (!Data["log_pagename"]) {
        Data.log_pagename = GetPageName();
    }
    var title = GetResource('S140816150823831', '上传附件');
    if (Seting && Seting.title) {
        title = Seting.title;
    }
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    if (_Api) {
        var _Name = _Api.iframe.name;
        Opener = _Api.opener;
        Opener.$.dialog({
            title: GetResource('S140816150823831', '上传附件')
            , content: "url:" + GUrl + "/Forms/UploadFileAPI.aspx"
            , lock: true, width: 820, height: 530, max: false, min: false, resize: false
            , parent: _Api, focus: true, id: 'UploadCommFileM'
            , init: function () {
                var content = Opener.lhgdialog.list['UploadCommFileM'].content;
                if (content && content.FileUpload) {
                    content.FileUpload.Initalization(Seting, Data);
                }
            }
            , close: function () {
                try {
                    var _obj = Opener.lhgdialog.list['UploadCommFileM'].content;
                    if (_obj) {
                        if (CallBack && typeof CallBack == "function") {
                            //$.extend(Data, _obj.FileUpload.Return);
                            CallBack(Data.type);
                            //setTimeout(CallBack(Data.type), 1);
                        }
                    }
                } catch (e) {
                    return true;
                }
                finally {
                    Opener.$.dialog({
                        id: _Name
                    });
                }
            }
        });
    }
    else {
        $.dialog({
            title: title
            , content: "url:" + GUrl + "/Forms/UploadFileAPI.aspx"
            , lock: true, width: 820, height: 530, max: false, min: false, resize: false,
            parent: document, focus: true, id: 'UploadCommFileM'
            , init: function () {
                var content = lhgdialog.list['UploadCommFileM'].content;
                if (content && content.FileUpload) {
                    content.FileUpload.Initalization(Seting, Data);
                }
            },
            close: function () {
                try {
                    var _obj = lhgdialog.list['UploadCommFileM'].content;
                    if (_obj) {
                        if (CallBack && typeof CallBack == "function") {
                            //setTimeout(CallBack(Data), 1);
                            CallBack(Data.type);
                        }
                    }
                } catch (e) {
                    return true;
                }
            }
        });
    }
}
//批量拖拽 IE10 以上版本 用法同CommUploadNotices
var CommDragUploadNotices = function (CallBack, Data, Seting) {
    if (!Data["log_pagename"]) {
        Data.log_pagename = GetPageName();
    }
    var title = GetResource('S140816150823831', '上传附件');
    if (Seting && Seting.title) {
        title = Seting.title;
    }
    if (Seting) {
        Seting.postdate = true;
    }

    if (GetPublishConfig("YSDZ", "2604")) {
        Seting.receipt_date = true;
    }
    //添加一列允许是否上传某个类型的文件，如果为空就取基础配置值
    if (!Seting.accept_type) {
        function Success(_Meta) {
            if (_Meta.Accepttype) {
                Seting.accept_type = _Meta.Accepttype.accept_file_ext.split(";");
            }
        }
        Ajax.Request('Common.ashx', { Call: 'GetAccepttype' }, Success, true);
    }
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    if (_Api) {
        var _Name = _Api.iframe.name;
        Opener = _Api.opener;
        Opener.$.dialog({
            title: GetResource('S140816150823831', '上传附件')
            , content: "url:" + GUrl + "/Forms/UploadFileNew.aspx"
            , lock: true, width: 1200, height: 530, max: false, min: false, resize: false
            , parent: _Api, focus: true, id: 'UploadCommFileM'
            , init: function () {
                var content = Opener.lhgdialog.list['UploadCommFileM'].content;
                if (content && content.FileUpload) {
                    content.FileUpload.Initalization(Seting, Data);
                }
            }
            , close: function () {
                try {
                    var _obj = Opener.lhgdialog.list['UploadCommFileM'].content;
                    if (_obj && _obj.FileUpload.Status) {
                        var listfilenos = _obj.FileUpload.ListFileNos;
                        if (CallBack && typeof CallBack == "function") {
                            //$.extend(Data, _obj.FileUpload.Return);
                            if (GetPublishConfig("PaiTeEn", "SheWai")) {
                                setTimeout(CallBack(Data, listfilenos), 1);
                            } else {
                                setTimeout(CallBack(Data), 1);
                            }
                        }
                    }
                } catch (e) {
                    return true;
                }
                finally {
                    Opener.$.dialog({ id: _Name });
                }
            }
        });
    }
    else {
        $.dialog({
            title: title
            , content: "url:" + GUrl + "/Forms/UploadFileNew.aspx"
            , lock: true, width: 1200, height: 530, max: false, min: false, resize: false,
            parent: document, focus: true, id: 'UploadCommFileM'
            , init: function () {
                var content = lhgdialog.list['UploadCommFileM'].content;
                if (content && content.FileUpload) {
                    content.FileUpload.Initalization(Seting, Data);
                }
            },
            close: function () {
                try {
                    var _obj = lhgdialog.list['UploadCommFileM'].content;
                    if (_obj && _obj.FileUpload.Status) {
                        var listfilenos = _obj.FileUpload.ListFileNos;
                        if (CallBack && typeof CallBack == "function") {
                            if (GetPublishConfig("PaiTeEn", "SheWai")) {
                                setTimeout(CallBack(Data, listfilenos), 1);
                            } else {
                                setTimeout(CallBack(Data), 1);
                            }

                        }
                    }
                } catch (e) {
                    return true;
                }
            }
        });
    }
}

//跳转到知企企查看企业信息
function SkipCustomer(id) {
    var url = "http://www.qichacha.com/search?key=" + $("#" + id).val();
    window.open(url);
}

//获取职务信息
var PositionList = null;
var PositionList_SearchKey = '';
function LoadPosition(_SearchKey) {

    function Success(_Meta) {

        PositionList_SearchKey = _SearchKey;
        PositionList = null;
        PositionList = _Meta.position;
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'LoadPosition', Key: _SearchKey }, Success, true);
    return PositionList;
}

function LoadTreeIndustryCls() {
    var _TreeIndustryCls = null;
    function success(_Meta) {
        _TreeIndustryCls = _Meta.TreeIndustryCls;
    }
    Ajax.Request("Common.ashx", { Call: "LoadTreeIndustryCls" }, success, true);
    return _TreeIndustryCls;
}

/**
 * 加载商品类别
 */
function LoadRegisterTypeCode() {
    var RegisterTypeCode = null;
    function Success(_Meta) {
        RegisterTypeCode = _Meta.TypeCode;
    }
    Ajax.Request('PatentAction.ashx', { Call: 'GetGoodsType' }, Success, true);
    return RegisterTypeCode;
}

/**
*初始化下拉选项
*/
$.InintSelText = function (obj) {
    var str = "<option value=''>" + GetResource('S140814203438556', '请选择') + "</option>"
        + "<option value='1'>" + GetResource('S140813173911748', '是') + "</option>"
        + "<option value='0'>" + GetResource('S140813174101479', '否') + "</option>";
    $(obj).append(str);
}

function GetQueryString() {
    try {
        var vars = [], hash;
        var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
        for (var i = 0; i < hashes.length; i++) {
            hash = hashes[i].split('=');
            //vars.push(hash[0]);
            vars[hash[0]] = decodeURI(hash[1]);
        }
        return vars;
    } catch (e) {
        return {};
    }
}

/**
*是否允许导出和批量下载
*
**/
function GetDivIsShow(class_name) {
    var role = top.window._PublishInfo;
    if (role) {
        $("." + class_name).hide();
        for (var i = 0; i < role.split(',').length; i++) {
            if (top.window._UserModel) {
                if (top.window._UserModel.RoleCode.indexOf(role.split(',')[i]) >= 0) {
                    $("." + class_name).show();
                }
            }
        }

    }
}

//查询费用类型
var FeeTypeList = null;
var FeeType_SearchKey = '';
function LoadAutoFeeType(_SearchKey) {

    function Success(_Meta) {
        FeeType_SearchKey = _SearchKey;
        FeeTypeList = null;
        FeeTypeList = _Meta.fee_type;
    }

    Ajax.Request('PatentAction.ashx', { Call: 'LoadAutoFeeType', key: _SearchKey }, Success, true);
    return FeeTypeList;
}


function getBestWinHeight(bestHeight) {
    var head_foot = 100;
    var wh = $(window).height() + head_foot;
    var gap = 5;
    if (bestHeight) {
        if (bestHeight < wh) {
            return bestHeight;
        }
    }
    return wh - gap;
}

function getBestWinWidth(bestWidth) {
    var ww = $(window).width();
    var gap = 50;
    if (bestWidth) {
        if (bestWidth < ww) {
            return bestWidth;
        }
    }
    return ww - gap;
}

/**
* 数字千分位格式化
* @public
* @param mixed mVal 数值
* @param int iAccuracy 小数位精度(默认为2)
* @return string
*/
function formatMoney(mVal, iAccuracy) {
    var fTmp = 0.00;//临时变量
    var iFra = 0;//小数部分
    var iInt = 0;//整数部分
    var aBuf = new Array(); //输出缓存
    var bPositive = true; //保存正负值标记(true:正数)
    /**
     * 输出定长字符串，不够补0
     * <li>闭包函数</li>
     * @param int iVal 值
     * @param int iLen 输出的长度
     */
    function funZero(iVal, iLen) {
        var sTmp = iVal.toString();
        var sBuf = new Array();
        for (var i = 0, iLoop = iLen - sTmp.length; i < iLoop; i++)
            sBuf.push('0');
        sBuf.push(sTmp);
        return sBuf.join('');
    };

    if (typeof (iAccuracy) === 'undefined')
        iAccuracy = 2;
    bPositive = (mVal >= 0);//取出正负号
    fTmp = (isNaN(fTmp = parseFloat(mVal))) ? 0 : Math.abs(fTmp);//强制转换为绝对值数浮点
    //所有内容用正数规则处理
    iInt = parseInt(fTmp); //分离整数部分
    iFra = parseInt((fTmp - iInt) * Math.pow(10, iAccuracy) + 0.5); //分离小数部分(四舍五入)

    do {
        aBuf.unshift(funZero(iInt % 1000, 3));
    } while ((iInt = parseInt(iInt / 1000)));
    aBuf[0] = parseInt(aBuf[0]).toString();//最高段区去掉前导0
    return ((bPositive) ? '' : '-') + aBuf.join(',') + '.' + ((0 === iFra) ? '00' : funZero(iFra, iAccuracy));
}

/**
* 将千分位格式的数字字符串转换为浮点数
* @public
* @param string sVal 数值字符串
* @return float
*/
function unformatMoney(sVal) {
    var fTmp = parseFloat(sVal.toString().replace(/,/g, ''));
    return (isNaN(fTmp) ? 0 : fTmp);
}


//流程处理，obj_id：处理对象id， flow_type：流程类型，flow_sub_type：流程子类型， ajax_config：指定流程提交的处理方法及自定义传到后台的参数，call_bak：流程提交成功后前台回调函数
//call_bak 返回参数f_audit_type_id 包含noflow（无流程）、submit（提交成功）
//【中一需求】发票流程中，财务、管理员有权限提交 等待别人的审核---单独复制一个方法，用来走发票流程；is_flow:配置项，true：发票流程中，财务、管理员有权限提交 等待别人的审核，false：不可以
function FlowSubmit_Invoice(obj_id, flow_type, flow_sub_type, ajax_config, call_back, is_flow) {

    var success = function (data) {
        switch (data.Result.status) {
            //无记录
            case -1:
                {
                    //无流程
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', '无流程，直接提交！'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //已完成
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', '流程已完成，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            default:
                {
                    if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                        break;
                    }
                    //if (data.Result.cur_user_id != top.window._UserModel.user_id) {
                    if (data.Result.cur_user_id.indexOf(top.window._UserModel.user_id) == -1) {
                        if (!is_flow) {
                            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', '您不是当前流程办理人员，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                            return;
                        }
                        else if (!(top.window._UserModel.RoleCode.indexOf("FA") > -1 || top.window._UserModel.RoleCode.indexOf("admin") > -1)) {
                            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', '您不是当前流程办理人员，不能提交！'), null, { icon: 'hits.gif', width: '250', height: '60' });
                            return;
                        }
                    }
                    break;
                }
        }

        var id = "ihg_" + obj_id;
        var opener = top.window;
        //        var _Api = this;
        //        if (frameElement.api) {
        //            _Api = frameElement.api;
        //            opener = _Api.opener;

        //        }
        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', '流程提交'),
            content: "url:" + GUrl + "/IhgForms/IhgFlow.aspx",
            lock: true, fixed: true, width: 720, height: 500,
            resize: false, max: false, min: false,
            init: function () {
                var newApi = opener.lhgdialog.list[id].content;
                if (newApi != null && newApi.IhgFlow != null) {
                    newApi.IhgFlow.ajax_config = ajax_config;
                    newApi.IhgFlow.flow_info = data.Result;
                    newApi.IhgFlow.call_back = call_back;
                    newApi.IhgFlow.audit_type_id = "submit";
                    newApi.IhgFlow.InitPage();
                }
            }
        });

    }
    Ajax.Request("Common.ashx", { Call: "GetFlowInfo", obj_id: obj_id, flow_type: flow_type, flow_sub_type: flow_sub_type }, success);
}


//根据合同号来打开合同
$.PublicStrucContract = function (contract_no) {
    if (!$.trim(contract_no)) {
        case_volume = '';
    }
    return "<a  href='javascript:void(0);' onclick=\"PublicOpenContract('" + contract_no + "');\" >" + contract_no + "</a>";
}
function PublicOpenContract(contract_no) {
    var title = "";
    var url = "";
    var contract_id = "";
    var isContract = false;
    if (contract_no) {
        function success(Meta) {
            if (Meta.ContractInfo) {
                title = Meta.ContractInfo.title;
                contract_id = Meta.ContractInfo.contract_id;
                url = "Forms/CRM/EditContract.aspx?contract_id=" + contract_id;
                isContract = true;
            } else {
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S190525120600819', '未找到合同信息'), null, { icon: 'fail.gif' });
                return;
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "GetContractInfo", contract_no: contract_no }, success, true);
    }
    if (isContract) {
        top.window.AddBusinessTab('IC' + contract_id, GetResource('S170227181247838', '合同') + "-" + title, url);
    }
}

// 案件名称附加预览框,有上下标的情况
CaseNameView = function () {
    var elem = "#case_new_name,#p_case_info__case_name"; // 需要监听的控件
    var patt = /[<>]/
    var tip = "上下标填写提示:&lt;sup&gt;上标&lt;/sup&gt;&lt;sub&gt;下标&lt;/sub&gt;"; // 提示信息

    $("body").on("mouseover", elem, function () {
        var $this = $(this);
        var $case_name = $this.val();
        if (-1 == $case_name.search(patt)) {
            return;
        }

        var viewHtml = "<div style='border:1px solid black;position: absolute;background-color: white;padding:5px' id='case_name_view'>";
        viewHtml += "<p style='color:red;'>" + tip + "</p>";
        viewHtml += "<p style='font-weight:600;font-size:24px'>" + $case_name + "</p></div>";
        $this.after(viewHtml);
    })

    $("body").on("mouseout", elem, function () {
        $("#case_name_view").remove();
    })

    $("body").on("input", elem, function () {
        var $this = $(this);
        var $case_name = $this.val();
        if (-1 == $case_name.search(patt)) {
            // 没有'<>'时不需要预览框
            $("#case_name_view").remove();
            return;
        }

        // 填写了'<>'时显示预览窗
        if ($("#case_name_view").length == 0) {
            var viewHtml = "<div style='border:1px solid black;position: absolute;background-color: white;padding:5px' id='case_name_view'>";
            viewHtml += "<p style='color:red;'>" + tip + "</p>";
            viewHtml += "<p style='font-weight:600;font-size:24px'>" + $case_name + "</p></div>";
            $this.after(viewHtml);
        }
        $("#case_name_view").find("p").eq(1).html($case_name);
    })
}
// 清空缓存并重新渲染


//#region layui组件
//加载表格呈现 page 页面对象,tableid 表格id,表格列,请求参数,回调函数
Ajax.LoadLayuiTable = function (page, tableid, url, cols, para, callback, opt, limit, limits, sync) {
    // =========================
    // 关键补丁：每次加载表格清空勾选
    // =========================
    window.__LAY_TABLE_CHECKED__ = window.__LAY_TABLE_CHECKED__ || {};
    window.__LAY_TABLE_CHECKED__[tableid] = {};

    if (page && page.table && page.table.cache && page.table.cache[tableid]) {
        const cacheData = page.table.cache[tableid];

        // 检查是否是数组或类数组对象
        if (Array.isArray(cacheData)) {
            cacheData.forEach(function (row) {
                if (row) row.LAY_CHECKED = false;
            });
        } else if (cacheData && typeof cacheData === 'object') {
            // 如果是对象，遍历对象的值
            Object.values(cacheData).forEach(function (row) {
                if (row) row.LAY_CHECKED = false;
            });
        }
    }
    // =========================


    var LimitBefore = $("#" + tableid).next().find("span[class=layui-laypage-limits]").find('select').val();
    if (!LimitBefore && limit) {
        LimitBefore = limit;
    } else if (!LimitBefore) {
        LimitBefore = 10;
    }
    // 显示加载动画（仅当 sync = true 时）
    var loadingIndex = -1;
    if (sync === true) {
        loadingIndex = layer.load(1, { shade: 0.2 }); // 加载动画，样式1，遮罩透明度20%
    }

    if (!page || !page.table) {
        console.info("TIP:layui表格对象缺失!");
        return;
    }
    // 清空缓存
    page.table.cache[tableid] = [];  // 清空缓存

    if (!limits) {
        limits = [10, 15, 20, 30, 50, 100, 200, 500, 1000, 9000000];
    }


    this.isCutPage = true;
    if (!!opt) {
        this.height = opt.height || 0;
        this.isCutPage = opt.isCutPage == undefined ? true : !!opt.isCutPage; // 是否分页
        this.defaultToolbar = opt.defaultToolbar; //是否默认有筛选
    }

    // 查询是否配置了显示列
    var start_col_num = 0;
    var belongKey = url + "_" + para.Call;
    if (url.indexOf("/AjaxServers") > -1) {
        belongKey = url.substring(13) + "_" + para.Call
    }
    if (para.Call == 'BillSearch') {
        belongKey = url + '_' + tableid;
    }
    if (para.Call == 'ICSearchList') {//专利查询、商标查询、版权查询需要精心区分
        belongKey = url + '_' + tableid;
    }
    if (typeof para.flow_sub_type != "undefined") {
        belongKey = url + '_' + tableid;
    }
    var col_new_1 = [[]];
    var col_new_2 = [[]];
    Ajax.Request('Common.ashx', {
        Call: "LoadListColumn", belong_key: belongKey
    }, function (_Meta) {
        if (!!_Meta.show_column && _Meta.show_column.length > 0) {
            for (var j = 0; j < cols[0].length; j++) {
                if (!!cols[0][j].field) {
                    cols[0][j].hide = true;
                    col_new_2[0].push(cols[0][j]);
                } else {
                    start_col_num++;
                    col_new_1[0].push(cols[0][j]);
                }
                for (var i = 0; i < _Meta.show_column.length; i++) {
                    if (_Meta.show_column[i].item_value == cols[0][j].field) {
                        cols[0][j].hide = false;

                        col_new_1[0][i + start_col_num] = cols[0][j];
                        col_new_2[0].remove(cols[0][j]);
                        continue;
                    }
                }
            }
            cols[0] = col_new_1[0].concat(col_new_2[0]);
        }
    }, true);
    cols = SetColumnWidth(cols, tableid);
    cols[0] = $.grep(cols[0], function (n) { return $.trim(n).length > 0; })

    // 赋值宽度
    for (var i = 0; i < cols[0].length; i++) {
        var column_id = cols[0][i].field;
        var column = $("#" + tableid).next().find("th[data-field='" + column_id + "']");
        if (column.length > 0 && column.eq(0).width() != -1) {
            cols[0][i].width = column.eq(0).width();
        }
    }

    para.colsel = ";";
    for (var i = 0; i < cols[0].length; i++) {
        if (cols[0][i] && !cols[0][i].hide) {
            para.colsel = para.colsel + cols[0][i].field + ";";
        }
    }
    para._t = new Date().getTime() // 添加时间戳参数
    // 表格配置
    var lay_config = {
        elem: '#' + tableid
        , url: url
        , where: para
        , height: this.height || 0
        , method: 'post'
        , parseData: function (res) {
            return {
                "code": (res.ClientInfo.Status && res.ClientInfo.Result) ? 0 : -1, //解析接口状态
                "msg": res.ClientInfo.Message, //解析提示文本
                "count": res.TableRowsCount, //解析数据长度
                "data": res.TableRows //解析数据列表
            };
        }
        , request: {
            pageName: 'pageIndex', //页码的参数名称，默认：page
            limitName: 'pageSize'  //每页数据量的参数名，默认：limit
        }
        , done: function (res, curr, count) {
            // 关闭加载动画（仅当 sync = true 时）
            if (sync === true && loadingIndex !== -1) {
                layer.close(loadingIndex);
            }

            // 关键：统一 checkbox UI 与内部状态
            setTimeout(function () {
                if (layui && layui.form) {
                    layui.form.render('checkbox');
                }
            }, 0);

            var show_div = $(".layui-table-tool-panel");
            if (callback && typeof (callback) == "function") {
                callback(res);
            }     

            ////如果是异步请求数据方式，res即为你接口返回的信息。
            //// 同步勾选框状态
            //var checkStatus = page.table.checkStatus(tableid);
            //var selectedData = checkStatus.data; // 获取选中的数据
            ////console.log(selectedData); // 可以用于调试，检查选中的数据是否正确

            //// 更新勾选框状态（如果有其他自定义需求）
            //$("#" + tableid).next().find(".layui-table-box>.layui-table-body>table input[type='checkbox']").each(function () {
            //    var $checkbox = $(this);
            //    var rowData = page.table.cache[tableid][$checkbox.closest('tr').index()]; // 获取当前行的数据
            //    if (rowData && rowData.LAY_CHECKED !== undefined) {
            //        // 根据实际数据同步勾选框状态
            //        if (rowData.LAY_CHECKED) {
            //            $checkbox.prop('checked', true);
            //            $checkbox.next().addClass('layui-form-checked');
            //        } else {
            //            $checkbox.prop('checked', false);
            //            $checkbox.next().removeClass('layui-form-checked');
            //        }
            //    }
            //});
        }
        , toolbar: '#toolbar' + tableid
        , defaultToolbar: this.defaultToolbar || ['filter']
        , title: '用户数据表'
        , cols: cols
        , page: this.isCutPage //|| true
        , loading: true
        , limit: LimitBefore
        , limits: limits
        , curPage: para.pageIndex
        , sync: sync
    }

    if (!!opt && !!opt.size) {
        lay_config.size = opt.size;
    }
    if (!!opt && !!opt.skin) {
        lay_config.skin = opt.skin;
    }

    // 原来的表格属性配置
    var $this_old = $("#" + tableid + "_old");
    // 搜索按钮
    if (!!$this_old.attr("showsearchbar")) {
        lay_config.searchbar = {
            placeholder: $this_old.attr("showsearchbar"), call: function () {
                para.searchKey = $("#lay_" + tableid + "_SearchKey").val();
                Ajax.LoadLayuiTable(page, tableid, url, para, callback, opt);
            }
        }
    }
    // 导出按钮/其他按钮
    lay_config.btns = [];
    if (!!$this_old.attr("btnnew")) {
        lay_config.btns.push({ text: $this_old.attr("btntext"), call: eval($this_old.attr('btnnew')) });
    }

    page.table.render(lay_config);

    //头工具栏事件
    page.table.on('toolbar(' + tableid + ')', function (obj) {
        var checkStatus = page.table.checkStatus(obj.config.id);
        if (obj.event && typeof page[obj.event] == "function") {
            page[obj.event](checkStatus);
        }

        if (GetPublishConfig("tableSelect", "isNew")) {
            $(".layui-table-tool-panel").hide();
            var _title = GetResource('S220303155728684', '自定义列显示栏位');
            var url = 'url:Forms/Patent/selelctCell.aspx';
            var width = 500;
            if (GetPublishConfig("KLFD", "202507") && belongKey === "CaseInfo.ashx_GetIPProcessList") {
                url = 'url:Forms/Patent/selelctCellFD.aspx';
                width = 780;
            }
            user_id = top.window._UserModel.user_id;
            let _data = {};
            _data.isTrue = true;
            $.dialog({
                title: _title, id: "selelctCell", max: true, min: true, width: width, height: 520,
                content: url,
                lock: true,
                max: false,
                data: _data,
                min: false,
                resize: false,
                init: function () {
                    var context = lhgdialog.list['selelctCell'].content;
                    if (context != null && context.initInfo != null) {
                        context.initInfo(lay_config.cols[0], belongKey);
                    }
                },
                close: function () {
                    if (_data.isTrue) {
                        return;
                    }
                    var col_new_1 = [[]];
                    var col_new_2 = [[]];
                    Ajax.Request('Common.ashx', {
                        Call: "LoadListColumn", belong_key: belongKey
                    }, function (_Meta) {
                        if (!!_Meta.show_column && _Meta.show_column.length > 0) {
                            for (var j = 0; j < cols[0].length; j++) {
                                if (!!cols[0][j].field) {
                                    cols[0][j].hide = true;
                                    col_new_2[0].push(cols[0][j]);
                                } else {
                                    start_col_num++;
                                    col_new_1[0].push(cols[0][j]);
                                }
                                for (var i = 0; i < _Meta.show_column.length; i++) {
                                    if (_Meta.show_column[i].item_value == cols[0][j].field) {
                                        cols[0][j].hide = false;

                                        col_new_1[0][i + start_col_num] = cols[0][j];
                                        col_new_2[0].remove(cols[0][j]);
                                        continue;
                                    }
                                }
                            }
                            cols[0] = col_new_1[0].concat(col_new_2[0]);
                        }
                    }, true);
                    cols = SetColumnWidth(cols, tableid);
                    cols[0] = $.grep(cols[0], function (n) { return $.trim(n).length > 0; })

                    // 赋值宽度
                    for (var i = 0; i < cols[0].length; i++) {
                        var column_id = cols[0][i].field;
                        var column = $("#" + tableid).next().find("th[data-field='" + column_id + "']");
                        if (column.length > 0 && column.eq(0).width() != -1) {
                            cols[0][i].width = column.eq(0).width();
                        }
                    }

                    para.colsel = ";";
                    for (var i = 0; i < cols[0].length; i++) {
                        if (cols[0][i] && !cols[0][i].hide) {
                            para.colsel = para.colsel + cols[0][i].field + ";";
                        }
                    }
                    lay_config.cols = cols;
                    lay_config.curPage = para.pageIndex;
                    lay_config.where = para;

                    page.table.render(lay_config);
                }
            });
        }
    });

    //监听行工具事件
    page.table.on('tool(' + tableid + ')', function (obj) {
        var data = obj.data;
        if (obj.event && typeof page[obj.event] == "function") {
            page[obj.event](data);
        }
    });
    if (page.not_check_disabled) {
        page.table.on('checkbox(' + tableid + ')', function (obj) {
            if (obj.type == "all") {
                if (tableid) {
                    $("#" + tableid).next().find(".layui-table-box>.layui-table-body>table input[type='checkbox']").each(function (i) {
                        //如果选择框被禁用，则不允许改选择框被全选勾选
                        if ($(this).is(":disabled")) {
                            $(this).attr("checked", false);
                            $(this).next().removeClass("layui-form-checked");
                            //清除数据缓存
                            page.table.cache[tableid][i].LAY_CHECKED = false;
                        }
                    });
                }
            }
        });
    }

}






Ajax.reload = function (tableid, page) {
    //执行重载
    page.table.reload(tableid, page);
}

var target_column;
var save_seq;
var drag = function (ev) {
    // 兼容火狐浏览器
    ev.dataTransfer.setData("text", "test")
    target_column = $(ev.currentTarget);
}

var dragend = function (ev, belong_key) {
    ev.stopPropagation();
    ev.preventDefault();

    var checked_column = "";
    $("input[lay-filter='LAY_TABLE_TOOL_COLS']:checked").each(function () {
        checked_column += $(this).attr("name") + ";";
    });
    var para = {
        Call: "SaveListColumn",
        belong_key: belong_key,
        checked_column: checked_column.trim(";")
    }
    Ajax.Request("Common.ashx", para, null);
}

var dragenter = function (ev) {
    var $this = $(ev.currentTarget);
    if (!target_column.is($this)) {
        if (target_column.is($this.next())) {
            $this.before(target_column);
        } else {
            $this.after(target_column);
        }
    }
}
var drop = function (ev, belong_key) {
    ev.stopPropagation();
    ev.preventDefault();

    var checked_column = "";
    $("input[lay-filter='LAY_TABLE_TOOL_COLS']:checked").each(function () {
        checked_column += $(this).attr("name") + ";";
    });
    var para = {
        Call: "SaveListColumn",
        belong_key: belong_key,
        checked_column: checked_column.trim(";")
    }
    Ajax.Request("Common.ashx", para, null);
}

//获得使用layui组件生成的表格选中的每一行的id
function GetCheckedColumnId(table_id) {
    var ids = "";
    var checked = $("#" + table_id).next().find(".layui-table-main .layui-form-checked");
    for (i = 0; i < checked.length; i++) {
        ids += checked.eq(i).parent().parent().parent().attr("id") + ";";
    }
    if (ids.length > 0) {
        ids = ids.substring(0, ids.length - 1);
    }
    return ids;
}

/**
 * 表格转换为layui表格
 * @param {any} tableid
 */
var laytable = {};
var getTableDom = function (tableid) {
    var $this = $("#" + tableid + "_old");

    laytable.temp_cols = [];
    laytable.cols = [[]];
    $this.find("div[type=Cols]").find("div").each(function () {
        $thisDiv = $(this);
        if ($thisDiv.attr("type") == "Col" || $thisDiv.attr("type") == "ColMethod" || $thisDiv.attr("type") == "ColTemplate") {
            if ($thisDiv.attr("key") == "sn") {
                laytable.temp_cols.push({ type: 'numbers', fixed: 'left' });
                if ($this.attr("allowselect") == "true") {
                    laytable.temp_cols.push({ type: 'checkbox' });
                }
            }
            else {
                // 最小尺寸
                var td_css = $thisDiv.attr("class");
                var patt1 = new RegExp("td_[0-9]+");
                var m_width = patt1.exec(td_css);
                if (!!m_width && m_width.length > 0) {
                    m_width = m_width[0].replace("td_", "");
                }
                var col_t = {};
                if (!!m_width && m_width != "") {
                    col_t.minWidth = m_width;
                }
                if (!col_t.minWidth || col_t.minWidth == "") {
                    //设置默认宽度  防止列宽度过小挤成一坨
                    col_t.minWidth = 50;
                }

                var patt2 = new RegExp("width_[0-9]+");
                var width = patt2.exec(td_css);
                if (!!width && width.length > 0) {
                    width = width[0].replace("width_", "");
                }
                if (!!width && width != "") {
                    col_t.width = width;
                }
                if ($thisDiv.attr("class")) {
                    if ($thisDiv.attr("class").indexOf("left") >= 0) {
                        col_t.style = 'text-align:left';
                    }
                }

                col_t.field = $thisDiv.attr("key");
                col_t.title = GetResource($thisDiv.attr("lid"), $thisDiv.attr("title"));

                if ($thisDiv.attr("orderby") == 'true') {
                    col_t.sort = true;
                }

                if ($thisDiv.attr('col-sel') != undefined) {
                    col_t.hide = true;
                }

                if ($thisDiv.attr("type") == "ColMethod") {
                    var patt1 = /'{/g;
                    var patt2 = /}'/g;
                    var method = $thisDiv[0].innerText.replace(patt1, "d.").replace(patt2, "");

                    col_t.templet = function (d) {
                        return eval(method);
                    }
                }

                if ($thisDiv.attr("type") == "ColTemplate") {
                    var html_str = "<div>" + $thisDiv.html().replaceAll(/'{/g, "'{{d.").replaceAll(/}'/g, "}}'").replaceAll('>{', '>{{d.').replaceAll('}<', '}}<') + "</div>";
                    col_t.toolbar = html_str;
                }

                laytable.temp_cols.push(col_t)
            }
        }
        /*if ($thisDiv.attr("type") == "ColTemplate") {
            var html_str = "<div>" + $thisDiv.html().replace(/'{/g, "'{{d.").replace(/}'/g, "}}'").replace('>{', '>{{d.').replace('}<', '}}<') + "</div>";
            laytable.temp_cols.push({ title: $thisDiv.attr("title"), toolbar: html_str, field: $thisDiv.attr("key"), width: col_t.width, minWidth: col_t.minWidth })
        }*/
    });

    laytable.cols[0] = laytable.temp_cols;

    if ($("table[lay-filter='" + tableid + "']").length == 0) {
        $this.after("<table id='" + tableid + "' lay-filter = '" + tableid + "'></table>");
    }
    //$this.remove();
    return laytable.cols;
}
//设置表格显示字段的宽度
function SetColumnWidth(cols, tableid) {
    if (cols[0]) {
        for (var j = 0; j < cols[0].length; j++) {
            if (cols[0][j]) {
                if (cols[0][j].minWidth && cols[0][j].field) {
                    switch (cols[0][j].field) {
                        case 'case_volume': case 'case_name': case 'customer_name':
                            cols[0][j].minWidth = '150';
                            break;
                        case 'app_no':
                            cols[0][j].minWidth = '135';
                            break;
                        case 'applicants': case 'applicant':
                            cols[0][j].minWidth = '140';
                            break;
                        default:
                            if (tableid == "CommissionList") {
                                if (cols[0][j].minWidth < 20) {
                                    cols[0][j].minWidth = '20';
                                }
                            } else {
                                if (cols[0][j].minWidth < 100) {
                                    cols[0][j].minWidth = '100';
                                }
                            }
                    }
                }
            }
        }
    }
    return cols;
}

//根据案件类型查询出处理事项
function LoadCtrlProcByCaseType(_CaseType) {
    function Success(_Meta) {
        CtrlProcList = null;
        CtrlProcList = _Meta.CtrlProcList;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCtrlProcByCaseType', CaseType: _CaseType }, Success, true);
    return CtrlProcList;
}

//设置待办数据已读未读
function AddCurUserReadLog(obj_id) {
    Ajax.Request("Common.ashx", { Call: "AddCurUserReadLog", obj_id: obj_id }, null, false, null, false);
}

///通过所属分部获取部门
function GetChargeByBranch(obj) {
    var Charge = [];
    function Success(_Meta) {
        Charge = _Meta.ChargeList;
    }
    Ajax.Request("Common.ashx", { Call: "GetChargeByBranch", obj_id: obj }, Success, true);
    return Charge;
}

///通过部门获取部门成员
function GetUserByCharge(charge_dept_id) {
    var UserList = [];
    function Success(_Meta) {
        UserList = _Meta.UserList;
    }
    Ajax.Request("Common.ashx", { Call: "GetUserByCharge", charge_dept_id: charge_dept_id }, Success, true);
    return UserList;
}

var CaseNameType = [{ id: "pdf", name: "pdf", value: "pdf" },
{ id: "doc", name: "doc", value: "doc" },
{ id: "zip", name: "zip", value: "zip" },
{ id: "docx", name: "docx", value: "docx" },
{ id: "notype", name: "其他", value: "其他" }]

///去掉其他的特殊字符
$.ReplcaOtheStr = function (str) {
    return str.replace(/[\r\n]/g, "").replace(/&/g, "").replace(/</g, "").replace(/>/g, "").replace(/'/g, "").replace(/"/g, "");
}



$.ReplcaOtheStr1 = function (str) {
    return str.replace(/'/g, "&ap1");
}



//加载商标法条
var TradeLawList = null;
var TradeLawList_SearchKey = '';
function LoadTradeLaw(_SearchKey) {
    function Success(_Meta) {

        TradeLawList_SearchKey = _SearchKey;
        TradeLawList = null;
        TradeLawList = _Meta.TradeLaw;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadTradeLaw', Key: _SearchKey }, Success, true);
    return TradeLawList;
}


function LoadSentenceResult(id) {
    var html = "";
    $("#" + id).html("");
    $("#" + id).append("<option value=''></option>");
    function Success(_Meta) {
        if (_Meta.Result.length > 0) {
            for (var i = 0; i < _Meta.Result.length; i++) {
                var row = _Meta.Result[i];
                html += "<option value=" + row.value + ">" + row.text + "</option>";
            }
        }
        $("#" + id).append(html)
    }
    Ajax.Request('Common.ashx', { Call: 'LoadSentenceResult' }, Success, true);
}


var FlowDirectionList = null;
var FlowDirectionList_SearchKey = '';
function LoadFlowDirection(_SearchKey) {
    function Success(_Meta) {

        FlowDirectionList_SearchKey = _SearchKey;
        FlowDirectionList = null;
        FlowDirectionList = _Meta.FlowDirection;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadFlowDirection', Key: _SearchKey }, Success, true);
    return FlowDirectionList;
}


var RelevantPeopleList = null
var RelevantPeopleList_SearchKey = '';
function LoadRelevantPeople(_SearchKey) {
    function Success(_Meta) {
        RelevantPeopleList_SearchKey = _SearchKey;
        RelevantPeopleList = null;
        RelevantPeopleList = _Meta.RelevantPeopleList;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadRelevantPeople', Key: _SearchKey }, Success, true);
    return RelevantPeopleList;
}

//加载时间控件多语言
function LoadDatePickerLang() {
    var Lang = top.window._UserModel.Language;
    var lang = "";
    if (Lang.indexOf("en_us") > -1) {
        lang = "en";
    }
    else if (Lang.indexOf("zh_cn") > -1) {
        lang = "zh-cn";
    }
    else {
        lang = "zh-cn";
    }
    return lang;
}

//添加必填星号
function AddRedStar(ids) {
    if (ids) {
        var mustArr = ids.split(/[,;，；]/);
        for (var i = 0; i < mustArr.length; i++) {
            var elem = $("#" + mustArr[i]).parent("td").prev().find("span");
            if (elem.before()) {
                if (elem.before().text().indexOf('*') == -1) {
                    var startEle = '<span style="color: red;margin-right:2px">*</span>';
                    elem.before(startEle);
                }
            }
        }
    }
}

function LoadCtrlProcByCaseId(_CaseId) {

    var CtrlProc = null;
    function Success(_Meta) {
        CtrlProc = null;
        CtrlProc = _Meta.CtrlProc;
    }
    Ajax.Request('Common.ashx', { Call: 'GetCtrlProcByCaseId', case_id: _CaseId }, Success, true);
    return CtrlProc;
}

//查询费用类型
var FeeStageist = null;
var FeeStage_SearchKey = '';
function LoadFeeStage(_SearchKey) {

    function Success(_Meta) {
        FeeStage_SearchKey = _SearchKey;
        FeeStageList = null;
        FeeStageList = _Meta.fee_stage;
    }

    Ajax.Request('Common.ashx', { Call: 'LoadFeeStage', searchKey: _SearchKey }, Success, true);
    return FeeStageList;
}

var publish_config = {};
function SetPublishConfig() {
    function Success(_Meta) {
        if (_Meta.publish_config && _Meta.publish_config.length > 0) {
            publish_config = _Meta.publish_config;
        }
    }
    Ajax.Request('Common.ashx', { Call: 'GetAllPublishConfig' }, Success, true);
}

function filterPubBool(arr) {
    var obj = publish_config;
    if (obj == {} || typeof (obj) !== "object" || JSON.stringify(obj) == '{}') {
        SetPublishConfig();
        obj = publish_config;
    }
    for (var i = 0; i < obj.length; i++) {
        row = obj[i];
        if (row.cfg_type == arr[0] && row.cfg_key == arr[1]) {
            if (row.cfg_value == "TRUE") {
                return true;
            }
            else if (row.cfg_value == "1") {
                return true;
            } else {
                return false;
            }
        }
    }
}

function filterPubValue(arr) {
    var obj = publish_config;
    if (obj == {} || typeof (obj) !== "object") {
        SetPublishConfig();
        obj = publish_config;
    }
    for (var i = 0; i < obj.length; i++) {
        row = obj[i];
        if (row.cfg_type == arr[0] && row.cfg_key == arr[1]) {
            return row.cfg_value;
        }
    }
}

///拼接我方文号
function contactCaseVolume(case_volume, case_volume_extend) {
    var empty = "";
    case_volume = case_volume || empty;
    case_volume_extend = case_volume_extend || empty;
    if (case_volume_extend == empty)
        return case_volume;
    return case_volume + '-' + case_volume_extend;
}

///格式化日期时间
var dtFormat = function (dt, format) {
    var date = {
        "M+": dt.getMonth() + 1,
        "d+": dt.getDate(),
        "h+": dt.getHours(),
        "m+": dt.getMinutes(),
        "s+": dt.getSeconds(),
        "q+": Math.floor((dt.getMonth() + 3) / 3),
        "S+": dt.getMilliseconds()
    };
    if (/(y+)/i.test(format)) {
        format = format.replace(RegExp.$1, (dt.getFullYear() + '').substr(4 - RegExp.$1.length));
    }
    for (var k in date) {
        if (new RegExp("(" + k + ")").test(format)) {
            format = format.replace(RegExp.$1, RegExp.$1.length == 1 ? date[k] : ("00" + date[k]).substr(("" + date[k]).length));
        }
    }
    return format;
}

//对象序列化
$.fn.serializeObject = function () {
    var o = {};
    var a = this.serializeArray();
    $.each(a, function () {
        if (o[this.name]) {
            if (!o[this.name].push) {
                o[this.name] = [o[this.name]];
            }
            o[this.name].push(this.value || '');
        } else {
            o[this.name] = this.value || '';
        }
    });
    return o;
}


/**
 * 为String对象扩展的format方法
 * @return {String} 返回通过format格式化后的新字符串
 */
String.prototype.format = function () {
    var str = this;
    for (var i = 0; i < arguments.length; i++) {
        var re = new RegExp('\\{' + (i) + '\\}', 'gm');
        str = str.replace(re, arguments[i]);
    }
    return str;
};

/**
 * 为Array扩展的查找所有匹配的元素
 * @param {function} fn 判断是否相等的方法
 * @return {Object} 返回一个新数组，数组中包含所有匹配的元素
 */
Array.prototype.where = function (fn) {
    if (typeof (fn) != "function") return null;
    var subArray = new Array();
    for (var i = 0; i < this.length; i++) {
        if (fn.call(window, this[i])) {
            subArray.push(this[i]);
        }
    }
    return subArray;
};

//新表格选择自定义栏位后，点击空白页触发方法
function SetTableToolFun(tableid, callback) {
    if (callback && typeof (callback) == "function") {
        $(document).bind("click", function (e) {
            if ($("#" + tableid).find(".layui-table-tool-panel").length == 1 && $(e.target).closest(".layui-table-tool-panel").length == 0) {
                callback();
            }
        })
    }
}

//获取当前信息的最后更新时间
var LastTime = null;
var LastUserId = null;
var chkLastTime = null;
function GetLastTimeInfo(tablename, obj_id, colname, colwhere, second) {
    if (!obj_id) {
        return;
    }
    function fun() {
        function Success(_Meta) {
            if (_Meta.LastUpTime) {
                if (LastTime != null && LastUserId != null) {
                    if (LastTime != _Meta.LastUpTime[0].update_time_ss && LastUserId != _Meta.LastUpTime[0].update_user_id) {
                        Box.Confirm(GRESX.HINTS.TITLE, GetResource('S210717100504193', '当前页面已有最新数据，是否刷新？'), function () {
                            window.location.reload();
                        }, { icon: 'hits.gif' });
                        window.clearInterval(chkLastTime);
                    }
                    else {
                        LastTime = _Meta.LastUpTime[0].update_time_ss;
                        LastUserId = _Meta.LastUpTime[0].update_user_id;
                        LoadLastDate = true;
                    }
                }
                else {
                    LastTime = _Meta.LastUpTime[0].update_time_ss;
                    LastUserId = _Meta.LastUpTime[0].update_user_id;
                    LoadLastDate = true;
                }

            }
        }
        var data = {};
        data.Call = "GetLastTimeInfo";
        data.tablename = tablename;
        data.id = obj_id;
        data.colname = colname;
        data.colwhere = colwhere;
        Ajax.Request('Common.ashx', data, Success);
    }
    fun();
    chkLastTime = setInterval(fun, second * 1000);
}



function GetFAQAndVideoByType(type_name, _data, callback) {
    var Success = function (_Meta) {
        if (_Meta.FAQPath) {
            //var apiUrl = "http://182.92.155.151:805/IPeasyHelpFAQ/AjaxServers/FaqAndVideo.ashx";
            //var apiUrl = _Meta.FAQPath + "/forms/FAQ/Faq.ashx";
            var apiUrl = "http://www.wadeinfo.cn/IPeasyHelpFAQ/forms/FAQ/Faq.ashx";
            $.ajax({ url: apiUrl, data: _data, dataType: "jsonp", jsonp: "callback", async: false, success: callback });



        } else {
            if (callback)
                callback();
        }

        // $.ajax({ url: apiUrl, data: _data, dataType: "jsonp", jsonp: "callback", async: false, success: callback });
    }
    Ajax.Request('Customer.ashx', { Call: 'SkipFAQ' }, Success, true);
}


function commafy(num, fixed_dot) {
    if (num == "")
        return "";

    //1.先去除空格,判断是否空值和非数
    if (fixed_dot || fixed_dot == 0) {
        num = parseFloat(num);
        num = num.toFixed(fixed_dot);
    } else {
        num = num + "";
    }
    //num = num.toString();
    num = num.replace(/[ ]/g, ""); //去除空格
    if (num == "") {
        return;
    }
    if (isNaN(num)) {
        return;
    }
    //2.针对是否有小数点，分情况处理
    var index = num.indexOf(".");
    if (index == -1) {//无小数点
        var reg = /(-?\d+)(\d{3})/;
        while (reg.test(num)) {
            num = num.replace(reg, "$1,$2");
        }
    } else {
        var intPart = num.substring(0, index);
        var pointPart = num.substring(index + 1, num.length);
        var reg = /(-?\d+)(\d{3})/;
        while (reg.test(intPart)) {
            intPart = intPart.replace(reg, "$1,$2");
        }
        num = intPart + "." + pointPart;
    }
    return num;
}



var ES_TAX_TYPE = [{ text: "内含", value: "IN" }, { text: "外加", value: "OUT" }];
var CURRENCY_NTD = 'NTD';//新台币
//计算税率
var fnEssenCalTaxAmount = function (currency_id, tax_rate, tax_type, amount) {
    var isRoundWithoutDecimal = currency_id == CURRENCY_NTD; //台币 四舍五入取整
    amount = parseFloat(amount);
    tax_rate = parseFloat(tax_rate);
    var withTax = amount;
    var unTax = amount;
    var tax = 0;
    if (tax_rate && tax_type && amount != 0) {
        if (tax_type == 'IN') {
            tax = (amount * tax_rate);
            if (isRoundWithoutDecimal) {//四舍五入取整
                tax = math.round(tax);
            }
            unTax = (amount - tax);
            withTax = amount;
        } else if (tax_type == 'OUT') {
            tax = (amount * tax_rate);
            if (isRoundWithoutDecimal) {//四舍五入取整
                tax = math.round(tax);
            }
            withTax = amount + tax;
            unTax = amount;
        }
    }
    return { addtax: withTax, untax: unTax, tax: tax };
}

var cal_type = "TW";
var fnEssenCalculateTax = function (DecDot, row) {
    var amount = parseFloat(row.amount);
    var price = parseFloat(row.price);
    var coefficient = parseFloat(row.coefficient);
    var tax_rate = parseFloat(row.tax_rate);
    var rate = parseFloat(row.rate);
    var ori_rate = parseFloat(row.ori_rate);
    var mid_rate = parseFloat(row.mid_rate);
    var tax_id = row.tax_id;
    var tax_type = row.tax_type;
    rate = rate ? rate : 1;
    mid_rate = mid_rate ? mid_rate : 1;
    ori_rate = ori_rate ? ori_rate : 1;
    ori_rate = (ori_rate == 1 && mid_rate == 1) ? rate : ori_rate;

    if (cal_type == "TW") {
        if (tax_rate && tax_type && amount != 0) {
            if (tax_type == 'IN') {
                row.addtax_ex = parseFloat(math.round(math.round(amount.mul(ori_rate), 2) * mid_rate, DecDot));
                row.addtax_ex_c = parseFloat(math.round(amount.mul(ori_rate), 2) * mid_rate);
                row.mid_amount = parseFloat(math.round(amount.mul(ori_rate), 2));
                row.tax_ex = parseFloat(math.round(row.addtax_ex.mul(tax_rate), DecDot));
                row.tax_ex_c = parseFloat(math.round(row.addtax_ex_c.mul(tax_rate), 2));
                row.untax_ex = parseFloat(math.round(row.addtax_ex - row.tax_ex, DecDot));
                row.untax_ex_c = parseFloat((row.addtax_ex_c - row.tax_ex_c));
                if (tax_id == 'TaxT01') {//执行业务所得 10%
                    var tmp = row.untax_ex;
                    row.untax_ex = row.addtax_ex;
                    row.addtax_ex = tmp;
                }
            } else if (tax_type == 'OUT') {
                row.untax_ex = parseFloat(math.round(math.round(amount.mul(ori_rate), 2) * mid_rate, DecDot));
                row.untax_ex_c = parseFloat(math.round(amount.mul(ori_rate), 2) * mid_rate);
                row.mid_amount = parseFloat(math.round(amount.mul(ori_rate), 2));
                row.tax_ex = parseFloat(math.round(row.untax_ex.mul(tax_rate), DecDot));
                row.tax_ex_c = parseFloat(math.round(math.round(row.untax_ex_c, DecDot) * tax_rate, 2));
                row.addtax_ex = parseFloat(math.round(row.untax_ex + row.tax_ex_c, DecDot));
                row.addtax_ex_c = parseFloat((row.untax_ex_c + row.tax_ex_c));
            }
        } else {
            tax_rate = 0;
            row.addtax = amount;
            row.addtax_ex = parseFloat(math.round(math.round(amount.mul(ori_rate), 2) * mid_rate, DecDot));
            row.addtax_ex_c = parseFloat(math.round(amount.mul(ori_rate), 2) * mid_rate);
            row.mid_amount = parseFloat(math.round(amount.mul(ori_rate), 2));
            row.tax_ex = parseFloat(math.round(row.addtax_ex.mul(tax_rate), DecDot));
            row.tax_ex_c = parseFloat(math.round(row.addtax_ex_c.mul(tax_rate), 2));
            row.untax_ex = parseFloat(math.round(row.addtax_ex - row.tax_ex, DecDot));
            row.untax_ex_c = parseFloat((row.addtax_ex_c - row.tax_ex_c));
        }
        row.addtax_ex_cm = commafy(row.addtax_ex, DecDot);
        row.addtax_ex_cm_c = row.addtax_ex_c;
        row.tax_ex_cm = commafy(row.tax_ex, DecDot);
        row.tax_ex_cm_c = row.tax_ex_c;
        row.untax_ex_cm = commafy(row.untax_ex, DecDot);
        row.untax_ex_cm_c = row.untax_ex_c;
    }
    else	//CN
    {
        if (tax_rate && tax_type && amount != 0) {
            if (tax_type == 'IN') {
                row.addtax_ex = parseFloat(math.round(price.mul(ori_rate).mul(mid_rate).mul(coefficient), DecDot));
                row.addtax_ex_c = parseFloat(price.mul(ori_rate).mul(mid_rate).mul(coefficient));
                row.mid_amount = parseFloat(math.round(amount.mul(ori_rate), 2));
                row.tax_ex = parseFloat(math.round(row.addtax_ex.mul(tax_rate), DecDot));
                row.tax_ex_c = parseFloat(row.addtax_ex_c.mul(tax_rate));
                row.untax_ex = parseFloat(math.round(row.addtax_ex - row.tax_ex, DecDot));
                row.untax_ex_c = parseFloat(row.addtax_ex_c - row.tax_ex_c);
            } else if (tax_type == 'OUT') {
                row.addtax_ex = parseFloat(math.round(math.round(price.mul(ori_rate).mul(mid_rate).mul(1 + tax_rate), DecDot).mul(coefficient), DecDot));
                row.addtax_ex_c = parseFloat(price.mul(ori_rate).mul(mid_rate).mul(1 + tax_rate).mul(coefficient));
                row.mid_amount = parseFloat(math.round(amount.mul(ori_rate), 2));
                row.untax_ex = parseFloat(math.round(row.addtax_ex / (1 + tax_rate), DecDot));
                row.untax_ex_c = parseFloat(row.addtax_ex_c / (1 + tax_rate));
                row.tax_ex = parseFloat(math.round(row.addtax_ex - row.untax_ex, DecDot));
                row.tax_ex_c = parseFloat(row.addtax_ex_c - row.untax_ex_c);
            }
        } else {
            tax_rate = 0;
            row.addtax = amount;
            row.addtax_ex = parseFloat(math.round(math.round(price.mul(ori_rate).mul(mid_rate), DecDot).mul(coefficient), DecDot));
            row.addtax_ex_c = parseFloat(price.mul(ori_rate).mul(mid_rate).mul(coefficient));
            row.mid_amount = parseFloat(math.round(amount.mul(ori_rate), 2));
            row.tax_ex = parseFloat(math.round(row.addtax_ex.mul(tax_rate), DecDot));
            row.tax_ex_c = parseFloat(math.round(row.addtax_ex_c.mul(tax_rate), 2));
            row.untax_ex = parseFloat(math.round(row.addtax_ex - row.tax_ex, DecDot));
            row.untax_ex_c = parseFloat((row.addtax_ex_c - row.tax_ex_c));
        }
        row.addtax_ex_cm = commafy(row.addtax_ex, DecDot);
        row.addtax_ex_cm_c = row.addtax_ex_c;
        row.tax_ex_cm = commafy(row.tax_ex, DecDot);
        row.tax_ex_cm_c = row.tax_ex_c;
        row.untax_ex_cm = commafy(row.untax_ex, DecDot);
        row.untax_ex_cm_c = row.untax_ex_c;
    }
    return row;
}

function get_tax_rate_from_name(name) {
    var names = name.split(' ');
    if (names.length > 1)
        return names[1].replace("%", "") / 100;
    else
        return 0
}
/**
** 乘法函数，用来得到精确的乘法结果
** 说明：javascript的乘法结果会有误差，在两个浮点数相乘的时候会比较明显。这个函数返回较为精确的乘法结果。
** 调用：accMul(arg1,arg2)
** 返回值：arg1乘以 arg2的精确结果
**/
function accMul(arg1, arg2) {
    var m = 0, s1 = arg1.toString(), s2 = arg2.toString();
    try {
        m += s1.split(".")[1].length;
    }
    catch (e) { }
    try {
        m += s2.split(".")[1].length;
    }
    catch (e) { }
    return Number(s1.replace(".", "")) * Number(s2.replace(".", "")) / Math.pow(10, m);
}
// 给Number类型增加一个mul方法，调用起来更加方便。
Number.prototype.mul = function (arg) {
    return accMul(arg, this);
};

/**
 * 跳转到Patmaster核稿页面对当前文件进行核稿
 * @param {any} fileNo
 * @param {any} fileName
 * @param {any} fileDesc
 */
async function ToPatmaster(fileNo, fileName, fileDesc, caseId, procId, caseVolume = null) {
    if (GetPublishConfig('ZTDZ', '20241118')) {
        var case_volume = caseVolume || $("#p_case_info__case_volume").val();

        var errorFlag1 = fileDesc.indexOf("新申请文档") < 0
        var errorFlag2 = fileName.endsWith('.doc')
        var errorFlag3 = fileName.indexOf(case_volume) == -1

        var openFlag = true

        if (errorFlag1) {
            openFlag = false
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S161012151216889', 'PatMaster需要【本所文件】-【新申请文档】才能核稿!'), null, { icon: 'hits.gif', width: 200 });
        }
        if (openFlag && errorFlag2) {
            openFlag = false
            openFlag = await Box.ConfirmAsync(GRESX.HINTS.TITLE, 'PM核稿需要docx格式的文档，当前文档为doc格式，是否继续？', function () {
            }, { icon: 'hits.gif', width: '250' });
        }
        if (openFlag && errorFlag3) {
            openFlag = false
            openFlag = await Box.ConfirmAsync(GRESX.HINTS.TITLE, '附件名称中不含有案号，是否继续？', function () {
            }, { icon: 'hits.gif', width: '250' });
        }
        if (openFlag) {
            OpenPatmaster();
        }
    } else {
        OpenPatmaster();
    }

    function OpenPatmaster() {
        var company_id = "";
        var company_name = "";
        //获取一些本所的参数
        var success = function (_Mata) {
            var companyInfo = _Mata.CompanyInfo;
            company_id = companyInfo.company_id;
            company_name = companyInfo.company_name_cn;

            //获取第二个斜杠后的数据

            var webURL = GetPublishConfigValueFn('patmaster', 'webUrl');
            if (!webURL || webURL.length == 0) {
                webURL = "https://service.wadeinfo.com/PatMaster/";
            }

            window.open(webURL + '#/turn?userId='
                + top.window._UserModel.user_id
                + '&userName=' + encodeURI(top.window._UserModel.user_name)
                + '&cnName=' + encodeURI(top.window._UserModel.Name)
                + '&email=' + top.window._UserModel.email
                + '&mobile=' + encodeURI(top.window._UserModel.mobile)
                + '&companyId=' + company_id
                + '&company_name_cn=' + company_name
                + '&fileNo=' + fileNo
                + '&fileName=' + encodeURI(fileName)
                + '&caseId=' + caseId
                + '&procId=' + procId
            );
        }
        Ajax.Request('Login.ashx', { 'Call': 'GetCompanyInfo' }, success);
    }
}

/**
 * 根据邮件标签背景色返回可读的文字颜色。
 * 浅色背景使用深色文字，深色背景使用白色文字，透明或无法识别的颜色默认深色。
 */
function GetMailTagTextColor(color) {
    if (!color) {
        return "#333";
    }
    var value = String(color).replace(/\s/g, "");
    if (!value || value == "transparent") {
        return "#333";
    }

    var rgb = null;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
        if (value.length == 4) {
            value = "#" + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2) + value.charAt(3) + value.charAt(3);
        }
        rgb = [
            parseInt(value.substr(1, 2), 16),
            parseInt(value.substr(3, 2), 16),
            parseInt(value.substr(5, 2), 16)
        ];
    }
    else {
        var match = value.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([.\d]+))?/i);
        if (match) {
            if (match[4] !== undefined && parseFloat(match[4]) === 0) {
                return "#333";
            }
            rgb = [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
        }
    }

    if (!rgb) {
        return "#333";
    }
    var brightness = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return brightness > 160 ? "#333" : "#fff";
}

var fnEssenCalculateTax = function (DecDot, row) {
    var amount = parseFloat(row.amount);
    var tax_rate = parseFloat(row.tax_rate);
    var rate = parseFloat(row.rate);
    var ori_rate = parseFloat(row.ori_rate);
    var mid_rate = parseFloat(row.mid_rate);
    var tax_id = row.tax_id;
    var tax_type = row.tax_type;
    rate = rate ? rate : 1;
    mid_rate = mid_rate ? mid_rate : 1;
    ori_rate = ori_rate ? ori_rate : 1;
    ori_rate = (ori_rate == 1 && mid_rate == 1) ? rate : ori_rate;

    if (tax_rate && tax_type && amount != 0) {
        if (tax_type == 'IN') {
            row.addtax_ex = parseFloat((((Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2)) * mid_rate).toFixed(DecDot));
            row.addtax_ex_c = parseFloat((Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2) * mid_rate);
            row.mid_amount = parseFloat(Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2);
            row.tax_ex = parseFloat((row.addtax_ex.mul(tax_rate)).toFixed(DecDot));
            row.tax_ex_c = parseFloat((row.addtax_ex_c.mul(tax_rate)).toFixed(2));
            row.untax_ex = parseFloat((row.addtax_ex - row.tax_ex).toFixed(DecDot));
            row.untax_ex_c = parseFloat((row.addtax_ex_c - row.tax_ex_c));
            if (tax_id == 'TaxT01') {//执行业务所得 10%
                var tmp = row.untax_ex;
                row.untax_ex = row.addtax_ex;
                row.addtax_ex = tmp;
            }

        } else if (tax_type == 'OUT') {
            row.untax_ex = parseFloat((((Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2)) * mid_rate).toFixed(DecDot));
            row.untax_ex_c = parseFloat(((Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2)) * mid_rate);
            row.mid_amount = parseFloat(Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2);
            row.tax_ex = parseFloat((row.untax_ex.mul(tax_rate)).toFixed(DecDot));
            row.tax_ex_c = parseFloat((((row.untax_ex_c).toFixed(DecDot)) * tax_rate).toFixed(2));
            row.addtax_ex = parseFloat((row.untax_ex + row.tax_ex_c).toFixed(DecDot));
            row.addtax_ex_c = parseFloat((row.untax_ex_c + row.tax_ex_c));
        }
    } else {
        tax_rate = 0;
        row.addtax = amount;
        row.addtax_ex = parseFloat((((Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2)) * mid_rate).toFixed(DecDot));
        row.addtax_ex_c = parseFloat(((Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2)) * mid_rate);
        row.mid_amount = parseFloat(Math.round(amount.mul(ori_rate) * 100) / 100).toFixed(2);
        row.tax_ex = parseFloat((row.addtax_ex.mul(tax_rate)).toFixed(DecDot));
        row.tax_ex_c = parseFloat((row.addtax_ex_c.mul(tax_rate)).toFixed(2));
        row.untax_ex = parseFloat((row.addtax_ex - row.tax_ex).toFixed(DecDot));
        row.untax_ex_c = parseFloat((row.addtax_ex_c - row.tax_ex_c));
    }
    row.addtax_ex_cm = commafy(row.addtax_ex, DecDot);
    row.addtax_ex_cm_c = row.addtax_ex_c;
    row.tax_ex_cm = commafy(row.tax_ex, DecDot);
    row.tax_ex_cm_c = row.tax_ex_c;
    row.untax_ex_cm = commafy(row.untax_ex, DecDot);
    row.untax_ex_cm_c = row.untax_ex_c;

    return row;
}
