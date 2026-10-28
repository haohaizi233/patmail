
(function ($) {
    //加载用户树
    $.fn.TreeUser = function (options) {

        //以下为该插件的属性及其默认值 
        var deafult = {
            tree_id: 'Tree',
            SelectType: 'radio',           //树选择的方式 单选 radio 多选 checkbox
            data: null,
            onClick: null,
            onCheck: null,
            beforeClick: null,
            width: null, //只要传数字
            height: null, //只要传数字
            showLine: true, //是否显示连接线
            showIcon: true, //是否显示图标
            search: true,
            fullpath: false, //是获取所有父节点路径
            selected: [],     //被选中的结果集,里边是一个对象{id:'',name:''} 
            fulltag: ',',//路径隔开的字符
            expandAll: false,//是否默认全部展开
            pcheck: false,//父节点是否可以勾选 默认否
            charge: false,//是否只允许承办部门可勾选，默认否  
            chkboxType: { "Y": "s", "N": "ps" },  // checkbox 类型: Y:被勾选时, N:取消勾选时, p:关联父, s:关联子 
            only_leaf: true, //是否只取叶子的值，默认是
            onSure:null,//点击确定保存
        };
        var Tree = {};
        var zTree = "";
        var ops = $.extend(deafult, options);
        var objini = $(this);
        var oldval = '';
        var oldobjid = '';
        var id = objini.attr('id');
        objini.attr("readonly", "readonly").addClass("li_down");//这种选择的只能选择、不让输入
        //objini.after('<i class="layui-icon" style="color: #77A12A; margin-left: -20px;">&#xe625;</i>');

        var _width = (ops.width) ? ops.width : $(this).width() - 30;
        var _height = (ops.height) ? ops.height : 350;
        var TreeUserItem = '<div  style ="width:' + _width + 'px;" id="' + id + '_treeUser" class="TreeUserItem" >';
        if (ops.search) {
            if (top.window._UserModel.Language == "en_us")
            {
                TreeUserItem += '<div  style="padding:6px 3px 0px 3px;"><input id="' + ops.tree_id + 'txtSearch" type="text"  class="input_search02 searchInput02"  style="width: ' + (_width - 110) + 'px; padding-left: 19px;" /><a id="' + ops.tree_id + 'a_search" href="javascript:void(0)" class="btn-search02" style="color:#fff;padding:5px 16px;" >' + GetResource("S140808093939448", "查询") + '</a></div>';
            }
            else
            {
                TreeUserItem += '<div  style="padding:6px 3px 0px 3px;"><input id="' + ops.tree_id + 'txtSearch" type="text"  class="input_search02 searchInput02"  style="width: ' + (_width - 110) + 'px; padding-left: 19px;" /><a id="' + ops.tree_id + 'a_search" href="javascript:void(0)" class="btn-search02" style="color:#fff;" >' + GetResource("S140808093939448", "查询") + '</a></div>';
            }
           
        }
        var hasAllChecked = "";
        if (ops.SelectType == "checkbox") {
            hasAllChecked = '&nbsp;&nbsp;&nbsp;<a style="color:#fff;" id="' + ops.tree_id + 'a_selectall" class="btn-style-01" href="javascript:void(0)">'
                + GetResource('S140829115344500', '全选') + '</a>';
        }
        TreeUserItem += '<ul id="' + ops.tree_id + '" class="ztree" style="max-height:450px;margin-top: 0; width: auto; height: ' + _height
           + 'px;border: 0; overflow-y: auto; border-top: 0px;"></ul>' + '<div style="border-top: 1px solid #e4e4e4; text-align: center;">'
           + '<a  class="btn-style-01 " style="color:#fff;" id="'
           + ops.tree_id + 'a_cancel" href="javascript:void(0)">' + GetResource('S160527142355991', '清除') + '</a>&nbsp;&nbsp;&nbsp;<a style="color:#fff;" id="'
           + ops.tree_id + 'a_ok" class="btn-style-01" href="javascript:void(0)">' + GetResource('S140808093304465', '确定')
            + '</a>' + hasAllChecked + '</div></div>';
        $(this).after(TreeUserItem);
        $(this).bind('click', function (e) {
            var position = $(this).position();
            $('#' + id + '_treeUser').css({ 'visibility': 'visible', 'left': position.left, 'top': position.top + 20 });
            oldval = $(this).val();
            oldobjid = $(this).attr('objid');

            if (ops.data) {
                if (typeof ops.data == 'function') {
                    LoadData(ops.data());
                } else {
                    LoadData(ops.data);
                }
            }
            else {
                LoadData(null);
            }
            if (oldobjid) {
                CheckText(oldobjid);
            }
            if (ops.search) {
                $('#' + ops.tree_id + 'txtSearch').focus();
            }
        });

        //确定后
        $("#" + ops.tree_id + "a_ok").bind('click', function (e) {
            //objini.attr("objid", objini.attr("objid"));
            //objini.val(objini.val());
            $('#' + id + '_treeUser').css('visibility', 'hidden');

            if (ops.onSure) {
                ops.onSure($("#" + id));
            }

            if (ops.onCheck) {
                return;
                //ops.onCheck(treeNode, e, treeId);
            }
        });


        //清除后
        $("#" + ops.tree_id + "a_cancel").bind('click', function (e) {
            //objini.attr("objid", "");
            //objini.val("");
            //zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            // 该方法仅适用于复选框
            //zTree.checkAllNodes(false);
            if (!zTree) {
                zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            }
            var nodes = zTree.getCheckedNodes(true);
            for (var i = 0, l = nodes.length; i < l; i++) {
                zTree.checkNode(nodes[i], false, true);
            }
            ops.selected = [];
            SetCtrlValue();
            if (ops.onCheck && ops.openBtnCheck) {
                ops.onCheck();
                return;
                //ops.onCheck(treeNode, e, treeId);
            }
        });


        ////清除后
        //$("#" + ops.tree_id + "a_cancel").bind('click', function (e) {
        //    //objini.attr("objid", "");
        //    //objini.val("");            
        //    zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
        //    zTree.checkAllNodes(false);
        //    ops.selected = [];
        //    SetCtrlValue();
        //});



        //全选
        $("#" + ops.tree_id + "a_selectall").bind('click', function (e) {
            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            var nodeList;
            var _Value = $.trim($("#" + ops.tree_id + "txtSearch").val());
            if (_Value === '') {
                zTree.checkAllNodes(true);//勾选所有
                ops.selected = []; //先全部清除
                var nodeList = zTree.transformToArray(zTree.getNodes());//获取所有节点
                for (var i = 0; i < nodeList.length; i++) {
                    var op = nodeList[i];
                    ops.selected.push({ id: op.id, name: op.name });
                }
            } else {
                ops.selected = [];
                nodeList = zTree.getNodesByParamFuzzy('name', _Value);
                for (var i = 0; i < nodeList.length; i++) {
                    var op = nodeList[i];
                    ops.selected.push({ id: op.id, name: op.name });
                    op.checked = true;
                    zTree.updateNode(op);
                }
            }
            
            //nodes = zTree.getCheckedNodes(true),
            //v = "",
            //t = "";
            //for (var i = 0, l = nodes.length; i < l; i++) {
            //    t += nodes[i].id + ",";
            //    v += nodes[i].name + ",";
            //}
            //if (t.length > 0) t = t.substring(0, t.length - 1);
            //if (v.length > 0) v = v.substring(0, v.length - 1);

            

            //objini.attr("objid", t);
            //objini.val(v);
            SetCtrlValue();

            if (ops.onCheck) {
                ops.onCheck(e);
            }
        });


        function LoadData(_data) {

            var setting_checkbox = {
                check: {
                    enable: true,
                    chkboxType: ops.chkboxType
                },
                view: {
                    dblClickExpand: false,
                    fontCss: getFontCss,
                    showLine: ops.showLine,
                    showIcon: ops.showIcon
                },
                data: {
                    simpleData: {
                        enable: true
                    }
                },
                callback: {
                    beforeClick: ops.beforeClick,
                    onClick: ops.onClick,
                    onCheck: onCheck
                }
            };

            var setting_radio = {
                check: {
                    enable: true,
                    chkStyle: "radio",
                    radioType: "all"
                },
                view: {
                    dblClickExpand: false,
                    fontCss: getFontCss,
                    showLine: ops.showLine,
                    showIcon: ops.showIcon
                },
                data: {
                    simpleData: {
                        enable: true
                    }
                },
                callback: {
                    beforeClick: ops.beforeClick,
                    onClick: ops.onClick,
                    onCheck: onRadioCheck
                }
            };


            var zNodes = [];
            //if (_data == null) {
            //    var success = function (_Meta) {
            //        _data = _Meta.TreeUser;
            //    }
            //    Ajax.Request("Common.ashx", { Call: "GetTreeUser" }, success, true);
            //}
            //else {
            //    _data = ops.data();
            //}

            if (_data) {
                for (var i = 0; i < _data.length; i++) {
                    var _array = {};
                    var _iconSkin = "";
                    var _nocheck = false;
                    if (_data[i].TreeType == "Dept") {
                        _iconSkin = "iconDept";
                        _nocheck = !ops.pcheck;
                    }
                    else if (_data[i].TreeType == "User") {
                        _iconSkin = "iconUser";
                        _nocheck = false;

                    }
                    if (ops.charge) {
                        if (_data[i].is_charge == 1) {
                            _nocheck = false;
                        }
                        else {
                            _nocheck = true;
                        }
                    }
                    if (_data[i].is_branch || _data[i].is_branch == 1) {
                        _array.open = true;
                    }


                    _array.id = _data[i].id;
                    _array.pId = _data[i].pid;
                    _array.name = _data[i].name;
                    _array.title = _data[i].content ? _data[i].content : _data[i].name;
                    _array.nocheck = _nocheck;
                    _array.iconSkin = _iconSkin;
                    _array.TreeType = _data[i].TreeType;
                    zNodes.push(_array);
                }
            }
            //设定书的选择形式
            if (ops.SelectType == "checkbox") {
                $.fn.zTree.init($("#" + ops.tree_id), setting_checkbox, zNodes); //多选
            }
            else {
                $.fn.zTree.init($("#" + ops.tree_id), setting_radio, zNodes); //单选
            }            
            if (ops.expandAll) {  
                zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
                zTree.expandAll(true);
            }
            //else {
            //    zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            //    zTree.expandAll(false);
            //}

        }

        function getPathText(node) {//关键代码，通过treeNode遍历父亲节点，根节点再次调用getParentNode得到null终止循环
            var s = node.name;
            while (node = node.getParentNode()) s = node.name + ops.fulltag + s;
            return s;
        }


        function onCheck(e, treeId, treeNode) {
            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            nodes = zTree.getCheckedNodes(true);
            var id = treeNode.id;
            if (nodes.length - ops.selected.length == 1 ) { //单节点
                if (treeNode.checked) {
                    if (ops.selected.length > 0) {
                        //遍历进行判断,不存在才插入选中的数据,防止因为界面异常导致重复选择
                        for (var i = 0; i < ops.selected.length; i++) {
                            if (ops.selected[i].id === id) {
                                break;
                            }
                            if (i == ops.selected.length - 1) {
                                ops.selected.push({ id: id, name: treeNode.name });
                                break;
                            }
                        }
                    }
                    else {
                        ops.selected.push({ id: id, name: treeNode.name });
                    }
                }
                else {
                    for (var i = 0; i < ops.selected.length; i++) {
                        if (ops.selected[i].id === id) {
                            ops.selected.splice(i, 1);
                            break;
                        }
                    }
                }
            }
            else {
                ops.selected = [];//先全部清除
                for (var i = 0; i < nodes.length; i++) {
                    var op = nodes[i];
                    if (ops.only_leaf && op.children && op.children.length > 0) { }
                    else
                        ops.selected.push({ id: op.id, name: op.name });
                }
            }

            SetCtrlValue();
            if (ops.onCheck) {
                ops.onCheck(treeNode, e, treeId);
            }
        }

        //设置控件的值
        function SetCtrlValue() {
            if (ops.selected.length > 0) {
                var ids = [];
                var names = [];
                for (var i = 0; i < ops.selected.length; i++) {
                    var op = ops.selected[i];
                    ids.push(op.id)
                    names.push(op.name)
                }
                objini.attr("objid", ids.join(","));
                objini.val(names.join(","));
            }
            else {
                objini.attr("objid", "");
                objini.val("");
            }
        }

        //单选 直接确认值，隐藏树
        function onRadioCheck(e, treeId, treeNode) {

            objini.attr("objid", treeNode.id);
            objini.val(treeNode.name);
            if (ops.fullpath) {
                objini.val(getPathText(treeNode));
            }
            $('#' + id + '_treeUser').css('visibility', 'hidden');
            if (ops.onCheck) {
                ops.onCheck(treeNode, e, treeId);
            }
        }






        $("#" + ops.tree_id + "a_search").bind("click", searchNode)
        $("#" + ops.tree_id + "txtSearch").bind("keydown", function (e) { if (e.keyCode == 13) { searchNode(); return false; } })
        //查询
        var nodeList = [];
        //#region 查询方法————原始
        /*function searchNode() {
            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            var _Value = $.trim($("#" + ops.tree_id + "txtSearch").val());
            if (_Value === '') { return; }
            nodeList = zTree.getNodesByParamFuzzy('name', _Value);
            if (nodeList.length > 0) {
                UpdateNodes(true);
            }
        }
        function UpdateNodes(_highlight) {

            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            for (var i = 0, l = nodeList.length; i < l; i++) {
                var _parentNode = nodeList[i].getParentNode();
                if (_parentNode != null && _parentNode.open != _highlight) {
                    zTree.expandNode(_parentNode, _highlight, null, null, true);
                }
                nodeList[i].highlight = _highlight;
                zTree.updateNode(nodeList[i]);

            }
            zTree.selectNode(nodeList[0]);

        }*/
        //#endregion

        //#region 查询方法————Update 2016-08-08
        var CSS_HIGHLIGHT = "ztree-highlight";
        function searchNode() {
            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            var _Value = $.trim($("#" + ops.tree_id + "txtSearch").val());
            if (_Value === '') {
                var $_theTree = $("#" + ops.tree_id);
                $_theTree.find('li').show();
                $_theTree.find("." + CSS_HIGHLIGHT).removeClass(CSS_HIGHLIGHT);
                return;
            }
            nodeList = zTree.getNodesByParamFuzzy('name', _Value);
            if (nodeList.length > 0) {
                UpdateNodes(true);
            } else {
                $("#" + ops.tree_id).find('li').hide();
            }
        }
        function UpdateNodes(_highlight) {
            $("#" + ops.tree_id).find('li.show-node').removeClass('show-node');

            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            for (var i = 0, l = nodeList.length; i < l; i++) {
                var _curNode = nodeList[i];
                var loop_count = 0;
                var max_loop_count = 100;//最大层级
                var _parentNode = _curNode.getParentNode();
                while (_parentNode && loop_count < max_loop_count) {
                    if (!_parentNode.open) {
                        zTree.expandNode(_parentNode);
                    }
                    $("#" + _parentNode.tId).addClass('show-node');
                    _parentNode = _parentNode.getParentNode();
                }

                var $_curNode = $("#" + _curNode.tId);
                $_curNode.addClass('show-node');
                $_curNode.addClass(CSS_HIGHLIGHT);
            }
            $("#" + ops.tree_id).find('li').hide();
            $("#" + ops.tree_id).find('li.show-node').show();

            zTree.selectNode(nodeList[0]);
        }
        //#endregion

        //定位節點
        function FindNode(nodeID) {
            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            nodeList = zTree.getNodesByParamFuzzy('id', nodeID);
            for (var i = 0, l = nodeList.length; i < l; i++) {
                var _parentNode = (nodeList[i].getParentNode() != null) ? nodeList[i].getParentNode() : nodeList[i];
                if (_parentNode != null && _parentNode.open != true) {
                    zTree.expandNode(_parentNode, true, null, null, true);
                    nodeList[i].highlight = true;
                    zTree.updateNode(nodeList[i]);
                }

            }

        }


        /**
        * 设置光标位置
        * add by ZMIHUA
        */
        function setCursor(id, position) {

            var txtFocus = document.getElementById(id);
            if ($.browser.msie) {
                var range = txtFocus.createTextRange();
                range.move("character", position);
                range.select();
            } else {
                txtFocus.setSelectionRange(position, position);
                txtFocus.focus();
            }
        }
        function getFontCss(treeId, treeNode) {

            return (!!treeNode.highlight) ? { color: "red", "font-weight": "bold" } : { color: "#333", "font-weight": "normal" };
        }
        function beforeClick(treeId, treeNode) {
            zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
            zTree.checkNode(treeNode, !treeNode.checked, null, true);
            return false;
        }

        //勾选已有的值
        function CheckText(_value) {

            _value = (_value.indexOf(',') <= 0) ? _value + ',' : _value;
            for (var j = 0; j < _value.split(',').length; j++) {
                zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
                nodeList = zTree.getNodesByParam('id', _value.split(',')[j]);

                if (_value.split(',')[j]) {
                    for (var i = 0, l = nodeList.length; i < l; i++) {
                        zTree.selectNode(nodeList[0]);
                        var _parentNode = (nodeList[i].getParentNode() != null) ? nodeList[i].getParentNode() : nodeList[i];
                        if (_parentNode != null) {
                            zTree.expandNode(_parentNode, true, null, null, true);
                            nodeList[i].checked = true;
                            zTree.updateNode(nodeList[i]);
                        }

                    }
                }
            }
        }

        //    function onClick(e, treeId, treeNode) {
        //        zTree = $.fn.zTree.getZTreeObj(ops.tree_id);
        //        zTree.checkNode(treeNode, !treeNode.checked, null, true);
        //        return false;
        //    }

        /*点击空白处隐藏下拉框*/
        $(document).click(function () {
            if (arguments[0].target.id != id && arguments[0].target.id.indexOf(ops.tree_id) < 0 && arguments[0].target.id != '' + ops.tree_id + 'txtSearch' && arguments[0].target.id != '' + ops.tree_id + 'a_search') {
                objini.attr("objid", objini.attr("objid"));
                objini.val(objini.val());
                $('#' + id + '_treeUser').css('visibility', 'hidden');
            }
        });


    }
})(jQuery);
