(function ($) {

    $.fn.autoSearchText = function (options) {

        //以下为该插件的属性及其默认值 
        var deafult = {
            width: 200,           //文本框宽 
            itemHeight: 150,      // 下拉框高
            minChar: 1,            //最小字符数(从第几个开始搜索) 
            datafn: null,         //加载数据函数
            fn: null,             //选择项后触发的回调函数 
            fnempty: null, //选择空值时触发的回调函数
            minwidth: '200px',
            autocomplete: 'off', //设置原控件的autocomplete属性 
            setvalue: true,
            delay: 1000,                 //多久执行一次数据查询,默认500毫秒,针对不同数据量调用时自己评估
            mustApplyTime: 1500,         //多久必须执行一次查询,避免如果设置的查询时间间隔较长情况下用户连续输入时永远不执行查询,默认1000毫秒
            isInput: false     //是否可以输入自定义的数据
        };
        var itemIndex = 0;
        var ops
        var oldval = '';
        var objini;
        objini = $(this);
        oldval = ($(this).attr('objid')) ? $(this).attr('objid') : "";
        var id = objini.attr('id');
        var textDefault = $(this).val();
        ops = $.extend(deafult, options);
        $(this).width(ops.width);

        var autoSearchItem = '<div style ="min-width:' + ops.minwidth + '" id="' + id + '_autoSearchItem" class="autoSearchItem"><ul class="menu_v"></ul></div>';

        $('#' + id).attr("autocomplete", ops.autocomplete);

        $(this).after(autoSearchItem);
        $('#' + id + '_autoSearchItem').width(ops.width + 2); //设置项宽 
        $('#' + id + '_autoSearchItem').height(ops.itemHeight); //设置项高 
        //$(this).focus(function () {
        //    if ($(this).val() == textDefault) {
        //        $(this).val('');
        //        $(this).css('color', 'black');
        //    }
        //});
        var itemCount = $('#' + id + '_autoSearchItem li').length; //项个数 

        //鼠标点击时候加载所有的值
        $(this).bind('click', function (e) {
            // $(this).val("");//点击时，清除输入框的值，但objid并不清除
            var position = $(this).position();
            $('#' + id + '_autoSearchItem').css({ 'visibility': 'visible', 'left': position.left, 'top': position.top + 24 });
            var data = ops.datafn($(this).val(), ops);
            initItem($(this), data, ops);
        })

        /*鼠标按下键时，显示下拉框，并且划过项时改变背景色及赋值给输入框*/
        $(this).bind('keyup', function (e) {

            var $this = $(this);
            throttle(KeyEvent, ops.delay, ops.mustApplyTime, $this, e);

            //if ($(this).val().length >= ops.minChar) {
            //    var position = $(this).position();
            //    $('#' + id + '_autoSearchItem').css({ 'visibility': 'visible', 'left': position.left, 'top': position.top + 24 });
            //    var data = ops.datafn($(this).val(), ops);
            //    initItem($(this), data, ops);
            //    var itemCount = $('#' + id + '_autoSearchItem li').length;

            //    switch (e.keyCode) {
            //        case 38:   //上
            //            if (itemIndex > 1) {
            //                itemIndex--;
            //            }
            //            $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').css({ 'background': '#26ADDF', 'color': 'white' });
            //            //$(this).val($('#autoSearchItem  li:nth-child(' + itemIndex + ')').text());
            //            // $(this).attr('objid', ($('#autoSearchItem li:nth-child(' + itemIndex + ')').attr('id')));
            //            break;
            //        case 40: //下 
            //            if (itemIndex < itemCount) {
            //                itemIndex++;
            //            }
            //            $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').css({ 'background': '#26ADDF', 'color': 'white' });

            //            //$(this).val($('#autoSearchItem li:nth-child(' + itemIndex + ')').text());
            //            //$(this).attr('objid', ($('#autoSearchItem li:nth-child(' + itemIndex + ')').attr('id')));
            //            break;
            //        case 13:  //Enter 
            //            if (itemIndex > 0 && itemIndex <= itemCount) {

            //                oldval = $(this).attr('objid');
            //                if (ops.setvalue) {
            //                    $(this).val($('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').text());
            //                }
            //                $(this).attr('objid', $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').attr('name'));
            //                $('#' + id + '_autoSearchItem').css('visibility', 'hidden');
            //                // itemIndex = 0;
            //                if (oldval != $(this).attr('objid')) {
            //                    if (ops.fn != null) {
            //                        ops.fn($('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').attr('name'), $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').text());
            //                    }
            //                }
            //            } break;
            //        case 8: //退格鍵
            //        case 46: //刪除鍵

            //            $(this).attr('objid', ''); break;
            //        default:
            //            $(this).attr('objid', '');//只要修改查询条件,即将之前的objid 清空,防止text 跟objid 不一致
            //            break;
            //    }
            //}
        });

        //$(this).bind('focus', function (e) {
        //    itemIndex = 0;
        //    if ($.trim($(this).val()) != '') {
        //        $(this).select();
        //    }
        //});

        var specialKey = [13, 38, 40];//特殊按键,不节流
        function throttle(fn, delay, mustApplyTime, $this, event) {
            if (specialKey.indexOf(event.keyCode) > -1) {
                return fn.call(this, $this, event);
            }
            clearTimeout(fn.timer);
            fn._cur = Date.now();  //记录当前时间
            if (!fn._start) {      //若该函数是第一次调用，则直接设置_start,即开始时间，为_cur，即此刻的时间
                fn._start = fn._cur;
            }
            if (fn._cur - fn._start > mustApplyTime) {
                //当前时间与上一次函数被执行的时间作差，与mustApplyTime比较，若大于，则必须执行一次函数，若小于，则重新设置计时器
                fn.call(this, $this, event);
                fn._start = fn._cur;
            } else {
                fn.timer = setTimeout(function () {
                    fn.call(this, $this, event);
                }, delay);
            }
        }
        //.bind("blur", function () {
        //    if (!objini.attr('objid')) {
        //        objini.val('');
        //        if (oldval != objini.attr('objid')) {
        //            if (ops.fn != null) {
        //                ops.fn($(this).val());
        //            }
        //        }
        //        if (ops.fnempty != null) {
        //            ops.fnempty($(this).val());
        //        }
        //    }
        //    $('#' + id + '_autoSearchItem').css('visibility', 'hidden');
        //});

        //键盘响应事件
        function KeyEvent($this, e) {
            var val = $this.val();
            var position = $this.position();
            //$('#' + id + '_autoSearchItem').css({ 'visibility': 'visible', 'left': position.left, 'top': position.top + 24 });
            $('#' + id + '_autoSearchItem').css({ 'display': 'block', 'left': position.left, 'top': position.top + 24 });
            var data = ops.datafn($this.val(), ops);
            initItem($this, data, ops);
            var itemCount = $('#' + id + '_autoSearchItem li').length;

            //var position = $this.position();
            //$('#' + id + '_autoSearchItem').css({ 'display': 'block', 'left': position.left, 'top': position.top + 24 });
            //var itemCount = $('#' + id + '_autoSearchItem li').length;
            switch (e.keyCode) {
                case 38:   //上
                    {
                        if (itemIndex > 1) {
                            itemIndex--;
                        }
                        $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').css({ 'background': '#26ADDF', 'color': 'white' });
                        break;
                    }
                case 40: //下 
                    {
                        if (itemIndex < itemCount ) {
                            itemIndex++;
                        }
                        $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').css({ 'background': '#26ADDF', 'color': 'white' });
                        var item = $('#' + id + '_autoSearchItem li:eq(' + itemIndex + ')').addClass('curItem');
                        //这里有个问题待解决,div有滚动条时按上下键盘时应该把滚动条调一起滚动
                        break;
                    }
                case 13:  //Enter 
                    {
                        if (itemIndex > 0 && itemIndex <= itemCount) {
                            oldval = $this.attr('objid');
                            if (ops.setvalue) {
                                $this.val($('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').text());
                            }
                            $this.attr('objid', $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').attr('name'));
                            $('#' + id + '_autoSearchItem').css('visibility', 'hidden');
                            // itemIndex = 0;
                            if (oldval != $this.attr('objid')) {
                                if (ops.fn != null) {
                                    ops.fn($('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').attr('name'), $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').text());
                                }
                            }
                        } break;
                    }
                case 8: //退格鍵
                case 46: //刪除鍵

                    $this.attr('objid', ''); break;
                default:
                    {
                        if ($this.length >= ops.minChar) {
                            var data = ops.datafn(val);
                            initItem($this, data, ops);
                            itemCount = data ? data.length : 0;
                        }
                        $this.attr('objid', '');//只要修改查询条件,即将之前的objid 清空,防止text 跟objid 不一致

                        break;
                    }

            }
        }


        /*点击空白处隐藏下拉框*/
        $(document).click(function () {
            if (arguments[0].target.id != id) {
                if (objini.val() == '') {
                    objini.attr('objid', '');
                }
                itemIndex = 0;

                $('#' + id + '_autoSearchItem').css('visibility', 'hidden');
                if (objini.attr('objid') == '') {
                    if (!ops.isInput) {
                        objini.val('');
                    }
                    if (oldval != objini.attr('objid')) {
                        if (ops.fn != null) {
                            ops.fn($(this).val());
                        }
                    }
                    if (ops.fnempty != null) {
                        ops.fnempty($(this).val());
                    }
                }
            }
        });
        return this;
    };

    /*获取文本框的值*/
    $.fn.getValue = function () {
        return $(this).val();
    };

    /*初始化下拉框数据,鼠标移过每项时，改变背景色并且将项的值赋值给输入框*/
    function initItem(obj, data, ops) {
        var id = obj.attr('id');
        var str = "";
        if (data == null || typeof (data) == 'undefined' || data.length == 0) {
            $('#' + id + '_autoSearchItem ul').html('<div style="text-align:center;color:red;">无符合数据<div>');
        }
        else {
            $('#' + id + '_autoSearchItem').css('visibility', 'visible');
            var $ul = $('#' + id + '_autoSearchItem ul');
            $ul.empty();
            for (var i = 1; i <= data.length; i++) {
                //str += "<li><span>" + i + "/" + data.length + "</span>\r<font>" + data[i - 1] + "</font></li>";
                str += "<li name='" + data[i - 1].id + "' other='" + data[i - 1].other + "' odata='" + data[i - 1].odata + "' code='" + data[i - 1].code + "' >" + data[i - 1].name + "</li>";
                var $li = $("<li name='" + data[i - 1].id + "' other='" + data[i - 1].other + "' odata='" + data[i - 1].odata + "' code='" + data[i - 1].code + "' >" + data[i - 1].name + "</li>");
                $li.data('row', data[i - 1]);
                $ul.append($li);
            }
            //$('#' + id + '_autoSearchItem ul').html(str);
        }

        /*点击项时将值赋值给搜索文本框*/
        $('#' + id + '_autoSearchItem li').each(function () {
            $(this).bind('click', function () {
                oldval = obj.attr('objid');
                if (ops.setvalue) {
                    obj.val($(this).text());
                }
                obj.data('row', $(this).data('row'));
                obj.attr('objid', $(this).attr('name'));
                obj.attr('code', $(this).attr('code'));
                obj.attr('odata', $(this).attr('odata'));
                obj.attr('other', $(this).attr('other'));
                $('#' + id + '_autoSearchItem').css('visibility', 'hidden');
                if (oldval != obj.attr('objid')) {
                    if (ops.fn != null) {
                        ops.fn($(this).attr('name'), $(this).text());
                    }
                }
            });
        });


        /*鼠标划过每项时改变背景色*/
        $('#' + id + '_autoSearchItem li').each(function () {
            itemIndex = 0;
            $(this).hover(function () {
                $('#' + id + '_autoSearchItem li:nth-child(' + itemIndex + ')').css({ 'background': 'white', 'color': 'black' });
                itemIndex = $('#' + id + '_autoSearchItem li').index($(this)[0]) + 1;
                $(this).css({ 'background': '#26ADDF', 'color': 'white' });
                // obj.val($('#autoSearchItem li:nth-child(' + itemIndex + ')').text());
            },
            function () { $(this).css({ 'background': 'white', 'color': 'black' }); });
        });
    };
})(jQuery);




