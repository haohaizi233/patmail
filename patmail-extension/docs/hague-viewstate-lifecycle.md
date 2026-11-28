# 海牙 ViewState 生命周期与跨请求状态迁移状态机

> 状态：superseded。下文保留历史研究和实现演进，不作为当前生产结论。当前权威规范见[对应专题](engineering/hague/viewstate-state-machine.md)，核验基线与证据边界见[总览](engineering/README.md)。


**文件标识**：`docs/hague-viewstate-lifecycle.md`  
**核心实现**：`src/hague/diagnostics/protocol/jsf-state-machine.mjs` / `jsf-state-machine.d.mts`  
**测试证据**：`tests/unit/hague/jsf-state-machine.test.ts` (6/6 passed)

---

## 1. 业务背景与问题根源

JSF（JavaServer Faces）是一个基于有状态组件树的服务端框架。客户端的每一次表单提交或 AJAX 请求，都必须携带服务端上一轮生成的 `javax.faces.ViewState` 令牌，以供服务端恢复对应的组件树状态（Component Tree Restore View Phase）。

### 审计发现的关键缺口 (P0 修复)

在原 `scripts/hague/research/hague-research.mjs` 第 86 行，传递给 Worker 的上下文键为：
```javascript
// 修复前：误包含了 r.requestId
contextKey: `${r.sessionId}:${r.frameId}:${r.loaderId}:${r.requestId}`
```
因为每个 HTTP 请求在 CDP 层面都拥有全局唯一的 `requestId`，这导致每次计算 ViewState HMAC 时，`contextKey` 都是全新的，上一请求的历史 Tag 永远为 `undefined`。**导致 Research Mode 无法在原生 CDP 请求链中感知 ViewState 的迁移事实**。

### 修复与上下文设计

修复后将文档生命周期限定为同 Frame / 同 Loader 的会话范围：
```javascript
// 修复后：严格绑定文档与页面生命周期
contextKey: `${r.sessionId}:${r.frameId}:${r.loaderId}`
```
当连续派发请求时，状态机能够准确对比第 $N$ 次请求与第 $N-1$ 次请求的 ViewState 变迁。

---

## 2. 状态机模型与状态迁移

系统建立了一个确定性的只读 ViewState 状态机：

```text
               [ UNKNOWN ]
                    │  (recordInitialViewState)
                    ▼
          [ INITIAL_OBSERVED ]
                    │
                    │  (beginRequest)
                    ▼
          [ REQUEST_IN_FLIGHT ] ──(loaderId 发生变化)──► [ DOCUMENT_CHANGED ]
                    │
                    │  (recordResponseViewState)
                    ▼
       ┌────────────┴────────────┐
       │                         │
(未返回 ViewState)        (返回有效 ViewState)
       │                         │
       ▼                         ▼
[ STATE_MISSING ]    ┌───────────┴───────────┐
                     │                       │
               (与上状态一致)           (与上状态不同)
                     │                       │
                     ▼                       ▼
            [ STATE_UNCHANGED ]      [ STATE_CHANGED ]
                                             ▲
                                     (若属于历史已被淘汰的旧状态)
                                             │
                                     [ OUT_OF_ORDER ]
```

### 异常状态处理

- `DOCUMENT_CHANGED`：当同一 Frame 下出现新的 `loaderId` 时，表明发生了完整的页面重定向或重新导航，旧文档上下文立即失效，防止旧 ViewState 跨文档污染。
- `STATE_MISSING`：服务端返回了部分响应，但 `<changes>` 中未包含 ViewState 更新，发出警告。
- `OUT_OF_ORDER`：当多个异步请求并发返回时，若后到达的响应携带的是历史早期的 ViewState，状态机识别为乱序到达，避免最新状态被旧状态回退覆盖。
- `STATE_UNVERIFIABLE`：当会话未经验证、跨会话或缺乏明确 Frame 所属权时，拒绝强行推断，直接返回未决状态。

---

## 3. 隐私保护与内存安全保证

1. **零明文持久化**：
   - ViewState 原始字符串仅在解析回调执行的毫秒级时间内存在于临时栈中，严禁写入任何磁盘日志、数据库或长期 Map。
2. **限定作用域的 HMAC 摘要**：
   - 使用内存中随机生成的 32 字节密钥进行 `HMAC-SHA256` 签名，仅保存 32 字节的二进制 Tag 用于等值比较。
3. **密钥零化与生命周期销毁**：
   - 密钥仅驻留内存，绝不写盘。
   - 当调用 `clear()`、重置会话或 Research 关闭时，立即执行 `secret.fill(0)` 内存擦除，并重置 generation。旧 generation 的异步 Worker 计算结果全部直接丢弃。
