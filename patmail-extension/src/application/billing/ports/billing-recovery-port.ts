/** 请款工作台本地断点恢复存储端口。 */
export interface BillingRecoveryPort<TSnapshot = unknown> {
  load(scope: string): Promise<TSnapshot | null>
  save(scope: string, snapshot: TSnapshot): Promise<void>
}
