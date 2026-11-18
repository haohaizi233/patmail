# 海牙 JSF / PrimeFaces 协议语义引擎设计与规范

> 状态：superseded。下文保留历史研究和实现演进，不作为当前生产结论。当前权威规范见[对应专题](engineering/hague/jsf-protocol.md)，核验基线与证据边界见[总览](engineering/README.md)。


**文件标识**：`docs/hague-protocol-semantics.md`  
**核心实现**：`src/hague/diagnostics/protocol/jsf-semantics.mjs` / `jsf-semantics.d.mts`  
**测试证据**：`tests/unit/hague/jsf-semantics.test.ts` (8/8 passed)

---

## 1. 协议背景与参考源比对

根据 PrimeFaces 官方源码（`org.primefaces.context.PrimePartialResponseWriter` 与 `core.ajax.response.ts` / `core.ajax.responseprocessor.ts`），JSF/PrimeFaces AJAX 交互遵循严格的 XML 响应生命周期契约：

```text
HTTP 200 OK
Content-Type: text/xml;charset=UTF-8
<partial-response id="j_id__v_0">
  <changes>
    <update id="..."><![CDATA[ ... ]]></update>
    <insert><after id="..."> ... </after></insert>
    <delete id="..." />
    <attributes id="..."> ... </attributes>
    <eval><![CDATA[ ... ]]></eval>
    <extension ln="primefaces" type="args">{"validationFailed":true,...}</extension>
  </changes>
  <error>
    <error-name>javax.faces.application.ViewExpiredException</error-name>
    <error-message> ... </error-message>
  </error>
  <redirect url="..." />
</partial-response>
```

### 关键语义事实

1. **命名空间变迁**：
   - 传统 JSF 2.x（包括 WIPO eHague 系统）使用 `javax.faces.*` 前缀与 ViewState。
   - 现代 Jakarta Faces 4.0+（如 PrimeFaces 14+）全面迁移至 `jakarta.faces.*`。
   - 语义引擎通过 `namespace: 'javax' | 'jakarta' | 'mixed' | 'unknown'` 精准标记，并对混杂命名空间发出 `namespace_conflict` 警报。
2. **校验失败与 HTTP 状态解耦**：
   - 当服务端发生输入校验失败（Validation Failed）时，HTTP 状态码依然是标准的 **200 OK**，XML 结构完全合法。
   - PrimeFaces 服务端通过 `PrimePartialResponseWriter` 注入 `<extension ln="primefaces" type="args">{"validationFailed":true,...}</extension>`。
   - **核心断言**：`valid_jsf_protocol != business_success`。任何 update 节点仅代表服务端刷新了视图碎片，绝不代表业务已成功提交。
3. **错误与重定向**：
   - `<error>` 包含 `<error-name>` 与 `<error-message>`。语义层对其进行安全分类（如 `view_expired`、`validation_error`、`conversion_error` 等），严禁将包含用户敏感信息、密码或内部堆栈的原始文本输出到脱敏层。
   - `<redirect url="...">` 提取规范化路径（`safePath`），不盲目信任非海牙业务域。

---

## 2. 受限 XML 语义解析架构

为了杜绝 XXE 注入、外部实体展开、超长 DoS 攻击和任意 JavaScript 执行，`parseJsfProtocol` 实施以下安全防线：

1. **纯 SAX 流式解析**：基于 `saxes`，开启严格命名空间感知 `{ xmlns: true }`。
2. **彻底禁用 DTD / XXE**：监听 `doctype` 事件，一旦发现立即中断并报错，拒绝解析外部实体。
3. **硬预算控制**：
   - `maxBytes`：默认上限 256KiB；
   - `maxNodes`：默认上限 30,000 节点；
   - `maxDepth`：默认上限 100 层；
   - `maxActions`：默认上限 500 个协议操作。
4. **动作序列保序**：
   - 输出结构化 `actions: JsfActionSummary[]`，精准保留服务端返回的操作原始执行顺序（例如：先 `update` 表单，再 `eval` UI 脚本，最后 `extension` 携带参数）。
5. **双解析器语义对比**：
   - 提供 `compareJsfDualParsers(xmlText)` 函数，在离线回归测试中将 SAX 协议事实与业务端 DOMParser 的计数进行严格对照，确保诊断层与执行层在事实判定上高度一致。
