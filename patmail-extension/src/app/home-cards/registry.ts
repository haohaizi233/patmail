import { shallowRef, type ShallowRef } from 'vue'
import type { HomeCardDef } from './types'

interface HomeCardModule {
  default?: HomeCardDef | readonly HomeCardDef[]
  cards?: readonly HomeCardDef[]
}

const cardModules = import.meta.glob<HomeCardModule>('./cards/*.ts', { eager: true })

function isCardArray(value: HomeCardDef | readonly HomeCardDef[] | undefined): value is readonly HomeCardDef[] {
  return Array.isArray(value)
}

function extractModuleCards(mod: HomeCardModule): HomeCardDef[] {
  const list: HomeCardDef[] = []
  if (isCardArray(mod.default)) {
    list.push(...mod.default)
  } else if (mod.default && typeof mod.default === 'object' && 'id' in mod.default) {
    list.push(mod.default)
  }
  if (isCardArray(mod.cards)) {
    list.push(...mod.cards)
  }
  return list
}

function collectDiscoveredCards(modules: Record<string, HomeCardModule>): HomeCardDef[] {
  const byId = new Map<string, HomeCardDef>()
  const paths = Object.keys(modules).sort()
  for (const path of paths) {
    const mod = modules[path]
    for (const card of extractModuleCards(mod)) {
      byId.set(card.id, card)
    }
  }
  return [...byId.values()]
}

const discoveredCards = collectDiscoveredCards(cardModules)
const extraCards = new Map<string, HomeCardDef>()

function buildCardList(): HomeCardDef[] {
  const merged = new Map<string, HomeCardDef>()
  for (const card of discoveredCards) {
    merged.set(card.id, card)
  }
  for (const [id, card] of extraCards) {
    merged.set(id, card)
  }
  return [...merged.values()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

const registry: ShallowRef<HomeCardDef[]> = shallowRef(buildCardList())

export function useHomeCardRegistry(): ShallowRef<readonly HomeCardDef[]> {
  return registry
}

export function getHomeCards(): HomeCardDef[] {
  return registry.value
}

export function registerHomeCard(card: HomeCardDef): void {
  extraCards.set(card.id, card)
  registry.value = buildCardList()
}

export function unregisterHomeCard(id: string): boolean {
  const removed = extraCards.delete(id)
  if (removed) registry.value = buildCardList()
  return removed
}

export function resetExtraHomeCards(): void {
  if (extraCards.size === 0) return
  extraCards.clear()
  registry.value = buildCardList()
}
