<script setup lang="ts">
import { computed, inject } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import { bg } from '../../shell/assets'
import FeeSearchQuery from '../components/FeeSearchQuery.vue'
import type { MessageBridge } from '../../shared/message'
import { useWorkspace } from '../composables/useWorkspace'

const bridge = inject<MessageBridge>('bridge')
const { connection } = useWorkspace()
const ready = computed(() => connection.value.sessionStatus === 'authenticated')
</script>

<template>
  <PageHead
    title="费用查询"
    desc="完全复刻 EASY 官费管理-费用查询表单，支持常用条件、高级查询、金额统计与明细导出。"
    :art="bg('让重复工作变简单.png')"
  />
  <section v-if="!ready" class="card">
    <h2>费用查询</h2>
    <p class="empty">尚未连接 EASY。费用查询会通过已绑定的原网站标签页读取会话，不会使用本页地址。</p>
  </section>
  <FeeSearchQuery v-else :bridge="bridge" :user-id="connection.operatorId" :can-search="true" />
</template>
