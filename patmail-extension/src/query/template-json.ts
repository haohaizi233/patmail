import { filingSearchValueLimit, isFilingSearchInputField } from '../api/filing-search-params'
import { fileSearchValueLimit, isFileSearchBusinessField } from '../api/file-search-params'
import { isLimitMonitorInputField } from '../api/limit-monitor-params'
import { isForbiddenFieldName } from './field-registry'

/**
 * 查询模板的 JSON 导出 / 导入。文件管理、递交管理、期限监控三张查询表共用这一份。
 *
 * 导出只写查询条件本身，不写模板名：导入后由自己命名、自己保存。
 * 导入前逐项核对条件字段是否对得上这张查询表，对不上的整份拒收并点名，
 * 免得混进别的查询面的条件，查出来的范围悄悄变宽。
 */

export const TEMPLATE_JSON_FORMAT = 'patmail.query-template'
export const TEMPLATE_JSON_VERSION = 1

/** 模板 JSON 记的查询面。三张表各用各的模板，条件不能混用。 */
export type TemplateJsonSurface = 'FileSearch' | 'FilingSearch' | 'LimitMonitor'

export interface TemplateJsonConditions {
  fields: Record<string, string>
  displayValues: Record<string, string>
  unknownFields: Record<string, string>
}

export interface TemplateJsonInput {
  fields: Record<string, string>
  displayValues?: Record<string, string>
  unknownFields?: Record<string, string>
}

export type TemplateJsonRead =
  | { ok: true; conditions: TemplateJsonConditions }
  | { ok: false; message: string }

interface SurfaceRules {
  label: string
  isField(name: string): boolean
  valueLimit(name: string): number
  /** 页面控件附带字段（下载名称这类）能不能收。只有文件查询有。 */
  allowExtras: boolean
}

/** 附带字段的键名口径和模板校验一致：普通标识符，危险名一律不收。 */
const EXTRA_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const EXTRA_VALUE_MAX = 4000

const SURFACES: Record<TemplateJsonSurface, SurfaceRules> = {
  FileSearch: { label: '文件管理', isField: isFileSearchBusinessField, valueLimit: fileSearchValueLimit, allowExtras: true },
  FilingSearch: { label: '递交管理', isField: isFilingSearchInputField, valueLimit: filingSearchValueLimit, allowExtras: false },
  LimitMonitor: { label: '期限监控', isField: isLimitMonitorInputField, valueLimit: fileSearchValueLimit, allowExtras: true }
}

export function templateJsonSurfaceLabel(surface: TemplateJsonSurface): string {
  return SURFACES[surface].label
}

function filled(source: Record<string, string> | undefined, accept: (key: string) => boolean): Record<string, string> {
  const output: Record<string, string> = {}
  if (!source) return output
  for (const key of Object.keys(source)) {
    const value = source[key]
    if (!Object.prototype.hasOwnProperty.call(source, key) || isForbiddenFieldName(key)) continue
    if (typeof value !== 'string' || !value.trim() || !accept(key)) continue
    output[key] = value
  }
  return output
}

/** 导出 JSON 文本：只写非空条件，不写模板名。 */
export function templateJsonText(surface: TemplateJsonSurface, input: TemplateJsonInput): string {
  const rules = SURFACES[surface]
  const fields = filled(input.fields, key => rules.isField(key))
  const displayValues = filled(input.displayValues, key => Object.prototype.hasOwnProperty.call(fields, key))
  const unknownFields = filled(input.unknownFields, key => rules.allowExtras && EXTRA_KEY.test(key))
  const payload: Record<string, unknown> = {
    format: TEMPLATE_JSON_FORMAT,
    version: TEMPLATE_JSON_VERSION,
    queryType: surface,
    fields
  }
  if (Object.keys(displayValues).length) payload.displayValues = displayValues
  if (Object.keys(unknownFields).length) payload.unknownFields = unknownFields
  return JSON.stringify(payload, null, 2)
}

/** 模板名进文件名前先洗一遍：Windows 不允许 `\/:*?"<>|`，控制字符也要去掉，名字还可能很长。 */
function fileNameSegment(name: string): string {
  return Array.from(name.replace(/[\\/:*?"<>|]/g, '_'))
    .filter(char => char.charCodeAt(0) >= 0x20)
    .slice(0, 40)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 导出文件名带查询面、模板名和时间戳，方便在几份 JSON 之间分辨。时间精确到秒：同一分钟里连点几次导出，
 *  只到分钟会同名，Chrome 会改名加 (1)(2)，几份内容不同的 JSON 更分不清哪份是哪次的。
 *  模板名为空（没选模板也没填名称）就只写查询面和时间戳。 */
export function templateJsonFileName(surface: TemplateJsonSurface, sourceName = '', now: Date = new Date()): string {
  const pad = (part: number): string => String(part).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const from = fileNameSegment(sourceName)
  return `查询模板-${SURFACES[surface].label}${from ? `-${from}` : ''}-${stamp}.json`
}

/** 下载 JSON 文件。和 Excel 导出一样走一次性 `<a download>`，不碰原站的下载通道。 */
export function downloadTemplateJson(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function readRecord(raw: unknown): Record<string, unknown> | null {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

type ValuesRead = { ok: true; values: Record<string, string> } | { ok: false; message: string }

/** 逐项核对条件：字段名对不上查询表、值不是文本、值超长，都整份拒收并点名。 */
function checkValues(
  source: Record<string, unknown>,
  accept: (key: string) => boolean,
  limit: (key: string) => number,
  label: string
): ValuesRead {
  const values: Record<string, string> = {}
  const mismatched: string[] = []
  const wrongType: string[] = []
  const tooLong: string[] = []
  for (const key of Object.keys(source)) {
    const value = source[key]
    if (isForbiddenFieldName(key) || !accept(key)) {
      mismatched.push(key)
      continue
    }
    if (typeof value !== 'string') {
      wrongType.push(key)
      continue
    }
    if (value.length > limit(key)) {
      tooLong.push(key)
      continue
    }
    values[key] = value
  }
  if (mismatched.length) {
    return { ok: false, message: `这些条件对不上${label}的查询表：${mismatched.join('、')}。这份模板没有导入。` }
  }
  if (wrongType.length) {
    return { ok: false, message: `这些条件的值不是文本：${wrongType.join('、')}。这份模板没有导入。` }
  }
  if (tooLong.length) {
    return { ok: false, message: `这些条件的值超出长度上限：${tooLong.join('、')}。这份模板没有导入。` }
  }
  return { ok: true, values }
}

/** 读入模板 JSON：先认格式和查询面，再逐项核对条件字段是否对得上这张查询表。 */
export function readTemplateJson(text: string, surface: TemplateJsonSurface): TemplateJsonRead {
  const rules = SURFACES[surface]
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    return { ok: false, message: '这不是有效的 JSON 文件，没有导入。' }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, message: '这不是 PatMail 查询模板 JSON，没有导入。' }
  }
  const record = raw as Record<string, unknown>
  if (record.format !== TEMPLATE_JSON_FORMAT) {
    return { ok: false, message: '这不是 PatMail 查询模板 JSON，没有导入。' }
  }
  if (record.version !== TEMPLATE_JSON_VERSION) {
    return { ok: false, message: '这份模板 JSON 的版本不支持，没有导入。' }
  }
  if (record.queryType !== surface) {
    const from = typeof record.queryType === 'string' && record.queryType in SURFACES
      ? SURFACES[record.queryType as TemplateJsonSurface].label
      : '别的查询表'
    return { ok: false, message: `这份 JSON 是${from}的模板，对不上${rules.label}的查询表，没有导入。` }
  }
  const fields = readRecord(record.fields)
  const displayValues = readRecord(record.displayValues)
  const unknownFields = readRecord(record.unknownFields)
  if (!fields || !displayValues || !unknownFields) {
    return { ok: false, message: '这份模板 JSON 的条件结构不对，没有导入。' }
  }
  const checkedFields = checkValues(fields, key => rules.isField(key), key => rules.valueLimit(key), rules.label)
  if (!checkedFields.ok) return checkedFields
  const checkedDisplay = checkValues(displayValues, key => rules.isField(key), key => rules.valueLimit(key), rules.label)
  if (!checkedDisplay.ok) return checkedDisplay
  const checkedExtras = checkValues(unknownFields, key => rules.allowExtras && EXTRA_KEY.test(key), () => EXTRA_VALUE_MAX, rules.label)
  if (!checkedExtras.ok) return checkedExtras
  if (!Object.values(checkedFields.values).some(value => value.trim())) {
    return { ok: false, message: '这份模板 JSON 里没有查询条件，没有导入。' }
  }
  return {
    ok: true,
    conditions: { fields: checkedFields.values, displayValues: checkedDisplay.values, unknownFields: checkedExtras.values }
  }
}
