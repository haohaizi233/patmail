/** 从 Forms/NewFiling/Finished.aspx 的查询条件区抽出控件与下拉选项。整段函数可单独放进页面执行。不读取输入值。 */

/** 控件 id 与 Element 字段同名。只扫这些控件，别的插件脚本不碰。 */
export const FILING_FORM_FIELDS = [
  'case_volume', 'ctrl_proc', 'customer_volume', 'customer', 'customer_code', 'flow_direction',
  'case_name', 'case_type', 'audit_user_id', 'create_time_start', 'create_time_end',
  'create_user_id', 'create_date_start', 'create_date_end', 'activity',
  'finish_date_start', 'finish_date_end', 'contract_no', 'business_coop', 'is_paper_notice',
  'agent_name', 'applicant', 'app_no', 'apply_type', 'app_date_start', 'app_date_end',
  'history', 'sales_user_id', 'branch_dept', 'history_remark', 'audit_type'
]

export function scanFilingForm(doc) {
  function clean(text) {
    return String(text || '').replace(/\s+/g, ' ').replace(/：/g, '').trim()
  }
  function labelOf(node) {
    const row = node.closest('tr')
    const cell = node.closest('td')
    if (row && cell) {
      const cells = [...row.children]
      const index = cells.indexOf(cell)
      for (let i = index - 1; i >= 0; i -= 1) {
        const named = cells[i].querySelector('span[name="Dictionary"]')
        const text = clean(named ? named.textContent : cells[i].textContent)
        if (text) return text.slice(0, 60)
      }
    }
    return node.id
  }
  function inlineHidden(node) {
    return /display\s*:\s*none/i.test(node.getAttribute('style') || '')
  }
  function hideChain(node) {
    const chain = []
    let current = node
    while (current && current.tagName.toLowerCase() !== 'body') {
      if (inlineHidden(current)) {
        const id = current.id ? `#${current.id}` : ''
        const classes = String(current.className || '').trim().replace(/\s+/g, '.')
        chain.push(`${current.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ''}`)
      }
      current = current.parentElement
    }
    return chain
  }
  function controlOf(node) {
    const tag = node.tagName.toLowerCase()
    if (tag === 'select') return 'select'
    if (node.type === 'checkbox') return 'check'
    const onclick = node.getAttribute('onclick') || ''
    if (node.getAttribute('data_type') === 'object' || node.getAttribute('tree_id') || /TreeUser/i.test(node.className || '')) return 'picker'
    if (/WdatePicker/i.test(onclick) || node.classList.contains('Wdate')) return 'text'
    return 'text'
  }
  function optionsOf(node) {
    if (node.tagName.toLowerCase() !== 'select') return []
    return [...node.querySelectorAll('option')].slice(0, 800).map(option => ({
      value: clean(option.getAttribute('value') === null ? option.textContent : (option.getAttribute('value') || '')).slice(0, 80),
      label: clean(option.textContent).slice(0, 160) || '请选择'
    }))
  }

  const root = doc && doc.querySelector ? doc : document
  const fields = []
  for (const id of FILING_FORM_FIELDS) {
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
    const node = root.querySelector(`#${escaped}`)
    if (!node) continue
    const chain = hideChain(node)
    fields.push({
      id,
      label: labelOf(node),
      section: 'case',
      advanced: false,
      control: controlOf(node),
      visible: chain.length === 0,
      hiddenBy: chain,
      options: optionsOf(node)
    })
  }
  return { page: 'Finished.aspx', fields }
}

/**
 * 等页面 JS 把 select 的 option 填完再扫。原站 case_type、business_coop、history
 * 都是空 select，靠 GetFilingFlowNode、InitContractStatus 的回调补上，早扫会扫到空。
 */
export async function waitFilingFormOptions(doc, timeoutMs = 3000) {
  const root = doc && doc.querySelector ? doc : document
  const view = root.defaultView || window
  const sleep = milliseconds => new Promise(resolve => view.setTimeout(resolve, milliseconds))
  const targets = () => FILING_FORM_FIELDS
    .map(id => root.querySelector(`#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id}`))
    .filter(node => node && node.tagName.toLowerCase() === 'select')
  let last = -1
  let stable = 0
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const count = targets().reduce((total, node) => total + node.querySelectorAll('option').length, 0)
    if (count > 0 && count === last) {
      stable += 1
      if (stable >= 2) return count
    } else {
      stable = 0
    }
    last = count
    await sleep(150)
  }
  return targets().reduce((total, node) => total + node.querySelectorAll('option').length, 0)
}
