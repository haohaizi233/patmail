# Hague JavaScript protocol analysis

> 状态：superseded。下文保留历史研究和实现演进，不作为当前生产结论。当前权威规范见[对应专题](engineering/hague/javascript-ast.md)，核验基线与证据边界见[总览](engineering/README.md)。


`src/hague/diagnostics/ast/analyzer.mjs` is shared by the extension and the native Node CDP observer. It imports Babel's actual parser and traverses parser-produced AST node fields (excluding source metadata/comments). It never executes fetched source. `analyzeJavaScript` returns a sanitized structural report; `extractStaticActions` is an internal execution API whose parameter values must never enter diagnostic storage.

## Evidence audit

| Shape | Repository evidence | Analyzer coverage | Evidence level |
| --- | --- | --- | --- |
| PrimeFaces.ab short keys s/f/p/u/e, s:this | http-driver.test.ts detached forms, radio preactivation | AST object extraction, this maps only to caller-supplied element ID | Existing offline regression |
| selectOffice remote assignment, pa:arguments[0], callback objects | http-driver.test.ts designation form replacement | Wrapper invocation, constant array name/value pairs; callbacks remain opaque for execution | Existing offline regression |
| mojarra.ab(this,event,change,process,update) | http-driver.test.ts subclass callback | Positional extraction; event object is not inspected | Existing offline regression |
| DataTable paginator rows/rowCount/page | http-driver.test.ts later Draft(s) page | Read-only widget type/component/pagination summary | Existing offline regression |
| jsf.ajax.request, mojarra.jsfcljs | New diagnostics-ast.test.ts synthetic source | execute/render fields; one static JSF submit key | Synthetic fixture only |
| FileUpload and processFile | http-driver upload path and draft-page upload workflow reference these shapes; new AST synthetic widget test | Widget config fields; generic wrapper mechanism | Code audit + synthetic fixture; no captured live source |
| eval/new Function/string timer, atob/String.fromCharCode | New diagnostics-ast.test.ts synthetic source | Location, unresolved reason, bounded nested AST | Synthetic fixture only |

`draft-page.ts` was read in full: it manipulates detached controls through click/change and observes PrimeFaces queue/widget counters; its business proof is separate from AST confidence. `tests/unit/hague/protocol.test.ts` covers message validation and cancellation, not production JavaScript source. `tests/e2e/resume-protocol.e2e.mjs` is a download Range fixture, not Hague source evidence. None of these prove that a synthetic call exists on the current WIPO website. No live browser, WIPO write, or deep source retrieval was performed for this implementation.

## Bounds and interpretation

Hard ceilings (caller may lower them): 262144 source characters, 30000 visited/evaluated nodes, traversal depth 100, 100ms cooperative analysis budget, two nested decoded AST layers, and sixteen sanitized cached reports. Oversized sources fail before parsing. Babel parsing is synchronous: its time cannot be preempted mid-parse; source size and a caught parser/stack error bound that exposure, and traversal checks elapsed time. Character limits conservatively bound source length, not UTF-8 byte counts despite the `maxSourceBytes` legacy option name. Cache keys retain only source/definition hashes, lengths and bounded options; cache values contain sanitized reports. clearAstCache can discard these reports on deep-mode disable. Hash collisions are possible and affect diagnostic caching only; the execution extractor never uses this cache. Raw source is never retained in cache keys or persisted by this module. Hashes are noncryptographic structural/change identifiers, not authentication proofs.

Supported pure values are literals, constant templates/concatenation, static objects/arrays, own-property lookup, literal-resolvable conditionals, unshadowed atob, and bounded String.fromCharCode. Calls, runtime properties and unknown values stay unresolved. Wrapper traversal supplies static arguments and arguments[0]; it does not run the function. Nested source reports include sourceLayer so decoded locations are not represented as original script locations. Static call existence never proves runtime execution or business success.

Public reports omit all parameter values and arbitrary object/string literals. Component identifiers pass a known form namespace filter; unknown strings are redacted. Raw execution actions are deliberately separate. Consumers must still use the central trace sanitizer before persistence. scriptHash and fingerprint support source change and structural comparison respectively; neither stores source text.

## Execution integration

`jsfAction` uses AST extraction and requires exactly one validated action. Dynamic required fields, dynamic parameter lists, conditional control, mutable bindings, object mutations, unknown side-effect calls, decoded code, and multiple actions fail closed. Only explicit calls to supported synchronous wrapper functions produce execution actions; uninvoked function/method definitions, generator creation and statements after return do not. The remote execution API parses an explicit call with static params supplied by its caller. Remote handler arguments are resolved only from static array entries. The old regex action parser and widget config regex readers are removed. Upload, pagination and reproduction counts use AST widget metadata. Unresolved identities, required counts, ambiguous widgets or redacted execution fields stop the operation before dispatch. A table absent from both widget metadata and DOM retains the established zero-count structural fallback. Optional nonenumerable `analysis` retains strict existing action equality while making source hash, fingerprint, kind and location available to the driver trace boundary.

Limitations: this is bounded discovery, not a full interprocedural JavaScript semantics engine. It does not support arbitrary dynamic properties, closures, destructuring, spread parameters, decoder method chains, universal obfuscation or cross-script global state. Unsupported shapes intentionally stop execution rather than infer a write. Generic dynamic insertion calls are reported by AST callee shape; creating a script element alone is not treated as proof of insertion. No runtime execution/correlation claim follows from a static confidence field. Production source compatibility beyond the offline fixture shapes remains unverified.

## Verification

Tests were written first and observed failing before implementation. New fixtures exercise constants, aliases/wrappers, remote params/privacy, source/node bounds, dynamic code/decoding, all JSF families, conditional/multiple-action rejection, decoded-write rejection, mutable state, object mutations, alias shadowing and widget pagination. Existing http-driver regressions continue to cover exact-reference resume, designation refresh, autocomplete, radio activation and create validation.


## 2026-11 作用域分析与 JsfCallIR 补强

在基础 AST 分析器之上，新增了针对 JSF/PrimeFaces 复杂绑定的确定性词法作用域与符号表机制：

1. **词法作用域隔离与遮蔽保护**：
   - 块级作用域（`BlockStatement`）引入局部环境帧保护；内部重定义变量（如嵌套块内的同名 `const`）仅在局部作用域生效，退出块后严密恢复外层绑定，杜绝全局污染与变量混淆。
   - 变量声明支持字面量解构（`ObjectPattern`）：精准解构字面对象属性绑定至符号表，并在非 `const` 绑定中严格降级为 `UNKNOWN`。
2. **保守别名分析与常量折叠**：
   - 支持纯字面量三元条件求值（`test ? consequent : alternate`）与保守别名链（`const a = 'x'; const b = a; const c = b;`）。
   - 属性赋值检测：当检测到对象属性发生二次赋值或动态变更（`cfg.s = dynamicVal`）时，立即将相关调用参数降级为 `unresolved`（`source:dynamic`），实施严格的 fail-closed 保护。
3. **标准化 JsfCallIR 中间表示**：
   - 新增 `extractJsfCallIR(source, options)` 导出标准只读中间表示：
     - `callType`: 确定的协议函数标识（`PrimeFaces.ab`, `mojarra.ab`, `jsf.ajax.request` 等）。
     - `sourceLocation`: 精确行列号与脚本标识。
     - `sourceComponent`: 来源组件标识。
     - `form`: 归属表单标识。
     - `process` / `update`: 规范化搜索表达式数组。
     - `event`: 行为事件名称。
     - `parameterNames`: 携带参数白名单列表。
     - `staticConfidence`: `'static' | 'partial' | 'unresolved'`。
     - `unresolvedReasons`: 结构化未决原因列表。
   - IR 表示与 Trace Schema 深度兼容，为离线协议指纹与 CDP Initiator 关联提供结构化输入。

## 研究模式位置索引

新Research Mode复用本分析器，不重写执行提取。增加仅用于诊断的callee/member-property精确语法位置锚点，并应用scriptParsed的inline偏移；实际Chrome/Edge来源匹配已在隔离Fixture验证。匹配不使用整行猜测，动态/多候选仍保持unmatched/ambiguous。详情见 [全链路研究诊断](hague-full-chain-diagnostics.md)。
