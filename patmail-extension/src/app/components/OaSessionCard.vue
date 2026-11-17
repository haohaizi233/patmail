<script setup lang="ts">
import { computed } from 'vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
const props = defineProps<{ platform: string; tabs: { id: number; title: string }[]; selected: number; state: string; message: string; checking: boolean; listing: boolean;disabled?:boolean;automatic?:boolean }>()
const emit = defineEmits<{ 'update:selected': [value: number]; verify: []; refresh: []; open: [] }>()
const options = computed(() => [{ value: -1, label: props.tabs.length ? '请选择平台标签页' : '没有找到已打开的标签页' }, ...props.tabs.map(t => ({ value: t.id, label: t.title }))])
const captions: Record<string, string> = { checking: '正在验证', verified: '已验证', expired: '已过期', error: '未通过', idle: '未验证' }
</script>
<template>
  <section class="card tone-pink oa-session-card" :aria-label="`${platform} 登录会话`" :title="message">
    <div class="oa-session-tag-group">
      <b class="oa-platform-name">{{ platform }}</b>
      <span class="theme-select-badge" :class="state === 'verified' ? 'tone-green' : 'tone-orange'">{{ captions[state] || '未验证' }}</span>
    </div>
    <div class="oa-session-select-wrap">
      <ThemeSelect :model-value="selected" :options="options" :disabled="disabled || checking || listing || !tabs.length" @update:model-value="emit('update:selected', $event)" />
    </div>
    <div class="toolbar oa-session-actions">
      <button type="button" class="solid" :disabled="disabled || checking || selected < 0" @click="emit('verify')">{{ checking ? '正在检测…' : automatic ? '重新检测' : '连接并检测登录' }}</button>
      <button type="button" class="ghost" :disabled="disabled || checking || listing" title="查找已打开的平台标签页" @click="emit('refresh')">查找标签页</button>
      <button type="button" class="ghost" :disabled="disabled || checking" title="在浏览器打开平台页面" @click="emit('open')">打开平台</button>
    </div>
  </section>
</template>
<style scoped>
.oa-session-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px 4px 12px;
  border-radius: 14px;
  background: #ffffff;
  border: 1px solid #f6e5ee;
  box-shadow: 0 4px 14px #f6d7e524;
  height: 38px;
  box-sizing: border-box;
}
.oa-session-tag-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.oa-platform-name {
  font-size: 13px;
  font-weight: 700;
  color: #4e4056;
  white-space: nowrap;
}
.oa-session-select-wrap {
  min-width: 130px;
  max-width: 180px;
  flex: 1 1 150px;
}
.oa-session-select-wrap :deep(.theme-select-trigger) {
  height: 28px;
  font-size: 12px;
  padding: 0 8px;
}
.oa-session-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  flex-shrink: 0;
}
.oa-session-actions button {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  white-space: nowrap;
}
</style>
