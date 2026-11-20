/** 中国人民银行·人民币汇率中间价公告（中国外汇交易中心受权公布）。 */
export const PBC_INDEX_URL = 'https://www.pbc.gov.cn/zhengcehuobisi/125207/125217/125925/index.html'

export interface PbcRates {
  /** 公告日期 yyyy-mm-dd */
  date: string
  /** 1 单位外币折合多少人民币（直接标价外币 + 间接标价外币取倒数，保留 4 位）。 */
  perCny: Record<string, number>
  sourceUrl: string
}

const DIRECT: Array<[string, string, number]> = [
  ['美元', 'USD', 1], ['欧元', 'EUR', 1], ['日元', 'JPY', 100], ['港元', 'HKD', 1], ['英镑', 'GBP', 1],
  ['澳大利亚元', 'AUD', 1], ['新西兰元', 'NZD', 1], ['新加坡元', 'SGD', 1], ['瑞士法郎', 'CHF', 1], ['加拿大元', 'CAD', 1]
]

const INDIRECT: Array<[string, string]> = [
  ['澳门元', 'MOP'], ['林吉特', 'MYR'], ['俄罗斯卢布', 'RUB'], ['南非兰特', 'ZAR'], ['韩元', 'KRW'],
  ['阿联酋迪拉姆', 'AED'], ['沙特里亚尔', 'SAR'], ['匈牙利福林', 'HUF'], ['波兰兹罗提', 'PLN'], ['丹麦克朗', 'DKK'],
  ['瑞典克朗', 'SEK'], ['挪威克朗', 'NOK'], ['土耳其里拉', 'TRY'], ['墨西哥比索', 'MXN'], ['泰铢', 'THB']
]

/** 常见币种代码与中文名称的互认（EASY 费用行里币别可能是代码，也可能是中文）。 */
const CURRENCY_ALIASES: Record<string, string> = {
  人民币: 'CNY', RMB: 'CNY', CNY: 'CNY', 元: 'CNY',
  美元: 'USD', 美金: 'USD', USD: 'USD',
  欧元: 'EUR', 欧: 'EUR', EUR: 'EUR',
  日元: 'JPY', 日币: 'JPY', JPY: 'JPY',
  港元: 'HKD', 港币: 'HKD', HKD: 'HKD',
  英镑: 'GBP', GBP: 'GBP',
  澳元: 'AUD', 澳币: 'AUD', 澳大利亚元: 'AUD', AUD: 'AUD',
  新西兰元: 'NZD', 纽币: 'NZD', NZD: 'NZD',
  新加坡元: 'SGD', 新币: 'SGD', SGD: 'SGD',
  瑞士法郎: 'CHF', 瑞郎: 'CHF', CHF: 'CHF',
  加拿大元: 'CAD', 加币: 'CAD', CAD: 'CAD',
  韩元: 'KRW', 韩币: 'KRW', KRW: 'KRW',
  俄罗斯卢布: 'RUB', 卢布: 'RUB', RUB: 'RUB',
  印度卢比: 'INR', 卢比: 'INR', INR: 'INR',
  泰铢: 'THB', THB: 'THB',
  林吉特: 'MYR', 马币: 'MYR', MYR: 'MYR',
  阿联酋迪拉姆: 'AED', 迪拉姆: 'AED', AED: 'AED',
  沙特里亚尔: 'SAR', 里亚尔: 'SAR', SAR: 'SAR',
  澳门元: 'MOP', 葡币: 'MOP', MOP: 'MOP'
}

export function normalizeCurrency(raw: string | undefined | null): string {
  const text = (raw ?? '').trim()
  if (!text) return 'CNY'
  const upper = text.toUpperCase()
  return CURRENCY_ALIASES[text] ?? CURRENCY_ALIASES[upper] ?? upper
}

function plainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
}

/** 公告正文 → 汇率表。日本 100 日元、间接标价币种均折成「1 单位外币 = ? 人民币」。 */
export function parsePbcAnnouncement(source: string, sourceUrl = PBC_INDEX_URL): PbcRates | null {
  const text = source.includes('<') ? plainText(source) : source
  const dateMatch = /(\d{4})年(\d{1,2})月(\d{1,2})日银行间外汇市场/.exec(text)
  if (!dateMatch) return null
  const perCny: Record<string, number> = {}
  for (const [name, code, unit] of DIRECT) {
    const match = new RegExp(`${unit}${name}对人民币\\s*([0-9.]+)\\s*元`).exec(text)
    if (match) perCny[code] = Number(match[1]) / unit
  }
  for (const [name, code] of INDIRECT) {
    const match = new RegExp(`人民币1元对\\s*([0-9.]+)\\s*${name}`).exec(text)
    const value = match ? Number(match[1]) : 0
    if (value > 0) perCny[code] = Math.round((1 / value) * 1e6) / 1e6
  }
  if (!perCny.USD || !perCny.EUR) return null
  const date = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`
  return { date, perCny, sourceUrl }
}

/** 公告列表页 → 最新一条公告的详情地址。 */
export function latestAnnouncementUrl(indexHtml: string, base = PBC_INDEX_URL): string | null {
  const links = [...indexHtml.matchAll(/<a[^>]+href=["']([^"']*\/125925\/\d{8,}[^"']*\/index\.html)["'][^>]*>([^<]*)<\/a>/gi)]
    .filter(match => /汇率中间价公告/.test(match[2] ?? '') && !/历史数据/.test(match[2] ?? ''))
  const first = links[0]
  return first ? new URL(first[1], base).href : null
}

export async function fetchPbcRates(fetchImpl: typeof fetch = fetch): Promise<PbcRates> {
  const indexResponse = await fetchImpl(PBC_INDEX_URL, { credentials: 'omit' })
  if (!indexResponse.ok) throw new Error(`人民银行汇率公告列表读取失败（HTTP ${indexResponse.status}）。`)
  const detailUrl = latestAnnouncementUrl(await indexResponse.text())
  if (!detailUrl) throw new Error('人民银行汇率公告列表里没有找到最新公告。')
  const detailResponse = await fetchImpl(detailUrl, { credentials: 'omit' })
  if (!detailResponse.ok) throw new Error(`人民银行汇率公告读取失败（HTTP ${detailResponse.status}）。`)
  const rates = parsePbcAnnouncement(await detailResponse.text(), detailUrl)
  if (!rates) throw new Error('人民银行汇率公告格式无法识别，请手工填写汇率。')
  return rates
}
