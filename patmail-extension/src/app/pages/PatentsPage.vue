<script setup lang="ts">
import { computed, inject } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import { bg } from '../../shell/assets'
import PatentSearchQuery from '../components/PatentSearchQuery.vue'
import type { MessageBridge } from '../../shared/message'
import { useWorkspace } from '../composables/useWorkspace'

const bridge = inject<MessageBridge>('bridge')
const { connection } = useWorkspace()
const ready = computed(() => connection.value.sessionStatus === 'authenticated')
</script>

<template>
  <PageHead
    title="专利查询"
    desc="按原站专利查询条件检索专利案件与处理事项，支持历史条件、自定义显示列与结果导出。"
    :art="bg('让重复工作变简单.png')"
  />
  <section v-if="!ready" class="card">
    <h2>专利查询</h2>
    <p class="empty">尚未连接 EASY。专利查询会通过已绑定的原网站标签页读取会话，不会使用本页地址。</p>
  </section>
  <PatentSearchQuery v-else :bridge="bridge" :user-id="connection.operatorId" :can-search="true" />
</template>
