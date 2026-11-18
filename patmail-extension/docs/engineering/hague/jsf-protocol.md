# JSF / PrimeFaces

核验：2026-11-16，代码基线 `de2ee0d`；证据等级 code_verified，关联离线测试入口如下。正式状态见治理清单。

## 模型与输入输出

JSF 服务端持有组件树；客户端 AJAX 携带 ViewState 和 source/process/render 等信息。Partial Response 是对当前文档的有序变化，不是任意 JSON API。共享[语义解析器](../../../src/hague/diagnostics/protocol/jsf-semantics.mjs)输入 XML 与预算，输出动作序列、命名空间、验证/错误分类及状态摘要；原始 ViewState 仅供临时状态比较，不应进入诊断投影。

## 有序协议

支持 javax.faces.* 与 jakarta.faces.* 的状态标识。update 替换组件片段；insert 的 before/after 指定插入关系；delete 删除节点；attributes 更新属性；eval 是待约束的脚本动作；redirect 切换导航；extension 承载扩展数据。validationFailed 是业务验证失败线索，HTTP 成功或出现 update 均不能覆盖它。

```xml
<partial-response><changes>
  <update id="ExampleForm:panel"><![CDATA[<span>示例</span>]]></update>
  <attributes id="ExampleForm:panel"><attribute name="class" value="ready"/></attributes>
</changes></partial-response>
```

示例完全合成，不含真实状态值。update 后 attributes 与反向顺序可能产生不同结果，所以动作序列不可排序去重；指纹同样保留动作顺序。执行器对组件缺失、父子更新、脚本初始化的处理还需看 [HTTP context](../../../src/hague/http-context.ts)，不能从研究解析结果直接执行任意 eval。

## 安全边界

Saxes 保序解析，默认输入上限 256 KiB、节点 30000、深度 100、动作 500；预算只能收紧。错误信息按受检类别投影，不泄漏任意服务端错误正文。实体/畸形 XML 和超限必须明确降级，不把解析失败当作空动作成功。

研究 Worker 的 xml 分支调用同一解析器；业务 context 消费协议事实后仍须验证具体字段、数量和最终列表回执。三个层次分别是：服务器有响应、文档已变化、业务已完成。任何一个都不能代替后一个。

测试：[语义与双解析对照](../../../tests/unit/hague/jsf-semantics.test.ts)、[研究解析链](../../../tests/unit/hague/research-jsf-parser.test.ts)。异常恢复见[容灾](concurrency-and-recovery.md)。
