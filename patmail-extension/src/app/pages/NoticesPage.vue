<script setup lang="ts">
import { computed, inject, type Ref } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import { bg } from '../../shell/assets'
import NoticeWorkspace from '../components/notice/NoticeWorkspace.vue'
import type { MessageBridge } from '../../shared/message'
import { useWorkspace } from '../composables/useWorkspace'

const bridge = inject<MessageBridge>('bridge')
const activeRoute = inject<Ref<string> | undefined>('activeRoute', undefined)
const { connection } = useWorkspace()
const ready = computed(() => connection.value.sessionStatus === 'authenticated')
const isActive = computed(() => !activeRoute || activeRoute.value === '/notices')
</script>

<template>
  <PageHead
    title="来文管理"
    desc="实时同步原站来文导入、CPC 官文及证书下载、异常处理、无需导入来文与清单对比。"
    :art="bg('让重复工作变简单.png')"
  />
  <section v-if="!ready" class="card">
    <h2>来文管理</h2>
    <p class="empty">尚未连接 EASY。来文管理会通过已绑定的原网站标签页读取会话并同步下拉与检索数据。</p>
  </section>
  <NoticeWorkspace v-else :bridge="bridge" :user-id="connection.operatorId" :is-active="isActive" />
</template>
