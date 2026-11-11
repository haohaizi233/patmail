import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, shallowReactive, type ComputedRef } from 'vue'
import { taskCheckProgress } from '../check-progress'

export type TopProgress = Readonly<typeof taskCheckProgress>
const providers = shallowReactive(new Map<symbol, { value: ComputedRef<TopProgress>; enabled: ComputedRef<boolean> }>())
export const topProgress = computed(() => [...providers.values()].reverse().find(p => p.enabled.value && p.value.value.visible)?.value.value ?? taskCheckProgress)

export function registerTopProgress(value: ComputedRef<TopProgress>, enabled: ComputedRef<boolean>): () => void {
  const owner = Symbol('top-progress')
  providers.set(owner, { value, enabled })
  return () => { providers.delete(owner) }
}
/** KeepAlive pages and hidden workspaces must release the shared header without erasing another task. */
export function useTopProgress(value: ComputedRef<TopProgress>, enabled: ComputedRef<boolean>): void {
  let release: (() => void) | undefined
  const attach = () => { release ??= registerTopProgress(value, enabled) }
  const detach = () => { release?.(); release = undefined }
  onMounted(attach); onActivated(attach); onDeactivated(detach); onBeforeUnmount(detach)
}
