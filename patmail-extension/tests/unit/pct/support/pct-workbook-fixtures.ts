import type { PctTaskRow } from '../../../../src/customer/types'

export function gap(ourVolume: string, customerName: string, note = ''): PctTaskRow {
  return {
    ourVolume,
    customerVolume: '',
    customerName,
    contactName: '',
    iprName: '',
    procLabel: '提醒申请PCT',
    mailTypeLabel: '提醒申请PCT（贵方案号）',
    ...(note ? { iprNote: note } : {})
  }
}
