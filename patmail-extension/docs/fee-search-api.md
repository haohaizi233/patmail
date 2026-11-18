# PatMail 费用查询模块接口与架构文档

> 规范约定见根目录 [API/44-费用查询.md](../../API/44-费用查询.md)。整体架构见 [../../README.md](../../README.md)。

## 1. 模块定位

费用查询（官费管理 -> 费用查询）是 PatMail 扩展继**文件管理**、**期限监控**、**递交管理**之后的第四个核心查询表面。  
模块完整复刻了原站 `Forms/Bill/FeeSearch.aspx` 的查询功能、84 列字段明细、金额统计看板以及 Excel 导出能力。

---

## 2. 核心架构与文件结构

```
patmail-extension/
├── src/api/
│   ├── fee-form.ts              # 核心 7 排网格、高级区块、下拉字典映射与 cell 工具
│   ├── fee-search-params.ts     # 查询参数编码器（84 列 colsel 生成、布尔与日期格式化）
│   ├── fee-search-types.ts      # 84 列行数据 FeeSearchRow、金额汇总 FeeSearchAmountSummary
│   ├── fee-search-normalizer.ts # 后端响应反序列化与安全数据归一化
│   ├── transport.ts             # 路由注册：feeSearch / feeSearchAmount -> /AjaxServers/Report.ashx
│   └── client.ts                # EasyRuntime 业务方法：searchFees / searchFeesAmount / cancelFeeSearch
├── src/shared/
│   ├── message.ts               # 注册 SearchFee、SearchFeeAmount 消息类型与类型守卫
│   └── connection.ts            # 会话与账号范围识别
├── src/content/
│   └── index.ts                 # Content Script 分发 SearchFee 与 SearchFeeAmount
├── src/app/
│   ├── services/
│   │   └── full-page-bridge.ts  # 全页桥接层消息转发与动态超时配置
│   ├── components/
│   │   └── FeeSearchQuery.vue   # 完整查询组件：快捷区、网格、高级折叠、看板与数据表
│   ├── pages/
│   │   └── FeesPage.vue         # 费用查询页面容器
│   └── App.vue                  # 路由注册（/fees）与侧边导航入口
```

---

## 3. 通信与消息协议

### 3.1 消息定义（`src/shared/message.ts`）

| 消息类型 | 作用 | Payload 结构 |
|---|---|---|
| `SEARCH_FEE` (`MessageType.SearchFee`) | 发起费用列表查询 | `{ query: FeeSearchQuery, timeoutMs?: number, batch?: boolean }` |
| `SEARCH_FEE_RESULT` (`MessageType.SearchFeeResult`) | 返回费用列表查询结果 | `ApiResult<FeeSearchResult>` |
| `SEARCH_FEE_AMOUNT` (`MessageType.SearchFeeAmount`) | 发起金额统计汇总查询 | `{ query: FeeSearchQuery, timeoutMs?: number }` |
| `SEARCH_FEE_AMOUNT_RESULT` (`MessageType.SearchFeeAmountResult`) | 返回金额统计汇总结果 | `ApiResult<Record<string, unknown>>` |

### 3.2 链路流程

```mermaid
sequenceDiagram
    participant UI as FeeSearchQuery.vue
    participant Bridge as full-page-bridge.ts
    participant BG as background.ts (Workspace)
    participant CS as content/index.ts
    participant Runtime as client.ts (EasyRuntime)
    participant Server as EASY 后端 (/AjaxServers/Report.ashx)

    UI->>Bridge: bridge.request({ type: 'SEARCH_FEE', payload: { query, timeoutMs } })
    Bridge->>BG: sendToBackground({ type: 'WORKSPACE', payload: { action: 'forward', message } })
    BG->>CS: chrome.tabs.sendMessage(tabId, message)
    CS->>Runtime: easyRuntime.searchFees(query, timeoutMs)
    Runtime->>Server: transport.post('feeSearch', params, signal, timeoutMs)
    Server-->>Runtime: JSON (ClientInfo, TableRows, TableRowsCount)
    Runtime->>Runtime: normalizeFeeSearch(raw, query)
    Runtime-->>CS: { ok: true, data: FeeSearchResult }
    CS-->>BG: { type: 'SEARCH_FEE_RESULT', payload: ... }
    BG-->>Bridge: response
    Bridge-->>UI: { type: 'SEARCH_FEE_RESULT', payload: ... }
```

---

## 4. 核心类型契约（`src/api/fee-search-types.ts`）

### 4.1 单行数据记录 `FeeSearchRow`

包含 84 列核心属性，主要包含：

```typescript
export interface FeeSearchRow {
  fee_id: string
  case_id: string
  case_volume: string
  case_volume_customer: string
  case_name: string
  case_status: string
  country: string
  business_type_name: string
  currency_type: string
  generation_status: string
  notice_status: string
  fee_name: string
  amount: number
  rate: number
  amount_currency: number
  pay_status: string
  pay_date: string
  pay_deadline_date: string
  app_no: string
  pct_app_no: string
  customer_name: string
  applicant_name: string
  ctrl_proc_name: string
  ctrl_proc_user: string
  branch_name: string
  request_status: string
  request_no: string
  receive_status: string
  settle_status: string
  raw: Record<string, unknown>
}
```

### 4.2 查询返回结果 `FeeSearchResult`

```typescript
export interface FeeSearchResult {
  rows: FeeSearchRow[]
  total: number
  pageIndex: number
  pageSize: number
  amountSummary?: FeeSearchAmountSummary
}
```

### 4.3 金额汇总 `FeeSearchAmountSummary`

```typescript
export interface FeeSearchAmountSummary {
  agentAmount: number       // 折合代理费
  officialAmount: number    // 折合官费
  otherAmount: number       // 第三方费
  totalAmount: number       // 合计折合金额
}
```

---

## 5. 组件与交互细节（`FeeSearchQuery.vue`）

1. **原站一致的 7 排查询网格**：
   - 布局严格对齐原站 `Forms/Bill/FeeSearch.aspx`。
   - 复用通用组件：[ThemeSelect.vue](../src/shell/components/ThemeSelect.vue)、[TreeOptionSelect.vue](../src/shell/components/TreeOptionSelect.vue)、[WDatePicker.vue](../src/shell/components/WDatePicker.vue)。
2. **字典加载与缓存策略**：
   - 统一调用 `MessageType.LoadDictionary`（`kind: 'picker'`），自动拉取 `limitCountry`、`limitCaseStatus`、`limitCtrlProc`、`branch`、`user`、`agent` 等通用字典树。
   - 使用 `choicesFromDictionary` 转换为组件标准选项，并通过 `hasOptionTree` 自动判定树形展示。
3. **单选模式过滤与快捷全量计算**：
   - 顶部单选条（全部 / 仅显示客户付 / 仅显示官费 / 仅收代理费）在变动时触发即时过滤或重查。
   - 同步发起 `searchFeesAmount` 请求，并实时计算当前页金额与全局总额展示在看板上。
4. **Excel 导出**：
   - 支持将当前检索结果一键导出为 CSV/Excel，字段涵盖原站全部 84 列。
