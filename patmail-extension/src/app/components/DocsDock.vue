<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { headingId } from '../docs/markdown'
import { DOC_GROUPS, resolveDocLink, type DocEntry } from '../docs'
import DocsMarkdown from './DocsMarkdown.vue'

const open = ref(false)
const active = shallowRef<DocEntry | null>(null)
const source = ref('')
const loading = ref(false)
const body = ref<HTMLElement | null>(null)
const openSections = shallowRef<DocEntry[]>([])
const query = ref(''),
  linkNotice = ref('')
const visibleGroups = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return DOC_GROUPS
  return DOC_GROUPS.map(group => ({
    ...group,
    entries: group.entries.flatMap(entry => {
      if (entry.title.toLocaleLowerCase().includes(needle)) return [entry]
      const children = entry.children?.filter(child => child.title.toLocaleLowerCase().includes(needle))
      return children?.length ? [{ ...entry, children }] : []
    }),
  })).filter(group => group.entries.length)
})
let loadToken = 0

async function show(entry: DocEntry): Promise<void> {
  const loader = entry.load
  if (!loader) return
  active.value = entry
  linkNotice.value = ''
  for (const parent of DOC_GROUPS.flatMap(group => group.entries)) {
    if (parent.children?.includes(entry) && !sectionOpen(parent)) openSections.value = [...openSections.value, parent]
  }
  loading.value = true
  source.value = ''
  const token = ++loadToken
  void nextTick(() => body.value?.scrollTo?.({ top: 0 }))
  try {
    const text = await loader()
    if (token !== loadToken) return
    source.value = text.trim() ? text : '# 这一篇是空的\n\n文件没有内容，或文件被移走、改名了。重新构建扩展后再试。'
  } catch {
    if (token === loadToken) source.value = '# 这一篇没有读到\n\n文件可能被移走或改名了。重新构建扩展后再试。'
  } finally {
    if (token === loadToken) loading.value = false
  }
}

function sectionOpen(entry: DocEntry): boolean {
  return openSections.value.includes(entry)
}

async function navigate(file: string): Promise<void> {
  const entry = resolveDocLink(DOC_GROUPS, active.value, file)
  if (!entry) {
    linkNotice.value = '目标未收录或属于历史档案，请在仓库查看。'
    return
  }
  if (entry !== active.value) await show(entry)
  await nextTick()
  if (active.value !== entry) return
  let anchor = ''
  try {
    anchor = decodeURIComponent(file.split('#').slice(1).join('#'))
  } catch {
    linkNotice.value = '链接锚点编码无效。'
    return
  }
  if (anchor) {
    const target = [...(body.value?.querySelectorAll<HTMLElement>('[id]') ?? [])].find(
      node => node.id === anchor || node.id === headingId(anchor),
    )
    if (target) target.scrollIntoView({ block: 'start' })
    else linkNotice.value = '这篇文档中未找到目标小节。'
  }
}

function toggleSection(entry: DocEntry): void {
  openSections.value = sectionOpen(entry)
    ? openSections.value.filter(item => item !== entry)
    : [...openSections.value, entry]
}

function toggle(): void {
  open.value = !open.value
  if (open.value && !active.value) {
    const first = DOC_GROUPS[0]?.entries[0]
    if (first?.load) void show(first)
  }
}

function onKey(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    open.value = false
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <button
    type="button"
    class="docs-entry"
    :class="{ on: open }"
    :aria-expanded="open"
    aria-haspopup="dialog"
    @click="toggle"
  >
    文档
  </button>
  <Teleport to="body">
    <div v-if="open" class="docs-mask" @click.self="open = false">
      <section class="docs-float" role="dialog" aria-modal="true" aria-label="PatMail 文档">
        <header class="docs-head">
          <h3>PatMail 文档</h3>
          <span class="docs-head-sub">{{ active?.title }}</span>
          <button type="button" aria-label="关闭" @click="open = false">×</button>
        </header>
        <div class="docs-layout">
          <nav class="docs-tree" aria-label="文档目录">
            <input
              v-model="query"
              class="docs-search"
              aria-label="搜索文档标题"
              placeholder="搜索文档标题"
              type="search"
            />
            <p v-if="!visibleGroups.length" role="status">没有匹配的文档标题。</p>
            <div v-for="group in visibleGroups" :key="group.name" class="docs-group">
              <p class="docs-group-name">{{ group.name }}</p>
              <template v-for="entry in group.entries" :key="entry.title">
                <button
                  v-if="entry.children"
                  type="button"
                  class="docs-leaf docs-section"
                  :class="{ open: sectionOpen(entry) }"
                  :aria-expanded="sectionOpen(entry)"
                  @click="toggleSection(entry)"
                >
                  {{ entry.title }}
                </button>
                <button v-else type="button" class="docs-leaf" :class="{ on: active === entry }" @click="show(entry)">
                  {{ entry.title }}
                </button>
                <template v-if="entry.children && (query.trim() || sectionOpen(entry))">
                  <button
                    v-for="leaf in entry.children"
                    :key="leaf.title"
                    type="button"
                    class="docs-leaf docs-sub"
                    :class="{ on: active === leaf }"
                    @click="show(leaf)"
                  >
                    {{ leaf.title }}
                  </button>
                </template>
              </template>
            </div>
          </nav>
          <div ref="body" class="docs-body">
            <p v-if="active?.metadata" class="docs-provenance">
              {{ active.path }} · {{ active.metadata.status }} · {{ active.metadata.evidence_level }} · 核验
              {{ active.metadata.last_reviewed }} / {{ active.metadata.last_verified_commit.slice(0, 7) }}
            </p>
            <p v-if="linkNotice" role="alert">{{ linkNotice }}</p>
            <p v-if="loading" class="docs-loading">正在读取这一篇…</p>
            <DocsMarkdown :key="active?.title" :source="source" @navigate="navigate" />
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.docs-search {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid #e7deec;
  border-radius: 8px;
  font: inherit;
}
.docs-provenance {
  overflow-wrap: anywhere;
  font-size: 12px;
  color: #74677e;
}
</style>
