import { describe, expect, it } from 'vitest'
import { latestAnnouncementUrl, normalizeCurrency, parsePbcAnnouncement } from '../../../src/billing/pbc-rates'

// 取自中国人民银行官网公开公告（2026-11-19）。
const ANNOUNCEMENT = '中国人民银行授权中国外汇交易中心公布，2026年11月19日银行间外汇市场人民币汇率中间价为1美元对人民币6.7128元，1欧元对人民币7.3444元，100日元对人民币4.1995元，1港元对人民币0.85563元，1英镑对人民币8.8030元，1澳大利亚元对人民币4.4916元，1新西兰元对人民币3.6746元，1新加坡元对人民币5.1913元，1瑞士法郎对人民币7.9410元，1加拿大元对人民币4.6687元，人民币1元对1.2044澳门元，人民币1元对0.61409林吉特，人民币1元对12.3552俄罗斯卢布，人民币1元对2.5791南非兰特，人民币1元对199.29韩元，人民币1元对0.54916阿联酋迪拉姆，人民币1元对0.56088沙特里亚尔，人民币1元对50.1645匈牙利福林，人民币1元对0.60020波兰兹罗提，人民币1元对1.0179丹麦克朗，人民币1元对1.5192瑞典克朗，人民币1元对1.4486挪威克朗，人民币1元对7.53928土耳其里拉，人民币1元对2.8133墨西哥比索，人民币1元对5.0821泰铢。'

describe('人民银行汇率公告解析', () => {
  it('keeps the exact display digits when converting the per-100 JPY quote', () => {
    const rates = parsePbcAnnouncement(ANNOUNCEMENT.replace('4.1995元', '4.1961元'))
    expect(String(rates?.perCny.JPY)).toBe('0.041961')
  })
  it('直接标价、100 日元、间接标价（取倒数）都折成「1 单位外币 = ? 人民币」', () => {
    const rates = parsePbcAnnouncement(`<p>${ANNOUNCEMENT}</p>`)
    expect(rates?.date).toBe('2026-11-19')
    expect(rates?.perCny.USD).toBe(6.7128)
    expect(rates?.perCny.EUR).toBe(7.3444)
    expect(rates?.perCny.JPY).toBeCloseTo(0.041995, 6)
    expect(rates?.perCny.HKD).toBe(0.85563)
    expect(rates?.perCny.KRW).toBeCloseTo(1 / 199.29, 5)
    expect(rates?.perCny.THB).toBeCloseTo(1 / 5.0821, 5)
    expect(Object.keys(rates?.perCny ?? {})).toHaveLength(25)
  })

  it('不是公告正文时返回 null，不编造汇率', () => {
    expect(parsePbcAnnouncement('<html>维护中</html>')).toBeNull()
  })

  it('从列表页取最新一条公告，排除「历史数据」入口', () => {
    const html = '<a href="/zhengcehuobisi/125207/125217/125925/2929357/index.html">人民币汇率中间价公告历史数据</a>' +
      '<a href="/zhengcehuobisi/125207/125217/125925/2026111908562093634/index.html">2026年11月19日中国外汇交易中心受权公布人民币汇率中间价公告</a>' +
      '<a href="/zhengcehuobisi/125207/125217/125925/2026111808572885899/index.html">2026年11月18日中国外汇交易中心受权公布人民币汇率中间价公告</a>'
    expect(latestAnnouncementUrl(html)).toBe('https://www.pbc.gov.cn/zhengcehuobisi/125207/125217/125925/2026111908562093634/index.html')
  })

  it('币别名称与代码互认', () => {
    expect(normalizeCurrency('欧元')).toBe('EUR')
    expect(normalizeCurrency('usd')).toBe('USD')
    expect(normalizeCurrency('')).toBe('CNY')
    expect(normalizeCurrency('人民币')).toBe('CNY')
  })
})
