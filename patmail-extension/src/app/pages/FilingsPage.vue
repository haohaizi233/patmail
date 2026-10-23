<script setup lang="ts">
import { computed, inject } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import { bg } from '../../shell/assets'
import FilingExportPanel from '../components/FilingExportPanel.vue'
import type { MessageBridge } from '../../shared/message'
import { useWorkspace } from '../composables/useWorkspace'

const bridge = inject<MessageBridge>('bridge')
const { connection } = useWorkspace()
const ready = computed(() => connection.value.sessionStatus === 'authenticated')
</script>

<template>
  <PageHead title="递交管理" desc="按原站递交列表的条件查询递交记录，下拉从原站实时读取。" :art="bg('让重复工作变简单.png')" />
  <section v-if="!ready" class="card">
    <h2>递交查询</h2>
    <p class="empty">尚未连接 EASY。递交查询会通过已绑定的原网站标签页读取会话，不会使用本页地址。</p>
  </section>
  <FilingExportPanel v-else :bridge="bridge" :user-id="connection.operatorId" />
</template>
