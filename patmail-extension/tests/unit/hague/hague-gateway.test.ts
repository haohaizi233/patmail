import { describe, expect, it, vi } from 'vitest'
import type { DraftCheckpoint, DraftCommand, DraftReceipt, DraftRecovery } from '../../../src/hague/draft-contract'
import type { DraftPlan } from '../../../src/hague/draft-plan'
import { draftPlanKey, draftSteps, runDraftPlan, upgradeLegacyDraftCheckpoint } from '../../../src/hague/draft-runner'
import {
  createDraftRunnerHost,
  type HagueCheckpointStorePort,
  type HagueGateway,
} from '../../../src/hague/gateway'

function makePlan(): DraftPlan {
  return {
    reference: 'PO1HAGUE',
    applicants: [
      {
        name: 'Example Corp',
        address: 'Road 1',
        city: 'Suzhou',
        region: 'JS',
        country: 'CN',
        postalCode: '215000',
      },
    ],
    creators: [
      {
        givenName: 'Wei',
        familyName: 'Zhang',
        address: {
          name: 'Wei Zhang',
          address: 'Road 1',
          city: 'Suzhou',
          region: 'JS',
          country: 'CN',
          postalCode: '215000',
        },
      },
    ],
    parties: ['EM'],
    publicationMonths: 6,
    priorities: [],
    locarno: '28',
    description: 'Initial text',
    designs: [],
  }
}

function makeStore(): {
  store: HagueCheckpointStorePort
  saved: DraftCheckpoint[]
  updated: DraftCheckpoint[]
} {
  const saved: DraftCheckpoint[] = []
  const updated: DraftCheckpoint[] = []
  return {
    saved,
    updated,
    store: {
      save(checkpoint) {
        saved.push({ ...checkpoint })
        return Promise.resolve()
      },
      update(checkpoint) {
        updated.push({ ...checkpoint })
      },
    },
  }
}

describe('HagueGateway & createDraftRunnerHost', () => {
  it('separates inspect from write execute commands and forwards store hooks', async () => {
    const inspectSpy = vi.fn<HagueGateway['inspect']>(() =>
      Promise.resolve({ ok: true, reference: 'REF-1', documentId: 'doc-1', page: 'application' }),
    )
    const executeSpy = vi.fn<HagueGateway['execute']>(() =>
      Promise.resolve({ ok: true, reference: 'REF-1', documentId: 'doc-1', page: 'application' }),
    )
    const { store, saved, updated } = makeStore()
    const host = createDraftRunnerHost(
      { transport: 'http', inspect: inspectSpy, execute: executeSpy },
      store,
      'run-1',
    )

    expect(host.caseRunId).toBe('run-1')
    expect(host.transport).toBe('http')
    expect('recover' in host).toBe(false)
    expect('refreshAuthentication' in host).toBe(false)

    await host.call({ op: 'inspect' }, 'doc-1', 'REF-1')
    await host.call({ op: 'locarno', value: '28' }, 'doc-1', 'REF-1')

    expect(inspectSpy).toHaveBeenCalledOnce()
    expect(executeSpy).toHaveBeenCalledWith(
      { op: 'locarno', value: '28' },
      { documentId: 'doc-1', reference: 'REF-1', trace: undefined },
    )

    const sampleCheckpoint: DraftCheckpoint = {
      tabId: 7,
      next: 1,
      total: 5,
      status: 'running',
      stage: 'locarno',
    }
    await host.save(sampleCheckpoint)
    host.update?.(sampleCheckpoint)
    expect(saved).toHaveLength(1)
    expect(updated).toHaveLength(1)
  })

  it('preserves uncertain status on unconfirmed failure and enforces single-retry recovery', async () => {
    const plan = makePlan()
    const steps = draftSteps(plan)
    const locarnoIndex = steps.findIndex(step => step.command.op === 'locarno')
    const baseReceipt: DraftReceipt = { ok: true, reference: '123', documentId: 'doc-2', page: 'application' }

    const uncertainStore = makeStore()
    let failCount = 0
    const noRecoverGateway: HagueGateway = {
      transport: 'page',
      inspect: () => Promise.resolve(baseReceipt),
      execute: () => {
        failCount += 1
        return Promise.resolve({ ok: false, error: 'network dropped after submit' })
      },
    }
    const checkpointBeforeFail: DraftCheckpoint = {
      transport: 'page',
      tabId: 7,
      reference: '123',
      planKey: draftPlanKey(plan),
      next: locarnoIndex,
      total: steps.length,
      status: 'stopped',
      stage: '',
    }

    await expect(
      runDraftPlan(plan, 7, createDraftRunnerHost(noRecoverGateway, uncertainStore.store), undefined, checkpointBeforeFail),
    ).rejects.toThrow()
    expect(failCount).toBe(1)
    expect(uncertainStore.saved.some(cp => cp.status === 'uncertain')).toBe(true)

    const retryStore = makeStore()
    let attempts = 0
    const controller = new AbortController()
    const recoverSpy = vi.fn<NonNullable<HagueGateway['recover']>>(() =>
      Promise.resolve<DraftRecovery>({ outcome: 'retry', receipt: baseReceipt }),
    )
    const refreshSpy = vi.fn<NonNullable<HagueGateway['refreshAuthentication']>>(() => Promise.resolve(true))
    const retryGateway: HagueGateway = {
      transport: 'http',
      inspect: () => Promise.resolve(baseReceipt),
      execute: (cmd: DraftCommand) => {
        if (cmd.op === 'locarno') {
          attempts += 1
          if (attempts === 1) {
            return Promise.resolve({ ok: false, error: 'transient' })
          }
          controller.abort()
        }
        return Promise.resolve(baseReceipt)
      },
      recover: recoverSpy,
      refreshAuthentication: refreshSpy,
    }

    const host = createDraftRunnerHost(retryGateway, retryStore.store)
    const nextState = await runDraftPlan(plan, 7, host, controller.signal, checkpointBeforeFail)
    expect(attempts).toBe(2)
    expect(recoverSpy).toHaveBeenCalledOnce()
    expect(nextState.recoveryAttempts?.[String(locarnoIndex)]).toBe(1)
    expect(nextState.next).toBe(locarnoIndex + 1)
    expect(await host.refreshAuthentication?.()).toBe(true)
    expect(refreshSpy).toHaveBeenCalledOnce()
  })

  it('rejects uncertain resume when active operation changes while allowing future-only edits', async () => {
    const plan = makePlan()
    const steps = draftSteps(plan)
    const locarnoIndex = steps.findIndex(step => step.command.op === 'locarno')
    const baseReceipt: DraftReceipt = { ok: true, reference: '123', page: 'application' }

    const legacyCheckpoint: DraftCheckpoint = {
      transport: 'http',
      tabId: 7,
      reference: '123',
      next: locarnoIndex,
      total: steps.length,
      status: 'uncertain',
      stage: 'locarno',
      planKey: draftPlanKey(plan),
    }
    const verified = await upgradeLegacyDraftCheckpoint(legacyCheckpoint, plan)

    const { store } = makeStore()
    const controller = new AbortController()
    const executedCommands: DraftCommand[] = []
    const host = createDraftRunnerHost(
      {
        transport: 'http',
        inspect: () => Promise.resolve(baseReceipt),
        execute: command => {
          executedCommands.push(command)
          controller.abort()
          return Promise.resolve(baseReceipt)
        },
        recover: () => Promise.resolve({ outcome: 'completed', receipt: baseReceipt }),
      },
      store,
    )

    const futureEditedPlan: DraftPlan = {
      ...plan,
      description: 'Updated description after completed locarno step',
    }
    const resumed = await runDraftPlan(futureEditedPlan, 7, host, controller.signal, verified)
    expect(resumed.next).toBe(locarnoIndex + 2)
    expect(executedCommands).toEqual([
      { op: 'description', text: 'Updated description after completed locarno step' },
    ])
    expect(resumed.warnings?.join()).toContain('尚未执行')

    const executedOnRejected = executedCommands.length
    const activeStepChangedPlan: DraftPlan = {
      ...plan,
      locarno: '14',
    }
    await expect(runDraftPlan(activeStepChangedPlan, 7, host, undefined, verified)).rejects.toThrow('已执行或结果待核对')
    expect(executedCommands).toHaveLength(executedOnRejected)
  })
})
