<script setup lang="ts">
import { computed } from 'vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
const props = defineProps<{ platform: string; tabs: { id: number; title: string }[]; selected: number; state: string; message: string; checking: boolean; listing: boolean }>()
const emit = defineEmits<{ 'update:selected': [value: number]; verify: []; refresh: []; open: [] }>()
const options = computed(() => [{ value: -1, label: props.tabs.length ? '请选择平台标签页' : '没有找到已打开的标签页' }, ...props.tabs.map(t => ({ value: t.id, label: t.title }))])
const captions: Record<string, string> = { checking: '正在验证', verified: '登录已验证', expired: '验证已过期', error: '验证未通过', idle: '未验证' }
</script>
<template>
  <section class="card tone-pink oa-session-card" :aria-label="`${platform} 登录会话`">
    <header class="card-head oa-session-head">
      <div class="oa-session-title">
        <h2>登录会话</h2>
        <span class="theme-select-badge" :class="state === 'verified' ? 'tone-green' : 'tone-orange'">{{ captions[state] || '未验证' }}</span>
      </div>
      <span class="hint oa-session-status" role="status" :title="message">{{ message }}</span>
    </header>
    <label class="oa-session-label">已打开的 {{ platform }} 标签页
      <ThemeSelect :model-value="selected" :options="options" :disabled="checking || listing || !tabs.length" @update:model-value="emit('update:selected', $event)" />
    </label>
    <div class="toolbar oa-session-actions">
      <button type="button" class="solid" :disabled="checking || selected < 0" @click="emit('verify')">{{ checking ? '正在检测登录…' : '连接并检测登录' }}</button>
      <button type="button" class="ghost" :disabled="checking || listing" @click="emit('refresh')">查找标签页</button>
      <button type="button" class="ghost" :disabled="checking" @click="emit('open')">打开平台</button>
    </div>
  </section>
</template>
<style scoped>
.oa-session-card { min-width: 0; box-shadow: none; }
.oa-session-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.oa-session-title { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.oa-session-title h2 { margin: 0; font-size: 15px; }
.oa-session-status { font-size: 12px; color: var(--sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px; text-align: right; }
.oa-session-label { display: grid; gap: 6px; font-size: 12px; color: var(--sub); }
.oa-session-actions { margin-top: 8px; }
</style>
