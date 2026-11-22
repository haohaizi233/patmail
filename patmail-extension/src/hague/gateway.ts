import type { AstAnalysis } from './diagnostics/ast/analyzer.mjs'
import type { TraceContext } from './diagnostics/trace'
import type { DraftCheckpoint, DraftCommand, DraftReceipt, DraftRecovery } from './draft-contract'
import type { DraftRunnerHost } from './draft-runner'

/** 海牙命令执行上下文（透传草稿标识与诊断追踪信息）。 */
export interface HagueExecutionContext {
  readonly documentId?: string
  readonly reference?: string
  readonly trace?: TraceContext
}

/**
 * 海牙 eHague 协议执行网关端口。
 * 将只读检查（inspect）、业务写入（execute）与受限恢复（recover）显式隔离，
 * 保护 uncertain/unknown 语义、单次重试上限与认证刷新边界。
 */
export interface HagueGateway {
  readonly transport: 'http' | 'page'
  inspect(reference?: string, trace?: TraceContext): Promise<DraftReceipt>
  execute(command: DraftCommand, context: HagueExecutionContext): Promise<DraftReceipt>
  recover?(command: DraftCommand, checkpoint: DraftCheckpoint, trace?: TraceContext): Promise<DraftRecovery>
  refreshAuthentication?(): Promise<boolean>
}

/** 海牙检查点持久化端口。 */
export interface HagueCheckpointStorePort {
  save(checkpoint: DraftCheckpoint): Promise<void>
  update?(checkpoint: DraftCheckpoint): void
}

/**
 * 海牙静态诊断只读端口；仅允许诊断辅助注入，不得参与生产执行控制流。
 */
export interface HagueDiagnosticsPort {
  summarizeStaticAst(source: string, scriptId?: string): Promise<Pick<AstAnalysis, 'fingerprint' | 'scriptHash'>>
}

/**
 * 基于保护性 HagueGateway 与检查点端口构造 draft-runner 使用的 Host。
 * - `inspect` 命令固定路由至 `gateway.inspect`
 * - 其余命令路由至 `gateway.execute`
 * - `save`/`update`/`recover`/`refreshAuthentication` 原样转发，不放宽任何重试或状态保护策略
 */
export function createDraftRunnerHost(
  gateway: HagueGateway,
  store: HagueCheckpointStorePort,
  caseRunId?: string,
): DraftRunnerHost {
  const host: DraftRunnerHost = {
    ...(caseRunId !== undefined ? { caseRunId } : {}),
    transport: gateway.transport,
    call(command: DraftCommand, documentId?: string, reference?: string, trace?: TraceContext): Promise<DraftReceipt> {
      if (command.op === 'inspect') {
        return gateway.inspect(reference, trace)
      }
      return gateway.execute(command, { documentId, reference, trace })
    },
    save(checkpoint: DraftCheckpoint): Promise<void> {
      return store.save(checkpoint)
    },
  }

  if (store.update) {
    host.update = checkpoint => {
      store.update?.(checkpoint)
    }
  }
  if (gateway.recover) {
    host.recover = (command, checkpoint, trace) => {
      if (!gateway.recover) return Promise.resolve({ outcome: 'unknown' })
      return gateway.recover(command, checkpoint, trace)
    }
  }
  if (gateway.refreshAuthentication) {
    host.refreshAuthentication = () => {
      if (!gateway.refreshAuthentication) return Promise.resolve(false)
      return gateway.refreshAuthentication()
    }
  }

  return host
}
