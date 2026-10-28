
var Box = new Object();
var Boxsetting = {
    title: GRESX.HINTS.TITLE, yes: GRESX.HINTS.YES, no: GRESX.HINTS.NO, width: '300px', height: '60px'
}


/***************************************************
弹出提示框，
参数：_Title:标题，默认为系统消息，_Message:提示的信息 
huangzs 单独加个buttonCallBack(CallBack会在关闭和点击按钮都触发,导致部分错误的逻辑,buttonCallBack只在按钮点击触发)
***************************************************/
Box.Alert = function (_Title, _Message, _Url, _Config,_Errorcode) {
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var _Callback = null;
    var _ButtonCallBack = null;
    var _Icon = ''; var _Width = Boxsetting.width; var _Height = Boxsetting.height;
    if (_Config != '' && _Config != null && typeof (_Config) != "undefined") {
        if (_Config.width != '' && _Config.width != null && typeof (_Config.width) != "undefined") {
            _Width = _Config.width.toString().replace(/px/, '') + 'px';
        }
        if (_Config.height != '' && _Config.height != null && typeof (_Config.height) != "undefined") {
            _Height = _Config.height.toString().replace(/px/, '') + 'px';
        }
        if (_Config.icon != '' && _Config.icon != null && typeof (_Config.icon) != "undefined") {
            _Icon = _Config.icon;
        }
        _Callback = _Config.callback;
        _ButtonCallBack = !!_Config.buttonCallBack ? _Config.buttonCallBack : _Callback;
    }
    if (_Title == '' || _Title == null || typeof (_Title) == "undefined") {
        _Title = Boxsetting.title;
    }

    _Message = "<span style='font-size:13px;'>" + _Message + "</span>";


    if (_Errorcode != '' && _Errorcode != null && typeof (_Errorcode) != "undefined") {
        _Errorcode = "<div class='ui_error'><span style='font-size:13px; margin-top:7px;margin-left:35px;display:block;color: #0000FF;cursor:Pointer;' onclick=\"SkipFAQ('" + _Errorcode + "')\">" + GetResource('S200829232715967', '点此查看解决方法') + "</span></div>";
        _Message += _Errorcode;
    }
    if (_Url == '' || _Url == null || typeof (_Url) == "undefined") {
        if (_Api == null || typeof (_Api) == "undefined") {
            var fun = $.dialog;
            if (!fun) {
                fun = window.top.$.dialog;
            }
            fun({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                focus: true, icon: _Icon,
                button: [{ name: Boxsetting.yes, focus: true, callback: _ButtonCallBack }],
                close: function () {
                    try {
                        if (_Callback) {
                            _Callback();
                        }
                    } catch (e) {
                        return true;
                    }
                }
            });
        } else {
            var _Name = _Api.iframe.name;
            Opener = _Api.opener;
            Opener.$.dialog({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                parent: _Api, focus: true, icon: _Icon,
                button: [{ name: Boxsetting.yes, focus: true }],
                close: function () {
                    try {
                        if (_Name != null) {
                            Opener.$.dialog({ id: _Name });
                        }
                        if (_Callback) {
                            _Callback();
                        }
                    } catch (e) {
                        return true;
                    }
                }
            });
        }
    } else {
        if (_Api == null || typeof (_Api) == "undefined") {
            $.dialog({
                title: _Title, content: _Message, lock: true, icon: _Icon,
                width: _Width, height: _Height, resize: false, max: false,
                min: false,
                ok: function () {
                    if (typeof (_Url) == "undefined" || _Url == '' || _Url == null) {
                        this.reload();
                    } else {
                        location.href = _Url;
                    }
                },
                close: function () {
                    if (typeof (_Url) == "undefined" || _Url == '' || _Url == null) {
                        this.reload();
                    } else {
                        location.href = _Url;
                    }
                }
            });
        } else {
            _Url = GUrl + '/' + _Url;
            Opener = _Api.opener;
            Opener.$.dialog({
                title: _Title, content: _Message, lock: true, icon: _Icon,
                parent: _Api, width: _Width, height: _Height,
                resize: false, max: false, min: false,
                ok: function () {
                    if (typeof (_Url) == "undefined" || _Url == '' || _Url == null) {
                        this.reload();
                    } else {
                        location.href = _Url;
                    }
                },
                close: function () {

                    if (typeof (_Url) == "undefined" || _Url == '' || _Url == null) {
                        this.reload();
                    } else {
                        location.href = _Url;
                    }
                }
            });
        }
    }
}

Box.Confirm = function (_Title, _Message, _Callback, _Config, _CancelCall) {
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var _Icon = '';
    var _Width = Boxsetting.width;
    var _Height = Boxsetting.height;
    if (_Config != '' && _Config != null && typeof (_Config) != "undefined") {
        if (_Config.width != '' && _Config.width != null && typeof (_Config.width) != "undefined") {
            _Width = _Config.width.toString().replace(/px/, '') + 'px';
        }
        if (_Config.height != '' && _Config.height != null && typeof (_Config.height) != "undefined") {
            _Height = _Config.height.toString().replace(/px/, '') + 'px';
        }
        if (_Config.icon != '' && _Config.icon != null && typeof (_Config.icon) != "undefined") {
            _Icon = _Config.icon;
        }
        //弹出框按钮改变
        if (_Config.typeface_yes != '' && _Config.typeface_yes != null && typeof (_Config.typeface_yes) != "undefined") {
            Boxsetting.yes = _Config.typeface_yes;
        }
        if (_Config.typeface_no != '' && _Config.typeface_no != null && typeof (_Config.typeface_no) != "undefined") {
            Boxsetting.no = _Config.typeface_no;
        }
    }
    if (_Title == '' || _Title == null || _Title == undefined) {
        _Title = Boxsetting.title
    }
    _Message = "<span style='font-size:13px;'>" + _Message + "</span>";
    if (_Api == null || typeof (_Api) == "undefined") {
        $.dialog({
            title: _Title, content: _Message, lock: true, width: _Width, resize: false, id: _Config.id || 'Confirmid',
            height: _Height, max: false, min: false, icon: _Icon,
            button: [
                { name: Boxsetting.yes, callback: _Callback },
                { name: Boxsetting.no, focus: true, callback: _CancelCall }]
        });
    }
    else {
        var _opener = _Api.opener;
        var _Name = _Api.iframe.name;
        /*如果是多层弹出框,在弹出警告窗之后用户选择取消,且此时_CancelCall 回调函数为空,需要添加一个激活父窗口的放,避免二次点击无效的情况*/
        //        if (_CancelCall == null || _CancelCall == '' || typeof (_CancelCall) == 'undefined') {
        //            _CancelCall = function () {
        //                if (_Name != null && typeof (_Name) != 'undefined') {
        //                    _opener.$.dialog({ id: _Name });
        //                }
        //            }
        //        }
        _opener.$.dialog({
            title: _Title, content: _Message, lock: true, width: _Width, resize: false, id: 'Confirmid',
            height: _Height, max: false, min: false, icon: _Icon, parent: _Api,
            button: [
                { name: Boxsetting.yes, callback: _Callback },
                { name: Boxsetting.no, focus: true, callback: _CancelCall }],
            close: function () {
                try {
                    if (_Name != null && typeof (_Name) != 'undefined') {
                        _opener.$.dialog({ id: _Name });
                    }
                } catch (e) {
                    return true;
                }

            }
        })
    }
}

/**
 * 同步确认框
 */
Box.ConfirmAsync = async function (_Title, _Message, _Callback, _Config, _CancelCall) {
    return new Promise((resolve, reject) => {
        Box.Confirm(GRESX.HINTS.TITLE, _Message, function () {
            if (_Callback) {
                _Callback();
            }
            resolve(true);
        }, _Config, function () {
            if (_CancelCall) {
                _CancelCall();
            }
            resolve(false);
        });
    });
}

Box.ConfirmNew = function (_Title, _Message, _Callback, _Config, _CancelCall) {
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var _Icon = '';
    var _Width = Boxsetting.width;
    var _Height = Boxsetting.height;
    if (_Config != '' && _Config != null && typeof (_Config) != "undefined") {
        if (_Config.width != '' && _Config.width != null && typeof (_Config.width) != "undefined") {
            _Width = _Config.width.toString().replace(/px/, '') + 'px';
        }
        if (_Config.height != '' && _Config.height != null && typeof (_Config.height) != "undefined") {
            _Height = _Config.height.toString().replace(/px/, '') + 'px';
        }
        if (_Config.icon != '' && _Config.icon != null && typeof (_Config.icon) != "undefined") {
            _Icon = _Config.icon;
        }
        //弹出框按钮改变
        if (_Config.typeface_yes != '' && _Config.typeface_yes != null && typeof (_Config.typeface_yes) != "undefined") {
            Boxsetting.yes = _Config.typeface_yes;
        }
        if (_Config.typeface_no != '' && _Config.typeface_no != null && typeof (_Config.typeface_no) != "undefined") {
            Boxsetting.no = _Config.typeface_no;
        }
    }
    if (_Title == '' || _Title == null || _Title == undefined) {
        _Title = Boxsetting.title
    }
    _Message = "<span style='font-size:13px;'>" + _Message + "</span>";
    if (_Api == null || typeof (_Api) == "undefined") {
        $.dialog({
            title: _Title, content: _Message, lock: true, width: _Width, resize: false, id: _Config.id || 'Confirmid',
            height: _Height, max: false, min: false, icon: _Icon,
            button: [
                { name: Boxsetting.yes, focus: true, callback: _Callback },
                { name: Boxsetting.no, callback: _CancelCall}]
        });
    }
    else {
        var _opener = _Api.opener;
        var _Name = _Api.iframe.name;
        /*如果是多层弹出框,在弹出警告窗之后用户选择取消,且此时_CancelCall 回调函数为空,需要添加一个激活父窗口的放,避免二次点击无效的情况*/
        //        if (_CancelCall == null || _CancelCall == '' || typeof (_CancelCall) == 'undefined') {
        //            _CancelCall = function () {
        //                if (_Name != null && typeof (_Name) != 'undefined') {
        //                    _opener.$.dialog({ id: _Name });
        //                }
        //            }
        //        }
        _opener.$.dialog({
            title: _Title, content: _Message, lock: true, width: _Width, resize: false, id: 'Confirmid',
            height: _Height, max: false, min: false, icon: _Icon, parent: _Api,
            button: [
                { name: Boxsetting.yes, focus: true, callback: _Callback },
                { name: Boxsetting.no, callback: _CancelCall },
                ],
            close: function () {
                try {
                    if (_Name != null && typeof (_Name) != 'undefined') {
                        _opener.$.dialog({ id: _Name });
                    }
                } catch (e) {
                    return true;
                }

            }
        })
    }
}

//返回多值
Box.Html = function (title, html, fn, IdArray, _Cancelfn) {
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var result = {};
    if (_Api == null || typeof (_Api) == "undefined") {
        return $.dialog({
            title: title,
            id: 'BoxHtml',
            max: false,
            min: false,
            fixed: true,
            width: Box.Width,
            height: Box.Height,
            lock: true,
            content: [
                    '<div>' + html + '</div>'
            ].join(''),
            init: function () {
            },
            button: [
               {
                   name: Boxsetting.yes, callback: function () {
                       var $w = $(this.DOM.content[0]);
                       for (var i = 0; i < IdArray.length; i++) {
                           result[IdArray[i]] = $w.find("#" + IdArray[i]).val();
                       }
                       return fn && fn.call(this, result);
                   }, focus: true
               },
              {
                  name: Boxsetting.no, callback: function () {
                      return _Cancelfn && _Cancelfn.call(this, null);
                  }, focus: false
              }
            ]
        });
    }
    else {
        var _opener = _Api.opener;
        return _opener.$.dialog({
            title: title,
            id: 'BoxHtml',
            max: false,
            min: false,
            fixed: true,
            width: Box.Width,
            height: Box.Height,
            lock: true,
            content: [
                    '<div>' + html + '</div>'
            ].join(''),
            init: function () {
            },
            button: [
               {
                   name: Boxsetting.yes, callback: function () {
                       var $w = $(this.DOM.content[0]);
                       for (var i = 0; i < IdArray.length; i++) {
                           result[IdArray[i]] = $w.find("#" + IdArray[i]).val();
                       }
                       return fn && fn.call(this, result);
                   }, focus: true
               },
              {
                  name: Boxsetting.no, callback: function () {
                      return _Cancelfn && _Cancelfn.call(this, null);
                  }, focus: false
              }
            ]
        });
    }
}
//返回单值
Box.InputNote = function (title, _Message, fn, _TagName, _Cancelfn) {
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var input;
    if (_Api == null || typeof (_Api) == "undefined") {
        return $.dialog({
            title: title,
            id: 'InputNote',
            max: false,
            min: false,
            fixed: true,
            width: Box.Width,
            height: Box.Height,
            lock: true,
            content: [
                    '<div>' + _Message + '</div>'
            ].join(''),
            init: function () {
                //if (_TagName == "input") {
                input = this.DOM.content[0].getElementsByTagName(_TagName)[0];
                input.select();
                input.focus();
                //                }
                //                if (_TagName == "select") {
                //                    input = this.DOM.content[0].getElementsByTagName('select')[0];
                //                }
            },

            button: [
               {
                   name: Boxsetting.yes, callback: function () {
                       return fn && fn.call(this, input.value);
                   }, focus: true
               },
              {
                  name: Boxsetting.no, callback: function () {
                      return _Cancelfn && _Cancelfn.call(this, "");
                  }, focus: false
              }
            ]
        });
    }
    else {
        var _opener = _Api.opener;
        return _opener.$.dialog({
            title: title,
            id: 'InputNote',
            max: false,
            min: false,
            fixed: true,
            width: Box.Width,
            height: Box.Height,
            lock: true,
            content: [
                    '<div>' + _Message + '</div>'
            ].join(''),
            init: function () {
                ///if (_TagName == "input") {
                input = this.DOM.content[0].getElementsByTagName(_TagName)[0];
                input.select();
                input.focus();
                //  }
            },

            button: [
               {
                   name: Boxsetting.yes, callback: function () {
                       return fn && fn.call(this, input.value);
                   }, focus: true
               },
              {
                  name: Boxsetting.no, callback: function () {
                      return _Cancelfn && _Cancelfn.call(this, "");
                  }, focus: false
              }
            ]
        });
    }
}

///注意:_Close参数为是否需要关闭上层弹出窗,默认为false 
///_Errorcode 为错误编码
Box.Message = function (_Title, _Message, _Callback, _Config, _Close, _Errorcode) {
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var _Icon = '';
    var _Width = Boxsetting.width;
    var _Height = Boxsetting.height;
    if (_Config != '' && _Config != null && typeof (_Config) != "undefined") {
        if (_Config.width != '' && _Config.width != null && typeof (_Config.width) != "undefined") {
            _Width = _Config.width.toString().replace(/px/, '') + 'px';
        }
        if (_Config.height != '' && _Config.height != null && typeof (_Config.height) != "undefined") {
            _Height = _Config.height.toString().replace(/px/, '') + 'px';
        }
        if (_Config.icon != '' && _Config.icon != null && typeof (_Config.icon) != "undefined") {
            _Icon = _Config.icon;
        }
    }
    if (_Title == '' || _Title == null || typeof (_Title) == "undefined") {
        _Title = Boxsetting.title;
    }
        _Message = "<span style='font-size:13px;'>" + _Message + "</span>";
    if (_Errorcode != '' && _Errorcode != null && typeof (_Errorcode) != "undefined") {
        _Errorcode = "<div class='ui_error'><span style='font-size:13px; margin-top:7px;margin-left:35px;display:block;color: #0000FF;cursor:Pointer;' onclick=\"SkipFAQ('" + _Errorcode + "')\">点此查看解决方法</span></div>";
        _Message += _Errorcode;
    }

    if (_Api == null || typeof (_Api) == "undefined") {
        $.dialog({
            title: _Title, content: _Message,
            lock: true, icon: _Icon,
            width: _Width, height: _Height,
            max: false, min: false, resize: false, id: 'Message',
            close: function () {
            if (_Name != null) {
                _opener.$.dialog({ id: _Name });
            }
            if (_Callback) {
                _Callback();
            }
                /*將CallBack放在此處*/
             },
            button: [
            { name: Boxsetting.yes, focus: true, callback: null }
            ]
        });
    } else {
        var _Name = _Api.iframe.name;
        var _opener = _Api.opener;
        var _Parent = null;
        /*默认为上一层做父页面，只有当_Callback方法中包含关闭上一层页面的时候将底层页面作为父页面*/
        if (!_Close) {// == '' || _Close == null) {
            _Parent = _Api;
        }
        _opener.$.dialog({
            title: _Title, content: _Message,
            lock: true, icon: _Icon,
            width: _Width, height: _Height,
            max: false, min: false, resize: false, id: 'Message', parent: _Parent,
            close: function () {
                if (_Name != null) {
                    _opener.$.dialog({ id: _Name });
                }
                if (_Callback) {
                    _Callback();
                }
                /*將CallBack放在此處
                ,避免在多層彈出框如果此回調函數是使用聚焦頁面某個控件時因為dialog聚焦導致回調函數不起作用*/
            },
            button: [
            { name: Boxsetting.yes, focus: true, callback: null }
            ]
        });
    }
}


///注意这个方法,_Url支持两种形式的参数,一种是链接形式,即字符串,调用的时候只需要传递根目录以下的路径即可,方法内部会自动补齐前缀路径
/// 第二种是function形式,即方法,注意类似于Message,如果这个回调函数会关闭上一层页面,最后一个参数(_Close)为 true
Box.Tips = function (_Title, _Time, _Message, _Url, _Config, _Close, _Errorcode) {
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var _Icon = ''; var _Width = Boxsetting.width; var _Height = Boxsetting.height;
    if (_Config != '' && _Config != null && typeof (_Config) != "undefined") {
        if (_Config.width != '' && _Config.width != null && typeof (_Config.width) != "undefined") {
            _Width = _Config.width.toString().replace(/px/, '') + 'px';
        }
        if (_Config.height != '' && _Config.height != null && typeof (_Config.height) != "undefined") {
            _Height = _Config.height.toString().replace(/px/, '') + 'px';
        }
        if (_Config.icon != '' && _Config.icon != null && typeof (_Config.icon) != "undefined") {
            _Icon = _Config.icon;
        }
    }
    if (_Title == '' || _Title == null || typeof (_Title) == "undefined") {
        _Title = Boxsetting.title;
    }
    if (_Time == '' || _Time == null || typeof (_Time) == 'underfined') {
        _Time = 3;
    }
    _Message = "<span style='font-size:13px;'>" + _Message + "</span>";
    if (_Errorcode != '' && _Errorcode != null && typeof (_Errorcode) != "undefined") {
        _Errorcode = "<div class='ui_error'><span style='font-size:13px; margin-top:7px;margin-left:35px;display:block;color: #0000FF;cursor:Pointer;' onclick=\"SkipFAQ('" + _Errorcode + "')\">点此查看解决方法</span></div>";
        _Message += _Errorcode;
    }
    if (_Url == '' || _Url == null || typeof (_Url) == 'undefined') {
        if (_Api == null || typeof (_Api) == "undefined") {
            $.dialog({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                focus: true, icon: _Icon,
                time: _Time
            });
        }
        else {
            var _Name = _Api.iframe.name;
            var Opener = _Api.opener;
            Opener.$.dialog({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                parent: _Api, focus: true, icon: _Icon, time: _Time,
                close: function () {
                    try {
                        Opener.$.dialog({ id: _Api.iframe.name });
                    } catch (e) {
                        return true;
                    }

                }
            });
        }
    }
    else if (typeof (_Url) == 'string') {
        if (!_Api) {
            $.dialog({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                focus: true, icon: _Icon, time: _Time,
                close: function () {
                    top.location.href = GUrl + _Url;
                }
            });
        }
        else {
            var _Name = _Api.iframe.name;
            var Opener = _Api.opener;
            Opener.$.dialog({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                parent: _Api, focus: true, icon: _Icon, time: _Time,
                close: function () {
                    top.location.href = GUrl + _Url;
                }
            });
        }
    }
    else if (typeof (_Url) == 'function') {
        if (!_Api) {
            $.dialog({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                focus: true, icon: _Icon, time: _Time,
                close: function () {
                    try {
                        _Url();
                    } catch (e) {
                        return true;
                    }
                }
            });
        }
        else {
            var _Name = _Api.iframe.name;
            var Opener = _Api.opener;
            //var _Parent = null;
            //if (!_Close) {
            //    _Parent = _Api;
            //}
            var t_api = Opener.$.dialog({
                title: _Title, content: _Message, lock: true, width: _Width,
                height: _Height, max: false, min: false, resize: false,
                parent: _Api, focus: true, icon: _Icon, cancel: false,
                close: function () {
                    Opener.$.dialog({ id: _Name });
                }
            });

            setTimeout(function () { t_api.close(); _Url(); }, _Time * 1000);
        }

    }
}





///注意:_Close参数为是否需要关闭上层弹出窗,默认为false
Box.img = function (_Title, _Message, _Callback, _Config, _Close) {
    var _Api = null;
    if (frameElement != null && typeof (frameElement) != "undefined") {
        _Api = frameElement.api;
    }
    var _Icon = '';
    var _Width = "500px";
    var _Height = "400px";
    if (_Config != '' && _Config != null && typeof (_Config) != "undefined") {
        if (_Config.width != '' && _Config.width != null && typeof (_Config.width) != "undefined") {
            _Width = _Config.width.toString().replace(/px/, '') + 'px';
        }
        if (_Config.height != '' && _Config.height != null && typeof (_Config.height) != "undefined") {
            _Height = _Config.height.toString().replace(/px/, '') + 'px';
        }
        if (_Config.icon != '' && _Config.icon != null && typeof (_Config.icon) != "undefined") {
            _Icon = _Config.icon;
        }
    }
    if (_Title == '' || _Title == null || typeof (_Title) == "undefined") {
        _Title = Boxsetting.title;
    }
    _Message = "<img src='" + _Message + "' width='99%'/>";
    if (_Api == null || typeof (_Api) == "undefined") {
        $.dialog({
            title: _Title, content: _Message,
            lock: true, icon: _Icon,
            width: _Width, height: _Height,
            max: false, min: false, resize: false, id: 'Message'
        });
    } 
}