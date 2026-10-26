import { describe, expect, it } from 'vitest'
import { matchListedCustomer } from '../../../src/customer/customer-list'
import { caseTextUsable } from '../../../src/customer/case-arbitration'
import { NATIONAL_CUSTOMER_TYPE, NATIONAL_PROC_LABEL } from '../../../src/customer/pct-sheet'
import { applyArbitrationReply, arbitrationAllowed, arbitrationBatchSize, iprArbitrationBrief, iprArbitrationWaves, pickArbitrationText, readArbitrationDecisions, shouldAutoArbitrate } from '../../../src/customer/pct-workbook'
import { gap } from './support/pct-workbook-fixtures'

describe('仲裁交给本地模型时分批', () => {
  it('同一客户并成一条，短说明一次三家，长说明一次一家', () => {
    const short = iprArbitrationWaves([
      gap('A1', '歌尔'),
      gap('A2', '歌尔'),
      gap('B1', '宁德'),
      gap('C1', '中兴'),
      gap('D1', '荣耀')
    ])
    expect(short).toHaveLength(2)
    expect(short[0]).toContain('第 1/2 批')
    expect(short[0]).toContain('我方文号 A1')
    expect(short[0]).toContain('我方文号 A2')
    expect(short[0]).toContain('客户要求')
    expect(short[0]).toContain('每一行单独裁')
    expect(short[0]).toContain('身份')
    expect(short[0]).toContain('抄送身份')
    expect(short[0]).toContain('技术联系人')
    expect(short[0]).not.toContain('技术负责人、商务')
    expect(short[0]).not.toContain('结论覆盖')
    expect(short[0]).not.toContain('D1')
    expect(short[0]).not.toContain('review_case_fields')
    expect(short[1]).toContain('荣耀')
    const longNote = '处理细节：'.padEnd(130, '甲')
    expect(arbitrationBatchSize([longNote, longNote])).toBe(1)
    expect(iprArbitrationWaves([gap('A1', '歌尔', longNote), gap('B1', '宁德', longNote)])).toHaveLength(2)
    expect(iprArbitrationBrief([gap('A1', '歌尔')], { 歌尔: '每月单独发给孙丽敏' })).toContain('每月单独发给孙丽敏')
    const withCase = iprArbitrationBrief([gap('A1', '歌尔')], { 歌尔: '客户要求：发给李聪' }, { A1: '案件字段：文号 A1\n案件页：\n案件名称：样例' })
    expect(withCase).toContain('著录项目')
    expect(withCase).toContain('案件名称：样例')
    expect(withCase).not.toContain('还有')
  })

  it('默认没要求时拿不准交给全选，开了才允许写技术联系人', () => {
    const byDefault = iprArbitrationWaves([gap('A1', '歌尔')])
    expect(byDefault[0]).toContain('全选联系人')
    expect(byDefault[0]).toContain('不要因为本批的兜底规则而漏写')
    expect(byDefault[0]).toContain('客户要求点名了技术联系人也照样写')
    expect(byDefault[0]).toContain('依据只写「客户要求没有指定发给谁」')
    expect(byDefault[0]).toContain('不要写「按著录项目主送技术联系人」')
    expect(byDefault[0]).toContain('只发业务')
    expect(byDefault[0]).toContain('不用发')
    expect(byDefault[0]).toContain('不用发涉外提醒')
    expect(byDefault[0]).toContain('单独写了 PCT 提醒')
    expect(byDefault[0]).toContain('提醒 PCT')
    expect(byDefault[0]).not.toContain('收件人只写著录项目或表格里的技术联系人')
    const iprOnly = iprArbitrationWaves([gap('A1', '歌尔')], {}, {}, { iprOnly: true })
    expect(iprOnly[0]).toContain('收件人只写著录项目或表格里的技术联系人')
    expect(iprOnly[0]).not.toContain('全选联系人')
  })

  it('按文号写回，拿不准的不填', () => {
    const rows = [gap('PA2519006CND', '华润怡宝'), gap('PA2518902CND', '唯品会'), gap('PA2518903CND', '唯品会')]
    const applied = applyArbitrationReply(rows, [
      '文号 PA2519006CND｜收件人 李英｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 第一客户联系人',
      '文号 PA2518902CND｜收件人 李聪、郭旭｜身份 IPR、IPR｜抄送 王五｜抄送身份 商务｜依据 微电子联系人',
      '文号 PA2518903CND｜拿不准｜依据 第一客户联系人和客户要求对不上'
    ].join('\n'))
    expect(applied.written).toBe(2)
    expect(applied.unsure).toBe(1)
    expect(applied.rows[0]?.iprName).toBe('李英')
    expect(applied.rows[0]?.iprArbitrated).toBe(true)
    expect(applied.rows[0]?.mailCc).toBeUndefined()
    expect(applied.decisions[0]?.role).toBe('客户联系人')
    expect(applied.rows[1]?.iprName).toBe('李聪、郭旭')
    expect(applied.rows[1]?.mailCc).toBeUndefined()
    expect(applied.decisions[1]?.role).toBe('IPR、IPR')
    expect(applied.decisions[1]?.cc).toBe('')
    expect(applied.decisions[1]?.ccRole).toBe('')
    expect(applied.rows[2]?.iprName).toBe('')
    expect(applied.decisions[2]?.unsure).toBe(true)
    const bracketed = applyArbitrationReply(rows, [
      '文号 <PA2519006CND>｜收件人 <李英>｜身份 <客户联系人>｜抄送 <无>｜抄送身份 <无>｜依据 <第一客户联系人>'
    ].join('\n'))
    expect(bracketed.written).toBe(1)
    expect(bracketed.rows[0]?.iprName).toBe('李英')
    expect(bracketed.rows[1]?.iprName).toBe('')
  })

  it('同文号两种事项靠事项列分开写回，没有事项列又不唯一就不写', () => {
    const remind = { ...gap('PA1', '甲客户'), procLabel: '提醒申请PCT' }
    const national = { ...gap('PA1', '甲客户'), procLabel: NATIONAL_PROC_LABEL, mailTypeLabel: NATIONAL_CUSTOMER_TYPE }
    const low = [
      '空 PA1｜事项 提醒申请PCT｜收件人 李英｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 客户要求主送李英',
      '空 PA1｜事项 ' + NATIONAL_PROC_LABEL + '｜不用发｜依据 客户要求不发进国家提醒'
    ].join('\n')
    const split = applyArbitrationReply([remind, national], low)
    expect(split.rows[0]?.iprName).toBe('李英')
    expect(split.rows[0]?.procLabel).toBe('提醒申请PCT')
    expect(split.rows[1]?.iprName).toBe('不用发')
    expect(split.rows[1]?.iprArbitrated).toBe(true)

    const bare = applyArbitrationReply([remind, national], [
      '空 PA1｜收件人 李英｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 客户要求主送李英',
      '空 PA1｜收件人 王强｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 客户要求主送王强'
    ].join('\n'))
    // 没有事项列，同文号对上两条结论分不出是哪一行，宁可不写也不串行。
    expect(bare.rows.every(row => !row.iprName)).toBe(true)

    const single = applyArbitrationReply([remind], '空 PA1｜收件人 李英｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 客户要求主送李英')
    expect(single.rows[0]?.iprName).toBe('李英')
  })

  it('核对没结束不能仲裁，整表结束后才按开关自动开始', () => {
    expect(arbitrationAllowed('idle')).toBe(false)
    expect(arbitrationAllowed('run')).toBe(false)
    expect(arbitrationAllowed('fail')).toBe(false)
    expect(arbitrationAllowed('done')).toBe(true)
    expect(shouldAutoArbitrate({ fullCheck: true, phase: 'done', enabled: true, gaps: 2, asking: false })).toBe(true)
    expect(shouldAutoArbitrate({ fullCheck: true, phase: 'run', enabled: true, gaps: 2, asking: false })).toBe(false)
    expect(shouldAutoArbitrate({ fullCheck: false, phase: 'done', enabled: true, gaps: 2, asking: false })).toBe(false)
    expect(shouldAutoArbitrate({ fullCheck: true, phase: 'done', enabled: false, gaps: 2, asking: false })).toBe(false)
    expect(shouldAutoArbitrate({ fullCheck: true, phase: 'done', enabled: true, gaps: 0, asking: false })).toBe(false)
    expect(shouldAutoArbitrate({ fullCheck: true, phase: 'done', enabled: true, gaps: 2, asking: true })).toBe(false)
  })

  it('商务和登录人不写回收件人，没有技术联系人就留空', () => {
    const rows = [gap('PA1', '海目星'), gap('PA2', '北理'), gap('PA3', '澳大'), gap('PA4', '安易')]
    const applied = applyArbitrationReply(rows, [
      '文号 PA1｜收件人 杨智银、李小艳｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 客户要求主送这两位客户联系人',
      '文号 PA2｜收件人 郑建波｜身份 技术负责人｜抄送 无｜抄送身份 无｜依据 著录项目指定郑建波为技术联系人',
      '文号 PA3｜收件人 陈冠宇｜身份 商务｜抄送 无｜抄送身份 无｜依据 客户要求邮件只发业务',
      '文号 PA4｜收件人 余祖｜身份 客户联系人｜抄送 黄萱燕、登录人｜抄送身份 客户联系人、登录人｜依据 客户要求主送余祖并抄送黄萱燕'
    ].join('\n'))
    expect(applied.rows[0]?.iprName).toBe('杨智银、李小艳')
    expect(applied.rows[0]?.iprArbitrated).toBe(true)
    expect(applied.rows[0]?.mailCc).toBeUndefined()
    expect(applied.rows[1]?.iprName).toBe('郑建波')
    expect(applied.decisions.find(item => item.volume === 'PA2')?.role).toBe('IPR')
    expect(applied.rows[2]?.iprName).toBe('')
    expect(applied.rows[2]?.iprArbitrated).toBeUndefined()
    expect(applied.decisions.find(item => item.volume === 'PA3')?.unsure).toBe(true)
    expect(applied.rows[3]?.iprName).toBe('余祖')
    expect(applied.rows[3]?.mailCc).toBe('黄萱燕')
    expect(applied.decisions.find(item => item.volume === 'PA4')?.ccRole).toBe('客户联系人')
  })

  it('不发提醒和只发业务写回表格，不当成拿不准', () => {
    const rows = [gap('PA1', '三一重能'), gap('PA2', '城市公共安全')]
    const applied = applyArbitrationReply(rows, [
      '空 PA1｜只发业务｜依据 客户要求所有邮件只发业务，不要发给客户',
      '空 PA2｜不用发｜依据 客户要求不发PCT提醒'
    ].join('\n'))
    expect(applied.written).toBe(2)
    expect(applied.unsure).toBe(0)
    expect(applied.rows[0]?.iprName).toBe('只发业务')
    expect(applied.rows[0]?.iprArbitrated).toBe(true)
    expect(applied.rows[1]?.iprName).toBe('不用发')
    expect(applied.rows[1]?.iprArbitrated).toBe(true)
    const labeled = applyArbitrationReply(rows, '文号 PA1｜收件人 只发业务｜身份 无｜抄送 无｜抄送身份 无｜依据 只发业务蔡健中')
    expect(labeled.rows[0]?.iprName).toBe('只发业务')
    expect(labeled.decisions[0]?.unsure).toBe(false)
  })

  it('没开只写技术联系人时，未指定却按著录项目写人的行改成拿不准', () => {
    const reply = [
      '空 PA25113244CN｜收件人 王金宝｜身份 IPR｜抄送 无｜抄送身份 无｜依据 客户要求未指定此案PCT提醒收件人，按著录项目主送技术联系人',
      '空 QPA25114402CN｜只发业务｜依据 著录项目仅含业务人员且客户要求未指定PCT提醒收件人'
    ].join('\n')
    const held = applyArbitrationReply([gap('PA25113244CN', '深大'), gap('QPA25114402CN', '余昊')], reply)
    expect(held.written).toBe(0)
    expect(held.unsure).toBe(2)
    expect(held.rows.every(row => !row.iprName)).toBe(true)
    const allowed = applyArbitrationReply([gap('PA25113244CN', '深大')], reply, { iprOnly: true })
    expect(allowed.written).toBe(1)
    expect(allowed.rows[0]?.iprName).toBe('王金宝')
  })

  it('短总结里的「文号」不盖过真正的裁决行', () => {
    const lines = [
      '文号为PA2519006CND｜收件人 李英｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 第一客户联系人',
      '文号是PA2518902CND｜收件人 李聪｜身份 IPR｜抄送 无｜抄送身份 无｜依据 微电子联系人'
    ].join('\n')
    const summary = '已按文号裁完这一批。'
    const picked = pickArbitrationText([summary, `${lines}\n\n${summary}`, lines])
    expect(readArbitrationDecisions(picked).map(item => item.volume)).toEqual(['PA2519006CND', 'PA2518902CND'])
    const packed = applyArbitrationReply(
      [gap('PA1', '华润怡宝'), gap('PA2', '唯品会')],
      '文号为PA1｜收件人 杨智银｜身份 客户联系人｜抄送 无｜抄送身份 无｜依据 客户要求 文号是PA2｜收件人 郑建波｜身份 IPR｜抄送 无｜抄送身份 无｜依据 著录项目指定技术联系人'
    )
    expect(packed.written).toBe(2)
    expect(packed.rows[0]?.iprName).toBe('杨智银')
    expect(packed.rows[1]?.iprName).toBe('郑建波')
  })

  it('客户文号加我方文号的回复整批读回，英文词不算文号', () => {
    const reply = [
      '文号 being 还没定。',
      'HYMI0089 PA25213828CN｜拿不准｜依据 客户要求没有指定发给谁',
      'HYMI0090 PZ25213909CN｜拿不准｜依据 客户要求没有指定发给谁',
      '空 CW1PZ2528270CN｜收件人 金超、陈垣静｜身份 发明人、发明人｜抄送 黄慧燕｜抄送身份 客户联系人｜依据 客户要求明确主送金超、陈垣静，抄送黄慧燕',
      '空 PA25113213CN-优｜拿不准｜依据 客户要求没有指定发给谁',
      '空 QPA25114402CN｜拿不准｜依据 客户要求没有指定发给谁'
    ].join('\n')
    const picked = pickArbitrationText(['已按文号裁完，being 只是说明。', reply])
    const applied = applyArbitrationReply(
      [gap('PA25213828CN', '海目'), gap('PZ25213909CN', '海目'), gap('CW1PZ2528270CN', '海目'), gap('PA25113213CN-优', '海目'), gap('QPA25114402CN', '海目')],
      picked
    )
    expect(applied.decisions.map(item => item.volume)).toEqual([
      'PA25213828CN', 'PZ25213909CN', 'CW1PZ2528270CN', 'PA25113213CN-优', 'QPA25114402CN'
    ])
    expect(applied.decisions.filter(item => item.unsure)).toHaveLength(4)
    expect(applied.decisions[0]?.reason).toBe('客户要求没有指定发给谁')
    const leaked = "HYMI0089 PA25213828CN｜拿不准｜依据 客户要求没有指定发给谁` to be precise, but the prompt says `文号 我方文号`. I'll just output exactly as formatted in the successful previous batch."
    expect(readArbitrationDecisions(leaked)[0]?.reason).toBe('客户要求没有指定发给谁')
    expect(applied.written).toBe(1)
    expect(applied.rows[2]?.iprName).toBe('金超、陈垣静')
    expect(applied.rows[2]?.mailCc).toBe('黄慧燕')
    expect(applied.decisions[2]?.role).toBe('发明人、发明人')
    expect(applied.decisions[2]?.ccRole).toBe('客户联系人')
    expect(applied.decisions.some(item => item.volume === 'being')).toBe(false)
  })

  it('客户名单对不上多家时不猜，著录项目空文不拿去仲裁', () => {
    const listed = matchListedCustomer('华润怡宝', [{ id: '11111111-1111-4111-8111-111111111111', name: '华润怡宝' }])
    expect(listed && listed !== 'many' ? listed.name : '').toBe('华润怡宝')
    expect(matchListedCustomer('招商银行', [
      { id: '11111111-1111-4111-8111-111111111111', name: '招商银行-信息技术部' },
      { id: '22222222-2222-4222-8222-222222222222', name: '招银理财有限责任公司（招商银行）' }
    ])).toBe('many')
    expect(caseTextUsable('案件字段：文号 PA1\n案件要求：没有读到要求。\n发明人：没有读到发明人。\n案件页：没有读到基本信息。')).toBe(false)
    expect(caseTextUsable('案件字段：文号 PA1\n案件要求：没有读到要求。\n发明人：张三\n案件页：没有读到基本信息。')).toBe(true)
  })
})
