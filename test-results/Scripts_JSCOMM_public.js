ï»¿
/******é»è®¤å è½½ä¸ä¸ªå¤è¯­è¨*****/
$(function () {
    SetPageLanguage();
    //GetDivIsShow("IC_Hide"); //å³é­æ¹éä¸è½½
    layui.use('layer', function () {
        var layer = layui.layer;
        $('[data-toggle="tooltip"]').off('mouseenter').off('mouseleave').on({
            mouseenter: function () {
                that = $(this);
                aTitle = that.attr("title");
                if (aTitle) {
                    that.attr("title", "");
                    table = layer.tips(aTitle, that, { tips: 1, time: 9999000, });
                    //å½titleä½äºæå³è¾¹æ¶ï¼æ ·å¼éè¦è°æ´
                    /*let windowWidth = $(window).width();
                    let item = $(that).offset().left;
                    let aWidth = $('.layui-layer-content').innerWidth();
                    console.log(windowWidth + "é¿" + item + 'a' + aWidth);
                    console.log(item + aWidth );
                    if (windowWidth < item + aWidth + 2) {
                        let left = "left:" + (aWidth - 20) + "px!important";
                        //å¤æ­æ¯å¦ä½äºè¾ä¸æ¹
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
    // æ¡ä»¶åç§°é¢è§(éå¯¹äºæä¸ä¸è§æ ç)
    CaseNameView();

    //if (GetPublishConfig("index", "is_New")) {
    //    $(document).ready(function () {
    //        $(".btn-search span").each(function () {
    //            if ("æ¥è¯¢" == $(this).text()) {
    //                $(this).parent().css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //        $(".btn-search").each(function () {
    //            if ("æ¥è¯¢" == $(this).text()) {
    //                $(this).css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //        $(".btn-style-img span").each(function () {
    //            if ("æ¥è¯¢" == $(this).text()) {
    //                $(this).parent().css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //        $(".btn-style-img").each(function () {
    //            if ("æ¥è¯¢" == $(this).text()) {
    //                $(this).css("cssText", "background-color:#2587E8!important");
    //            }
    //        })
    //    })
    //}

    // åæ æ£ç´¢ç³»ç»ååµé¡µé¢è°ç¨
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

        // æ£ç´¢è¯¦æé¡µ
        if ('openDetail' == msg.data.type) {
            var regNo = GetParaValue(msg.data.url, "regNo") || '';
            var intCls = GetParaValue(msg.data.url, "intCls") || '';
            param.title = 'åæ è¯¦æ-' + regNo + '-' + intCls;
            param.id = "tm_detail_" + regNo + '_' + intCls;
            top.tabPanel.addTab(param)
        }
        // ç¾å½è¯¦æé¡µ
        else if ('openDetailUS' == msg.data.type) {
            param.title = 'ç¾å½åæ è¯¦æ-' + GetParaValue(msg.data.url, "serialNumber") || '';
            param.id = "tm_detailus_" + GetParaValue(msg.data.url, "serialNumber") || guid;
            top.tabPanel.addTab(param)
        }
        // åæ æ£ç´¢é¡µ
        else if ('openSearch' == msg.data.type) {
            param.title = 'åæ æ£ç´¢';
            param.id = "tm_search";
            top.tabPanel.addTab(param)
        }
        // å¼è®®å³å®ä¹¦æ¥è¯¢é¡µ
        else if ('openObjection' == msg.data.type) {
            param.title = 'å¼è®®å³å®ä¹¦æ¥è¯¢-' + decodeURI(GetParaValue(msg.data.url, "word") || '');
            param.id = "tm_objection_" + guid;
            top.tabPanel.addTab(param)
        }
        // è¯å®¡æä¹¦æ¥è¯¢é¡µ
        else if ('openReview' == msg.data.type) {
            param.title = 'è¯å®¡æä¹¦æ¥è¯¢-' + decodeURI(GetParaValue(msg.data.url, "word") || '');
            param.id = "tm_review_" + guid;
            top.tabPanel.addTab(param)
        }
        // å¼è®®å³å®ä¹¦è¯¦æé¡µ
        else if ('openObjectionDetail' == msg.data.type) {
            param.title = 'å¼è®®å³å®ä¹¦è¯¦æ-' + decodeURI(GetParaValue(msg.data.url, "docNo") || '');
            param.id = "tm_objection_detail_" + decodeURI(GetParaValue(msg.data.url, "docNo") || '').replace(/[^0-9a-zA-Z]/g, "");
            top.tabPanel.addTab(param)
        }
        // è¯å®¡æä¹¦è¯¦æé¡µ
        else if ('openReviewDetail' == msg.data.type) {
            param.title = 'è¯å®¡æä¹¦è¯¦æ-' + decodeURI(GetParaValue(msg.data.url, "docNo") || '');
            param.id = "tm_review_detail_" + decodeURI(GetParaValue(msg.data.url, "docNo") || '').replace(/[^0-9a-zA-Z]/g, "");
            top.tabPanel.addTab(param)
        }
        // åæ å¯¹æ¯é¡µ
        else if ('openComparison' == msg.data.type) {
            param.title = 'åæ å¯¹æ¯-' + GetParaValue(msg.data.url, "regNo").replace(/,/g, "_");
            param.id = "tm_comparison_" + GetParaValue(msg.data.url, "regNo").replace(/,/g, "_");
            top.tabPanel.addTab(param)
        }
        // åæ å¾è°±é¡µ
        else if ('openAtlas' == msg.data.type) {
            param.title = 'åæ å¾è°±-' + decodeURI(GetParaValue(msg.data.url, "registrant") || '');
            param.id = "tm_atlas_" + guid;
            top.tabPanel.addTab(param)
        }
        // åæ¢å½å®¶ï¼åºå¼ï¼
        else if ('changeCountry' == msg.data.type) {
            param.title = msg.data.country + 'åæ æ£ç´¢';
            msg.data.country = 'ç¾å½' == msg.data.country ? 'US' : 'CN';
            param.id = "tm_search_" + msg.data.country;
            top.tabPanel.addTab(param)
        }
        // ä¿å­æ£ç´¢é¡µé¢çlay-id
        else if ('saveLayId' == msg.data.type) {
            var layId = top.$(".tabpanel_mover").find(".active").attr("id");
            top.trademarkSearchLayId = layId;
        }
        // è¿åæ£ç´¢é¡µé¢
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
            // æå¼åæèç¨¿é¡µé¢
            if (msg.data.action == "open-email-draft") {
                top.MenuEvent2(this, 'b4dd5372-a96d-40a6-8576-277b90a7efcf');
            }
            // æå¼æ¡ä»¶
            else if (msg.data.action == "open-patent-case") {
                var caseId = GetParaValue(msg.data.url, "caseId") || '';
                var caseVolume = GetParaValue(msg.data.url, "caseVolume") || '';
                PublicOpenCase(caseId, caseVolume, "31D1A147-2931-43B5-94AE-B72B1525BA8A");
            }
            // æå¼æä»¶
            else if (msg.data.action == "open-file") {
                var fileNo = GetParaValue(msg.data.url, "fileNo") || '';
                var fileName = GetParaValue(msg.data.url, "fileName") || '';
                ViewFile(fileNo, fileName, '', '', '');
            }
            // æå¼è¯·æ¬¾åé¡µé¢
            else if (msg.data.action == "open-payment-request-detail") {
                var objid = GetParaValue(msg.data.url, "objid") || '';
                top.window.AddBusinessTab(objid, 'è¯·æ¬¾å', "Forms/Bill/RequestDetail.aspx?objid=" + objid);
            }
        }
    });


    // ä¸å©æ£ç´¢ç³»ç»ååµé¡µé¢è°ç¨
    window.addEventListener('message', function (msg) {
        if (!msg || !msg.data || ('https://cs.wadeinfo.com:6012' != msg.origin && 'patentSearch' != msg.data.source)) {
            return;
        }
        var param = {};
        var guid = NewGuid();
        param.guid = guid;
        param.menu_id = msg.data.url;
        param.html = "<iframe src='" + msg.data.url + "' width='100%' height='100%' frameborder='0'></iframe>";
        // è¯¦æé¡µ
        if ('openDetail' == msg.data.type) {
            var pn = GetParaValue(msg.data.url, 'PN') || GetParaValue(msg.data.url, 'pn') || ''
            param.title = 'ä¸å©è¯¦æ-' + pn
            param.id = 'patent_detail_' + pn
            top.tabPanel.addTab(param)
        }
        // æ£ç´¢é¡µ
        else if ('openSearch' == msg.data.type) {
            param.title = 'ä¸å©æ£ç´¢'
            param.id = 'patent_search'
            top.tabPanel.addTab(param)
        }
        // æ¹éæ£ç´¢é¡µ
        else if ('openBatchSearch' == msg.data.type) {
            param.title = 'ä¸å©æ¹éæ£ç´¢'
            param.id = 'patent_batch_search'
            top.tabPanel.addTab(param)
        }
        // ä¸å©å¾è°±é¡µ
        else if ('openAtlas' == msg.data.type) {
            param.title = 'ä¸å©å¾è°±-' + decodeURI(GetParaValue(msg.data.url, 'applicant') || '')
            param.id = 'patent_atlas'
            top.tabPanel.addTab(param)
        }
        // å¯¼åºåå²è®°å½é¡µé¢
        else if ('openExportHistory' == msg.data.type) {
            param.title = 'å¯¼åºåå²è®°å½'
            param.id = 'patent_export_history'
            top.tabPanel.addTab(param)
        }
    });
})


//å±è½éæ ¼é®ï¼é²æ­¢æå¤è¿åä¸ä¸é¡µé¢ï¼
document.onkeypress = forbidBackSpace;
document.onkeydown = forbidBackSpace;
function forbidBackSpace(e) {
    var ev = e || window.event;
    if (ev.keyCode == 8) {
        var obj = ev.target || ev.srcElement;

        // æ°å¢ï¼æ¯æå¯ç¼è¾åç´ ï¼contenteditableï¼çéæ ¼é®
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

/*------------------------å¬å±å½æ°(ä¸) å¬å±æ¹æ³ ------------------------start*/
/*********Ajaxè®¿é®åå°å¬å±æ¹æ³*******/
/****_syncæ¯å¦åæ­¥ true åæ­¥ï¼falseæèä¸ä¼ åæ°ä¸ºå¼æ­¥*****/
/*_ErrCallBack åºç°å¼å¸¸æ¶çåè°å½æ°ï¼ä¸è¬ç¨ä½ç¶æå¤ç*/
var Ajax = {};
Ajax.Request = function (_Url, _Data, _CallBack, _sync, _ErrCallBack, cnfg) {

    _Url = GUrl + '/AjaxServers/' + _Url;


    if (!_Data["log_pagename"]) {
        _Data["log_pagename"] = GetPageName();
    }

    ///è®¤è¯å¤±æ,éæ°ç»é
    function ReloginFun(_Meta) {
        top.window.ReLoginDialog();
    }

    ///åå°æ§è¡åçå¼å¸¸,å¼¹åºæç¤ºæ¡
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
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "æ¥å£è°ç¨éè¯¯,è¯·æ£æ¥æ¥å£éç½®ä¿¡æ¯!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "æ¥å£è°ç¨éè¯¯,è¯·æ£æ¥æ¥å£éç½®ä¿¡æ¯!", null, { icon: 'hits.gif' });
            }
        },
        error: function (data) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "æ¥å£è°ç¨éè¯¯,è¯·æ£æ¥æ¥å£éç½®ä¿¡æ¯!", null, { icon: 'hits.gif' });
            }
        }
    }
    if (cnfg) {
        $.extend(_config, cnfg)
    }
    $.ajax(_config);
}

/**
 * è°ç¨cpcå®¢æ·ç«¯çapiæ¥å£
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
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "æ¥å£è°ç¨éè¯¯,è¯·æ£æ¥æ¥å£éç½®ä¿¡æ¯!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
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
                            Box.Alert(GRESX.HINTS.TITLE, "PCTå½éæ¡ä»¶è¯·åæå¨ä¸è½½éäº¤æ¡å·åå°å®¢æ·ç«¯ä¸­å¯¼å¥!", null, { icon: 'hits.gif' });
                        } else {
                            Box.Alert(GRESX.HINTS.TITLE, response.message, null, { icon: 'hits.gif' });
                        }
                    } else {
                        Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
                    }
                } else {
                    Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
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
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "æ¥å£è°ç¨éè¯¯,è¯·æ£æ¥æ¥å£éç½®ä¿¡æ¯!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
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
                            Box.Alert(GRESX.HINTS.TITLE, "PCTå½éæ¡ä»¶è¯·åæå¨ä¸è½½éäº¤æ¡å·åå°å®¢æ·ç«¯ä¸­å¯¼å¥!", null, { icon: 'hits.gif' });
                        } else {
                            Box.Alert(GRESX.HINTS.TITLE, response.message, null, { icon: 'hits.gif' });
                        }
                    } else {
                        Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
                    }
                } else {
                    Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
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
                Box.Alert(GRESX.HINTS.TITLE, _Meta.message || "æ¥å£è°ç¨éè¯¯,è¯·æ£æ¥æ¥å£éç½®ä¿¡æ¯!", null, { icon: 'hits.gif' });
            } else if (_CallBack != null && typeof (_CallBack) != 'undefined') {
                _CallBack(_Meta);
            }
        },
        failure: function (XMLHttpRequest, textStatus, errorThrown) {
            if (_ErrCallBack != null && typeof (_ErrCallBack) != 'undefined') {
                _ErrCallBack();
            } else {
                Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
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
                            Box.Alert(GRESX.HINTS.TITLE, "PCTå½éæ¡ä»¶è¯·åæå¨ä¸è½½éäº¤æ¡å·åå°å®¢æ·ç«¯ä¸­å¯¼å¥!", null, { icon: 'hits.gif' });
                        } else {
                            Box.Alert(GRESX.HINTS.TITLE, response.message, null, { icon: 'hits.gif' });
                        }
                    } else {
                        Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
                    }
                } else {
                    Box.Alert(GRESX.HINTS.TITLE, "è¯·åå¯å¨æ¬å°CPCå®¢æ·ç«¯!", null, { icon: 'hits.gif' });
                }
            }
        }
    }
    if (cnfg) {
        $.extend(_config, cnfg)
    }
    $.ajax(_config);
}

/***********HTMLä¸­å­æ®µçå¤è¯­è¨å¤ç(ä¸è¬çº¯æå­ï¼åæ¶åå«inputç±»åçvalueå¼)********************/
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


/* è·åUrlä¸­åæ°ï¼å¹¶å°åæ°è½¬åjosnç±»å */
function getParas(_Url) {
    var input = _Url || window.location.search.trim('[?]');
    if (input == "") return {};

    /*******å»æé¾æ¥,åªä¿çåæ°  TQ 2014-07-29******/
    input = input.substring(input.indexOf('?') + 1, input.length);

    var pairs = input.split("&");
    var params = {};
    for (var i = 0; i < pairs.length; i++) {
        var vs = pairs[i].split("=");
        params[vs[0]] = vs[1];
    }
    return params;
}

/*è·åURLåæ°å¼ Hj*/
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

/*****JSäº§çä¸ä¸ª32ä½çGUID******/
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
//ä»åå°è·å
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

/*å®¢æ·ç«¯Cookieæä½ Hj*/
var Cookies = {
    Set: function (_Name, _Value) {
        $.cookie(_Name, _Value, { expires: 7, path: '/' });
    },
    Get: function (_Name) {
        return $.cookie(_Name)
    }
}


/* è·åå¤è¯­è¨ */
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

///ç»å®é¡µç­¾ç¹å»äºä»¶
///lidivid : lié¡µç­¾æå¨çå¤æ¡div çid
///showdivid :åå®¹divéæ©å¨
///CallBack: åè°å½æ°
///example BinTabClick('dTop', '#content div.tbcontent', Patent.TabChangeAfter);
BinTabClick = function (lidivid, showdivid, BeforeCall, AfterCall) {
    $('#' + lidivid + ' li').unbind().click(function () {
        TabChangClick(this, showdivid, 'current', BeforeCall, AfterCall);
    });
}

//éåä¸ä¸ªliæ ·å¼çåæ¢
BinTabLiClick = function (lidivid, showdivid, Class, BeforeCall, AfterCall) {
    $('#' + lidivid + ' li').unbind().click(function () {
        TabChangClick(this, showdivid, Class, BeforeCall, AfterCall);
    });
}


//é¡µç­¾ç¹å»åæ¢ææ
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
    event = event || window.event;                            //é¼ æ ãé®çäºä»¶
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
            var text = "æ²¡ææ¾å°æ­¤ç¨æ·çè¯¦ç»ä¿¡æ¯";
            if (_Meta && _Meta.User) {
                text = "å§åï¼" + _Meta.User["cn_name"] + "<br/>é¨é¨ï¼" + _Meta.User["dept_full_name"] + "<br/>é®ç®±ï¼" + _Meta.User["email"] + "<br/>çµè¯ï¼" + _Meta.User["tel"];
            }
            var title_show = $('#title_user');
            if (title_show.length == 0) {
                title_show = $('<div id="title_user" class="title_tips" ></div>').appendTo('body');
            }
            else {
                title_show.removeAttr('style');
            }
            title_show.html(text);
            event = event || window.event;                            //é¼ æ ãé®çäºä»¶
            var top_down = 5;                                        //ä¸ç§»15pxé¿åé®çå½åæ ç­¾
            //æå·¦å¼ä¸ºå½åé¼ æ ä½ç½® ä¸ bodyå®½åº¦åå»æ¬åææDIVå®½åº¦çæå°å¼ï¼å¦åå°å³ç«¯å¯¼è´é®ç
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

/*------------------------å¬å±å½æ°(ä¸) å¬å±æ¹æ³ ------------------------end*/


/*------------------------å¬å±å½æ°(äº) jqueryæ©å±æ¹æ³ ------------------------start*/

/* è·åAjaxè¿åå®¢æ·ç«¯è¯·æ±ç»æ David */
//$.getJson = function (result) { return $.parseJSON(result.responseText); }

///* éªè¯Ajaxè¿åå®¢æ·ç«¯æ°æ®æ¯å¦åæ³ David */
//$.checkSuccess = function (result) {
//    var _Meta = $.getJson(result);
//    if (!_Meta.ClientInfo.IsLogin) { document.location.href = _Meta.ClientInfo.Url; return null; }
//    if (!_Meta.ClientInfo.Status) { alert("è®¿é®å¼å¸¸"); return null; }
//    if (_Meta.ClientInfo.Url != null) {
//        document.location.href = _Meta.ClientInfo.Url;
//        return null;
//    }
//    return _Meta;
//}

//è§£æXMLå­ç¬¦ä¸²,è¿åä¸ä¸ªxmlå¯¹è±¡
var loadXML = function (xmlString) {
    var xmlDoc = null;
    //å¤æ­æµè§å¨çç±»å
    //æ¯æIEæµè§å¨
    if (!window.DOMParser && window.ActiveXObject) {   //window.DOMParser å¤æ­æ¯å¦æ¯éieæµè§å¨
        var xmlDomVersions = ['MSXML.2.DOMDocument.6.0', 'MSXML.2.DOMDocument.3.0', 'Microsoft.XMLDOM'];
        for (var i = 0; i < xmlDomVersions.length; i++) {
            try {
                xmlDoc = new ActiveXObject(xmlDomVersions[i]);
                xmlDoc.async = false;
                xmlDoc.loadXML(xmlString); //loadXMLæ¹æ³è½½å¥xmlå­ç¬¦ä¸²
                break;
            } catch (e) {
            }
        }
    }
    //æ¯æMozillaæµè§å¨
    else if (window.DOMParser && document.implementation && document.implementation.createDocument) {
        try {
            /* DOMParser å¯¹è±¡è§£æ XML ææ¬å¹¶è¿åä¸ä¸ª XML Document å¯¹è±¡ã
            * è¦ä½¿ç¨ DOMParserï¼ä½¿ç¨ä¸å¸¦åæ°çæé å½æ°æ¥å®ä¾åå®ï¼ç¶åè°ç¨å¶ parseFromString() æ¹æ³
            * parseFromString(text, contentType) åæ°text:è¦è§£æç XML æ è®° åæ°contentTypeææ¬çåå®¹ç±»å
            * å¯è½æ¯ "text/xml" ã"application/xml" æ "application/xhtml+xml" ä¸­çä¸ä¸ªãæ³¨æï¼ä¸æ¯æ "text/html"ã
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

/*æ ¼å¼åå­ç¬¦ä¸²è¿æ¥ä¿¡æ¯ David*/
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



/*çºåè¡¨å ä¸å¥æ¸è¡åå¶æ¸è¡æ¨£å¼  è¡¨æ ¼*/
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

/*å®¢æ·ç«¯Cookieæä½ David*/
$.Cookies = {
    Set: function (_Name, _Value) {
        $.cookie(_Name, _Value, { expires: 7, path: '/' });
    },
    Get: function (_Name) {
        return $.cookie(_Name)
    }
}

/*è®¾ç½®ææ¹åå¤è¯­è¨*/
function SettingLanguage(language) {
    var _data = { Call: 'ChangeLanguage', Language: language }
    var success = function (result) {
        top.document.location.reload();
    }
    Ajax.Request("Login.ashx", _data, success);
}

/*------------------------å¬å±å½æ°(äº) jqueryæ©å±æ¹æ³ ------------------------end*/


/*------------------------å¬å±å¸¸éå®ä¹(ä¸) å¤è¯­è¨ ------------------------start*/

var CONST = {};

/*æµç¨ç±»å*/
CONST.FLOWTYPE = { APPLY: 'AP', DISTRI: 'DR', REVISE: 'RE', TRREVISE: 'TRE', UPDATE: 'UP', EFILE: 'EF', COUNSEL: 'CO', REQUEST: 'RQ', BILLIN: 'BI', BILLOUT: 'BO', OFFSET: 'HD', UD: "UD", ClAIM: 'CL', PAYMENT: 'PM', CW: "CW", ACCOUNT: "AC", Contract: "CT", BILL: "AS", REFUND: "TH", COMMUNICATECUSTOMER: "CC" }
CONST.CASETYPE = { APPLY: 'AP', CASE: 'CA', COUNSEL: 'CO' }
//AP	ææ¡æµç¨	Apply
//DR    éæ¡æµç¨    DISTRI
//RE	æ ¸ç¨¿æµç¨	Revise
//UP	æ°æ®æ´æ°	Update
//EF	éä»¶æµç¨	EFile
//CO	åææµç¨	Counsel
//OT	å¶ä»æµç¨	Other
//CL    è®¤é¢æµç¨    ClAIM
/*éç¨å¤è¯­è¨è¯æ¡*/
var GRESX = {};
GRESX.HINTS = { TITLE: GetResource("S140808093254228", "ç³»ç»ä¿¡æ¯"), YES: GetResource('S140808093304465', 'ç¡®å®'), NO: GetResource('S140808093322163', 'åæ¶') }
GRESX.TABLE = {
    SERIAL: GetResource('S140808093333235', 'åºå·'), NODATA: GetResource('S140808093355956', 'æ å¯æ¾ç¤ºæ°æ®'), OPERATE: GetResource('S140808093420998', 'æä½'),
    STATUS: GetResource('S140808093519552', 'ç¶æ'), REMARK: GetResource('S140808093432700', 'å¤æ³¨'),
    HINTS: GetResource('S140808093615244', 'å½åæ¾ç¤ºç¬¬{0}-{1}æ¡è®°å½ï¼å±{2}æ¡è®°å½')
}

/*------------------------å¬å±å¸¸éå®ä¹(ä¸) å¤è¯­è¨ ------------------------end*/

/*------------------------åºå®div ------------------------start*/
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
/*------------------------åºå®div ------------------------end*/

/*------------------------æ¶é´æ åä¸­å½è½¬æ¢ä¸ºyyyy-mm-dd ------------------------start*/

function DateTo(_day) {
    var dt = new Date(_day);
    var year = "" + (dt.getFullYear()); //è·åå¹´
    var month = "" + (dt.getMonth() + 1); //è·åæ
    var day = "" + dt.getDate(); //è·åæ¥
    if (month.length == 1) {
        month = "0" + month;
    }
    if (day.length == 1) {
        day = "0" + day;
    }
    return year + '-' + month + '-' + day;
}

/*------------------------æ¶é´æ åä¸­å½è½¬æ¢ä¸ºyyyy-mm-dd ------------------------end*/

/*è·åå½åæ¥åï¼æ¯å¦è¦å ä¸æ¶é´*/

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

//è·åå½åæç¬¬ä¸å¤©
$.getCurMonthFirstDay = function () {
    var d = new Date();
    var year = d.getFullYear();
    var month = d.getMonth() + 1;
    if (month > 9)
        return year + "-" + month + "-" + "01";
    else
        return year + "-0" + month + "-" + "01";


}


// æ ¼å¼åæ¥å¯¹è±¡
function getNowDate() {
    var date = new Date();
    var sign2 = ":";
    var year = date.getFullYear() // å¹´
    var month = date.getMonth() + 1; // æ
    var day = date.getDate(); // æ¥
    var hour = date.getHours(); // æ¶
    var minutes = date.getMinutes(); // å
    var seconds = date.getSeconds() //ç§
    var weekArr = ['ææä¸', 'ææäº', 'ææä¸', 'ææå', 'ææäº', 'ææå­', 'ææå¤©'];
    var week = weekArr[date.getDay()];
    // ç»ä¸ä½æ°çæ°æ®åé¢å  â0â
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


//è·åå½åæçç»ææ¥æ
function getMonthEndDate(nowMonth, nowYear) {
    var monthStartDate = new Date(nowYear, nowMonth, 1);
    var monthEndDate = new Date(nowYear, nowMonth + 1, 1);
    var days = (monthEndDate - monthStartDate) / (1000 * 60 * 60 * 24);
    var monthEndDate = new Date(nowYear, nowMonth, days);
    return DateTo(monthEndDate);
}

//è·åå½åæå®çåå å¤©çæ¥æ
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

//è·å¾ä¸ä¸ªæå¨æ¨å¤©è¿ä¸å¤©çæ¥æ
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

//è·åä¸¤ä¸ªæ¥æç¸å·®çå¤©æ°
$.DateDiff = function (sDate1, sDate2) {    //sDate1åsDate2æ¯2006-12-18æ ¼å¼
    var aDate, oDate1, oDate2, iDays
    aDate = sDate1.split("-")
    oDate1 = new Date(aDate[1] + '-' + aDate[2] + '-' + aDate[0])    //è½¬æ¢ä¸º12-18-2006æ ¼å¼
    aDate = sDate2.split("-")
    oDate2 = new Date(aDate[1] + '-' + aDate[2] + '-' + aDate[0])
    iDays = parseInt(Math.round(oDate1 - oDate2) / 1000 / 60 / 60 / 24)    //æç¸å·®çæ¯«ç§æ°è½¬æ¢ä¸ºå¤©æ°
    return iDays
}


//è·åä¸ä¸ªæç¬¬ä¸å¤©åæåä¸å¤©
$.LastDate = function (type) {    //sDate1åsDate2æ¯2006-12-18æ ¼å¼
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
        var startDate = year + '-' + month + '-01'; //ä¸ä¸ªæç¬¬ä¸å¤©
        return startDate;
    }
    if (type == "false") {
        var endDate = year + '-' + month + '-' + myDate.getDate();//ä¸ä¸ªææåä¸å¤©
        return endDate;

    }


}





//æ¸é¤å­ç¬¦ä¸²ä¸­ç©ºæ ¼
$.NoSpace = function (_str) {
    while (_str.indexOf(" ") != -1) {
        _str = _str.replace(" ", "");
    }
    return _str;
}

//å¯¹çµå­é®ä»¶çéªè¯
$.CheckeMail = function (value) {
    var myreg = /^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/;
    if (!myreg.test(value)) {
        return false;
    }
    return true;
}
//å¯¹ææºå·ç çéªè¯
$.CheckeMobile = function (value) {
    var myreg = /^0?1[0-9][0-9]\d{8}$/;
    if (!myreg.test(value)) {
        return false;
    }
    return true;
}

//éªè¯æ°å­

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

//åªè½å¡«æ¸å­æ§å¶
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

//æ´æ°
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

//æµ®ç¹æ±åå¼å¸¸å¤ç
$.FloatAccAdd = function (arg1, arg2) {
    var r1, r2, m;
    try { r1 = arg1.toString().split(".")[1].length } catch (e) { r1 = 0 }
    try { r2 = arg2.toString().split(".")[1].length } catch (e) { r2 = 0 }
    m = Math.pow(10, Math.max(r1, r2))
    return (arg1 * m + arg2 * m) / m
}

//ç¸ä¹
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

//ç»éé¢æ·»å åä½ç¬¦
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

//è·å¾é¡µé¢å¯¹åºçèåid
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

//è¿åTab id
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

//æ°å»ºèç¨¿ä¿å­ä¹åéæ°æå¼èç¨¿é¡µé¢ï¼é¿åäººååæ¶æä½ï¼ç»ä¸å¢å ä¸ä¸ª2.2ç§å¨æ§è¡ãé¿åé¡µé¢è¿æ²¡
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

/*å¸¸ç¨å®¢æ·ç«¯ç»ä»¶åå¼ï¼å°è£çåå æ¯å ä¸ºéåºIEè·Firefoxçå¼å®¹æ§*/
/*è®¾ç½®æåºååæ§ä»¶ä¸å¯ç¨*/
$.SetDisabled = function (_this) {
    $("#" + _this + " input").attr("disabled", "true");
    $("#" + _this + " textarea").attr("disabled", "true");
    $("#" + _this + " select").attr("disabled", "true");
    $("#" + _this + " input[type='checkbox']").attr("disabled", "true");
    $("#" + _this + " input[type='option']").attr("disabled", "true");
    $("#" + _this + " input[type='radio']").attr("disabled", "true");
}

/*è®¾ç½®æåºååæ§ä»¶å¯ç¨*/
$.RemoveDisabled = function (_this) {
    $("#" + _this + " input").removeAttr("disabled");
    $("#" + _this + " textarea").removeAttr("disabled");
    $("#" + _this + " select").removeAttr("disabled");
    $("#" + _this + " input[type='checkbox']").removeAttr("disabled");
    $("#" + _this + " input[type='option']").removeAttr("disabled");
    $("#" + _this + " input[type='radio']").removeAttr("disabled");
}

/*è®¾ç½®æ§ä»¶å¼*/
$.SetValue = function (_ID, _Value) {
    $("#" + _ID).attr('value', _Value);
}
/*è®¾ç½®radioå¼*/
$.SetRadio = function (_Name, _Value) {
    $('input[type=radio][name=' + _Name + ']').each(function () {
        if ($(this).val() == _Value) {
            $(this).attr('checked', true);
        }
    });
}

/*åæå¡å¨ç«¯æ§ä»¶å¼*/
$.GetValue = function (_ID) {

    var _value = $("#" + _ID).val()
    if (_value == '' || _value == null) {
        _value = $("#" + _ID).text()
    }
    return _value;
}

/*è·åRadioæèCheckBoxç»éä¸­å¼*/
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

/*è·åRadioç»éä¸­å¼*/
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

/*è·åCheckBoxç»éä¸­å¼ flag åå²ç¬¦*/
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

/*è·åCheckBoxç»éä¸­å¼ flag åå²ç¬¦*/
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

/*è·åCheckBoxç»éä¸­å¼ flag åå²ç¬¦*/
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


/*è·åCheckBoxç»éä¸­id  flag åå²ç¬¦*/
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

/*è·åCheckBoxç»éä¸­_tag flag åå²ç¬¦*/
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


//æä»¶ä¸è½½ï¼ajaxè¯·æ±æå¡ç«¯åå¤æä»¶ï¼å®æåç±é¡µé¢è¯·æ±è·å¾æä»¶ï¼
//è¦æ±æä»¶åä¸è½åå«ç¹æ®å­ç¬¦ï¼ä¸ä¼ æ¶æ£æ¥ï¼å¦åå¨æ­¤æ¹æ³ä¸­æ¿æ¢ï¼
//file_no:æä»¶file_no
//file_name:æä»¶åç§°
//model:ç³»ç»æ¨¡å
//zip_name:åç¼©åçåç§°
//zip_pwdï¼åç¼©åçå¯ç 
//type:Ozipï¼RQzip
//childpath:å­æä»¶ç®å½
function DownLoad(file_no, file_name, model, zip_name, zip_pwd, type, childpath, cur_page_name) {
    if (cur_page_name != "FileApproval.aspx") {
        var isApproval = true;
        if (GetPublishConfig('FileUpload', 'is_not_approval')) {
            //æä»¶éè¦å®¡æ¹éç½®
            var success = function (_Meta) {
                if (_Meta.flag) {
                    isApproval = _Meta.flag == "True" ? true : false;
                }
            }
            Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
        }
        if (!isApproval) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è´¦å·ä¿å¯ç­çº§ä¸è¶³æå­å¨æä»¶æªéè¿å®¡æ¹ï¼ä¸å¯ä¸è½½ï¼'), null, { icon: 'hits.gif' });
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
            // Box.Alert(GRESX.HINTS.TITLE, GetResource('S140823184840620', 'æä»¶ä¸è½½å¤±è´¥ï¼'), null, { icon: 'hits.gif' });
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: "DownLoad", file_no: file_no, file_name: file_name, zip_name: zip_name, zip_pwd: zip_pwd, down_type: type, model: model, childpath: childpath }, success);
}

//æä»¶ä¸è½½ï¼ajaxè¯·æ±æå¡ç«¯åå¤æä»¶ï¼å®æåç±é¡µé¢è¯·æ±è·å¾æä»¶ï¼
//è¦æ±æä»¶åä¸è½åå«ç¹æ®å­ç¬¦ï¼ä¸ä¼ æ¶æ£æ¥ï¼å¦åå¨æ­¤æ¹æ³ä¸­æ¿æ¢ï¼
//file_no:æä»¶file_no
//file_name:æä»¶åç§°
//zip_name:åç¼©åçåç§°
//model:ç³»ç»æ¨¡å
function DownLoadZip(file_no, file_name, model, zip_name) {
    var isApproval = true;
    if (GetPublishConfig('FileUpload', 'is_not_approval')) {
        //æä»¶éè¦å®¡æ¹éç½®
        var success = function (_Meta) {
            if (_Meta.flag) {
                isApproval = _Meta.flag == "True" ? true : false;
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
    }
    if (!zip_name) {
        zip_name = "éäº¤å";
    }
    if (!isApproval) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è´¦å·ä¿å¯ç­çº§ä¸è¶³æå­å¨æä»¶æªéè¿å®¡æ¹ï¼ä¸å¯ä¸è½½ï¼'), null, { icon: 'hits.gif' });
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

//jsè·åwebconfigéç½®çå¼  _config web.configä¸­çéç½®åæ°
$.GetWebConfigValue = function (_config) {
    var _value;
    function Success(_Meta) {
        _value = _Meta.value;
    }
    Ajax.Request('Common.ashx', { Call: 'GetWebConfigValue', config: _config }, Success, true);

    return _value;
}

//æä»¶ä¸è½½ï¼ajaxè¯·æ±æå¡ç«¯åå¤æä»¶ï¼å®æåç±é¡µé¢è¯·æ±è·å¾æä»¶ï¼
//è¦æ±æä»¶åä¸è½åå«ç¹æ®å­ç¬¦ï¼ä¸ä¼ æ¶æ£æ¥ï¼å¦åå¨æ­¤æ¹æ³ä¸­æ¿æ¢ï¼
function DownLoadFiles(file_no, file_name, zip_name, zip_pwd, type, model) {
    var isApproval = true;
    if (GetPublishConfig('FileUpload', 'is_not_approval')) {
        //æä»¶éè¦å®¡æ¹éç½®
        var success = function (_Meta) {
            if (_Meta.flag) {
                isApproval = _Meta.flag == "True" ? true : false;
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
    }
    if (!isApproval) {
        Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è´¦å·ä¿å¯ç­çº§ä¸è¶³æå­å¨æä»¶æªéè¿å®¡æ¹ï¼ä¸å¯ä¸è½½ï¼'), null, { icon: 'hits.gif' });
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
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S140823184840620', 'æä»¶ä¸è½½å¤±è´¥ï¼'), null, { icon: 'hits.gif' });
            }
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: "DownLoadFiles", file_no: file_no, file_name: file_name, zip_name: zip_name, zip_pwd: zip_pwd, down_type: type, model: model }, success);
}

function ViewFilePF(file_no, file_name, model, case_id, proc_id, file_desc_code) {
    var success = function (data) {

        if (data.ClientInfo.Result) {
            $.dialog({
                title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no,
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


//é¢è§éä»¶
//file_no:æä»¶file_no
//file_name:æä»¶åç§°
//model :ç³»ç»æ¨¡å
function ViewFile(file_no, file_name, model, case_id, proc_id, file_desc_code, isDownLoad, cur_page_name) {
    var ViewUrl = GetPublishConfigValueFn('ViewAll', 'is_new_view');
    if (ViewUrl && file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
        && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".xls") < 0 && file_name.toLowerCase().indexOf(".eml") < 0) {
        ViewFileAll(file_no, file_name, ViewUrl);
    } else {
        if (cur_page_name != "FileApproval.aspx") {
            //å®¡æ ¸é¡µé¢ä¸éè¦æ ¡éªåè½¬æ¡£é¡µé¢ä¸éè¦å®¡æ¹
            var isApproval = true;
            if (GetPublishConfig('FileUpload', 'is_not_approval')) {
                //æä»¶éè¦å®¡æ¹éç½®
                var success = function (_Meta) {
                    if (_Meta.flag) {
                        isApproval = _Meta.flag == "True" ? true : false;
                    }
                }
                Ajax.Request("CaseInfo.ashx", { Call: "GetApprovalByFileNo", file_no: file_no }, success, true);
            }
            if (!isApproval) {
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è´¦å·ä¿å¯ç­çº§ä¸è¶³æè¯¥æä»¶æªéè¿å®¡æ¹ï¼ä¸å¯é¢è§ï¼'), null, { icon: 'hits.gif' });
                return;
            }
        }
        if (GetPublishConfig('ViewPdf', 'is_new_view')) {
            ViewFilePDF(file_no, file_name, model, case_id, proc_id, file_desc_code, isDownLoad, cur_page_name)
        } else {
            if (file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
                && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".eml") < 0 && file_name.toLowerCase().indexOf(".xls") < 0) {
                Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿é¢è§ï¼ç´æ¥ä¸è½½ï¼'), function () { DownLoad(file_no, file_name, model, '', '', '', '', cur_page_name) }, { icon: 'hits.gif', width: '300' }, null);
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

                    //var url = GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + $.trim(data.guid) + '/' + $.trim(data.filename); //è½¬åç½é¡µçå°å;

                    //var name = '';                            //ç½é¡µåç§°ï¼å¯ä¸ºç©º;
                    //var iWidth = 960;                          //å¼¹åºçªå£çå®½åº¦;
                    //var iHeight = 700;                         //å¼¹åºçªå£çé«åº¦;
                    ////è·å¾çªå£çåç´ä½ç½®
                    //var iTop = (window.screen.availHeight - 30 - iHeight) / 2;
                    ////è·å¾çªå£çæ°´å¹³ä½ç½®
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
                            title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height - 180,
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
                                        //ä¸è½ä¸è½½ç§»é¤ä¸è½½æé®
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
                        // å¾ççé¢è§
                        var myheight = window.screen.height - 240;
                        var imgId = "img_show_" + file_no;

                        opener.$.dialog({
                            title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
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

                        // å¾çç¼©æ¾
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
                                //å¤æ­ imgå¯¹åºæ¯å¦å­å¨
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

                                // é¿å®½ é½è¶åºdiv
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
                            title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
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
                    // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿æµè§å¨'), null, { icon: 'hits.gif' });
                    Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿é¢è§ï¼ç´æ¥ä¸è½½ï¼'), function () {
                        if (isDownLoad == false) {
                            Box.Alert(GRESX.HINTS.TITLE, GetResource('S150120171030232', 'æ²¡æä¸è½½æéï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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

//é¢è§éä»¶
//file_no:æä»¶file_no
//file_name:æä»¶åç§°
//model :ç³»ç»æ¨¡å
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
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿é¢è§ï¼ç´æ¥ä¸è½½ï¼'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
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
                //var url = GUrl + '/Ihgforms/ViewFile.aspx?file=../TempFile/SWFFile/' + $.trim(data.guid) + '/' + $.trim(data.filename); //è½¬åç½é¡µçå°å;

                //var name = '';                            //ç½é¡µåç§°ï¼å¯ä¸ºç©º;
                //var iWidth = 960;                          //å¼¹åºçªå£çå®½åº¦;
                //var iHeight = 700;                         //å¼¹åºçªå£çé«åº¦;
                ////è·å¾çªå£çåç´ä½ç½®
                //var iTop = (window.screen.availHeight - 30 - iHeight) / 2;
                ////è·å¾çªå£çæ°´å¹³ä½ç½®
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
                        title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height / 2 - 100,
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
                    // å¾ççé¢è§
                    var myheight = window.screen.height - 240;
                    var imgId = "img_show_" + file_no;

                    opener.$.dialog({
                        title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
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

                    // å¾çç¼©æ¾
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
                            //å¤æ­ imgå¯¹åºæ¯å¦å­å¨
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

                            // é¿å®½ é½è¶åºdiv
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
                        title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
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
                // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿æµè§å¨'), null, { icon: 'hits.gif' });
                Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160628140158820', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿æµè§å¨ï¼ç´æ¥ä¸è½½ï¼'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
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
                    title: GetResource('S141203210137300', 'é¢è§') + "â" + data.filename, id: "Preview_" + data.guid, width: w_width, height: window.screen.height - 300,
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
                // å¾ççé¢è§
                var myheight = window.screen.height - 240;
                var imgId = "img_show_" + data.filename;

                opener.$.dialog({
                    title: GetResource('S141203210137300', 'é¢è§') + "â" + data.filename, id: "Preview_" + data.guid, width: 980, height: myheight,
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

                // å¾çç¼©æ¾
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
                        //å¤æ­ imgå¯¹åºæ¯å¦å­å¨
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

                        // é¿å®½ é½è¶åºdiv
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
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160628140158820', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿æµè§å¨ï¼ç´æ¥ä¸è½½ï¼'), function () {

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



//é¢è§éä»¶
//file_no:æä»¶file_no
//file_name:æä»¶åç§°
//model :ç³»ç»æ¨¡å
function ViewFilePDF(file_no, file_name, model, case_id, proc_id, file_desc_code, isDownLoad, cur_page_name) {
    //if (file_name.indexOf(".doc") > 0 || file_name.indexOf(".docx") > 0) {
    //    //DownLoad(file_no, file_name, model);

    //    return;
    //}
    if (file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
        && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".eml") < 0 && file_name.toLowerCase().indexOf(".xls") < 0) {
        Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿é¢è§ï¼ç´æ¥ä¸è½½ï¼'), function () { DownLoad(file_no, file_name, model, '', '', '', '', cur_page_name) }, { icon: 'hits.gif', width: '300' }, null);
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
                    title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height - 180,
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
                                //ç§»é¤æµè§å¨åç½®ä¸è½½toolbar
                                context.src += '#toolbar=0';
                                //ä¸è½ä¸è½½ ç§»é¤ä¸è½½æºæä»¶æé®
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
                // å¾ççé¢è§
                var myheight = window.screen.height - 240;
                var imgId = "img_show_" + file_no;

                opener.$.dialog({
                    title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
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

                // å¾çç¼©æ¾
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
                        //å¤æ­ imgå¯¹åºæ¯å¦å­å¨
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

                        // é¿å®½ é½è¶åºdiv
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
                    title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
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
            // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿æµè§å¨'), null, { icon: 'hits.gif' });
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿é¢è§ï¼ç´æ¥ä¸è½½ï¼'), function () {
                if (isDownLoad == false) {
                    Box.Alert(GRESX.HINTS.TITLE, GetResource('S150120171030232', 'æ²¡æä¸è½½æéï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
                DownLoad(file_no, file_name, model)
            }, { icon: 'hits.gif', width: '300' }, null);
        }
    }
    Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name, model: model }, success);

}

//é¢è§éä»¶
//file_no:æä»¶file_no
//file_name:æä»¶åç§°
//model :ç³»ç»æ¨¡å
function ViewFilePDFNew(file_no, file_name, model, case_id, proc_id, file_desc_code) {
    //if (file_name.indexOf(".doc") > 0 || file_name.indexOf(".docx") > 0) {
    //    //DownLoad(file_no, file_name, model);

    //    return;
    //}
    if (file_name.toLowerCase().indexOf(".png") < 0 && file_name.toLowerCase().indexOf(".jpg") < 0 && file_name.toLowerCase().indexOf(".jpeg") < 0 && file_name.toLowerCase().indexOf(".gif") < 0
        && file_name.toLowerCase().indexOf(".bmp") < 0 && file_name.toLowerCase().indexOf(".doc") < 0 && file_name.toLowerCase().indexOf(".pdf") < 0 && file_name.toLowerCase().indexOf(".xls") < 0) {
        Box.Confirm(GRESX.HINTS.TITLE, GetResource('S170721085507153', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿é¢è§ï¼ç´æ¥ä¸è½½ï¼'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
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
                    title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: w_width, height: window.screen.height / 2,
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
                // å¾ççé¢è§
                var myheight = window.screen.height - 240;
                var imgId = "img_show_" + file_no;

                opener.$.dialog({
                    title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: myheight,
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

                // å¾çç¼©æ¾
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
                        //å¤æ­ imgå¯¹åºæ¯å¦å­å¨
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

                        // é¿å®½ é½è¶åºdiv
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
                title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 180,
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
            // Box.Alert(GRESX.HINTS.TITLE, GetResource('S150324142537667', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿æµè§å¨'), null, { icon: 'hits.gif' });
            Box.Confirm(GRESX.HINTS.TITLE, GetResource('S160628140158820', 'è¯¥æä»¶ç±»åä¸æ¯æå¨çº¿æµè§å¨ï¼ç´æ¥ä¸è½½ï¼'), function () { DownLoad(file_no, file_name, model) }, { icon: 'hits.gif', width: '300' }, null);
        }
    }
    Ajax.Request("Common.ashx", { Call: "ViewOnLine", file_no: file_no, file_name: file_name, model: model }, success);

}

function WordToPdf(file_no, file_name, model) {


}

//å¢å å¨å¹³å°æä»¶é¢è§åè½
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
                title: GetResource('S141203210137300', 'é¢è§') + "â" + file_name, id: "Preview_" + file_no, width: 980, height: window.screen.height - 200,
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
    // å¾ççé¢è§
    var myheight = window.screen.height - 240;
    var imgId = "img_show_" + id;

    opener.$.dialog({
        title: GetResource('S141203210137300', 'é¢è§') + "â" + imgId, id: "Preview_" + id, width: 980, height: myheight,
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

    // å¾çç¼©æ¾
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

            // é¿å®½ é½è¶åºdiv
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

//ä¼ è¾æä»¶ï¼åæ¬çäº§excelç­å®ä½æä»¶åè¿è¡å¯¼åºçå¤çï¼file_sizeä¸ºéå¿å¡«é¡¹ï¼
function GetFileNew(guid, file_size, file_type) {
    if (top.window.GUrl) {
        var ifr = top.window.document.getElementById("iFile");
        ifr.src = "AjaxServers/FileHandlerNew.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    }
}


//ä¼ è¾æä»¶ï¼åæ¬çäº§excelç­å®ä½æä»¶åè¿è¡å¯¼åºçå¤çï¼file_sizeä¸ºéå¿å¡«é¡¹ï¼
function GetFile(guid, file_size, file_type) {
    if (top.window.GUrl) {
        var ifr = top.window.document.getElementById("iFile");
        ifr.src = "AjaxServers/FileHandler.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    }
}

//ä¼ è¾æä»¶ï¼åæ¬çäº§excelç­å®ä½æä»¶åè¿è¡å¯¼åºçå¤çï¼file_sizeä¸ºéå¿å¡«é¡¹ï¼
function GetFiles(guid, file_size, file_type) {
    if (top.window.GUrl) {
        var ifr = top.window.document.getElementById("iFile");
        ifr.src = "AjaxServers/FileHandler.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    }
}

//ä¸è½½æä»¶ï¼æ°çªå£ï¼
function GetFileNewWindow(guid, file_size, file_type) {
    var src = top.window.GUrl + "/AjaxServers/FileHandler.ashx?guid=" + guid + (file_size ? "&file_size=" + file_size : "") + (file_type ? "&file_type=" + file_type : "");
    window.open(src, "_blank");
}

//è®¾å®è¡éä¸­çèæ¯è²
function SetClickTrCSS(_tr, _style) {
    if (_style) {
        $(_tr).attr("style", _style).siblings().attr("style", "");
    }
    else {
        $(_tr).attr("style", "background-color:#ccc ; ").siblings().attr("style", "");
    }
}

//éèæèæ¾ç¤ºæä¸ªåç´ 
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
//éèæèæ¾ç¤ºæä¸ªåç´ 
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

//éèæèæ¾ç¤ºæä¸ªåç´  æ ·å¼ä¸ä¸æ ·
function ShowHide(_this, _obj_id, _obj_id2) {

    if ($("#" + _obj_id).is(":hidden")) {
        $(_this).attr("title", GetResource('S140929141518276', 'ç¹å»éè'));
        $(_this).attr("class", "img_show");
    }
    else {
        $(_this).attr("title", GetResource('S140929141358903', 'ç¹å»æ¾ç¤º'));
        $(_this).attr("class", "img_hide");
    }
    $("#" + _obj_id).slideToggle(600);
    if (_obj_id2) {
        $("#" + _obj_id2).slideToggle(600);
    }
}

//ç»å®ä¸ææ¡çå¬å±æ¹æ³
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
//è¿åèªå¨é®ä»¶å°åæç¤ºå½æ°
$.AutoMailParas = function () {
    return ['163.com', 'qq.com', '126.com', 'sina.com', 'sohu.com', 'yahoo.cn', 'gmail.com', 'hotmail.com', 'live.cn'];

}

//å¤æ­èº«ä»½è¯å·æ¯å¦æ¯15ä½æè18ä½
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
    var Errors = new Array("true", "èº«ä»½è¯å·ç ä½æ°ä¸å¯¹!", "èº«ä»½è¯å·ç åºçæ¥æè¶åºèå´æå«æéæ³å­ç¬¦!", "èº«ä»½è¯å·ç æ ¡éªéè¯¯!", "èº«ä»½è¯å°åºéæ³!");
    var area = {
        11: "åäº¬", 12: "å¤©æ´¥", 13: "æ²³å", 14: "å±±è¥¿", 15: "åèå¤", 21: "è¾½å®", 22: "åæ", 23: "é»é¾æ±", 31: "ä¸æµ·", 32: "æ±è", 33: "æµæ±",
        34: "å®å¾½", 35: "ç¦å»º", 36: "æ±è¥¿", 37: "å±±ä¸", 41: "æ²³å", 42: "æ¹å", 43: "æ¹å", 44: "å¹¿ä¸", 45: "å¹¿è¥¿", 46: "æµ·å", 50: "éåº", 51: "åå·",
        52: "è´µå·", 53: "äºå", 54: "è¥¿è", 61: "éè¥¿", 62: "çè", 63: "éæµ·", 64: "å®å¤", 65: "xinjiang", 71: "å°æ¹¾", 81: "é¦æ¸¯", 82: "æ¾³é¨", 91: "å½å¤"
    }
    var Y, JYM;
    var S, M;
    var idcard_array = new Array();
    idcard_array = idcard.split("");
    if (area[parseInt(idcard.substr(0, 2))] == null) return Errors[4];
    switch (idcard.length) {
        case 15:
            if ((parseInt(idcard.substr(6, 2)) + 1900) % 4 == 0 || ((parseInt(idcard.substr(6, 2)) + 1900) % 100 == 0 && (parseInt(idcard.substr(6, 2)) + 1900) % 4 == 0)) {
                ereg = /^[1-9][0-9]{5}[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|[1-2][0-9]))[0-9]{3}$/; //æµè¯åºçæ¥æçåæ³æ§
            }
            else {
                ereg = /^[1-9][0-9]{5}[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|1[0-9]|2[0-8]))[0-9]{3}$/; //æµè¯åºçæ¥æçåæ³æ§
            }
            if (ereg.test(idcard))
                return Errors[0];
            else
                return Errors[2];
            break;
        case 18:
            if (parseInt(idcard.substr(6, 4)) % 4 == 0 || (parseInt(idcard.substr(6, 4)) % 100 == 0 && parseInt(idcard.substr(6, 4)) % 4 == 0)) {
                ereg = /^[1-9][0-9]{5}19[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|[1-2][0-9]))[0-9]{3}[0-9Xx]$/; //é°å¹´åºçæ¥æçåæ³æ§æ­£åè¡¨è¾¾å¼
            }
            else {
                ereg = /^[1-9][0-9]{5}19[0-9]{2}((01|03|05|07|08|10|12)(0[1-9]|[1-2][0-9]|3[0-1])|(04|06|09|11)(0[1-9]|[1-2][0-9]|30)|02(0[1-9]|1[0-9]|2[0-8]))[0-9]{3}[0-9Xx]$/; //å¹³å¹´åºçæ¥æçåæ³æ§æ­£åè¡¨è¾¾å¼
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
    var Wi = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2, 1];    // å æå å­
    var ValideCode = [1, 0, 10, 9, 8, 7, 6, 5, 4, 3, 2];            // èº«ä»½è¯éªè¯ä½å¼.10ä»£è¡¨X
    /**
     * å¤æ­èº«ä»½è¯å·ç ä¸º18ä½æ¶æåçéªè¯ä½æ¯å¦æ­£ç¡®
     * @param a_idCard èº«ä»½è¯å·ç æ°ç»
     * @return
     */
    function isTrueValidateCodeBy18IdCard(a_idCard) {
        var sum = 0;                             // å£°æå ææ±ååé
        if (a_idCard[17].toLowerCase() == 'x') {
            a_idCard[17] = 10;                    // å°æåä½ä¸ºxçéªè¯ç æ¿æ¢ä¸º10æ¹ä¾¿åç»­æä½
        }
        for (var i = 0; i < 17; i++) {
            sum += Wi[i] * a_idCard[i];            // å ææ±å
        }
        valCodePosition = sum % 11;                // å¾å°éªè¯ç æä½ç½®
        if (a_idCard[17] == ValideCode[valCodePosition]) {
            return true;
        } else {
            return false;
        }
    }
    /**
      * éªè¯18ä½æ°èº«ä»½è¯å·ç ä¸­ççæ¥æ¯å¦æ¯ææçæ¥
      * @param idCard 18ä½ä¹¦èº«ä»½è¯å­ç¬¦ä¸²
      * @return
      */
    function isValidityBrithBy18IdCard(idCard18) {
        var year = idCard18.substring(6, 10);
        var month = idCard18.substring(10, 12);
        var day = idCard18.substring(12, 14);
        var temp_date = new Date(year, parseFloat(month) - 1, parseFloat(day));
        // è¿éç¨getFullYear()è·åå¹´ä»½ï¼é¿ååå¹´è«é®é¢
        if (temp_date.getFullYear() != parseFloat(year)
            || temp_date.getMonth() != parseFloat(month) - 1
            || temp_date.getDate() != parseFloat(day)) {
            return false;
        } else {
            return true;
        }
    }
    /**
     * éªè¯15ä½æ°èº«ä»½è¯å·ç ä¸­ççæ¥æ¯å¦æ¯ææçæ¥
     * @param idCard15 15ä½ä¹¦èº«ä»½è¯å­ç¬¦ä¸²
     * @return
     */
    function isValidityBrithBy15IdCard(idCard15) {
        var year = idCard15.substring(6, 8);
        var month = idCard15.substring(8, 10);
        var day = idCard15.substring(10, 12);
        var temp_date = new Date(year, parseFloat(month) - 1, parseFloat(day));
        // å¯¹äºèèº«ä»½è¯ä¸­çä½ å¹´é¾åä¸éèèåå¹´è«é®é¢èä½¿ç¨getYear()æ¹æ³
        if (temp_date.getYear() != parseFloat(year)
            || temp_date.getMonth() != parseFloat(month) - 1
            || temp_date.getDate() != parseFloat(day)) {
            return false;
        } else {
            return true;
        }
    }
    //å»æå­ç¬¦ä¸²å¤´å°¾ç©ºæ ¼
    function trim(str) {
        return str.replace(/(^\s*)|(\s*$)/g, "");
    }

    idCard = trim(idCard.replace(/ /g, ""));               //å»æå­ç¬¦ä¸²å¤´å°¾ç©ºæ ¼
    if (idCard.length == 15) {
        return isValidityBrithBy15IdCard(idCard);       //è¿è¡15ä½èº«ä»½è¯çéªè¯
    } else if (idCard.length == 18) {
        var a_idCard = idCard.split("");                // å¾å°èº«ä»½è¯æ°ç»
        if (isValidityBrithBy18IdCard(idCard) && isTrueValidateCodeBy18IdCard(a_idCard)) {   //è¿è¡18ä½èº«ä»½è¯çåºæ¬éªè¯åç¬¬18ä½çéªè¯
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

//æ©å±javascriptå¯¹è±¡æ¹æ³ãå±æ§
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

//éæ©åè¡¨
//titleï¼å¼¹åºçªæ é¢ï¼ datalistï¼éæ©åè¡¨åæ°ï¼ajaxè·åæ¹æ³åè¡¨æ ¼æ ä½ä¿¡æ¯ï¼
//ï¼resultï¼éæ©ç»æåæ°(ç»ææ°ç»æajaxè·åæ¹æ³) ï¼successï¼æäº¤åè°å½æ°ï¼è¿åç»ææ°ç»ï¼, basedata: éè¦å¢å çåºç¡æ°æ®, ihgWidth: å¼¹æ¡å®½åº¦ï¼ihgHeight ï¼å¼¹æ¡é«åº¦
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
        close: function () {/*å¼¹åºæ¡(ç¹å«æ¯å¬å±æ¹æ³)çå³é­æ¹æ³æå¥½ä½¿ç¨tryæè·å¼å¸¸è¿åtrue,é¿åå ä¸ºä¸å¯ç¥çjså¼å¸¸å¯¼è´ç¨æ·æ æ³æ­£å¸¸å³é­çªå£*/
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
//éæ©åè¡¨   è¿ä¸ªé¡µé¢æ¯åªæç¹å»æ¥è¯¢æé® å¼æä¼åå
//titleï¼å¼¹åºçªæ é¢ï¼ datalistï¼éæ©åè¡¨åæ°ï¼ajaxè·åæ¹æ³åè¡¨æ ¼æ ä½ä¿¡æ¯ï¼
//ï¼resultï¼éæ©ç»æåæ°(ç»ææ°ç»æajaxè·åæ¹æ³) ï¼successï¼æäº¤åè°å½æ°ï¼è¿åç»ææ°ç»ï¼, basedata: éè¦å¢å çåºç¡æ°æ®
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
        close: function () {/*å¼¹åºæ¡(ç¹å«æ¯å¬å±æ¹æ³)çå³é­æ¹æ³æå¥½ä½¿ç¨tryæè·å¼å¸¸è¿åtrue,é¿åå ä¸ºä¸å¯ç¥çjså¼å¸¸å¯¼è´ç¨æ·æ æ³æ­£å¸¸å³é­çªå£*/
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

//ç¼è¾äº§åçªå£
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
        close: function () {/*å¼¹åºæ¡(ç¹å«æ¯å¬å±æ¹æ³)çå³é­æ¹æ³æå¥½ä½¿ç¨tryæè·å¼å¸¸è¿åtrue,é¿åå ä¸ºä¸å¯ç¥çjså¼å¸¸å¯¼è´ç¨æ·æ æ³æ­£å¸¸å³é­çªå£*/
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


//éæ©åè¡¨
//titleï¼å¼¹åºçªæ é¢ï¼ datalistï¼éæ©åè¡¨åæ°ï¼ajaxè·åæ¹æ³åè¡¨æ ¼æ ä½ä¿¡æ¯ï¼ï¼resultï¼éæ©ç»æåæ°(ç»ææ°ç»æajaxè·åæ¹æ³)ï¼successï¼æäº¤åè°å½æ°ï¼è¿åç»ææ°ç»ï¼
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
        close: function () {/*å¼¹åºæ¡(ç¹å«æ¯å¬å±æ¹æ³)çå³é­æ¹æ³æå¥½ä½¿ç¨tryæè·å¼å¸¸è¿åtrue,é¿åå ä¸ºä¸å¯ç¥çjså¼å¸¸å¯¼è´ç¨æ·æ æ³æ­£å¸¸å³é­çªå£*/
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


//æµç¨å¤çï¼obj_idï¼å¤çå¯¹è±¡idï¼ flow_typeï¼æµç¨ç±»åï¼flow_sub_typeï¼æµç¨å­ç±»åï¼ ajax_configï¼æå®æµç¨æäº¤çå¤çæ¹æ³åèªå®ä¹ä¼ å°åå°çåæ°ï¼call_bakï¼æµç¨æäº¤æåååå°åè°å½æ°ï¼close_backï¼å¯éï¼ï¼æäº¤çªå£å³é­æ¶è§¦å
//call_bak è¿ååæ°f_audit_type_id åå«noflowï¼æ æµç¨ï¼ãsubmitï¼æäº¤æåï¼
function FlowSubmit(obj_id, flow_type, flow_sub_type, ajax_config, call_back, close_back) {

    var success = function (data) {
        switch (data.Result.status) {
            //æ è®°å½
            case -1:
                {
                    //æ æµç¨
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', 'æ æµç¨ï¼ç´æ¥æäº¤ï¼'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //å·²å®æ
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', 'æµç¨å·²å®æï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            //å½åæäº¤äººä¸æ¯æµç¨åè¡¨éæéç½®çäºº
            case 99999:
                {
                    //è±åååå®å¶ å¦ææ¯ç®¡çåçè¯ï¼å¯¹codeä¸åå¤ç å¯ä»¥å¼¹çª
                    if (GetPublishConfig("YCJY", "202511")){
                        if(top.window._UserModel.RoleCode.toUpperCase().indexOf("REPORT") >= 0){
                            break;
                        }else{
                            Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', 'å½åæäº¤äººä¸æ¯æµç¨éæéç½®çäººï¼è¯·å¿åä¸ä¸ªæµè§å¨ç»å½å¤ä¸ªç¨æ·ï¼è¯·éåºéæ°ç»å½è´¦å·åè¯ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                            return;
                        }
                    }else{
                        Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', 'å½åæäº¤äººä¸æ¯æµç¨éæéç½®çäººï¼è¯·å¿åä¸ä¸ªæµè§å¨ç»å½å¤ä¸ªç¨æ·ï¼è¯·éåºéæ°ç»å½è´¦å·åè¯ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
                        Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', 'æ¨ä¸æ¯å½åæµç¨åçäººåï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
            id: id, title: GetResource('S140915093746548', 'æµç¨æäº¤'),
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
            // close_back ç±è°ç¨æ¹æéä¼ å¥ï¼å¦éå¨çªå£å³é­æ¶åæ»ï¼ï¼ä¸ä¼ åæ å¯ä½ç¨
            close: close_back || undefined
        });

    }
    Ajax.Request("Common.ashx", { Call: "GetFlowInfo", obj_id: obj_id, flow_type: flow_type, flow_sub_type: flow_sub_type }, success);
}



//æµç¨å¤çï¼obj_idï¼å¤çå¯¹è±¡idï¼ flow_typeï¼æµç¨ç±»åï¼flow_sub_typeï¼æµç¨å­ç±»åï¼ ajax_configï¼æå®æµç¨æäº¤çå¤çæ¹æ³åèªå®ä¹ä¼ å°åå°çåæ°ï¼call_bakï¼æµç¨æäº¤æåååå°åè°å½æ°
//call_bak è¿ååæ°f_audit_type_id åå«noflowï¼æ æµç¨ï¼ãsubmitï¼æäº¤æåï¼ call_pre ç¹å»ç¡®è®¤æ¶çåç½®å½æ°
function FlowSubmitPre(obj_id, flow_type, flow_sub_type, ajax_config, call_back,call_pre) {

    var success = function (data) {
        switch (data.Result.status) {
            //æ è®°å½
            case -1:
                {
                    //æ æµç¨
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', 'æ æµç¨ï¼ç´æ¥æäº¤ï¼'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //å·²å®æ
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', 'æµç¨å·²å®æï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            //å½åæäº¤äººä¸æ¯æµç¨åè¡¨éæéç½®çäºº
            case 99999:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', 'å½åæäº¤äººä¸æ¯æµç¨éæéç½®çäººï¼è¯·å¿åä¸ä¸ªæµè§å¨ç»å½å¤ä¸ªç¨æ·ï¼è¯·éåºéæ°ç»å½è´¦å·åè¯ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }

            default:
                {
                    if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                        break;
                    }
                    //if (data.Result.cur_user_id != top.window._UserModel.user_id) {
                    if (data.Result.cur_user_id.indexOf(top.window._UserModel.user_id) == -1) {
                        Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', 'æ¨ä¸æ¯å½åæµç¨åçäººåï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
            id: id, title: GetResource('S140915093746548', 'æµç¨æäº¤'),
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

//æµç¨å¤çï¼obj_idï¼å¤çå¯¹è±¡idï¼ flow_typeï¼æµç¨ç±»åï¼flow_sub_typeï¼æµç¨å­ç±»åï¼ ajax_configï¼æå®æµç¨æäº¤çå¤çæ¹æ³åèªå®ä¹ä¼ å°åå°çåæ°ï¼call_bakï¼æµç¨æäº¤æåååå°åè°å½æ°
//call_bak è¿ååæ°f_audit_type_id åå«noflowï¼æ æµç¨ï¼ãsubmitï¼æäº¤æåï¼
function FlowSubmitHz(obj_id, flow_type, flow_sub_type, ajax_config, call_back) {

    var success = function (data) {
        switch (data.Result.status) {
            //æ è®°å½
            case -1:
                {
                    //æ æµç¨
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', 'æ æµç¨ï¼ç´æ¥æäº¤ï¼'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //å·²å®æ
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', 'æµç¨å·²å®æï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }
            //å½åæäº¤äººä¸æ¯æµç¨åè¡¨éæéç½®çäºº
            case 99999:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 10, GetResource('S210915180316358', 'å½åæäº¤äººä¸æ¯æµç¨éæéç½®çäººï¼è¯·å¿åä¸ä¸ªæµè§å¨ç»å½å¤ä¸ªç¨æ·ï¼è¯·éåºéæ°ç»å½è´¦å·åè¯ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                    return;
                }

            default:
                {
                    if ("undefined" != typeof metadata && "undefined" != typeof metadata.auth_list && metadata.auth_list.indexOf('audit') > -1) {
                        break;
                    }
                    //if (data.Result.cur_user_id != top.window._UserModel.user_id) {
                    if (data.Result.cur_user_id.indexOf(top.window._UserModel.user_id) == -1) {
                        Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', 'æ¨ä¸æ¯å½åæµç¨åçäººåï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                        return;
                    }
                    break;
                }
        }

        var id = "ihg_" + obj_id;
        var opener = top.window;

        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', 'æµç¨æäº¤'),
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
            //æ è®°å½
            case -1:
                {
                    //æ æµç¨
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', 'æ æµç¨ï¼ç´æ¥æäº¤ï¼'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //å·²å®æ
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', 'æµç¨å·²å®æï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
                            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', 'æ¨ä¸æ¯å½åæµç¨åçäººåï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
            id: id, title: GetResource('S140915093746548', 'æµç¨æäº¤'),
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


//éå
function FlowReject(obj_id, ajax_config, call_back) {

    var id = "ihg_" + obj_id;
    var opener = top.window;
    opener.$.dialog({
        id: id, title: GetResource('S140917194151172', 'æµç¨éå'),
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

//ç§»äº¤
function FlowHandover(obj_id, ajax_config, call_back) {

    var success = function (data) {
        if (!data.Result) {
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S170721085703595', 'å½åæµç¨è¿æªæäº¤ä¸è½ç§»äº¤'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        if (data.Result.status == 5000) {
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S151021150346162', 'æµç¨å·²å®æï¼ä¸è½ç§»äº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        else if (data.Result.status == 0) {
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S151021150505800', 'æµç¨å¨å¯å¨æµç¨é¶æ®µï¼ä¸è½ç§»äº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
            return;
        }
        var id = "ihg_" + obj_id;
        var opener = top.window;
        opener.$.dialog({
            id: id, title: GetResource('S140915093746548', 'æµç¨æäº¤'),
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

//æµç¨æ¤å.åæ°è¯´æ{obj_id:å¤çå¯¹è±¡id,ajax_config:èªå®ä¹åæ°å¯¹è±¡,åæ¬éè¦è¯·æ±æ¹æ³,è¯·æ±è·¯å¾,è¯·æ±åæ°ç­,åè§eg,call_back:åè°å½æ°},
//eg:FlowWithdraw('123', {Call:"egCall",handler:"PatentAction.ashx",...}, call_back)
//obj_idä¸ºå¿é¡»åæ°,å¶å®åæ°åä¸ºå¯éé¡¹
function FlowWithdraw(obj_id, ajax_config, call_back) {
    function Finish(input) {
        var remark = input.value.trim();
        if (!remark) {
            //alert("æ¤ååå ä¸è½ä¸ºç©º");
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S160929143440505', 'æ¤ååå ä¸è½ä¸ºç©º'), null, { icon: 'hits.gif', width: '150' });
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
                Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S170721085739754', 'æµç¨å·²ç»æåæ¤å'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
        title: GetResource('S170721085753111', 'è¯·è¾å¥æ¤ååå '),
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

//è·å¾æµç¨åçåå²ï¼åè°å½æ°è¿åå½åæµç¨ä¿¡æ¯
// æ¹è¿ª KLFD/202601ï¼ãæµç¨æ­¥éª¤åå®¹æè¿°ãåï¼flow_step_remarkï¼ç½®äºæåä¸åï¼ä»å½åå¸é¡¹ KLFD/202601 å¼å¯æ¶æ¾ç¤ºï¼åå®½å å®½è§ td_400
function GetFlowHistory(obj_id, table_id, call_back) {
    var isKFDL = false;
    if (GetPublishConfig("KLFD", "202506-2")) {
        isKFDL = true;
    }

    var showFlowStepRemark = GetPublishConfig("KLFD", "202601");

    var user_id = top.window._UserModel.user_id;
    var is_flow_user = false;
    var is_create_user = false;

    //æé®
    $("#btn_addremark").off("click").on("click", function () {
        AddFlowRemark(obj_id, table_id, null);
    });

    var success = function (data) {

        var html = "<thead><tr>"
            + "<td class='td_60'>" + GetResource('S140808093333235', 'åºå·') + "</td>"
            + "<td class='td_150'>" + GetResource('S140922133451105', 'æµç¨é¶æ®µ') + "</td>"
            + "<td class='td_150'>" + GetResource('S140903112755186', 'åçäººå') + "</td>"
            + "<td class='td_150'>" + GetResource('S140903112827119', 'åçæ¶é´') + "</td>";

        var flow_activity = null;

        if (data.Result) {

            var language = top.window.GLanguage;
            var flow_type = data.Result[data.Result.length - 1].flow_type;

            // RE ç±»åè¡¨å¤´
            if (flow_type == "RE") {
                html += "<td class='td_100'>" + GetResource('S141110155338289', 'æ°ç¨¿è¯å') + "</td>";
            }

            html += "<td class='td_100'>" + GetResource('S140903112944511', 'åçç»æ') + "</td>"
                + "<td class='left'>" + GetResource('S140903112908615', 'åçæè§') + "</td>";

            // æ¹è¿ªæ°å¢å
            if (isKFDL && flow_type == "UD") {
                html += "<td class='left'>å®¡æ ¸æµç¨å¤æ³¨</td>";
            }

            if (showFlowStepRemark) {
                html += "<td class='left td_400' style='min-width:400px'>æµç¨æ­¥éª¤åå®¹æè¿°</td>";
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

                // ç»ä¸å¤æ³¨åï¼æ ¸å¿ï¼
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

                // ===== æåä¸æ¡ =====
                if (i == l - 1) {

                    flow_activity = row;

                    if (flow_type == "RE") {
                        tr += "<td>" + row.score + "</td>";
                    }

                    if (flow_type == "AC" && row.node_code == "VOID") {
                        tr += "<td>" + GetResource('S170715173923293', 'å·²ä½åº') + "</td>";
                    } else {
                        tr += "<td>" + (row.node_code == "END" ? "" : GetResource('S140916144529101', 'åçä¸­')) + "</td>";
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

//æ·»å å½åæµç¨å¤æ³¨
function AddFlowRemark(obj_id, table_id, call_back) {
    function CallBack(input) {
        var remark = input.value.trim();
        if (!remark) {
            Box.Alert(GRESX.HINTS.TITLE, GetResource('S220718094407088', 'è¯·è¾å¥å½åæµç¨å¤æ³¨'), null, { icon: 'hits.gif', width: '150' });
            return false;
        }
        function Success(data) {
            if (data.ClientInfo.Result) {
                Box.Tips(GRESX.HINTS.TITLE, 2, GetResource('S150109154056964', 'æ·»å æåï¼'), function () { GetFlowHistory(obj_id, table_id, call_back) }, { icon: 'succ.gif' }); return;
            } else {
                Box.Alert(GRESX.HINTS.TITLE, data.ClientInfo.Message, null, { icon: 'fail.gif' });
            }
        }
        Ajax.Request('Common.ashx', { Call: 'AddFlowRemark', obj_id: obj_id, remark: remark }, Success);

    }
    var Dialog = function () {
        var html = "<div><textarea class='input_auto td_200' style='height:40px;'></textarea></div>";
        $.dialog({
            title: GetResource('S220715164644885', 'å½åæµç¨å¤æ³¨'),
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
//æå¼ç¸å³ç¨æ·é¡µé¢
function ShowCaseUser(case_type, case_id) {
    var id = NewGuid();
    var opener = top.window;
    opener.$.dialog({
        id: id, title: GetResource('S140920102020224', 'ç¸å³ç¨æ·'),
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

/*å¤æ­æ­¤å¯¹è±¡æ¯å¦ä¸ºæ°ç»*/
function isArray(o) {
    return Object.prototype.toString.call(o) === '[object Array]';
}


//HTMLè½¬ç ,è½¬æ¢HTMLæ ç­¾,è½¬æ¢å®æä¹åå¯ä»¥ç´æ¥æäº¤è³åå°
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

///HTMLè§£ç ,ä¸ä¸é¢çæ¹æ³å¯¹åº,è§£ç ç»ä¸é¢æ¹æ³ç¼ç çæ¹æ³
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

///æ¥è¯¢å®¢æ·
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


///æ¥è¯¢å®¢æ·åä»£çæºæ
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

///æ¥è¯¢ä»£çæºæ
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

//æ¥è¯¢ä¸å¡ç±»å
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

///æ¥è¯¢å½å®¶
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

///æ¥è¯¢å½å®¶
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

//æ¥æ¾æ¨¡æ¿ç±»å
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


///æ¥è¯¢å¸å«
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


//æ¥è¯¢äº§åç±»å«
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

//æ¥è¯¢æææ¡ä»¶æç»åç±»
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

//æ¥è¯¢æææ¡ä»¶æç»åç±»
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

//æ¥è¯¢æææä½æ å
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

//æ¥è¯¢ææ¯é¢å
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

//æ¥è¯¢OAæ¶åé®é¢
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

// å è½½å·²ææ¥å£éç½®ä¿¡æ¯çå®¢æ·
var CustomerListConfig = null;
function LoadAutoCustomerConfig(_SearchKey) {
    function Success(_Meta) {
        CustomerListConfig = _Meta.customer;
    }
    Ajax.Request('WadeButtAction.ashx', { Call: 'LoadCustomerConfig', Key: _SearchKey }, Success, true);

    return CustomerListConfig;
}
// å è½½å·²æAPIæ¥å£éç½®ä¿¡æ¯çå®¢æ·(æVPN)
function LoadAutoCustomerConfigVPN(_SearchKey) {
    function Success(_Meta) {
        CustomerListConfig = _Meta.customer;
    }
    Ajax.Request('WadeButtAction.ashx', { Call: 'LoadCustomerConfigVPN', Key: _SearchKey }, Success, true);

    return CustomerListConfig;
}

// å è½½å·²æAPIæ¥å£éç½®ä¿¡æ¯çå®¢æ·(æ²¡æVPN)
function LoadAutoCustomerConfigNOVPN(_SearchKey) {
    function Success(_Meta) {
        CustomerListConfig = _Meta.customer;
    }
    Ajax.Request('WadeButtAction.ashx', { Call: 'LoadCustomerConfigNOVPN', Key: _SearchKey }, Success, true);

    return CustomerListConfig;
}

var CustomerListEN = null;
var Customer_SearchKeyEN = '';
function LoadAutoCustomerEN(_SearchKey) {//æ¯å¦éè¦è±æåç§° 1ä¸ºéè¦è±æå,null æè 0 ä¸ºä¸éè¦è±æå
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
function LoadAutoApplicantCustomerEN(_SearchKey) {//æ¯å¦éè¦è±æåç§° 1ä¸ºéè¦è±æå,null æè 0 ä¸ºä¸éè¦è±æå
    function Success(_Meta) {
        ApplicantCustomer_SearchKeyEN = _SearchKey;
        ApplicantCustomerListEN = null;
        ApplicantCustomerListEN = _Meta.customer;
    }
    Ajax.Request('PatentAction.ashx', { Call: 'LoadCustomer', Key: _SearchKey, en_name: 1, customer_nature: 1 }, Success, true);


    return ApplicantCustomerListEN;
}

//å è½½å®¢æ·æ 
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

//å è½½äº§åç±»å«
function LoadTreeProduct() {
    var _TreeProduct = null;
    function success(_Meta) {
        _TreeProduct = null;
        _TreeProduct = _Meta.Products;
    }
    Ajax.Request("BaseInfo.ashx", { Call: "GetProducts" }, success, true);
    return _TreeProduct;
}

////è·åç³»ç»ä¸­è®°å½çé®ä»¶
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

// å¨å±ç¼å­
var MailList = [];
var LastSearchKey = "";

// é²æå½æ°
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// çæ­£åé Ajax çå½æ°ï¼ä¸ç´æ¥è°ç¨ï¼
function FetchMailList(_SearchKey) {
    Ajax.Request('Common.ashx', {
        Call: 'AutoMailListInfo',
        Key: _SearchKey
    }, function (_Meta) {
        MailList = _Meta.MailListInfo || [];
        LastSearchKey = _SearchKey;
    }, true);
}

// åè£æé²æåç Ajax å½æ°
var FetchMailListDebounce = debounce(FetchMailList, 300);

// æä»¶è°ç¨çåæ­¥æ¥å£
function AutoMailListInfo(_SearchKey) {
    if (GetPublishConfig("KLFD", "202507")) {
        if (!_SearchKey) {
            return;
        }
    }
    // å¦æç´¢åå®¹åäº â åé²æè¯·æ±ï¼ä¸ä¼ç«å³å¡é¡¿ï¼
    if (_SearchKey !== LastSearchKey) {
        FetchMailListDebounce(_SearchKey);
    }

    // åæ­¥è¿åå½åç¼å­ï¼ä¸ä¼å¡
    return MailList;
}

//è·åç³»ç»ä¸­è®°å½çé®ä»¶
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

//è®°å½éæ©çåå®¹ä½ä¸ºè¯¥ç¨æ·çè¡ä¸ºåæ
//éæ©çå¼
//_type åæçç±»åï¼å¦å®¢æ· customer
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


//å è½½åæç±»åæ°æ®
function LoadMailType() {

    var MailType = null;
    function Success(_Meta) {

        MailType = null;
        MailType = _Meta.MailType;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadMailType' }, Success, true);

    return MailType;

}

//å è½½åæç±»åæ°æ®
function LoadCrmMailType() {

    var MailCrmType = null;
    function Success(_Meta) {

        MailCrmType = null;
        MailCrmType = _Meta.MailType;
    }
    Ajax.Request('Mail.ashx', { Call: 'CusMailInitData' }, Success, true);

    return MailCrmType;

}

//å è½½éç¥ä¹¦ç±»åæ°æ®
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


//å è½½æä»¶ç±»åæ°æ®  _official æ¯å¦è¦å è½½éäº¤å®æ¹è¯¥ç±»åæä»¶
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

//å è½½æä»¶ç±»åæ°æ® case_type  _official æ¯å¦è¦å è½½éäº¤å®æ¹è¯¥ç±»åæä»¶
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

// å è½½æä»¶ç±»ååæè¿°
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

    // é²æ­¢ç¼å­æ°æ®è¢«ä¿®æ¹
    var tempData = {}
    $.extend(true, tempData, top.GetFileTypeAndDescData[case_type_id]);
    return tempData;
}

// ä¸åæ¡ä»¶ç±»ååå§ååºç¡æ°æ®ç¼å­
function GetInitalizationDataByCaseType(case_type_id) {
    if (top.InitalizationDataByCaseType == undefined) {
        top.InitalizationDataByCaseType = {}
    }

    if (top.InitalizationDataByCaseType[case_type_id]) {
        // èªå¨è¿ææºå¶(30åé)
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
 * æ ¹æ®ç±»åè·åæä»¶ç±»åæè¿°id
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

    // é²æ­¢ç¼å­æ°æ®è¢«ä¿®æ¹
    var tempData = {}
    $.extend(true, tempData, top.LoadFileTypeByTypeIDData[cacheKey]);
    return tempData;
}

//å è½½å¤çäºé¡¹æ°æ®
function LoadCtrlProc() {

    var CtrlProc = null;
    function Success(_Meta) {
        CtrlProc = null;
        CtrlProc = _Meta.CtrlProc;

    }
    Ajax.Request('Common.ashx', { Call: 'LoadCtrlProc' }, Success, true);
    return CtrlProc;
}
//å è½½å¤çäºé¡¹ç¶æ
function LoadProcStatusNew() {
    var LoadProcStatusNew = null;
    function Success(_Meta) {
        LoadProcStatusNew = null;
        LoadProcStatusNew = _Meta.LoadProcStatusNew;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadProcStatusNew' }, Success, true);
    return LoadProcStatusNew;
}
//å è½½å¤çäºé¡¹æ¡ä»¶ç¶æ
function LoadReviewStage() {
    var LoadReviewStage = null;
    function Success(_Meta) {
        LoadReviewStage = null;
        LoadReviewStage = _Meta.LoadReviewStage;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadReviewStage' }, Success, true);
    return LoadReviewStage;
}
//å è½½å®æ¹çå¤çäºé¡¹
function LoadCtrlProc_Official() {
    var CtrlProc = null;
    function Success(_Meta) {
        CtrlProc = null;
        CtrlProc = _Meta.CtrlProc;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCtrlProc_Official' }, Success, true);
    return CtrlProc;
}

//å è½½é¨é¨ç»ç»ç»æ is_charge æ¯å¦åªå è½½æ¿åé¨é¨
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

//æ ¹æ®ç±»åä¸åå è½½ä¸åçæµç¨èç¹
function LoadNodeTree(flow_sub_type) {
    var _TreeNode = null;
    function success(_Meta) {
        _TreeNode = null;
        _TreeNode = _Meta.TreeNode;
    }
    Ajax.Request("Common.ashx", { Call: "GetTreeNode", flow_sub_type: flow_sub_type }, success, true);
    return _TreeNode;
}

//å è½½ç¨æ·æ 
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

//å è½½æ¡ä»¶ç±»å
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
// å è½½åé¨äººå
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

//å è½½ä»£çæºæäººå
function LoadTreeAgentUser() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "GetTreeAgentUser" }, success, true);
    return _TreeUser;
}

//å è½½ä»£çæºæ
function LoadTreeAgent() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "GetTreeAgent" }, success, true);
    return _TreeUser;
}

//å è½½å½å®¶æ 
function LoadTreeCountry() {
    var _TreeCountry = null;
    function success(_Meta) {
        _TreeCountry = null
        _TreeCountry = _Meta.country;
    }
    Ajax.Request("Common.ashx", { Call: "LoadCountry" }, success, true);
    return _TreeCountry
}

//ä¸å¡åç¨æ·
function LoadTreeSalesUser() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "LoadTreeSalesUser" }, success, true);
    return _TreeUser

}
//å»ºæ¡£å¤æ ¸äºº
function LoadTreeFilesUser() {
    var _TreeUser = null;
    function success(_Meta) {
        _TreeUser = null
        _TreeUser = _Meta.TreeUser;
    }
    Ajax.Request("Common.ashx", { Call: "LoadTreeFileUser" }, success, true);
    return _TreeUser

}
//å è½½è§è²æ 
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
//æ¥è¯¢æ¡ä»¶
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

//æ¥è¯¢åæ æ¡ä»¶
function LoadTradeSearchCase(_SearchKey) {
    function Success(_Meta) {

        Case_SearchKey = _SearchKey;
        CaseList = null;
        CaseList = _Meta.CaseList;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadTradeSearchCase', Key: _SearchKey }, Success, true)
    return CaseList;
}


//å¯¼åºExcel
function Export(ajax_config, param, columns) {

    var id = "ihg_export";
    var open_url = "IhgExport.aspx";
    if (ajax_config.open_url && ajax_config.open_url.length > 0)
        open_url = ajax_config.open_url;
    var api = frameElement.api;
    if (api) {
        opener = api.opener;
        opener.$.dialog({
            id: id, title: GetResource('S141027143618214', 'å¯¼åºæ¸å'),
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
            id: id, title: GetResource('S141027143618214', 'å¯¼åºæ¸å'),
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

///åå°æ¥æ¾çæ°æ®å­å¨ < > æ¶éè¦æ¾ç¤ºå¨åå°éè¦å¤çæ
function ReplacSpeStr(Str) {
    if (Str) {
        Str = Str.replace(/</g, '&lt;');
        Str = Str.replace(/>/g, '&gt;');
    }
    return Str;
}

//var PageType = {
//    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'page': 'CaseManage.aspx', 'name': 'ä¸å©' }, 'ABD40742-04F9-455F-BC41-080E9D896F80': { 'page': 'CaseInfo.aspx', 'name': 'çæ' }
//                       , '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'page': 'TradeMarkManage.aspx', 'name': 'åæ ' }
//};

PublicStrucCaseName = function (case_id, case_volume, case_name, case_type_id) {

    if (!$.trim(case_volume)) {
        case_volume = 'æ ';
    }
    return "<a  href='javascript:void(0);' onclick=\"PublicOpenCase('" + case_id + "','" + case_volume + "','" + case_type_id + "');\" >" + case_volume + "</a>";
}

function PublicOpenCase(case_id, case_volume, case_type_id) {
    var url = "", Type = "";
    if (top.window._UserModel.RoleCode.toUpperCase().indexOf("IC") >= 0 || top.window._UserModel.RoleCode.toUpperCase().indexOf("ADMIN") >= 0) {//ç®¡çåãç¨åºææé
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
            top.window.AddBusinessTab('IC' + case_id, GetResource('S140822114641256', 'æ¡ä»¶') + "-" + case_volume, url);
        }
    }
    Ajax.Request("BaseInfo.ashx", { Call: "GetCaseInfo", case_id: case_id }, success);

}

PublicStrucCaseNameByRole = function (case_id, case_volume, case_name, case_type_id, proc_id) {
    if (!$.trim(case_volume)) {
        case_volume = 'æ ';
    }
    return "<a  href='javascript:void(0);' onclick=\"PublicOpenCaseByRole('" + case_id + "','" + case_volume + "','" + case_type_id + "','" + proc_id + "');\" >" + case_volume + "</a>";
}

function PublicOpenCaseByRole(case_id, case_volume, case_type_id, proc_id) {
    var id = '', url = '', title_name = '';
    if (case_type_id == "882D9F78-7656-468E-BE98-68FE5E334A9B") {
        url = "Forms/Patent/" + CaseTypeURL[case_type_id]["ICURL"] + "?Type=IC&objid=" + case_id + '&caseType_id=' + case_type_id;
        top.window.AddBusinessTab(id, title_name, url);
    } else {
        if (top.window._UserModel.RoleCode.toUpperCase().indexOf("IC") >= 0 || top.window._UserModel.RoleCode.toUpperCase().indexOf("ADMIN") >= 0) {//ç®¡çåãç¨åºææé
            id = 'IC' + case_id;
            title_name = GetResource('S140822114641256', 'æ¡ä»¶') + "-" + case_volume;
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

//è·å¾èªå®ä¹æ§ä»¶html
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

//åå§åèªå®ä¹æ ä½
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

//èªå®ä¹æ ä½èµå¼
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



//åå¾æ ä½å¼
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


//JSå¯¹è±¡æ·è´
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
//    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': 'ä¸å©', 'code': 'P', 'page': 'CaseManage.aspx' }
//                 , 'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': 'çæ', 'code': 'C', 'page': 'CaseManage.aspx' }
//                 , '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': 'åæ ', 'code': 'T', 'page': 'TradeMarkManage.aspx' }
//                 , '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': 'å¶ä»', 'code': 'O', 'page': 'CaseManage.aspx' }
//}

var CaseTypeURL = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': GetResource('S140830213111063', 'ä¸å©'), 'code': 'P', 'ICURL': 'CaseManage.aspx', 'IPURL': "CaseInfo.aspx", "PROCURL": "CaseProcInfo.aspx" },
    'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': GetResource('S140830213213510', 'çæ'), 'code': 'C', 'ICURL': 'CopyRightManage.aspx', 'IPURL': "CopyRightInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': GetResource('S140830213251949', 'åæ '), 'code': 'T', 'ICURL': 'TradeMarkManage.aspx', 'IPURL': "TradeMarkInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': GetResource('S140822171042104', 'å¶ä»'), 'code': 'O', 'ICURL': 'CaseOther.aspx', 'IPURL': "CaseOther.aspx" },
    '882D9F78-7656-468E-BE98-68FE5E334A9B': { 'lid': 'S170314103618093', 'Default': GetResource('S170314103618093', 'ç§ææå¡'), 'code': 'S', 'ICURL': 'TechServiceManage.aspx', 'IPURL': "TechServiceManage.aspx", "PROCURL": "IhgTechServiceProc.aspx" },
    '7A74BEB6-13DE-444B-892F-6E339D4067A2': { 'lid': 'S180120160453969', 'Default': GetResource('S180120160453969', 'æ³å¾æ¡ä»¶'), 'code': 'F', 'ICURL': 'LawCaseManage.aspx', 'IPURL': 'LawCaseInfo.aspx' },
    '849F2D30-DDAA-4718-AD1E-1951DE67913D': { 'lid': 'S170725104526779', 'Default': GetResource('S170725104526779', 'è°æ¥æ¡'), 'code': 'R', 'ICURL': 'TortCaseManage.aspx', 'IPURL': "TortCaseInfo.aspx", 'INURL': 'CaseInfo.aspx' },
}

var FDCaseTypeURL = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': GetResource('S140830213111063', 'ä¸å©'), 'code': 'P', 'ICURL': 'IOCaseManage.aspx', 'IPURL': "IOCaseInfo.aspx", "PROCURL": "CaseProcInfo.aspx" },
    'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': GetResource('S140830213213510', 'çæ'), 'code': 'C', 'ICURL': 'CopyRightManage.aspx', 'IPURL': "CopyRightInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': GetResource('S140830213251949', 'åæ '), 'code': 'T', 'ICURL': 'TradeMarkManage.aspx', 'IPURL': "TradeMarkInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': GetResource('S140822171042104', 'å¶ä»'), 'code': 'O', 'ICURL': 'CaseOther.aspx', 'IPURL': "CaseOther.aspx" },
    '882D9F78-7656-468E-BE98-68FE5E334A9B': { 'lid': 'S170314103618093', 'Default': GetResource('S170314103618093', 'ç§ææå¡'), 'code': 'S', 'ICURL': 'TechServiceManage.aspx', 'IPURL': "TechServiceManage.aspx", "PROCURL": "IhgTechServiceProc.aspx" },
    '7A74BEB6-13DE-444B-892F-6E339D4067A2': { 'lid': 'S180120160453969', 'Default': GetResource('S180120160453969', 'æ³å¾æ¡ä»¶'), 'code': 'F', 'ICURL': 'LawCaseManage.aspx', 'IPURL': 'LawCaseInfo.aspx' },
    '849F2D30-DDAA-4718-AD1E-1951DE67913D': { 'lid': 'S170725104526779', 'Default': GetResource('S170725104526779', 'è°æ¥æ¡'), 'code': 'R', 'ICURL': 'TortCaseManage.aspx', 'IPURL': "TortCaseInfo.aspx", 'INURL': 'CaseInfo.aspx' },
}

var PCTCaseTypeURL = {
    '31D1A147-2931-43B5-94AE-B72B1525BA8A': { 'lid': 'S140830213111063', 'Default': GetResource('S140830213111063', 'ä¸å©'), 'code': 'P', 'ICURL': 'PCTCaseManage.aspx', 'IPURL': "PCTCaseInfo.aspx", "PROCURL": "CaseProcInfo.aspx" },
    'ABD40742-04F9-455F-BC41-080E9D896F80': { 'lid': 'S140830213213510', 'Default': GetResource('S140830213213510', 'çæ'), 'code': 'C', 'ICURL': 'CopyRightManage.aspx', 'IPURL': "CopyRightInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '0E8A4B7F-E407-4EFF-9562-3809BF484207': { 'lid': 'S140830213251949', 'Default': GetResource('S140830213251949', 'åæ '), 'code': 'T', 'ICURL': 'TradeMarkManage.aspx', 'IPURL': "TradeMarkInfo.aspx", "PROCURL": "IhgTradeProc.aspx" },
    '122136EA-F3E3-46C5-A529-EFC358AC764B': { 'lid': 'S140822171042104', 'Default': GetResource('S140822171042104', 'å¶ä»'), 'code': 'O', 'ICURL': 'CaseOther.aspx', 'IPURL': "CaseOther.aspx" },
    '882D9F78-7656-468E-BE98-68FE5E334A9B': { 'lid': 'S170314103618093', 'Default': GetResource('S170314103618093', 'ç§ææå¡'), 'code': 'S', 'ICURL': 'TechServiceManage.aspx', 'IPURL': "TechServiceManage.aspx", "PROCURL": "IhgTechServiceProc.aspx" },
    '7A74BEB6-13DE-444B-892F-6E339D4067A2': { 'lid': 'S180120160453969', 'Default': GetResource('S180120160453969', 'æ³å¾æ¡ä»¶'), 'code': 'F', 'ICURL': 'LawCaseManage.aspx', 'IPURL': 'LawCaseInfo.aspx' },
    '849F2D30-DDAA-4718-AD1E-1951DE67913D': { 'lid': 'S170725104526779', 'Default': GetResource('S170725104526779', 'è°æ¥æ¡'), 'code': 'R', 'ICURL': 'TortCaseManage.aspx', 'IPURL': "TortCaseInfo.aspx", 'INURL': 'CaseInfo.aspx' },
}
/*éè®¾å¼¹åºæ¡çä½ç½®,å½å¼¹åºæ¡çé«åº¦ä¼éçé¡µé¢çå è½½ååæ¶å¯è°ç¨æ­¤æ¹æ³,å·²ä¿è¯å¼¹åºçªä½ä¿æå¨é¡µé¢çä¸­å¤®,æ­¤æ¹æ³è¿å¤çäºå¼¹åºçªä½è¿å¤§é æé¡µé¢æ¾ç¤ºä¸å¨çé®é¢
æ³¨æ:æ¯é¡µé¢æ°æ®å è½½å®æä¹åè°ç¨
*/
function ReSetDialogPosition() {
    var Api = frameElement.api
    var window_height = $(Api.opener.top.window).height() - 50;//è¿éè®¡ç®çé«åº¦æ¯æ´ä¸ªæµè§å¨å¯è§åºåçé«åº¦,æ³¨æè¦è®¡ç®top.window
    var height = $(document).height();
    if (height > window_height) {
        height = window_height;
    }
    Api.size(Api.config.width, height);
    var top = ($(Api.opener.window).height() - height - 10) / 2;//èç¸å¯¹é«åº¦åºè¯¥ä½¿ç¨openerçé¡µé¢é«åº¦
    if (top < 0) {
        top = 0;
    }
    frameElement.api.position(null, top);
}


///æ¥è¯¢å½å®¶
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

//å è½½Wordæ¨¡çç±»åæ°æ®
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

//æå¼æå®é¡µé¢ï¼åæ°èªå®ä¹
function PublicOpenPage(type, parm, text) {
    switch (type) {
        case 'rd': {
            if (text.indexOf('èç¨¿') == -1 && parm.length > 0) {
                top.window.AddBusinessTab("f_" + parm, null, "Forms/Bill/RequestDetail.aspx?objid=" + parm);
            }
            break;
        }
        case 'bi': {
            if (text.indexOf('èç¨¿') == -1 && parm.length > 0) {
                top.window.AddBusinessTab("f_" + parm, null, "Forms/Bill/BillIn.aspx?objid=" + parm);
            }
            break;
        }
        case 'bo': {
            if (text.indexOf('èç¨¿') == -1 && parm.length > 0) {
                top.window.AddBusinessTab("f_" + parm, null, "Forms/Bill/BillOut.aspx?objid=" + parm);
            }
            break;
        }
        default:
            break;
    }
}

//è·åå å¤©å
function getDateDiff(dateStr) {
    var dateTimeStamp = Date.parse(dateStr.replace(/-/gi, "/"));
    var minute = 1000 * 60;
    var hour = minute * 60;
    var day = hour * 24;
    var halfamonth = day * 15;
    var month = day * 30;
    var now = new Date().getTime();
    var diffValue = now - dateTimeStamp;
    if (diffValue < 0) { return "åå"; }
    var monthC = diffValue / month;
    var weekC = diffValue / (7 * day);
    var dayC = diffValue / day;
    var hourC = diffValue / hour;
    var minC = diffValue / minute;
    if (monthC >= 1) {
        result = "" + parseInt(monthC) + "æå";
    }
    else if (weekC >= 1) {
        result = "" + parseInt(weekC) + "å¨å";
    }
    else if (dayC >= 1) {
        result = "" + parseInt(dayC) + "å¤©å";
    }
    else if (hourC >= 1) {
        result = "" + parseInt(hourC) + "å°æ¶å";
    }
    else if (minC >= 1) {
        result = "" + parseInt(minC) + "åéå";
    } else
        result = "åå";
    return result;
}


///æ¥è¯¢åæº
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


///æ¥è¯¢è¥é
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


///æ¥è¯¢çº¿ç´¢
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


//åä½ç¨æ·
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
        "M+": this.getMonth() + 1, //æä»½
        "d+": this.getDate(), //æ¥
        "h+": this.getHours(), //å°æ¶
        "m+": this.getMinutes(), //å
        "s+": this.getSeconds(), //ç§
        "q+": Math.floor((this.getMonth() + 3) / 3), //å­£åº¦
        "S": this.getMilliseconds() //æ¯«ç§
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o)
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    return fmt;
}

Date.prototype.getMonthFormatted = function () {
    var month = this.getMonth();
    return month < 10 ? '0' + month : '' + month; // å¦ææ¯1-9æï¼é£ä¹åé¢è¡¥0
}

//éèæèæ¾ç¤ºæä¸ªåç´  æ ·å¼ä¸ä¸æ ·
function ShowHide(_this, _obj_id, _obj_id2) {
    if ($("#" + _obj_id).is(":hidden")) {
        $(_this).attr("title", GetResource('S140929141518276', 'ç¹å»éè'));
        $(_this).attr("class", "img_show");
    }
    else {
        $(_this).attr("title", GetResource('S140929141358903', 'ç¹å»æ¾ç¤º'));
        $(_this).attr("class", "img_hide");
    }
    $("#" + _obj_id).slideToggle(600);
    if (_obj_id2) {
        $("#" + _obj_id2).slideToggle(600);
    }
}
//æ ¹æ®IDè¿è¡è·³è½¬
function SkipFAQ(id, menu_id, keyword) {
    var Success = function (_Meta) {
        if (_Meta.FAQPath) {
            var timestamp = new Date().getTime();
            var success = function (data) {
                ciphertext = data.ciphertext.replace("", "");
                keyword = keyword ? keyword : '';
                menu_id = menu_id ? menu_id : '';
                var url = _Meta.FAQPath + "/forms/FAQ/FaqList.aspx?faq_id=" + id + "&menu_id=" + menu_id + "&keyword=" + keyword + "&ciphertext=" + ciphertext;
                // top.window.AddBusinessTab("faq_id" + id, "FAQ-é¢è§", url);
                window.open(url);
            }
            Ajax.Request('Common.ashx', { Call: 'GetCiphertextValue' }, success);
        } else {
            Box.Alert(GRESX.HINTS.TITLE, "è¯·éç½®FAQå°åååæå¼FAQ", null, { icon: 'fail.gif', width: '250', height: '60' });
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
///è·åé¡µé¢è·¯å¾(åæåçæä»¶å)
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

///è·åç¶é¡µé¢è·¯å¾,éç¨äºå±å·¥å¼¹åºçªç»ä»¶,æ³åå¾ç¶é¡µé¢è·¯å¾æ¶ä½¿ç¨
function GetParentPageName() {
    //frameElement.api.config.parent.window.GetPageName()
    if (frameElement.api.config.parent != null && frameElement.api.config.parent.content) {
        return frameElement.api.config.parent.content.GetPageName();
    }
    else {
        return frameElement.api.opener.GetPageName();
    }
}



///æ¥å¿è®°å½å¬å±æ¨¡ç»
var CommLog = {
    AddReadLog: function (option) {
        if (!option || !option.objid || !option.model || !option.tablename) {
            //åæ°ä¸å¨,ç´æ¥å¿½ç¥
            return false;
        }

        var page = GetPageName();
        option.log_pagename = page;
        option.Call = "AddUserReadLog";

        try {//ç´æ¥catchèµ·æ¥,é¿åå ä¸ºæ¥å¿éè¯¯å¼èµ·å¶å®æ¨¡åä¸è½è¿è¡
            Ajax.Request("Common.ashx", option);
        } catch (e) { }
    }
}

//ç³»ç»åæ¨¡åä»£ç 
var SysModel = {
    "APPLY": GetResource("S140805212413578", "ææ¡ç®¡ç"),
    "CASE": GetResource("S140805212542670", "æ¡ä»¶ç®¡ç"),
    "EFLOW": GetResource("S170715174115494", "æ ¸ç¨¿ç®¡ç"),
    "MAIL": GetResource("S170715174115868", "åæç®¡ç"),
    "FILING": GetResource("S170715174116243", "éäº¤ç®¡ç"),
    "CUSTOMER": GetResource("S170715174116596", "å®¢æ·ç®¡ç"),
    "AGENCY": GetResource("S170715174116970", "åä½ä»£çæºæ"),
    "CONTACT": GetResource("S140814205507198", "å®¢æ·èç³»äºº"),
    "APPLICANT": GetResource("S170715174117371", "ç³è¯·äººç®¡ç"),
    "INVENTOR": GetResource("S170715174117737", "åæäººç®¡ç"),
    "BILL": GetResource("S170715174118149", "è´¦æ¬¾ç®¡ç"),
    "BATCH": GetResource("S160425115610591", "æ¹å¤ç"),
    "FILE": GetResource("S170715174118584", "æä»¶ç®¡ç"),
    "REPORT": GetResource("S170424114427294", "æ¥è¡¨ç®¡ç"),
    "SYSTEM": GetResource("S170601112528023", "ç³»ç»ç®¡ç"),
    "FLOW-AP": GetResource("S160929162237138", "ææ¡æµç¨"),
    'FLOW-DR': GetResource("S170715174119127", "éæ¡æµç¨"),
    'FLOW-RE': GetResource("S170715174119505", "æ ¸ç¨¿æµç¨"),
    'FLOW-UD': GetResource("S170715174119914", "æ°æ®æ´æ°"),
    'FLOW-EF': GetResource("S170715174120274", "éäº¤æµç¨"),
    'FLOW-CO': GetResource("S170715174120623", "åææµç¨"),
    'FLOW-AC': GetResource("S170715174120991", "è´¦æ¬¾æµç¨"),
    "TechService": GetResource("S170314103618093", "ç§ææå¡")
}

//1 = æ°å¢, 2 = ä¿®æ¹, 3 = å é¤, 4 = ä¸ä¼ , 5 = ä¸è½½, 6 = æå¼ / æ¥ç
//7=æäº¤,8=éå,9=ç§»äº¤,10=å ç­¾,11=ç»æ¡,12=å¯å¨/åå»º
var LogType = {
    1: GetResource('S140821210615724', 'æ°å¢'),
    2: GetResource('S140813203214743', 'ä¿®æ¹'),
    3: GetResource('S140808094153296', 'å é¤'),
    4: GetResource('S140920170156404', 'ä¸ä¼ '),
    5: GetResource('S140912142421099', 'ä¸è½½'),
    6: GetResource('S171009183324873', 'æå¼/æ¥ç'),
    7: GetResource('S140816154013508', 'æäº¤'),
    8: GetResource('S140823113604887', 'éå'),
    9: GetResource('S140915095232708', 'ç§»äº¤'),
    //10: 'å ç­¾',
    //11: 'ç»æ¡',
    //12: 'å¯å¨æµç¨',
    //13: "æ°æ®åæ­¥",
    14: GetResource('S161021112701576', 'å¤çäºé¡¹è§å'),
    15: GetResource('S161020161045713', 'éç¥ä¹¦è§å'),
    16: GetResource('S180227175542222', 'äººåç®¡ç'),
    17: GetResource('S180227175554118', 'è§è²ç®¡ç')
}


//æ¨¡ææäº¤è¡¨å
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

//æè½¬ç çç¹æ®å­ç¬¦ç´æ¥å»æ,æ¿æ¢æç©ºå­ç¬¦ä¸²,è§£å³ç¹æ®å­ç¬¦å¨è¿æ¥ä¸­æèæ¹æ³çåæ°ä¸­å¼èµ·çå¼å¸¸é®é¢
function HTMLDecodeToEmpty(str) {
    var s = "";
    if (str.length == 0) return "";
    //å»é¤âhtmlâå­ç¬¦çç¹æ®ç¼ç 
    s = str.replace(/&amp;/g, "").replace(/&lt;/g, "").replace(/&gt;/g, "").replace(/&nbsp;/g, "").replace(/&#39;/g, "").replace(/&quot;/g, "");
    //å»é¤âå­ç¬¦ä¸²çâå­ç¬¦çç¹æ®ç¼ç 
    s = s.replace(/&/g, "").replace(/</g, "").replace(/>/g, "").replace(/'/g, "").replace(/"/g, "");
    return s;
}

//è·åæ¥è¯¢ or æ°å¢ or ç¼è¾ä¸­çæææ¡çå¼ï¼å¹¶è¿å
//idä¸ºåå«è¿äºæ§ä»¶çæå¤å±divçid
function GetBoxParame(id) {
    //è¿åçåæ°éï¼ç¨äºAjaxè¯·æ±çåæ°
    var parame = {};

    //ãç®åæ¯æçæ§ä»¶æãï¼
    //ã4ã7 è¿åå¼éå·åå²ï¼æ«å°¾æ éå·ã
    //1ãæ®éææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"  type="text"ã
    //2ãæ¥æææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"  type="text"ã
    //3ãä¸æéæ©æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"ã
    //4ãå¤éæ¡                 å¿å¡«å±æ§ï¼name="æ°æ®åºåå" parame="name" type="checkbox"ã
    //5ãåéæ¡                 å¿å¡«å±æ§ï¼name="æ°æ®åºåå" parame="name" type="radio"ã
    //6ãå¤è¡ææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"ã
    //7ãä¸æå¤éæ¡(åéãå¤é) å¿å¡«å±æ§ï¼id="æ°æ®åºåå" objid="" parame="id" dataType="selectTree" type="text"ã
    //8ãèªå¨æ¥è¯¢æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" objid="" parame="id" dataType="autoSearch" type="text"ã

    //idåæ°ç»æ§ä»¶
    var controls = $("#" + id + " [parame='id']").add("#" + id + " [parame='name']");;

    //éè¦å»ææ«å°¾éå·çå¯¹è±¡ç»
    var strConverts = [];

    controls.each(function (index, value) {

        //å½åæ§ä»¶
        var current = $(value);
        //åæ°å å¯ä»¥æ¯æ§ä»¶çidæname
        var parameName = "parame_";
        //æ§ä»¶åç§°
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

                    //éè¦å»ææ«å°¾éå·ï¼å å°è¿ä¸ªæ°ç»
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

    //å»ææäºå¼çæ«å°¾éå·
    $(strConverts).each(function (index, value) {
        if (parame[value].trim().length > 0)
            parame[value] = parame[value].substr(0, parame[value].length - 1);
    });

    return parame;
}

//è®¾ç½®ææ¬æ¡çå¼ï¼ç®åä¸ºç¼è¾æ¶ä½¿ç¨
//idä¸ºåå«è¿äºæ§ä»¶çæå¤å±divçid,rowä¸ºæ°æ®è¡
function SetBoxParame(id, row) {
    //ãç®åæ¯æçæ§ä»¶æãï¼
    //ã7ã8 èµå¼æ¹å¼ï¼å¦id='pic'å rowéåºæ row["pic"](objid),row["pic_name"](val)ã
    //1ãæ®éææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"  type="text"ã
    //2ãæ¥æææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"  type="text"ã
    //3ãä¸æéæ©æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"ã
    //4ãå¤éæ¡                 å¿å¡«å±æ§ï¼name="æ°æ®åºåå" parame="name" type="checkbox"ã
    //5ãåéæ¡                 å¿å¡«å±æ§ï¼name="æ°æ®åºåå" parame="name" type="radio"ã
    //6ãå¤è¡ææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"ã
    //7ãä¸æå¤éæ¡(åéãå¤é) å¿å¡«å±æ§ï¼id="æ°æ®åºåå" objid="" parame="id" dataType="selectTree" type="text"ã
    //8ãèªå¨æ¥è¯¢æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" objid="" parame="id" dataType="autoSearch" type="text"ã

    //idånameåæ°ç»æ§ä»¶,åä¸nameä¼æå¤ä¸ªæ§ä»¶
    var controls = $("#" + id + " [parame='id']").add("#" + id + " [parame='name']");

    controls.each(function (index, value) {

        //å½åæ§ä»¶
        var current = $(value);
        //åæ°å å¯ä»¥æ¯æ§ä»¶çidæname
        var parameName;

        if (current.attr("parame") == "id") {

            parameName = value.id;
            //æ§ä»¶åç§°
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
                //å¯è½å°±æ¯éä¸­ä¸ä¸ªï¼æèæ¯åå·åå²
                if (val.length == 1) {
                    val = row[parameName].split(";");
                }

                //æ¾å°è¯¥å¼å¹¶ä¸è¯¥æ§ä»¶çvalueä¸æ°æ®åºç¸ç¬¦ï¼éè¦éä¸­
                if ($.inArray(value.value, val) >= 0) {
                    if (current.attr("type") == "checkbox" || current.attr("type") == "radio")
                        current.attr("checked", "checked");
                }
            }
        }
    });
}

//ç¹å»åæ¶æé®çæ¶åæ¸ç©ºåç§æ¡çå¼
//æä¸æ¯æå¤éæ¡checkboxãåéæ¡radio
function ClearBox(id) {
    //ãç®åæ¯æçæ§ä»¶æãï¼
    //1ãæ®éææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"  type="text"ã
    //2ãæ¥æææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"  type="text"ã
    //3ãä¸æéæ©æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"ã
    //4ãå¤è¡ææ¬æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" parame="id"ã
    //5ãä¸æå¤éæ¡(åéãå¤é) å¿å¡«å±æ§ï¼id="æ°æ®åºåå" objid="" parame="id" dataType="selectTree" type="text"ã
    //6ãèªå¨æ¥è¯¢æ¡             å¿å¡«å±æ§ï¼id="æ°æ®åºåå" objid="" parame="id" dataType="autoSearch" type="text"ã

    //idåæ°ç»æ§ä»¶
    var controls = $("#" + id + " [parame='id']");

    controls.each(function (index, value) {

        //å½åæ§ä»¶
        var current = $(value);
        //æ§ä»¶åç§°
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

//--è·åéç½®è¡¨ä¿¡æ¯
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

//è·åéç½®è¡¨ä¿¡æ¯
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

//è·åéç½®è¡¨ä¿¡æ¯
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
//è·åç¨æ·æ¥æçæå±åé¨çæé
var BranchList = null;
function GetDeptBranch() {

    function Success(_Meta) {
        BranchList = _Meta.BranchList;
    }
    Ajax.Request('BaseInfo.ashx', { Call: 'GetDeptBranch' }, Success, true);
    return BranchList;
}



//è·åéç½®è¡¨å¯¹è±¡ä¿¡æ¯ æåç±»
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
    var strUnit = 'ä»ä½°æ¾äº¿ä»ä½°æ¾ä¸ä»ä½°æ¾åè§å';
    num += "00";
    var intPos = num.indexOf('.');
    if (intPos >= 0)
        num = num.substring(0, intPos) + num.substr(intPos + 1, 2);
    strUnit = strUnit.substr(strUnit.length - num.length);
    for (var i = 0; i < num.length; i++)
        strOutput += 'é¶å£¹è´°åèä¼éææç'.substr(num.substr(i, 1), 1) + strUnit.substr(i, 1);
    return strOutput.replace(/é¶è§é¶å$/, 'æ´').replace(/é¶[ä»ä½°æ¾]/g, 'é¶').replace(/é¶{2,}/g, 'é¶').replace(/é¶([äº¿|ä¸])/g, '$1').replace(/é¶+å/, 'å').replace(/äº¿é¶{0,3}ä¸/, 'äº¿').replace(/^å/, "é¶å");
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
// ä¼ä¸ä»£çæºæå¯¹æ¥ä½¿ç¨
var CommDragUploadFile = function (CallBack, Data, Seting) {
    if (!Data["log_pagename"]) {
        Data.log_pagename = GetPageName();
    }
    var title = GetResource('S140816150823831', 'ä¸ä¼ éä»¶');
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
            title: GetResource('S140816150823831', 'ä¸ä¼ éä»¶')
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
//æ¹éææ½ IE10 ä»¥ä¸çæ¬ ç¨æ³åCommUploadNotices
var CommDragUploadNotices = function (CallBack, Data, Seting) {
    if (!Data["log_pagename"]) {
        Data.log_pagename = GetPageName();
    }
    var title = GetResource('S140816150823831', 'ä¸ä¼ éä»¶');
    if (Seting && Seting.title) {
        title = Seting.title;
    }
    if (Seting) {
        Seting.postdate = true;
    }

    if (GetPublishConfig("YSDZ", "2604")) {
        Seting.receipt_date = true;
    }
    //æ·»å ä¸ååè®¸æ¯å¦ä¸ä¼ æä¸ªç±»åçæä»¶ï¼å¦æä¸ºç©ºå°±ååºç¡éç½®å¼
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
            title: GetResource('S140816150823831', 'ä¸ä¼ éä»¶')
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

//è·³è½¬å°ç¥ä¼ä¼æ¥çä¼ä¸ä¿¡æ¯
function SkipCustomer(id) {
    var url = "http://www.qichacha.com/search?key=" + $("#" + id).val();
    window.open(url);
}

//è·åèå¡ä¿¡æ¯
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
 * å è½½ååç±»å«
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
*åå§åä¸æéé¡¹
*/
$.InintSelText = function (obj) {
    var str = "<option value=''>" + GetResource('S140814203438556', 'è¯·éæ©') + "</option>"
        + "<option value='1'>" + GetResource('S140813173911748', 'æ¯') + "</option>"
        + "<option value='0'>" + GetResource('S140813174101479', 'å¦') + "</option>";
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
*æ¯å¦åè®¸å¯¼åºåæ¹éä¸è½½
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

//æ¥è¯¢è´¹ç¨ç±»å
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
* æ°å­ååä½æ ¼å¼å
* @public
* @param mixed mVal æ°å¼
* @param int iAccuracy å°æ°ä½ç²¾åº¦(é»è®¤ä¸º2)
* @return string
*/
function formatMoney(mVal, iAccuracy) {
    var fTmp = 0.00;//ä¸´æ¶åé
    var iFra = 0;//å°æ°é¨å
    var iInt = 0;//æ´æ°é¨å
    var aBuf = new Array(); //è¾åºç¼å­
    var bPositive = true; //ä¿å­æ­£è´å¼æ è®°(true:æ­£æ°)
    /**
     * è¾åºå®é¿å­ç¬¦ä¸²ï¼ä¸å¤è¡¥0
     * <li>é­åå½æ°</li>
     * @param int iVal å¼
     * @param int iLen è¾åºçé¿åº¦
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
    bPositive = (mVal >= 0);//ååºæ­£è´å·
    fTmp = (isNaN(fTmp = parseFloat(mVal))) ? 0 : Math.abs(fTmp);//å¼ºå¶è½¬æ¢ä¸ºç»å¯¹å¼æ°æµ®ç¹
    //ææåå®¹ç¨æ­£æ°è§åå¤ç
    iInt = parseInt(fTmp); //åç¦»æ´æ°é¨å
    iFra = parseInt((fTmp - iInt) * Math.pow(10, iAccuracy) + 0.5); //åç¦»å°æ°é¨å(åèäºå¥)

    do {
        aBuf.unshift(funZero(iInt % 1000, 3));
    } while ((iInt = parseInt(iInt / 1000)));
    aBuf[0] = parseInt(aBuf[0]).toString();//æé«æ®µåºå»æåå¯¼0
    return ((bPositive) ? '' : '-') + aBuf.join(',') + '.' + ((0 === iFra) ? '00' : funZero(iFra, iAccuracy));
}

/**
* å°ååä½æ ¼å¼çæ°å­å­ç¬¦ä¸²è½¬æ¢ä¸ºæµ®ç¹æ°
* @public
* @param string sVal æ°å¼å­ç¬¦ä¸²
* @return float
*/
function unformatMoney(sVal) {
    var fTmp = parseFloat(sVal.toString().replace(/,/g, ''));
    return (isNaN(fTmp) ? 0 : fTmp);
}


//æµç¨å¤çï¼obj_idï¼å¤çå¯¹è±¡idï¼ flow_typeï¼æµç¨ç±»åï¼flow_sub_typeï¼æµç¨å­ç±»åï¼ ajax_configï¼æå®æµç¨æäº¤çå¤çæ¹æ³åèªå®ä¹ä¼ å°åå°çåæ°ï¼call_bakï¼æµç¨æäº¤æåååå°åè°å½æ°
//call_bak è¿ååæ°f_audit_type_id åå«noflowï¼æ æµç¨ï¼ãsubmitï¼æäº¤æåï¼
//ãä¸­ä¸éæ±ãåç¥¨æµç¨ä¸­ï¼è´¢å¡ãç®¡çåææéæäº¤ ç­å¾å«äººçå®¡æ ¸---åç¬å¤å¶ä¸ä¸ªæ¹æ³ï¼ç¨æ¥èµ°åç¥¨æµç¨ï¼is_flow:éç½®é¡¹ï¼trueï¼åç¥¨æµç¨ä¸­ï¼è´¢å¡ãç®¡çåææéæäº¤ ç­å¾å«äººçå®¡æ ¸ï¼falseï¼ä¸å¯ä»¥
function FlowSubmit_Invoice(obj_id, flow_type, flow_sub_type, ajax_config, call_back, is_flow) {

    var success = function (data) {
        switch (data.Result.status) {
            //æ è®°å½
            case -1:
                {
                    //æ æµç¨
                    if (!data.Result.is_enabled) {
                        //Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913213945891', 'æ æµç¨ï¼ç´æ¥æäº¤ï¼'), function () { if (call_back) { call_back({ f_audit_type_id: "noflow" }); } }, { icon: 'hits.gif', width: '250', height: '60' });
                        if (call_back) {
                            call_back({ f_audit_type_id: "noflow" });
                        }
                        return;
                    }
                    break;
                }
            //å·²å®æ
            case 5000:
                {
                    Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214026732', 'æµç¨å·²å®æï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
                            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', 'æ¨ä¸æ¯å½åæµç¨åçäººåï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
                            return;
                        }
                        else if (!(top.window._UserModel.RoleCode.indexOf("FA") > -1 || top.window._UserModel.RoleCode.indexOf("admin") > -1)) {
                            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S140913214335882', 'æ¨ä¸æ¯å½åæµç¨åçäººåï¼ä¸è½æäº¤ï¼'), null, { icon: 'hits.gif', width: '250', height: '60' });
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
            id: id, title: GetResource('S140915093746548', 'æµç¨æäº¤'),
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


//æ ¹æ®ååå·æ¥æå¼åå
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
                Box.Alert(GRESX.HINTS.TITLE, GetResource('S190525120600819', 'æªæ¾å°ååä¿¡æ¯'), null, { icon: 'fail.gif' });
                return;
            }
        }
        Ajax.Request("CaseInfo.ashx", { Call: "GetContractInfo", contract_no: contract_no }, success, true);
    }
    if (isContract) {
        top.window.AddBusinessTab('IC' + contract_id, GetResource('S170227181247838', 'åå') + "-" + title, url);
    }
}

// æ¡ä»¶åç§°éå é¢è§æ¡,æä¸ä¸æ çæåµ
CaseNameView = function () {
    var elem = "#case_new_name,#p_case_info__case_name"; // éè¦çå¬çæ§ä»¶
    var patt = /[<>]/
    var tip = "ä¸ä¸æ å¡«åæç¤º:&lt;sup&gt;ä¸æ &lt;/sup&gt;&lt;sub&gt;ä¸æ &lt;/sub&gt;"; // æç¤ºä¿¡æ¯

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
            // æ²¡æ'<>'æ¶ä¸éè¦é¢è§æ¡
            $("#case_name_view").remove();
            return;
        }

        // å¡«åäº'<>'æ¶æ¾ç¤ºé¢è§çª
        if ($("#case_name_view").length == 0) {
            var viewHtml = "<div style='border:1px solid black;position: absolute;background-color: white;padding:5px' id='case_name_view'>";
            viewHtml += "<p style='color:red;'>" + tip + "</p>";
            viewHtml += "<p style='font-weight:600;font-size:24px'>" + $case_name + "</p></div>";
            $this.after(viewHtml);
        }
        $("#case_name_view").find("p").eq(1).html($case_name);
    })
}
// æ¸ç©ºç¼å­å¹¶éæ°æ¸²æ


//#region layuiç»ä»¶
//å è½½è¡¨æ ¼åç° page é¡µé¢å¯¹è±¡,tableid è¡¨æ ¼id,è¡¨æ ¼å,è¯·æ±åæ°,åè°å½æ°
Ajax.LoadLayuiTable = function (page, tableid, url, cols, para, callback, opt, limit, limits, sync) {
    // =========================
    // å³é®è¡¥ä¸ï¼æ¯æ¬¡å è½½è¡¨æ ¼æ¸ç©ºå¾é
    // =========================
    window.__LAY_TABLE_CHECKED__ = window.__LAY_TABLE_CHECKED__ || {};
    window.__LAY_TABLE_CHECKED__[tableid] = {};

    if (page && page.table && page.table.cache && page.table.cache[tableid]) {
        const cacheData = page.table.cache[tableid];

        // æ£æ¥æ¯å¦æ¯æ°ç»æç±»æ°ç»å¯¹è±¡
        if (Array.isArray(cacheData)) {
            cacheData.forEach(function (row) {
                if (row) row.LAY_CHECKED = false;
            });
        } else if (cacheData && typeof cacheData === 'object') {
            // å¦ææ¯å¯¹è±¡ï¼éåå¯¹è±¡çå¼
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
    // æ¾ç¤ºå è½½å¨ç»ï¼ä»å½ sync = true æ¶ï¼
    var loadingIndex = -1;
    if (sync === true) {
        loadingIndex = layer.load(1, { shade: 0.2 }); // å è½½å¨ç»ï¼æ ·å¼1ï¼é®ç½©éæåº¦20%
    }

    if (!page || !page.table) {
        console.info("TIP:layuiè¡¨æ ¼å¯¹è±¡ç¼ºå¤±!");
        return;
    }
    // æ¸ç©ºç¼å­
    page.table.cache[tableid] = [];  // æ¸ç©ºç¼å­

    if (!limits) {
        limits = [10, 15, 20, 30, 50, 100, 200, 500, 1000, 9000000];
    }


    this.isCutPage = true;
    if (!!opt) {
        this.height = opt.height || 0;
        this.isCutPage = opt.isCutPage == undefined ? true : !!opt.isCutPage; // æ¯å¦åé¡µ
        this.defaultToolbar = opt.defaultToolbar; //æ¯å¦é»è®¤æç­é
    }

    // æ¥è¯¢æ¯å¦éç½®äºæ¾ç¤ºå
    var start_col_num = 0;
    var belongKey = url + "_" + para.Call;
    if (url.indexOf("/AjaxServers") > -1) {
        belongKey = url.substring(13) + "_" + para.Call
    }
    if (para.Call == 'BillSearch') {
        belongKey = url + '_' + tableid;
    }
    if (para.Call == 'ICSearchList') {//ä¸å©æ¥è¯¢ãåæ æ¥è¯¢ãçææ¥è¯¢éè¦ç²¾å¿åºå
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

    // èµå¼å®½åº¦
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
    para._t = new Date().getTime() // æ·»å æ¶é´æ³åæ°
    // è¡¨æ ¼éç½®
    var lay_config = {
        elem: '#' + tableid
        , url: url
        , where: para
        , height: this.height || 0
        , method: 'post'
        , parseData: function (res) {
            return {
                "code": (res.ClientInfo.Status && res.ClientInfo.Result) ? 0 : -1, //è§£ææ¥å£ç¶æ
                "msg": res.ClientInfo.Message, //è§£ææç¤ºææ¬
                "count": res.TableRowsCount, //è§£ææ°æ®é¿åº¦
                "data": res.TableRows //è§£ææ°æ®åè¡¨
            };
        }
        , request: {
            pageName: 'pageIndex', //é¡µç çåæ°åç§°ï¼é»è®¤ï¼page
            limitName: 'pageSize'  //æ¯é¡µæ°æ®éçåæ°åï¼é»è®¤ï¼limit
        }
        , done: function (res, curr, count) {
            // å³é­å è½½å¨ç»ï¼ä»å½ sync = true æ¶ï¼
            if (sync === true && loadingIndex !== -1) {
                layer.close(loadingIndex);
            }

            // å³é®ï¼ç»ä¸ checkbox UI ä¸åé¨ç¶æ
            setTimeout(function () {
                if (layui && layui.form) {
                    layui.form.render('checkbox');
                }
            }, 0);

            var show_div = $(".layui-table-tool-panel");
            if (callback && typeof (callback) == "function") {
                callback(res);
            }     

            ////å¦ææ¯å¼æ­¥è¯·æ±æ°æ®æ¹å¼ï¼reså³ä¸ºä½ æ¥å£è¿åçä¿¡æ¯ã
            //// åæ­¥å¾éæ¡ç¶æ
            //var checkStatus = page.table.checkStatus(tableid);
            //var selectedData = checkStatus.data; // è·åéä¸­çæ°æ®
            ////console.log(selectedData); // å¯ä»¥ç¨äºè°è¯ï¼æ£æ¥éä¸­çæ°æ®æ¯å¦æ­£ç¡®

            //// æ´æ°å¾éæ¡ç¶æï¼å¦ææå¶ä»èªå®ä¹éæ±ï¼
            //$("#" + tableid).next().find(".layui-table-box>.layui-table-body>table input[type='checkbox']").each(function () {
            //    var $checkbox = $(this);
            //    var rowData = page.table.cache[tableid][$checkbox.closest('tr').index()]; // è·åå½åè¡çæ°æ®
            //    if (rowData && rowData.LAY_CHECKED !== undefined) {
            //        // æ ¹æ®å®éæ°æ®åæ­¥å¾éæ¡ç¶æ
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
        , title: 'ç¨æ·æ°æ®è¡¨'
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

    // åæ¥çè¡¨æ ¼å±æ§éç½®
    var $this_old = $("#" + tableid + "_old");
    // æç´¢æé®
    if (!!$this_old.attr("showsearchbar")) {
        lay_config.searchbar = {
            placeholder: $this_old.attr("showsearchbar"), call: function () {
                para.searchKey = $("#lay_" + tableid + "_SearchKey").val();
                Ajax.LoadLayuiTable(page, tableid, url, para, callback, opt);
            }
        }
    }
    // å¯¼åºæé®/å¶ä»æé®
    lay_config.btns = [];
    if (!!$this_old.attr("btnnew")) {
        lay_config.btns.push({ text: $this_old.attr("btntext"), call: eval($this_old.attr('btnnew')) });
    }

    page.table.render(lay_config);

    //å¤´å·¥å·æ äºä»¶
    page.table.on('toolbar(' + tableid + ')', function (obj) {
        var checkStatus = page.table.checkStatus(obj.config.id);
        if (obj.event && typeof page[obj.event] == "function") {
            page[obj.event](checkStatus);
        }

        if (GetPublishConfig("tableSelect", "isNew")) {
            $(".layui-table-tool-panel").hide();
            var _title = GetResource('S220303155728684', 'èªå®ä¹åæ¾ç¤ºæ ä½');
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

                    // èµå¼å®½åº¦
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

    //çå¬è¡å·¥å·äºä»¶
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
                        //å¦æéæ©æ¡è¢«ç¦ç¨ï¼åä¸åè®¸æ¹éæ©æ¡è¢«å¨éå¾é
                        if ($(this).is(":disabled")) {
                            $(this).attr("checked", false);
                            $(this).next().removeClass("layui-form-checked");
                            //æ¸é¤æ°æ®ç¼å­
                            page.table.cache[tableid][i].LAY_CHECKED = false;
                        }
                    });
                }
            }
        });
    }

}






Ajax.reload = function (tableid, page) {
    //æ§è¡éè½½
    page.table.reload(tableid, page);
}

var target_column;
var save_seq;
var drag = function (ev) {
    // å¼å®¹ç«çæµè§å¨
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

//è·å¾ä½¿ç¨layuiç»ä»¶çæçè¡¨æ ¼éä¸­çæ¯ä¸è¡çid
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
 * è¡¨æ ¼è½¬æ¢ä¸ºlayuiè¡¨æ ¼
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
                // æå°å°ºå¯¸
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
                    //è®¾ç½®é»è®¤å®½åº¦  é²æ­¢åå®½åº¦è¿å°æ¤æä¸å¨
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
//è®¾ç½®è¡¨æ ¼æ¾ç¤ºå­æ®µçå®½åº¦
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

//æ ¹æ®æ¡ä»¶ç±»åæ¥è¯¢åºå¤çäºé¡¹
function LoadCtrlProcByCaseType(_CaseType) {
    function Success(_Meta) {
        CtrlProcList = null;
        CtrlProcList = _Meta.CtrlProcList;
    }
    Ajax.Request('Common.ashx', { Call: 'LoadCtrlProcByCaseType', CaseType: _CaseType }, Success, true);
    return CtrlProcList;
}

//è®¾ç½®å¾åæ°æ®å·²è¯»æªè¯»
function AddCurUserReadLog(obj_id) {
    Ajax.Request("Common.ashx", { Call: "AddCurUserReadLog", obj_id: obj_id }, null, false, null, false);
}

///éè¿æå±åé¨è·åé¨é¨
function GetChargeByBranch(obj) {
    var Charge = [];
    function Success(_Meta) {
        Charge = _Meta.ChargeList;
    }
    Ajax.Request("Common.ashx", { Call: "GetChargeByBranch", obj_id: obj }, Success, true);
    return Charge;
}

///éè¿é¨é¨è·åé¨é¨æå
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
{ id: "notype", name: "å¶ä»", value: "å¶ä»" }]

///å»æå¶ä»çç¹æ®å­ç¬¦
$.ReplcaOtheStr = function (str) {
    return str.replace(/[\r\n]/g, "").replace(/&/g, "").replace(/</g, "").replace(/>/g, "").replace(/'/g, "").replace(/"/g, "");
}



$.ReplcaOtheStr1 = function (str) {
    return str.replace(/'/g, "&ap1");
}



//å è½½åæ æ³æ¡
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

//å è½½æ¶é´æ§ä»¶å¤è¯­è¨
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

//æ·»å å¿å¡«æå·
function AddRedStar(ids) {
    if (ids) {
        var mustArr = ids.split(/[,;ï¼ï¼]/);
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

//æ¥è¯¢è´¹ç¨ç±»å
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

///æ¼æ¥ææ¹æå·
function contactCaseVolume(case_volume, case_volume_extend) {
    var empty = "";
    case_volume = case_volume || empty;
    case_volume_extend = case_volume_extend || empty;
    if (case_volume_extend == empty)
        return case_volume;
    return case_volume + '-' + case_volume_extend;
}

///æ ¼å¼åæ¥ææ¶é´
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

//å¯¹è±¡åºåå
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
 * ä¸ºStringå¯¹è±¡æ©å±çformatæ¹æ³
 * @return {String} è¿åéè¿formatæ ¼å¼ååçæ°å­ç¬¦ä¸²
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
 * ä¸ºArrayæ©å±çæ¥æ¾ææå¹éçåç´ 
 * @param {function} fn å¤æ­æ¯å¦ç¸ç­çæ¹æ³
 * @return {Object} è¿åä¸ä¸ªæ°æ°ç»ï¼æ°ç»ä¸­åå«ææå¹éçåç´ 
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

//æ°è¡¨æ ¼éæ©èªå®ä¹æ ä½åï¼ç¹å»ç©ºç½é¡µè§¦åæ¹æ³
function SetTableToolFun(tableid, callback) {
    if (callback && typeof (callback) == "function") {
        $(document).bind("click", function (e) {
            if ($("#" + tableid).find(".layui-table-tool-panel").length == 1 && $(e.target).closest(".layui-table-tool-panel").length == 0) {
                callback();
            }
        })
    }
}

//è·åå½åä¿¡æ¯çæåæ´æ°æ¶é´
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
                        Box.Confirm(GRESX.HINTS.TITLE, GetResource('S210717100504193', 'å½åé¡µé¢å·²æææ°æ°æ®ï¼æ¯å¦å·æ°ï¼'), function () {
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

    //1.åå»é¤ç©ºæ ¼,å¤æ­æ¯å¦ç©ºå¼åéæ°
    if (fixed_dot || fixed_dot == 0) {
        num = parseFloat(num);
        num = num.toFixed(fixed_dot);
    } else {
        num = num + "";
    }
    //num = num.toString();
    num = num.replace(/[ ]/g, ""); //å»é¤ç©ºæ ¼
    if (num == "") {
        return;
    }
    if (isNaN(num)) {
        return;
    }
    //2.éå¯¹æ¯å¦æå°æ°ç¹ï¼åæåµå¤ç
    var index = num.indexOf(".");
    if (index == -1) {//æ å°æ°ç¹
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



var ES_TAX_TYPE = [{ text: "åå«", value: "IN" }, { text: "å¤å ", value: "OUT" }];
var CURRENCY_NTD = 'NTD';//æ°å°å¸
//è®¡ç®ç¨ç
var fnEssenCalTaxAmount = function (currency_id, tax_rate, tax_type, amount) {
    var isRoundWithoutDecimal = currency_id == CURRENCY_NTD; //å°å¸ åèäºå¥åæ´
    amount = parseFloat(amount);
    tax_rate = parseFloat(tax_rate);
    var withTax = amount;
    var unTax = amount;
    var tax = 0;
    if (tax_rate && tax_type && amount != 0) {
        if (tax_type == 'IN') {
            tax = (amount * tax_rate);
            if (isRoundWithoutDecimal) {//åèäºå¥åæ´
                tax = math.round(tax);
            }
            unTax = (amount - tax);
            withTax = amount;
        } else if (tax_type == 'OUT') {
            tax = (amount * tax_rate);
            if (isRoundWithoutDecimal) {//åèäºå¥åæ´
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
                if (tax_id == 'TaxT01') {//æ§è¡ä¸å¡æå¾ 10%
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
** ä¹æ³å½æ°ï¼ç¨æ¥å¾å°ç²¾ç¡®çä¹æ³ç»æ
** è¯´æï¼javascriptçä¹æ³ç»æä¼æè¯¯å·®ï¼å¨ä¸¤ä¸ªæµ®ç¹æ°ç¸ä¹çæ¶åä¼æ¯è¾ææ¾ãè¿ä¸ªå½æ°è¿åè¾ä¸ºç²¾ç¡®çä¹æ³ç»æã
** è°ç¨ï¼accMul(arg1,arg2)
** è¿åå¼ï¼arg1ä¹ä»¥ arg2çç²¾ç¡®ç»æ
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
// ç»Numberç±»åå¢å ä¸ä¸ªmulæ¹æ³ï¼è°ç¨èµ·æ¥æ´å æ¹ä¾¿ã
Number.prototype.mul = function (arg) {
    return accMul(arg, this);
};

/**
 * è·³è½¬å°Patmasteræ ¸ç¨¿é¡µé¢å¯¹å½åæä»¶è¿è¡æ ¸ç¨¿
 * @param {any} fileNo
 * @param {any} fileName
 * @param {any} fileDesc
 */
async function ToPatmaster(fileNo, fileName, fileDesc, caseId, procId, caseVolume = null) {
    if (GetPublishConfig('ZTDZ', '20241118')) {
        var case_volume = caseVolume || $("#p_case_info__case_volume").val();

        var errorFlag1 = fileDesc.indexOf("æ°ç³è¯·ææ¡£") < 0
        var errorFlag2 = fileName.endsWith('.doc')
        var errorFlag3 = fileName.indexOf(case_volume) == -1

        var openFlag = true

        if (errorFlag1) {
            openFlag = false
            Box.Tips(GRESX.HINTS.TITLE, 3, GetResource('S161012151216889', 'PatMasteréè¦ãæ¬ææä»¶ã-ãæ°ç³è¯·ææ¡£ãæè½æ ¸ç¨¿!'), null, { icon: 'hits.gif', width: 200 });
        }
        if (openFlag && errorFlag2) {
            openFlag = false
            openFlag = await Box.ConfirmAsync(GRESX.HINTS.TITLE, 'PMæ ¸ç¨¿éè¦docxæ ¼å¼çææ¡£ï¼å½åææ¡£ä¸ºdocæ ¼å¼ï¼æ¯å¦ç»§ç»­ï¼', function () {
            }, { icon: 'hits.gif', width: '250' });
        }
        if (openFlag && errorFlag3) {
            openFlag = false
            openFlag = await Box.ConfirmAsync(GRESX.HINTS.TITLE, 'éä»¶åç§°ä¸­ä¸å«ææ¡å·ï¼æ¯å¦ç»§ç»­ï¼', function () {
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
        //è·åä¸äºæ¬æçåæ°
        var success = function (_Mata) {
            var companyInfo = _Mata.CompanyInfo;
            company_id = companyInfo.company_id;
            company_name = companyInfo.company_name_cn;

            //è·åç¬¬äºä¸ªææ åçæ°æ®

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
 * æ ¹æ®é®ä»¶æ ç­¾èæ¯è²è¿åå¯è¯»çæå­é¢è²ã
 * æµè²èæ¯ä½¿ç¨æ·±è²æå­ï¼æ·±è²èæ¯ä½¿ç¨ç½è²æå­ï¼éæææ æ³è¯å«çé¢è²é»è®¤æ·±è²ã
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
            if (tax_id == 'TaxT01') {//æ§è¡ä¸å¡æå¾ 10%
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
