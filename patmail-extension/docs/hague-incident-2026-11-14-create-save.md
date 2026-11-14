# 创建草稿后秒异常：保存确认按钮AST拒绝

## 现场证据

2026-11-14，新加坡时间17时，用户打开已存在的WIPO188121编辑器。原生CDP仅用Target、DOM和Page资源读取接口，独立只读会话在结束后detach；没有Runtime.evaluate、点击、保存、创建、下载行为修改或Cookie读取。没有持久化原始页面、脚本、处理器或字段值。

DOM结构确认：headerForm:backApp为Close按钮，处理器仅显示弹窗，可通过上一补丁；包含Draft(s)说明的保存弹窗中，Yes按钮为j_idt278:j_idt282:j_idt284，位于j_idt278表单。其处理器结构如下（字段和编号使用人工示例，非完整原文）：

```javascript
PrimeFaces.bcn(this, event, [
  function(event) { showBlockUIOnSend(''); },
  function(event) {
    PrimeFaces.ab({s:'dialogForm:yes', f:'dialogForm', onco:function(xhr,status,args){PF('dialog').hide();}});
    return false;
  }
]);
```

当前执行提取器不支持bcn，因此旧代码对实际Yes处理器返回actions=0、unsupported_call。修改后，对同一个实际处理器返回actions=1、reasons=[]。仅提取并对比，没有执行该动作。根据现有http-client.ts调用顺序，create成功后立即调用saveDraft；因此此拒绝发生在创建后的初始保存阶段，整步显示协议异常，不能据此重建已有草稿。

读取浏览器缓存中的wfaces.js，只在内存中定位小于8KiB的showBlockUIOnSend定义并进行结构解析，确认是无return的表达式调用，调用链为DOM包装/加载遮罩。源库只在独立审计进程内暂存，未落盘；生产Observer源码预算不变。匿名Node GET静态资源曾返回HTML，未拿它作为JavaScript证据，最终使用的是已授权浏览器的缓存资源。

PrimeFaces官方将bcn定义为HTML事件处理器的回调包装，接口见[官方JavaScript API](https://primefaces.github.io/primefaces/jsdocs/modules/src_PrimeFaces.PrimeFaces.html#bcn)。本次实现不是通用回调展开器。

## 修复边界

`src/hague/diagnostics/ast/analyzer.mjs:run/visit`只接受：

- 直接PrimeFaces.bcn(this,event,[...])，恰好两个普通、同步、非generator函数，各只有event参数。
- 第一函数恰好一个showBlockUIOnSend('')表达式，没有return、条件、其他调用或动态参数；不执行遮罩函数。
- 第二函数恰好一个PrimeFaces.ab(...)和末尾return false；原有静态字段/参数校验继续生效，回调体不执行。
- 自定义辅助函数、提前return false、条件取消、动态列表、附加网络动作、helper重定义均拒绝；保留单请求要求。

`tests/unit/hague/http-driver.test.ts`覆盖实际结构的提取、初始保存→精确编号列表回执→只发一次POST，以及取消/未知函数/动态副作用/helper覆盖/重复请求的拒绝。先观察旧代码失败，再实现兼容。

## 业务状态与部署

WIPO188121已有草稿，保留编号与检查点。没有自动重建、删除或操作此草稿。本次确认并修复的是实际保存按钮协议提取失败；实际保存、重新打开及完整材料填写仍须加载新扩展后现场验证。共享AST的Observer需要重启，扩展页面则需要加载新dist代码，不能把构建成功当作当前浏览器页面已经更新。

## 最终验证

完整1784/1784测试通过，失败0、跳过0；变更文件ESLint、pnpm build（含vue-tsc）和补丁检查通过。最终结果见忽略目录test-results/hague-bcn-fix-tests.json和hague-bcn-fix-build.log。Observer按AGENTS要求重启，新PID19572，connected、research enabled、5 Targets。扩展dist已更新，用户已打开的页面尚不能据此认定加载了新代码；没有对真实草稿执行写入验证。


## 后续：新代码已加载，但旧创建检查点仍被拒绝恢复

用户再次回报14/14异常、14/637步。原生CDP只读检查得到：V8中app.js的SHA-256与当时dist/app.js一致，且包含bcn补丁；当前活动案件显示WIPO188122、next=1、创建新草稿、PROTOCOL_UNSUPPORTED，并出现“旧操作结果待核对”。因此不能再用未重载解释这次现象。

日志在09:24 UTC至09:27:31批次结束提示之间没有新的海牙创建POST。随后09:27:51有一笔application.xhtml XHR POST，但发生在结束提示之后，且没有精确应用归因，不能作为该批重新创建的证据。0成功/14异常的计数不等于14次原站请求失败。

代码路径：runDraftPlan对uncertain检查点先调用recover；recoverableDraftCommand此前不包含create，故已有reference也直接抛“操作结果仍待核对”，不会重发修好的按钮。创建接口链把“分配编号、初始保存、重开”合为一个create步骤，曾创建后失败的案件会长期留在这个边界。

修复：仅对next=1、status=uncertain、具有材料planKey和数字reference的创建边界，允许走现有resume：读取Draft(s)→精确定位同编号行→唯一Open/edit→核对同编号application编辑器。成立才返回completed并推进下一步；不发送create或补做未知保存。缺编号、缺材料指纹、记录不存在、编辑器编号冲突、控件不唯一均unknown，不另建。

创建边界的这次核对是已有草稿读取，允许下次再次核对；不会因前次读取失败永久锁住。其他写入步骤原有单次恢复限额不变。回归覆盖现有/缺失/错误编号、无重复create，以及已有读取尝试标记仍可进行只读核对。没有对WIPO188122执行自动写入或实际恢复。


全量回归还发现：创建恢复若被Host错误授权retry，消费端可能重复进入create。已增加独立硬校验：创建恢复只接受completed且同编号application回执，绝不接受retry；回归明确断言只发生最初一次create，不发生二次创建。首轮全量运行因此中断，修复后重新完整运行，未删除失败用例。旧“不支持恢复”测试现指向representative这一仍不支持的步骤，原有拒绝恢复断言继续保留。

最终创建检查点恢复版本：1789/1789完整测试通过，失败0、跳过0；变更文件ESLint、构建（含类型检查）、补丁检查通过。隔离草稿UI回归通过，无原站写入。实际WIPO188122的只读核对恢复尚未操作，须加载新扩展后由当前材料检查点继续验证；不可将本机测试当作实站填写完成。
