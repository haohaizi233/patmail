import type { PbcRates } from '../../../billing/pbc-rates'

/** 央行汇率读取端口，隔离具体 HTTP 获取实现。 */
export interface ExchangeRatePort {
  fetchRates(): Promise<PbcRates>
}
